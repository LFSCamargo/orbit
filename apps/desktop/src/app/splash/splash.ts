/** The startup splash (#orbit-splash in index.html): pure HTML and CSS, so it
 * shows before any script runs. Screens hold it while their first content
 * loads; once nothing holds it (and it has shown long enough for its motion
 * to read) it zooms through and Orbit zooms in behind it. A hold never
 * released cannot keep Orbit hidden past SPLASH_MAX_MS, except onboarding's
 * (`untilReleased`): the splash stays behind onboarding until it finishes,
 * however long that takes. Once gone it is hidden, not removed, so
 * onboarding can bring it back (`reopenSplash`) each time it opens.
 */
// Long enough for the logo to settle and the scene to read, even when Orbit
// is ready at once.
export const SPLASH_MIN_MS = 3200
const SPLASH_MAX_MS = 10_000
// The iris and fire ring take 200 + 1700 ms (index.html).
const LEAVE_MS = 2000

let holds = 0
let shownAt = Date.now()
let state: 'showing' | 'leaving' | 'gone' = 'showing'
let check: ReturnType<typeof setTimeout> | undefined
let failsafe: ReturnType<typeof setTimeout> | undefined
let goneCallbacks: (() => void)[] = []
/** Holds the safety limit does not end (onboarding over the splash). */
let pinned = 0
const listeners = new Set<() => void>()

function setState(next: typeof state) {
  state = next
  listeners.forEach((listener) => listener())
}

/** The failsafe: leave, unless onboarding is still over the splash. */
function expire() {
  if (pinned === 0) leave()
}

function leave() {
  if (state !== 'showing') return
  setState('leaving')
  clearTimeout(check)
  clearTimeout(failsafe)
  const root = document.documentElement
  const splash = document.getElementById('orbit-splash')
  splash?.classList.add('orbit-splash--leaving')
  root.classList.remove('orbit-booting')
  root.classList.add('orbit-entering')
  setTimeout(() => {
    if (splash) {
      splash.hidden = true
      splash.classList.remove('orbit-splash--leaving')
    }
    root.classList.remove('orbit-entering')
    setState('gone')
    const callbacks = goneCallbacks
    goneCallbacks = []
    callbacks.forEach((callback) => callback())
  }, LEAVE_MS)
}

function scheduleCheck() {
  clearTimeout(check)
  if (state !== 'showing' || holds > 0) return
  // A beat later, so a screen mounting right after can still take a hold.
  const wait = Math.max(SPLASH_MIN_MS - (Date.now() - shownAt), 60)
  check = setTimeout(() => {
    if (holds === 0) leave()
  }, wait)
}

/** Shows the splash again (its animations restart), as at launch, so
 * onboarding can open over it; it leaves as usual once nothing holds it. No
 * effect while it is still up. */
export function reopenSplash() {
  const splash = document.getElementById('orbit-splash')
  if (state !== 'gone' || !splash) return
  clearTimeout(check)
  clearTimeout(failsafe)
  failsafe = undefined
  shownAt = Date.now()
  splash.hidden = false
  document.documentElement.classList.add('orbit-booting')
  setState('showing')
}

/** The splash is on screen, or zooming out while Orbit settles in. Input
 * waits for this, so a press never lands on a screen still moving into place.
 * False where there is no splash (tests, or once it has gone). */
export function splashActive(): boolean {
  return (
    state !== 'gone' &&
    typeof document !== 'undefined' &&
    document.getElementById('orbit-splash') !== null
  )
}

/** Calls `listener` when the splash starts leaving and when it has gone. */
export function subscribeSplash(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Runs once the splash has left the page (at once if it already has). */
export function whenSplashGone(callback: () => void) {
  if (state === 'gone') callback()
  else goneCallbacks.push(callback)
}

/** Keeps the splash up until the returned release is called (once).
 * `untilReleased` holds are exempt from the safety limit. */
export function holdSplash({ untilReleased = false } = {}): () => void {
  if (state !== 'showing') return () => {}
  holds += 1
  if (untilReleased) pinned += 1
  clearTimeout(check)
  failsafe ??= setTimeout(expire, SPLASH_MAX_MS - (Date.now() - shownAt))
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
    if (untilReleased) {
      pinned -= 1
      // The safety limit passed while pinned: leave now.
      if (pinned === 0 && Date.now() - shownAt >= SPLASH_MAX_MS) return leave()
    }
    scheduleCheck()
  }
}

export function resetSplashForTests() {
  clearTimeout(check)
  clearTimeout(failsafe)
  holds = 0
  pinned = 0
  listeners.clear()
  shownAt = Date.now()
  state = 'showing'
  check = undefined
  failsafe = undefined
  goneCallbacks = []
}
