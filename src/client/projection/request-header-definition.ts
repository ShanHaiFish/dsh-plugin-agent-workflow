import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationMatch, ConversationNodeDefinition, ConversationPromptSnapshot,
  RequestPromptChange,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { workflowNode } from './definition-common.ts'
import type { WorkflowRequestHeaderState } from './contract.ts'

/* jscpd:ignore-start -- The distributable Workflow plugin owns its target Definition and cannot import Trajectory's private Definition. */

function requestPrompt(match: ConversationMatch): ConversationPromptSnapshot {
  if (match.event.type !== 'request/header') {
    throw new Error('workflow-request-header start requires request/header')
  }
  const header = match.event.data.header
  const tools: unknown = header.tools
  return {
    config: header.config,
    system: header.system ?? '',
    tools: Array.isArray(tools) ? tools as ConversationPromptSnapshot['tools'] : [],
  }
}

function promptChange(
  previous: ConversationPromptSnapshot | undefined,
  prompt: ConversationPromptSnapshot,
  match: ConversationMatch,
): RequestPromptChange | undefined {
  if (match.event.type !== 'request/header') return undefined
  if (previous === undefined && match.event.data.reason !== 'initial') return undefined
  const systemChanged = previous !== undefined && previous.system !== prompt.system
  const toolsChanged = previous !== undefined
    && JSON.stringify(previous.tools) !== JSON.stringify(prompt.tools)
  if (previous !== undefined && !systemChanged && !toolsChanged) return undefined
  return {
    seq: match.event.seq,
    time: match.event.time,
    kind: previous === undefined
      ? 'initial'
      : systemChanged && toolsChanged
        ? 'system-and-tools'
        : systemChanged ? 'system' : 'tools',
    ...(previous === undefined ? {} : { previous }),
  }
}

const workflowRequestHeaderDefinition: ConversationNodeDefinition<WorkflowRequestHeaderState> = {
  kind: 'workflow-request-header',
  target: 'workflow',
  match: event => event.type === 'request/header'
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match, reader) => {
    const prompt = requestPrompt(match)
    const previous = reader.previous<WorkflowRequestHeaderState>('workflow-request-header')
      ?.state.prompt
    const change = promptChange(previous, prompt, match)
    return {
      seq: match.event.seq,
      time: match.event.time,
      prompt,
      location: match.location,
      ...(change === undefined ? {} : { change }),
    }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined
    ? null
    : workflowNode(context, context.state.seq, {
      kind: 'request-header',
      header: context.state,
    }),
}

/**
 * Register Workflow request-header facts.
 *
 * @param ctx - Plugin context receiving the Definition.
 */
export function registerWorkflowRequestHeaderDefinition(ctx: Context): void {
  ctx.uiConversation.events.register(workflowRequestHeaderDefinition)
}
/* jscpd:ignore-end */
