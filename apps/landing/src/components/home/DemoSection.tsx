'use client'

import Image from 'next/image'
import { useState } from 'react'
import { Reveal } from '@/components/ui/reveal'
import { cn } from '@/lib/utils'

type Demo =
  | {
      id: string
      label: string
      caption: string
      kind: 'video'
      src: string
      poster: string
    }
  | {
      id: string
      label: string
      caption: string
      kind: 'image'
      src: string
      alt: string
    }

export const DEMOS: Demo[] = [
  {
    id: 'features',
    label: 'Orbit features',
    caption:
      'Explore the library, themes, graphics settings and storage, then see God of War and Forza Horizon 6 in action. Original instrumental · 38 seconds.',
    kind: 'video',
    src: '/videos/orbit-launch.mp4',
    poster: '/videos/orbit-launch-poster.jpg',
  },
  {
    id: 'god-of-war',
    label: 'God of War',
    caption:
      'God of War running through Orbit Wine and GPTK 4.0.3. Recorded with keyboard and mouse because controller performance suffered during screen recording. Controllers work normally outside recording. Original instrumental · 45 seconds.',
    kind: 'video',
    src: '/videos/god-of-war.mp4',
    poster: '/videos/god-of-war-poster.jpg',
  },
  {
    id: 'forza',
    label: 'Forza Horizon 6',
    caption:
      'Forza Horizon 6 streamed through Orbit’s Xbox Game Cloud Layer. Original instrumental · 32 seconds.',
    kind: 'video',
    src: '/videos/forza-horizon-6.mp4',
    poster: '/videos/forza-horizon-6-poster.jpg',
  },
  {
    id: 'home',
    label: 'Home',
    caption: 'Pick up where you left off: the last game you played fills the screen.',
    kind: 'image',
    src: '/screenshots/home-devil-may-cry.jpg',
    alt: 'Orbit home screen with Devil May Cry 5 featured above a row of recent games',
  },
  {
    id: 'library',
    label: 'Library',
    caption:
      'Every Steam game, Windows or Mac, with its artwork, in one searchable grid.',
    kind: 'image',
    src: '/screenshots/library-steam.jpg',
    alt: 'Orbit library showing Steam games such as Battlefield, BioShock and Cyberpunk 2077',
  },
  {
    id: 'cloud',
    label: 'Xbox Cloud',
    caption: 'Hundreds of Game Pass titles, streamed in Orbit’s own player.',
    kind: 'image',
    src: '/screenshots/library-xbox-cloud.jpg',
    alt: 'Orbit library showing the Xbox Cloud Gaming catalog',
  },
  {
    id: 'themes',
    label: 'Themes',
    caption: 'Each game brings its own colours to the whole interface.',
    kind: 'image',
    src: '/screenshots/themes/cyberpunk-2077.jpg',
    alt: 'Orbit home screen tinted red for Call of Duty: Modern Warfare III',
  },
]

/** See Orbit before installing it: three launch videos and the main screens. */
export function DemoSection() {
  const [activeId, setActiveId] = useState(DEMOS[0].id)
  const active = DEMOS.find((demo) => demo.id === activeId) ?? DEMOS[0]

  return (
    <section id="demo" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-24 sm:py-32">
      <Reveal>
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
            See it in action
          </p>
          <h2 className="mt-5 text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
            Real games. <span className="fire-text">Really on a Mac.</span>
          </h2>
        </div>
      </Reveal>

      <Reveal delay={0.1}>
        <div
          role="tablist"
          aria-label="Orbit demos"
          className="orbit-glass mx-auto mt-12 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full p-1.5"
        >
          {DEMOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              role="tab"
              id={`demo-tab-${demo.id}`}
              aria-selected={demo.id === active.id}
              aria-controls="demo-panel"
              onClick={() => setActiveId(demo.id)}
              className={cn(
                'shrink-0 rounded-full px-4 py-2 text-sm font-medium transition',
                demo.id === active.id
                  ? 'bg-white text-zinc-950'
                  : 'text-white/70 hover:bg-white/[0.08] hover:text-white',
              )}
            >
              {demo.label}
            </button>
          ))}
        </div>

        <div
          id="demo-panel"
          role="tabpanel"
          aria-labelledby={`demo-tab-${active.id}`}
          className="relative mt-8"
        >
          <div className="absolute inset-x-[8%] -top-8 h-40 rounded-full bg-orange-500/20 blur-[100px]" />
          <figure className="orbit-glass relative overflow-hidden rounded-[26px] p-2 sm:p-3">
            <div className="relative aspect-video overflow-hidden rounded-[18px] bg-black">
              {active.kind === 'video' ? (
                <video
                  key={active.src}
                  src={active.src}
                  poster={active.poster}
                  className="h-full w-full object-cover"
                  playsInline
                  controls
                  preload="metadata"
                  aria-label={active.caption}
                />
              ) : (
                <Image
                  key={active.src}
                  src={active.src}
                  alt={active.alt}
                  fill
                  sizes="(min-width: 1280px) 1232px, 100vw"
                  className="object-cover"
                />
              )}
            </div>
            <figcaption className="px-3 pb-1 pt-4 text-center text-sm text-white/65">
              {active.caption}
            </figcaption>
          </figure>
        </div>
      </Reveal>
    </section>
  )
}
