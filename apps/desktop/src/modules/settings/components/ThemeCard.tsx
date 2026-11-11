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
      className={`theme-card orbit-glass-control orbit-transition overflow-hidden rounded-card text-left ring-1 ${
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
      <div className="theme-card-body">
        <p className="theme-card-title">{theme.name}</p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-orbit-muted">
          {theme.description}
        </p>
        <div className="theme-card-swatches" aria-label="Theme colors">
          {[theme.colors.canvas, theme.colors.accent, theme.colors.focus].map(
            (swatch, index) => (
              <span
                key={index}
                className="h-3 w-3 rounded-full ring-1 ring-black/30"
                style={{ background: `rgb(${swatch})` }}
              />
            ),
          )}
        </div>
        <span className="theme-card-status">{active ? 'Active' : ''}</span>
      </div>
    </Focusable>
  )
}
