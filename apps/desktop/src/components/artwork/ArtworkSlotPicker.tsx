import { open } from '@/lib/dialog'
import { ImagePlus, Search, Shuffle, Trash2 } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import type { ArtworkSlot } from '@/lib/artwork'
import { artworkPreview } from '@/lib/artwork'
import { readArtworkFromPath } from '@/lib/artworkApi'

const SLOT_META: Record<
  ArtworkSlot,
  { label: string; hint: string; aspect: string; fit?: 'contain' }
> = {
  cover: {
    label: 'Portrait cover',
    hint: '3:4 box art for library rows',
    aspect: 'aspect-[2/3]',
  },
  hero: {
    label: 'Landscape hero',
    hint: 'Wide banner for game details',
    aspect: 'aspect-[21/9]',
  },
  icon: {
    label: 'Square icon',
    hint: '1:1 tile for library grids',
    aspect: 'aspect-square',
  },
  logo: {
    label: 'Logo',
    hint: 'Transparent wordmark shown in the header',
    aspect: 'aspect-[16/6]',
    fit: 'contain',
  },
}

interface ArtworkSlotPickerProps {
  slot: ArtworkSlot
  value?: string
  order: number
  onChange: (value: string | undefined) => void
  onSearch: () => void
  onRandom?: () => void
  busy?: boolean
  disabled?: boolean
}

export function ArtworkSlotPicker({
  slot,
  value,
  order,
  onChange,
  onSearch,
  onRandom,
  busy,
  disabled,
}: ArtworkSlotPickerProps) {
  const meta = SLOT_META[slot]
  const preview = artworkPreview({ [slot]: value }, slot)

  const pickFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }],
    })
    if (!selected || Array.isArray(selected)) return
    const dataUrl = await readArtworkFromPath(selected)
    onChange(dataUrl)
  }

  return (
    <div className="orbit-panel overflow-hidden rounded-theme">
      <div className="border-b border-orbit-border/50 px-4 py-3">
        <p className="font-medium">{meta.label}</p>
        <p className="text-xs text-orbit-muted">{meta.hint}</p>
      </div>
      <div
        className={`${meta.aspect} bg-orbit-surface bg-center bg-no-repeat ${meta.fit === 'contain' ? 'bg-contain' : 'bg-cover'}`}
        style={preview ? { backgroundImage: `url(${preview})` } : undefined}
      >
        {!preview && (
          <div className="flex h-full items-center justify-center text-sm text-orbit-muted">
            No image
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 p-3">
        <Focusable
          focusId={`artwork-file-${slot}`}
          group="artwork-slots"
          order={order * 4}
          noScale
          disabled={disabled}
          onClick={() => void pickFile()}
          className="inline-flex items-center gap-2 rounded-card bg-orbit-accent px-3 py-2 text-sm font-semibold text-orbit-canvas"
        >
          <ImagePlus className="h-4 w-4" />
          File
        </Focusable>
        <Focusable
          focusId={`artwork-web-${slot}`}
          group="artwork-slots"
          order={order * 4 + 1}
          noScale
          disabled={disabled}
          onClick={onSearch}
          className="orbit-glass-control inline-flex items-center gap-2 rounded-card bg-white/10 px-3 py-2 text-sm"
        >
          <Search className="h-4 w-4" />
          Browse images
        </Focusable>
        {onRandom && (
          <Focusable
            focusId={`artwork-random-${slot}`}
            group="artwork-slots"
            order={order * 4 + 2}
            noScale
            disabled={disabled}
            onClick={onRandom}
            className="orbit-glass-control inline-flex items-center gap-2 rounded-card bg-white/10 px-3 py-2 text-sm"
            aria-label={`Random SteamGridDB ${meta.label.toLowerCase()}`}
          >
            <Shuffle className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Finding…' : 'Random SteamGridDB'}
          </Focusable>
        )}
        {value && (
          <Focusable
            focusId={`artwork-clear-${slot}`}
            group="artwork-slots"
            order={order * 4 + 3}
            noScale
            disabled={disabled}
            onClick={() => onChange(undefined)}
            className="orbit-glass-control inline-flex items-center gap-2 rounded-card bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </Focusable>
        )}
      </div>
    </div>
  )
}
