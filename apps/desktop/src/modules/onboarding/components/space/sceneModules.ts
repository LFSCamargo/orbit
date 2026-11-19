/** The scene's code split chunks: Three.js and tsParticles load only for
 * onboarding. Shared by the lazy components and the preloader, so both use
 * the same module request. */
export const loadSpaceGlobe = () => import('./SpaceGlobe')
export const loadSparkles = () => import('./Sparkles')
