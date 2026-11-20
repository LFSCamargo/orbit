import { Check, Play, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions } from '@/hooks/useGames'
import { isUnsavedCloudEntry } from '@/lib/playLibraryEntry'
import { notify } from '@/lib/toast'
import type { LibraryEntry } from '@/types/library'
import { useRemoveXcloudGame, useSaveXcloudGame } from '../hooks/useXcloud'

const BUTTON =
  'orbit-glass-control inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold disabled:opacity-50'

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** Play and Add to library for a cloud title. Saved titles show In library
 * and can be removed; they then return to the Game Pass catalog. */
export function CloudGameActions({
  entry,
  focusPrefix,
  group,
  order,
  size = 'card',
}: {
  entry: LibraryEntry
  focusPrefix: string
  group: string
  order: number
  size?: 'card' | 'details'
}) {
  const { playEntry } = useGameActions()
  const save = useSaveXcloudGame()
  const remove = useRemoveXcloudGame()
  const unsaved = isUnsavedCloudEntry(entry)
  const busy = playEntry.isPending || save.isPending || remove.isPending
  const big = size === 'details'

  const play = () =>
    playEntry.mutate(entry, {
      onSuccess: () =>
        notify.success({
          title: 'Starting in Orbit',
          message: unsaved
            ? `${entry.game.title} is now in your library.`
            : entry.game.title,
        }),
    })
  const toggle = () => {
    if (unsaved && entry.game.sourceId) {
      save.mutate(entry.game.sourceId, {
        onSuccess: () =>
          notify.success({ title: 'Added to your library', message: entry.game.title }),
        onError: (error) =>
          notify.error({ title: 'Could not add the game', message: errorText(error) }),
      })
    } else {
      remove.mutate(entry.id, {
        onError: (error) =>
          notify.error({ title: 'Could not remove the game', message: errorText(error) }),
      })
    }
  }

  return (
    <div className={clsx('flex gap-2', big && 'max-w-md')}>
      {!big && (
        <Focusable
          focusId={`${focusPrefix}-play`}
          group={group}
          order={order}
          noScale
          disabled={busy}
          aria-label={`Play ${entry.game.title}`}
          onClick={play}
          className={clsx(BUTTON, 'bg-orbit-accent text-orbit-canvas')}
        >
          <Play size={14} fill="currentColor" />
          {playEntry.isPending ? 'Opening…' : 'Play'}
        </Focusable>
      )}
      <Focusable
        focusId={`${focusPrefix}-save`}
        group={group}
        order={order + 1}
        noScale
        disabled={busy}
        aria-label={
          unsaved
            ? `Add ${entry.game.title} to library`
            : `Remove ${entry.game.title} from library`
        }
        onClick={toggle}
        className={clsx(BUTTON, 'bg-white/10', big && 'min-h-12 px-5 text-sm')}
      >
        {unsaved ? <Plus size={14} /> : <Check size={14} />}
        {unsaved ? 'Add to library' : 'In library'}
      </Focusable>
    </div>
  )
}
