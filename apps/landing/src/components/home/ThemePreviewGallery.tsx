'use client'

import Image from 'next/image'
import { useState } from 'react'
import { GlassPanel } from '@/components/ui/glass-panel'
import { cn } from '@/lib/utils'

const PREVIEWS = [
  { id: 'devil-may-cry-5', name: 'Devil May Cry 5' },
  { id: 'god-of-war', name: 'God of War' },
  { id: 'cyberpunk-2077', name: 'Cyberpunk 2077' },
  { id: 'zelda-ocarina-of-time', name: 'Zelda: Ocarina of Time Remake' },
  { id: 'gta-vi', name: 'Grand Theft Auto VI' },
]

/** A fixed five-item gallery: only the selected full-size preview is mounted. */
export function ThemePreviewGallery() {
  const [activeId, setActiveId] = useState(PREVIEWS[0].id)
  const active = PREVIEWS.find((preview) => preview.id === activeId) ?? PREVIEWS[0]

  return (
    <div>
      <GlassPanel as="figure" className="overflow-hidden p-2 sm:p-3">
        <div className="relative aspect-video overflow-hidden rounded-[18px] bg-black">
          <Image
            src={`/screenshots/themes/${active.id}.jpg`}
            alt={`Orbit with the ${active.name} theme applied`}
            fill
            sizes="(min-width: 1280px) 1208px, (min-width: 640px) calc(100vw - 72px), calc(100vw - 64px)"
            className="object-contain"
          />
        </div>
        <figcaption className="px-3 pb-2 pt-4 text-center text-sm text-white/75">
          {active.name}
        </figcaption>
      </GlassPanel>

      <div
        aria-label="Theme previews"
        role="group"
        className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        {PREVIEWS.map((preview) => (
          <button
            key={preview.id}
            type="button"
            aria-label={`Preview ${preview.name} theme`}
            aria-pressed={preview.id === active.id}
            onClick={() => setActiveId(preview.id)}
            className={cn(
              'overflow-hidden rounded-2xl border p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orbit-focus focus-visible:ring-offset-4 focus-visible:ring-offset-black',
              preview.id === active.id
                ? 'border-orbit-accent bg-orbit-accent/10'
                : 'border-white/10 bg-white/[0.03] hover:border-white/35 hover:bg-white/[0.06]',
            )}
          >
            <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
              <Image
                src={`/screenshots/themes/${preview.id}.jpg`}
                alt=""
                fill
                sizes="(min-width: 1024px) 224px, (min-width: 640px) 30vw, 45vw"
                className="object-contain"
              />
            </div>
            <span className="block px-2 py-3 text-sm font-medium text-white/85">
              {preview.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
