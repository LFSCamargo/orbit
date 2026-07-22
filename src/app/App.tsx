import { AnimatePresence, motion } from 'framer-motion'
import { AppShell } from '@/components/layout/AppShell'
import { useControllerNavigation } from '@/controllers/useController'
import { AddGamePage } from '@/features/imports/AddGamePage'
import { GameDetailsPage } from '@/features/game-details/GameDetailsPage'
import { GameEditPage } from '@/features/game-details/GameEditPage'
import { HomePage } from '@/features/home/HomePage'
import { LibraryPage } from '@/features/library/LibraryPage'
import { SearchPage } from '@/features/search/SearchPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { useCursorAutoHide } from '@/hooks/useCursorAutoHide'
import { useFullscreen } from '@/hooks/useFullscreen'
import { useSessionEvents } from '@/hooks/useSessionEvents'
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
  const layout = useThemeLayout()
  const { family } = useControllerNavigation()
  useFullscreen()
  useCursorAutoHide()
  useSessionEvents()

  return (
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
        </motion.div>
      </AnimatePresence>
    </AppShell>
  )
}
