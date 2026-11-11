import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MacbookScroll } from '@/components/ui/macbook-scroll'

describe('MacbookScroll', () => {
  it('renders the title and screen image', () => {
    render(
      <MacbookScroll
        src="/screenshots/orbit-home.png"
        title="Orbit preview"
        badge={<span>v0.3.0</span>}
      />,
    )
    expect(screen.getByText('Orbit preview')).toBeInTheDocument()
    expect(screen.getByAltText('Orbit application screen')).toHaveAttribute(
      'src',
      '/screenshots/orbit-home.png',
    )
    expect(screen.getByText('v0.3.0')).toBeInTheDocument()
  })

  it('renders without a screen image when src is omitted', () => {
    render(<MacbookScroll title="No screen" />)
    expect(screen.queryByAltText('Orbit application screen')).not.toBeInTheDocument()
  })
})
