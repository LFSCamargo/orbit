import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getStorageOverview } from '@/lib/tauri'
import { notify } from '@/lib/toast'

const KEY = ['storage-overview'] as const

/** Cached scan of Orbit's disk usage; `rescan` walks the folders again. */
export function useStorageOverview() {
  const client = useQueryClient()
  const overview = useQuery({ queryKey: KEY, queryFn: () => getStorageOverview(false) })
  const rescan = useMutation({
    mutationFn: () => getStorageOverview(true),
    onMutate: () =>
      notify.loading({ title: 'Scanning storage', message: 'Measuring game folders…' }),
    onSuccess: (next, _, toastId) => {
      client.setQueryData(KEY, next)
      notify.success({ title: 'Storage up to date' }, { id: toastId })
    },
    onError: (error, _, toastId) =>
      notify.error(
        {
          title: 'Storage scan failed',
          message: error instanceof Error ? error.message : String(error),
        },
        { id: toastId },
      ),
  })
  return { overview, rescan }
}
