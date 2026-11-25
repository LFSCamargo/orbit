import { isTextEntry } from './leaveTextField'

export type FocusDirection = 'up' | 'down' | 'left' | 'right'

export interface FocusableNode {
  id: string
  element: HTMLElement
  group: string
  order: number
  disabled?: boolean
}

type FocusListener = (id: string | null) => void
type FocusedListener = (focused: boolean) => void

export interface SetFocusOptions {
  /** Scroll the target into view (default true). */
  scroll?: boolean
  /**
   * Move real DOM focus so VoiceOver and Tab follow. `true` always does (an
   * explicit move); `false` never does (pointer hover); unset does unless a
   * text field is being edited.
   */
  dom?: boolean
}

/** Hidden, inert or `aria-hidden` controls are skipped by spatial navigation. */
function isNavigable(element: HTMLElement): boolean {
  if (!element.isConnected) return false
  if (element.closest('[inert], [aria-hidden="true"], [hidden]')) return false
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ checkVisibilityCSS: true } as CheckVisibilityOptions)
    : true
}

/** The part of the window `element` is drawn in, clipped by scrolling ancestors. */
function visibleBox(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  let top = Math.max(rect.top, 0)
  let bottom = Math.min(rect.bottom, window.innerHeight)
  let left = Math.max(rect.left, 0)
  let right = Math.min(rect.right, window.innerWidth)
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = window.getComputedStyle(parent)
    if (!/auto|scroll|hidden|clip/.test(style.overflowY + style.overflowX)) continue
    const box = parent.getBoundingClientRect()
    if (box.width === 0 && box.height === 0) continue
    top = Math.max(top, box.top)
    bottom = Math.min(bottom, box.bottom)
    left = Math.max(left, box.left)
    right = Math.min(right, box.right)
  }
  return { rect, top, bottom, left, right }
}

/** The nearest ancestor that scrolls, or null for the window. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll|overlay/.test(window.getComputedStyle(parent).overflowY))
      return parent
  }
  return null
}

/** Off screen means a laid-out control with none of it showing. Unknown layout counts as on screen. */
function isOffScreen(element: HTMLElement): boolean {
  const { rect, top, bottom, left, right } = visibleBox(element)
  if (rect.width === 0 && rect.height === 0) return false
  return bottom <= top || right <= left
}

function rectCenter(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect,
  }
}

function isInDirection(from: DOMRect, to: DOMRect, direction: FocusDirection): boolean {
  const toCx = to.left + to.width / 2
  const toCy = to.top + to.height / 2

  switch (direction) {
    case 'left':
      return toCx < from.left - 2
    case 'right':
      return toCx > from.right + 2
    case 'up':
      return toCy < from.top - 2
    case 'down':
      return toCy > from.bottom + 2
  }
}

/**
 * Edge-to-edge spatial score so overlapping cross-axis spans (e.g. a full-width
 * button above/below a two-column row) are not penalized by center offset. O(1).
 */
function scoreCandidate(from: DOMRect, to: DOMRect, direction: FocusDirection): number {
  const fromCx = from.left + from.width / 2
  const fromCy = from.top + from.height / 2
  const toCx = to.left + to.width / 2
  const toCy = to.top + to.height / 2

  const dx = toCx - fromCx
  const dy = toCy - fromCy

  let primaryCenter: number
  let primaryGap: number
  let crossGap: number
  let centerCross: number

  switch (direction) {
    case 'left':
      primaryCenter = -dx
      primaryGap = Math.max(0, from.left - to.right)
      crossGap = Math.max(0, from.top - to.bottom, to.top - from.bottom)
      centerCross = Math.abs(dy)
      break
    case 'right':
      primaryCenter = dx
      primaryGap = Math.max(0, to.left - from.right)
      crossGap = Math.max(0, from.top - to.bottom, to.top - from.bottom)
      centerCross = Math.abs(dy)
      break
    case 'up':
      primaryCenter = -dy
      primaryGap = Math.max(0, from.top - to.bottom)
      crossGap = Math.max(0, from.left - to.right, to.left - from.right)
      centerCross = Math.abs(dx)
      break
    case 'down':
      primaryCenter = dy
      primaryGap = Math.max(0, to.top - from.bottom)
      crossGap = Math.max(0, from.left - to.right, to.left - from.right)
      centerCross = Math.abs(dx)
      break
  }

  if (primaryCenter <= 0) return Number.POSITIVE_INFINITY
  return primaryGap + crossGap * 2.4 + centerCross * 0.05
}

/**
 * Spatial focus manager independent of browser tab focus.
 * Tracks a custom focus target and navigates by geometry.
 */
