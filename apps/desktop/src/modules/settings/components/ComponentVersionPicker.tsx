import { useRef } from 'react'
import { clsx } from 'clsx'
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
        className={clsx(
          'component-version-trigger w-full min-w-0 !rounded-lg !border-0 !bg-transparent !p-2 text-right !text-orbit-foreground/80 !shadow-none',
          '[&>span]:truncate',
        )}
      >
        <SelectValue placeholder="No available versions">
          {selected
            ? `${selected.component.technology} ${selected.release.version}${selected.release.prerelease ? ' · Preview' : ''}`
            : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        className={clsx(
          'component-version-menu w-[min(430px,calc(100vw-32px))] backdrop-blur-xl',
          '!border-orbit-foreground/13 !bg-orbit-surface/94 !max-h-[min(360px,var(--radix-select-content-available-height))] !rounded-[14px]',
          '!shadow-[0_16px_50px_#0006,inset_0_1px_0_#ffffff0a]',
          '[@media(prefers-reduced-transparency:reduce)]:!bg-orbit-surface [@media(prefers-reduced-transparency:reduce)]:!backdrop-blur-none',
          '[@media(forced-colors:active)]:!bg-orbit-surface [@media(forced-colors:active)]:!backdrop-blur-none',
        )}
        position="popper"
        align="end"
      >
        {versions.map(({ key, component, release, installed }) => (
          <SelectItem
            key={key}
            value={key}
            className={clsx(
              'component-version-option flex min-h-[42px] gap-3 text-xs',
              '!rounded-lg !py-2.5 !pl-7 !pr-3 data-[state=checked]:bg-orbit-foreground/10',
              '[&>span[data-radix-select-item-text]]:[overflow-wrap:anywhere]',
            )}
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
