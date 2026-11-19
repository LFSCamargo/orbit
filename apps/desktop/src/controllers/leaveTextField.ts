/** Text entry owns the keyboard: inputs that take typing, textareas and editable content. */
export function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) return true
  if (!(element instanceof HTMLInputElement)) return false
  return !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/.test(
    element.type,
  )
}

/**
 * Controller B while typing: leaves the text field so the D-pad and B work
 * again, handing focus to the control that owns the field. Returns false when
 * no text field had focus.
 */
export function leaveTextField(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !isTextEntry(active)) return false
  const owner = active.parentElement?.closest<HTMLElement>('[data-focus-id]')
  active.blur()
  owner?.focus({ preventScroll: true })
  return true
}
