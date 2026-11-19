// Back / Escape closes the topmost overlay before it can change the screen.
//
// Overlays (drawers, dialogs, modals) register while open. The controller's
// `back` action and a single capture-phase Escape listener both close only the
// top entry, so nested overlays unwind one at a time and the screen behind
// stays put.
import { useEffect, useRef } from 'react'

type Entry = { id: number; close: () => void }

const stack: Entry[] = []
let nextId = 0

function selectOwnsEscape(): boolean {
  const listbox = document.querySelector('[role="listbox"]')
  return Boolean(listbox && listbox.contains(document.activeElement))
}

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
  if (stack.length === 0 || selectOwnsEscape()) return
  event.preventDefault()
  event.stopImmediatePropagation()
  closeTopOverlay()
}

export function pushOverlay(close: () => void): () => void {
  const entry = { id: ++nextId, close }
  if (stack.length === 0) window.addEventListener('keydown', onEscape, { capture: true })
  stack.push(entry)
  return () => {
    const index = stack.findIndex((item) => item.id === entry.id)
    if (index >= 0) stack.splice(index, 1)
    if (stack.length === 0)
      window.removeEventListener('keydown', onEscape, { capture: true })
  }
}

export function hasOpenOverlay(): boolean {
  return stack.length > 0
}

/** Closes the newest overlay. Returns false when none is open. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.close()
  return true
}

/** Registers an overlay while `open`, closing it on controller back or Escape. */
export function useOverlayBack(open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    return pushOverlay(() => close.current())
  }, [open])
}
