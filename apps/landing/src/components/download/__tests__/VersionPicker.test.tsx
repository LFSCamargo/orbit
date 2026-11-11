import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VersionPicker } from '../VersionPicker'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

const versions = [
  { version: '0.4.0-beta.1', prerelease: true },
  { version: '0.3.0', prerelease: false },
  { version: '0.2.0', prerelease: false },
]

describe('VersionPicker', () => {
  beforeEach(() => push.mockReset())

  it('lists every version and selects the current one', () => {
    render(<VersionPicker versions={versions} current="0.3.0" />)
    const select = screen.getByLabelText('Version')
    expect(select).toHaveValue('0.3.0')
    expect(
      screen.getByRole('option', { name: '0.4.0-beta.1 (pre-release)' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('navigates to the chosen version', () => {
    render(<VersionPicker versions={versions} current="0.3.0" />)
    fireEvent.change(screen.getByLabelText('Version'), { target: { value: '0.2.0' } })
    expect(push).toHaveBeenCalledWith('/download/0.2.0')
  })
})
