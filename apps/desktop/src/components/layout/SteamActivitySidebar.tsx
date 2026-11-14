import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { SteamWindowsAccount } from '@/components/layout/SteamWindowsAccount'
import { DownloadProgress } from '@/components/ui/download-progress'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import {
  formatTransferRate,
  transferRate,
  useDownloadStore,
} from '@/lib/downloadProgress'
import { useUiStore } from '@/stores/ui.store'
import { cancelSteamWindowsDownload } from '@/lib/tauri'

const STEAM_BUTTON =
  'steam-activity-button justify-self-start rounded-full bg-[#f7f8fb] px-3.5 py-[9px] text-[13px] font-[680] text-[#12141a] disabled:opacity-55'
const STEAM_BUTTON_QUIET =
  'steam-activity-button-quiet bg-transparent text-[#f4f6fb] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]'

const HOST_STYLE = {
  position: 'fixed' as const,
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(420px, 100vw)',
  zIndex: 80,
}

/** Right-edge downloads panel. The host is fixed so glass layout cannot pull it inline. */
export function SteamActivitySidebar({ onClose }: { onClose: () => void }) {
  const { status } = useSteamWindows()
  const tasks = useDownloadStore((state) => state.tasks)
  const failures = useDownloadStore((state) => state.failures)
  const clear = useDownloadStore((state) => state.clear)
  const sample = useRef<{ at: number; bytes: number } | null>(null)
  const [rate, setRate] = useState<number | null>(null)
  useModalFocus(true, 'steam-activity', 'steam-activity-close')

  const downloadedBytes = Object.values(tasks).reduce<number | null>((found, task) => {
    if (found !== null) return found
    return task.progress?.phase === 'Downloading' ? task.progress.downloadedBytes : null
  }, null)
  useEffect(() => {
    if (downloadedBytes === null) {
      sample.current = null
      setRate(null)
      return
    }
    const next = { at: Date.now(), bytes: downloadedBytes }
    setRate(transferRate(sample.current, next))
    sample.current = next
  }, [downloadedBytes])

  return (
    <div
      data-testid="steam-activity-host"
      className="steam-activity-host flex"
      style={HOST_STYLE}
    >
      <LiquidGlass
        surface="panel"
        radius={0}
        role="dialog"
        aria-label="Downloads"
        className="steam-activity-drawer size-full shadow-[-20px_0_60px_rgb(0_0_0/0.45)]"
        contentClassName="steam-activity-content flex h-full flex-col gap-3.5 overflow-auto px-[18px] pb-7 pt-[22px] text-[#f4f6fb]"
      >
        <header className="steam-activity-header flex items-start justify-between gap-3">
          <div>
            <p className="steam-activity-kicker mb-1 text-[11px] font-[650] uppercase tracking-[0.16em] text-white/55">
              Activity
            </p>
            <h2 className="m-0 text-[1.35rem] font-[650] tracking-[-0.03em]">
              Downloads
            </h2>
          </div>
          <Focusable
            focusId="steam-activity-close"
            group="steam-activity"
            order={0}
            noScale
            aria-label="Close downloads"
            className="steam-activity-close bg-white/8 grid size-9 place-items-center rounded-full"
            onClick={onClose}
          >
            <X size={18} />
          </Focusable>
        </header>

        <SteamWindowsAccount />

        <section
          className="steam-activity-card grid gap-2.5 rounded-[18px] border border-white/10 bg-[rgb(8_10_16/0.42)] p-3.5"
          aria-label="Network"
        >
          <p className="steam-activity-kicker mb-1 text-[11px] font-[650] uppercase tracking-[0.16em] text-white/55">
            Network
          </p>
          <div className="steam-activity-stats grid grid-cols-2 gap-2">
            <div className="grid gap-1 rounded-[14px] bg-white/5 p-2.5">
              <span className="text-[11px] uppercase tracking-[0.08em] text-white/50">
                Client
              </span>
              <strong className="text-[13px] font-[620]">
                {status.data?.clientRunning
                  ? 'Steam client is running'
                  : 'Steam client is closed'}
              </strong>
            </div>
            <div className="grid gap-1 rounded-[14px] bg-white/5 p-2.5">
              <span className="text-[11px] uppercase tracking-[0.08em] text-white/50">
                Rate
              </span>
              <strong className="text-[13px] font-[620]">
                {formatTransferRate(rate)}
              </strong>
            </div>
          </div>
        </section>

        <section
          className="steam-activity-card grid gap-2.5 rounded-[18px] border border-white/10 bg-[rgb(8_10_16/0.42)] p-3.5"
          aria-label="Transfers"
        >
          <p className="steam-activity-kicker mb-1 text-[11px] font-[650] uppercase tracking-[0.16em] text-white/55">
            In progress
          </p>
          {Object.values(tasks).length === 0 && Object.keys(failures).length === 0 && (
            <p className="steam-auth-copy text-white/72 m-0 text-[13px] leading-[1.45]">
              No downloads in progress.
            </p>
          )}
          {Object.values(tasks).map((task) => (
            <div
              key={task.key}
              className="steam-activity-transfer flex items-center justify-between gap-3"
            >
              <DownloadProgress task={task} />
              {task.key.startsWith('steam:') &&
                task.progress?.phase === 'Downloading' && (
                  <Focusable
                    focusId={`steam-cancel-${task.key}`}
                    group="steam-activity"
                    order={3}
                    noScale
                    className={clsx(STEAM_BUTTON, STEAM_BUTTON_QUIET)}
                    onClick={() => void cancelSteamWindowsDownload()}
                  >
                    Cancel
                  </Focusable>
                )}
            </div>
          ))}
          {Object.entries(failures).map(([key, failure]) => (
            <div
              key={key}
              className="steam-activity-transfer flex items-center justify-between gap-3"
            >
              <span>{failure}</span>
              <Focusable
                focusId={`steam-dismiss-${key}`}
                group="steam-activity"
                order={4}
                noScale
                className={clsx(STEAM_BUTTON, STEAM_BUTTON_QUIET)}
                onClick={() => clear(key)}
              >
                Dismiss
              </Focusable>
            </div>
          ))}
        </section>

        <Focusable
          focusId="steam-open-library"
          group="steam-activity"
          order={5}
          noScale
          className={STEAM_BUTTON}
          onClick={() => {
            useUiStore.getState().setScreen('library')
            onClose()
          }}
        >
          Open library
        </Focusable>
      </LiquidGlass>
    </div>
  )
}
