/** Browser plugin registering the visual Workflow conversation view. */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
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

/** Required services: view slots, Workflow projection registries, Session paging, and localization. */
export const inject = ['slots', 'conversationEvents', 'conversationViews', 'sessions', 'locale']

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
    return async () => {
      // rc.8 session paging returns void; detect real view growth by
      // comparing the Workflow view snapshot before and after, matching the
      // upstream trajectory plugin's change detection.
      const before = session.getSnapshot().views.get('workflow')
      await session.loadOlder()
      return session.getSnapshot().views.get('workflow') !== before
    }
  }
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'workflow',
    order: 15,
    locale: NS,
    label: () => t('view.workflow'),
    inject: (sessionId: SessionId): WorkflowViewInjected => ({
      loadOlder: loadOlder(sessionId),
    }),
  }, WorkflowView))
}
