import { clsx } from 'clsx'
import type { LucideIcon } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'

export interface EmptyStateAction {
  label: string
  focusId: string
  group: string
  order?: number
  onClick: () => void
  /** The first action is primary (fire); the rest are secondary glass. */
  variant?: 'primary' | 'secondary'
}

/** One empty / no-results state for the whole app: a glass panel with a
 * softly glowing, floating icon, a clear title, a hint at what to do, and
 * optional actions that fix it. `sm` fits tables and small cards. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions = [],
  size = 'lg',
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  actions?: EmptyStateAction[]
  size?: 'sm' | 'lg'
  className?: string
}) {
  const large = size === 'lg'
  return (
    <div
      role="status"
      data-size={size}
      className={clsx(
        'empty-state orbit-glass-control grid justify-items-center bg-white/[0.035] text-center',
        large ? 'gap-3 rounded-[26px] px-6 py-12' : 'gap-2 rounded-[18px] px-4 py-6',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'float-soft relative grid place-items-center rounded-full bg-white/[0.08] text-white/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_0_28px_rgb(var(--orbit-fire-via)/0.22)]',
          large ? 'mb-1 size-14' : 'size-10',
        )}
      >
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_30%,rgb(var(--orbit-fire-via)/0.28),transparent_70%)]" />
        <Icon size={large ? 24 : 18} className="relative" />
      </span>
      <strong
        className={clsx(
          'font-display font-semibold text-white',
          large ? 'text-[22px]' : 'text-[14px]',
        )}
      >
        {title}
      </strong>
      {description && (
        <p
          className={clsx(
            'm-0 max-w-[44ch] leading-relaxed text-white/60',
            large ? 'text-[14px]' : 'text-[12px]',
          )}
        >
          {description}
        </p>
      )}
      {actions.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {actions.map((action, index) => (
            <Focusable
              key={action.focusId}
              focusId={action.focusId}
              group={action.group}
              order={action.order ?? index}
              noScale
              noRing
              onClick={action.onClick}
              className={buttonClass({
                variant: action.variant ?? (index === 0 ? 'primary' : 'secondary'),
              })}
            >
              {action.label}
            </Focusable>
          ))}
        </div>
      )}
    </div>
  )
}
