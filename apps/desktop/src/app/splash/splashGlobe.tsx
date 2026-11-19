import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { holdSplash, whenSplashGone } from './splash'

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
 * the splash has gone. */
export function mountSplashGlobe({
  tier,
  reducedMotion,
  load,
}: {
  tier: 'gpu' | 'software' | 'none'
  reducedMotion: boolean
  load: () => Promise<{ default: ComponentType<GlobeProps> }>
}) {
  const mount = document.getElementById('orbit-splash-globe')
  if (!mount || tier !== 'gpu' || reducedMotion) return
  const release = holdSplash()
  const cap = setTimeout(release, SPLASH_GLOBE_WAIT_MS)
  const root = createRoot(mount)
  whenSplashGone(() => {
    clearTimeout(cap)
    root.unmount()
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
