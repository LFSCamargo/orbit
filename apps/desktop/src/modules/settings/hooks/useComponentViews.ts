import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getComponentViews, setComponentView } from '@/lib/tauri'

/**
 * The catalog row each Compatibility picker is showing, stored in SQLite.
 * One query is shared by every row. Remembering a row is a single write.
 */
export function useComponentViews() {
  const queryClient = useQueryClient()
  const { data, isFetched, error } = useQuery({
    queryKey: ['component-views'],
    queryFn: () => getComponentViews(),
  })

  const remember = async (group: string, key: string) => {
    const views = await setComponentView(group, key)
    queryClient.setQueryData(['component-views'], views)
  }

  return {
    views: data ?? {},
    ready: isFetched,
    error: error ? String(error) : '',
    remember,
  }
}
