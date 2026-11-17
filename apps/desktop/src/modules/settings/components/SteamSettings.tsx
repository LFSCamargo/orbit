import { Gamepad2 } from 'lucide-react'
import { SteamWindowsAccount } from '@/components/layout/SteamWindowsAccount'
import { Switch } from '@/components/ui/switch'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import type { SteamWindowsPreferences } from '@/types/steam'

const DEFAULTS: SteamWindowsPreferences = {
  offlineMode: false,
  verifyFiles: true,
  steamInput: true,
  steamOverlay: false,
}

/** Settings → Steam. Authorization stays separate from download behavior. */
export function SteamSettings() {
  const { preferences, savePreferences } = useSteamWindows()
  const current = { ...DEFAULTS, ...preferences.data }
  const save = (next: SteamWindowsPreferences) => {
    savePreferences.mutate(next)
  }

  return (
    <div className="settings-view flex flex-col gap-7" data-testid="settings-steam-view">
      <section className="settings-panel scroll-mt-6 [&+.settings-panel]:mt-7 [&+.settings-panel]:pt-2">
        <div className="settings-panel-header !mb-6 flex !flex-col !items-start !gap-2 !p-0 text-orbit-foreground">
          <div className="settings-panel-title flex items-center gap-2.5 [&>svg]:shrink-0 [&>svg]:text-orbit-accent">
            <Gamepad2 size={20} />
            <h2 className="!m-0 !text-[clamp(22px,2vw,28px)] !font-semibold !normal-case !leading-none !tracking-[-0.035em]">
              Steam
            </h2>
          </div>
          <p className="m-0 text-[13px] font-normal leading-[1.6] text-orbit-muted">
            Sign in with Steam’s own window. Orbit closes it after the account is saved
            and uses that login for every Windows game.
          </p>
        </div>
        <div className="settings-card-inner !px-0 !py-5">
          <SteamWindowsAccount focusGroup="settings-steam" />
        </div>

        <div className="settings-card-inner mt-4 !px-0 !py-5" aria-label="Steam settings">
          <h3 className="settings-row-title font-display text-[17px] font-semibold text-white">
            Session
          </h3>
          {savePreferences.isError && (
            <p role="alert" className="mt-3 text-sm text-rose-300">
              {savePreferences.error instanceof Error
                ? savePreferences.error.message
                : 'Could not save Steam preferences. Try again.'}
            </p>
          )}
          <div className="settings-row mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3
                id="steam-offline-mode-label"
                className="settings-row-title font-display text-[17px] font-semibold text-white"
              >
                Offline mode
              </h3>
              <p
                id="steam-offline-mode-help"
                className="settings-row-desc mt-1 max-w-[520px] text-[13px] text-[#ffffffa0]"
              >
                Downloads use the saved Steam session and stay offline. A download fails
                when Steam has no cached login.
              </p>
            </div>
            <Switch
              id="steam-offline-mode"
              aria-labelledby="steam-offline-mode-label"
              aria-describedby="steam-offline-mode-help"
              checked={current.offlineMode}
              disabled={savePreferences.isPending}
              onCheckedChange={(offlineMode) => save({ ...current, offlineMode })}
            />
          </div>
          <div className="settings-row my-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3
                id="steam-verify-files-label"
                className="settings-row-title font-display text-[17px] font-semibold text-white"
              >
                Verify game files
              </h3>
              <p
                id="steam-verify-files-help"
                className="settings-row-desc mt-1 max-w-[520px] text-[13px] text-[#ffffffa0]"
              >
                Check each Windows download after it finishes. Turning this off makes
                installs faster.
              </p>
            </div>
            <Switch
              id="steam-verify-files"
              aria-labelledby="steam-verify-files-label"
              aria-describedby="steam-verify-files-help"
              checked={current.verifyFiles}
              disabled={savePreferences.isPending}
              onCheckedChange={(verifyFiles) => save({ ...current, verifyFiles })}
            />
          </div>
        </div>

        <div
          className="settings-card-inner mt-4 !px-0 !py-5"
          aria-label="Steam game options"
        >
          <h3 className="settings-row-title font-display text-[17px] font-semibold text-white">
            Games
          </h3>
          <div className="settings-row mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3
                id="steam-input-label"
                className="settings-row-title font-display text-[17px] font-semibold text-white"
              >
                Steam Input for controllers
              </h3>
              <p
                id="steam-input-help"
                className="settings-row-desc mt-1 max-w-[520px] text-[13px] text-[#ffffffa0]"
              >
                Steam maps controllers for each game, as in Steam Big Picture. Turn it off
                to give games the controller directly.
              </p>
            </div>
            <Switch
              id="steam-input"
              aria-labelledby="steam-input-label"
              aria-describedby="steam-input-help"
              checked={current.steamInput !== false}
              disabled={savePreferences.isPending}
              onCheckedChange={(steamInput) => save({ ...current, steamInput })}
            />
          </div>
          <div className="settings-row my-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3
                id="steam-overlay-label"
                className="settings-row-title font-display text-[17px] font-semibold text-white"
              >
                Steam overlay in games
              </h3>
              <p
                id="steam-overlay-help"
                className="settings-row-desc mt-1 max-w-[520px] text-[13px] text-[#ffffffa0]"
              >
                Shift+Tab opens Steam over the game. It hooks every frame, so it stays off
                unless you need it. Applies the next time the game's Steam starts.
              </p>
            </div>
            <Switch
              id="steam-overlay"
              aria-labelledby="steam-overlay-label"
              aria-describedby="steam-overlay-help"
              checked={current.steamOverlay === true}
              disabled={savePreferences.isPending}
              onCheckedChange={(steamOverlay) => save({ ...current, steamOverlay })}
            />
          </div>
        </div>
      </section>
    </div>
  )
}
