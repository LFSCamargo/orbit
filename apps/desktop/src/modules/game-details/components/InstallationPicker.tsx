import { OptionSelect } from '@/components/ui/option-select'
import { useLibraryActions } from '@/hooks/useLibrary'
import type { LibraryEntry } from '@/types/library'

export function InstallationPicker({ entry }: { entry: LibraryEntry }) {
  const { update } = useLibraryActions()
  if (entry.installations.length < 2) return null
  const value = entry.preferredInstallationId ?? entry.installations[0]?.id ?? ''
  return (
    <label className="mt-4 block text-sm text-orbit-muted">
      Installation
      <OptionSelect
        aria-label="Choose installation"
        value={value}
        onValueChange={(next) =>
          update.mutate({ id: entry.id, patch: { preferredInstallationId: next } })
        }
      >
        {entry.installations.map((item) => (
          <option key={item.id} value={item.id}>
            {item.platform}
            {item.available ? '' : ' · unavailable'}
            {item.path ? ` · ${item.path}` : ''}
          </option>
        ))}
      </OptionSelect>
    </label>
  )
}
