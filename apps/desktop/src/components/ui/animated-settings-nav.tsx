// Adapted from Aceternity UI Tabs: shared-layout active indicator.
// Orbit keeps stable panel order, controller focus and reduced-motion support.
import { useId } from 'react'
import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'

export function AnimatedSettingsNav<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { id: T; label: string; icon: LucideIcon }[]
  value: T
  onChange: (value: T) => void
}) {
  const id = useId()
  const reducedMotion = useReducedMotion()
  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-col gap-1 max-[520px]:flex-row max-[520px]:overflow-x-auto"
    >
      {items.map(({ id: key, label, icon: Icon }, index) => {
        const active = value === key
        return (
          <Focusable
            key={key}
            focusId={`settings-tab-${key}`}
            group="settings-nav"
            order={index}
            noScale
            noRing
            aria-pressed={active}
            onClick={() => onChange(key)}
            className={clsx(
              'settings-tab relative flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent !px-3 !py-[13px] text-left !text-[13px] font-medium text-white/70 transition-[background,color] duration-200',
              'max-[520px]:w-auto max-[520px]:shrink-0 max-[520px]:justify-center max-[520px]:gap-1.5 max-[520px]:whitespace-nowrap max-[520px]:!p-2.5 max-[520px]:!text-xs',
              active
                ? 'settings-tab-active !bg-transparent text-white !shadow-none'
                : 'hover:bg-white/[0.08] hover:text-white data-[focused=true]:bg-white/[0.08] data-[focused=true]:text-white',
            )}
          >
            {active && (
              <motion.span
                aria-hidden="true"
                layoutId={`${id}-active`}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', bounce: 0.15, duration: 0.35 }
                }
                className="settings-nav-indicator bg-orbit-accent/16 absolute inset-0 rounded-xl border border-orbit-accent/20"
              />
            )}
            <Icon size={18} className="relative shrink-0" />
            <span className="relative">{label}</span>
          </Focusable>
        )
      })}
    </nav>
  )
}
