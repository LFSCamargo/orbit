import { useRef } from 'react'
import { Check, CircleArrowDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CatalogComponent } from '@/types/runtime'

export interface ComponentVersion {
  key: string
  component: CatalogComponent
  release: CatalogComponent['versions'][number]
  installed: boolean
}

export function ComponentVersionPicker({
  label,
  versions,
  value,
  onChange,
}: {
  label: string
  versions: ComponentVersion[]
  value: string
  onChange: (value: string) => void
}) {
  // A closed select can emit an empty or default value while its options
  // register. That is not a user choice and must not replace the saved row.
  const open = useRef(false)
  const known = new Set(versions.map((version) => version.key))
  const selected = versions.find((version) => version.key === value)
  return (
    <Select
      value={value}
      onOpenChange={(next) => {
        open.current = next
      }}
      onValueChange={(next) => {
        if (!open.current || !known.has(next)) return
        onChange(next)
      }}
      disabled={!versions.length}
    >
      <SelectTrigger
        aria-label={`${label} version`}
        className="component-version-trigger"
      >
        <SelectValue placeholder="No available versions">
          {selected
            ? `${selected.component.technology} ${selected.release.version}${selected.release.prerelease ? ' · Preview' : ''}`
            : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="component-version-menu" position="popper" align="end">
        {versions.map(({ key, component, release, installed }) => (
          <SelectItem
            key={key}
            value={key}
            className="component-version-option"
            textValue={`${component.technology} ${release.version}`}
            status={
              <>
                {installed ? 'Installed' : 'Not installed'}
                {installed ? <Check size={14} /> : <CircleArrowDown size={15} />}
              </>
            }
          >
            {component.technology} {release.version}
            {release.prerelease ? ' · Preview' : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
