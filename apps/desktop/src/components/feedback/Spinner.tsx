import { clsx } from 'clsx'

/** A small orbit: a faint ring with a bright arc running round it. Purely
 * decorative; the control or region it sits in carries the meaning. With
 * reduced motion the arc stays put and pulses instead. */
export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={clsx(
        'orbit-spinner shrink-0 animate-spin [animation-duration:0.9s] motion-reduce:animate-pulse',
        className,
      )}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.22"
        strokeWidth="2.5"
      />
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
