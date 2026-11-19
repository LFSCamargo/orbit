import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { selectInstallation } from '@/lib/libraryEntries'
import { getInstallSizes } from '@/lib/tauri'
import type { InstallSize, LibraryEntry } from '@/types/library'

/**
 * Measures the installed copy from its real game folder. The walk runs in
 * Rust off the main thread; until it returns, the saved size is shown.
 */
export function useInstallSizes(entry: LibraryEntry | null | undefined) {
  const client = useQueryClient()
  const installed = Boolean(entry?.installations.some((item) => item.available))
  const query = useQuery({
    queryKey: ['install-sizes', entry?.id],
    queryFn: () => getInstallSizes(entry!.id),
    enabled: Boolean(entry) && installed,
    staleTime: 5 * 60_000,
  })
  const selected = entry ? selectInstallation(entry) : undefined
  const measured: InstallSize | undefined = query.data?.find(
    (item) => item.installationId === selected?.id,
  )
  const known = selected?.sizeBytes ?? null
  useEffect(() => {
    // Library tiles read saved sizes; refresh them when the measurement differs.
    if (measured && measured.sizeBytes !== known)
      void client.invalidateQueries({ queryKey: ['library'] })
  }, [client, known, measured])
  return {
    measured,
    measuring: installed && query.isFetching && !query.data,
  }
}
