// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { apply, inject } from '../src/client/index.ts'
import { WorkflowToolResult, WorkflowView } from '../src/client/WorkflowView.tsx'
import { EMPTY_WORKFLOW_SNAPSHOT } from '../src/client/projection/snapshot-builder.ts'

afterEach(cleanup)

function bench(options?: {
  readonly workflowBefore?: unknown
  readonly workflowAfter?: unknown
}) {
  const eventDefinitions: { kind: string }[] = []
  const viewDefinitions: { target: string }[] = []
  const slotEntries: {
    options: {
      id: string
      order: number
      label: () => string
      inject: (id: SessionId) => unknown
    }
  }[] = []
  let loaded = false
  const workflowBefore = options?.workflowBefore ?? EMPTY_WORKFLOW_SNAPSHOT
  const workflowAfter = options?.workflowAfter ?? workflowBefore
  const session = {
    getSnapshot: () => ({
      marker: Symbol(),
      views: new Map([['workflow', loaded ? workflowAfter : workflowBefore]]),
    }),
    loadOlder: async () => { loaded = true },
  }
  const ctx = {
    effect: (install: () => () => void) => install(),
    locale: {
      register: () => () => {},
      bind: () => (key: string) => key === 'view.workflow' ? 'Workflow' : key,
    },
    conversationEvents: {
      register: (definition: { kind: string }) => {
        eventDefinitions.push(definition)
        return () => {}
      },
    },
    conversationViews: {
      register: (definition: { target: string }) => {
        viewDefinitions.push(definition)
        return () => {}
      },
    },
    sessions: { binding: () => ({ session }) },
    slots: {
      inject: (_name: string, install: () => () => void) => install(),
      register: (options: typeof slotEntries[number]['options']) => {
        const entry = { options }
        slotEntries.push(entry)
        return () => {}
      },
    },
  } as unknown as Context
  apply(ctx)
  return { eventDefinitions, viewDefinitions, slotEntries }
}

describe('Workflow plugin registration', () => {
  it('registers only the independently installable Workflow tab', () => {
    const result = bench()
    const entry = result.slotEntries.at(0)
    expect(inject).toEqual(['slots', 'conversationEvents', 'conversationViews', 'sessions', 'locale'])
    expect(entry?.options.id).toBe('workflow')
    expect(entry?.options.order).toBe(15)
    expect(entry?.options.label()).toBe('Workflow')
    expect(entry?.options.inject('session-1' as SessionId)).toMatchObject({ loadOlder: expect.any(Function) })
    expect(result.viewDefinitions.map(definition => definition.target)).toContain('workflow')
    expect(result.eventDefinitions.some(definition => definition.kind === 'workflow-assistant-step')).toBe(true)
  })

  it('detects paging changes from the Workflow view rather than raw Session snapshot identity', async () => {
    const unchanged = bench()
    const unchangedLoadOlder = unchanged.slotEntries[0]?.options.inject('session-1' as SessionId) as {
      loadOlder: () => Promise<boolean>
    }
    expect(await unchangedLoadOlder.loadOlder()).toBe(false)

    const next = { ...EMPTY_WORKFLOW_SNAPSHOT, eventNodes: [] }
    const changed = bench({ workflowAfter: next })
    const changedLoadOlder = changed.slotEntries[0]?.options.inject('session-1' as SessionId) as {
      loadOlder: () => Promise<boolean>
    }
    expect(await changedLoadOlder.loadOlder()).toBe(true)
  })

  it('switches a tool result from live loading to completed success', () => {
    const view = render(<WorkflowToolResult status="running" label="进行中" duration="—" />)
    const running = view.container.querySelector('[data-tool-status="running"]')
    expect(running?.getAttribute('aria-live')).toBe('polite')
    expect(running?.querySelector('svg')?.classList.contains('lucide-loader-circle')).toBe(true)

    view.rerender(<WorkflowToolResult status="complete" label="完成" duration="500ms" />)
    const completed = view.container.querySelector('[data-tool-status="complete"]')
    expect(completed?.querySelector('svg')?.classList.contains('lucide-circle-check')).toBe(true)
    expect(view.container.querySelector('[data-tool-status="running"]')).toBeNull()
  })

  it('opts into the conversation height contract so its internal panes can scroll', () => {
    const snapshot = {
      views: new Map([['workflow', EMPTY_WORKFLOW_SNAPSHOT]]),
      turnTimings: new Map(),
      hasMore: false,
      loadingOlder: false,
    }
    const props = {
      useSession: (selector: (value: typeof snapshot) => unknown) => selector(snapshot),
      loadOlder: () => Promise.resolve(false),
      t: (key: string) => key,
    } as unknown as ComponentProps<typeof WorkflowView>

    const view = render(<WorkflowView {...props} />)
    expect(view.getByRole('region', { name: 'workflow.aria' })
      .getAttribute('data-conversation-composer-overlay')).toBe('')
  })
})
