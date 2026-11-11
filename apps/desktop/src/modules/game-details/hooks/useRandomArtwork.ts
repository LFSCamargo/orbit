import { useEffect, useRef, useState } from 'react'
import type { ArtworkSlot } from '@/lib/artwork'
import { fetchArtworkFromUrl, searchGameArtwork } from '@/lib/artworkApi'
import { randomArtworkOrder } from '@/lib/randomArtwork'

export function useRandomArtwork(
  gameId: string | undefined,
  query: string,
  onSelect: (slot: ArtworkSlot, value: string) => void,
) {
  const [busySlot, setBusySlot] = useState<ArtworkSlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generation = useRef(0)
  const previous = useRef<Partial<Record<ArtworkSlot, string>>>({})
  const select = useRef(onSelect)
  select.current = onSelect
  useEffect(() => {
    generation.current++
    previous.current = {}
    setBusySlot(null)
    setError(null)
    return () => {
      generation.current++
    }
  }, [gameId, query])

  const randomize = async (slot: ArtworkSlot) => {
    if (!gameId || !query.trim() || busySlot) return
    const ticket = ++generation.current
    setBusySlot(slot)
    setError(null)
    try {
      const result = await searchGameArtwork(query.trim(), slot, gameId, 'steamgriddb')
      if (ticket !== generation.current) return
      const hits = randomArtworkOrder(result.hits, previous.current[slot])
      if (!hits.length)
        throw new Error(
          result.warnings.join(' · ') ||
            'No SteamGridDB artwork found for this game and image type. Try the picker with another title.',
        )
      for (const hit of hits.slice(0, 5)) {
        try {
          const image = await fetchArtworkFromUrl(hit.imageUrl)
          if (ticket !== generation.current) return
          select.current(slot, image)
          previous.current[slot] = hit.imageUrl
          return
        } catch {
          /* Try another candidate if this image is unavailable. */
        }
      }
      throw new Error(
        'Could not download SteamGridDB artwork. Your current image has been kept.',
      )
    } catch (err) {
      if (ticket === generation.current)
        setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (ticket === generation.current) setBusySlot(null)
    }
  }
  return { randomize, busySlot, error }
}
