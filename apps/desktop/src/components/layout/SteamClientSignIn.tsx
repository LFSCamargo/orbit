import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Focusable } from '@/components/focus/Focusable'
import { useModalFocus } from '@/hooks/useModalFocus'
import {
  cancelSteamWindowsSignIn,
  openSteamWindowsLogin,
  pollSteamWindowsLogin,
} from '@/lib/tauri'
import type { SteamLoginPoll } from '@/types/steam'

/** Opens Valve's Steam window, then Orbit closes Wine once the account is saved. */
export function SteamClientSignIn({
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
  const signedIn = useRef(onSignedIn)
  signedIn.current = onSignedIn
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (!open) return
    let stopped = false
    let timer = 0
    setError(null)
    const wait = (ms: number) =>
      new Promise((resolve) => {
        timer = window.setTimeout(resolve, ms)
      })
    const run = async () => {
      try {
        await openSteamWindowsLogin()
        while (!stopped) {
          const result = await pollSteamWindowsLogin()
          if (stopped) return
          if (result.done && result.status) {
            signedIn.current(result)
            return
          }
          await wait(2000)
        }
      } catch (cause) {
        if (!stopped) {
          setError(cause instanceof Error ? cause.message : String(cause))
        }
      }
    }
    void run()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [attempt, open])

  useModalFocus(open, 'steam-client-sign-in', 'steam-client-sign-in-cancel')
  if (!open) return null

  const close = async () => {
    if (closing) return
    setClosing(true)
    try {
      await cancelSteamWindowsSignIn()
    } finally {
      setClosing(false)
      onClose()
    }
  }

  return createPortal(
    <div className="bg-black/46 fixed inset-0 z-[90] grid place-items-center p-6">
      <div
        className="grid w-[min(420px,100%)] gap-3 rounded-3xl bg-[#141820] p-5 text-[#f4f6fb]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="steam-client-sign-in-title"
      >
        <h2 id="steam-client-sign-in-title" className="m-0 text-lg font-semibold">
          Sign in to Steam
        </h2>
        <p className="m-0 text-sm leading-6 text-white/80">
          Steam’s own window is opening. Sign in there. Orbit closes Steam after the
          account is saved and keeps that login for your games.
        </p>
        {error && (
          <p className="m-0 text-sm text-[#ffb4b4]" role="alert">
            {error}
          </p>
        )}
        <Focusable
          focusId="steam-client-sign-in-cancel"
          group="steam-client-sign-in"
          order={1}
          noScale
          className="h-12 justify-self-start rounded-full px-4 text-sm font-semibold"
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
