import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  deleteLibraryEntry,
  getLibraryEntry,
  listLibraryEntries,
  updateLibraryEntry,
} from '@/lib/tauri'
import type { LibraryEntryPatch, LibraryQuery } from '@/types/library'

export function useLibrary(query: LibraryQuery) {
  return useInfiniteQuery({
    queryKey: ['library', query],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listLibraryEntries({ ...query, cursor: pageParam }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })
}
export function useLibraryEntry(id: string | null) {
  return useQuery({
    queryKey: ['library-entry', id],
    queryFn: () => getLibraryEntry(id!),
    enabled: !!id,
  })
}
export function useLibraryActions() {
  const client = useQueryClient()
  const invalidate = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['library'] }),
      client.invalidateQueries({ queryKey: ['library-entry'] }),
      client.invalidateQueries({ queryKey: ['games'] }),
    ])
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: LibraryEntryPatch }) =>
      updateLibraryEntry(id, patch),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteLibraryEntry(id),
    onSuccess: invalidate,
  })
  return { update, remove }
}
