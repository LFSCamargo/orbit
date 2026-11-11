import type { ControllerAction } from './ControllerMapping'

const ACTIONS: Record<string, ControllerAction> = {
  ArrowUp: 'navigate-up',
  ArrowDown: 'navigate-down',
  ArrowLeft: 'navigate-left',
  ArrowRight: 'navigate-right',
  Enter: 'confirm',
  ' ': 'confirm',
  Escape: 'back',
  f: 'secondary',
  c: 'context',
  '[': 'section-prev',
  ']': 'section-next',
  m: 'menu',
}

export function isEditingKeyboardEvent(event: KeyboardEvent): boolean {
  if (event.isComposing || event.keyCode === 229) return true
  const path = event.composedPath()
  const targets = path.length ? path : [event.target]
  return targets.some((target) => {
    if (!(target instanceof Element)) return false
    if (
      target.closest(
        'input, textarea, select, [role="textbox"], [role="searchbox"], [role="combobox"]',
      )
    )
      return true
    const editable = target.closest('[contenteditable]')
    return Boolean(editable && editable.getAttribute('contenteditable') !== 'false')
  })
}

export function keyboardControllerAction(event: KeyboardEvent): ControllerAction | null {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    isEditingKeyboardEvent(event)
  )
    return null
  return ACTIONS[event.key] ?? null
}
