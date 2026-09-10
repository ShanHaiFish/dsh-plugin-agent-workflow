import type {
  AssistantMessageNode, ConversationLocation, ConversationNode,
  ConversationPromptSnapshot, ConversationViewNode, PartialAssistant,
  RequestPromptChange, RequestView, RunningToolCall, SystemPromptState, ToolCallBlock,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { Message } from '@deepseek-ai/dsh-llm/types'

/** Assistant request enriched with Workflow-only request-boundary data. */
export type WorkflowAssistantRequest = Extract<RequestView, { purpose: 'assistant' }> & {
  /** Complete provider-neutral messages array reconstructed at dispatch. */
  readonly messages?: readonly Message[]
  /** Closing boundary seq retained when a chunk-only interruption fallback
   *  produced no durable assistant/message event to anchor message assembly. */
  readonly completedSeq?: number
}

/** Provider request as consumed by the standalone Workflow projection. */
export type WorkflowRequestView =
  | WorkflowAssistantRequest
  | Extract<RequestView, { purpose: 'compaction' }>

/** Request-header facts retained by the Workflow target. */
export interface WorkflowRequestHeaderState {
  readonly seq: number
  readonly time: number
  readonly prompt: ConversationPromptSnapshot
  readonly change?: RequestPromptChange
  readonly location: ConversationLocation
}

/**
 * Loaded system surface plus the latest request facts changed by a system node.
 *
 * dsh 0.1.5-rc.1 moved the rendered system prompt out of `EpochHeader` and onto
 * the `system/message` surface event, so the Workflow target tracks it through
 * `uiConversation.inspectSystemPrompt` and hands the effective node to
 * `uiConversation.inspectRequestPrompt` when a request header is assembled.
 */
export interface WorkflowSystemMessageState extends SystemPromptState {
  /**
   * Synthesized request-header fact anchored at the system node that introduced
   * or changed the prompt; absent when no earlier header could lend its config.
   */
  readonly header?: WorkflowRequestHeaderState
}

/** One model-visible surface operation retained for request-boundary reconstruction. */
export interface WorkflowSurfaceRecord {
  readonly seq: number
  readonly message: Message | null
  readonly operation:
    | { readonly kind: 'append' }
    | { readonly kind: 'replace'; readonly startSeq: number; readonly endSeq: number }
}

/** One independently assembled contribution to the legacy Workflow ledger. */
export type WorkflowContribution =
  | {
    readonly kind: 'node'
    readonly node: ConversationNode
  }
  | {
    readonly kind: 'assistant'
    readonly node?: AssistantMessageNode
    readonly partial: PartialAssistant | null
    readonly request?: WorkflowAssistantRequest
  }
  | {
    readonly kind: 'tool'
    readonly root: ToolCallBlock
  }
  | {
    readonly kind: 'request-header'
    readonly header: WorkflowRequestHeaderState
  }
  | {
    readonly kind: 'surface'
    readonly record: WorkflowSurfaceRecord
  }
  | {
    readonly kind: 'compaction'
    readonly request: Extract<WorkflowRequestView, { purpose: 'compaction' }>
  }
  | {
    readonly kind: 'session-end'
    readonly seq: number
    readonly time: number
  }
  | {
    readonly kind: 'turn-end'
    readonly turn: number
    readonly time: number
    readonly error?: string
  }

/** Target envelope consumed by the Workflow snapshot builder. */
export interface WorkflowConversationViewNode extends ConversationViewNode {
  readonly target: 'workflow'
  readonly anchorSeq: number
  readonly location: ConversationLocation
  readonly data: WorkflowContribution
}

/** Stage-oriented Workflow data assembled from registered business Contexts. */
export interface WorkflowSnapshot {
  readonly eventNodes: readonly ConversationNode[]
  readonly eventLocations: ReadonlyMap<number, ConversationLocation>
  readonly requests: readonly WorkflowRequestView[]
  readonly callSchemas: ReadonlyMap<string, ConversationPromptSnapshot['tools'][number]>
  readonly partial: PartialAssistant | null
  readonly runningCalls: readonly RunningToolCall[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationViewSnapshotMap {
    /** Independently assembled data consumed by the Workflow view. */
    workflow: WorkflowSnapshot
  }
}
