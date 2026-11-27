import { useQuery } from '@tanstack/react-query'
import { getOrbitWineVersions, selectOrbitWine } from '@/lib/tauri'
import { useOrbitWineInstall } from './useOrbitWineInstall'

/** Orbit Wine builds for the Windows games runtime row: choosing an installed
 * build, and installing a published one.
 */
export function useOrbitWineVersions() {
  const { install, refresh } = useOrbitWineInstall()
  const query = useQuery({
    queryKey: ['orbit-wine-versions'],
    queryFn: getOrbitWineVersions,
    staleTime: 10 * 60 * 1000,
  })

  /** Resolves an error message, or '' once games use `version`. */
  const select = async (version: string): Promise<string> => {
    try {
      await selectOrbitWine(version)
      await refresh()
      return ''
    } catch (caught) {
      return String(caught)
    }
  }

  return { data: query.data, error: query.error, select, install }
}
