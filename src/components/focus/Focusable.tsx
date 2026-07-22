import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { clsx } from 'clsx'
import { focusManager } from '@/controllers/FocusManager'
import { useUiStore } from '@/stores/ui.store'

interface FocusableProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  focusId: string
  group: string
  order?: number
  children: ReactNode
  onFocusSelect?: () => void
  /** Disable scale transform on focus (use for tiles in tight rows). */
  noScale?: boolean
  /** Disable default orbit focus ring (shell themes provide their own). */
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

  useEffect(() => {
    return focusManager.subscribe((focusedId) => {
      setFocused(focusedId === focusId)
    })
  }, [focusId])

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
          'shadow-focus ring-2 ring-orbit-focus ring-offset-2 ring-offset-orbit-canvas',
        className,
      )}
      onMouseEnter={() => {
        focusManager.setFocus(focusId)
        useUiStore.getState().markMouseActivity()
      }}
      onClick={(event) => {
        focusManager.setFocus(focusId)
        onClick?.(event)
      }}
      {...rest}
    >
      {children}
    </button>
  )
}
