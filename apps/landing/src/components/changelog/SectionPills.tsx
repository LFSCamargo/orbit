import { CheckIcon } from '@/components/ui/icons'
import { SECTION_LABELS, type ChangeSection } from '@/lib/changelog'
import { cn } from '@/lib/utils'

/** "v2.4.0 · ✓ 3 Improvements · ✓ 2 Fixes", as on the release's social card. */
export function SectionPills({
  version,
  sections,
  className,
}: {
  version?: string
  sections: ChangeSection[]
  className?: string
}) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-2', className)}>
      {version && (
        <li className="rounded-full border border-orange-400/80 bg-orange-500/15 px-3.5 py-1 font-mono text-sm font-semibold text-orange-200 shadow-[0_0_18px_-6px_rgb(255_120_40/0.9)]">
          v{version}
        </li>
      )}
      {sections.map((section) => (
        <li
          key={section.heading}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/75"
        >
          <CheckIcon className="h-3.5 w-3.5 text-orbit-accent" />
          {section.items.length} {SECTION_LABELS[section.kind]}
        </li>
      ))}
    </ul>
  )
}
