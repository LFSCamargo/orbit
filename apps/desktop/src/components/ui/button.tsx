import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'
export type ButtonShape = 'pill' | 'card'

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

const SHAPE: Record<ButtonShape, string> = {
  pill: 'rounded-full',
  card: 'rounded-card',
}

/** Classes for a button; `Focusable` call sites pass the result as `className`. */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  shape = 'pill',
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  shape?: ButtonShape
  className?: string
} = {}) {
  return clsx(
    'inline-flex items-center justify-center whitespace-nowrap font-semibold transition disabled:cursor-not-allowed',
    variant !== 'primary' && 'disabled:opacity-50',
    VARIANT[variant],
    SIZE[size],
    SHAPE[shape],
    className,
  )
}

/** A plain `<button>` with Orbit's button styles, for places outside the focus graph. */
export function Button({
  variant,
  size,
  shape,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  shape?: ButtonShape
}) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, shape, className })}
      {...props}
    />
  )
}
