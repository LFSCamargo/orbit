import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { ControllerAction, ControllerFamily } from './ControllerMapping'
import { focusManager } from './FocusManager'
import { gamepadManager } from './GamepadManager'
import { backTarget, focusRestoreId, screenEntryFocusId } from '@/lib/navigation'
import { applyPageScroll } from '@/lib/pageScroll'
import { showOrbitWindow, isTauriRuntime } from '@/lib/tauri'
import { useThemeStore } from '@/stores/theme.store'
import { resolveLayout } from '@/themes/useThemeLayout'
import { useUiStore } from '@/stores/ui.store'

/**
 * Wires GamepadManager + FocusManager into app navigation.
 * Keyboard arrows/Enter/Escape mirror controller actions.
 */
export function useControllerNavigation() {
  const [family, setFamily] = useState<ControllerFamily>('generic')
  const screen = useUiStore((s) => s.screen)
  const setScreen = useUiStore((s) => s.setScreen)
  const selectedGameId = useUiStore((s) => s.selectedGameId)
  const markControllerActivity = useUiStore((s) => s.markControllerActivity)

  useEffect(() => {
    gamepadManager.start()
    setFamily(gamepadManager.getFamily())

    const unsubActivity = gamepadManager.onActivity(() => {
      markControllerActivity()
      setFamily(gamepadManager.getFamily())
    })

    const handleAction = (action: ControllerAction) => {
      setFamily(gamepadManager.getFamily())

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
          node?.element.click()
          break
        }
        case 'back': {
          if (useUiStore.getState().homeMenuOpen) {
            useUiStore.getState().closeHomeMenu()
            break
          }
          const { previousScreen } = useUiStore.getState()
          const { themeId, themes } = useThemeStore.getState()
          const theme = themes.find((item) => item.id === themeId) ?? themes[0]
          const layout = resolveLayout(theme)
          const target = backTarget(screen, previousScreen)
          setScreen(target)
          if (screen === 'game-details') {
            focusManager.restoreFocus(
              focusRestoreId(layout, target, selectedGameId),
            )
          }
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

    let unlistenStickScroll: (() => void) | undefined
    if (useNativeStickScroll) {
      void listen<{ deltaX: number; deltaY: number }>('controller-stick-scroll', (event) => {
        applyStickScroll(event.payload.deltaX, event.payload.deltaY)
      }).then((unlisten) => {
        unlistenStickScroll = unlisten
      })
    }

    let unlistenHome: (() => void) | undefined
    void listen<{ wasFocused: boolean }>('controller-home-pressed', (event) => {
      void handleHomePress(event.payload.wasFocused)
    }).then((unlisten) => {
      unlistenHome = unlisten
    })

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable

      const map: Record<string, ControllerAction> = {
        ArrowUp: 'navigate-up',
        ArrowDown: 'navigate-down',
        ArrowLeft: 'navigate-left',
        ArrowRight: 'navigate-right',
        Enter: 'confirm',
        ' ': 'confirm',
        Escape: 'back',
        Backspace: 'back',
        KeyF: 'secondary',
        KeyC: 'context',
        BracketLeft: 'section-prev',
        BracketRight: 'section-next',
        KeyM: 'menu',
      }

      const action = map[event.code] ?? map[event.key]
      if (!action) return

      const allowedWhileTyping: ControllerAction[] = [
        'section-prev',
        'section-next',
        'back',
        'menu',
        'home',
      ]

      if (typing && !allowedWhileTyping.includes(action)) return

      event.preventDefault()
      markControllerActivity()
      handleAction(action)
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      unsubPad()
      unsubScroll?.()
      unlistenStickScroll?.()
      unsubActivity()
      unlistenHome?.()
      window.removeEventListener('keydown', onKeyDown)
      gamepadManager.stop()
    }
  }, [screen, selectedGameId, setScreen, markControllerActivity])

  return { family }
}

const SECTION_ORDER = ['home', 'library', 'search', 'settings'] as const

const SCREEN_TRANSITION_MS = 380
let screenFocusTimer: ReturnType<typeof setTimeout> | null = null

async function handleHomePress(wasFocused: boolean) {
  const { homeMenuOpen, openHomeMenu, closeHomeMenu } = useUiStore.getState()

  if (!wasFocused) {
    await showOrbitWindow()
    if (homeMenuOpen) closeHomeMenu()
    return
  }

  if (homeMenuOpen) {
    closeHomeMenu()
    return
  }

  openHomeMenu()
}

function scheduleScreenFocus(screen: (typeof SECTION_ORDER)[number]) {
  if (screenFocusTimer !== null) {
    window.clearTimeout(screenFocusTimer)
  }

  const { themeId, themes } = useThemeStore.getState()
  const theme = themes.find((item) => item.id === themeId) ?? themes[0]
  const layout = resolveLayout(theme)
  const preferredId = screenEntryFocusId(layout, screen)

  screenFocusTimer = window.setTimeout(() => {
    screenFocusTimer = null
    focusManager.focusScreenEntry(preferredId)
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
