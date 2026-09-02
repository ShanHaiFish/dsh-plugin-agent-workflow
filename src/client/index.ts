/** Browser plugin registering the visual Workflow conversation view. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
// Type-only augmentation imports: pull the alpha.4 client type merge surface
// (ctx.slots / ctx.sessions / ctx.uiConversation / the session standard
// hooks: useSession) into the TypeScript program.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { en, NS, zh } from './locales.ts'
import { registerWorkflowAssistantDefinition } from './projection/assistant-definition.ts'
import { registerWorkflowCompactionDefinitions } from './projection/compaction-definition.ts'
import { registerWorkflowMessageDefinitions } from './projection/message-definitions.ts'
import { registerWorkflowRequestHeaderDefinition } from './projection/request-header-definition.ts'
import { registerWorkflowConversationView } from './projection/snapshot-builder.ts'
import { registerWorkflowSurfaceDefinition } from './projection/surface-definition.ts'
import { registerWorkflowToolDefinition } from './projection/tool-definition.ts'
import { WorkflowView, type WorkflowViewInjected } from './WorkflowView.tsx'

export { WorkflowJsonInspector } from './WorkflowJsonInspector.tsx'
export { WorkflowToolResult, WorkflowView } from './WorkflowView.tsx'
export type { WorkflowViewInjected } from './WorkflowView.tsx'
export { deriveWorkflowModel } from './workflow-model.ts'
export type {
  WorkflowCallModel, WorkflowCallUsage, WorkflowModel, WorkflowStatus,
  WorkflowTurnModel, WorkflowTurnTimings,
} from './workflow-model.ts'
export type { WorkflowKey } from './locales.ts'

/** Required services: view slots, Session binding, Workflow registries, and localization. */
export const inject = ['slots', 'sessions', 'uiConversation', 'locale']

/** Register the independently installable Workflow view tab. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workflow: dictionaries')
  registerWorkflowMessageDefinitions(ctx)
  registerWorkflowSurfaceDefinition(ctx)
  registerWorkflowRequestHeaderDefinition(ctx)
  registerWorkflowAssistantDefinition(ctx)
  registerWorkflowToolDefinition(ctx)
  registerWorkflowCompactionDefinitions(ctx)
  registerWorkflowConversationView(ctx)
  const t = ctx.locale.bind(NS)

  const loadOlder = (sessionId: SessionId): (() => Promise<boolean>) => {
    const session = ctx.sessions.binding(sessionId)?.session
    if (session === undefined) {
      throw new Error(`ui-workflow: session "${sessionId}" is unavailable`)
    }
    const workflow = ctx.uiConversation.binding(sessionId).target('workflow')
    return async () => {
      // alpha.4 session paging returns void; detect real view growth by
      // comparing the Workflow target snapshot before and after, matching the
      // upstream trajectory view's change detection.
      const before = workflow.getSnapshot()
      await session.loadOlder()
      return workflow.getSnapshot() !== before
    }
  }
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'workflow',
    order: 15,
    locale: NS,
    label: () => t('view.workflow'),
    inject: (sessionId: SessionId): WorkflowViewInjected => {
      // Activate the Workflow target for this Session: subscribing forces the
      // assembly engine to materialize the target for its remaining lifetime,
      // independent of which standard hooks the shell delivers to the view.
      ctx.uiConversation.binding(sessionId).target('workflow').subscribe(() => {})
      return {
        loadOlder: loadOlder(sessionId),
      }
    },
  }, WorkflowView))
}