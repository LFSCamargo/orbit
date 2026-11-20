import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteLibraryEntry,
  launchXcloudGame,
  saveXcloudGame,
  listXcloudCatalog,
  xboxAccountStatus,
  xboxSignOut,
  xcloudStreamStatus,
} from '@/lib/tauri'

export function useXboxAccount() {
  return useQuery({ queryKey: ['xbox-account'], queryFn: xboxAccountStatus })
}

/** Signs in to xCloud with the linked account (Rust keeps the token). */
export function useXcloudStreamStatus(linked: boolean) {
  return useQuery({
    queryKey: ['xcloud-stream-status'],
    queryFn: xcloudStreamStatus,
    enabled: linked,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}

export function useXboxSignOut() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: xboxSignOut,
    onSuccess: () => client.invalidateQueries({ queryKey: ['xbox-account'] }),
  })
}

/** Cached server-side for a day; refresh forces a new download. */
export function useXcloudCatalog(enabled = true) {
  return useQuery({
    queryKey: ['xcloud-catalog'],
    queryFn: () => listXcloudCatalog(false),
    enabled,
    staleTime: 10 * 60 * 1000,
  })
}

export function useRefreshXcloudCatalog() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => listXcloudCatalog(true),
    onSuccess: (catalog) => client.setQueryData(['xcloud-catalog'], catalog),
  })
}

/** First successful launch adds the title to the library (Installed). */
export function useLaunchXcloudGame() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: launchXcloudGame,
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['xcloud-catalog'] }),
        client.invalidateQueries({ queryKey: ['library'] }),
        client.invalidateQueries({ queryKey: ['games'] }),
      ]),
  })
}

function useInvalidateLibrary() {
  const client = useQueryClient()
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['library'] }),
      client.invalidateQueries({ queryKey: ['library-entry'] }),
      client.invalidateQueries({ queryKey: ['games'] }),
      client.invalidateQueries({ queryKey: ['xcloud-catalog'] }),
    ])
}

/** Saves a cloud title as Installed without launching it. */
export function useSaveXcloudGame() {
  const invalidate = useInvalidateLibrary()
  return useMutation({ mutationFn: saveXcloudGame, onSuccess: invalidate })
}

/** Removes a saved cloud title; it stays browsable in All games. */
export function useRemoveXcloudGame() {
  const invalidate = useInvalidateLibrary()
  return useMutation({ mutationFn: deleteLibraryEntry, onSuccess: invalidate })
}
