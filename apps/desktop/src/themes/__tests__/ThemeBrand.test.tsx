import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { OrbitMark, ThemeBrand } from '../ThemeBrand'
afterEach(cleanup)
it('never renders a written game logo as a substitute', () => {
  render(<ThemeBrand branding={{ logoText: 'DANTE', logoStyle: 'gothic' }} />)
  expect(screen.queryByText('DANTE')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Orbit' })).toBeVisible()
})
it('renders the Orbit logo image, not a text wordmark, without theme artwork', () => {
  render(<ThemeBrand />)
  expect(screen.getByRole('img', { name: 'Orbit' })).toHaveAttribute(
    'src',
    expect.stringContaining('orbit-logo'),
  )
  expect(screen.queryByText('ORBIT')).not.toBeInTheDocument()
})
it('signs branded themes with the Orbit logo image', () => {
  render(<OrbitMark />)
  expect(screen.getByRole('img', { name: 'Orbit' })).toHaveAttribute(
    'src',
    expect.stringContaining('orbit-logo'),
  )
  expect(screen.queryByText('ORBIT')).not.toBeInTheDocument()
})
it('renders the selected logo image', () => {
  render(
    <ThemeBrand
      branding={{ artworkQuery: 'Portal 2', logoImage: 'data:image/png;base64,AA==' }}
    />,
  )
  expect(screen.getByRole('img', { name: 'Portal 2' })).toHaveAttribute(
    'src',
    'data:image/png;base64,AA==',
  )
})
