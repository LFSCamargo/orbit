import { useState } from 'react'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions } from '@/hooks/useGames'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'

export function LibrarySettings() {
  const setScreen = useUiStore((s) => s.setScreen)
  const setSelectedGameId = useUiStore((s) => s.setSelectedGameId)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  const [confirmClear, setConfirmClear] = useState(false)
  const { clear } = useGameActions()
  const activeSession = useSessionStore((s) => s.activeSession)

  return (
    <>
      <div className="flex items-center justify-between gap-6">
        <div>
          <h2 className="font-display text-xl font-semibold">Clear library</h2>
          <p className="mt-1 text-sm text-orbit-muted">
            Remove every game and Orbit play record. Game files stay untouched.
          </p>
        </div>
        <Focusable
          focusId="settings-clear-library"
          group="settings"
          order={29}
          noScale
          disabled={Boolean(activeSession)}
          onClick={() => setConfirmClear(true)}
          className="orbit-glass-control bg-rose-500/12 rounded-card px-4 py-2 text-sm font-semibold text-rose-300 disabled:opacity-40"
        >
          {activeSession ? 'Stop game first' : 'Clear'}
        </Focusable>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear your entire library?"
        description="All games, play sessions, and property overrides will be removed from Orbit. Installed game files are never deleted."
        confirmLabel="Clear library"
        busy={clear.isPending}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          void clear.mutateAsync().then(() => {
            setConfirmClear(false)
            setSelectedGameId(null)
            setHeroGameId(null)
            setScreen('home')
          })
        }}
      />
    </>
  )
}
