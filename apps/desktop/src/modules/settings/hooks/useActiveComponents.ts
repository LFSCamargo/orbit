import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getActiveComponents, setActiveComponent } from '@/lib/tauri'

/**
 * The persisted "which installed version is active" map, shared by every
 * Compatibility row. Choosing a version is a real setting rather than a draft,
 * so it is written straight through to the native store instead of waiting for
 * a Save button; a stale selection falls back to the newest installed version
 * on the Rust side.
 */
export function useActiveComponents() {
  const queryClient = useQueryClient()
  const { data, error } = useQuery({
    queryKey: ['active-components'],
    queryFn: () => getActiveComponents(),
  })

  const select = async (component: string, version: string) => {
    try {
      const actives = await setActiveComponent(component, version)
      queryClient.setQueryData(['active-components'], actives)
      return ''
    } catch (caught) {
      return String(caught)
    }
  }

  return {
    actives: data ?? {},
    error: error ? String(error) : '',
    select,
  }
}
