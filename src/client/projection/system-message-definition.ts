import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeDefinition, SystemPromptInspector,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { isSurfaceEvent } from '@deepseek-ai/dsh-session/surface'
import type {
  WorkflowRequestHeaderState, WorkflowSystemMessageState,
} from './contract.ts'

/* jscpd:ignore-start -- The distributable Workflow plugin owns its target Definition and cannot import Trajectory's private Definition. */

/**
 * Track the effective system prompt across the loaded Session surface.
 *
 * dsh 0.1.5-rc.1 removed `EpochHeader.system`: the rendered system prompt is a
 * first-class `system/message` surface node that positional replacements can
 * shadow or restore. This Definition is a deliberately **state-only** Context
 * (no `target`, no `buildViewNode`): the Workflow view presents the prompt it
 * puts in force inside each request's detail panel, so a standalone prompt card
 * would duplicate it. The request-header Definition reads this state through
 * `reader.previous`.
 *
 * @param inspect - Pure surface interpretation, supplied by the `uiConversation`
 * service because a client bundle cannot value-import another plugin's module.
 * @returns The Workflow system-prompt Definition.
 */
function workflowSystemMessageDefinition(
  inspect: SystemPromptInspector,
): ConversationNodeDefinition<WorkflowSystemMessageState> {
  return {
    kind: 'workflow-system-message',
    match: (event) => {
      if (event.type === 'system/message') return { id: String(event.seq), role: 'start' }
      // A positional replacement can shadow or restore the effective system
      // node, so it re-interprets the prompt even though it carries no text of
      // its own. `assistant/live-chunk` is client-only and never a surface event.
      if (event.type !== 'assistant/live-chunk' && isSurfaceEvent(event) && event.surfaceOp !== 'append') {
        return { id: String(event.seq), role: 'start' }
      }
      return null
    },
    start: (_context, match, reader) => {
      const prior = reader.previous<WorkflowSystemMessageState>('workflow-system-message')?.state
      const state = inspect(prior, match.event)
      const node = state.effective
      if (state.uncertain) {
        // The loaded window cannot order the replacement endpoints yet, so the
        // prompt text is unknown. Keep whatever header the last request
        // established, but record that the prompt is currently unattributable.
        const header = reader.previous<WorkflowRequestHeaderState>('workflow-request-header')?.state
        if (header === undefined) return state
        return {
          ...state,
          header: {
            seq: match.event.seq,
            time: match.event.time,
            location: match.location,
            prompt: { ...header.prompt, system: '' },
          },
        }
      }
      // Nothing model-visible changed: carry the prior synthesized header, or
      // stay header-less, rather than fabricating a prompt change.
      if (node === undefined
        || node.text === prior?.effective?.text
        || (state.introduced !== undefined && !state.introduced.update)) {
        return { ...state, ...(prior?.header === undefined ? {} : { header: prior.header }) }
      }
      const header = reader.previous<WorkflowRequestHeaderState>('workflow-request-header')?.state
      const systemHeader = prior?.header
      // The newer of the two facts is the baseline the next request header must
      // be compared against, so a change already presented here is not reported
      // a second time by the following header.
      const previous = systemHeader !== undefined
        && (header === undefined || systemHeader.seq > header.seq)
        ? systemHeader
        : header
      if (previous === undefined) return state
      return {
        ...state,
        header: {
          seq: node.seq,
          time: node.time,
          prompt: { ...previous.prompt, system: node.text },
          change: {
            seq: node.seq,
            time: node.time,
            kind: 'system',
            previous: previous.prompt,
          },
          location: match.location,
        },
      }
    },
    update: context => context.state,
  }
}

/**
 * Register the Workflow system-prompt tracker.
 *
 * @param ctx - Plugin context receiving the Definition.
 */
export function registerWorkflowSystemMessageDefinition(ctx: Context): void {
  ctx.uiConversation.events.register(
    workflowSystemMessageDefinition(
      (previous, event) => ctx.uiConversation.inspectSystemPrompt(previous, event),
    ),
  )
}
/* jscpd:ignore-end */
