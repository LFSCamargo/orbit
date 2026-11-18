import { describe, expect, it } from 'vitest'
import { shelfWheelDelta } from '../shelfWheel'

const middle = { scrollLeft: 400, clientWidth: 800, scrollWidth: 2400 }
const wheel = (deltaY: number, deltaX = 0, extra = {}) => ({
  deltaX,
  deltaY,
  deltaMode: 0,
  ctrlKey: false,
  ...extra,
})

describe('shelfWheelDelta', () => {
  it('turns a vertical mouse wheel into horizontal shelf scroll', () => {
    expect(shelfWheelDelta(wheel(120), middle)).toBe(120)
    expect(shelfWheelDelta(wheel(-120), middle)).toBe(-120)
  })

  it('leaves horizontal wheels and trackpad swipes to native scrolling', () => {
    expect(shelfWheelDelta(wheel(0, 90), middle)).toBe(0)
    expect(shelfWheelDelta(wheel(10, 40), middle)).toBe(0)
  })

  it('scales line and page wheel modes to pixels', () => {
    expect(shelfWheelDelta(wheel(3, 0, { deltaMode: 1 }), middle)).toBe(48)
    expect(shelfWheelDelta(wheel(1, 0, { deltaMode: 2 }), middle)).toBe(800)
  })

  it('lets the page scroll once a finite shelf reaches its edge', () => {
    expect(shelfWheelDelta(wheel(-120), { ...middle, scrollLeft: 0 })).toBe(0)
    expect(shelfWheelDelta(wheel(120), { ...middle, scrollLeft: 1600 })).toBe(0)
    expect(shelfWheelDelta(wheel(120), { ...middle, scrollWidth: 800 })).toBe(0)
  })

  it('ignores pinch-to-zoom', () => {
    expect(shelfWheelDelta(wheel(120, 0, { ctrlKey: true }), middle)).toBe(0)
  })
})
