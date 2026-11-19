import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useReducedMotion } from 'framer-motion'
import { clsx } from 'clsx'
import { Cpu, Gamepad2, Layers, Monitor, Wine, X, type LucideIcon } from 'lucide-react'
import orbitLogo from '@/assets/brand/orbit-logo.png'
import planetPhoto from '@/assets/onboarding/globe.webp'
import { Focusable } from '@/components/focus/Focusable'
import { useGame } from '@/hooks/useGames'
import { useModalFocus } from '@/hooks/useModalFocus'
import { useOverlayBack } from '@/controllers/overlayStack'
import { artworkPlaceholder, gameTileImage } from '@/lib/artwork'
import { launchCaption, launchStepPercent } from '@/lib/launchProgress'
import { cancelGameLaunch, steamControllerSupport } from '@/lib/tauri'
import { Meteors } from '@/modules/onboarding/components/space/Meteors'
import { useLaunchStore } from '@/stores/launch.store'
import type { Game } from '@/types/game'

/** Steam's square library capsule, for launches without stored artwork. */
function steamSquareArt(appId: string): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`
}

/** Badge copy for Steam's controller support, or null when it has none. */
export function controllerLabel(support: string | null | undefined): string | null {
  if (support === 'full') return 'Full controller support'
  if (support === 'partial') return 'Partial controller support'
  return null
}

type Chip = { label: string; icon: LucideIcon }

const GRAPHICS: Record<string, string> = {
  dxvk: 'DXVK',
  dxmt: 'DXMT',
  d3dmetal: 'GPTK',
}

/** What runs the game: Wine plus its graphics layer, or a native Mac app. */
export function runtimeChips(
  game: Game | null | undefined,
  steamWindows: boolean,
): Chip[] {
  if (game?.launchConfig.type === 'wine') {
    const graphics = game.launchConfig.profile.compatibility?.graphics
    const layer = graphics ? GRAPHICS[graphics] : undefined
    return [
      { label: 'Wine', icon: Wine },
      ...(layer ? [{ label: layer, icon: layer === 'GPTK' ? Cpu : Layers }] : []),
    ]
  }
  if (steamWindows) return [{ label: 'Wine', icon: Wine }]
  if (game?.platform === 'macos') return [{ label: 'Native', icon: Monitor }]
  return []
}

/**
 * The launch card, a warm glass panel: square artwork, "Launching game…",
 * the title and what runs it (Wine, graphics layer, controller support), a
 * glowing progress bar with the step underneath, meteors falling from the
 * top right and a lit planet horizon in the bottom right corner.
 */
export function LaunchOverlay() {
  const launch = useLaunchStore((s) => s.launch)
  const clear = useLaunchStore((s) => s.clear)
  const { data: game } = useGame(launch?.gameId ?? null)
  const [failedArt, setFailedArt] = useState<string>()
  const still = useReducedMotion() ?? false
  const steamWindowsAppId = launch?.gameId.startsWith('steam-windows:')
    ? launch.gameId.slice('steam-windows:'.length)
    : undefined
  const appId =
    steamWindowsAppId ?? (game?.provider === 'steam' ? (game.sourceId ?? null) : null)
  const controller = useQuery({
    queryKey: ['steam-controller-support', appId],
    queryFn: () => steamControllerSupport(appId!),
    enabled: appId !== null,
    staleTime: Infinity,
  })
  const closeId = launch?.failed ? 'launch-dismiss' : 'launch-cancel'
  useModalFocus(Boolean(launch), 'launch-overlay', closeId)
  // Back dismisses a failed launch; it never cancels one that is starting.
  useOverlayBack(Boolean(launch?.failed), clear)
  if (!launch) return null

  const title = game?.title ?? launch.title ?? 'Your game'
  const art = game
    ? gameTileImage(game.artwork, 'square')
    : steamWindowsAppId
      ? steamSquareArt(steamWindowsAppId)
      : undefined
  const caption = launchCaption(launch)
  // Same step math as the launch toast, so both read the same percent.
  const percent = launchStepPercent(launch.step)
  const controllerText = controllerLabel(controller.data)
  const chips = [
    ...runtimeChips(game, Boolean(steamWindowsAppId)),
    ...(controllerText ? [{ label: controllerText, icon: Gamepad2 }] : []),
  ]

  return (
    <div
      className={clsx(
        'launch-overlay fixed inset-0 z-[80] grid place-items-center bg-[#05060d]/70 p-6 backdrop-blur-md',
        'motion-reduce:[&_*]:!transition-none',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="launch-overlay-title"
    >
      <div
        data-testid="launch-banner"
        className={clsx(
          'launch-overlay-card relative w-full max-w-[860px] overflow-hidden rounded-[30px]',
          'bg-[linear-gradient(160deg,rgb(52_30_26/0.92),rgb(22_15_18/0.94)_45%,rgb(14_10_14/0.96))]',
          // Warm rim: a thin lit edge plus orange light pooling at the bottom.
          'shadow-[inset_0_1px_0_rgb(255_200_160/0.18),inset_0_0_0_1px_rgb(255_150_90/0.14),inset_0_-30px_60px_-30px_rgb(255_110_40/0.45),0_30px_90px_#000d]',
        )}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 right-[15%] h-48 w-[55%] rounded-full bg-[radial-gradient(closest-side,rgb(255_140_60/0.22),transparent)] blur-2xl" />
          {!still && (
            <div className="absolute inset-y-0 right-0 w-[55%] overflow-hidden">
              <Meteors count={8} />
            </div>
          )}
          {/* Planet horizon: the splash's sunlit planet rim rising in the
              bottom right corner. */}
          <img
            src={planetPhoto}
            alt=""
            data-testid="launch-planet"
            className="absolute -bottom-[70px] -right-[90px] w-[560px] max-w-none -rotate-[14deg] opacity-95 [filter:brightness(0.85)_saturate(1.2)]"
          />
        </div>

        <img
          src={orbitLogo}
          alt="Orbit"
          className="relative z-[1] ml-10 mt-8 h-7 w-auto drop-shadow-[0_1px_8px_#000a]"
        />
        <div className="launch-overlay-close-host absolute right-7 top-7 z-[2]">
          <Focusable
            focusId={closeId}
            group="launch-overlay"
            order={0}
            noScale
            noRing
            className="launch-overlay-close grid size-11 place-items-center rounded-full bg-black/40 text-white/90 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12)]"
            aria-label={launch.failed ? 'Dismiss' : 'Cancel launch'}
            onClick={() => {
              if (launch.failed) clear()
              else void cancelGameLaunch()
            }}
          >
            <X size={18} />
          </Focusable>
        </div>

        <div className="relative z-[1] grid gap-7 px-14 pb-14 pt-8 max-[640px]:px-6 max-[640px]:pb-8">
          <div className="flex items-center gap-6">
            <div
              data-testid="launch-art"
              className="size-[104px] shrink-0 overflow-hidden rounded-[22px] bg-cover bg-center shadow-[0_12px_32px_#000a] ring-1 ring-white/10"
              style={{ backgroundImage: artworkPlaceholder(launch.gameId) }}
            >
              {art && failedArt !== art && (
                <img
                  src={art}
                  alt=""
                  data-testid="launch-art-image"
                  onError={() => setFailedArt(art)}
                  className="size-full object-cover"
                />
              )}
            </div>
            <div className="grid min-w-0 gap-2">
              <span className="text-sm text-white/65">
                {launch.failed ? 'Could not start' : 'Launching game…'}
              </span>
              <h1
                id="launch-overlay-title"
                className="truncate font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] max-[640px]:text-xl"
              >
                {title}
              </h1>
              {chips.length > 0 && (
                <ul
                  className="m-0 flex list-none flex-wrap gap-2 p-0"
                  aria-label="Runs with"
                >
                  {chips.map(({ label, icon: Icon }) => (
                    <li
                      key={label}
                      className="inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[13px] text-white/85 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08)]"
                    >
                      <Icon size={15} aria-hidden />
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <div
                role="progressbar"
                aria-label={`${title} launch progress`}
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-3 flex-1 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className={clsx(
                    'h-full rounded-full transition-[width] duration-500',
                    launch.failed
                      ? 'bg-[#ff6b7f]'
                      : 'bg-[linear-gradient(90deg,#ff3d4f,#ff8a2a_55%,#ffe36a)] shadow-[0_0_14px_rgb(255_150_60/0.6)]',
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <span className="w-12 text-right text-lg font-semibold tabular-nums">
                {percent}%
              </span>
            </div>
            <p
              className={clsx(
                'm-0 flex items-center gap-3 text-[15px]',
                launch.failed ? 'text-[#ffb5c4]' : 'text-white/80',
              )}
              role={launch.failed ? 'alert' : 'status'}
            >
              {!launch.failed && (
                <span
                  aria-hidden
                  className="size-5 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white/85 motion-reduce:animate-none"
                />
              )}
              {caption}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
