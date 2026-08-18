import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-runtime/client'
import {
  deriveEventMessage,
  isAppendSurfaceEvent, isReplacementSurfaceEvent,
} from '@deepseek-ai/dsh-session/surface'
import { workflowNode } from './definition-common.ts'
import type { WorkflowSurfaceRecord } from './contract.ts'

const workflowSurfaceDefinition: ConversationNodeDefinition<WorkflowSurfaceRecord> = {
  kind: 'workflow-surface-event',
  target: 'workflow',
  match: event => isAppendSurfaceEvent(event) || isReplacementSurfaceEvent(event)
    ? { id: String(event.seq), role: 'start' }
    : null,
  start: (_context, match) => {
    const event = match.event
    if (!isAppendSurfaceEvent(event) && !isReplacementSurfaceEvent(event)) {
      throw new Error('workflow-surface-event start requires a surface event')
    }
    return {
      seq: event.seq,
      message: deriveEventMessage(event),
      operation: event.surfaceOp === 'append'
        ? { kind: 'append' }
        : { kind: 'replace', start: event.surfaceOp.start, end: event.surfaceOp.end },
    }
  },
  update: context => context.state,
  buildViewNode: context => context.state === undefined
    ? null
    : workflowNode(context, context.state.seq, { kind: 'surface', record: context.state }),
}

/**
 * Register model-visible surface records used to reconstruct per-request messages.
 *
 * @param ctx - Plugin context receiving the Definition.
 */
export function registerWorkflowSurfaceDefinition(ctx: Context): void {
  ctx.conversationEvents.register(workflowSurfaceDefinition)
}
