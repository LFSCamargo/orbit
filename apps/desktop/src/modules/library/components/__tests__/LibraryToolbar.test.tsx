import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LibraryToolbar } from '../LibraryToolbar'

afterEach(cleanup)

function renderToolbar(props: Partial<Parameters<typeof LibraryToolbar>[0]> = {}) {
  const onView = vi.fn()
  const onQuery = vi.fn()
  const onSort = vi.fn()
  const onPlatform = vi.fn()
  const onClear = vi.fn()
  render(
    <LibraryToolbar
      view="installed"
      query=""
      sort="alphabetical"
      platform="all"
      onView={onView}
      onQuery={onQuery}
      onSort={onSort}
      onPlatform={onPlatform}
      onClear={onClear}
      {...props}
    />,
  )
  return { onView, onQuery, onSort, onPlatform, onClear }
}

it('keeps view, search, and filters as separate glass clusters', () => {
  renderToolbar()
  const toolbar = document.querySelector('.library-toolbar')
  const search = document.querySelector('.library-search')
  const filters = document.querySelector('.library-filters')
  const views = screen.getByRole('group', { name: 'Library view' })
  expect(toolbar).not.toHaveClass('orbit-glass')
  expect(views).toHaveClass('orbit-glass')
  expect(search).toHaveClass('orbit-glass')
  expect(filters).toHaveClass('orbit-glass')
  expect(toolbar?.contains(views)).toBe(true)
  expect(search?.parentElement).toBe(toolbar)
  expect(filters?.parentElement).toBe(toolbar)
  expect(getComputedStyle(views).borderRadius).toBe('999px')
  expect(search).toHaveStyle({ borderRadius: '999px' })
  expect(search).toHaveClass('p-[5px]')
})

it('switches library views and types into search without nested field chrome', () => {
  const { onView, onQuery } = renderToolbar()
  fireEvent.click(screen.getByRole('button', { name: 'All games' }))
  expect(onView).toHaveBeenCalledWith('all')
  fireEvent.change(screen.getByPlaceholderText('Search games…'), {
    target: { value: 'Celeste' },
  })
  expect(onQuery).toHaveBeenCalledWith('Celeste')
  expect(document.querySelector('.library-search')).not.toHaveClass('border')
  expect(screen.getByRole('button', { name: 'Installed' })).toHaveAccessibleName(
    'Installed',
  )
})

it('hides view tabs on the search route and clears the query', () => {
  const { onClear } = renderToolbar({ search: true, query: 'ori' })
  expect(screen.queryByRole('group', { name: 'Library view' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
  expect(onClear).toHaveBeenCalled()
  expect(screen.getByLabelText('Sort games')).toHaveAttribute(
    'data-focus-id',
    'library-sort-alphabetical',
  )
})
