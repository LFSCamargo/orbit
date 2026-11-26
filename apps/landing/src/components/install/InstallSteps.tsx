import type { ComponentType, SVGProps } from 'react'
import { DownloadIcon, LayersIcon, PlayIcon } from '@/components/ui/icons'
import { Reveal } from '@/components/ui/reveal'

const STEPS: {
  title: string
  body: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}[] = [
  {
    title: 'Download',
    body: 'Get the Apple silicon disk image from the latest release.',
    icon: DownloadIcon,
  },
  {
    title: 'Drag to Applications',
    body: 'Open the disk image and drop Orbit into your Applications folder.',
    icon: LayersIcon,
  },
  {
    title: 'Launch and play',
    body: 'A short setup installs Orbit Wine, signs in to Steam if you like, and finds your games.',
    icon: PlayIcon,
  },
]

/** Three steps on a glowing connector, each revealed in turn. */
export function InstallSteps() {
  return (
    <section aria-labelledby="install-steps" className="mx-auto max-w-6xl px-6 py-16">
      <h2 id="install-steps" className="sr-only">
        Install in three steps
      </h2>
      <div className="relative">
        <div
          aria-hidden="true"
          className="install-sweep absolute left-[16%] right-[16%] top-[3.25rem] hidden h-px bg-[linear-gradient(90deg,rgb(255_255_255/0.1),rgb(255_150_80/0.9),rgb(255_255_255/0.1))] md:block"
        />
        <ol className="relative grid gap-6 md:grid-cols-3">
          {STEPS.map((step, index) => {
            const Icon = step.icon
            return (
              <li key={step.title}>
                <Reveal delay={index * 0.12} className="h-full">
                  <div className="orbit-glass group relative flex h-full flex-col items-center rounded-[24px] p-7 text-center transition hover:-translate-y-1">
                    <span className="orbit-btn-fire relative flex h-12 w-12 items-center justify-center rounded-full">
                      <Icon className="h-5 w-5" />
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 font-mono text-[10px] text-orange-200 ring-1 ring-orange-400/60">
                        {index + 1}
                      </span>
                    </span>
                    <h3 className="mt-5 text-lg font-medium text-orbit-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/65">{step.body}</p>
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
