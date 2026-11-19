import { clsx } from 'clsx'
import { Check } from 'lucide-react'
import { stepperState, type OnboardingStep } from '../lib/onboardingSteps'

/** Five dots joined by short lines: a white check when done, a glowing
 * orange ring for the current step, a hollow dot for the rest. Labels are
 * for screen readers; the step title names the step on screen.
 */
export function OnboardingStepper({ step }: { step: OnboardingStep }) {
  return (
    <ol className="onboarding-stepper flex items-center" aria-label="Setup progress">
      {stepperState(step).map((item, index) => (
        <li
          key={item.id}
          className="flex items-center"
          aria-current={item.state === 'current' ? 'step' : undefined}
          data-state={item.state}
        >
          {index > 0 && (
            <span
              aria-hidden="true"
              className={clsx(
                'mx-1 h-[2px] w-[clamp(18px,3cqw,30px)] rounded-full',
                item.state === 'upcoming' ? 'bg-white/20' : 'orbit-progress-fire',
              )}
            />
          )}
          <span
            aria-hidden="true"
            className={clsx(
              'grid size-[16px] place-items-center rounded-full',
              item.state === 'done' && 'bg-white/85 text-[#18120f]',
              item.state === 'current' &&
                'border-[3px] border-[rgb(var(--orbit-fire-via))] bg-[#fff1e4] shadow-[0_0_12px_rgb(var(--orbit-fire-via)/0.85)]',
              item.state === 'upcoming' && 'border-[1.5px] border-white/40',
            )}
          >
            {item.state === 'done' && <Check size={10} strokeWidth={3.5} />}
          </span>
          <span className="sr-only">{item.label}</span>
        </li>
      ))}
    </ol>
  )
}
