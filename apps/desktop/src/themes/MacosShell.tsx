import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { requestFullscreen } from '@/hooks/useFullscreen'
import { clsx } from 'clsx'
import { motion, useReducedMotion } from 'framer-motion'
import {
  House,
  Library,
  Search,
  Settings,
  Plus,
  ChevronLeft,
  Maximize2,
  Minimize2,
  ArrowDownToLine,
} from 'lucide-react'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { glyphFor } from '@/controllers/ControllerGlyphs'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { SteamActivitySidebar } from '@/components/layout/SteamActivitySidebar'
import { useDrawer } from '@/components/layout/DrawerProvider'
import { useDownloadStore } from '@/lib/downloadProgress'
import { useSteamActivityStore } from '@/stores/steam-activity.store'
import { useUiStore } from '@/stores/ui.store'
import { resolveNavScreen, backTarget, focusRestoreId } from '@/lib/navigation'
import { focusManager } from '@/controllers/FocusManager'
import { glassTint } from '@/lib/backdropLighting'
import { useBackdropTransition } from '@/hooks/useBackdropTransition'
import { useHomeHero } from '@/modules/home/hooks/useHomeHero'
import { ShellBackdrop } from './ShellBackdrop'
import { useActiveTheme } from '@/hooks/useActiveTheme'
import { useLibrary } from '@/hooks/useLibrary'
import { isBrandedTheme } from '@/themes/catalog'
import { OrbitMark, ThemeBrand } from '@/themes/ThemeBrand'

