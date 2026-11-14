import { useState } from 'react'
import { Play, Square } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { DownloadProgress } from '@/components/ui/download-progress'
import { useDownloadStore } from '@/lib/downloadProgress'
import { detailsPrimaryAction } from '@/lib/libraryActions'
import { cancelGameLaunch, downloadSteamWindowsGame } from '@/lib/tauri'
import { open } from '@/lib/dialog'
import { useUiStore } from '@/stores/ui.store'
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
  const { launch, stop, update } = useGameActions()
  const setScreen = useUiStore((state) => state.setScreen)
  const setSettingsTab = useUiStore((state) => state.setSettingsTab)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const start = useDownloadStore((state) => state.start)
  const finish = useDownloadStore((state) => state.finish)
  const fail = useDownloadStore((state) => state.fail)
  const tasks = useDownloadStore((state) => state.tasks)
  const action = detailsPrimaryAction({
    entry,
    running,
    launching: launch.isPending,
    cancelling,
    signedIn,
  })
  const task = entry.steamAppId ? tasks[`steam:${entry.steamAppId}`] : undefined
  const run = async () => {
    setError(null)
    if (action.kind === 'cancel') {
      setCancelling(true)
      try {
        await cancelGameLaunch()
      } catch {
        setError('Could not cancel launch. Try again.')
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
      launch.mutate(action.gameId)
      return
    }
    if (action.kind === 'install' && entry.steamAppId) {
      const key = `steam:${entry.steamAppId}`
      start({ key, label: entry.game.title })
      try {
        await downloadSteamWindowsGame(entry.steamAppId)
        finish(key)
      } catch (err) {
        const text = err instanceof Error ? err.message : String(err)
        fail(key, text)
        setError(text)
      }
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
        disabled={stop.isPending || cancelling}
        onClick={() => void run()}
        className="details-play flex min-h-12 min-w-[180px] items-center justify-center gap-3 rounded-full bg-[linear-gradient(#fff,#e2ecfc)] px-[26px] text-[13px] font-[650] text-[#15253e] shadow-[0_2px_8px_#0001] hover:brightness-110 disabled:cursor-wait disabled:opacity-40 max-[520px]:px-[22px]"
      >
        {running ? (
          <Square size={17} fill="currentColor" />
        ) : (
          <Play size={17} fill="currentColor" />
        )}
        <span>{action.label}</span>
      </Focusable>
      {task && <DownloadProgress task={task} />}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
