import { useState } from 'react'
import {
  Check,
  Download,
  LoaderCircle,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import { CollapsiblePanel } from '@/components/ui/collapsible-panel'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { detectRuntimes, registerWineRuntime, windowsCompatibility } from '@/lib/tauri'
import { open } from '@/lib/dialog'
import { Focusable } from '@/components/focus/Focusable'
import { DownloadProgress } from '@/components/ui/download-progress'
import { useCompatibilitySetup } from '../hooks/useCompatibilitySetup'
import { CompatibilityComponents } from './CompatibilityComponents'
import { buttonClass } from '@/components/ui/button'
import { SkeletonPanel } from '@/components/feedback/Skeleton'

export function RuntimeSettings() {
  const queryClient = useQueryClient()
  const compatibility = useQuery({
    queryKey: ['windows-compatibility'],
    queryFn: windowsCompatibility,
  })
  const runtimes = useQuery({ queryKey: ['runtimes'], queryFn: detectRuntimes })
  const [message, setMessage] = useState('')
  const [registering, setBusy] = useState(false)
  const setup = useCompatibilitySetup()
  const { install, task } = setup
  const busy = registering || setup.busy

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['runtimes'] }),
      queryClient.invalidateQueries({ queryKey: ['windows-compatibility'] }),
    ])
  }

  const register = async () => {
    setBusy(true)
    setMessage('')
    try {
      const path = await open({
        title: 'Choose wine or wine64 from an installed distribution',
      })
      if (typeof path !== 'string') return
      await registerWineRuntime(path)
      await refresh()
      setMessage('Your existing runtime is ready to use.')
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }

  const status = compatibility.data
  const ready = Boolean(status?.managed) || setup.complete

  return (
    <section className="settings-panel scroll-mt-6 [&+.settings-panel]:mt-7 [&+.settings-panel]:pt-2">
      <div className="settings-panel-header !mb-6 flex !flex-col !items-start !gap-2 !p-0 text-orbit-foreground">
        <div className="settings-panel-title flex items-center gap-2.5 [&>svg]:shrink-0 [&>svg]:text-orbit-accent">
          <Settings2 size={20} />
          <h2 className="!m-0 !text-[clamp(22px,2vw,28px)] !font-semibold !normal-case !leading-none !tracking-[-0.035em]">
            Windows compatibility
          </h2>
        </div>
        <p className="m-0 text-[13px] font-normal leading-[1.6] text-orbit-muted">
          Everything needed to play Windows games on your Mac.
        </p>
      </div>

      {compatibility.error ? (
        <p role="alert">Could not check compatibility. {String(compatibility.error)}</p>
      ) : !status?.supported && !compatibility.isLoading ? (
        <div className="rounded-card bg-white/5 p-5 text-sm text-orbit-muted">
          Managed Windows compatibility is available on macOS only.
        </div>
      ) : (
        <>
          <div>
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-orbit-accent/20 bg-orbit-accent/5 p-5">
                <div className="flex max-w-xl items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-orbit-accent/15 p-2 text-orbit-accent">
                    {ready ? <Check size={18} /> : <ShieldCheck size={18} />}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">
                      {ready
                        ? 'Windows games are ready'
                        : 'Start with the recommended runtime'}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-orbit-muted">
                      Orbit handles the setup for you. No terminal, Homebrew, or separate
                      launcher needed.
                    </p>
                  </div>
                </div>
                {!ready && (
                  <Focusable
                    focusId="runtime-install"
                    group="runtimes"
                    order={0}
                    disabled={busy || compatibility.isLoading}
                    onClick={() => void install()}
                    className={buttonClass({})}
                  >
                    {busy ? (
                      <LoaderCircle size={16} className="animate-spin" />
                    ) : (
                      <Download size={16} />
                    )}
                    {setup.busy
                      ? 'Setting up…'
                      : setup.error
                        ? 'Retry installation'
                        : 'Install compatibility'}
                  </Focusable>
                )}
              </div>

              {setup.busy && task && <DownloadProgress task={task} />}

              {status && <CompatibilityComponents />}
            </div>

            <CollapsiblePanel
              title="Advanced runtime options"
              icon={SlidersHorizontal}
              className="mt-8"
              focusId="runtime-advanced"
            >
              <div>
                <h3 className="font-semibold">Existing Wine installations</h3>
                <p className="mt-1 text-xs leading-relaxed text-orbit-muted">
                  Only use this if you already manage Wine yourself. The managed setup
                  above is recommended for everyone else.
                </p>
              </div>
              {(runtimes.data ?? []).map((runtime) => (
                <div key={runtime.path} className="rounded-card bg-white/[0.03] p-3">
                  <h4 className="font-medium">{runtime.version}</h4>
                  <p className="mt-1 break-all text-xs text-orbit-muted">
                    {runtime.path}
                  </p>
                </div>
              ))}
              {status?.supported &&
                !runtimes.data?.length &&
                (runtimes.isFetching ? (
                  <SkeletonPanel label="Detecting runtimes" rows={2} />
                ) : (
                  <p className="text-orbit-muted">No Wine runtime detected.</p>
                ))}
              <div className="flex flex-wrap gap-3">
                <Focusable
                  focusId="runtime-register"
                  group="runtimes"
                  order={1}
                  disabled={busy}
                  onClick={() => void register()}
                  className="orbit-glass-control rounded-full px-4 py-3"
                >
                  Choose installed Wine
                </Focusable>
                <Focusable
                  focusId="runtime-refresh"
                  group="runtimes"
                  order={2}
                  disabled={runtimes.isFetching || busy}
                  onClick={() => void refresh()}
                  className="orbit-glass-control rounded-full px-4 py-3"
                >
                  Detect again
                </Focusable>
              </div>
            </CollapsiblePanel>

            {setup.error && (
              <p
                role="alert"
                className="mt-4 rounded-card border border-red-400/20 bg-red-400/5 p-4 text-sm"
              >
                Installation failed: {setup.error}. You can retry safely.
              </p>
            )}
            {setup.complete && (
              <p role="status" className="mt-4 text-sm">
                Windows games are ready to play.
              </p>
            )}
            {(message || compatibility.error || runtimes.error) && (
              <p role="status" className="mt-4 text-sm">
                {message || String(compatibility.error || runtimes.error)}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  )
}
