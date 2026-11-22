import { useEffect, useState } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'
import {
  appUpdateCheck,
  appUpdateRestart,
  appVersion,
  openExternalUrl,
} from '@/lib/tauri'
import { useAppUpdateStore } from '@/stores/appUpdate.store'
import type { AppUpdateState } from '@/types/appUpdate'
import { ROW_DESC, ROW_TITLE, SETTINGS_ROW } from './settingsRowStyles'

function describe(state: AppUpdateState): string {
  switch (state.status) {
    case 'idle':
      return 'Orbit checks GitHub for new versions.'
    case 'checking':
      return 'Checking for updates…'
    case 'upToDate':
      return 'Orbit is up to date'
    case 'downloading': {
      const percent = state.total
        ? ` · ${Math.min(100, Math.round((state.downloaded / state.total) * 100))}%`
        : ''
      return `Downloading Orbit ${state.version}${percent}`
    }
    case 'ready':
      return `Orbit ${state.version} is ready. Restart to update.`
    case 'unsupported':
      return state.reason
    case 'failed':
      return state.message
  }
}

/** Settings → General: Orbit's version, its update state, Check now and Restart. */
export function AppUpdateSettings({ order }: { order: number }) {
  const state = useAppUpdateStore((s) => s.state)
  const setState = useAppUpdateStore((s) => s.setState)
  const [version, setVersion] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = state.status === 'checking' || state.status === 'downloading'

  useEffect(() => {
    let active = true
    void appVersion()
      .then((current) => {
        if (active) setVersion(current)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const check = async () => {
    setError(null)
    try {
      setState(await appUpdateCheck())
    } catch (reason) {
      setError(String(reason))
    }
  }

  const restart = async () => {
    setError(null)
    try {
      await appUpdateRestart()
    } catch (reason) {
      setError(String(reason))
    }
  }

  return (
    <div className={SETTINGS_ROW}>
      <div>
        <h3 className={ROW_TITLE}>Orbit updates</h3>
        <p className={ROW_DESC}>
          {version ? `Orbit ${version} · ` : ''}
          {describe(state)}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-[13px] text-rose-300">
            {error}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {state.status === 'unsupported' ? (
          <Focusable
            focusId="settings-update-download"
            group="settings"
            order={order}
            noScale
            noRing
            onClick={() => void openExternalUrl(state.releasesUrl)}
            className={buttonClass({ variant: 'secondary' })}
          >
            Download from GitHub
          </Focusable>
        ) : state.status === 'ready' ? (
          <Focusable
            focusId="settings-update-restart"
            group="settings"
            order={order}
            noScale
            noRing
            onClick={() => void restart()}
            className={buttonClass({ variant: 'primary' })}
          >
            Restart to update
          </Focusable>
        ) : (
          <Focusable
            focusId="settings-update-check"
            group="settings"
            order={order}
            noScale
            noRing
            disabled={busy}
            onClick={() => void check()}
            className={buttonClass({ variant: 'secondary' })}
          >
            Check now
          </Focusable>
        )}
      </div>
    </div>
  )
}
