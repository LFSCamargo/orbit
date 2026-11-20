import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { Copy, ExternalLink, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { XboxIcon } from '@/components/brand/AccountIcons'
import { Spinner } from '@/components/feedback/Spinner'
import { Focusable } from '@/components/focus/Focusable'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useModalFocus } from '@/hooks/useModalFocus'
import {
  openExternalUrl,
  xboxDeviceCancel,
  xboxDevicePoll,
  xboxDeviceStart,
} from '@/lib/tauri'
import type { XboxAccount } from '@/types/xcloud'

const SECONDARY =
  'orbit-glass-control inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 font-semibold disabled:opacity-50'
const PRIMARY =
  'inline-flex items-center gap-2 rounded-full bg-orbit-accent px-5 py-3 font-semibold text-orbit-canvas disabled:opacity-50'

/** Microsoft device-code sign-in: Orbit shows a code, the user enters it at
 * microsoft.com/link on any device, and Orbit polls until it is approved.
 * Every open, and every "New code", asks Microsoft for a fresh code. */
export function XboxDeviceCodeModal({
  open,
  onSignedIn,
  onClose,
}: {
  open: boolean
  onSignedIn: (account: XboxAccount) => void
  onClose: () => void
}) {
  const client = useQueryClient()
  const finished = useRef(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!open) return
    finished.current = false
    setRound((value) => value + 1)
  }, [open])

  const start = useQuery({
    queryKey: ['xbox-device', round],
    queryFn: xboxDeviceStart,
    enabled: open && round > 0,
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
  })
  const poll = useQuery({
    queryKey: ['xbox-device-poll', round, start.data?.userCode],
    queryFn: xboxDevicePoll,
    enabled: open && Boolean(start.data),
    retry: false,
    gcTime: 0,
    refetchInterval: (query) =>
      query.state.data?.done || query.state.error
        ? false
        : Math.max(1, start.data?.intervalSeconds ?? 5) * 1000,
  })

  useEffect(() => {
    const account = poll.data?.account
    if (!open || !poll.data?.done || !account || finished.current) return
    finished.current = true
    void client.invalidateQueries({ queryKey: ['xbox-account'] })
    onSignedIn(account)
  }, [client, onSignedIn, open, poll.data])

  const close = () => {
    void xboxDeviceCancel()
    onClose()
  }
  const newCode = () => {
    void xboxDeviceCancel()
    setRound((value) => value + 1)
  }

  useModalFocus(open, 'xbox-device', 'xbox-device-cancel')
  useOverlayBack(open, close)

  const error = start.error ?? poll.error
  const code = start.data?.userCode
  const link = start.data?.verificationUri ?? 'https://www.microsoft.com/link'
  const loading = start.isFetching

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="orbit-panel w-full max-w-md rounded-theme p-7"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="xbox-device-title"
            aria-busy={loading}
          >
            <div className="orbit-glass-control flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <XboxIcon size={22} />
            </div>
            <h2
              id="xbox-device-title"
              className="mt-5 font-display text-2xl font-semibold"
            >
              Sign in to Xbox
            </h2>
            <p className="mt-2 leading-relaxed text-orbit-muted">
              On your phone or computer, go to{' '}
              <strong className="text-orbit-foreground">
                <a href={link}>{link.replace(/^https:\/\/(www\.)?/, '')}</a>
              </strong>{' '}
              and enter this code.
            </p>
            <div className="orbit-glass-control mt-5 grid min-h-[5.5rem] place-items-center rounded-2xl bg-white/[0.06] px-4 py-4">
              {code && !loading ? (
                <output
                  aria-label="Sign-in code"
                  className="select-all font-mono text-[32px] font-bold tracking-[0.2em]"
                >
                  {code}
                </output>
              ) : (
                !error && (
                  <span role="status" aria-label="Getting a sign-in code">
                    <Spinner size={28} />
                  </span>
                )
              )}
              {error && !loading && (
                <p role="alert" className="text-center text-sm text-rose-300">
                  {error instanceof Error ? error.message : String(error)}
                </p>
              )}
            </div>
            {code && !error && !loading && (
              <p role="status" className="mt-3 text-sm text-orbit-muted">
                Waiting for you to approve the sign-in…
              </p>
            )}
            <div className="mt-7 flex flex-wrap justify-end gap-3">
              <Focusable
                focusId="xbox-device-cancel"
                group="xbox-device"
                order={0}
                onClick={close}
                className={SECONDARY}
              >
                Cancel
              </Focusable>
              <Focusable
                focusId="xbox-device-new-code"
                group="xbox-device"
                order={1}
                disabled={loading}
                onClick={newCode}
                className={SECONDARY}
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : undefined} />
                New code
              </Focusable>
              {code && !error && (
                <>
                  <Focusable
                    focusId="xbox-device-copy"
                    group="xbox-device"
                    order={2}
                    onClick={() => void navigator.clipboard?.writeText(code)}
                    className={SECONDARY}
                  >
                    <Copy size={16} />
                    Copy
                  </Focusable>
                  <Focusable
                    focusId="xbox-device-open"
                    group="xbox-device"
                    order={3}
                    onClick={() => void openExternalUrl(link)}
                    className={PRIMARY}
                  >
                    <ExternalLink size={16} />
                    Open page
                  </Focusable>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
