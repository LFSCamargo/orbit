import { clsx } from 'clsx'
import { Gauge, MonitorSmartphone, Rocket } from 'lucide-react'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import type { LibraryRunInfo } from '@/types/library'

const PROTON_TONE: Record<string, string> = {
  platinum: 'details-proton-platinum bg-[#9ae6b433]',
  gold: 'details-proton-gold bg-[#f6e05e33]',
  silver: 'details-proton-silver bg-[#cbd5e033]',
  bronze: 'details-proton-bronze bg-[#ed893633]',
  borked: 'details-proton-borked bg-[#fc818133]',
}

function protonLabel(tier: string) {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

export function DetailsRunInfo({ info }: { info?: LibraryRunInfo | null }) {
  if (!info || (!info.minimum && !info.recommended && !info.protonTier)) return null
  return (
    <section
      className="details-run-info orbit-glass mt-6 flex flex-col gap-4 rounded-3xl border border-white/[0.08] bg-white/[0.016] p-7"
      aria-labelledby="details-run-title"
    >
      <header className="details-section-heading mb-[22px] flex items-center justify-between gap-5 max-[520px]:gap-2.5">
        <div>
          <p className="details-eyebrow text-[9px] font-[650] tracking-[0.2em] text-orbit-accent">
            CAN YOU RUN THIS
          </p>
          <h2
            id="details-run-title"
            className="mt-[7px] text-[21px] font-[550] tracking-[-0.035em] max-[760px]:text-xl min-[1700px]:text-2xl"
          >
            System requirements
          </h2>
        </div>
        <MonitorSmartphone size={18} />
      </header>
      {info.protonTier && (
        <p
          className={clsx(
            'details-proton inline-flex min-h-8 items-center self-start rounded-full bg-white/[0.07] px-3 text-[11px] font-[650] uppercase tracking-[0.04em]',
            `details-proton-${info.protonTier}`,
            PROTON_TONE[info.protonTier],
          )}
        >
          ProtonDB {protonLabel(info.protonTier)}
        </p>
      )}
      <p className="details-run-note max-w-[68ch] text-xs leading-[1.6] text-white/[0.53]">
        Publisher Windows requirements. Orbit runs Windows games through Wine on Apple
        Silicon.
      </p>
      {info.minimum && (
        <CollapsiblePanel
          title="Minimum"
          icon={Gauge}
          defaultOpen
          focusId="details-run-minimum"
        >
          <p className="details-description max-w-[760px] whitespace-pre-line text-[13px] leading-[1.95] text-white/[0.64] [overflow-wrap:anywhere] min-[1700px]:text-[15px]">
            {info.minimum}
          </p>
        </CollapsiblePanel>
      )}
      {info.recommended && (
        <CollapsiblePanel
          title="Recommended"
          icon={Rocket}
          focusId="details-run-recommended"
        >
          <p className="details-description max-w-[760px] whitespace-pre-line text-[13px] leading-[1.95] text-white/[0.64] [overflow-wrap:anywhere] min-[1700px]:text-[15px]">
            {info.recommended}
          </p>
        </CollapsiblePanel>
      )}
    </section>
  )
}
