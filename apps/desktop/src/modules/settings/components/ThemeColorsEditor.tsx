import { useRef } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { PALETTE_PRESETS, extractPaletteFromImage } from '@/lib/palettes'
import type { ThemeColors } from '@/themes/types'

const COLOR_LABELS: Record<keyof ThemeColors, string> = {
  canvas: 'Canvas',
  surface: 'Surface',
  panel: 'Panel',
  foreground: 'Foreground',
  muted: 'Muted',
  accent: 'Accent',
  focus: 'Focus',
  border: 'Border',
}

const COLOR_ORDER: Array<keyof ThemeColors> = [
  'canvas',
  'surface',
  'panel',
  'foreground',
  'muted',
  'accent',
  'focus',
  'border',
]

export interface ThemeColorsEditorProps {
  colors: Record<keyof ThemeColors, string>
  onChange: (colors: Record<keyof ThemeColors, string>) => void
  disabled?: boolean
}

export function ThemeColorsEditor({
  colors,
  onChange,
  disabled,
}: ThemeColorsEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  const updateColor = (key: keyof ThemeColors, value: string) => {
    onChange({ ...colors, [key]: value })
  }

  const applyPreset = (preset: (typeof PALETTE_PRESETS)[number]) => {
    onChange({ ...preset.colors })
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
    const palette = await extractPaletteFromImage(dataUrl)
    if (palette) onChange(palette)
  }

  return (
    <div className="mt-5 space-y-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-orbit-muted">
          Suggested palettes
        </h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {PALETTE_PRESETS.map((preset, index) => (
            <Focusable
              key={preset.id}
              focusId={`theme-palette-${preset.id}`}
              group="theme-studio-colors"
              order={index}
              noScale
              disabled={disabled}
              onClick={() => applyPreset(preset)}
              className="orbit-glass-control inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 text-xs text-orbit-foreground hover:bg-white/10"
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-full"
                style={{
                  background: `linear-gradient(135deg, ${preset.colors.accent} 50%, ${preset.colors.canvas} 50%)`,
                }}
              />
              {preset.name}
            </Focusable>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-orbit-muted">
          Image palette
        </h3>
        <p className="mt-1 text-xs text-orbit-muted">
          Pick a cover or hero and Orbit will extract a palette from it.
        </p>
        <Focusable
          focusId="theme-palette-image"
          group="theme-studio-colors"
          order={PALETTE_PRESETS.length}
          noScale
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="orbit-glass-control mt-3 inline-flex rounded-full bg-white/5 px-4 py-2 text-sm text-orbit-foreground hover:bg-white/10"
        >
          Extract from image
        </Focusable>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-orbit-muted">
          Custom colors
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COLOR_ORDER.map((key) => (
            <label
              key={key}
              className="orbit-glass-control flex items-center gap-3 rounded-card border border-orbit-border bg-orbit-surface/50 p-3"
            >
              <input
                type="color"
                value={colors[key]}
                disabled={disabled}
                onChange={(e) => updateColor(key, e.target.value)}
                className="h-8 w-8 shrink-0 cursor-pointer overflow-hidden rounded border-0 bg-transparent p-0"
              />
              <span className="text-sm text-orbit-muted">{COLOR_LABELS[key]}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
