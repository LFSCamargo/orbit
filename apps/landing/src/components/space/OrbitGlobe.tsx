'use client'

import { useMemo } from 'react'
import { globeViewOffset } from '@/lib/planetGeometry'
import { Globe3D, type Globe3DConfig } from './Globe3D'

/** Aceternity's Globe3D in Orbit's colours, as in the app's onboarding
 * (apps/desktop/src/modules/onboarding/components/space/SpaceGlobe.tsx): the
 * Blue Marble Earth (NASA, via three-globe, MIT) under a warm amber sun and an
 * orange fill, the camera raised so the horizon runs over the continents. */
const ORBIT_GLOBE: Globe3DConfig = {
  textureUrl: '/assets/space/earth-blue-marble.webp',
  bumpMapUrl: '/assets/space/earth-topology.webp',
  bumpScale: 5,
  ambientIntensity: 0.22,
  pointLightIntensity: 2.6,
  lightColor: '#ffb27a',
  fillLightColor: '#ff5a2a',
  cameraElevation: -340,
  atmosphereColor: '#ffffff',
  segments: 256,
  autoRotateSpeed: 1.5,
}

/** Framed so the sphere's outline is the planet circle from planetGeometry,
 * drawing only the hero's window of that larger frame. */
export default function OrbitGlobe({
  width,
  height,
  onReady,
}: {
  width: number
  height: number
  onReady: () => void
}) {
  const config = useMemo(() => ORBIT_GLOBE, [])
  return (
    <Globe3D
      className="pointer-events-none !absolute inset-0 h-full"
      config={config}
      viewOffset={globeViewOffset(width, height)}
      onReady={onReady}
    />
  )
}
