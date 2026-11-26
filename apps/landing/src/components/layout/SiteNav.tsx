'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type RefObject,
  type SVGProps,
} from 'react'
import { createPortal } from 'react-dom'
import { AppleIcon } from '@/components/download/AppleIcon'
import { buttonClass } from '@/components/ui/button'
import {
  BoltIcon,
  BookIcon,
  ChevronDownIcon,
  CloseIcon,
  DownloadIcon,
  ExternalIcon,
  GitHubIcon,
  GridIcon,
  HelpIcon,
  LayersIcon,
  MenuIcon,
  NewspaperIcon,
  PaletteIcon,
  PlayIcon,
  SparklesIcon,
} from '@/components/ui/icons'
import {
  NAV_GROUPS,
  groupIsActive,
  type NavGroup,
  type NavIconName,
} from '@/lib/navigation'
import { GITHUB_URL } from '@/lib/site'
import { cn } from '@/lib/utils'

const ICONS: Record<NavIconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  play: PlayIcon,
  grid: GridIcon,
  layers: LayersIcon,
  palette: PaletteIcon,
  sparkles: SparklesIcon,
  bolt: BoltIcon,
  book: BookIcon,
  download: DownloadIcon,
  help: HelpIcon,
  newspaper: NewspaperIcon,
}

const TRIGGER =
  'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orbit-focus'

const CLOSE_DELAY_MS = 140

function NewBadge() {
  return (
    <span className="rounded-full border border-orange-400/60 bg-orange-500/15 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-orange-200">
      New
    </span>
  )
}

