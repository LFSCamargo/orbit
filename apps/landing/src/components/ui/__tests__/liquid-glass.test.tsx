import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LiquidGlass } from '@/components/ui/liquid-glass'

describe('LiquidGlass', () => {
  it('renders children inside the glass surface', () => {
    render(
      <LiquidGlass>
        <p>Behind the glass</p>
      </LiquidGlass>,
    )
    expect(screen.getByText('Behind the glass')).toBeInTheDocument()
  })

  it('forwards extra classes and attributes', () => {
    const { container } = render(
      <LiquidGlass className="custom-class" data-testid="glass">
        <span>Content</span>
      </LiquidGlass>,
    )
    expect(container.querySelector('[data-testid="glass"]')).toHaveClass('custom-class')
  })
})
