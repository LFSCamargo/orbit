import { useState } from 'react'
import type { Game } from '@/types/game'
import { useGameActions } from '@/hooks/useGames'
import { WineProfileEditor } from '@/components/runtime/WineProfileEditor'
import { Focusable } from '@/components/focus/Focusable'
import {
  getEditableLaunchPath,
  hasEditableLaunchPath,
  launchPathFieldLabel,
  setEditableLaunchPath,
} from '@/lib/launchConfig'
import { RuntimeDiagnostics } from './RuntimeDiagnostics'

/** An explicit editor draft: query refreshes never replace user input. */
export function GameSettingsPanel({ game }: { game: Game }) {
  const [baseline, setBaseline] = useState(game.launchConfig)
  const [draft, setDraft] = useState(game.launchConfig)
  const [message, setMessage] = useState('')
  const { update } = useGameActions()
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
  const save = async () => {
    setMessage('')
    try {
      await update.mutateAsync({ gameId: game.id, request: { launchConfig: draft } })
      setBaseline(draft)
      setMessage('Settings saved. Applies on the next launch.')
    } catch {
      setMessage('Could not save settings. Your changes have been kept; try again.')
    }
  }
  return (
    <section className="orbit-panel rounded-theme p-6" aria-label="Game settings">
      <h2 className="mb-6 text-2xl font-semibold">Launch settings</h2>
      {hasEditableLaunchPath(draft) && (
        <label className="mb-6 block text-sm text-orbit-muted">
          {launchPathFieldLabel(draft)}
          <input
            className="mt-2 min-h-[44px] w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
            value={getEditableLaunchPath(draft) ?? ''}
            onChange={(event) =>
              setDraft(setEditableLaunchPath(draft, event.target.value))
            }
          />
        </label>
      )}
      {draft.type === 'wine' ? (
        <WineProfileEditor
          value={draft.profile}
          onChange={(profile) => setDraft({ type: 'wine', profile })}
        />
      ) : (
        <p className="text-orbit-muted">
          This game uses its provider’s launch configuration.
        </p>
      )}
      <div className="orbit-editor-actions mt-6 flex flex-wrap gap-3 py-4">
        <Focusable
          focusId="game-settings-discard"
          group="game-settings"
          order={0}
          disabled={!dirty || update.isPending}
          onClick={() => {
            setDraft(baseline)
            setMessage('')
          }}
          className="orbit-glass-control rounded-xl px-4 py-3 disabled:cursor-wait disabled:opacity-40"
        >
          Discard changes
        </Focusable>
        <Focusable
          focusId="game-settings-save"
          group="game-settings"
          order={1}
          disabled={!dirty || update.isPending}
          onClick={() => void save()}
          className="rounded-xl bg-orbit-accent px-4 py-3 font-semibold text-orbit-canvas disabled:cursor-wait disabled:opacity-40"
        >
          {update.isPending ? 'Saving…' : 'Save settings'}
        </Focusable>
      </div>
      {message && (
        <p role={update.isError ? 'alert' : 'status'} className="mt-3">
          {message}
        </p>
      )}
      {draft.type === 'wine' && <RuntimeDiagnostics gameId={game.id} />}
    </section>
  )
}
