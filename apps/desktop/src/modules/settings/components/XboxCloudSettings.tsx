import { useState } from 'react'
import { XboxIcon } from '@/components/brand/AccountIcons'
import { Focusable } from '@/components/focus/Focusable'
import { buttonClass } from '@/components/ui/button'
import { openXboxCloud } from '@/lib/tauri'
import { usePreferencesStore } from '@/stores/preferences.store'
import { ROW_DESC, ROW_TITLE, SETTINGS_ROW } from './settingsRowStyles'

/** Xbox Cloud Gaming opens xbox.com/play in its own window; once opened it
 * also appears in the Home menu. Sign-in lives in that window, not in Orbit.
 */
export function XboxCloudSettings() {
  const connected = usePreferencesStore((s) => s.preferences.xboxCloudConnected)
  const update = usePreferencesStore((s) => s.update)
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
            Stream Game Pass games in an Orbit window. You sign in with your Microsoft
            account there.
          </p>
          {error && (
            <p role="alert" className="mt-1 text-[13px] text-rose-300">
              {error}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <Focusable
          focusId="settings-xbox-open"
          group="settings"
          order={3}
          noScale
          noRing
          onClick={() => void open()}
          aria-label="Open Xbox Cloud Gaming"
          className={buttonClass({ shape: 'card' })}
        >
          Open
        </Focusable>
        {connected && (
          <Focusable
            focusId="settings-xbox-remove"
            group="settings"
            order={4}
            noScale
            noRing
            onClick={() => void update({ xboxCloudConnected: false })}
            className={buttonClass({ variant: 'secondary', shape: 'card' })}
          >
            Remove from Orbit
          </Focusable>
        )}
      </div>
    </div>
  )
}
