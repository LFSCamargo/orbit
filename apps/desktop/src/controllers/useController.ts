import { keyboardControllerAction } from './keyboard'
import { useEffect, useState } from 'react'
import { splashActive } from '@/app/splash/splash'
import { listen } from '@tauri-apps/api/event'
import type { ControllerAction, ControllerFamily } from './ControllerMapping'
import { focusManager } from './FocusManager'
import { gamepadManager } from './GamepadManager'
import { backTarget, focusRestoreId, screenEntryFocusId } from '@/lib/navigation'
import { applyPageScroll } from '@/lib/pageScroll'
import { showOrbitWindow, isTauriRuntime } from '@/lib/tauri'
import { useUiStore } from '@/stores/ui.store'
import {
  onboardingAllows,
  onboardingVisible,
} from '@/modules/onboarding/lib/onboardingVisibility'
import { closeTopOverlay } from './overlayStack'
import { leaveTextField } from './leaveTextField'
import { useXcloudPlayerStore } from '@/stores/xcloudPlayer.store'
import { useNavigationInput } from './useNavigationInput'
import type { AppScreen } from '@/types/game'

/**
 * Wires GamepadManager + FocusManager into app navigation.
 * Keyboard arrows/Enter/Escape mirror controller actions.
 *
 * Mounted once: actions read the current screen from the store, so screen
 * changes do not tear down the poller and its native listeners, and controller
 * input re-renders nothing unless the pad family changes.
 */
export function useControllerNavigation() {
  useNavigationInput()
  const [family, setFamily] = useState<ControllerFamily>('generic')

  useEffect(() => {
    const { markControllerActivity, setScreen } = useUiStore.getState()
    gamepadManager.start()
    setFamily(gamepadManager.getFamily())

    const unsubConnection = gamepadManager.onConnectionChange(() =>
      setFamily(gamepadManager.getFamily()),
    )
    const unsubActivity = gamepadManager.onActivity(markControllerActivity)

    const handleAction = (action: ControllerAction) => {
      const { screen, selectedGameId } = useUiStore.getState()
      // A visible cloud game owns the controller (Home still opens Orbit's
      // menu); a paused one leaves Orbit fully usable.
      const cloud = useXcloudPlayerStore.getState()
      if (cloud.stream && !cloud.paused && action !== 'home') return
      // Orbit is still starting behind the splash: presses there would land
      // on a screen that is still moving into place. Onboarding, shown over
      // the splash on a first run, takes input.
      if (splashActive() && !onboardingVisible()) return
      // A portaled Select owns directional input until it closes.
      const menu = document.querySelector('[role="listbox"]')
      const menuKeys: Partial<Record<ControllerAction, string>> = {
        'navigate-up': 'ArrowUp',
        'navigate-down': 'ArrowDown',
        confirm: 'Enter',
        back: 'Escape',
      }
      if (
        menu &&
        document.activeElement instanceof HTMLElement &&
        menu.contains(document.activeElement)
      ) {
        const key = menuKeys[action]
        if (key)
          document.activeElement.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
          )
        return
      }
      if (action !== 'section-prev' && action !== 'section-next' && action !== 'menu') {
        cancelScreenFocus()
      }

      // Onboarding covers the app: B only steps back inside it (its overlay
      // entry), and nothing switches the screen hidden behind it.
      const onboarding = onboardingVisible()
      if (onboarding && !onboardingAllows(action)) return

      const homeMenuOpen = useUiStore.getState().homeMenuOpen
      if (homeMenuOpen) {
        const allowed: ControllerAction[] = [
          'navigate-up',
          'navigate-down',
          'navigate-left',
          'navigate-right',
          'confirm',
          'back',
          'home',
        ]
        if (!allowed.includes(action)) return
      }

      if (screen === 'settings') {
        const focused = focusManager.getFocusedNode()
        if (action === 'navigate-left' && focused?.element.closest('.settings-content')) {
          focusManager.setFocus(`settings-tab-${useUiStore.getState().settingsTab}`)
          return
        }
        if (action === 'navigate-right' && focused?.group === 'settings-nav') {
          const controls = document.querySelectorAll<HTMLElement>(
            '.settings-content [data-focus-id]',
          )
          const first = Array.from(controls).find(
            (element) =>
              !element.matches(':disabled') && element.getClientRects().length > 0,
          )
          if (first?.dataset.focusId) focusManager.setFocus(first.dataset.focusId)
          return
        }
      }

      switch (action) {
        case 'navigate-up':
          focusManager.move('up')
          break
        case 'navigate-down':
          focusManager.move('down')
          break
        case 'navigate-left':
          focusManager.move('left')
          break
        case 'navigate-right':
          focusManager.move('right')
          break
        case 'confirm': {
          const node = focusManager.getFocusedNode()
          if (node?.element.getAttribute('role') === 'combobox') {
            node.element.dispatchEvent(
              new KeyboardEvent('keydown', {
                key: 'Enter',
                bubbles: true,
                cancelable: true,
              }),
            )
          } else if (node?.element.matches('input, textarea, select'))
            node.element.focus()
          else node?.element.click()
          break
        }
        case 'back': {
          // B unwinds one step at a time: leave typing, then the newest
          // drawer, dialog or modal, then the screen.
          if (leaveTextField()) break
          if (closeTopOverlay()) break
          if (onboarding) break
          if (useUiStore.getState().homeMenuOpen) {
            useUiStore.getState().closeHomeMenu()
            break
          }
          const { previousScreen } = useUiStore.getState()
          const target = backTarget(screen, previousScreen)
          setScreen(target)
          scheduleScreenFocus(
            target,
            screen === 'game-details'
              ? focusRestoreId(target, selectedGameId)
              : screenEntryFocusId(target),
          )
          break
        }
        case 'menu': {
          const next = screen === 'settings' ? 'home' : 'settings'
          setScreen(next)
          scheduleScreenFocus(next)
          break
        }
        case 'home':
          // macOS uses the native GameController handler instead of the browser API.
          if (!isTauriRuntime() || import.meta.env.TAURI_ENV_PLATFORM !== 'macos') {
            void handleHomePress(document.hasFocus())
          }
          break
        case 'section-prev':
          cycleSection(-1)
          break
        case 'section-next':
          cycleSection(1)
          break
        case 'secondary': {
          if (selectedGameId) {
            useUiStore.getState().openGameEdit(selectedGameId)
          }
          break
        }
        case 'context': {
          if (screen === 'game-details' || screen === 'home' || screen === 'library') {
            useUiStore.getState().openAddGame()
          }
          break
        }
      }
    }

    const unsubPad = gamepadManager.subscribe(handleAction)

    const applyStickScroll = (deltaX: number, deltaY: number) => {
      const cloud = useXcloudPlayerStore.getState()
      if (cloud.stream && !cloud.paused) return
      markControllerActivity()
      applyPageScroll(deltaX, deltaY)
    }

    const useNativeStickScroll =
      isTauriRuntime() && import.meta.env.TAURI_ENV_PLATFORM === 'macos'

    const unsubScroll = useNativeStickScroll
      ? undefined
      : gamepadManager.onScroll(({ deltaX, deltaY }) => {
          applyStickScroll(deltaX, deltaY)
        })

    // A listener that resolves after cleanup is removed at once, not leaked.
    let active = true
    const unlisteners: Array<() => void> = []
    const keep = (unlisten: () => void) => {
      if (active) unlisteners.push(unlisten)
      else unlisten()
    }
    if (useNativeStickScroll) {
      void listen<{ deltaX: number; deltaY: number }>(
        'controller-stick-scroll',
        (event) => {
          applyStickScroll(event.payload.deltaX, event.payload.deltaY)
        },
      ).then(keep)
    }

    void listen<{ wasFocused: boolean }>('controller-home-pressed', (event) => {
      markControllerActivity()
      void handleHomePress(event.payload.wasFocused)
    }).then(keep)

    const onKeyDown = (event: KeyboardEvent) => {
      const action = keyboardControllerAction(event)
      if (!action) return

      event.preventDefault()
      markControllerActivity()
      handleAction(action)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      active = false
      unsubPad()
      unsubScroll?.()
      unsubConnection()
      unsubActivity()
      for (const unlisten of unlisteners) unlisten()
      window.removeEventListener('keydown', onKeyDown)
      gamepadManager.stop()
    }
  }, [])

  return { family }
}

