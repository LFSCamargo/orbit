// Adapted from Aceternity UI Tabs: shared-layout active indicator.
// Orbit keeps stable panel order, controller focus and reduced-motion support.
import { useId } from 'react'
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
    <nav aria-label="Settings sections">
      {items.map(({ id: key, label, icon: Icon }, index) => (
        <Focusable
          key={key}
          focusId={`settings-tab-${key}`}
          group="settings-nav"
          order={index}
          noScale
          noRing
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`settings-tab ${value === key ? 'settings-tab-active' : ''}`}
        >
          {value === key && (
            <motion.span
              aria-hidden="true"
              layoutId={`${id}-active`}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', bounce: 0.15, duration: 0.35 }
              }
              className="settings-nav-indicator"
            />
          )}
          <Icon size={18} className="relative shrink-0" />
          <span className="relative">{label}</span>
        </Focusable>
      ))}
    </nav>
  )
}
