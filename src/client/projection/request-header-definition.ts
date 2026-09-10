import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeDefinition, RequestPromptInspector,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { workflowNode } from './definition-common.ts'
import type {
  WorkflowRequestHeaderState, WorkflowSystemMessageState,
} from './contract.ts'

/* jscpd:ignore-start -- The distributable Workflow plugin owns its target Definition and cannot import Trajectory's private Definition. */

/**
 * Request-header fact Definition for the Workflow target.
 *
 * dsh 0.1.5-rc.1 moved the system prompt out of the header, so this Definition
 * no longer reads `header.system` (the field no longer exists). It hands the
 * previous prompt and the effective `system/message` node to the shared
 * `uiConversation.inspectRequestPrompt` interpretation, which canonicalizes the
 * prompt and classifies the model-visible change.
 *
 * @param inspect - Prompt interpretation supplied by the `uiConversation`
 * service; a client bundle cannot value-import another plugin's module.
 * @returns The Workflow request-header Definition.
 */
function workflowRequestHeaderDefinition(
  inspect: RequestPromptInspector,
): ConversationNodeDefinition<WorkflowRequestHeaderState> {
  return {
    kind: 'workflow-request-header',
    target: 'workflow',
    match: event => event.type === 'request/header'
      ? { id: String(event.seq), role: 'start' }
      : null,
    start: (_context, match, reader) => {
      if (match.event.type !== 'request/header') {
        throw new Error('workflow-request-header start requires request/header')
      }
      const header = reader.previous<WorkflowRequestHeaderState>('workflow-request-header')?.state
      const systemState = reader.previous<WorkflowSystemMessageState>('workflow-system-message')?.state
      const systemHeader = systemState?.header
      // The prompt baseline is whichever fact is newer: a system node that
      // changed the prompt since the last header, or that last header itself.
      const previous = systemHeader !== undefined
        && (header === undefined || systemHeader.seq > header.seq)
        ? systemHeader.prompt
        : header?.prompt
      const inspection = inspect(previous, match.event, systemState?.effective)
      // A change already presented at the system node's own position must not be
      // reported twice by the header that follows it.
      const change = inspection.change
        ?? (systemHeader !== undefined && (header === undefined || systemHeader.seq > header.seq)
          ? systemHeader.change
          : undefined)
      return {
        seq: match.event.seq,
        time: match.event.time,
        prompt: inspection.prompt,
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
}

/**
 * Register Workflow request-header facts.
 *
 * @param ctx - Plugin context receiving the Definition.
 */
export function registerWorkflowRequestHeaderDefinition(ctx: Context): void {
  ctx.uiConversation.events.register(
    workflowRequestHeaderDefinition(
      (previous, event, system) => ctx.uiConversation.inspectRequestPrompt(previous, event, system),
    ),
  )
}
/* jscpd:ignore-end */
