import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Focusable } from '@/components/focus/Focusable'
import {
  cancelSteamWindowsSignIn,
  openSteamWindowsLogin,
  pollSteamWindowsLogin,
} from '@/lib/tauri'
import { STEAM_LOGIN_HEIGHT, STEAM_LOGIN_WIDTH } from '@/lib/steamLoginFrame'
import type { SteamLoginPoll } from '@/types/steam'
import { useSteamLoginPlacement } from '@/hooks/useSteamLoginPlacement'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useUiStore } from '@/stores/ui.store'

/** Hosts Steam's own QR / account window over Orbit. */
export function SteamQrModal({
  open,
  attempt,
  onSignedIn,
  onClose,
}: {
  open: boolean
  attempt: number
  onSignedIn: (result: SteamLoginPoll) => void
  onClose: () => void
}) {
  const finished = useRef(false)
  const opening = useRef<Promise<void> | null>(null)
  const [closing, setClosing] = useState(false)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const start = useQuery({
    queryKey: ['steam-login-open', attempt],
    queryFn: async () => {
      const operation = openSteamWindowsLogin()
      opening.current = operation
      await operation
      return true
    },
    enabled: open && attempt > 0 && !closing,
    retry: false,
  })
  const poll = useQuery({
    queryKey: ['steam-login-poll', attempt],
    queryFn: pollSteamWindowsLogin,
    enabled: open && start.isSuccess && !closing,
    retry: false,
    refetchInterval: (query) => (query.state.data?.done ? false : 2_000),
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

  const placement = useSteamLoginPlacement(open && start.isSuccess && !closing, host)
  useModalFocus(open, 'steam-qr', 'steam-qr-cancel')
  const close = async () => {
    if (closing) return
    setClosing(true)
    try {
      // Opening may still be provisioning Wine. Reap it after it finishes so a
      // late spawn cannot appear after the user has dismissed this dialog.
      await opening.current?.catch(() => undefined)
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
  const error = start.error ?? poll.error ?? placement.error
  const ready = start.isSuccess && placement.placed && !error

  return createPortal(
    <div className="steam-qr-backdrop bg-black/46 fixed inset-0 z-[90] grid place-items-center p-6">
      <div
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            void close()
          }
        }}
        className="steam-qr-dialog grid w-[min(900px,100%)] justify-items-center gap-3 rounded-3xl bg-[#f7f8fb] p-4 text-center text-[#141820] shadow-[0_24px_80px_rgb(0_0_0/0.28)] [color-scheme:light]"
        style={{ background: '#f7f8fb', color: '#141820' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="steam-qr-title"
        aria-busy={ready ? 'false' : 'true'}
      >
        <h2 id="steam-qr-title" className="m-0">
          Sign in to Steam
        </h2>
        <div className="relative w-full" style={{ maxWidth: STEAM_LOGIN_WIDTH }}>
          <div
            ref={setHost}
            className="steam-login-host mx-auto rounded-2xl bg-white shadow-[inset_0_0_0_1px_rgb(20_24_32/0.08)]"
            data-testid="steam-login-host"
            style={{
              width: '100%',
              maxWidth: STEAM_LOGIN_WIDTH,
              height: `min(${STEAM_LOGIN_HEIGHT}px, calc(100dvh - 240px))`,
            }}
          />
          {!ready && !error && (
            <div className="absolute inset-0 grid place-items-center">
              <div
                className="steam-qr-spinner size-[46px] animate-steam-spin rounded-full border-[3px] border-[rgb(20_24_32/0.16)] border-t-[#141820]"
                role="status"
                aria-label="Loading Steam sign-in"
              />
            </div>
          )}
        </div>
        <p className="m-0 max-w-[42ch] text-[14px] leading-[1.45] text-[#3c4453]">
          {ready
            ? 'Scan the QR code in Steam’s window with the Steam mobile app. Account sign-in is in that same window.'
            : 'Opening Steam’s sign-in window.'}
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
