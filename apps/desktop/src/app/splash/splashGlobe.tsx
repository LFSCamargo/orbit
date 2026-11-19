import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { holdSplash, splashActive, subscribeSplash, whenSplashGone } from './splash'

/** How long the splash waits for the globe's first frame before leaving
 * without it (the photo planet stays). */
export const SPLASH_GLOBE_WAIT_MS = 4500
/** Clearly turning within the splash's few seconds. */
const SPLASH_SPIN = 4

type GlobeProps = {
  width: number
  height: number
  still: boolean
  speed?: number
  onReady?: () => void
}

/** The onboarding's turning 3D globe, over the splash's photo planet
 * (index.html, #orbit-splash-globe). Only on a real GPU with motion on;
 * otherwise the photo planet stays. The splash waits for its first drawn
 * frame (at most SPLASH_GLOBE_WAIT_MS), and the WebGL scene is torn down once
 * the splash has gone. When the splash comes back (onboarding reopens it), so
 * does the globe. */
export function mountSplashGlobe(options: {
  tier: 'gpu' | 'software' | 'none'
  reducedMotion: boolean
  load: () => Promise<{ default: ComponentType<GlobeProps> }>
}) {
  const { tier, reducedMotion } = options
  if (!document.getElementById('orbit-splash-globe') || tier !== 'gpu' || reducedMotion)
    return
  let mounted = false
  subscribeSplash(() => {
    if (splashActive() && !mounted) {
      mounted = true
      void spin(options.load, () => (mounted = false))
    }
  })
  mounted = true
  return spin(options.load, () => (mounted = false))
}

/** One showing of the globe, until the splash has gone. */
function spin(
  load: () => Promise<{ default: ComponentType<GlobeProps> }>,
  onGone: () => void,
) {
  const mount = document.getElementById('orbit-splash-globe')!
  delete mount.dataset.ready
  const release = holdSplash()
  const cap = setTimeout(release, SPLASH_GLOBE_WAIT_MS)
  const root = createRoot(mount)
  whenSplashGone(() => {
    clearTimeout(cap)
    root.unmount()
    onGone()
  })
  return load()
    .then(({ default: Globe }) => {
      root.render(
        <Globe
          width={window.innerWidth}
          height={window.innerHeight}
          still={false}
          speed={SPLASH_SPIN}
          onReady={() => {
            mount.dataset.ready = 'true'
            clearTimeout(cap)
            release()
          }}
        />,
      )
    })
    .catch(() => {
      clearTimeout(cap)
      release()
    })
}
