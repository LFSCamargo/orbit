import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  ExternalLink,
  LoaderCircle,
  Sparkles,
} from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useModalFocus } from '@/hooks/useModalFocus'
import { parseReleaseNotes } from '@/lib/releaseNotes'

export function releasedOn(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
}

/** Slowly turning orbit rings behind the update's icon. Still with reduced motion. */
function OrbitRings() {
  const still = useReducedMotion()
  const spin = (seconds: number, reverse = false) =>
    still
      ? undefined
      : {
          rotate: reverse ? -360 : 360,
          transition: { duration: seconds, ease: 'linear' as const, repeat: Infinity },
        }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgb(var(--orbit-accent)/0.45),transparent_70%)]" />
      <div className="absolute left-1/2 top-[58%] size-[340px] -translate-x-1/2 -translate-y-1/2">
        <motion.div
          animate={spin(60)}
          className="absolute inset-0 rounded-full border border-white/10"
        >
          <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/70 shadow-[0_0_12px_#fff]" />
        </motion.div>
        <motion.div
          animate={spin(38, true)}
          className="absolute inset-[52px] rounded-full border border-white/15"
        >
          <span className="absolute bottom-0 left-1/2 size-1.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-orbit-accent shadow-[0_0_10px_rgb(var(--orbit-accent))]" />
        </motion.div>
        <div className="absolute inset-[104px] rounded-full border border-white/20" />
      </div>
    </div>
  )
}

/** Release notes as plain text: headings, paragraphs and bullet lists. */
function ReleaseNotes({ notes }: { notes: string }) {
  const blocks = parseReleaseNotes(notes)
  if (!blocks.length) {
    return <p className="text-sm text-orbit-muted">This build has no release notes.</p>
  }
  return (
    <div className="space-y-3 text-sm leading-relaxed text-orbit-foreground/85">
      {blocks.map((block, index) =>
        block.kind === 'heading' ? (
          <h4
            key={index}
            className="pt-1 text-xs font-semibold uppercase tracking-[0.14em] text-orbit-muted"
          >
            {block.text}
          </h4>
        ) : block.kind === 'list' ? (
          <ul key={index} className="space-y-2">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="flex gap-2.5">
                <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-orbit-accent shadow-[0_0_8px_rgb(var(--orbit-accent))]" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className="[overflow-wrap:anywhere]">
            {block.text}
          </p>
        ),
      )}
    </div>
  )
}

export interface ReleaseNotesDialogProps {
  /** Focus group and element id prefix, e.g. `app-update`. */
  id: string
  open: boolean
  eyebrow: string
  title: string
  fromVersion: string
  toVersion: string
  /** Size and date line under the versions. */
  details: string
  notes: string
  releaseUrl?: string | null
  footnote: string
  primaryLabel: string
  primaryIcon: ReactNode
  secondaryLabel: string
  onPrimary: () => void
  onSecondary: () => void
  /** Back, Escape or the backdrop; ignored while busy. */
  onDismiss: () => void
  busy?: boolean
  busyLabel?: string
  /** Shown above the buttons, e.g. download progress. */
  progress?: ReactNode
  error?: string
}

/**
 * A release-notes dialog for an update: turning orbit rings, the version
 * jump, plain-text notes, and two choices. Focus is trapped while it is open.
 */
export function ReleaseNotesDialog({
  id,
  open,
  eyebrow,
  title,
  fromVersion,
  toVersion,
  details,
  notes,
  releaseUrl,
  footnote,
  primaryLabel,
  primaryIcon,
  secondaryLabel,
  onPrimary,
  onSecondary,
  onDismiss,
  busy = false,
  busyLabel = 'Working…',
  progress,
  error,
}: ReleaseNotesDialogProps) {
  useModalFocus(open, id, `${id}-accept`)
  const dismiss = () => {
    if (!busy) onDismiss()
  }
  useOverlayBack(open, dismiss)

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={dismiss}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-busy={busy}
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            className="orbit-panel flex max-h-[min(720px,calc(100vh-48px))] w-full max-w-xl flex-col overflow-hidden rounded-theme"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="relative shrink-0 px-7 pb-6 pt-8 text-center">
              <OrbitRings />
              <div className="relative">
                <div className="orbit-glass-control mx-auto grid size-14 place-items-center rounded-full bg-white/10 text-white shadow-[0_0_40px_rgb(var(--orbit-accent)/0.55)]">
                  <Sparkles size={26} />
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-orbit-muted">
                  {eyebrow}
                </p>
                <h2
                  id={`${id}-title`}
                  className="mt-1.5 font-display text-[26px] font-semibold leading-tight"
                >
                  {title}
                </h2>
                <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold">
                  <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-orbit-muted">
                    {fromVersion}
                  </span>
                  <ArrowRight size={14} className="text-orbit-muted" aria-label="to" />
                  <span className="rounded-full border border-orbit-accent/50 bg-orbit-accent/20 px-3 py-1 text-white">
                    {toVersion}
                  </span>
                </div>
                {details && <p className="mt-2.5 text-xs text-orbit-muted">{details}</p>}
              </div>
            </header>
            <section
              className="min-h-0 flex-1 overflow-y-auto border-y border-white/10 bg-black/15 px-7 py-5"
              aria-label="What's new"
            >
              <h3 className="mb-3 text-sm font-semibold">What’s new</h3>
              <ReleaseNotes notes={notes} />
              {releaseUrl && (
                <a
                  href={releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-xs text-orbit-muted underline-offset-4 hover:text-orbit-foreground hover:underline"
                >
                  Release page <ExternalLink size={12} />
                </a>
              )}
            </section>
            <footer className="shrink-0 space-y-4 px-7 py-5">
              <p className="text-xs leading-relaxed text-orbit-muted">{footnote}</p>
              {progress}
              {error && !busy && (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 text-xs leading-relaxed text-red-400"
                >
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-3">
                <Focusable
                  focusId={`${id}-secondary`}
                  group={id}
                  order={0}
                  disabled={busy}
                  onClick={onSecondary}
                  className={buttonClass({ variant: 'secondary' })}
                >
                  {secondaryLabel}
                </Focusable>
                <Focusable
                  focusId={`${id}-accept`}
                  group={id}
                  order={1}
                  disabled={busy}
                  onClick={onPrimary}
                  className={buttonClass({})}
                >
                  {busy ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : (
                    primaryIcon
                  )}
                  {busy ? busyLabel : primaryLabel}
                </Focusable>
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
