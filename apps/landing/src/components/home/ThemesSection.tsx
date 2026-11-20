import Link from 'next/link'
import { ThemePreviewGallery } from '@/components/home/ThemePreviewGallery'
import { Reveal } from '@/components/ui/reveal'

export function ThemesSection() {
  return (
    <section id="themes" className="mx-auto max-w-7xl scroll-mt-24 px-6 py-24 sm:py-32">
      <div className="mb-12">
        <Reveal>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
              Make it yours
            </p>
            <h2 className="mt-5 max-w-xl text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
              A front end with your signature.
            </h2>
            <p className="mt-6 max-w-lg text-base leading-7 text-white/65">
              Start with a console-inspired shell, then tune the color, motion, wallpaper,
              logo, and per-game accents. The built-in studio turns plain JSON into a home
              screen that feels unmistakably yours.
            </p>
            <Link
              href="/docs#themes"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-orbit-accent hover:text-orbit-focus"
            >
              Explore themes and customization
            </Link>
          </div>
        </Reveal>
      </div>
      <Reveal delay={0.1}>
        <ThemePreviewGallery />
      </Reveal>
    </section>
  )
}
