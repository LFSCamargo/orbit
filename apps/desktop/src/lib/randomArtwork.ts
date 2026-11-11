import type { ArtworkSearchHit } from './artworkApi'

/** Prefer a different image on every roll; injected randomness makes this testable. */
export function randomArtworkOrder(
  hits: ArtworkSearchHit[],
  previous?: string,
  random = Math.random,
): ArtworkSearchHit[] {
  const alternatives = hits.filter((hit) => hit.imageUrl !== previous)
  const items = [...(alternatives.length ? alternatives : hits)]
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j]!, items[i]!]
  }
  return items
}
