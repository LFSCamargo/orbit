import type { ThemeLayout } from '@/themes/useThemeLayout'

export interface ThemeTokens {
  layout: ThemeLayout
  isThemed: boolean
  cardVariant: 'portrait' | 'square'
  shell: string
  panel: string
  ink: string
  muted: string
  accent: string
  danger: string
}

const TOKENS: Record<ThemeLayout, ThemeTokens> = {
  switch: {
    layout: 'switch',
    isThemed: true,
    cardVariant: 'square',
    shell: 'switch-shell bg-[var(--switch-bg)] text-[var(--switch-ink)]',
    panel:
      'rounded-[2rem] border border-[var(--switch-border)] bg-[var(--switch-surface)]',
    ink: 'text-[var(--switch-ink)]',
    muted: 'text-[var(--switch-muted)]',
    accent: 'bg-[#ff4d6d] text-white',
    danger: 'bg-[#ff4d6d] text-white',
  },
  ps5: {
    layout: 'ps5',
    isThemed: true,
    cardVariant: 'square',
    shell: 'ps5-shell bg-[var(--ps5-bg)] text-[var(--ps5-ink)]',
    panel: 'rounded-[1.75rem] border border-[var(--ps5-border)] bg-[var(--ps5-panel)]',
    ink: 'text-[var(--ps5-ink)]',
    muted: 'text-[var(--ps5-muted)]',
    accent: 'bg-white/15 text-white',
    danger: 'bg-[var(--ps5-accent)] text-[var(--ps5-bg)]',
  },
  orbit: {
    layout: 'orbit',
    isThemed: false,
    cardVariant: 'portrait',
    shell: 'bg-orbit-canvas text-orbit-foreground',
    panel: 'orbit-panel rounded-theme',
    ink: 'text-orbit-foreground',
    muted: 'text-orbit-muted',
    accent: 'bg-orbit-accent text-orbit-canvas',
    danger: 'bg-rose-500/90 text-white',
  },
}

export function themeTokens(layout: ThemeLayout): ThemeTokens {
  return TOKENS[layout]
}

export function isThemedLayout(layout: ThemeLayout): boolean {
  return layout === 'ps5' || layout === 'switch'
}
