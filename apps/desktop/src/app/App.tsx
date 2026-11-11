import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AppShell } from '@/components/layout/AppShell'
import { HomeMenuModal } from '@/components/home/HomeMenuModal'
import { useControllerNavigation } from '@/controllers/useController'
import { GameHubLibraryPage } from '@/modules/gamehub/GameHubLibraryPage'
import { useGameHubBackground } from '@/hooks/useGameHubBackground'
import { AddGamePage } from '@/modules/imports/AddGamePage'
import { GameDetailsPage } from '@/modules/game-details/GameDetailsPage'
import { GameEditPage } from '@/modules/game-details/GameEditPage'
import { HomePage } from '@/modules/home/HomePage'
import { LibraryPage } from '@/modules/library/LibraryPage'
import { SearchPage } from '@/modules/search/SearchPage'
import { SettingsPage } from '@/modules/settings/SettingsPage'
import { SwitchLibraryPage } from '@/modules/switch-library/SwitchLibraryPage'
import { useCursorAutoHide } from '@/hooks/useCursorAutoHide'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useActiveSessionQuery } from '@/hooks/useGames'
import { useSessionEvents } from '@/hooks/useSessionEvents'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'

const pageTransition = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }

export function App() {
  const reduceMotion = useReducedMotion()
  const screen = useUiStore((s) => s.screen)
  const homeMenuOpen = useUiStore((s) => s.homeMenuOpen)
  const { family } = useControllerNavigation()
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const { data: activeSession } = useActiveSessionQuery()
  useFullscreen()
  useGameHubBackground()
  useCursorAutoHide()
  useSessionEvents()

  useEffect(() => {
    setActiveSession(activeSession ?? null)
  }, [activeSession, setActiveSession])

  return (
    <>
      <div
        className={homeMenuOpen ? 'pointer-events-none select-none' : undefined}
        aria-hidden={homeMenuOpen}
      >
        <AppShell family={family}>
          <AnimatePresence mode="wait">
            <motion.div
              key={screen}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.12 } }}
              transition={reduceMotion ? { duration: 0 } : pageTransition}
              data-screen={screen}
            >
              {screen === 'home' && <HomePage />}
              {screen === 'library' && <LibraryPage />}
              {screen === 'gamehub-library' && <GameHubLibraryPage />}
              {screen === 'search' && <SearchPage />}
              {screen === 'game-details' && <GameDetailsPage />}
              {screen === 'game-edit' && <GameEditPage />}
              {screen === 'add-game' && <AddGamePage />}
              {screen === 'settings' && <SettingsPage />}
              {screen === 'switch-library' && <SwitchLibraryPage />}
            </motion.div>
          </AnimatePresence>
        </AppShell>
      </div>
      <HomeMenuModal family={family} />
    </>
  )
}