function GroupItems({ group, onNavigate }: { group: NavGroup; onNavigate: () => void }) {
  return (
    <ul className="grid gap-1">
      {group.items.map((item) => {
        const Icon = ICONS[item.icon]
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className="group flex items-center gap-3 rounded-2xl p-2.5 transition hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-orbit-accent transition group-hover:border-orange-400/50 group-hover:shadow-[0_0_20px_-6px_rgb(255_120_40/0.9)]">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-white">
                  {item.label}
                  {item.isNew && <NewBadge />}
                </span>
                <span className="block text-xs text-white/55">{item.description}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Liquid glass, with a stronger blur and tint so the links stay readable
 * over the hero. Rendered in a portal: inside the header's own glass (a
 * `backdrop-filter` root) a translucent panel lets the page show through. */
const PANEL_GLASS =
  'orbit-glass rounded-[22px] !bg-[rgb(16_12_11/0.6)] [-webkit-backdrop-filter:blur(24px)_saturate(1.7)] [backdrop-filter:blur(24px)_saturate(1.7)] shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_28px_70px_-24px_rgb(0_0_0/0.9)]'

/** Space between the header and a panel, so the panel reads as its own surface. */
const PANEL_GAP = 12
const PANEL_WIDTH = 340

/** Where a panel opens: under `anchor`, below the header pill around it.
 * `top` is the anchor's bottom (no hover gap); `offset` pads down to the pill. */
function usePanelPosition(anchor: RefObject<HTMLElement | null>, open: boolean) {
  const [position, setPosition] = useState<{
    top: number
    offset: number
    center: number
  } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const element = anchor.current
      if (!element) return
      const rect = element.getBoundingClientRect()
      const pill = element.closest('.orbit-glass')?.getBoundingClientRect() ?? rect
      setPosition({
        top: rect.bottom,
        offset: pill.bottom - rect.bottom + PANEL_GAP,
        center: rect.left + rect.width / 2,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [anchor, open])
  return position
}

function DesktopGroup({
  group,
  open,
  active,
  onOpen,
  onClose,
}: {
  group: NavGroup
  open: boolean
  active: boolean
  onOpen: (id: string) => void
  onClose: () => void
}) {
  const panelId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const position = usePanelPosition(triggerRef, open)
  const maxLeft = typeof window === 'undefined' ? 0 : window.innerWidth - PANEL_WIDTH - 12
  const left = position
    ? Math.min(Math.max(12, position.center - PANEL_WIDTH / 2), maxLeft)
    : 0

  const leavesGroup = (next: EventTarget | null) =>
    !(next instanceof Node) ||
    !(
      triggerRef.current?.parentElement?.contains(next) ||
      panelRef.current?.contains(next)
    )
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      onClose()
      triggerRef.current?.focus()
    }
  }

  return (
    <div
      className="relative"
      onMouseEnter={() => onOpen(group.id)}
      onMouseLeave={onClose}
      onBlur={(event) => {
        if (leavesGroup(event.relatedTarget)) onClose()
      }}
      onKeyDown={onKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? onClose() : onOpen(group.id))}
        className={cn(TRIGGER, (open || active) && 'bg-white/[0.08] text-white')}
      >
        {group.label}
        <ChevronDownIcon
          className={cn(
            'h-3.5 w-3.5 transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {open && position && (
              <motion.div
                ref={panelRef}
                id={panelId}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  top: position.top,
                  left,
                  width: PANEL_WIDTH,
                  paddingTop: position.offset,
                }}
                className="fixed z-[60] origin-top"
                onMouseEnter={() => onOpen(group.id)}
                onMouseLeave={onClose}
                onBlur={(event) => {
                  if (leavesGroup(event.relatedTarget)) onClose()
                }}
                onKeyDown={onKeyDown}
              >
                <div className={cn(PANEL_GLASS, 'p-2')}>
                  <GroupItems group={group} onNavigate={onClose} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}

/** Header navigation: Home and Resources open on hover (or click / keyboard),
 * GitHub, and Download. Below `md` a menu button shows every link. */
export function SiteNav() {
  const pathname = usePathname() ?? '/'
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const closeTimer = useRef<number | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuPosition = usePanelPosition(menuButtonRef, mobileOpen)

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const open = useCallback((id: string) => {
    cancelClose()
    setOpenGroup(id)
  }, [])
  const close = useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpenGroup(null), CLOSE_DELAY_MS)
  }, [])

  useEffect(() => {
    setOpenGroup(null)
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => cancelClose, [])

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
        {NAV_GROUPS.map((group) => (
          <DesktopGroup
            key={group.id}
            group={group}
            open={openGroup === group.id}
            active={groupIsActive(group, pathname)}
            onOpen={open}
            onClose={close}
          />
        ))}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={TRIGGER}
        >
          <GitHubIcon className="h-4 w-4" />
          GitHub
          <ExternalIcon className="h-3 w-3 opacity-60" />
        </a>
      </nav>
      <div className="flex items-center gap-2">
        <Link href="/download" className={buttonClass({ className: 'min-h-[40px]' })}>
          <AppleIcon className="h-4 w-4" />
          Download
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMobileOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition hover:bg-white/[0.08] md:hidden"
        >
          {mobileOpen ? (
            <CloseIcon className="h-5 w-5" />
          ) : (
            <MenuIcon className="h-5 w-5" />
          )}
        </button>
      </div>
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {mobileOpen && menuPosition && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                style={{ top: menuPosition.top, paddingTop: menuPosition.offset }}
                className="fixed left-4 right-4 z-[60] md:hidden"
              >
                <nav
                  id="mobile-nav"
                  aria-label="Main"
                  className={cn(
                    PANEL_GLASS,
                    'max-h-[75vh] overflow-y-auto rounded-[24px] p-3',
                  )}
                >
                  {NAV_GROUPS.map((group) => (
                    <div key={group.id} className="mb-2">
                      <p className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-orbit-accent">
                        {group.label}
                      </p>
                      <GroupItems group={group} onNavigate={() => setMobileOpen(false)} />
                    </div>
                  ))}
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-2xl p-2.5 text-sm text-white hover:bg-white/[0.07]"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                      <GitHubIcon className="h-[18px] w-[18px]" />
                    </span>
                    GitHub
                  </a>
                </nav>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  )
}
