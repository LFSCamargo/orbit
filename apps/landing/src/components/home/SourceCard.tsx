import type { ReactNode } from 'react'
import { GlassPanel } from '@/components/ui/glass-panel'
import { Reveal } from '@/components/ui/reveal'

export function SourceCard({
  name,
  logo,
  detail,
  delay,
}: {
  name: string
  logo: ReactNode
  detail: string
  delay: number
}) {
  return (
    <li>
      <Reveal delay={delay}>
        <GlassPanel className="p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
              {logo}
            </span>
            <h3 className="text-lg font-medium tracking-[-0.02em]">{name}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/65">{detail}</p>
        </GlassPanel>
      </Reveal>
    </li>
  )
}
