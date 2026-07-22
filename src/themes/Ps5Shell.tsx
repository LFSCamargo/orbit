import { useMemo, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { Search, Settings } from 'lucide-react'
import type { AppScreen } from '@/types/game'
import { Focusable } from '@/components/focus/Focusable'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { useUiStore } from '@/stores/ui.store'

import { resolveNavScreen } from '@/lib/navigation'

const NAV_ITEMS: Array<{ id: AppScreen; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'library', label: 'Library' },
  { id: 'settings', label: 'Settings' },
]

export function Ps5Shell({
  children,
  family,
}: {
  children: ReactNode
  family: ControllerFamily
}) {
  const screen = useUiStore((s) => s.screen)
  const setScreen = useUiStore((s) => s.setScreen)
  const navScreen = resolveNavScreen(screen)

  const now = useMemo(
    () =>
      new Date().toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    [],
  )

  const confirmGlyph = glyphFor(family, 'confirm')
  const backGlyph = glyphFor(family, 'back')

  return (
    <div className="ps5-shell flex h-dvh max-h-dvh flex-col overflow-hidden font-body text-[var(--ps5-ink)]">
      <header className="ps5-topbar z-20 shrink-0 border-b border-[var(--ps5-border)] bg-[var(--ps5-bg)] px-8 py-4">
        <div className="flex items-center justify-between gap-6">
          <nav className="flex min-w-0 flex-wrap items-center gap-8">
            {NAV_ITEMS.map((item, index) => {
              const active = navScreen === item.id
              return (
                <Focusable
                  key={item.id}
                  focusId={`ps5-nav-${item.id}`}
                  group="ps5-nav"
                  order={index}
                  noScale
                  noRing
                  onClick={() => setScreen(item.id)}
                  className={clsx(
                    'ps5-nav rounded-lg px-3 py-1.5 text-lg transition-colors',
                    active
                      ? 'font-semibold text-[var(--ps5-ink)]'
                      : 'font-normal text-[var(--ps5-muted)]/50 hover:text-[var(--ps5-muted)]',
                  )}
                >
                  {item.label}
                </Focusable>
              )
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3 text-sm text-[var(--ps5-muted)]">
            <Focusable
              focusId="ps5-search"
              group="ps5-top"
              order={0}
              noScale
              onClick={() => setScreen('search')}
              className="rounded-full p-2 transition-colors hover:bg-white/10"
            >
              <Search className="h-5 w-5" />
            </Focusable>
            <Focusable
              focusId="ps5-settings"
              group="ps5-top"
              order={1}
              noScale
              onClick={() => setScreen('settings')}
              className="rounded-full p-2 transition-colors hover:bg-white/10"
            >
              <Settings className="h-5 w-5" />
            </Focusable>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm text-[var(--ps5-ink)]">
              L
            </div>
            <span>{now}</span>
          </div>
        </div>
      </header>

      <main className="ps5-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-[var(--ps5-bg)]">
        <div className="flex min-h-full flex-col">{children}</div>
      </main>

      <footer className="ps5-footer z-20 shrink-0 border-t border-[var(--ps5-border)] bg-[var(--ps5-bg)] px-8 py-3">
        <div className="flex items-center justify-between text-xs text-[var(--ps5-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[10px] font-bold text-[var(--ps5-ink)]">
              {backGlyph}
            </span>
            Back
          </span>
          <div className="hidden items-center gap-4 md:flex">
            <Hint glyph={glyphFor(family, 'secondary')} label="Options" />
            <Hint glyph={glyphFor(family, 'menu')} label="Menu" />
          </div>
          <span className="inline-flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black">
              {confirmGlyph}
            </span>
            Confirm
          </span>
        </div>
      </footer>
    </div>
  )
}

function Hint({ glyph, label }: { glyph: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-medium text-[var(--ps5-ink)]">
        {glyph}
      </kbd>
      {label}
    </span>
  )
}
