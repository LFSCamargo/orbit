import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import appIcon from '@/assets/brand/app-icon.png'
import orbitLogo from '@/assets/brand/orbit-logo.png'
import earthBlueMarble from '@/assets/onboarding/earth-blue-marble.webp'
import earthTopology from '@/assets/onboarding/earth-topology.webp'
import globe from '@/assets/onboarding/globe.webp'
import { loadSparkles, loadSpaceGlobe } from '../components/space/sceneModules'
import { preloadOnboarding } from '../lib/onboardingPreload'
import { SETUP_QUERIES } from './useOnboardingSetup'

/** How long a scene that never reports its first frame may hold onboarding. */
const SCENE_WAIT_MS = 4000

/** Onboarding is ready once its data, code, images and fonts have loaded and
 * the scene has drawn (the WebGL globe reports its first textured frame; the
 * CSS planet needs nothing). */
export function useOnboardingReady(gpu: boolean) {
  const client = useQueryClient()
  const [loaded, setLoaded] = useState(false)
  const [sceneReady, setSceneReady] = useState(!gpu)

  useEffect(() => {
    let live = true
    void preloadOnboarding(client, {
      queries: SETUP_QUERIES,
      modules: gpu ? [loadSpaceGlobe, loadSparkles] : [],
      images: [appIcon, orbitLogo, ...(gpu ? [earthBlueMarble, earthTopology] : [globe])],
    }).then(() => {
      if (live) setLoaded(true)
    })
    return () => {
      live = false
    }
  }, [client, gpu])

  useEffect(() => {
    if (!loaded || sceneReady) return
    const timer = window.setTimeout(() => setSceneReady(true), SCENE_WAIT_MS)
    return () => window.clearTimeout(timer)
  }, [loaded, sceneReady])

  return {
    ready: loaded && sceneReady,
    onSceneReady: useCallback(() => setSceneReady(true), []),
  }
}
