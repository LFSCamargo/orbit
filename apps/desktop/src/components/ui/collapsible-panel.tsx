import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'
import { focusManager } from '@/controllers/FocusManager'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible'

export function CollapsiblePanel({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  className,
  focusId,
}: {
  title: string
  icon: LucideIcon
  children: ReactNode
  defaultOpen?: boolean
  className?: string
  focusId?: string
}) {
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
    })
    const unsubscribe = focusManager.subscribe((next) => setFocused(next === id))
    return () => {
      unsubscribe()
      focusManager.unregister(id)
    }
  }, [id])
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={clsx(
        'overflow-hidden rounded-2xl border border-white/10 bg-black/10',
        className,
      )}
    >
      <CollapsibleTrigger
        ref={ref}
        data-focus-id={id}
        data-focused={focused}
        className="group flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium"
      >
        <span
          className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-orbit-accent"
          aria-hidden="true"
        >
          <Icon size={16} />
        </span>
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown
          size={16}
          className="shrink-0 opacity-70 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        forceMount
        className="grid overflow-hidden data-[state=closed]:h-0 data-[state=open]:h-auto"
      >
        <div className="flex flex-col gap-4 border-t border-white/10 px-4 py-4 text-sm">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
