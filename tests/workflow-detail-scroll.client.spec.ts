// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { detailPanelScrollDelta } from '../src/client/WorkflowView.tsx'

/**
 * Expansion geometry: the scroller spans y 100..700 and the floating composer
 * is 152px tall, so the safe bottom line (above the input bar, minus the 16px
 * margin) sits at 700 - 152 - 16 = 532.
 */
const SCROLLER = { top: 100, bottom: 700 }
const COMPOSER = 152

describe('detailPanelScrollDelta (expand upward, clear the composer)', () => {
  it('pulls the panel up when its bottom hangs below the safe line', () => {
    const panel = { top: 300, bottom: 600 }
    // 600 > 532 → overflow 68, and the panel still fits above the top (268 ≥ 100).
    expect(detailPanelScrollDelta(SCROLLER, panel, COMPOSER)).toBe(68)
  })

  it('returns zero when the panel already clears the composer', () => {
    const panel = { top: 100, bottom: 420 }
    expect(detailPanelScrollDelta(SCROLLER, panel, COMPOSER)).toBe(0)
  })

  it('reveals the panel top when it is taller than the usable area', () => {
    const panel = { top: 300, bottom: 1000 }
    // Overflow 468 would push the top above the viewport (−168 < 100); fall back
    // to aligning the top so the title and close affordance stay visible.
    expect(detailPanelScrollDelta(SCROLLER, panel, COMPOSER)).toBe(200)
  })

  it('scrolls the cut-off panel top back into view when its bottom is safe', () => {
    const panel = { top: 50, bottom: 450 }
    expect(detailPanelScrollDelta(SCROLLER, panel, COMPOSER)).toBe(-50)
  })

  it('honours a zero-height composer (safe line keeps only the margin)', () => {
    const panel = { top: 300, bottom: 620 }
    // safe bottom = 700 - 0 - 16 = 684 → no overflow.
    expect(detailPanelScrollDelta(SCROLLER, panel, 0)).toBe(0)
  })
})