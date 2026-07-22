import { open } from '@tauri-apps/plugin-dialog'
import { ImagePlus, Search, Trash2 } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import type { ArtworkSlot } from '@/lib/artwork'
import { artworkPreview } from '@/lib/artwork'
import { readArtworkFromPath } from '@/lib/artworkApi'

const SLOT_META: Record<
  ArtworkSlot,
  { label: string; hint: string; aspect: string }
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
    hint: '1:1 tile for Switch / PS5 grids',
    aspect: 'aspect-square',
  },
}

interface ArtworkSlotPickerProps {
  slot: ArtworkSlot
  value?: string
  order: number
  onChange: (value: string | undefined) => void
  onSearch: () => void
}

export function ArtworkSlotPicker({
  slot,
  value,
  order,
  onChange,
  onSearch,
}: ArtworkSlotPickerProps) {
  const meta = SLOT_META[slot]
  const preview = artworkPreview(
    { cover: slot === 'cover' ? value : undefined, hero: slot === 'hero' ? value : undefined, icon: slot === 'icon' ? value : undefined },
    slot,
  )

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
        className={`${meta.aspect} bg-orbit-surface bg-cover bg-center`}
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
          order={order * 3}
          noScale
          onClick={() => void pickFile()}
          className="inline-flex items-center gap-2 rounded-card bg-orbit-accent px-3 py-2 text-sm font-semibold text-orbit-canvas"
        >
          <ImagePlus className="h-4 w-4" />
          File
        </Focusable>
        <Focusable
          focusId={`artwork-web-${slot}`}
          group="artwork-slots"
          order={order * 3 + 1}
          noScale
          onClick={onSearch}
          className="inline-flex items-center gap-2 rounded-card bg-white/10 px-3 py-2 text-sm"
        >
          <Search className="h-4 w-4" />
          Web
        </Focusable>
        {value && (
          <Focusable
            focusId={`artwork-clear-${slot}`}
            group="artwork-slots"
            order={order * 3 + 2}
            noScale
            onClick={() => onChange(undefined)}
            className="inline-flex items-center gap-2 rounded-card bg-rose-500/10 px-3 py-2 text-sm text-rose-300"
          >
            <Trash2 className="h-4 w-4" />
            Clear
          </Focusable>
        )}
      </div>
    </div>
  )
}
