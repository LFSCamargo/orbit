import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { FAQ, FaqSection } from '../FaqSection'
import { DEMOS, DemoSection } from '../DemoSection'
import { GameWall } from '../GameWall'
import { SourcesSection } from '../SourcesSection'
import { WhyOrbitSection } from '../WhyOrbitSection'

it('opens on the launch trailer and switches between all three launch videos', () => {
  const { container } = render(<DemoSection />)
  expect(container.querySelector('video')?.getAttribute('src')).toBe(
    '/videos/orbit-launch.mp4',
  )
  const initialVideo = container.querySelector('video')
  expect(initialVideo).toHaveAttribute('poster', '/videos/orbit-launch-poster.jpg')
  expect(initialVideo).toHaveAttribute('controls')
  expect(initialVideo).toHaveAttribute('preload', 'metadata')
  expect(initialVideo).not.toHaveAttribute('autoplay')
  expect(initialVideo?.muted).toBe(false)
  for (const [label, filename] of [
    ['God of War', 'god-of-war'],
    ['Forza Horizon 6', 'forza-horizon-6'],
    ['Orbit features', 'orbit-launch'],
  ]) {
    fireEvent.click(screen.getByRole('tab', { name: label }))
    expect(container.querySelectorAll('video')).toHaveLength(1)
    expect(container.querySelector('video')).toHaveAttribute(
      'src',
      `/videos/${filename}.mp4`,
    )
    expect(container.querySelector('video')).toHaveAttribute(
      'poster',
      `/videos/${filename}-poster.jpg`,
    )
  }
  const tabs = screen.getAllByRole('tab')
  expect(tabs).toHaveLength(DEMOS.length)
  fireEvent.click(screen.getByRole('tab', { name: 'Library' }))
  expect(screen.getByRole('tab', { name: 'Library' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  expect(container.querySelector('video')).toBeNull()
  expect(
    screen.getByRole('img', { name: /Orbit library showing Steam/ }),
  ).toBeInTheDocument()
})

it('keeps the decorative cover wall out of the accessibility tree', () => {
  render(<GameWall />)
  expect(screen.getByRole('heading', { name: /Your whole library/ })).toBeInTheDocument()
  expect(screen.queryAllByRole('img')).toHaveLength(0)
})

it('lists every library source', () => {
  render(<SourcesSection />)
  for (const name of ['Steam', 'Windows games', 'Mac apps', 'Xbox Cloud Gaming'])
    expect(screen.getByRole('heading', { name })).toBeInTheDocument()
})

it('compares Orbit in an accessible table', () => {
  render(<WhyOrbitSection />)
  expect(screen.getByRole('columnheader', { name: 'Orbit' })).toBeInTheDocument()
  expect(screen.getByRole('rowheader', { name: 'Account' })).toBeInTheDocument()
})

it('answers each question in a collapsed disclosure', () => {
  const { container } = render(<FaqSection />)
  const items = container.querySelectorAll('details')
  expect(items).toHaveLength(FAQ.length)
  for (const item of items) expect(item.open).toBe(false)
  expect(screen.getByText('Is Orbit free?')).toBeInTheDocument()
})
