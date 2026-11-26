import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SiteNav } from '../SiteNav'

vi.mock('next/navigation', () => ({ usePathname: () => '/changelog' }))

function panelOf(trigger: HTMLElement): HTMLElement {
  const panel = document.getElementById(trigger.getAttribute('aria-controls') ?? '')
  if (!panel) throw new Error('menu panel is not open')
  return panel
}

describe('SiteNav', () => {
  it('opens Home and Resources on hover with every link', async () => {
    render(<SiteNav />)
    const main = screen.getAllByRole('navigation', { name: 'Main' })[0]
    const home = within(main).getByRole('button', { name: 'Home' })
    expect(home).toHaveAttribute('aria-expanded', 'false')

    fireEvent.mouseEnter(home.parentElement as HTMLElement)
    expect(home).toHaveAttribute('aria-expanded', 'true')
    const homePanel = panelOf(home)
    for (const label of ['Demo', 'Overview', 'Sources', 'Themes', 'Why']) {
      expect(
        within(homePanel).getByRole('link', { name: new RegExp(label) }),
      ).toBeInTheDocument()
    }
    expect(within(homePanel).getByRole('link', { name: /Sources/ })).toHaveAttribute(
      'href',
      '/#sources',
    )

    const resources = within(main).getByRole('button', { name: 'Resources' })
    fireEvent.mouseEnter(resources.parentElement as HTMLElement)
    expect(resources).toHaveAttribute('aria-expanded', 'true')
    const resourcesPanel = panelOf(resources)
    expect(
      within(resourcesPanel).getByRole('link', { name: /Changelog/ }),
    ).toHaveAttribute('href', '/changelog')
    expect(within(resourcesPanel).getByRole('link', { name: /Blog/ })).toHaveAttribute(
      'href',
      '/blog',
    )
    expect(within(resourcesPanel).getByRole('link', { name: /FAQ/ })).toHaveAttribute(
      'href',
      '/#faq',
    )
  })

  it('renders the menu as liquid glass outside the header, with a gap below it', () => {
    // Regression: inside the header's own backdrop-filter glass, a translucent
    // panel let the page show through, so it had been made opaque and flush.
    const { container } = render(
      <header>
        <div className="orbit-glass">
          <SiteNav />
        </div>
      </header>,
    )
    const resources = screen.getAllByRole('button', { name: 'Resources' })[0]
    fireEvent.mouseEnter(resources.parentElement as HTMLElement)
    const panel = panelOf(resources)
    expect(container.contains(panel)).toBe(false)
    expect(panel.style.paddingTop).toBe('12px')
    expect(panel.firstElementChild).toHaveClass('orbit-glass')
  })

  it('closes a group with Escape and marks the current section', async () => {
    vi.useFakeTimers()
    render(<SiteNav />)
    const main = screen.getAllByRole('navigation', { name: 'Main' })[0]
    const resources = within(main).getByRole('button', { name: 'Resources' })
    expect(resources.className).toContain('bg-white/[0.08]')

    fireEvent.click(resources)
    expect(resources).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(resources, { key: 'Escape' })
    act(() => {
      vi.runAllTimers()
    })
    expect(resources).toHaveAttribute('aria-expanded', 'false')
    vi.useRealTimers()
  })

  it('links GitHub and Download', () => {
    render(<SiteNav />)
    expect(screen.getAllByRole('link', { name: /GitHub/ })[0]).toHaveAttribute(
      'href',
      'https://github.com/LFSCamargo/orbit',
    )
    expect(screen.getByRole('link', { name: /Download/ })).toHaveAttribute(
      'href',
      '/download',
    )
  })
})
