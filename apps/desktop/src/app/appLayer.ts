/**
 * Orbit's screens stay mounted but are not painted while something covers
 * them completely: onboarding over the splash, or a playing cloud stream
 * (paused, the stream hides and Orbit shows again).
 */
export function appLayerHidden({
  overSplash,
  streaming,
}: {
  overSplash: boolean
  streaming: boolean
}) {
  return overSplash || streaming
}
