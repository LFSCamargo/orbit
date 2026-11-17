import { useCallback, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { useQueryClient } from '@tanstack/react-query'
import { Focusable } from '@/components/focus/Focusable'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import type { SteamLoginPoll } from '@/types/steam'
import { SteamClientSignIn } from './SteamClientSignIn'

const STEAM_BUTTON =
  'steam-activity-button justify-self-start rounded-full bg-[#f7f8fb] px-3.5 py-[9px] text-[13px] font-[680] text-[#12141a] disabled:opacity-55'
const STEAM_BUTTON_QUIET =
  'steam-activity-button-quiet bg-transparent text-[#f4f6fb] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]'
const AUTH_COPY = 'steam-auth-copy m-0 text-[13px] leading-[1.45] text-white/72'
const AUTH_ERROR = 'steam-auth-error m-0 text-[13px] text-[#ffb4b4]'

/** Steam sign-in. Orbit opens Valve's client, then closes Wine once the account is saved. */
export function SteamWindowsAccount({
  focusGroup = 'steam-activity',
}: {
  focusGroup?: string
}) {
  const client = useQueryClient()
  const { status, signOut } = useSteamWindows()
  const account = status.data
  const shareable = account?.sessionReady === true
  const [qrOpen, setQrOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const starting = useRef(false)
  const error = signOut.error ?? status.error
  const finish = useCallback(
    (result: SteamLoginPoll) => {
      starting.current = false
      if (result.status) {
        client.setQueryData(['steam-windows-status'], result.status)
      }
      void client.invalidateQueries({ queryKey: ['steam-windows-library'] })
      void client.invalidateQueries({ queryKey: ['library'] })
      void client.invalidateQueries({ queryKey: ['library-entry'] })
      void client.invalidateQueries({ queryKey: ['games'] })
      setLibraryError(result.libraryError)
      setQrOpen(false)
    },
    [client],
  )

  return (
    <section
      className="steam-activity-card grid gap-2.5 rounded-[18px] border border-white/10 bg-[rgb(8_10_16/0.42)] p-3.5"
      aria-label="Steam authorization"
    >
      <p className="steam-activity-kicker mb-1 text-[11px] font-[650] uppercase tracking-[0.16em] text-white/55">
        Authorization
      </p>
      <div className="steam-auth-heading flex items-center justify-between gap-2.5">
        <h3 className="m-0 text-[1.05rem] font-[650] tracking-[-0.03em]">Steam login</h3>
        <p
          className="steam-auth-status bg-white/8 m-0 rounded-full px-2 py-1 text-[11px] font-[650] uppercase tracking-[0.04em] data-[authorized=true]:bg-[rgb(125_255_179/0.16)] data-[authorized=true]:text-[#b8ffd4]"
          data-authorized={shareable ? 'true' : 'false'}
        >
          {shareable ? 'Authorized' : 'Not authorized'}
        </p>
      </div>
      {shareable ? (
        <>
          <p className={AUTH_COPY}>
            Signed in as {account?.accountName}. Resident Evil and other Windows games use
            this sign-in.
          </p>
          <Focusable
            focusId={`${focusGroup}-sign-out`}
            group={focusGroup}
            order={2}
            noScale
            className={clsx(STEAM_BUTTON, STEAM_BUTTON_QUIET)}
            onClick={() => void signOut.mutate()}
            disabled={signOut.isPending}
          >
            Sign out
          </Focusable>
          <p className={AUTH_COPY}>
            Sign out removes the Windows Steam environment. Games in other folders stay.
          </p>
        </>
      ) : (
        <>
          <p className={AUTH_COPY}>
            {account?.signedIn
              ? `Signed in as ${account.accountName ?? 'Steam'}, but games do not have a session yet. Sign in with Steam's own window.`
              : 'Sign in with Steam’s own window once. Orbit closes it after the account is saved and uses that login for every Windows game.'}
          </p>
          <Focusable
            focusId={`${focusGroup}-sign-in`}
            group={focusGroup}
            order={1}
            noScale
            className={STEAM_BUTTON}
            onClick={() => {
              if (starting.current || qrOpen) return
              starting.current = true
              setLibraryError(null)
              setAttempt((value) => value + 1)
              setQrOpen(true)
            }}
            disabled={qrOpen}
          >
            Sign in with Steam
          </Focusable>
        </>
      )}
      {libraryError && (
        <p className={AUTH_ERROR} role="alert">
          {libraryError}
        </p>
      )}
      {error && (
        <p className={AUTH_ERROR} role="alert">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
      <SteamClientSignIn
        open={qrOpen}
        attempt={attempt}
        onSignedIn={finish}
        onClose={() => {
          starting.current = false
          setQrOpen(false)
        }}
      />
    </section>
  )
}
