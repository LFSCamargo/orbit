import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { ProgressBar } from '@/components/ui/progress-bar'

export type ToastKind = 'success' | 'warning' | 'error' | 'loading' | 'progress'

const TONE: Record<ToastKind, { icon: LucideIcon | null; color: string }> = {
  success: { icon: CheckCircle2, color: 'text-[#7dffb3]' },
  warning: { icon: AlertTriangle, color: 'text-[#ffd27d]' },
  error: { icon: XCircle, color: 'text-[#ff8f8f]' },
  loading: { icon: Loader2, color: 'text-orbit-accent' },
  progress: { icon: null, color: 'text-orbit-accent' },
}

/** One liquid-glass notification: icon or bar, title, optional message. */
export function OrbitToast({
  kind,
  title,
  caption,
  message,
  value,
  onDismiss,
}: {
  kind: ToastKind
  title: string
  caption?: string
  message?: string
  value: number | null
  onDismiss: () => void
}) {
  const { icon: Icon, color } = TONE[kind]
  return (
    <LiquidGlass
      surface="panel"
      radius={18}
      data-testid={`toast-${kind}`}
      role={kind === 'error' ? 'alert' : 'status'}
      className="w-[min(360px,calc(100vw-32px))] shadow-[0_18px_50px_rgb(0_0_0/0.45)]"
      contentClassName="flex items-start gap-3 py-3.5 pl-4 pr-3 text-[#f4f6fb]"
    >
      {Icon && (
        <Icon
          size={20}
          aria-hidden
          className={clsx(
            'mt-px shrink-0',
            color,
            kind === 'loading' && 'animate-spin motion-reduce:animate-none',
          )}
        />
      )}
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <strong className="truncate text-[13px] font-[650]">{title}</strong>
          {kind === 'progress' && value !== null && (
            <span className="shrink-0 text-[11px] tabular-nums text-white/70">
              {Math.round(value)}%
            </span>
          )}
        </div>
        {caption && (
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-orbit-accent">
            {caption}
          </p>
        )}
        {message && (
          <p className="m-0 text-[12px] tabular-nums leading-[1.45] text-white/70">
            {message}
          </p>
        )}
        {kind === 'progress' && (
          <ProgressBar label={title} value={value} className="mt-1" />
        )}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="grid size-6 shrink-0 place-items-center rounded-full text-white/55 hover:bg-white/10 hover:text-white"
      >
        <X size={13} />
      </button>
    </LiquidGlass>
  )
}
