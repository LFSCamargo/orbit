import type { CatalogComponent, ComponentSpec, InstalledComponent } from '@/types/runtime'

/** Pinned for compatibility (recommended Wine) or registered by hand (Zink). */
const NEVER_UPDATE = new Set(['wine-stable', 'zink'])

/** Newer catalog releases for installed components. Catalog versions are
 * newest first (GitHub release order). A component is only updated when one
 * of its installed versions is in the catalog, so Homebrew, Apple-download
 * and hand-registered installs are left alone; prereleases are only offered
 * to a component whose newest install is itself a prerelease.
 */
export function runtimeUpdates(
  catalog: CatalogComponent[],
  installed: InstalledComponent[],
): ComponentSpec[] {
  const updates: ComponentSpec[] = []
  for (const component of catalog) {
    if (NEVER_UPDATE.has(component.id)) continue
    const versions = component.versions
    const own = new Set(
      installed.filter((i) => i.id === component.id).map((i) => i.version),
    )
    const newestInstalled = versions.findIndex((v) => own.has(v.version))
    if (newestInstalled < 0) continue
    const onPrerelease = versions[newestInstalled].prerelease
    const candidate = versions.findIndex(
      (v) => v.asset.url && (onPrerelease || !v.prerelease),
    )
    if (candidate < 0 || candidate >= newestInstalled) continue
    const { version, asset } = versions[candidate]
    updates.push({
      id: component.id,
      version,
      url: asset.url,
      size: asset.size,
      sha256: asset.sha256,
    })
  }
  return updates
}
