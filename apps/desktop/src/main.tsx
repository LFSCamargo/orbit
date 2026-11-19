import ReactDOM from 'react-dom/client'
import { App } from '@/app/App'
import { AppProviders } from '@/app/providers'
import { holdSplash } from '@/app/splash/splash'
import { mountSplashGlobe } from '@/app/splash/splashGlobe'
import { graphicsTier } from '@/modules/onboarding/lib/graphicsSupport'
import '@/styles/index.css'

// Held until Orbit's first screen has mounted (it may hold longer).
const releaseBoot = holdSplash()
// The splash's turning 3D globe, where the GPU and motion settings allow it.
void mountSplashGlobe({
  tier: graphicsTier(),
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  load: () => import('@/modules/onboarding/components/space/SpaceGlobe'),
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <App onMounted={releaseBoot} />
  </AppProviders>,
)
