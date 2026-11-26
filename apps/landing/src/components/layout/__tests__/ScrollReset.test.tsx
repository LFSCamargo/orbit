import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ScrollReset } from '../ScrollReset'

let pathname = '/'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))

describe('ScrollReset', () => {
  const scrollTo = vi.fn()

  beforeEach(() => {
    scrollTo.mockClear()
    vi.stubGlobal('scrollTo', scrollTo)
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('scrolls to the top when the page changes, not on first load', () => {
    // Regression: navigating kept the scroll position and hid the new hero.
    pathname = '/'
    const { rerender } = render(<ScrollReset />)
    expect(scrollTo).not.toHaveBeenCalled()
    pathname = '/install'
    rerender(<ScrollReset />)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('leaves anchor links and Back/Forward alone', () => {
    pathname = '/install'
    const { rerender } = render(<ScrollReset />)

    window.history.replaceState(null, '', '/#faq')
    pathname = '/'
    rerender(<ScrollReset />)
    expect(scrollTo).not.toHaveBeenCalled()

    window.history.replaceState(null, '', '/changelog')
    window.dispatchEvent(new PopStateEvent('popstate'))
    pathname = '/changelog'
    rerender(<ScrollReset />)
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
