import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, Download, Layers, RotateCw, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { Drawer, DrawerReveal } from '@/components/ui/drawer'
import { useDownloadQueue } from '@/hooks/useDownloadQueue'
import { useNetworkStats } from '@/hooks/useNetworkStats'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { useUiStore } from '@/stores/ui.store'
import { selectActive, selectCompleted, useDownloadStore } from '@/lib/downloadProgress'
import {
  listLibraryEntries,
  enqueueSteamDownload,
  pauseActiveDownload,
  removeQueuedDownload,
  startQueuedDownloadNow,
} from '@/lib/tauri'
import { ConnectSteamCard } from './downloads/ConnectSteamCard'
import { DownloadRow } from './downloads/DownloadRow'
import { EmptyCard } from './downloads/EmptyCard'
import { NetworkCard } from './downloads/NetworkCard'
import { PlayedRow } from './downloads/PlayedRow'
import { playedNotInstalled } from './downloads/playedNotInstalled'
import { SectionHeading } from './downloads/SectionHeading'
import { QueueRow } from './downloads/QueueRow'
import { ICON_BUTTON, ROW } from './downloads/styles'

/** `steam:<appid>` for game downloads; Steam setup and components have none. */
function steamAppId(key: string): string | null {
  const match = /^steam:(\d+)$/.exec(key)
  return match ? match[1] : null
}

/** The downloads panel: Orbit's drawer (components/ui/drawer.tsx) from the
 * right, with its sections cascading in. */
export function SteamActivitySidebar({ onClose }: { onClose: () => void }) {
  const { status } = useSteamWindows()
  const connected = status.data?.sessionReady === true
  const queue = useDownloadQueue()
  const tasks = useDownloadStore((state) => state.tasks)
  const failures = useDownloadStore((state) => state.failures)
  const clear = useDownloadStore((state) => state.clear)
  const clearCompleted = useDownloadStore((state) => state.clearCompleted)
  const network = useNetworkStats()

  const active = selectActive(tasks)
  const completed = selectCompleted(tasks)
  const downloads = [...active, ...completed]
  const failed = Object.entries(failures)
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const played = useQuery({
    queryKey: ['library', 'played-not-installed'],
    queryFn: () => listLibraryEntries({ view: 'all', limit: 500 }),
    select: (page) => playedNotInstalled(page.entries),
  })
  const queuedIds = new Set(
    [queue.active?.appId, ...queue.pending.map((item) => item.appId)].filter(Boolean),
  )

  return (
    <Drawer
      id="steam-activity"
      title="Downloads"
      icon={<ArrowDownToLine size={17} aria-hidden />}
      closeLabel="Close downloads"
      onClose={onClose}
    >
      {status.data && !connected ? (
        <DrawerReveal index={1}>
          <ConnectSteamCard />
        </DrawerReveal>
      ) : (
        <>
          <DrawerReveal index={1}>
            <NetworkCard stats={network.stats} samples={network.samples} />
          </DrawerReveal>

          <DrawerReveal
            as="section"
            index={2}

            className="grid gap-2"
            aria-label="Active downloads"
          >
            <SectionHeading
              title="Downloads"
              count={downloads.length > 0 ? active.length : undefined}
              description="Games and components installing now."
            />
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
          </DrawerReveal>

          <DrawerReveal
            as="section"
            index={3}

            className="grid gap-2"
            aria-label="Queue"
          >
            <SectionHeading
              title="Queue"
              count={queue.pending.length}
              description="Up next, in order. Start one now or take it out."
              action={
                completed.length > 0 && (
                  <Focusable
                    focusId="steam-activity-clear-completed"
                    group="steam-activity"
                    order={60}
                    noScale
                    className="shrink-0 text-[12px] text-white/70 underline underline-offset-2"
                    onClick={clearCompleted}
                  >
                    Clear completed
                  </Focusable>
                )
              }
            />
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
                  waitingForNetwork={queue.waitingForNetwork === true}
                  order={70 + index}
                  onStart={() => void startQueuedDownloadNow(item.appId)}
                  onRemove={() => void removeQueuedDownload(item.appId)}
                />
              ))
            )}
          </DrawerReveal>

          {played.data && played.data.length > 0 && (
            <DrawerReveal
              as="section"
              index={4}

              className="grid gap-2"
              aria-label="Played, not installed"
            >
              <SectionHeading
                title="Played, not installed"
                description="Your most played games that aren’t on this Mac."
              />
              {played.data.map((entry, index) => {
                const appId = entry.steamAppId
                return (
                  <PlayedRow
                    key={entry.id}
                    entry={entry}
                    order={90 + index}
                    queued={appId !== null && queuedIds.has(appId)}
                    onInstall={appId ? () => void enqueueSteamDownload(appId) : undefined}
                    onOpen={() => {
                      onClose()
                      openGameDetails(entry.id)
                    }}
                  />
                )
              })}
            </DrawerReveal>
          )}
        </>
      )}
    </Drawer>
  )
}
