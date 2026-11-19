import type { CSSProperties } from 'react'
import { localThemeArtwork, localThemePreview } from '@/lib/bundledArtwork'
import { Focusable } from '@/components/focus/Focusable'
import { themePreviewSrc } from '@/lib/media'
import type { ThemePreview } from '@/lib/tauri'
import { ThemeCardArtwork } from './ThemeCardArtwork'
import type { ThemeDefinition } from '@/themes/types'

/** Scopes the theme's own palette so the card previews it regardless of the active theme. */
function previewStyle(theme: ThemeDefinition): CSSProperties {
  return {
    '--orbit-accent': theme.colors.accent,
    '--orbit-focus': theme.colors.focus,
  } as CSSProperties
}

export function ThemeCard({
  theme,
  active,
  order,
  onSelect,
  prepared,
  preparing = false,
}: {
  theme: ThemeDefinition
  active: boolean
  order: number
  onSelect: (id: string) => void
  prepared?: ThemePreview
  preparing?: boolean
}) {
  const preview =
    theme.kind === 'game'
      ? {
          ...theme,
          branding: {
            ...theme.branding,
            logoImage:
              theme.branding?.logoImage ??
              localThemeArtwork(theme.id, 'logo') ??
              undefined,
            wallpaper:
              theme.branding?.wallpaper ??
              localThemeArtwork(theme.id, 'hero') ??
              undefined,
          },
        }
      : theme
  return (
    <Focusable
      focusId={`settings-theme-${theme.id}`}
      group="settings-themes"
      order={order}
      noScale
      noRing
      aria-pressed={active}
      onClick={() => onSelect(theme.id)}
      style={previewStyle(preview)}
      className={`theme-card orbit-glass-control orbit-transition flex min-w-0 flex-col self-stretch overflow-hidden rounded-card text-left ring-1 ${
        active ? 'ring-2 ring-orbit-accent' : 'ring-white/10'
      }`}
    >
      <ThemeCardArtwork
        logo={
          themePreviewSrc(prepared?.logo ?? theme.preview?.logo) ??
          (theme.kind === 'game'
            ? (localThemePreview(theme.id, 'logo') ?? undefined)
            : theme.preview
              ? undefined
              : themePreviewSrc(preview.branding?.logoImage))
        }
        hero={
          themePreviewSrc(prepared?.hero ?? theme.preview?.hero) ??
          (theme.kind === 'game'
            ? (localThemePreview(theme.id, 'hero') ?? undefined)
            : theme.preview
              ? undefined
              : themePreviewSrc(preview.branding?.wallpaper))
        }
        title={preview.branding?.artworkQuery ?? theme.name}
        preparing={preparing}
      />
      <div className="theme-card-body flex min-w-0 flex-1 flex-col p-4">
        <p className="theme-card-title line-clamp-2 min-h-[2.75em] overflow-hidden text-base font-semibold leading-snug [overflow-wrap:anywhere]">
          {theme.name}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-orbit-muted">
          {theme.description}
        </p>
        <div
          className="theme-card-swatches mt-2.5 flex gap-1.5"
          aria-label="Theme colors"
        >
          {[theme.colors.canvas, theme.colors.accent, theme.colors.focus].map(
            (swatch, index) => (
              <span
                key={index}
                className="size-6 rounded-full ring-1 ring-black/30"
                style={{ background: `rgb(${swatch})` }}
              />
            ),
          )}
        </div>
        <span className="theme-card-status mt-auto min-h-[15px] pt-2 text-[10px] uppercase tracking-[0.1em] text-orbit-accent">
          {active ? 'Active' : ''}
        </span>
      </div>
    </Focusable>
  )
}
