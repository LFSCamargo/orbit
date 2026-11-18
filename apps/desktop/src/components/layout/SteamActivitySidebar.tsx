import { motion, useReducedMotion, type Transition } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, Download, Layers, RotateCw, X } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useDownloadQueue } from '@/hooks/useDownloadQueue'
import { useModalFocus } from '@/hooks/useModalFocus'
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
import { useTransferRate } from './downloads/useTransferRate'

const HOST_STYLE = {
  position: 'fixed' as const,
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(440px, 100vw)',
  zIndex: 80,
}

const EASE = [0.22, 1, 0.36, 1] as const

/** Header, sections and network card cascade in after the sheet arrives. */
function Reveal({
  index,
  still,
  children,
  as = 'div',
  ...rest
}: {
  index: number
  still: boolean
  children: ReactNode
  as?: 'div' | 'section'
  className?: string
  'aria-label'?: string
}) {
  const Tag = as === 'section' ? motion.section : motion.div
  return (
    <Tag
      initial={still ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: still ? 0 : 0.1 + index * 0.06, ease: EASE }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/** `steam:<appid>` for game downloads; Steam setup and components have none. */
function steamAppId(key: string): string | null {
  const match = /^steam:(\d+)$/.exec(key)
  return match ? match[1] : null
}

/** Right-edge downloads panel: a floating liquid glass sheet that springs in
 * over a blur overlay (which fades and blurs in, and closes it on click),
 * with its sections cascading in. The host is fixed so glass layout cannot
 * pull it inline; exits play through the drawer host's AnimatePresence. */
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
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const played = useQuery({
    queryKey: ['library', 'played-not-installed'],
    queryFn: () => listLibraryEntries({ view: 'all', limit: 500 }),
    select: (page) => playedNotInstalled(page.entries),
  })
  const queuedIds = new Set(
    [queue.active?.appId, ...queue.pending.map((item) => item.appId)].filter(Boolean),
  )
  const still = useReducedMotion() ?? false
  const sheet: Transition = still
    ? { duration: 0.15 }
    : { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 }

  return (
    <>
      {/* Blur overlay: the app behind fades and blurs out of focus. It animates
          a variable both backdrop-filter spellings read (older WebKit needs
          the -webkit- one). */}
      <motion.div
        data-testid="steam-activity-scrim"
        aria-hidden="true"
        className="steam-activity-scrim fixed inset-0 z-[79] bg-[rgb(6_5_9/0.3)] [-webkit-backdrop-filter:blur(var(--scrim-blur))] [backdrop-filter:blur(var(--scrim-blur))]"
        style={{ '--scrim-blur': '0px' } as CSSProperties}
        initial={{ opacity: 0, '--scrim-blur': '0px' } as never}
        animate={{ opacity: 1, '--scrim-blur': still ? '0px' : '14px' } as never}
        exit={{ opacity: 0, '--scrim-blur': '0px' } as never}
        transition={{ duration: still ? 0.15 : 0.4, ease: EASE }}
        onClick={onClose}
      />
      <motion.div
        data-testid="steam-activity-host"
        className="steam-activity-host steam-activity-sheet flex p-3"
        style={HOST_STYLE}
        initial={still ? { opacity: 0 } : { x: '105%' }}
        animate={still ? { opacity: 1 } : { x: 0 }}
        exit={still ? { opacity: 0 } : { x: '105%' }}
        transition={sheet}
      >
        <LiquidGlass
          surface="panel"
          radius={28}
          role="dialog"
          aria-label="Downloads"
          className="steam-activity-drawer size-full bg-[rgb(22_18_26/0.3)] shadow-[inset_0_1px_0_rgb(255_255_255/0.3),inset_1px_0_0_rgb(255_255_255/0.2),inset_0_18px_32px_-22px_rgb(255_255_255/0.22),inset_0_-20px_34px_-24px_rgb(0_0_0/0.45),-24px_0_70px_rgb(0_0_0/0.5)]"
          contentClassName="steam-activity-content flex h-full flex-col gap-4 overflow-auto px-[18px] pb-7 pt-[22px] text-[#f4f6fb]"
        >
          <Reveal index={0} still={still}>
            <header className="steam-activity-header flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-white/10">
                  <ArrowDownToLine size={17} aria-hidden />
                </span>
                <h2 className="m-0 text-[1.2rem] font-[650] tracking-[-0.02em]">
                  Downloads
                </h2>
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
          </Reveal>

          {status.data && !connected ? (
            <Reveal index={1} still={still}>
              <ConnectSteamCard />
            </Reveal>
          ) : (
            <>
              <Reveal index={1} still={still}>
                <NetworkCard connected={connected} rate={rate} samples={samples} />
              </Reveal>

              <Reveal
                as="section"
                index={2}
                still={still}
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
              </Reveal>

              <Reveal
                as="section"
                index={3}
                still={still}
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
                      order={70 + index}
                      onStart={() => void startQueuedDownloadNow(item.appId)}
                      onRemove={() => void removeQueuedDownload(item.appId)}
                    />
                  ))
                )}
              </Reveal>

              {played.data && played.data.length > 0 && (
                <Reveal
                  as="section"
                  index={4}
                  still={still}
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
                        onInstall={
                          appId ? () => void enqueueSteamDownload(appId) : undefined
                        }
                        onOpen={() => {
                          onClose()
                          openGameDetails(entry.id)
                        }}
                      />
                    )
                  })}
                </Reveal>
              )}
            </>
          )}
        </LiquidGlass>
      </motion.div>
    </>
  )
}
