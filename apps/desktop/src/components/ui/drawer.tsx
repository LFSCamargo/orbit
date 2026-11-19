import { motion, useReducedMotion, type Transition } from 'framer-motion'
import { X } from 'lucide-react'
import type { CSSProperties, ReactNode, Ref } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useModalFocus } from '@/hooks/useModalFocus'

const EASE = [0.22, 1, 0.36, 1] as const

/** Content that cascades in after the drawer's sheet arrives. */
export function DrawerReveal({
  index,
  children,
  as = 'div',
  ...rest
}: {
  index: number
  children: ReactNode
  as?: 'div' | 'section'
  className?: string
  'aria-label'?: string
}) {
  const still = useReducedMotion() ?? false
  const Tag = as === 'section' ? motion.section : motion.div
  return (
    <Tag
      initial={still ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: still ? 0 : 0.1 + index * 0.06, ease: EASE }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export type DrawerProps = {
  /** Names the parts for tests and styles: `<id>-scrim`, `-host`, `-scroll`. */
  id: string
  title: ReactNode
  description?: ReactNode
  /** Shown in a round chip before the title. */
  icon?: ReactNode
  closeLabel: string
  onClose: () => void
  side?: 'left' | 'right'
  width?: string
  zIndex?: number
  /** Controller focus group; the close button starts focused. */
  focusGroup?: string
  closeFocusId?: string
  /** Pinned under the header, above the scrolling body (search fields, filters). */
  toolbar?: ReactNode
  bodyClassName?: string
  bodyBusy?: boolean
  dialogRef?: Ref<HTMLDivElement>
  children: ReactNode
}

/** Orbit's drawer, as the downloads panel: a floating, dark liquid glass sheet
 * that springs in from one side over a blur backdrop (which fades and blurs
 * in, and closes the drawer on click). The header, with its round close
 * button, and an optional toolbar stay put while the body scrolls beneath a
 * soft fade; header and toolbar cascade in. B / Escape closes it and focus
 * stays inside. Render it inside AnimatePresence (`DrawerProvider` does) so it
 * can play its exit. */
export function Drawer({
  id,
  title,
  description,
  icon,
  closeLabel,
  onClose,
  side = 'right',
  width = 'min(440px, 100vw)',
  zIndex = 80,
  focusGroup = id,
  closeFocusId = `${id}-close`,
  toolbar,
  bodyClassName,
  bodyBusy,
  dialogRef,
  children,
}: DrawerProps) {
  const still = useReducedMotion() ?? false
  useModalFocus(true, focusGroup, closeFocusId)
  useOverlayBack(true, onClose)
  const offscreen = side === 'right' ? '105%' : '-105%'
  const sheet: Transition = still
    ? { duration: 0.15 }
    : { type: 'spring', stiffness: 260, damping: 30, mass: 0.9 }
  const titleId = `${id}-title`

  return (
    <>
      {/* The app behind fades and blurs out of focus. The blur animates a
          variable both backdrop-filter spellings read (older WebKit needs the
          -webkit- one). */}
      <motion.div
        data-testid={`${id}-scrim`}
        aria-hidden="true"
        className={`${id}-scrim fixed inset-0 bg-[rgb(6_5_9/0.3)] [-webkit-backdrop-filter:blur(var(--scrim-blur))] [backdrop-filter:blur(var(--scrim-blur))]`}
        style={{ '--scrim-blur': '0px', zIndex: zIndex - 1 } as CSSProperties}
        initial={{ opacity: 0, '--scrim-blur': '0px' } as never}
        animate={{ opacity: 1, '--scrim-blur': still ? '0px' : '14px' } as never}
        exit={{ opacity: 0, '--scrim-blur': '0px' } as never}
        transition={{ duration: still ? 0.15 : 0.4, ease: EASE }}
        onClick={onClose}
      />
      {/* Fixed host, so glass layout cannot pull the sheet inline. */}
      <motion.div
        data-testid={`${id}-host`}
        className={`${id}-host ${id}-sheet orbit-drawer-host flex p-3`}
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          [side]: 0,
          width,
          zIndex,
        }}
        initial={still ? { opacity: 0 } : { x: offscreen }}
        animate={still ? { opacity: 1 } : { x: 0 }}
        exit={still ? { opacity: 0 } : { x: offscreen }}
        transition={sheet}
      >
        <LiquidGlass
          ref={dialogRef}
          surface="panel"
          radius={28}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`orbit-drawer ${id}-drawer size-full bg-[rgb(10_8_14/0.66)] shadow-[inset_0_1px_0_rgb(255_255_255/0.3),inset_1px_0_0_rgb(255_255_255/0.2),inset_0_18px_32px_-22px_rgb(255_255_255/0.22),inset_0_-20px_34px_-24px_rgb(0_0_0/0.45),0_0_70px_rgb(0_0_0/0.5)]`}
          contentClassName={`${id}-content flex h-full flex-col text-[#f4f6fb]`}
        >
          <DrawerReveal index={0}>
            <header
              className={`${id}-header flex shrink-0 items-start justify-between gap-3 px-[18px] pb-3 pt-[22px]`}
            >
              <div className="flex min-w-0 items-center gap-3">
                {icon && (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10">
                    {icon}
                  </span>
                )}
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="m-0 text-[1.2rem] font-[650] tracking-[-0.02em]"
                  >
                    {title}
                  </h2>
                  {description && (
                    <p className="m-0 mt-0.5 text-[13px] leading-snug text-white/60">
                      {description}
                    </p>
                  )}
                </div>
              </div>
              <Focusable
                focusId={closeFocusId}
                group={focusGroup}
                order={0}
                noScale
                aria-label={closeLabel}
                className={`${id}-close grid size-9 shrink-0 place-items-center rounded-full bg-white/10`}
                onClick={onClose}
              >
                <X size={18} />
              </Focusable>
            </header>
          </DrawerReveal>
          {toolbar && (
            <DrawerReveal index={1} className="shrink-0 px-[18px] pb-2">
              {toolbar}
            </DrawerReveal>
          )}
          <div
            data-testid={`${id}-scroll`}
            aria-busy={bodyBusy}
            className={`${id}-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-[18px] pb-7 pt-2 [mask-image:linear-gradient(to_bottom,transparent,#000_14px)] ${bodyClassName ?? ''}`}
          >
            {children}
          </div>
        </LiquidGlass>
      </motion.div>
    </>
  )
}
