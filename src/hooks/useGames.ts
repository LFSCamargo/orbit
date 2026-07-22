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
  scanGamehubFolder,
  scanNativeApps,
  scanSteamLibrary,
  setGameHidden,
  stopGame,
  toggleFavorite,
  updateGame,
} from '@/lib/tauri'
import { useSessionStore } from '@/stores/session.store'
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
    refetchInterval: 2_000,
  })
}

export function useGameActions() {
  const queryClient = useQueryClient()
  const setActiveSession = useSessionStore((s) => s.setActiveSession)

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['games'] })
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
    onSuccess: async (session) => {
      setActiveSession(session)
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
    mutationFn: ({
      gameId,
      request,
    }: {
      gameId: string
      request: UpdateGameRequest
    }) => updateGame(gameId, request),
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

  const scanGamehub = useMutation({
    mutationFn: (folder?: string) => scanGamehubFolder(folder),
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
    stop,
    create,
    update,
    remove,
    clear,
    scanSteam,
    scanAstris,
    scanNative,
    scanGamehub,
    importPath,
  }
}
