import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppShell } from '@/components/layout/AppShell'
import { HomeMenuModal } from '@/components/home/HomeMenuModal'
import { useControllerNavigation } from '@/controllers/useController'
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
import { useThemeLayout } from '@/themes/useThemeLayout'

const pageTransition = {
  initial: { opacity: 0, y: 18, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -12, filter: 'blur(4px)' },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
}

export function App() {
  const screen = useUiStore((s) => s.screen)
  const homeMenuOpen = useUiStore((s) => s.homeMenuOpen)
  const layout = useThemeLayout()
  const { family } = useControllerNavigation()
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const { data: activeSession } = useActiveSessionQuery()
  useFullscreen()
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
              initial={pageTransition.initial}
              animate={pageTransition.animate}
              exit={pageTransition.exit}
              transition={pageTransition.transition}
              className={
                layout === 'switch' || layout === 'ps5'
                  ? 'flex min-h-full flex-1 flex-col'
                  : undefined
              }
              data-screen={screen}
            >
              {screen === 'home' && <HomePage />}
              {screen === 'library' && <LibraryPage />}
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
