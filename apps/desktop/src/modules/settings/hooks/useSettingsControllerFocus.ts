import { useEffect, useRef } from 'react'
import { focusManager } from '@/controllers/FocusManager'

/** Register native form controls that are not already owned by a focus component. */
export function useSettingsControllerFocus() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const controls = new Map<HTMLElement, string>()
    let sequence = 0
    const sync = () => {
      for (const [element, id] of controls) {
        if (!root.contains(element)) {
          focusManager.unregister(id)
          controls.delete(element)
        }
      }
      root
        .querySelectorAll<HTMLElement>('input, textarea, select, button')
        .forEach((element, order) => {
          if (element.dataset.focusId && !controls.has(element)) return
          const id = controls.get(element) ?? `settings-control-${++sequence}`
          controls.set(element, id)
          element.dataset.focusId = id
          element.classList.add('orbit-focusable')
          focusManager.register({
            id,
            element,
            group: 'settings-controls',
            order,
            disabled: element.matches(':disabled'),
          })
        })
    }
    sync()
    const unsubscribe = focusManager.subscribe((id) => {
      for (const [element, registered] of controls)
        element.dataset.focused = String(id === registered)
    })
    const observer = new MutationObserver(sync)
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled'],
    })
    return () => {
      observer.disconnect()
      unsubscribe()
      for (const [element, id] of controls) {
        focusManager.unregister(id)
        delete element.dataset.focusId
        delete element.dataset.focused
        element.classList.remove('orbit-focusable')
      }
    }
  }, [])
  return ref
}
