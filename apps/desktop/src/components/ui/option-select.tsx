import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { clsx } from 'clsx'
import { focusManager } from '@/controllers/FocusManager'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select'

interface OptionProps {
  value: string
  disabled?: boolean
  children?: ReactNode
}
interface OptionSelectProps {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
  className?: string
  disabled?: boolean
  focusId?: string
  'aria-label'?: string
}
const INHERITED = '__orbit_inherited__'

/** Shared shadcn Select for static option lists. Empty values represent inheritance. */
export function OptionSelect({
  value,
  onValueChange,
  children,
  className,
  disabled,
  focusId,
  'aria-label': label,
}: OptionSelectProps) {
  const generatedId = useId()
  const id = focusId ?? generatedId
  const ref = useRef<HTMLButtonElement>(null)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    focusManager.register({
      id,
      element: ref.current,
      group: 'form-controls',
      order: 0,
      disabled,
    })
    const unsubscribe = focusManager.subscribe((next) => setFocused(next === id))
    return () => {
      unsubscribe()
      focusManager.unregister(id)
    }
  }, [id, disabled])
  return (
    <Select
      value={value || INHERITED}
      onValueChange={(next) => onValueChange(next === INHERITED ? '' : next)}
      disabled={disabled}
    >
      <SelectTrigger
        ref={ref}
        data-focus-id={id}
        data-focused={focused}
        className={clsx('orbit-focusable min-h-11', className)}
        aria-label={label}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent onKeyDown={(event) => event.stopPropagation()}>
        {Children.toArray(children).map((child) =>
          isValidElement<OptionProps>(child) ? (
            <SelectItem
              key={child.props.value}
              value={child.props.value || INHERITED}
              disabled={child.props.disabled}
            >
              {child.props.children}
            </SelectItem>
          ) : null,
        )}
      </SelectContent>
    </Select>
  )
}
