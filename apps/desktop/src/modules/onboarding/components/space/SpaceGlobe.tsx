import { useMemo } from 'react'
import earthBlueMarble from '@/assets/onboarding/earth-blue-marble.webp'
import earthTopology from '@/assets/onboarding/earth-topology.webp'
import { Globe3D, type Globe3DConfig } from '@/components/ui/3d-globe'
import { globeViewOffset } from '../../lib/planetGeometry'

/** Aceternity's Globe3D in Orbit's colours: its Blue Marble Earth (NASA,
 * via three-globe, MIT; bundled rather than loaded from unpkg) under a warm
 * amber sun and an orange fill instead of white and blue, with the camera
 * raised so the horizon runs over the continents. Its atmosphere shell is a
 * ring 12% of the radius thick, a solid band at horizon scale, so it stays
 * off (the published default) and the card's CSS glow layers do that job. */
const ORBIT_GLOBE: Globe3DConfig = {
  textureUrl: earthBlueMarble,
  bumpMapUrl: earthTopology,
  bumpScale: 5,
  ambientIntensity: 0.22,
  pointLightIntensity: 2.6,
  lightColor: '#ffb27a',
  fillLightColor: '#ff5a2a',
  cameraElevation: -340,
  atmosphereColor: '#ffffff',
  // The rim is huge on screen; more segments keep it a smooth curve.
  segments: 256,
  autoRotateSpeed: 1.5,
}

/** The horizon planet: Globe3D framed so its outline is the planet circle
 * from `planetGeometry` (top at the horizon, rim leaving through the bottom
 * corners), drawing only the card's window of that larger frame. */
export default function SpaceGlobe({
  width,
  height,
  still,
}: {
  width: number
  height: number
  still: boolean
}) {
  const config = useMemo(
    () => ({ ...ORBIT_GLOBE, autoRotateSpeed: still ? 0 : ORBIT_GLOBE.autoRotateSpeed }),
    [still],
  )
  return (
    <Globe3D
      className="space-globe pointer-events-none !absolute inset-0 h-full"
      config={config}
      viewOffset={globeViewOffset(width, height)}
    />
  )
}
