import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationLocation, ConversationMatch, ConversationNodeContext,
  ConversationNodeDefinition, ConversationStartMatch,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {
  AssistantLiveChunkEvent, SessionEventLike,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type {
  WorkflowAssistantRequest, WorkflowConversationViewNode,
} from '../src/client/projection/contract.ts'
import { registerWorkflowAssistantDefinition } from '../src/client/projection/assistant-definition.ts'

const OPEN_LOCATION: ConversationLocation = {
  kind: 'step',
  turn: {
    turn: 1,
    start: undefined,
    end: undefined,
    status: 'open',
    steps: [],
    data: {
      get: () => undefined,
      source: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }),
    },
  },
  step: {
    turn: 1,
    step: 1,
    start: undefined,
    end: undefined,
    status: 'open',
    data: {
      get: () => undefined,
      source: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }),
    },
  },
}

function event<T extends SessionEvent['type']>(
  type: T,
  seq: number,
  data: Extract<SessionEvent, { type: T }>['data'],
): Extract<SessionEvent, { type: T }> {
  return { type, seq, time: seq * 100, data } as Extract<SessionEvent, { type: T }>
}

/**
 * One client-only live streaming row.
 *
 * dsh 0.1.5-rc.1 replaced the durable `assistant/chunk` event with this
 * transient presentation event; it is not a `SessionEvent`, so it rides the
 * update role only.
 */
function liveChunk(
  seq: number,
  chunk: AssistantLiveChunkEvent['data']['chunk'],
): AssistantLiveChunkEvent {
  return {
    type: 'assistant/live-chunk',
    seq,
    time: seq * 100,
    data: {
      attemptId: `attempt-${seq}` as never,
      turn: 1,
      step: 1,
      chunk,
    },
  }
}

function match(value: SessionEventLike): ConversationMatch {
  return { event: value, role: 'update', location: OPEN_LOCATION }
}

function startMatch(value: SessionEventLike): ConversationStartMatch {
  // A Context opens on a durable Session event: the client-only live chunk row
  // can only ever arrive as an update Match.
  if (value.type === 'assistant/live-chunk') {
    throw new Error('a live chunk row cannot open an assistant projection')
  }
  return { event: value, role: 'start', location: OPEN_LOCATION }
}

function assistantDefinition(): ConversationNodeDefinition<unknown> {
  let definition: ConversationNodeDefinition<unknown> | undefined
  const ctx = {
    uiConversation: {
      events: {
        register: (candidate: ConversationNodeDefinition<unknown>) => {
          if (candidate.kind === 'workflow-assistant-step') definition = candidate
          return () => {}
        },
      },
    },
  } as unknown as Context
  registerWorkflowAssistantDefinition(ctx)
  if (definition === undefined) throw new Error('assistant definition was not registered')
  return definition
}

function project(events: readonly SessionEventLike[]): WorkflowConversationViewNode {
  const definition = assistantDefinition()
  const start = events[0] === undefined ? undefined : startMatch(events[0])
  if (start === undefined) throw new Error('projection requires a start event')
  const matches: readonly ConversationMatch[] = [
    start,
    ...events.slice(1).map(value => match(value)),
  ]
  const reader = { previous: () => undefined }
  let state = definition.start({
    key: 'workflow-assistant-step\u00001:1',
    kind: definition.kind,
    id: '1:1',
    matches,
    start,
    state: undefined,
    current: new Map(),
  }, start, reader)
  for (const update of matches.slice(1)) {
    state = definition.update({
      key: 'workflow-assistant-step\u00001:1',
      kind: definition.kind,
      id: '1:1',
      matches,
      start,
      state,
      current: new Map(),
    }, update)
  }
  const context: ConversationNodeContext<unknown> = {
    key: 'workflow-assistant-step\u00001:1',
    kind: definition.kind,
    id: '1:1',
    matches,
    start,
    state,
    current: new Map(),
  }
  const node = definition.buildViewNode?.(context)
  if (node === null || node === undefined) throw new Error('assistant definition produced no view node')
  return node as WorkflowConversationViewNode
}

function assistantRequest(node: WorkflowConversationViewNode): WorkflowAssistantRequest {
  if (node.data.kind !== 'assistant' || node.data.request === undefined) {
    throw new Error('projection produced no assistant request')
  }
  return node.data.request
}

function assistantMessage(interrupted = false): SessionEvent<'assistant/message'> {
  return event('assistant/message', 2, {
    turn: 1,
    step: 1,
    message: {
      id: 'message-1' as never,
      role: 'assistant',
      content: [{ type: 'text', text: 'partial answer' }],
      source: { kind: 'model', provider: 'test', model: 'model' },
    },
    // dsh 0.1.5-rc.1 carries the exact timed model stream on the durable
    // assistant/message record; an empty stream is the minimal coherent value.
    stream: [],
    ...(interrupted ? { interrupted: true as const } : {}),
  })
}

const STEP_START = event('step/start', 1, { turn: 1, step: 1 })
const STEP_END = event('step/end', 3, { turn: 1, step: 1 })

describe('rc.8 assistant projection', () => {
  it('keeps an ordinary durable assistant message complete with its result seq', () => {
    const contribution = project([STEP_START, assistantMessage(), STEP_END])
    if (contribution.data.kind !== 'assistant') throw new Error('expected assistant contribution')

    expect(contribution.data.node).toMatchObject({
      kind: 'assistant',
      seq: 2,
      messageId: 'message-1',
    })
    expect(contribution.data.node).not.toHaveProperty('interrupted')
    expect(assistantRequest(contribution)).toMatchObject({
      status: 'complete',
      resultSeq: 2,
    })
    expect(assistantRequest(contribution)).not.toHaveProperty('completedSeq')
  })

  it('carries rc.8 interrupted durable prefixes and preserves their result seq', () => {
    const contribution = project([STEP_START, assistantMessage(true), STEP_END])
    if (contribution.data.kind !== 'assistant') throw new Error('expected assistant contribution')

    expect(contribution.data.node).toMatchObject({
      kind: 'assistant',
      seq: 2,
      messageId: 'message-1',
      interrupted: true,
    })
    expect(assistantRequest(contribution)).toMatchObject({
      status: 'error',
      resultSeq: 2,
    })
    expect(assistantRequest(contribution)).not.toHaveProperty('completedSeq')
  })

  it('uses completedSeq only for a chunk-only interruption fallback', () => {
    const chunk = liveChunk(2, { type: 'text-delta', index: 0, text: 'partial answer' })
    const contribution = project([STEP_START, chunk, STEP_END])
    if (contribution.data.kind !== 'assistant') throw new Error('expected assistant contribution')

    expect(contribution.data.node).toMatchObject({
      kind: 'assistant',
      seq: 2.1,
      interrupted: true,
    })
    expect(contribution.data.node).not.toHaveProperty('messageId')
    expect(assistantRequest(contribution)).toMatchObject({
      status: 'error',
      completedSeq: 3,
    })
    expect(assistantRequest(contribution)).not.toHaveProperty('resultSeq')
  })
})
