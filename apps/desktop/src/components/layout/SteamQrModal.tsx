import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Focusable } from '@/components/focus/Focusable'
import {
  cancelSteamWindowsSignIn,
  pollSteamWindowsQr,
  startSteamWindowsQr,
} from '@/lib/tauri'
import type { SteamQrPoll } from '@/types/steam'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useUiStore } from '@/stores/ui.store'

/** Orbit-drawn Steam QR. Valve's auth API supplies the challenge. No Steam window. */
export function SteamQrModal({
  open,
  attempt,
  onSignedIn,
  onClose,
}: {
  open: boolean
  attempt: number
  onSignedIn: (result: SteamQrPoll) => void
  onClose: () => void
}) {
  const finished = useRef(false)
  const [closing, setClosing] = useState(false)
  const start = useQuery({
    queryKey: ['steam-qr', attempt],
    queryFn: startSteamWindowsQr,
    enabled: open && attempt > 0 && !closing,
    retry: false,
  })
  const poll = useQuery({
    queryKey: ['steam-qr-poll', attempt, start.data?.clientId, start.data?.requestId],
    queryFn: () => pollSteamWindowsQr(start.data!.clientId, start.data!.requestId),
    enabled: open && Boolean(start.data) && !closing,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.done
        ? false
        : Math.max(1, start.data?.intervalSeconds ?? 2) * 1000,
  })

  useEffect(() => {
    finished.current = false
  }, [attempt])

  useEffect(() => {
    const result = poll.data
    if (!open || !result?.done || !result.status || finished.current) return
    finished.current = true
    onSignedIn(result)
  }, [onSignedIn, open, poll.data])

  useModalFocus(open, 'steam-qr', 'steam-qr-cancel')
  const close = async () => {
    if (closing) return
    setClosing(true)
    try {
      await cancelSteamWindowsSignIn()
    } catch (cause) {
      useUiStore
        .getState()
        .setImportToast(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setClosing(false)
      onClose()
    }
  }
  if (!open) return null
  const error = start.error ?? poll.error
  const qr = start.data?.qrSvg
  const image = qr ? `data:image/svg+xml,${encodeURIComponent(qr)}` : null

  return createPortal(
    <div className="steam-qr-backdrop bg-black/46 fixed inset-0 z-[90] grid place-items-center p-6">
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            void close()
          }
        }}
        className="steam-qr-dialog grid w-[min(420px,100%)] justify-items-center gap-3 rounded-3xl bg-[#f7f8fb] p-4 text-center text-[#141820] shadow-[0_24px_80px_rgb(0_0_0/0.28)] [color-scheme:light]"
        style={{ background: '#f7f8fb', color: '#141820' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="steam-qr-title"
        aria-busy={qr && !error ? 'false' : 'true'}
      >
        <h2 id="steam-qr-title" className="m-0">
          Sign in to Steam
        </h2>
        {image ? (
          <img
            src={image}
            alt="Steam sign-in QR code"
            className="steam-qr-image size-[240px] bg-white"
          />
        ) : (
          !error && (
            <div
              className="steam-qr-spinner size-[46px] animate-steam-spin rounded-full border-[3px] border-[rgb(20_24_32/0.16)] border-t-[#141820]"
              role="status"
              aria-label="Loading Steam sign-in"
            />
          )
        )}
        <p className="m-0 max-w-[42ch] text-[14px] leading-[1.45] text-[#3c4453]">
          {qr
            ? 'Scan this QR code with the Steam mobile app.'
            : 'Preparing a Steam sign-in code.'}
        </p>
        {error && (
          <p className="steam-auth-error m-0 text-[13px] text-[#9d1c1c]" role="alert">
            {error instanceof Error ? error.message : String(error)}
          </p>
        )}
        <Focusable
          focusId="steam-qr-cancel"
          group="steam-qr"
          order={8}
          noScale
          className="steam-activity-button steam-qr-cancel h-12 min-w-24 justify-self-start rounded-full bg-transparent px-3.5 py-[9px] text-[13px] font-[680] text-[#141820] shadow-[inset_0_0_0_1px_rgb(20_24_32/0.2)] disabled:opacity-55"
          disabled={closing}
          onClick={() => void close()}
        >
          Cancel
        </Focusable>
      </div>
    </div>,
    document.body,
  )
}
