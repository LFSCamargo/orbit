// App-wide notifications on Sonner, rendered as Orbit's liquid-glass toasts.
//
// Screens call `notify.*` instead of printing status lines in place. A stable
// `id` updates one toast in place (progress, loader → result).
import { toast } from 'sonner'
import { OrbitToast, type ToastKind } from '@/components/feedback/OrbitToast'

export type ToastContent = {
  title: string
  message?: string
  /** Small line above the message, e.g. "Step 4 of 6 · Downloading". */
  caption?: string
}

type ToastOptions = {
  /** Reuse to replace an existing toast instead of stacking a new one. */
  id?: string | number
  duration?: number
}

const DURATION: Record<ToastKind, number> = {
  success: 5_000,
  warning: 7_000,
  error: 9_000,
  loading: Infinity,
  progress: Infinity,
}

function show(
  kind: ToastKind,
  content: ToastContent & { value?: number | null },
  options: ToastOptions = {},
) {
  return toast.custom(
    (id) => (
      <OrbitToast
        kind={kind}
        title={content.title}
        caption={content.caption}
        message={content.message}
        value={content.value ?? null}
        onDismiss={() => toast.dismiss(id)}
      />
    ),
    { id: options.id, duration: options.duration ?? DURATION[kind] },
  )
}

export const notify = {
  success: (content: ToastContent, options?: ToastOptions) =>
    show('success', content, options),
  warning: (content: ToastContent, options?: ToastOptions) =>
    show('warning', content, options),
  error: (content: ToastContent, options?: ToastOptions) =>
    show('error', content, options),
  /** Spinner toast that stays until replaced or dismissed. Returns its id. */
  loading: (content: ToastContent, options?: ToastOptions) =>
    show('loading', content, options),
  /** Bar toast; `value` 0-100, or null while the amount of work is unknown. */
  progress: ({
    id,
    value,
    ...content
  }: ToastContent & { id: string | number; value: number | null }) =>
    show('progress', { ...content, value }, { id }),
  dismiss: (id?: string | number) => toast.dismiss(id),
}