const items = [
  { id: 'home', label: 'Play', icon: House },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

const kbdClass = clsx(
  'grid h-[19px] min-w-[19px] place-items-center rounded-full border border-[#ffffff30]',
  '[font:inherit] text-white',
)

const toolClass = clsx(
  'macos-tool',
  'relative grid size-11 place-items-center rounded-full text-[#ffffffe0] hover:bg-[#ffffff15]',
  'min-[1600px]:size-[50px]',
  'max-[520px]:h-10 max-[520px]:w-9',
)

export function MacosShell({
  children,
  family,
}: {
  children: ReactNode
  family: ControllerFamily
}) {
  const screen = useUiStore((s) => s.screen)
  const previous = useUiStore((s) => s.previousScreen)
  const navigate = useUiStore((s) => s.setScreen)
  const addGame = useUiStore((s) => s.openAddGame)
  const downloadsOpen = useSteamActivityStore((state) => state.open)
  const setDownloadsOpen = useSteamActivityStore((state) => state.setOpen)
  const toggleDownloads = useSteamActivityStore((state) => state.toggle)
  const transfers = useDownloadStore((state) => state.tasks)
  const transferCount = Object.values(transfers).filter(
    (task) => task.progress?.phase !== 'Ready',
  ).length
  const { openDrawer, closeDrawer } = useDrawer()
  const downloadsOwned = useRef(false)
  const fullscreen = useUiStore((s) => s.fullscreen)
  const selected = resolveNavScreen(screen)
  const reduce = useReducedMotion()
  const theme = useActiveTheme()
  const branded = isBrandedTheme(theme)
  const library = useLibrary({ view: 'all', sort: 'recently-played' })
  const entries = useMemo(
    () => library.data?.pages.flatMap((page) => page.entries) ?? [],
    [library.data],
  )
  const homeHeroEntry = useHomeHero(entries)
  const heroGame = screen === 'home' ? homeHeroEntry?.game : undefined
  const backdrop = useBackdropTransition(heroGame, theme.branding?.wallpaper)
  const paintedImage = backdrop.active ?? (reduce ? null : backdrop.outgoing)
  const glassStyle = paintedImage
    ? ({ '--glass-backdrop-tint': glassTint(paintedImage.lighting) } as CSSProperties)
    : undefined
  const pendingFocus = useRef<{ screen: string; id: string } | null>(null)
  useEffect(() => {
    if (!downloadsOpen) {
      if (downloadsOwned.current) {
        downloadsOwned.current = false
        closeDrawer()
      }
      return
    }
    downloadsOwned.current = true
    openDrawer(<SteamActivitySidebar onClose={() => setDownloadsOpen(false)} />)
  }, [closeDrawer, downloadsOpen, openDrawer, setDownloadsOpen])
  useEffect(() => {
    const pending = pendingFocus.current
    if (!pending || pending.screen !== screen) return
    let frame = 0
    let attempts = 0
    // Route exit animations finish before the destination's focusables register.
    const restore = () => {
      focusManager.setFocus(pending.id)
      if (focusManager.getFocusedId() === pending.id || ++attempts >= 90) {
        pendingFocus.current = null
      } else frame = requestAnimationFrame(restore)
    }
    frame = requestAnimationFrame(restore)
    return () => {
      cancelAnimationFrame(frame)
      if (pendingFocus.current === pending) pendingFocus.current = null
    }
  }, [screen])
  return (
    <div
      className={clsx(
        'macos-shell group/shell',
        'relative isolate flex h-dvh flex-col overflow-hidden bg-orbit-canvas font-console text-orbit-foreground',
        'max-[520px]:[--console-gutter:14px]',
        'data-[details-artwork=true]:before:pointer-events-none data-[details-artwork=true]:before:absolute data-[details-artwork=true]:before:inset-0 data-[details-artwork=true]:before:-z-[1] data-[details-artwork=true]:before:bg-cover data-[details-artwork=true]:before:content-[""] data-[details-artwork=true]:before:[background-position:center_32%]',
        'data-[details-artwork=true]:before:bg-[linear-gradient(90deg,rgb(var(--orbit-canvas)/0.94),rgb(var(--orbit-canvas)/0.61)_50%,rgb(var(--orbit-canvas)/0.15)),linear-gradient(0deg,rgb(var(--orbit-canvas)/0.98),rgb(var(--orbit-canvas)/0.87)_20%,rgb(var(--orbit-canvas)/0.2)_80%),var(--macos-details-image)]',
        '[&_[data-glass-mode]]:transition-[background-color] [&_[data-glass-mode]]:duration-[360ms] [&_[data-glass-mode]]:ease-[ease]',
        '[&_.orbit-route]:min-h-0 [&_.orbit-route]:px-[var(--console-gutter)] [&_.orbit-route]:pb-16 [&_.orbit-route]:pt-6',
        'motion-reduce:[&_*]:!animate-none motion-reduce:[&_*]:!scroll-auto motion-reduce:[&_*]:!transition-none motion-reduce:[&_*]:before:!animate-none motion-reduce:[&_*]:before:!transition-none motion-reduce:[&_*]:after:!animate-none motion-reduce:[&_*]:after:!transition-none',
        '[@media(prefers-reduced-transparency:reduce)]:[&_.macos-panel]:bg-orbit-panel [@media(prefers-reduced-transparency:reduce)]:[&_.macos-panel]:backdrop-blur-none [@media(prefers-reduced-transparency:reduce)]:[&_.orbit-panel]:bg-orbit-panel [@media(prefers-reduced-transparency:reduce)]:[&_.orbit-panel]:backdrop-blur-none',
      )}
      data-macos-shell
      data-console-home={screen === 'home'}
      data-fullscreen={fullscreen}
      data-wallpaper={Boolean(theme.branding?.wallpaper)}
      style={glassStyle}
    >
      <div
        className={clsx(
          'macos-wallpaper',
          'absolute inset-0 -z-[2] overflow-hidden',
          'bg-[radial-gradient(ellipse_at_85%_20%,rgb(var(--orbit-accent)/0.22),transparent_70%),linear-gradient(135deg,rgb(var(--orbit-surface)),rgb(var(--orbit-canvas)))]',
        )}
        aria-hidden
      >
        <span
          className={clsx(
            'absolute -bottom-[60%] -left-[20%] -right-[20%] top-[45%] animate-macos-drift rounded-full bg-[linear-gradient(135deg,rgb(var(--orbit-accent)/0.27),rgb(var(--orbit-focus)/0.13),transparent)] blur-[40px]',
            paintedImage && '[animation-play-state:paused]',
          )}
        />
        <span
          className={clsx(
            'absolute -bottom-[80%] -left-[30%] -right-[30%] top-[70%] animate-macos-drift rounded-full bg-[linear-gradient(135deg,rgb(var(--orbit-accent)/0.27),rgb(var(--orbit-focus)/0.13),transparent)] blur-[40px] [animation-delay:-12s]',
            paintedImage && '[animation-play-state:paused]',
          )}
        />
      </div>
      <ShellBackdrop backdrop={backdrop} reducedMotion={Boolean(reduce)} />
      <header
        className={clsx(
          'macos-console-header',
          'pointer-events-none relative z-[4] grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-6 bg-transparent px-[var(--console-gutter)] pb-4 pt-7',
          '[&>*]:pointer-events-auto',
          'group-data-[fullscreen=false]/shell:pt-[38px]',
          'max-[900px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[900px]:gap-3.5 max-[900px]:!pt-5',
          'max-[520px]:gap-2',
          '[@media(max-height:740px)_and_(min-width:900px)]:!pt-[18px]',
        )}
      >
        <div
          className={clsx(
            'macos-brand',
            'flex min-w-0 max-w-full items-center gap-3 text-[27px] font-[650] leading-none tracking-[-0.05em] text-white',
            'max-[900px]:col-start-1 max-[900px]:min-w-min',
            '[&_.theme-brand]:min-w-0 [&_.theme-brand]:max-w-full [&_img]:max-w-full [&_img]:object-left',
          )}
        >
          <ThemeBrand branding={theme.branding} />
        </div>
        <LiquidGlass
          surface="toolbar"
          className={clsx(
            'macos-navigation',
            'min-w-0 max-w-full max-[900px]:col-start-2 max-[900px]:justify-self-center max-[520px]:justify-self-start',
          )}
          radius={999}
        >
          <nav
            aria-label="Main navigation"
            className="flex max-w-full justify-center gap-1 p-[5px]"
          >
            {items.map(({ id, label, icon: Icon }, index) => (
              <Focusable
                key={id}
                focusId={`macos-nav-${id}`}
                group="macos-nav"
                order={index}
                noScale
                aria-current={selected === id ? 'page' : undefined}
                onClick={() => navigate(id)}
                className={clsx(
                  'macos-nav-link',
                  'isolate flex min-h-11 items-center justify-center gap-[9px] whitespace-nowrap rounded-full px-5 text-[13px] font-[550] text-[#ffffffeb] hover:text-white aria-[current=page]:text-white',
                  'min-[1600px]:min-h-[50px] min-[1600px]:px-6 min-[1600px]:text-[15px]',
                  'max-[900px]:gap-0 max-[900px]:px-[13px]',
                  'max-[520px]:min-h-10 max-[520px]:!px-[9px]',
                )}
                aria-label={label}
              >
                {selected === id && (
                  <motion.span
                    layoutId="macos-selection"
                    className={clsx(
                      'macos-selection',
                      'absolute inset-0 -z-[1] rounded-[inherit] bg-[linear-gradient(#ffffff24,#ffffff15)] shadow-selection',
                    )}
                    transition={{ duration: reduce ? 0 : 0.25 }}
                  />
                )}
                <Icon size={18} />
                <span className="max-[900px]:hidden">{label}</span>
              </Focusable>
            ))}
          </nav>
        </LiquidGlass>
        <LiquidGlass
          surface="toolbar"
          className={clsx(
            'macos-utilities',
            'flex shrink-0 gap-0.5 justify-self-end p-[5px] max-[900px]:col-start-3 max-[520px]:gap-0',
          )}
          radius={999}
        >
          <Focusable
            focusId="macos-toolbar-downloads"
            group="macos-tools"
            order={0}
            noScale
            onClick={toggleDownloads}
            aria-label="Downloads"
            className={toolClass}
          >
            <ArrowDownToLine size={18} />
            {transferCount > 0 && (
              <span
                className="steam-activity-dot absolute right-2 top-2 size-2 rounded-full bg-[#7dffb3]"
                aria-hidden
              />
            )}
          </Focusable>
          <Focusable
            focusId="macos-toolbar-add"
            group="macos-tools"
            order={1}
            noScale
            onClick={addGame}
            aria-label="Add games"
            className={toolClass}
          >
            <Plus size={20} />
          </Focusable>
          <Focusable
            focusId="macos-window-fullscreen"
            group="macos-tools"
            order={2}
            noScale
            onClick={() => requestFullscreen(!fullscreen)}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className={toolClass}
          >
            {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </Focusable>
        </LiquidGlass>
      </header>
      <main
        className={clsx(
          'macos-main',
          'min-h-0 min-w-0 flex-1 overscroll-contain scroll-smooth',
          screen === 'settings'
            ? 'flex flex-col overflow-hidden [&>[data-screen]]:flex [&>[data-screen]]:min-h-0 [&>[data-screen]]:flex-1 [&>[data-screen]]:flex-col [&>[data-screen]]:overflow-hidden'
            : 'overflow-auto [&>[data-screen]]:min-h-full',
        )}
      >
        {!items.some((item) => item.id === screen) && (
          <div
            className={clsx(
              'macos-route-back',
              'relative z-[1] px-[var(--console-gutter)] pt-3',
            )}
          >
            <Focusable
              focusId="macos-back"
              group="macos-back"
              order={0}
              noScale
              onClick={() => {
                const target = backTarget(screen, previous)
                if (screen === 'game-details') {
                  const id = focusRestoreId(target, useUiStore.getState().selectedGameId)
                  if (id) pendingFocus.current = { screen: target, id }
                }
                navigate(target)
              }}
              className={clsx(
                'macos-back',
                'flex items-center gap-[5px] py-2 text-[13px] text-[#ffffff99]',
              )}
            >
              <ChevronLeft size={18} />
              Back
            </Focusable>
          </div>
        )}
        {children}
      </main>
      <footer
        className={clsx(
          'macos-console-footer',
          'relative z-[2] flex shrink-0 items-center justify-between gap-5 bg-transparent px-[var(--console-gutter)] pb-[22px] pt-4 text-[10px] text-[#ffffff70]',
          'max-[520px]:justify-end',
          '[@media(max-height:740px)_and_(min-width:900px)]:py-2.5',
          '[&>.theme-orbit-mark]:absolute [&>.theme-orbit-mark]:left-1/2 [&>.theme-orbit-mark]:-translate-x-1/2',
        )}
      >
        <span className="max-[520px]:hidden">
          {theme.branding?.tagline ?? 'Your collection. Your escape.'}
        </span>
        {branded && <OrbitMark />}
        <span className="flex items-center gap-2">
          <kbd className={kbdClass}>{glyphFor(family, 'confirm')}</kbd> Select{' '}
          <kbd className={kbdClass}>{glyphFor(family, 'back')}</kbd> Back{' '}
          <span
            className={clsx(
              'macos-section-hint',
              'ml-[15px] text-[#ffffff55] max-[900px]:hidden',
            )}
          >
            LB / RB · Sections
          </span>
        </span>
      </footer>
    </div>
  )
}
