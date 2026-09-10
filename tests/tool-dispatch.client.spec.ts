import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationLocation, ConversationMatch, ConversationNodeContext,
  ConversationNodeDefinition, ConversationStartMatch, RunningToolCall,
  ToolCallBlock, ToolResultNode,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { WorkflowConversationViewNode } from '../src/client/projection/contract.ts'
import { registerWorkflowToolDefinition } from '../src/client/projection/tool-definition.ts'

/**
 * Regression guard for the dsh 0.1.5-rc.1 rename `tool/code-dispatch*` ->
 * `tool/ptc-dispatch*`. The payload types were already named `PtcDispatch*`,
 * so only the event type strings moved; if they drift again, the nested
 * sub-call subtree silently disappears rather than failing to compile.
 */

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

function fixture(value: unknown): SessionEvent {
  return value as SessionEvent
}

function toolCall(seq: number, callId: string, name = 'run_code'): SessionEvent {
  return fixture({
    type: 'tool/call',
    seq,
    time: seq * 100,
    data: { turn: 1, step: 1, callId, name, arguments: '{"code":"..."}' },
  })
}

function dispatchStart(
  seq: number,
  ids: { rootCallId: string; parentCallId: string; subCallId: string },
  name = 'search',
): SessionEvent {
  return fixture({
    type: 'tool/ptc-dispatch-start',
    seq,
    time: seq * 100,
    data: { ...ids, name, arguments: { q: 'x' } },
  })
}

function dispatchSettled(
  seq: number,
  ids: { rootCallId: string; parentCallId: string; subCallId: string },
  name = 'search',
): SessionEvent {
  return fixture({
    type: 'tool/ptc-dispatch',
    seq,
    time: seq * 100,
    data: {
      ...ids,
      name,
      arguments: { q: 'x' },
      isError: false,
      content: [{ type: 'text', text: 'hit' }],
    },
  })
}

function match(value: SessionEvent): ConversationMatch {
  return { event: value, role: 'update', location: OPEN_LOCATION }
}

function startMatch(value: SessionEvent): ConversationStartMatch {
  return { event: value, role: 'start', location: OPEN_LOCATION }
}

function toolDefinition(): ConversationNodeDefinition<unknown> {
  let definition: ConversationNodeDefinition<unknown> | undefined
  const ctx = {
    uiConversation: {
      events: {
        register: (candidate: ConversationNodeDefinition<unknown>) => {
          if (candidate.kind === 'workflow-tool-call') definition = candidate
          return () => {}
        },
      },
    },
  } as unknown as Context
  registerWorkflowToolDefinition(ctx)
  if (definition === undefined) throw new Error('tool definition was not registered')
  return definition
}

function project(events: readonly SessionEvent[]): WorkflowConversationViewNode {
  const definition = toolDefinition()
  const first = events[0]
  if (first === undefined) throw new Error('projection requires a start event')
  const start = startMatch(first)
  const matches: readonly ConversationMatch[] = [start, ...events.slice(1).map(match)]
  const reader = { previous: () => undefined }
  let state = definition.start({
    key: 'workflow-tool-call\u0000root:1',
    kind: definition.kind,
    id: 'root:1',
    matches,
    start,
    state: undefined,
    current: new Map(),
  }, start, reader)
  for (const update of matches.slice(1)) {
    state = definition.update({
      key: 'workflow-tool-call\u0000root:1',
      kind: definition.kind,
      id: 'root:1',
      matches,
      start,
      state,
      current: new Map(),
    }, update)
  }
  const context: ConversationNodeContext<unknown> = {
    key: 'workflow-tool-call\u0000root:1',
    kind: definition.kind,
    id: 'root:1',
    matches,
    start,
    state,
    current: new Map(),
  }
  const node = definition.buildViewNode?.(context)
  if (node === null || node === undefined) throw new Error('tool definition produced no view node')
  return node as unknown as WorkflowConversationViewNode
}

function rootBlock(node: WorkflowConversationViewNode): ToolCallBlock {
  if (node.data.kind !== 'tool') throw new Error('expected a tool contribution')
  return node.data.root
}

/** A running call carries `name`/`argsRaw` directly; a settled one nests them under `call`. */
function callName(block: ToolCallBlock): string | undefined {
  return 'kind' in block ? block.call?.name : block.name
}

function callArgs(block: ToolCallBlock): string | undefined {
  return 'kind' in block ? block.call?.argsRaw : block.argsRaw
}

function settled(block: ToolCallBlock | undefined): ToolResultNode {
  if (block === undefined || !('kind' in block)) throw new Error('expected a settled tool result')
  return block
}

function running(block: ToolCallBlock | undefined): RunningToolCall {
  if (block === undefined || 'kind' in block) throw new Error('expected a running tool call')
  return block
}

const IDS = { rootCallId: 'root:1', parentCallId: 'root:1', subCallId: 'root:1:ptc:1' }

describe('Workflow PTC (formerly code-dispatch) subtree', () => {
  it('binds dispatch events to the root call through rootCallId', () => {
    const definition = toolDefinition()
    expect(definition.match(toolCall(1, 'root:1'))).toMatchObject({ id: 'root:1', role: 'start' })
    expect(definition.match(dispatchStart(2, IDS))).toMatchObject({ id: 'root:1', role: 'update' })
    expect(definition.match(dispatchSettled(3, IDS))).toMatchObject({ id: 'root:1', role: 'update' })
    // A dispatch with no owning root must not open or join a Context.
    expect(definition.match(fixture({
      type: 'tool/ptc-dispatch',
      seq: 4,
      time: 400,
      data: { ...IDS, rootCallId: '', name: 'search', arguments: {}, isError: false, content: [] },
    }))).toBeNull()
  })

  it('nests a settled sub-call under its parent run_code call', () => {
    const node = project([
      toolCall(1, 'root:1'),
      dispatchStart(2, IDS),
      dispatchSettled(3, IDS),
    ])
    const root = rootBlock(node)

    expect(callName(root)).toBe('run_code')
    expect(root.subCalls).toHaveLength(1)
    const child = settled(root.subCalls[0])
    expect(callName(child)).toBe('search')
    expect(child.callId).toBe('root:1:ptc:1')
    expect(child.isError).toBe(false)
    expect(child.content).toEqual([{ type: 'text', text: 'hit' }])
    expect(child.call).toEqual({ name: 'search', argsRaw: JSON.stringify({ q: 'x' }) })
  })

  it('keeps a started-but-unsettled sub-call as a running child', () => {
    const node = project([toolCall(1, 'root:1'), dispatchStart(2, IDS)])
    const root = rootBlock(node)

    expect(root.subCalls).toHaveLength(1)
    const child = running(root.subCalls[0])
    expect(child.name).toBe('search')
    expect(child.argsRaw).toBe(JSON.stringify({ q: 'x' }))
  })

  it('nests a grandchild sub-call under an intermediate sub-call', () => {
    const nested = { rootCallId: 'root:1', parentCallId: 'root:1:ptc:1', subCallId: 'root:1:ptc:1:ptc:1' }
    const node = project([
      toolCall(1, 'root:1'),
      dispatchStart(2, IDS, 'outer'),
      dispatchSettled(3, IDS, 'outer'),
      dispatchStart(4, nested, 'inner'),
      dispatchSettled(5, nested, 'inner'),
    ])
    const root = rootBlock(node)

    expect(root.subCalls).toHaveLength(1)
    const outer = settled(root.subCalls[0])
    expect(callName(outer)).toBe('outer')
    expect(outer.subCalls).toHaveLength(1)
    expect(callName(settled(outer.subCalls[0]))).toBe('inner')
  })
})
