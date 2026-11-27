import { useState } from 'react'
import { Play, Square } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import {
  InstallLocationDialog,
  type InstallRequest,
} from '@/components/game/InstallLocationDialog'
import { useDownloadStore } from '@/lib/downloadProgress'
import { queuePosition, useDownloadQueue } from '@/hooks/useDownloadQueue'
import { detailsPrimaryAction } from '@/lib/libraryActions'
import { cancelGameLaunch } from '@/lib/tauri'
import { open } from '@/lib/dialog'
import { useUiStore } from '@/stores/ui.store'
import { notify } from '@/lib/toast'
import { useGameActions } from '@/hooks/useGames'
import { setEditableLaunchPath } from '@/lib/launchConfig'
import type { LibraryEntry } from '@/types/library'
import type { Game } from '@/types/game'

export function DetailsPrimaryAction({
  entry,
  game,
  running,
  sessionId,
  signedIn,
}: {
  entry: LibraryEntry
  game: Game
  running: boolean
  sessionId: string | null
  signedIn: boolean
}) {
  const { launch, playEntry, stop, update } = useGameActions()
  const setScreen = useUiStore((state) => state.setScreen)
  const setSettingsTab = useUiStore((state) => state.setSettingsTab)
  const [cancelling, setCancelling] = useState(false)
  const [installing, setInstalling] = useState<InstallRequest | null>(null)
  const tasks = useDownloadStore((state) => state.tasks)
  const queue = useDownloadQueue()
  const action = detailsPrimaryAction({
    entry,
    running,
    launching: launch.isPending || playEntry.isPending,
    cancelling,
    signedIn,
  })
  const downloadKey = entry.steamAppId ? `steam:${entry.steamAppId}` : null
  const task = downloadKey ? tasks[downloadKey] : undefined
  const waiting = queuePosition(queue, entry.steamAppId)
  const downloading =
    queue.active?.appId === entry.steamAppId ||
    Boolean(task && task.progress?.phase !== 'Ready')
  // Steam is writing this game's files: Install and Play wait for it. Progress
  // lives in the status panel beside the command bar and in a toast.
  const busy = downloading || waiting !== null
  const label = downloading
    ? 'Downloading…'
    : waiting
      ? `Queued · #${waiting}`
      : action.label
  const run = async () => {
    if (action.kind === 'cancel') {
      setCancelling(true)
      try {
        await cancelGameLaunch()
      } catch {
        notify.error({ title: 'Could not cancel the launch', message: 'Try again.' })
      } finally {
        setCancelling(false)
      }
      return
    }
    if (action.kind === 'stop' && sessionId) {
      stop.mutate(sessionId)
      return
    }
    if (action.kind === 'play' && action.gameId) {
      playEntry.mutate(entry)
      return
    }
    if (action.kind === 'install' && entry.steamAppId) {
      setInstalling({
        appId: entry.steamAppId,
        title: entry.game.title,
        native: entry.game.platform === 'macos',
      })
      return
    }
    if (action.kind === 'sign-in') {
      setSettingsTab('steam')
      setScreen('settings')
      return
    }
    if (action.kind === 'setup') {
      setSettingsTab('runtimes')
      setScreen('settings')
      return
    }
    if (action.kind === 'locate') {
      const picked = await open({
        title: 'Locate installation',
        filters: [{ name: 'Game', extensions: ['exe', 'app'] }],
      })
      if (!picked || Array.isArray(picked) || !action.gameId) return
      const next = setEditableLaunchPath(game.launchConfig, picked)
      await update.mutateAsync({ gameId: action.gameId, request: { launchConfig: next } })
    }
  }
  return (
    <div className="details-primary-actions contents">
      <Focusable
        focusId={running ? 'details-stop' : 'details-play'}
        group="details-actions"
        order={1}
        noScale
        disabled={stop.isPending || cancelling || (busy && !running)}
        onClick={() => void run()}
        className="details-play flex min-h-12 min-w-[180px] items-center justify-center gap-3 rounded-full bg-[linear-gradient(#fff,#e2ecfc)] px-[26px] text-[13px] font-[650] text-[#15253e] shadow-[0_2px_8px_#0001] hover:brightness-110 disabled:cursor-wait disabled:opacity-40 max-[520px]:px-[22px]"
      >
        {running ? (
          <Square size={17} fill="currentColor" />
        ) : (
          <Play size={17} fill="currentColor" />
        )}
        <span>{label}</span>
      </Focusable>
      <InstallLocationDialog game={installing} onClose={() => setInstalling(null)} />
    </div>
  )
}
