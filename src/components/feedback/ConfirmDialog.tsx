import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { useModalFocus } from '@/hooks/useModalFocus'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useModalFocus(open, 'confirm-dialog', 'confirm-cancel')

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [open, onCancel])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="orbit-panel w-full max-w-md rounded-theme p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15 text-rose-400">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-semibold">{title}</h2>
            <p className="mt-2 leading-relaxed text-orbit-muted">{description}</p>
            <div className="mt-7 flex justify-end gap-3">
              <Focusable
                focusId="confirm-cancel"
                group="confirm-dialog"
                order={0}
                disabled={busy}
                onClick={onCancel}
                className="rounded-card bg-white/10 px-5 py-3 font-semibold"
              >
                Cancel
              </Focusable>
              <Focusable
                focusId="confirm-action"
                group="confirm-dialog"
                order={1}
                disabled={busy}
                onClick={onConfirm}
                className="rounded-card bg-rose-500 px-5 py-3 font-semibold text-white"
              >
                {busy ? 'Deleting…' : confirmLabel}
              </Focusable>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
