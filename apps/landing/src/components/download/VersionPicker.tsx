'use client'

import { useRouter } from 'next/navigation'

export interface VersionOption {
  version: string
  prerelease: boolean
}

interface VersionPickerProps {
  versions: VersionOption[]
  current: string
}

export function VersionPicker({ versions, current }: VersionPickerProps) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-3">
      <label htmlFor="version-picker" className="text-sm text-orbit-muted">
        Version
      </label>
      <select
        id="version-picker"
        value={current}
        onChange={(event) => router.push(`/download/${event.target.value}`)}
        className="rounded-full border border-orbit-border bg-orbit-panel px-4 py-2 text-sm text-orbit-foreground"
      >
        {versions.map((option) => (
          <option key={option.version} value={option.version}>
            {option.prerelease ? `${option.version} (pre-release)` : option.version}
          </option>
        ))}
      </select>
    </div>
  )
}
