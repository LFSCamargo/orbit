import { useEffect } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AppShell } from '@/components/layout/AppShell'
import { HomeMenuModal } from '@/components/home/HomeMenuModal'
import { useControllerNavigation } from '@/controllers/useController'
import { AddGamePage } from '@/modules/imports/AddGamePage'
import { GameDetailsPage } from '@/modules/game-details/GameDetailsPage'
import { HomePage } from '@/modules/home/HomePage'
import { LibraryPage } from '@/modules/library/LibraryPage'
import { SearchPage } from '@/modules/search/SearchPage'
import { SettingsPage } from '@/modules/settings/SettingsPage'
import { SwitchLibraryPage } from '@/modules/switch-library/SwitchLibraryPage'
import { useCursorAutoHide } from '@/hooks/useCursorAutoHide'
import { useFullscreenSync } from '@/hooks/useFullscreen'
import { useActiveSessionQuery } from '@/hooks/useGames'
import { useSessionEvents } from '@/hooks/useSessionEvents'
import { useLaunchProgress } from '@/hooks/useLaunchProgress'
import { LaunchOverlay } from '@/modules/session/components/LaunchOverlay'
import { useSteamDownloadEvents } from '@/hooks/useSteamDownloadEvents'
import { useSteamClientEvents } from '@/hooks/useSteamClientEvents'
import { useSteamLibraryEvents } from '@/hooks/useSteamLibraryEvents'
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
  useFullscreenSync()
  useCursorAutoHide()
  useSessionEvents()
  useLaunchProgress()
  useSteamDownloadEvents()
  useSteamLibraryEvents()
  useSteamClientEvents()

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
              className={
                screen === 'settings'
                  ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
                  : 'transform-none'
              }
            >
              {screen === 'home' && <HomePage />}
              {screen === 'library' && <LibraryPage />}
              {screen === 'search' && <SearchPage />}
              {screen === 'game-details' && <GameDetailsPage />}
              {screen === 'add-game' && <AddGamePage />}
              {screen === 'settings' && <SettingsPage />}
              {screen === 'switch-library' && <SwitchLibraryPage />}
            </motion.div>
          </AnimatePresence>
        </AppShell>
      </div>
      <HomeMenuModal family={family} />
      {!activeSession && <LaunchOverlay />}
    </>
  )
}
