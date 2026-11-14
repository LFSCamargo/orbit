import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { createPortal } from 'react-dom'
import { Focusable } from '@/components/focus/Focusable'
import {
  beginSteamWindowsPassword,
  cancelSteamWindowsSignIn,
  pollSteamWindowsQr,
  startSteamWindowsQr,
  submitSteamWindowsGuard,
} from '@/lib/tauri'
import type { SteamPasswordStart, SteamQrPoll, SteamQrStart } from '@/types/steam'

function pollSession(session: SteamQrStart | undefined): Promise<SteamQrPoll> {
  if (!session) return Promise.reject(new Error('Steam sign-in could not be confirmed'))
  return pollSteamWindowsQr(session.clientId, session.requestId)
}

/** QR and account sign-in hosted inside Orbit. No Wine Steam window. */
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
  const [method, setMethod] = useState<'qr' | 'account'>('qr')
  const [accountName, setAccountName] = useState('')
  const [password, setPassword] = useState('')
  const [guard, setGuard] = useState('')
  const [passwordSession, setPasswordSession] = useState<SteamPasswordStart | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const start = useQuery({
    queryKey: ['steam-qr-start', attempt],
    queryFn: startSteamWindowsQr,
    enabled: open && attempt > 0 && method === 'qr',
    retry: false,
  })
  const qrPoll = useQuery({
    queryKey: ['steam-qr-poll', attempt, start.data?.clientId, start.data?.requestId],
    queryFn: () => pollSession(start.data),
    enabled: open && method === 'qr' && start.data !== undefined,
    retry: false,
    refetchInterval: (query) => (query.state.data?.done ? false : 5_000),
  })
  const accountPoll = useQuery({
    queryKey: [
      'steam-account-poll',
      attempt,
      passwordSession?.clientId,
      passwordSession?.requestId,
    ],
    queryFn: () =>
      pollSteamWindowsQr(passwordSession!.clientId, passwordSession!.requestId),
    enabled:
      open &&
      method === 'account' &&
      passwordSession !== null &&
      !passwordSession.needsCode,
    retry: false,
    refetchInterval: (query) => (query.state.data?.done ? false : 5_000),
  })

  useEffect(() => {
    finished.current = false
    setMethod('qr')
    setAccountName('')
    setPassword('')
    setGuard('')
    setPasswordSession(null)
    setFormError(null)
    setSubmitting(false)
  }, [attempt])

  useEffect(() => {
    const result = method === 'qr' ? qrPoll.data : accountPoll.data
    if (!open || !result?.done || !result.status || finished.current) return
    finished.current = true
    onSignedIn(result)
  }, [accountPoll.data, method, onSignedIn, open, qrPoll.data])

  if (!open) return null

  const qrSrc = start.data
    ? `data:image/svg+xml,${encodeURIComponent(start.data.qrSvg)}`
    : null
  const error =
    formError ?? (method === 'qr' ? (start.error ?? qrPoll.error) : accountPoll.error)

  async function submitAccount() {
    setFormError(null)
    setSubmitting(true)
    try {
      const session = await beginSteamWindowsPassword(accountName.trim(), password)
      setPassword('')
      setPasswordSession(session)
      if (!session.needsCode) {
        const result = await pollSteamWindowsQr(session.clientId, session.requestId)
        if (result.done && result.status && !finished.current) {
          finished.current = true
          onSignedIn(result)
        }
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function submitGuardCode() {
    if (!passwordSession?.steamId) {
      setFormError('Steam Guard could not be confirmed')
      return
    }
    setFormError(null)
    setSubmitting(true)
    try {
      await submitSteamWindowsGuard(
        passwordSession.clientId,
        passwordSession.steamId,
        guard.trim(),
        passwordSession.codeType,
      )
      setPasswordSession({ ...passwordSession, needsCode: false })
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const signInTab = clsx(
    'steam-signin-tab rounded-full bg-[rgb(20_24_32/0.06)] px-3 py-1.5 text-[13px] text-[#141820]',
    'aria-pressed:bg-[#141820] aria-pressed:text-[#f7f8fb]',
  )
  const signInLabel = 'grid gap-1 text-xs text-[#3c4453]'
  const signInInput =
    'rounded-xl border-0 bg-white px-3 py-2.5 text-[#141820] shadow-[inset_0_0_0_1px_rgb(20_24_32/0.12)]'

  return createPortal(
    <div className="steam-qr-backdrop bg-black/46 fixed inset-0 z-[90] grid place-items-center p-6">
      <div
        className="steam-qr-dialog grid w-[min(380px,100%)] justify-items-center gap-3.5 rounded-3xl bg-[#f7f8fb] p-[22px] text-center text-[#141820] shadow-[0_24px_80px_rgb(0_0_0/0.28)] [color-scheme:light]"
        style={{ background: '#f7f8fb', color: '#141820' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="steam-qr-title"
        aria-busy={method === 'qr' && !qrSrc ? 'true' : 'false'}
      >
        <h2 id="steam-qr-title" className="m-0">
          Sign in to Steam
        </h2>
        <div
          className="steam-signin-tabs flex gap-2"
          role="tablist"
          aria-label="Steam sign-in method"
        >
          <Focusable
            focusId="steam-signin-tab-qr"
            group="steam-qr"
            order={1}
            noScale
            className={signInTab}
            aria-pressed={method === 'qr'}
            onClick={() => setMethod('qr')}
          >
            QR code
          </Focusable>
          <Focusable
            focusId="steam-signin-tab-account"
            group="steam-qr"
            order={2}
            noScale
            className={signInTab}
            aria-pressed={method === 'account'}
            onClick={() => setMethod('account')}
          >
            Account
          </Focusable>
        </div>
        {method === 'qr' ? (
          <>
            {qrSrc ? (
              <img
                className="steam-qr-image size-[220px] rounded-2xl bg-white p-2.5 shadow-[inset_0_0_0_1px_rgb(20_24_32/0.08)]"
                src={qrSrc}
                alt="Steam QR code"
              />
            ) : (
              <div
                className="steam-qr-spinner size-[46px] animate-steam-spin rounded-full border-[3px] border-[rgb(20_24_32/0.16)] border-t-[#141820]"
                role="status"
                aria-label="Loading Steam sign-in"
              />
            )}
            <p className="m-0 max-w-[28ch] text-[14px] leading-[1.45] text-[#3c4453]">
              {qrSrc
                ? 'Scan this code with the Steam mobile app.'
                : 'Opening Steam sign-in.'}
            </p>
          </>
        ) : (
          <form
            className="steam-signin-form grid w-[min(280px,100%)] gap-2.5 text-left"
            onSubmit={(event) => {
              event.preventDefault()
              if (passwordSession?.needsCode) void submitGuardCode()
              else void submitAccount()
            }}
          >
            <label className={signInLabel}>
              Account name
              <input
                autoComplete="username"
                className={signInInput}
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
              />
            </label>
            <label className={signInLabel}>
              Password
              <input
                type="password"
                autoComplete="current-password"
                className={signInInput}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {passwordSession?.needsCode && (
              <label className={signInLabel}>
                Steam Guard code
                <input
                  autoComplete="one-time-code"
                  className={signInInput}
                  value={guard}
                  onChange={(event) => setGuard(event.target.value)}
                />
              </label>
            )}
            <button
              className="steam-activity-button justify-self-start rounded-full bg-[#f7f8fb] px-3.5 py-[9px] text-[13px] font-[680] text-[#12141a] disabled:opacity-55"
              type="submit"
              disabled={submitting}
            >
              {passwordSession?.needsCode ? 'Confirm' : 'Sign in'}
            </button>
          </form>
        )}
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
          className="steam-activity-button steam-qr-cancel justify-self-start rounded-full bg-transparent px-3.5 py-[9px] text-[13px] font-[680] text-[#141820] shadow-[inset_0_0_0_1px_rgb(20_24_32/0.2)] disabled:opacity-55"
          onClick={() => {
            void cancelSteamWindowsSignIn()
            onClose()
          }}
        >
          Cancel
        </Focusable>
      </div>
    </div>,
    document.body,
  )
}