const SECTION_ORDER = ['home', 'library', 'search', 'settings'] as const

const SCREEN_TRANSITION_MS = 380
let screenFocusTimer: ReturnType<typeof setTimeout> | null = null

/** A Home press seen twice this soon (native listener and in-page pad) is one. */
const HOME_REPEAT_MS = 600

export async function handleHomePress(wasFocused: boolean) {
  const { homeMenuOpen, homeMenuOpenedAt, openHomeMenu, closeHomeMenu } =
    useUiStore.getState()

  if (!wasFocused) {
    await showOrbitWindow()
    if (homeMenuOpen) closeHomeMenu()
    return
  }
  // The Home menu would open behind onboarding.
  if (onboardingVisible()) return

  if (homeMenuOpen) {
    if (Date.now() - homeMenuOpenedAt < HOME_REPEAT_MS) return
    closeHomeMenu()
    return
  }

  openHomeMenu()
}

function cancelScreenFocus() {
  if (screenFocusTimer !== null) {
    window.clearTimeout(screenFocusTimer)
    screenFocusTimer = null
  }
  window.removeEventListener('pointerdown', cancelScreenFocus, true)
}

function scheduleScreenFocus(
  screen: AppScreen,
  preferredId = screenEntryFocusId(screen),
) {
  cancelScreenFocus()
  // Explicit pointer/controller input wins over delayed route-entry focus.
  window.addEventListener('pointerdown', cancelScreenFocus, { capture: true, once: true })
  screenFocusTimer = window.setTimeout(() => {
    cancelScreenFocus()
    const state = useUiStore.getState()
    if (state.screen === screen && !state.homeMenuOpen) {
      focusManager.focusScreenEntry(preferredId)
    }
  }, SCREEN_TRANSITION_MS)
}

function cycleSection(delta: number) {
  const { screen, setScreen } = useUiStore.getState()
  const index = SECTION_ORDER.indexOf(screen as (typeof SECTION_ORDER)[number])
  if (index < 0) {
    setScreen('home')
    scheduleScreenFocus('home')
    return
  }
  const next = (index + delta + SECTION_ORDER.length) % SECTION_ORDER.length
  const nextScreen = SECTION_ORDER[next]
  setScreen(nextScreen)
  scheduleScreenFocus(nextScreen)
}
