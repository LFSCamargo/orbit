import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { clsx } from 'clsx'
import { focusManager } from '@/controllers/FocusManager'

interface FocusableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  focusId: string
  group: string
  order?: number
  children: ReactNode
  onFocusSelect?: () => void
  /** Disable scale transform on focus (use for tiles in tight rows). */
  noScale?: boolean
  /** Disable the legacy shadow decoration; the accessible navigation ring remains. */
  noRing?: boolean
}

export function Focusable({
  focusId,
  group,
  order = 0,
  children,
  className,
  onFocusSelect,
  onClick,
  disabled,
  noScale = false,
  noRing = false,
  ...rest
}: FocusableProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    focusManager.register({
      id: focusId,
      element: el,
      group,
      order,
      disabled,
    })
    return () => focusManager.unregister(focusId)
  }, [focusId, group, order, disabled])

  // Only this control's own focus changes reach it, not every move.
  useEffect(() => focusManager.subscribeId(focusId, setFocused), [focusId])

  useEffect(() => {
    if (!focused) return
    onFocusSelect?.()
    // Rising-edge only: do not re-fire when parent recreates onFocusSelect each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [focused])

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      data-focus-id={focusId}
      data-focused={focused ? 'true' : 'false'}
      className={clsx(
        'orbit-focusable relative outline-none transition-transform duration-200',
        focused && !noScale && 'z-10 scale-[1.03]',
        focused &&
          !noRing &&
          // Flush: an offset gap would show the dark canvas colour as a border.
          'shadow-focus ring-2 ring-orbit-focus',
        className,
      )}
      onClick={(event) => {
        // A click already put DOM focus where the browser wants it.
        focusManager.setFocus(focusId, { scroll: false, dom: false })
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
