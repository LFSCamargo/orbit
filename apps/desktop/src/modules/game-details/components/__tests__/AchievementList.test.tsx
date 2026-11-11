import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AchievementList } from '../AchievementList'

afterEach(cleanup)
describe('Achievement discovery', () => {
  it('shows an honest empty state instead of fabricating a completion percentage', () => {
    render(<AchievementList achievements={[]} />)
    expect(screen.getByText('No achievement data yet')).toBeVisible()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
  it('limits large lists, expands on demand, and filters unlocked records', () => {
    const achievements = Array.from({ length: 9 }, (_, index) => ({
      id: String(index),
      name: `Achievement ${index}`,
      unlocked: index % 2 === 0,
    }))
    render(<AchievementList achievements={achievements} />)
    expect(screen.getAllByRole('article')).toHaveLength(6)
    fireEvent.click(screen.getByRole('button', { name: /Show more/ }))
    expect(screen.getAllByRole('article')).toHaveLength(9)
    fireEvent.click(screen.getByRole('button', { name: 'Unlocked (5)' }))
    expect(screen.getAllByRole('article')).toHaveLength(5)
    expect(screen.queryByText('Achievement 1')).not.toBeInTheDocument()
  })
})
