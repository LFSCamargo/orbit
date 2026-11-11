import { useQuery } from '@tanstack/react-query'
import { getHomeContentInventory } from '@/lib/tauri'
import { toContentMap, type GameContentMap } from '@/types/gameContent'

export function useGameContentMap(): {
  contentByGameId: GameContentMap
  isLoading: boolean
  isError: boolean
} {
  const query = useQuery({
    queryKey: ['home-content-inventory'],
    queryFn: getHomeContentInventory,
    staleTime: 60_000,
    select: toContentMap,
  })

  return {
    contentByGameId: query.data ?? {},
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
