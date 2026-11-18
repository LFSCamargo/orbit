/** Liquid glass panel holding a step's content: Orbit's shared glass material
 * (rim highlight, light pooling, lens-like saturation; styles/index.css) with
 * a near-clear tint, so the space scene shows through. */
export const ONBOARDING_PANEL =
  'onboarding-panel orbit-glass rounded-[18px] bg-[rgb(255_255_255/0.035)] shadow-[inset_0_1px_0_rgb(255_255_255/0.32),inset_1px_0_0_rgb(255_255_255/0.1),inset_-1px_0_0_rgb(255_255_255/0.06),inset_0_16px_30px_-20px_rgb(255_255_255/0.24),inset_0_-18px_30px_-22px_rgb(0_0_0/0.4),0_18px_50px_rgb(0_0_0/0.35)]'

/** Rows inside a panel, split by hairlines. */
export const PANEL_ROWS = 'divide-y divide-white/[0.07]'

/** Small pill beside a row; `hot` is the orange "Recommended" / "Default" look. */
export const BADGE =
  'rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap'
export const BADGE_QUIET = 'border-white/15 bg-white/[0.06] text-white/70'
export const BADGE_HOT =
  'border-transparent bg-[rgb(var(--orbit-fire-via))] text-[rgb(var(--orbit-fire-ink))] shadow-[0_0_12px_rgb(var(--orbit-fire-via)/0.4)]'

/** Status text colours shared by the setup and scan lists. */
export const STATUS_TONE = {
  done: 'text-white/60',
  active: 'text-[rgb(var(--orbit-fire-via))]',
  waiting: 'text-white/45',
  failed: 'text-rose-300',
} as const
