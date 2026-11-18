import { clsx } from 'clsx'
import { ProgressiveArtwork } from '@/components/artwork/ProgressiveArtwork'
import { artworkSources } from '@/lib/artworkSources'
import { placeholderGradient } from '@/lib/format'
import type { LibraryEntry } from '@/types/library'

/** Positions behind the front cover, nearest first: alternating sides,
 * each a little further out, smaller and dimmer.
 */
const SLOTS = [
  { x: -46, rotate: -7, scale: 0.86, z: 4 },
  { x: 46, rotate: 7, scale: 0.86, z: 4 },
  { x: -82, rotate: -12, scale: 0.74, z: 3 },
  { x: 82, rotate: 12, scale: 0.74, z: 3 },
]

/** Found games as a fanned stack of portrait covers; placeholders until the
 * scan finds some, so the layout never jumps.
 */
export function CoverFan({
  games,
  placeholders = true,
}: {
  games: LibraryEntry[]
  /** Fill empty slots while scanning; a finished scan shows only real covers. */
  placeholders?: boolean
}) {
  const front = games[0]
  const behind = SLOTS.map((slot, index) => ({ slot, entry: games[index + 1] })).filter(
    ({ entry }) => entry || placeholders,
  )
  return (
    <div
      aria-hidden="true"
      className="cover-fan relative h-[clamp(130px,30cqh,220px)] w-[clamp(200px,32cqw,320px)] shrink-0"
    >
      {behind.map(({ slot, entry }, index) => (
        <div
          key={entry?.id ?? `slot-${index}`}
          className="absolute left-1/2 top-1/2 aspect-[2/3] h-[88%] overflow-hidden rounded-[10px] shadow-[0_10px_30px_rgb(0_0_0/0.55)]"
          style={{
            zIndex: slot.z,
            transform: `translate(-50%, -50%) translateX(${slot.x}%) rotate(${slot.rotate}deg) scale(${slot.scale})`,
            filter: `brightness(${0.45 + slot.scale * 0.3})`,
          }}
        >
          {entry ? (
            <ProgressiveArtwork
              sources={artworkSources(entry.game.artwork, entry.steamAppId, 'portrait')}
              placeholder={placeholderGradient(entry.id)}
              className="size-full"
            />
          ) : (
            <span className="block size-full bg-[linear-gradient(160deg,#3a2c2c,#1c1619)]" />
          )}
        </div>
      ))}
      <div
        className={clsx(
          'absolute left-1/2 top-1/2 z-10 aspect-[2/3] h-full -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[12px]',
          'shadow-[0_18px_44px_rgb(0_0_0/0.65),0_0_0_1px_rgb(255_255_255/0.08)]',
        )}
      >
        {front ? (
          <ProgressiveArtwork
            sources={artworkSources(front.game.artwork, front.steamAppId, 'portrait')}
            placeholder={placeholderGradient(front.id)}
            className="size-full"
          />
        ) : (
          <span className="block size-full bg-[linear-gradient(160deg,#6a3a24,#2a1814_60%,#1a1012)]" />
        )}
      </div>
    </div>
  )
}
