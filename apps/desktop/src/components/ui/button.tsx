import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  // The brand fire gradient; fixed in every theme (see `.orbit-btn-fire`).
  primary: 'orbit-btn-fire !rounded-full',
  secondary: 'orbit-glass-control bg-white/10 text-orbit-foreground hover:bg-white/15',
  quiet: 'bg-white/[0.08] text-orbit-foreground hover:bg-white/[0.14]',
  danger: 'bg-rose-500 text-white hover:brightness-110',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-8 gap-1.5 px-3.5 text-xs',
  md: 'min-h-11 gap-2 px-5 text-sm',
  lg: 'min-h-14 gap-2.5 px-8 text-base',
}

/** Classes for a button; `Focusable` call sites pass the result as `className`.
 * Every button is a pill (rounded-full). */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}) {
  return clsx(
    'inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold transition disabled:cursor-not-allowed',
    variant !== 'primary' && 'disabled:opacity-50',
    VARIANT[variant],
    SIZE[size],
    className,
  )
}

/** A plain `<button>` with Orbit's button styles, for places outside the focus graph. */
export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, className })}
      {...props}
    />
  )
}