export class FocusManager {
  private nodes = new Map<string, FocusableNode>()
  private focusedId: string | null = null
  private focusStack: string[] = []
  private listeners = new Set<FocusListener>()
  private idListeners = new Map<string, Set<FocusedListener>>()
  private groupPreference: string | null = null
  private groupTrap = false

  hasNode(id: string) {
    return this.nodes.has(id)
  }

  subscribe(listener: FocusListener): () => void {
    this.listeners.add(listener)
    listener(this.focusedId)
    return () => this.listeners.delete(listener)
  }

  /**
   * Whether `id` holds focus, now and on every change. Only the control that
   * loses focus and the one that gains it are called: O(1) per move.
   */
  subscribeId(id: string, listener: FocusedListener): () => void {
    let set = this.idListeners.get(id)
    if (!set) {
      set = new Set()
      this.idListeners.set(id, set)
    }
    set.add(listener)
    listener(this.focusedId === id)
    return () => {
      set.delete(listener)
      if (set.size === 0 && this.idListeners.get(id) === set) this.idListeners.delete(id)
    }
  }

  private changeFocus(next: string | null) {
    const previous = this.focusedId
    this.focusedId = next
    if (previous !== next) {
      if (previous) this.notifyId(previous, false)
      if (next) this.notifyId(next, true)
    }
    for (const listener of this.listeners) {
      listener(this.focusedId)
    }
  }

  private notifyId(id: string, focused: boolean) {
    const set = this.idListeners.get(id)
    if (!set) return
    for (const listener of set) listener(focused)
  }

  register(node: FocusableNode) {
    this.nodes.set(node.id, node)

    if (this.groupTrap && this.groupPreference) {
      if (node.group === this.groupPreference && !node.disabled) {
        const current = this.getFocusedNode()
        if (!current || current.group !== this.groupPreference) {
          this.moveToGroup(this.groupPreference, true)
        }
      }
      return
    }

    if (!this.focusedId && !node.disabled) {
      this.setFocus(node.id, { dom: false })
    }
  }

  unregister(id: string) {
    const removed = this.nodes.get(id)
    this.nodes.delete(id)
    if (this.focusedId !== id) return

    const sameGroup = removed
      ? [...this.nodes.values()]
          .filter((node) => !node.disabled && node.group === removed.group)
          .sort((a, b) => a.order - b.order)[0]
      : null
    const fallback =
      sameGroup ??
      (this.groupTrap && this.groupPreference
        ? this.firstInGroup(this.groupPreference)
        : this.firstEnabled())
    this.changeFocus(fallback?.id ?? null)
    // Avoid scrolling the page when focus falls back during screen remounts.
  }

  getFocusedId() {
    return this.focusedId
  }

  getFocusedNode() {
    return this.focusedId ? (this.nodes.get(this.focusedId) ?? null) : null
  }

  setGroupPreference(group: string | null, options?: { trap?: boolean }) {
    this.groupPreference = group
    this.groupTrap = options?.trap ?? false
    if (group && this.groupTrap) {
      this.ensureFocusInGroup(group)
    }
  }

  ensureFocusInGroup(group: string) {
    const current = this.getFocusedNode()
    if (current?.group === group) return
    this.moveToGroup(group, true)
  }

