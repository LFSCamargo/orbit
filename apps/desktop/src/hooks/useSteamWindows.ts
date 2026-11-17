import { withoutNonGameOwned } from '@/lib/nonGames'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  connectSteamWindows,
  disconnectSteamWindows,
  steamWindowsLibrary,
  steamWindowsPreferences,
  steamWindowsStatus,
  setSteamWindowsPreferences,
} from '@/lib/tauri'

/** Steam Windows account and owned-library snapshot. Screens share one query. */
export function useSteamWindows() {
  const client = useQueryClient()
  const status = useQuery({
    queryKey: ['steam-windows-status'],
    queryFn: steamWindowsStatus,
  })
  const library = useQuery({
    queryKey: ['steam-windows-library'],
    queryFn: steamWindowsLibrary,
    select: withoutNonGameOwned,
    enabled: status.data?.signedIn === true,
  })
  const preferences = useQuery({
    queryKey: ['steam-windows-preferences'],
    queryFn: steamWindowsPreferences,
  })
  const savePreferences = useMutation({
    mutationFn: setSteamWindowsPreferences,
    onSuccess: (next) => {
      client.setQueryData(['steam-windows-preferences'], next)
      void client.invalidateQueries({ queryKey: ['steam-windows-library'] })
    },
  })
  const signIn = useMutation({
    mutationFn: connectSteamWindows,
    onSuccess: (next) => {
      client.setQueryData(['steam-windows-status'], next)
      void client.invalidateQueries({ queryKey: ['steam-windows-library'] })
    },
  })
  const signOut = useMutation({
    mutationFn: disconnectSteamWindows,
    onSuccess: (next) => {
      client.setQueryData(['steam-windows-status'], next)
      client.setQueryData(['steam-windows-library'], [])
    },
  })
  return { status, library, preferences, savePreferences, signIn, signOut }
}
