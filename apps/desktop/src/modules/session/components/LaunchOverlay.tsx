import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { useGame } from '@/hooks/useGames'
import { useModalFocus } from '@/hooks/useModalFocus'
import { artworkPlaceholder, gameHeroImage, gameLogoImage } from '@/lib/artwork'
import { launchCaption } from '@/lib/launchProgress'
import { cssUrl } from '@/lib/media'
import { cancelGameLaunch } from '@/lib/tauri'
import { useLaunchStore } from '@/stores/launch.store'

export function LaunchOverlay() {
  const launch = useLaunchStore((s) => s.launch)
  const clear = useLaunchStore((s) => s.clear)
  const { data: game } = useGame(launch?.gameId ?? null)
  const closeId = launch?.failed ? 'launch-dismiss' : 'launch-cancel'
  useModalFocus(Boolean(launch), 'launch-overlay', closeId)
  if (!launch) return null

  const title = game?.title ?? launch.title ?? 'Your game'
  const steamWindowsAppId = launch.gameId.startsWith('steam-windows:')
    ? launch.gameId.slice('steam-windows:'.length)
    : undefined
  const logo = game
    ? gameLogoImage(
        game.artwork,
        game.launchConfig.type === 'steam' ? game.launchConfig.appId : game.sourceId,
      )
    : steamWindowsAppId && launch.title
      ? gameLogoImage({}, steamWindowsAppId)
      : undefined
  const hero = game ? gameHeroImage(game.artwork) : undefined
  const caption = launchCaption(launch)

  return (
    <div
      className={clsx(
        'launch-overlay fixed inset-0 z-[80] grid place-items-center bg-[#070b13]/50 p-6',
        'motion-reduce:[&_*]:!transition-none',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-overlay-title"
    >
      <div
        data-testid="launch-banner"
        className={clsx(
          'launch-overlay-card relative w-full max-w-[820px] overflow-hidden rounded-[22px]',
          'aspect-[2.4/1] shadow-[0_28px_80px_#000c] max-[640px]:aspect-[16/10]',
        )}
      >
        <div
          data-testid="launch-hero"
          className="launch-overlay-hero absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: hero ? cssUrl(hero) : artworkPlaceholder(launch.gameId),
          }}
        />
        <div
          className="to-black/72 pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent"
          aria-hidden
        />
        <p className="text-white/88 absolute left-5 top-4 z-[1] text-[13px] font-medium tracking-tight drop-shadow-[0_1px_8px_#000a]">
          Orbit
        </p>
        <div className="launch-overlay-close-host absolute right-3.5 top-3 z-[1]">
          <Focusable
            focusId={closeId}
            group="launch-overlay"
            order={0}
            noScale
            noRing
            className="launch-overlay-close text-white/88 grid size-8 place-items-center rounded-full bg-black/35"
            aria-label={launch.failed ? 'Dismiss' : 'Cancel launch'}
            onClick={() => {
              if (launch.failed) clear()
              else void cancelGameLaunch()
            }}
          >
            <X size={16} />
          </Focusable>
        </div>
        {logo ? (
          <img
            src={logo}
            alt={title}
            id="launch-overlay-title"
            className="launch-overlay-logo absolute left-1/2 top-[46%] z-[1] max-h-[38%] max-w-[72%] -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_8px_28px_#000a]"
          />
        ) : (
          <h1
            id="launch-overlay-title"
            className="launch-overlay-title absolute left-1/2 top-[46%] z-[1] max-w-[80%] -translate-x-1/2 -translate-y-1/2 text-center font-display text-4xl font-semibold tracking-[-0.04em] drop-shadow-[0_8px_28px_#000a] max-[640px]:text-2xl"
          >
            {title}
          </h1>
        )}
        <p
          className={clsx(
            'absolute bottom-4 left-5 right-14 z-[1] text-sm leading-snug drop-shadow-[0_1px_8px_#000a]',
            launch.failed ? 'text-[#ffb5c4]' : 'text-white/92',
          )}
          role={launch.failed ? 'alert' : 'status'}
        >
          {caption}
        </p>
      </div>
    </div>
  )
}
