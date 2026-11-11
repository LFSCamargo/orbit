import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ThemePage } from '../ThemePage'

describe('ThemePage', () => {
  it('renders page content without the legacy title and eyebrow header', () => {
    render(
      <ThemePage title="Settings" subtitle="Preferences" eyebrow="YOUR LIBRARY, YOUR WAY">
        <div>Settings content</div>
      </ThemePage>,
    )
    expect(screen.getByText('Settings content')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.queryByText('YOUR LIBRARY, YOUR WAY')).not.toBeInTheDocument()
    expect(screen.queryByText('Preferences')).not.toBeInTheDocument()
  })
})
