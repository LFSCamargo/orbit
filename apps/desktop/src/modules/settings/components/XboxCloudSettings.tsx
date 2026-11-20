import { useState } from 'react'
import { XboxIcon } from '@/components/brand/AccountIcons'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'
import { openXboxCloud } from '@/lib/tauri'
import { XboxDeviceCodeModal } from '@/modules/xcloud/components/XboxDeviceCodeModal'
import {
  useXboxAccount,
  useXboxSignOut,
  useXcloudStreamStatus,
} from '@/modules/xcloud/hooks/useXcloud'
import { usePreferencesStore } from '@/stores/preferences.store'
import { ROW_DESC, ROW_TITLE, SETTINGS_ROW } from './settingsRowStyles'

/** Xbox Cloud Gaming: link a Microsoft account with a device code, and open
 * xbox.com/play in its own window (which then appears in the Home menu).
 * Catalog games play from Library → Xbox Cloud. */
export function XboxCloudSettings() {
  const connected = usePreferencesStore((s) => s.preferences.xboxCloudConnected)
  const update = usePreferencesStore((s) => s.update)
  const account = useXboxAccount()
  const signOut = useXboxSignOut()
  const stream = useXcloudStreamStatus(Boolean(account.data))
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState('')

  const open = async () => {
    setError('')
    try {
      await openXboxCloud()
      await update({ xboxCloudConnected: true })
    } catch {
      setError('Could not open Xbox Cloud Gaming. Try again.')
    }
  }

  return (
    <div className={SETTINGS_ROW}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/10">
          <XboxIcon size={18} />
        </span>
        <div>
          <h3 className={ROW_TITLE}>Xbox Cloud Gaming</h3>
          <p className={ROW_DESC}>
            {account.data
              ? `Signed in as ${account.data.gamertag}. `
              : 'Sign in with a code at microsoft.com/link. '}
            Browse cloud games in Library.
          </p>
          {account.data && stream.data && (
            <p role="status" className="mt-1 text-[13px] text-emerald-300">
              Cloud streaming ready · {stream.data.region}
              {stream.data.market ? ` (${stream.data.market})` : ''}
            </p>
          )}
          {account.data && stream.error && (
            <p role="alert" className="mt-1 text-[13px] text-amber-200">
              {stream.error instanceof Error
                ? stream.error.message
                : String(stream.error)}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-[13px] text-rose-300">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {account.data ? (
          <Focusable
            focusId="settings-xbox-sign-out"
            group="settings"
            order={3}
            noScale
            noRing
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
            className={buttonClass({ variant: 'secondary' })}
          >
            Sign out
          </Focusable>
        ) : (
          <Focusable
            focusId="settings-xbox-sign-in"
            group="settings"
            order={3}
            noScale
            noRing
            onClick={() => setSigningIn(true)}
            className={buttonClass({})}
          >
            Sign in
          </Focusable>
        )}
        <Focusable
          focusId="settings-xbox-open"
          group="settings"
          order={4}
          noScale
          noRing
          onClick={() => void open()}
          aria-label="Open Xbox Cloud Gaming"
          className={buttonClass({ variant: 'secondary' })}
        >
          Open
        </Focusable>
        {connected && (
          <Focusable
            focusId="settings-xbox-remove"
            group="settings"
            order={5}
            noScale
            noRing
            onClick={() => void update({ xboxCloudConnected: false })}
            className={buttonClass({ variant: 'secondary' })}
          >
            Remove from Orbit
          </Focusable>
        )}
      </div>
      <XboxDeviceCodeModal
        open={signingIn}
        onSignedIn={() => setSigningIn(false)}
        onClose={() => setSigningIn(false)}
      />
    </div>
  )
}
