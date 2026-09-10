import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationNodeDefinition,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { SessionEventLike } from '@deepseek-ai/dsh-api-session-controller/client'
import {
  deriveEventMessage,
  isAppendSurfaceEvent, isReplacementSurfaceEvent,
} from '@deepseek-ai/dsh-session/surface'
import { workflowNode } from './definition-common.ts'
import type { WorkflowSurfaceRecord } from './contract.ts'

/**
 * Session events are plain names; the client-only live chunk row carries no
 * surface markers. `chunkrow/*` (dsh <= 0.1.2-alpha.4) was removed in
 * 0.1.5-rc.1 and replaced by the single `assistant/live-chunk` transient event.
 */
function isSessionEvent(event: SessionEventLike): event is SessionEvent {
  return event.type !== 'assistant/live-chunk'
}

const workflowSurfaceDefinition: ConversationNodeDefinition<WorkflowSurfaceRecord> = {
  kind: 'workflow-surface-event',
  target: 'workflow',
  match: event => isSessionEvent(event)
    && (isAppendSurfaceEvent(event) || isReplacementSurfaceEvent(event))
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
        : { kind: 'replace', startSeq: event.surfaceOp.startSeq, endSeq: event.surfaceOp.endSeq },
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
  ctx.uiConversation.events.register(workflowSurfaceDefinition)
}
