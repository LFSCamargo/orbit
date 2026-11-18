import { ArrowDownToLine, Download, Layers, RotateCw, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useDownloadQueue } from '@/hooks/useDownloadQueue'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { selectActive, selectCompleted, useDownloadStore } from '@/lib/downloadProgress'
import {
  enqueueSteamDownload,
  pauseActiveDownload,
  removeQueuedDownload,
  startQueuedDownloadNow,
} from '@/lib/tauri'
import { ConnectSteamCard } from './downloads/ConnectSteamCard'
import { DownloadRow } from './downloads/DownloadRow'
import { EmptyCard } from './downloads/EmptyCard'
import { NetworkCard } from './downloads/NetworkCard'
import { QueueRow } from './downloads/QueueRow'
import { ICON_BUTTON, ROW, SECTION_TITLE } from './downloads/styles'
import { useTransferRate } from './downloads/useTransferRate'

const HOST_STYLE = {
  position: 'fixed' as const,
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(420px, 100vw)',
  zIndex: 80,
}

/** `steam:<appid>` for game downloads; Steam setup and components have none. */
function steamAppId(key: string): string | null {
  const match = /^steam:(\d+)$/.exec(key)
  return match ? match[1] : null
}

/** Right-edge downloads panel. The host is fixed so glass layout cannot pull it inline. */
export function SteamActivitySidebar({ onClose }: { onClose: () => void }) {
  const { status } = useSteamWindows()
  const connected = status.data?.sessionReady === true
  const queue = useDownloadQueue()
  const tasks = useDownloadStore((state) => state.tasks)
  const failures = useDownloadStore((state) => state.failures)
  const clear = useDownloadStore((state) => state.clear)
  const clearCompleted = useDownloadStore((state) => state.clearCompleted)
  const { rate, samples } = useTransferRate()
  useModalFocus(true, 'steam-activity', 'steam-activity-close')
  useOverlayBack(true, onClose)

  const active = selectActive(tasks)
  const completed = selectCompleted(tasks)
  const downloads = [...active, ...completed]
  const failed = Object.entries(failures)

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
        contentClassName="steam-activity-content flex h-full flex-col gap-4 overflow-auto px-[18px] pb-7 pt-[22px] text-[#f4f6fb]"
      >
        <header className="steam-activity-header flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-white/10">
              <ArrowDownToLine size={17} aria-hidden />
            </span>
            <h2 className="m-0 text-[1.2rem] font-[650] tracking-[-0.02em]">Downloads</h2>
          </div>
          <Focusable
            focusId="steam-activity-close"
            group="steam-activity"
            order={0}
            noScale
            aria-label="Close downloads"
            className="steam-activity-close grid size-9 place-items-center rounded-full bg-white/10"
            onClick={onClose}
          >
            <X size={18} />
          </Focusable>
        </header>

        {status.data && !connected ? (
          <ConnectSteamCard />
        ) : (
          <>
            <section className="grid gap-2" aria-label="Active downloads">
              <h3 className={SECTION_TITLE}>
                Downloads{downloads.length > 0 ? ` (${active.length})` : ''}
              </h3>
              {downloads.length === 0 && failed.length === 0 && (
                <EmptyCard
                  icon={Download}
                  title="No downloads yet"
                  copy="Your active downloads will appear here."
                />
              )}
              {downloads.map((task, index) => {
                const appId = steamAppId(task.key)
                const running = task.progress?.phase !== 'Ready'
                const isQueued = appId !== null && queue.active?.appId === appId
                return (
                  <DownloadRow
                    key={task.key}
                    task={task}
                    appId={appId}
                    coverUrl={isQueued ? queue.active?.coverUrl : null}
                    rate={rate}
                    order={10 + index}
                    onPause={
                      isQueued && running ? () => void pauseActiveDownload() : undefined
                    }
                    onCancel={
                      isQueued && running
                        ? () => void removeQueuedDownload(appId)
                        : undefined
                    }
                    onDismiss={running ? undefined : () => clear(task.key)}
                  />
                )
              })}
              {failed.map(([key, failure], index) => {
                const appId = steamAppId(key)
                return (
                  <div key={key} className={ROW} role="alert">
                    <p className="m-0 min-w-0 flex-1 text-[12px] leading-[1.4] text-[#ffb4b4]">
                      {failure}
                    </p>
                    {appId && (
                      <Focusable
                        focusId={`steam-retry-${key}`}
                        group="steam-activity"
                        order={40 + index}
                        noScale
                        aria-label="Retry download"
                        className={ICON_BUTTON}
                        onClick={() => {
                          clear(key)
                          void enqueueSteamDownload(appId)
                        }}
                      >
                        <RotateCw size={14} />
                      </Focusable>
                    )}
                    <Focusable
                      focusId={`steam-dismiss-${key}`}
                      group="steam-activity"
                      order={40 + index}
                      noScale
                      aria-label="Dismiss"
                      className={ICON_BUTTON}
                      onClick={() => clear(key)}
                    >
                      <X size={14} />
                    </Focusable>
                  </div>
                )
              })}
            </section>

            <section className="grid gap-2" aria-label="Queue">
              <div className="flex items-center justify-between gap-2">
                <h3 className={SECTION_TITLE}>
                  Queue{queue.pending.length > 0 ? ` (${queue.pending.length})` : ''}
                </h3>
                {completed.length > 0 && (
                  <Focusable
                    focusId="steam-activity-clear-completed"
                    group="steam-activity"
                    order={60}
                    noScale
                    className="text-[12px] text-white/70 underline underline-offset-2"
                    onClick={clearCompleted}
                  >
                    Clear completed
                  </Focusable>
                )}
              </div>
              {queue.pending.length === 0 ? (
                <EmptyCard
                  icon={Layers}
                  title="Queue is empty"
                  copy="Games added to download will appear here in order."
                />
              ) : (
                queue.pending.map((item, index) => (
                  <QueueRow
                    key={item.appId}
                    item={item}
                    position={index + 1}
                    order={70 + index}
                    onStart={() => void startQueuedDownloadNow(item.appId)}
                    onRemove={() => void removeQueuedDownload(item.appId)}
                  />
                ))
              )}
            </section>

            <NetworkCard connected={connected} rate={rate} samples={samples} />
          </>
        )}
      </LiquidGlass>
    </div>
  )
}
