export type FocusDirection = 'up' | 'down' | 'left' | 'right'

export interface FocusableNode {
  id: string
  element: HTMLElement
  group: string
  order: number
  disabled?: boolean
}

type FocusListener = (id: string | null) => void

function rectCenter(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    rect,
  }
}

function isInDirection(
  from: DOMRect,
  to: DOMRect,
  direction: FocusDirection,
): boolean {
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

function scoreCandidate(
  from: DOMRect,
  to: DOMRect,
  direction: FocusDirection,
): number {
  const fromCx = from.left + from.width / 2
  const fromCy = from.top + from.height / 2
  const toCx = to.left + to.width / 2
  const toCy = to.top + to.height / 2

  const dx = toCx - fromCx
  const dy = toCy - fromCy

  let primary: number
  let secondary: number

  switch (direction) {
    case 'left':
      primary = -dx
      secondary = Math.abs(dy)
      break
    case 'right':
      primary = dx
      secondary = Math.abs(dy)
      break
    case 'up':
      primary = -dy
      secondary = Math.abs(dx)
      break
    case 'down':
      primary = dy
      secondary = Math.abs(dx)
      break
  }

  if (primary <= 0) return Number.POSITIVE_INFINITY
  return primary + secondary * 2.4
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
  private groupPreference: string | null = null

  subscribe(listener: FocusListener): () => void {
    this.listeners.add(listener)
    listener(this.focusedId)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.focusedId)
    }
  }

  register(node: FocusableNode) {
    this.nodes.set(node.id, node)
    if (!this.focusedId && !node.disabled) {
      this.setFocus(node.id)
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
    const fallback = sameGroup ?? this.firstEnabled()
    this.focusedId = fallback?.id ?? null
    this.emit()
    // Avoid scrolling the page when focus falls back during screen remounts.
  }

  getFocusedId() {
    return this.focusedId
  }

  getFocusedNode() {
    return this.focusedId ? (this.nodes.get(this.focusedId) ?? null) : null
  }

  setGroupPreference(group: string | null) {
    this.groupPreference = group
  }

  setFocus(id: string | null) {
    if (id && !this.nodes.has(id)) return
    if (id && this.nodes.get(id)?.disabled) return

    this.focusedId = id
    this.emit()

    const node = id ? this.nodes.get(id) : null
    if (node) {
      node.element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }

  pushFocus(id: string) {
    if (this.focusedId) {
      this.focusStack.push(this.focusedId)
    }
    this.setFocus(id)
  }

  popFocus() {
    const previous = this.focusStack.pop() ?? this.firstEnabled()?.id ?? null
    this.setFocus(previous)
  }

  restoreFocus(preferredId?: string | null) {
    if (preferredId && this.nodes.has(preferredId) && !this.nodes.get(preferredId)?.disabled) {
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
    if (!current) {
      this.setFocus(this.firstEnabled()?.id ?? null)
      return
    }

    const fromRect = current.element.getBoundingClientRect()
    let best: FocusableNode | null = null
    let bestScore = Number.POSITIVE_INFINITY

    for (const node of this.nodes.values()) {
      if (node.id === current.id || node.disabled) continue
      if (this.groupPreference && node.group !== this.groupPreference) {
        // Prefer same group, but allow escape if nothing found.
      }

      const toRect = node.element.getBoundingClientRect()
      if (!isInDirection(fromRect, toRect, direction)) continue

      let score = scoreCandidate(fromRect, toRect, direction)
      if (node.group === current.group) {
        score *= 0.72
      } else if (this.groupPreference && node.group === this.groupPreference) {
        score *= 0.85
      }

      if (score < bestScore) {
        bestScore = score
        best = node
      }
    }

    if (!best && this.groupPreference) {
      // Retry without group preference bias.
      this.groupPreference = null
      this.move(direction)
      return
    }

    if (best) {
      this.setFocus(best.id)
    }
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
    const navGroups = new Set(['nav', 'ps5-nav', 'switch-nav'])
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

  private firstEnabled() {
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
