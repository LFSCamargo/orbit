import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  clearLibrary,
  createGame,
  deleteGame,
  detectImporters,
  getActiveSession,
  getGame,
  importGamePath,
  launchGame,
  listGames,
  scanAstrisFolder,
  scanNativeApps,
  scanSteamLibrary,
  setGameHidden,
  stopGame,
  toggleFavorite,
  updateGame,
} from '@/lib/tauri'
import { useSessionStore } from '@/stores/session.store'
import { useLaunchStore } from '@/stores/launch.store'
import { playLibraryEntry } from '@/lib/playLibraryEntry'
import type { LibraryEntry } from '@/types/library'
import type { CreateGameRequest, UpdateGameRequest } from '@/types/game'

export function useGames() {
  return useQuery({
    queryKey: ['games'],
    queryFn: listGames,
  })
}

export function useGame(gameId: string | null) {
  return useQuery({
    queryKey: ['games', gameId],
    queryFn: () => (gameId ? getGame(gameId) : Promise.resolve(null)),
    enabled: Boolean(gameId),
  })
}

export function useImporters() {
  return useQuery({
    queryKey: ['importers'],
    queryFn: detectImporters,
  })
}

export function useActiveSessionQuery() {
  return useQuery({
    queryKey: ['active-session'],
    queryFn: getActiveSession,
    // Poll only while a session is active; still fetches once on mount.
    refetchInterval: (query) => (query.state.data ? 2_000 : false),
  })
}

export function useGameActions() {
  const queryClient = useQueryClient()
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['games'] }),
      queryClient.invalidateQueries({ queryKey: ['library'] }),
      queryClient.invalidateQueries({ queryKey: ['library-entry'] }),
    ])
    await queryClient.invalidateQueries({ queryKey: ['active-session'] })
  }

  const favorite = useMutation({
    mutationFn: toggleFavorite,
    onSuccess: invalidate,
  })

  const hide = useMutation({
    mutationFn: ({ gameId, hidden }: { gameId: string; hidden: boolean }) =>
      setGameHidden(gameId, hidden),
    onSuccess: invalidate,
  })

  const launch = useMutation({
    mutationFn: launchGame,
    onMutate: (gameId) => {
      useLaunchStore.getState().begin(gameId)
    },
    onError: (error, gameId) => {
      const launch = useLaunchStore.getState().launch
      if (launch?.failed) return
      const message = error instanceof Error ? error.message : String(error)
      useLaunchStore.getState().fail(gameId, launch?.step ?? 'spawn', message)
    },
    onSuccess: async (session) => {
      setActiveSession(session)
      useLaunchStore.getState().clear()
      await invalidate()
    },
  })

  const playEntry = useMutation({
    mutationFn: playLibraryEntry,
    onMutate: (entry: LibraryEntry) => {
      const overlayId = entry.steamAppId
        ? `steam-windows:${entry.steamAppId}`
        : entry.game.id
      useLaunchStore.getState().begin(overlayId, entry.game.title)
    },
    onError: (error, entry) => {
      const launch = useLaunchStore.getState().launch
      if (launch?.failed) return
      const message = error instanceof Error ? error.message : String(error)
      const overlayId = entry.steamAppId
        ? `steam-windows:${entry.steamAppId}`
        : entry.game.id
      useLaunchStore.getState().fail(overlayId, launch?.step ?? 'spawn', message)
    },
    onSuccess: async (session) => {
      if (session) setActiveSession(session)
      useLaunchStore.getState().clear()
      await invalidate()
    },
  })

  const stop = useMutation({
    mutationFn: stopGame,
    onSuccess: async () => {
      setActiveSession(null)
      await invalidate()
    },
  })

  const create = useMutation({
    mutationFn: (request: CreateGameRequest) => createGame(request),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: ({ gameId, request }: { gameId: string; request: UpdateGameRequest }) =>
      updateGame(gameId, request),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: deleteGame,
    onSuccess: invalidate,
  })

  const clear = useMutation({
    mutationFn: clearLibrary,
    onSuccess: invalidate,
  })

  const scanSteam = useMutation({
    mutationFn: scanSteamLibrary,
    onSuccess: invalidate,
  })

  const scanAstris = useMutation({
    mutationFn: scanAstrisFolder,
    onSuccess: invalidate,
  })

  const scanNative = useMutation({
    mutationFn: scanNativeApps,
    onSuccess: invalidate,
  })

  const importPath = useMutation({
    mutationFn: importGamePath,
    onSuccess: invalidate,
  })

  return {
    favorite,
    hide,
    launch,
    playEntry,
    stop,
    create,
    update,
    remove,
    clear,
    scanSteam,
    scanAstris,
    scanNative,
    importPath,
  }
}
