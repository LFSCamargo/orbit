import { useMemo, type ReactNode } from 'react'
import { clsx } from 'clsx'
import {
  BatteryMedium,
  Home,
  LayoutGrid,
  Minus,
  Plus,
  Search,
  Settings,
  Tablet,
  User,
  Wifi,
} from 'lucide-react'
import type { AppScreen } from '@/types/game'
import { Focusable } from '@/components/focus/Focusable'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { resolveNavScreen } from '@/lib/navigation'
import { useUiStore } from '@/stores/ui.store'

const NAV_ITEMS: Array<{
  id: AppScreen
  icon: typeof Home
  tint: string
  activeTint: string
}> = [
  { id: 'home', icon: Home, tint: 'text-[#ff4d6d]', activeTint: 'text-[#ff4d6d]' },
  { id: 'library', icon: LayoutGrid, tint: 'text-[#ffb340]', activeTint: 'text-[#ffb340]' },
  { id: 'search', icon: Search, tint: 'text-[#5ac8fa]', activeTint: 'text-[var(--switch-cyan)]' },
  { id: 'settings', icon: Settings, tint: 'text-[var(--switch-muted)]', activeTint: 'text-[var(--switch-ink)]' },
]

export function SwitchShell({
  children,
  family,
}: {
  children: ReactNode
  family: ControllerFamily
}) {
  const screen = useUiStore((s) => s.screen)
  const setScreen = useUiStore((s) => s.setScreen)
  const navScreen = resolveNavScreen(screen)
  const isHome = screen === 'home'

  const now = useMemo(
    () =>
      new Date().toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    [],
  )

  const confirmGlyph = glyphFor(family, 'confirm')

  return (
    <div className="switch-shell flex h-dvh max-h-dvh flex-col overflow-hidden font-body">
      <header
        className={clsx(
          'switch-topbar z-20 shrink-0 bg-[var(--switch-bg)] px-8 py-4',
          !isHome && 'border-b border-[var(--switch-border)]',
        )}
      >
        <div className="flex items-center justify-between">
          <Focusable
            focusId="switch-profile"
            group="switch-top"
            order={0}
            noScale
            onClick={() => setScreen('settings')}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--switch-surface)] text-[var(--switch-ink)] transition-colors hover:bg-[var(--switch-surface-hover)]"
          >
            <User className="h-5 w-5" strokeWidth={2.2} />
          </Focusable>

          <div className="flex items-center gap-3 text-sm font-medium text-[var(--switch-ink)]">
            <span>{now}</span>
            <Wifi className="h-4 w-4 stroke-[var(--switch-muted)]" strokeWidth={2.2} aria-hidden />
            <BatteryMedium className="h-4 w-4 stroke-[var(--switch-muted)]" strokeWidth={2.2} aria-hidden />
          </div>
        </div>
      </header>

      <main className="switch-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col">{children}</div>
      </main>

      <footer
        className={clsx(
          'switch-footer z-20 shrink-0 bg-[var(--switch-bg)] px-8 pb-4 pt-2',
          !isHome && 'border-t border-[var(--switch-border)]',
        )}
      >
        <nav className="flex items-center justify-center gap-5 py-3">
          {NAV_ITEMS.map((item, index) => {
            const Icon = item.icon
            const active = navScreen === item.id
            return (
              <Focusable
                key={item.id}
                focusId={`switch-nav-${item.id}`}
                group="switch-nav"
                order={index}
                noScale
                onClick={() => setScreen(item.id)}
                className={clsx(
                  'switch-nav flex h-[52px] w-[52px] items-center justify-center rounded-full border-[2.5px] bg-[var(--switch-surface)] transition-all duration-200',
                  active
                    ? 'border-[var(--switch-cyan)]'
                    : 'border-[var(--switch-border)] hover:border-[var(--switch-muted)]',
                )}
                aria-label={item.id}
              >
                <Icon
                  className={clsx('h-6 w-6', active ? item.activeTint : item.tint)}
                  strokeWidth={2}
                />
              </Focusable>
            )
          })}
        </nav>

        <div className="flex items-center justify-between border-t border-[var(--switch-border)] pt-3 text-xs text-[var(--switch-muted)]">
          <Tablet className="h-4 w-4" strokeWidth={2} aria-hidden />
          <div className="flex items-center gap-5">
            <span className="inline-flex items-center gap-1.5">
              <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span>/</span>
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span>Options</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--switch-cyan)] text-[10px] font-bold text-[#ffffff]">
                {confirmGlyph}
              </span>
              Start
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
