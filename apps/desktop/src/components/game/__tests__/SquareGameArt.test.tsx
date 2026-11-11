import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SquareGameArt } from '@/components/game/SquareGameArt'

describe('SquareGameArt', () => {
  it('uses the image as a background url when provided', () => {
    const { container } = render(<SquareGameArt image="https://cdn.example/cover.jpg" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.style.backgroundImage).toBe('url("https://cdn.example/cover.jpg")')
  })

  it('falls back to the placeholder style when no image is set', () => {
    const { container } = render(
      <SquareGameArt placeholder="linear-gradient(red, blue)" />,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.style.backgroundImage).toBe('linear-gradient(red, blue)')
  })

  it('applies contain fit class when requested', () => {
    const { container } = render(<SquareGameArt fit="contain" />)
    expect(container.firstElementChild).toHaveClass('bg-contain')
  })

  it('defaults to cover fit', () => {
    const { container } = render(<SquareGameArt />)
    expect(container.firstElementChild).toHaveClass('bg-cover')
  })

  it('does not force w-full so fixed-size home tiles keep their dimensions', () => {
    const { container } = render(
      <SquareGameArt className="h-[148px] w-[148px]" image="https://cdn.example/a.png" />,
    )
    const el = container.firstElementChild as HTMLElement
    expect(el).toHaveClass('h-[148px]', 'w-[148px]')
    expect(el).not.toHaveClass('w-full')
  })
})
