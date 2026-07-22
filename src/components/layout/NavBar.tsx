import { clsx } from 'clsx'
import type { AppScreen } from '@/types/game'
import { Focusable } from '@/components/focus/Focusable'
import { resolveNavScreen } from '@/lib/navigation'
import { useUiStore } from '@/stores/ui.store'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { useThemeLayout } from '@/themes/useThemeLayout'

const NAV_ITEMS: Array<{ id: AppScreen; label: string }> = [
  { id: 'home', label: 'Home' },
  { id: 'library', label: 'Library' },
  { id: 'search', label: 'Search' },
  { id: 'settings', label: 'Settings' },
]

export function NavBar({ family }: { family: ControllerFamily }) {
  const screen = useUiStore((s) => s.screen)
  const setScreen = useUiStore((s) => s.setScreen)
  const layout = useThemeLayout()
  const navScreen = resolveNavScreen(screen)

  return (
    <header className="app-navbar pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-10 py-4">
      <div className="nav-surface pointer-events-auto flex items-center gap-6 overflow-visible rounded-2xl bg-black/35 px-4 py-3 backdrop-blur-panel ring-1 ring-white/10">
        <div className="nav-brand font-display text-xl font-semibold tracking-[0.18em] text-white">
          {layout === 'ps5' ? 'Games' : 'ORBIT'}
        </div>
        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map((item, index) => (
            <Focusable
              key={item.id}
              focusId={`nav-${item.id}`}
              group="nav"
              order={index}
              noScale
              noRing
              onClick={() => setScreen(item.id)}
              className={clsx(
                'rounded-xl px-3.5 py-2 text-sm font-medium transition-colors',
                navScreen === item.id
                  ? 'bg-white/15 text-white'
                  : 'text-white/65 hover:text-white',
              )}
            >
              {item.label}
            </Focusable>
          ))}
        </nav>
      </div>

      <div className="nav-hints pointer-events-none hidden items-center gap-3 overflow-visible rounded-2xl bg-black/30 px-4 py-2 text-xs text-white/70 backdrop-blur-panel ring-1 ring-white/10 md:flex">
        <Hint glyph={glyphFor(family, 'confirm')} label="Select" />
        <Hint glyph={glyphFor(family, 'back')} label="Back" />
        <Hint glyph={glyphFor(family, 'secondary')} label="Edit" />
        <Hint glyph={glyphFor(family, 'context')} label="Add" />
        <Hint glyph={glyphFor(family, 'section-next')} label="Section" />
        <Hint glyph={glyphFor(family, 'menu')} label="Menu" />
      </div>
    </header>
  )
}

function Hint({ glyph, label }: { glyph: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="rounded-md bg-white/10 px-1.5 py-0.5 font-medium text-white">
        {glyph}
      </kbd>
      {label}
    </span>
  )
}
