import type { LucideIcon } from 'lucide-react'
import { CARD } from './styles'

export function EmptyCard({
  icon: Icon,
  title,
  copy,
}: {
  icon: LucideIcon
  title: string
  copy: string
}) {
  return (
    <div className={`${CARD} justify-items-center py-6 text-center`}>
      <span className="grid size-10 place-items-center rounded-full bg-white/10">
        <Icon size={18} aria-hidden />
      </span>
      <strong className="text-[14px] font-[650]">{title}</strong>
      <p className="m-0 max-w-[30ch] text-[12px] leading-[1.45] text-white/60">{copy}</p>
    </div>
  )
}
