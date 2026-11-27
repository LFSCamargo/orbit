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
import { useDownloadToasts } from '@/hooks/useDownloadToasts'
import { useCompressionEvents } from '@/hooks/useCompressionEvents'
import { useLaunchToasts } from '@/hooks/useLaunchToasts'
import { OrbitToaster } from '@/components/feedback/OrbitToaster'
import { XcloudPlayer } from '@/modules/xcloud-player/XcloudPlayer'
import { useSteamClientEvents } from '@/hooks/useSteamClientEvents'
import { useSteamLibraryEvents } from '@/hooks/useSteamLibraryEvents'
import { useSessionStore } from '@/stores/session.store'
import { useUiStore } from '@/stores/ui.store'
import { useXcloudPlayerStore } from '@/stores/xcloudPlayer.store'
import { OnboardingFlow } from '@/modules/onboarding/OnboardingFlow'
import { useOnboardingVisible } from '@/modules/onboarding/lib/onboardingVisibility'
import { useSplashActive } from './splash/useSplashHold'
import { appLayerHidden } from './appLayer'
import { useRuntimeAutoUpdate } from './startup/useRuntimeAutoUpdate'
import { useStartupScan } from './startup/useStartupScan'
import { useSteamStartupSync } from './startup/useSteamStartupSync'

const pageTransition = { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const }

export function App({ onMounted }: { onMounted?: () => void } = {}) {
  const reduceMotion = useReducedMotion()
  const screen = useUiStore((s) => s.screen)
  const homeMenuOpen = useUiStore((s) => s.homeMenuOpen)
  const onboarding = useOnboardingVisible()
  const splashUp = useSplashActive()
  const streaming = useXcloudPlayerStore((s) => s.stream !== null && !s.paused)
  const { family } = useControllerNavigation()
  const setActiveSession = useSessionStore((s) => s.setActiveSession)
  const { data: activeSession } = useActiveSessionQuery()
  useFullscreenSync()
  useCursorAutoHide()
  useSessionEvents()
  useLaunchProgress()
  useSteamDownloadEvents()
  useDownloadToasts()
  useCompressionEvents()
  useLaunchToasts()
  useSteamLibraryEvents()
  useSteamClientEvents()
  useStartupScan()
  useSteamStartupSync()
  useRuntimeAutoUpdate()

  // On a first run, onboarding (in #root) rises above the splash, which stays
  // behind it, blurred, until onboarding finishes (index.html).
  const overSplash = onboarding && splashUp
  useEffect(() => {
    document.documentElement.classList.toggle('orbit-splash-under-onboarding', overSplash)
  }, [overSplash])

  // Screens below take their own splash holds as they mount, first.
  useEffect(() => onMounted?.(), [onMounted])

  useEffect(() => {
    setActiveSession(activeSession ?? null)
  }, [activeSession, setActiveSession])

  return (
    <>
      {/* Onboarding and the Home menu float over Orbit: the app stays visible
          behind them but cannot be reached until they close. */}
      <div
        data-app-layer
        className={
          homeMenuOpen || onboarding ? 'pointer-events-none select-none' : undefined
        }
        // On a first run onboarding sits over the splash; Home appears only
        // when the splash opens it. A playing cloud stream covers it too.
        style={
          appLayerHidden({ overSplash, streaming }) ? { visibility: 'hidden' } : undefined
        }
        aria-hidden={homeMenuOpen || onboarding}
        inert={onboarding}
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
      {onboarding && <OnboardingFlow />}
      <HomeMenuModal family={family} />
      <LaunchOverlay />
      <OrbitToaster />
      <XcloudPlayer />
    </>
  )
}
