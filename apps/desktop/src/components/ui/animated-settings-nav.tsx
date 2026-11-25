// Adapted from Aceternity UI Tabs: shared-layout active indicator.
// Orbit keeps stable panel order, controller focus and reduced-motion support.
import { useId } from 'react'
import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import type { ComponentType } from 'react'
import { Focusable } from '@/components/focus/Focusable'

export function AnimatedSettingsNav<T extends string>({
  items,
  value,
  onChange,
}: {
  /** Lucide icons or any icon taking `size` and `className`, e.g. a brand logo. */
  items: {
    id: T
    label: string
    icon: ComponentType<{ size?: number; className?: string }>
  }[]
  value: T
  onChange: (value: T) => void
}) {
  const id = useId()
  const reducedMotion = useReducedMotion()
  return (
    <nav
      aria-label="Settings sections"
      className="flex flex-col gap-1 max-[520px]:flex-row max-[520px]:overflow-x-auto max-[520px]:p-1"
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
              'settings-tab relative flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-full border-none bg-transparent !px-3 !py-[13px] text-left !text-[13px] font-medium text-white/70 transition-[background,color] duration-200',
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
                className={clsx(
                  'settings-nav-indicator absolute inset-0 rounded-full',
                  'bg-[linear-gradient(#ffffff2e,#ffffff14)]',
                  'shadow-[inset_0_1px_0_#ffffff38]',
                  'ring-1 ring-inset ring-white/20',
                )}
              />
            )}
            <Icon
              size={18}
              className={clsx('relative shrink-0', active && 'text-orbit-accent')}
            />
            <span className="relative">{label}</span>
          </Focusable>
        )
      })}
    </nav>
  )
}
