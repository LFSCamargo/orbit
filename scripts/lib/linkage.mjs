/**
 * Libraries a macOS binary loads that are not part of macOS. A Mac running
 * Orbit has no Homebrew or other toolchain, so the app must not link any:
 * 2.6.1 linked Homebrew's liblzma on CircleCI and could not start anywhere.
 */
const SYSTEM = [/^\/System\/Library\//, /^\/usr\/lib\//]

/** The non-system libraries in `otool -L` output. O(lines). */
export function foreignLibraries(otoolOutput) {
  return String(otoolOutput ?? '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(' (compatibility')[0].trim())
    .filter(Boolean)
    .filter((library) => !SYSTEM.some((pattern) => pattern.test(library)))
}
