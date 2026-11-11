import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from '@/components/data/StatCard'

describe('StatCard', () => {
  it('renders label, value, and detail', () => {
    render(<StatCard label="Playtime" value="2h" detail="Last week" />)
    expect(screen.getByText('Playtime')).toBeInTheDocument()
    expect(screen.getByText('2h')).toBeInTheDocument()
    expect(screen.getByText('Last week')).toBeInTheDocument()
  })

  it('renders children instead of value/detail when provided', () => {
    render(
      <StatCard label="Size">
        <span>Custom body</span>
      </StatCard>,
    )
    expect(screen.getByText('Size')).toBeInTheDocument()
    expect(screen.getByText('Custom body')).toBeInTheDocument()
  })

  it('keeps an invisible placeholder when detail is empty string', () => {
    const { container } = render(<StatCard label="DLC" value="1" detail="" />)
    const detail = container.querySelector('p.invisible')
    expect(detail).not.toBeNull()
    expect(detail?.textContent).toBe('\u00A0')
  })
})
