import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type {
  ConversationContextReader, ConversationLocation, ConversationMatch,
  ConversationNodeContext, ConversationNodeDefinition, ConversationPromptSnapshot,
  ConversationStartMatch, RequestPromptInspection, SystemPromptNode, SystemPromptState,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type { WorkflowSystemMessageState } from '../src/client/projection/contract.ts'
import { registerWorkflowRequestHeaderDefinition } from '../src/client/projection/request-header-definition.ts'
import { registerWorkflowSystemMessageDefinition } from '../src/client/projection/system-message-definition.ts'

const LOCATION: ConversationLocation = { kind: 'unresolved' }

const PROMPT: ConversationPromptSnapshot = {
  config: { provider: 'test', model: 'model' } as ConversationPromptSnapshot['config'],
  system: '',
  tools: [],
}

function promptWith(system: string): ConversationPromptSnapshot {
  return { ...PROMPT, system }
}

function systemEvent(seq: number): SessionEvent<'system/message'> {
  const event: unknown = { type: 'system/message', seq, time: seq * 100, data: {} }
  return event as SessionEvent<'system/message'>
}

/** A positional replacement: it carries no text but re-interprets the surface. */
function replaceEvent(seq: number): SessionEvent<'tool/result'> {
  const event: unknown = {
    type: 'tool/result',
    seq,
    time: seq * 100,
    surfaceOp: { op: 'replace', startSeq: 1, endSeq: 2 },
    data: {},
  }
  return event as SessionEvent<'tool/result'>
}

function bareEvent(seq: number): SessionEvent<'step/start'> {
  const event: unknown = { type: 'step/start', seq, time: seq * 100, data: { turn: 1, step: 1 } }
  return event as SessionEvent<'step/start'>
}

function requestHeaderEvent(seq: number): SessionEvent<'request/header'> {
  return {
    type: 'request/header',
    seq,
    time: seq * 100,
    data: { header: { config: PROMPT.config, tools: [] }, reason: 'initial' },
  } as unknown as SessionEvent<'request/header'>
}

function startMatchFor(event: SessionEvent): ConversationStartMatch {
  return { event, role: 'start', location: LOCATION }
}

function contextFor(kind: string, event: SessionEvent): ConversationNodeContext<never> {
  return {
    key: `${kind}\u0000${event.seq}`,
    kind,
    id: String(event.seq),
    matches: [] as readonly ConversationMatch[],
    start: startMatchFor(event),
    state: undefined,
    current: new Map(),
  } as unknown as ConversationNodeContext<never>
}

function readerOf(states: Readonly<Record<string, unknown>>): ConversationContextReader {
  return {
    previous: (kind: string) => {
      const state = states[kind]
      return state === undefined
        ? undefined
        : { key: kind, kind, id: kind, startSeq: 0, state, matches: [] }
    },
  } as unknown as ConversationContextReader
}

function stateWith(overrides: Partial<WorkflowSystemMessageState>): WorkflowSystemMessageState {
  return {
    firstSeq: 0,
    uncertain: false,
    nodes: [],
    replacements: new Map(),
    effective: undefined,
    introduced: undefined,
    ...overrides,
  }
}

function node(seq: number, text: string, update = false): SystemPromptNode {
  return { seq, time: seq * 100, turn: 1, step: 1, text, update }
}

function bench() {
  const definitions = new Map<string, ConversationNodeDefinition<never>>()
  const systemCalls: { previous: unknown; event: unknown }[] = []
  const requestCalls: { previous: unknown; event: unknown; system: unknown }[] = []
  let systemResult: SystemPromptState = stateWith({})
  let requestResult: RequestPromptInspection = { prompt: PROMPT }

  const ctx = {
    uiConversation: {
      events: {
        register: (definition: ConversationNodeDefinition<never>) => {
          definitions.set(definition.kind, definition)
          return () => {}
        },
      },
      inspectSystemPrompt: (previous: unknown, event: unknown) => {
        systemCalls.push({ previous, event })
        return systemResult
      },
      inspectRequestPrompt: (previous: unknown, event: unknown, system: unknown) => {
        requestCalls.push({ previous, event, system })
        return requestResult
      },
    },
  } as unknown as Context

  registerWorkflowSystemMessageDefinition(ctx)
  registerWorkflowRequestHeaderDefinition(ctx)
  return {
    definitions,
    systemCalls,
    requestCalls,
    setSystemResult: (value: SystemPromptState) => { systemResult = value },
    setRequestResult: (value: RequestPromptInspection) => { requestResult = value },
  }
}

describe('Workflow system-prompt tracking', () => {
  it('registers a state-only Context so the view owns prompt presentation', () => {
    const definition = bench().definitions.get('workflow-system-message')
    expect(definition).toBeDefined()
    // dsh requires `target` and `buildViewNode` together; omitting both is the
    // supported state-only shape (contract: target is "omitted for state-only
    // Contexts").
    expect(definition?.target).toBeUndefined()
    expect(definition?.buildViewNode).toBeUndefined()
  })

  it('re-interprets the prompt on a system message and on a positional replacement', () => {
    const definition = bench().definitions.get('workflow-system-message')
    expect(definition?.match(systemEvent(4))).toMatchObject({ role: 'start' })
    expect(definition?.match(replaceEvent(5))).toMatchObject({ role: 'start' })
    expect(definition?.match(bareEvent(6))).toBeNull()
  })

  it('feeds the preceding system state to the shared inspector', () => {
    const test = bench()
    const definition = test.definitions.get('workflow-system-message')
    const prior = stateWith({ effective: node(1, 'OLD'), introduced: node(1, 'OLD') })
    test.setSystemResult(stateWith({ effective: node(1, 'OLD'), introduced: node(1, 'OLD') }))

    const event = systemEvent(2)
    definition?.start(
      contextFor('workflow-system-message', event) as never,
      startMatchFor(event),
      readerOf({ 'workflow-system-message': prior }),
    )

    expect(test.systemCalls).toHaveLength(1)
    expect(test.systemCalls[0]?.previous).toBe(prior)
    expect(test.systemCalls[0]?.event).toBe(event)
  })

  it('synthesizes a prompt-bearing header when the system node changes the prompt', () => {
    const test = bench()
    const definition = test.definitions.get('workflow-system-message')
    const lastHeader = {
      seq: 2,
      time: 200,
      prompt: promptWith('OLD'),
      location: LOCATION,
    }
    test.setSystemResult(stateWith({ effective: node(5, 'NEW'), introduced: node(5, 'NEW', true) }))

    const event = systemEvent(5)
    const state = definition?.start(
      contextFor('workflow-system-message', event) as never,
      startMatchFor(event),
      readerOf({
        'workflow-system-message': stateWith({ effective: node(1, 'OLD') }),
        'workflow-request-header': lastHeader,
      }),
    ) as { header?: { prompt: ConversationPromptSnapshot; change?: { kind: string } } } | undefined

    expect(state?.header?.prompt.system).toBe('NEW')
    expect(state?.header?.change?.kind).toBe('system')
  })

  it('carries the prior header forward without inventing a change when nothing moved', () => {
    const test = bench()
    const definition = test.definitions.get('workflow-system-message')
    const priorHeader = { seq: 2, time: 200, prompt: promptWith('OLD'), location: LOCATION }
    test.setSystemResult(stateWith({ effective: node(1, 'OLD') }))

    const event = systemEvent(3)
    const state = definition?.start(
      contextFor('workflow-system-message', event) as never,
      startMatchFor(event),
      readerOf({ 'workflow-system-message': stateWith({ effective: node(1, 'OLD'), header: priorHeader }) }),
    ) as { header?: { prompt: ConversationPromptSnapshot; change?: unknown } } | undefined

    expect(state?.header?.prompt.system).toBe('OLD')
    expect(state?.header?.change).toBeUndefined()
  })
})

describe('Workflow request-header prompt reconstruction', () => {
  it('canonicalizes the header against the effective system node', () => {
    const test = bench()
    const effective = node(3, 'SYS')
    test.setSystemResult(stateWith({ effective }))
    test.setRequestResult({ prompt: promptWith('SYS') })

    const definition = test.definitions.get('workflow-request-header')
    const event = requestHeaderEvent(9)
    const state = definition?.start(
      contextFor('workflow-request-header', event) as never,
      startMatchFor(event),
      readerOf({ 'workflow-system-message': stateWith({ effective }) }),
    ) as { prompt: ConversationPromptSnapshot } | undefined

    expect(test.requestCalls).toHaveLength(1)
    expect(test.requestCalls[0]?.event).toBe(event)
    expect(test.requestCalls[0]?.system).toBe(effective)
    expect(state?.prompt.system).toBe('SYS')
  })

  it('prefers a system-node header over an older request header as the baseline', () => {
    const test = bench()
    const stale = promptWith('STALE')
    const fresh = promptWith('FRESH')
    const systemHeader = { seq: 7, time: 700, prompt: fresh, location: LOCATION }
    test.setSystemResult(stateWith({ effective: node(7, 'FRESH') }))
    test.setRequestResult({ prompt: fresh })

    const definition = test.definitions.get('workflow-request-header')
    const event = requestHeaderEvent(9)
    definition?.start(
      contextFor('workflow-request-header', event) as never,
      startMatchFor(event),
      readerOf({
        'workflow-request-header': { seq: 2, time: 200, prompt: stale, location: LOCATION },
        'workflow-system-message': stateWith({ effective: node(7, 'FRESH'), header: systemHeader }),
      }),
    )

    expect(test.requestCalls[0]?.previous).toBe(fresh)
  })

  it('falls back to the last request header when it is the newer fact', () => {
    const test = bench()
    const lastHeaderPrompt = promptWith('LAST')
    test.setSystemResult(stateWith({ effective: node(3, 'SYS') }))
    test.setRequestResult({ prompt: lastHeaderPrompt })

    const definition = test.definitions.get('workflow-request-header')
    const event = requestHeaderEvent(20)
    definition?.start(
      contextFor('workflow-request-header', event) as never,
      startMatchFor(event),
      readerOf({
        'workflow-request-header': { seq: 15, time: 1500, prompt: lastHeaderPrompt, location: LOCATION },
        'workflow-system-message': stateWith({
          effective: node(3, 'SYS'),
          header: { seq: 7, time: 700, prompt: promptWith('OLD'), location: LOCATION },
        }),
      }),
    )

    expect(test.requestCalls[0]?.previous).toBe(lastHeaderPrompt)
  })
})
