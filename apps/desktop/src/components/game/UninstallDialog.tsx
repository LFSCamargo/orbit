import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { formatBytes } from '@/lib/format'
import { uninstallMsStoreGame, uninstallSteamGame } from '@/lib/tauri'
import { notify } from '@/lib/toast'
import type { UninstallReport } from '@/types/downloads'

/** Queries that show install state or disk usage. */
const INSTALL_STATE_KEYS = [
  'library',
  'library-entry',
  'games',
  'steam-windows-library',
  'msstore-catalog',
  'storage-overview',
]

export function uninstallSummary(title: string, report: UninstallReport): string {
  const freed =
    report.removedBytes > 0 ? ` and freed ${formatBytes(report.removedBytes)}` : ''
  const kept = report.keptPrefix
    ? ' Saves were kept because this game’s folder holds a Steam sign-in.'
    : ''
  return `Uninstalled ${title}${freed}.${kept}`
}

/**
 * Confirms uninstalling a Windows Steam game. Game files always go; saves
 * and settings (the game's Wine prefix) only when the person opts in.
 */
export function UninstallDialog({
  game,
  onClose,
}: {
  game: {
    appId: string
    title: string
    sizeBytes: number | null
    provider?: 'steam' | 'ms-store'
  } | null
  onClose: () => void
}) {
  const client = useQueryClient()
  const [deleteSaves, setDeleteSaves] = useState(false)
  useEffect(() => setDeleteSaves(false), [game?.appId])
  const uninstall = useMutation({
    mutationFn: (target: {
      appId: string
      title: string
      deleteSaves: boolean
      provider?: 'steam' | 'ms-store'
    }) =>
      target.provider === 'ms-store'
        ? uninstallMsStoreGame(target.appId, target.deleteSaves)
        : uninstallSteamGame(target.appId, target.deleteSaves),
    onSuccess: (report, target) => {
      for (const key of INSTALL_STATE_KEYS)
        void client.invalidateQueries({ queryKey: [key] })
      onClose()
      const content = {
        title: 'Uninstalled',
        message: uninstallSummary(target.title, report),
      }
      if (report.keptPrefix) notify.warning(content)
      else notify.success(content)
    },
    onError: (error, target) => {
      onClose()
      notify.error({
        title: `Could not uninstall ${target.title}`,
        message: error instanceof Error ? error.message : String(error),
      })
    },
  })
  const size = game?.sizeBytes ? ` (${formatBytes(game.sizeBytes)})` : ''
  return (
    <ConfirmDialog
      open={game !== null}
      title={`Uninstall ${game?.title ?? ''}?`}
      description={`This deletes the game's files from this Mac${size}, including copies in a Steam library folder. The game stays in your library and you can download it again any time.`}
      confirmLabel="Uninstall"
      busyLabel="Uninstalling…"
      busy={uninstall.isPending}
      onCancel={onClose}
      onConfirm={() => {
        if (game)
          uninstall.mutate({
            appId: game.appId,
            title: game.title,
            deleteSaves,
            provider: game.provider,
          })
      }}
    >
      <Focusable
        focusId="confirm-delete-saves"
        group="confirm-dialog"
        order={0}
        noScale
        role="switch"
        aria-checked={deleteSaves}
        disabled={uninstall.isPending}
        onClick={() => setDeleteSaves((value) => !value)}
        className="mt-5 flex w-full items-center justify-between gap-4 rounded-card bg-white/[0.06] px-4 py-3 text-left"
      >
        <span className="grid gap-0.5">
          <span className="text-sm font-semibold">Also delete saves & settings</span>
          <span className="text-xs text-orbit-muted">
            Local saves not synced to Steam Cloud are lost.
          </span>
        </span>
        <span
          aria-hidden
          className={clsx(
            'relative h-5 w-9 shrink-0 rounded-full transition-colors',
            deleteSaves ? 'bg-orbit-accent' : 'bg-white/20',
          )}
        >
          <span
            className={clsx(
              'absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform',
              deleteSaves && 'translate-x-4',
            )}
          />
        </span>
      </Focusable>
    </ConfirmDialog>
  )
}