  setFocus(id: string | null, options?: SetFocusOptions) {
    if (id && !this.nodes.has(id)) return
    const node = id ? this.nodes.get(id) : null
    if (node?.disabled) return
    if (
      node &&
      this.groupTrap &&
      this.groupPreference &&
      node.group !== this.groupPreference
    ) {
      return
    }

    this.changeFocus(id)

    if (node) this.focusDom(node.element, options?.dom)

    if (node && options?.scroll !== false) {
      node.element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }

  private focusDom(element: HTMLElement, mode: boolean | undefined) {
    if (mode === false || document.activeElement === element) return
    if (mode === undefined && isTextEntry(document.activeElement)) return
    // The ring is drawn from data-focused; DOM focus is for assistive tech and Tab.
    element.focus({ preventScroll: true })
  }

  pushFocus(id: string) {
    if (this.focusedId) {
      this.focusStack.push(this.focusedId)
    }
    // A dialog that opens takes DOM focus so VoiceOver reads it.
    this.setFocus(id, { dom: true })
  }

  popFocus() {
    const previous = this.focusStack.pop() ?? this.firstEnabled()?.id ?? null
    // Closing returns DOM focus to the control that opened it.
    this.setFocus(previous, { dom: true })
  }

  restoreFocus(preferredId?: string | null) {
    if (
      preferredId &&
      this.nodes.has(preferredId) &&
      !this.nodes.get(preferredId)?.disabled
    ) {
      this.setFocus(preferredId)
      return
    }
    if (this.focusedId && this.nodes.has(this.focusedId)) {
      this.setFocus(this.focusedId)
      return
    }
    this.setFocus(this.firstEnabled()?.id ?? null)
  }

  move(direction: FocusDirection) {
    const current = this.getFocusedNode()
    if (current && (!isNavigable(current.element) || isOffScreen(current.element))) {
      // The stick scrolled it away (or it was hidden): continue from what is on screen.
      const next = this.firstOnScreen(direction, current.element)
      if (next) {
        this.setFocus(next.id, { dom: true })
        return
      }
    }
    if (!current) {
      if (this.groupTrap && this.groupPreference) {
        this.moveToGroup(this.groupPreference, true)
      } else {
        this.setFocus(this.firstEnabled()?.id ?? null)
      }
      return
    }

    const fromRect = current.element.getBoundingClientRect()
    let best: FocusableNode | null = null
    let bestScore = Number.POSITIVE_INFINITY

    // Geometry first (cheap once layout is clean); the style-reading
    // visibility check only for nodes that could win. O(n).
    for (const node of this.nodes.values()) {
      if (node.id === current.id || !this.allowed(node)) continue

      const toRect = node.element.getBoundingClientRect()
      if (!isInDirection(fromRect, toRect, direction)) continue

      let score = scoreCandidate(fromRect, toRect, direction)
      if (node.group === current.group) {
        score *= 0.72
      } else if (this.groupPreference && node.group === this.groupPreference) {
        score *= 0.85
      }

      if (score < bestScore && isNavigable(node.element)) {
        bestScore = score
        best = node
      }
    }

    if (best) {
      this.setFocus(best.id, { dom: true })
    }
  }

  /** Enabled and inside the current trap. O(1). */
  private allowed(node: FocusableNode) {
    return (
      !node.disabled &&
      !(this.groupTrap && this.groupPreference && node.group !== this.groupPreference)
    )
  }

  /** Enabled, visible nodes the current trap allows. O(n). */
  private candidates() {
    return [...this.nodes.values()].filter(
      (node) => this.allowed(node) && isNavigable(node.element),
    )
  }

  /**
   * Reading-order first (down/right) or last (up/left) node showing on screen,
   * preferring the pane `from` scrolled in so fixed toolbars are not picked.
   * O(n log n).
   */
  private firstOnScreen(direction: FocusDirection, from: HTMLElement) {
    const visible = this.candidates().filter((node) => !isOffScreen(node.element))
    const pane = scrollParent(from)
    const inPane = visible.filter((node) => scrollParent(node.element) === pane)
    const shown = (inPane.length ? inPane : visible)
      .map((node) => ({ node, rect: node.element.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
    const pick =
      direction === 'down' || direction === 'right' ? shown[0] : shown[shown.length - 1]
    return pick?.node ?? null
  }

  moveToGroup(group: string, preferFirst = true) {
    const groupNodes = [...this.nodes.values()]
      .filter((node) => node.group === group && !node.disabled)
      .sort((a, b) => a.order - b.order)

    if (groupNodes.length === 0) return

    this.groupPreference = group
    const target = preferFirst
      ? groupNodes[0]
      : (groupNodes.find((n) => n.id === this.focusedId) ?? groupNodes[0])
    this.setFocus(target.id)
  }

  /** Move focus into page content after L/R section changes (skip nav chrome). */
  focusScreenEntry(preferredId: string | null) {
    const navGroups = new Set(['macos-nav', 'macos-tools'])
    this.groupPreference = null

    if (
      preferredId &&
      this.nodes.has(preferredId) &&
      !this.nodes.get(preferredId)?.disabled
    ) {
      this.setFocus(preferredId)
      return
    }

    const fallback = [...this.nodes.values()]
      .filter((node) => !node.disabled && !navGroups.has(node.group))
      .sort((a, b) => a.order - b.order)[0]

    if (fallback) {
      this.setFocus(fallback.id)
    }
  }

  private firstInGroup(group: string) {
    return [...this.nodes.values()]
      .filter((node) => !node.disabled && node.group === group)
      .sort((a, b) => a.order - b.order)[0]
  }

  private firstEnabled() {
    if (this.groupTrap && this.groupPreference) {
      return this.firstInGroup(this.groupPreference)
    }
    return [...this.nodes.values()]
      .filter((node) => !node.disabled)
      .sort((a, b) => a.order - b.order)[0]
  }

  /** Debug helper: list registered focusables. */
  debugSnapshot() {
    return [...this.nodes.values()].map((node) => ({
      id: node.id,
      group: node.group,
      order: node.order,
      center: rectCenter(node.element),
    }))
  }
}

export const focusManager = new FocusManager()
