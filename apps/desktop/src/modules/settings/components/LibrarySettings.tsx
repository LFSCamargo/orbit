import { useState } from 'react'
import { ChevronRight, Layers, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions } from '@/hooks/useGames'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'
import {
  DANGER_BUTTON,
  LIBRARY_CARD,
  LIBRARY_CARD_DESC,
  LIBRARY_CARD_TITLE,
} from './libraryStyles'

/** Opens the Switch content view for titles already in the library. */
export function SwitchContentCard() {
  const setScreen = useUiStore((s) => s.setScreen)
  return (
    <Focusable
      focusId="imports-switch-library"
      group="settings-library"
      order={20}
      noScale
      onClick={() => setScreen('switch-library')}
      className={`${LIBRARY_CARD} !flex items-center gap-4 text-left transition-colors hover:bg-white/[0.06]`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white/[0.07] text-orbit-accent">
        <Layers size={19} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <h3 className={LIBRARY_CARD_TITLE}>Switch content</h3>
        <p className={LIBRARY_CARD_DESC}>
          See base games, updates and DLC for Switch titles in your library.
        </p>
      </span>
      <ChevronRight size={18} className="shrink-0 text-orbit-muted" aria-hidden />
    </Focusable>
  )
}

export function LibrarySettings() {
  const setScreen = useUiStore((s) => s.setScreen)
  const setSelectedGameId = useUiStore((s) => s.setSelectedGameId)
  const setHeroGameId = useUiStore((s) => s.setHeroGameId)
  const [confirmClear, setConfirmClear] = useState(false)
  const { clear } = useGameActions()
  const activeSession = useSessionStore((s) => s.activeSession)

  return (
    <>
      <section
        aria-labelledby="settings-clear-library-title"
        className={`${LIBRARY_CARD} !flex flex-wrap items-center justify-between gap-4 border-rose-400/15`}
      >
        <div className="min-w-0 flex-1">
          <h3 id="settings-clear-library-title" className={LIBRARY_CARD_TITLE}>
            Clear library
          </h3>
          <p className={LIBRARY_CARD_DESC}>
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
          className={DANGER_BUTTON}
        >
          <Trash2 size={14} aria-hidden />
          {activeSession ? 'Stop game first' : 'Clear library'}
        </Focusable>
      </section>

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
