import { type CSSProperties } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { ImageSearchModal } from '@/components/artwork/ImageSearchModal'
import { Focusable } from '@/components/focus/Focusable'
import { useDrawer } from '@/components/layout/DrawerProvider'
import { cssUrlMedia } from '@/lib/media'
import { ThemeBrand } from '@/themes/ThemeBrand'
import type { ThemeColors, ThemeDefinition } from '@/themes/types'
import { useThemeStudio } from '../hooks/useThemeStudio'
import { ThemeColorsEditor } from './ThemeColorsEditor'

const INPUT =
  'mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2'
export function ThemeStudio({ base }: { base: ThemeDefinition }) {
  const studio = useThemeStudio(base)
  const { draft, update, preview } = studio
  const { openDrawer, closeDrawer } = useDrawer()

  const chooseArtwork = (slot: 'logo' | 'hero') => {
    openDrawer(
      <ImageSearchModal
        themeArtwork
        open
        slot={slot}
        initialQuery={draft.artworkQuery}
        onClose={closeDrawer}
        onSelect={(dataUrl) => {
          update(slot === 'logo' ? { logoImage: dataUrl } : { wallpaper: dataUrl })
          closeDrawer()
        }}
      />,
    )
  }

  return (
    <section className="settings-studio" aria-labelledby="theme-studio-title">
      <h2 id="theme-studio-title" className="font-display text-xl font-semibold">
        Theme studio
      </h2>
      <p className="mt-1 text-sm text-orbit-muted">
        Choose a game logo and a background for your theme.
      </p>
      <div
        className="mt-4 flex h-28 items-center rounded-card bg-cover bg-center px-6"
        style={
          {
            backgroundImage: draft.wallpaper
              ? `linear-gradient(0deg, rgb(${preview.colors.canvas} / 0.8), rgb(${preview.colors.canvas} / 0.25)), ${cssUrlMedia(draft.wallpaper)}`
              : undefined,
            '--orbit-canvas': preview.colors.canvas,
            '--orbit-surface': preview.colors.surface,
            '--orbit-panel': preview.colors.panel,
            '--orbit-foreground': preview.colors.foreground,
            '--orbit-muted': preview.colors.muted,
            '--orbit-accent': preview.colors.accent,
            '--orbit-focus': preview.colors.focus,
            '--orbit-border': preview.colors.border,
          } as CSSProperties
        }
        data-testid="theme-studio-preview"
      >
        <ThemeBrand branding={preview.branding} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-orbit-muted">
          Theme name
          <input
            value={draft.name}
            maxLength={60}
            onChange={(e) => update({ name: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block text-sm text-orbit-muted">
          Game title
          <input
            value={draft.artworkQuery}
            maxLength={200}
            onChange={(e) => update({ artworkQuery: e.target.value })}
            className={INPUT}
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        {(['logo', 'hero'] as const).map((slot, index) => (
          <Focusable
            key={slot}
            focusId={`artwork-web-${slot}`}
            group="theme-studio-artwork"
            order={index}
            noScale
            disabled={studio.busy || !draft.artworkQuery.trim()}
            onClick={() => chooseArtwork(slot)}
            className="orbit-glass-control rounded-full bg-white/10 px-5 py-3 text-sm"
          >
            {slot === 'logo' ? 'Choose logo' : 'Choose background'}
          </Focusable>
        ))}
      </div>

      <ThemeColorsEditor
        colors={draft.colors}
        disabled={studio.busy}
        onChange={(colors) =>
          update({ colors: colors as Record<keyof ThemeColors, string> })
        }
      />

      {studio.error && (
        <p role="alert" className="mt-4 text-sm text-rose-300">
          {studio.error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <Focusable
          focusId="studio-save"
          group="theme-studio-actions"
          order={0}
          noScale
          disabled={studio.busy}
          onClick={() => void studio.save()}
          className="inline-flex items-center gap-2 rounded-full bg-orbit-accent px-5 py-2.5 text-sm font-semibold text-orbit-canvas"
        >
          <Save className="h-4 w-4" />
          {studio.canDelete ? 'Save changes' : 'Save as my theme'}
        </Focusable>
        {studio.canDelete && (
          <Focusable
            focusId="studio-delete"
            group="theme-studio-actions"
            order={1}
            noScale
            disabled={studio.busy}
            onClick={() => void studio.remove()}
            className="orbit-glass-control inline-flex items-center gap-2 rounded-full bg-rose-500/10 px-5 py-2.5 text-sm text-rose-300"
          >
            <Trash2 className="h-4 w-4" />
            Delete theme
          </Focusable>
        )}
      </div>
    </section>
  )
}
