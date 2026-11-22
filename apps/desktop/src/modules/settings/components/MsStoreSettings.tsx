import { useState } from 'react'
import { MonitorDown } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'
import {
  useMsStoreCancelSignIn,
  useMsStoreSignIn,
  useMsStoreSignOut,
  useMsStoreStatus,
} from '@/modules/msstore/hooks/useMsStore'
import { useUiStore } from '@/stores/ui.store'
import { ROW_DESC, ROW_TITLE, SETTINGS_ROW } from './settingsRowStyles'

/** Microsoft Store & PC Game Pass native Windows installs via Orbit Wine. */
export function MsStoreSettings() {
  const status = useMsStoreStatus()
  const signIn = useMsStoreSignIn()
  const cancelSignIn = useMsStoreCancelSignIn()
  const signOut = useMsStoreSignOut()
  const setSettingsTab = useUiStore((s) => s.setSettingsTab)
  const [error, setError] = useState('')

  const data = status.data
  const signedIn = data?.signedIn === true
  const accountName = data?.accountLabel ?? data?.gamertag ?? null

  const startSignIn = async () => {
    setError('')
    try {
      await signIn.mutateAsync()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const runSignOut = async () => {
    setError('')
    try {
      await signOut.mutateAsync()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const runtimeReady = Boolean(data?.wineReady && data?.xgameruntimeInstalled)

  return (
    <div className={SETTINGS_ROW} data-testid="msstore-settings-row">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/10">
          <MonitorDown size={18} />
        </span>
        <div>
          <h3 className={ROW_TITLE}>Microsoft Store · PC Installs</h3>
          <p className={ROW_DESC}>
            {signedIn
              ? `Signed in${accountName ? ` as ${accountName}` : ''}. `
              : 'Sign in with Microsoft to download and run PC Game Pass & owned GDK titles natively through Orbit Wine. '}
            Install games from Library → All games.
          </p>
          {data && runtimeReady && (
            <p role="status" className="mt-1 text-[13px] text-emerald-300">
              Orbit Wine &amp; xgameruntime ready for native PC installs
            </p>
          )}
          {data && !runtimeReady && (
            <p role="status" className="mt-1 text-[13px] text-amber-200">
              {!data.wineReady
                ? 'Update Orbit Wine (WINE_DLL_FILE_MAP patch required) to launch Microsoft Store titles.'
                : 'Install the xgameruntime (LGPL-2.1) component in Compatibility to launch Microsoft Store titles.'}
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
        {signedIn ? (
          <Focusable
            focusId="settings-msstore-sign-out"
            group="settings"
            order={6}
            noScale
            noRing
            disabled={signOut.isPending}
            onClick={() => void runSignOut()}
            className={buttonClass({ variant: 'secondary' })}
          >
            Sign out
          </Focusable>
        ) : (
          <Focusable
            focusId="settings-msstore-sign-in"
            group="settings"
            order={6}
            noScale
            noRing
            disabled={signIn.isPending}
            onClick={() => void startSignIn()}
            className={buttonClass({})}
          >
            Sign in to Microsoft Store
          </Focusable>
        )}
        {signIn.isPending && (
          <Focusable
            focusId="settings-msstore-cancel"
            group="settings"
            order={6}
            noScale
            noRing
            onClick={() => cancelSignIn.mutate()}
            className={buttonClass({ variant: 'secondary' })}
          >
            Cancel sign-in
          </Focusable>
        )}
        {data && !runtimeReady && (
          <Focusable
            focusId="settings-msstore-compatibility"
            group="settings"
            order={7}
            noScale
            noRing
            onClick={() => setSettingsTab('runtimes')}
            className={buttonClass({ variant: 'secondary' })}
          >
            Open Compatibility
          </Focusable>
        )}
      </div>
    </div>
  )
}
