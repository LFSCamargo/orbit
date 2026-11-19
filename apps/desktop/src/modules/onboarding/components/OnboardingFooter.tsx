import { clsx } from 'clsx'
import { useEffect, useRef } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { focusManager } from '@/controllers/FocusManager'
import { buttonClass } from '@/components/ui/button'
import { BusyLabel } from '@/components/feedback/BusyLabel'

export const ONBOARDING_PRIMARY_ID = 'onboarding-primary'
export const ONBOARDING_BACK_ID = 'onboarding-back'

/** ← Back on the left, the orange primary with → on the right (centered on
 * its own), sitting over the planet's horizon.
 */
export function OnboardingFooter({
  onBack,
  primary,
  centered = false,
  order = 100,
}: {
  onBack?: () => void
  primary: {
    label: string
    onClick: () => void
    disabled?: boolean
    /** Its action is running: a spinner on the label, and it cannot be pressed. */
    busy?: boolean
    arrow?: boolean
  }
  centered?: boolean
  /** Focus order after the step's own controls. */
  order?: number
}) {
  // While the primary waits (installing, scanning) focus falls back to Back;
  // hand it to the primary again once it can be pressed.
  const waiting = Boolean(primary.disabled || primary.busy)
  const wasDisabled = useRef(waiting)
  useEffect(() => {
    if (wasDisabled.current && !waiting) {
      const id = window.requestAnimationFrame(() => {
        if (focusManager.hasNode(ONBOARDING_PRIMARY_ID)) {
          focusManager.setFocus(ONBOARDING_PRIMARY_ID)
        }
      })
      wasDisabled.current = waiting
      return () => window.cancelAnimationFrame(id)
    }
    wasDisabled.current = waiting
  }, [waiting])

  return (
    <footer
      className={clsx(
        'onboarding-footer mt-auto flex items-center gap-4 pt-[clamp(12px,3cqh,24px)]',
        centered ? 'justify-center' : 'justify-between',
      )}
    >
      {onBack && !centered && (
        <Focusable
          focusId={ONBOARDING_BACK_ID}
          group="onboarding"
          order={order}
          noScale
          noRing
          onClick={onBack}
          className={buttonClass({
            variant: 'secondary',
            className:
              'border-white/[0.12] bg-[rgb(30_26_30/0.75)] font-medium backdrop-blur-md',
          })}
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Back
        </Focusable>
      )}
      <Focusable
        focusId={ONBOARDING_PRIMARY_ID}
        group="onboarding"
        order={order + 1}
        noScale
        noRing
        disabled={primary.disabled || primary.busy}
        onClick={primary.onClick}
        className={buttonClass({ className: 'min-h-[52px] px-8 text-[17px]' })}
      >
        <BusyLabel busy={Boolean(primary.busy)}>{primary.label}</BusyLabel>
        {primary.arrow !== false && !primary.disabled && !primary.busy && (
          <ArrowRight size={19} aria-hidden="true" />
        )}
      </Focusable>
    </footer>
  )
}
