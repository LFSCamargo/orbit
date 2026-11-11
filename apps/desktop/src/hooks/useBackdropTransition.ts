import { artworkPreview } from '@/lib/artwork'
import { mediaSrc } from '@/lib/media'
import type { Game } from '@/types/game'
import { useEffect, useMemo, useState } from 'react'
import {
  prepareBackdrop,
  type BackdropSource,
  type ReadyBackdrop,
} from '@/lib/backdropImage'

interface BackdropLayers {
  active: ReadyBackdrop | null
  outgoing: ReadyBackdrop | null
}

/** Keep one visible image until its replacement is decoded. Never show a stale request. */
export function useBackdropTransition(
  game: Game | undefined,
  wallpaper: string | undefined,
) {
  const gameId = game?.id
  const hero = game ? artworkPreview(game.artwork, 'hero') : undefined
  const cover = game ? artworkPreview(game.artwork, 'cover') : undefined
  const themeImage = mediaSrc(wallpaper)
  const sources = useMemo(() => {
    const result: BackdropSource[] = []
    if (hero && gameId) result.push(gameSource(hero, gameId, 'hero'))
    if (cover && gameId && cover !== hero) result.push(gameSource(cover, gameId, 'cover'))
    if (themeImage && themeImage !== hero && themeImage !== cover)
      result.push({ url: themeImage })
    return result
  }, [gameId, hero, cover, themeImage])

  const [layers, setLayers] = useState<BackdropLayers>({ active: null, outgoing: null })

  useEffect(() => {
    const abort = new AbortController()
    const update = (next: ReadyBackdrop | null) => {
      if (abort.signal.aborted) return
      setLayers((previous) =>
        previous.active?.url === next?.url
          ? previous
          : { active: next, outgoing: previous.active },
      )
    }

    void (async () => {
      for (const source of sources) {
        const next = await prepareBackdrop(source, abort.signal)
        if (abort.signal.aborted) return
        if (next) {
          update(next)
          return
        }
      }
      update(null)
    })()
    return () => abort.abort()
  }, [sources])

  return {
    ...layers,
    finish: (url: string) => {
      setLayers((previous) =>
        (previous.active ?? previous.outgoing)?.url === url && previous.outgoing
          ? { ...previous, outgoing: null }
          : previous,
      )
    },
  }
}

function gameSource(url: string, id: string, slot: 'hero' | 'cover'): BackdropSource {
  const local = /^(asset:|data:image\/|https?:\/\/asset\.localhost\/)/.test(url)
  return { url, localGame: local ? { id, slot } : undefined }
}
