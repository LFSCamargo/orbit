import { Gamepad2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SteamWindowsAccount } from '@/components/layout/SteamWindowsAccount'
import { Focusable } from '@/components/focus/Focusable'
import { Switch } from '@/components/ui/switch'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { installWindowsSteam } from '@/lib/tauri'
import type { SteamWindowsPreferences } from '@/types/steam'

const DEFAULTS: SteamWindowsPreferences = { offlineMode: false, verifyFiles: true }

/** Settings → Steam. Authorization stays separate from download behavior. */
export function SteamSettings() {
  const client = useQueryClient()
  const { status, preferences, savePreferences } = useSteamWindows()
  const current = preferences.data ?? DEFAULTS
  const save = (next: SteamWindowsPreferences) => {
    savePreferences.mutate(next)
  }
  const install = useMutation({
    mutationFn: installWindowsSteam,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['steam-windows-status'] })
    },
  })

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
            Sign in with the QR code. After that, uninstalled games appear in Library.
          </p>
        </div>
        <div className="settings-card-inner !px-0 !py-5">
          {!status.data?.steamInstalled && (
            <div className="mb-4">
              <Focusable
                focusId="settings-install-wine-steam"
                group="settings-steam"
                order={0}
                noScale
                className="steam-activity-button justify-self-start rounded-full bg-[#f7f8fb] px-3.5 py-[9px] text-[13px] font-[680] text-[#12141a] disabled:opacity-55"
                disabled={install.isPending}
                onClick={() => install.mutate()}
              >
                {install.isPending
                  ? 'Preparing the Steam environment…'
                  : 'Install Steam for Windows'}
              </Focusable>
              <p className="mt-2 text-sm text-orbit-muted">
                Sets up a working Windows environment, then opens Steam’s own installer.
              </p>
              {install.isError && (
                <p role="alert" className="mt-2 text-sm text-rose-300">
                  {install.error instanceof Error
                    ? install.error.message
                    : String(install.error)}
                </p>
              )}
            </div>
          )}
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
          <div className="settings-row mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="settings-row flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
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
      </section>
    </div>
  )
}
