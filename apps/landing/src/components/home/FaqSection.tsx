import { Reveal } from '@/components/ui/reveal'

export const FAQ = [
  {
    question: 'Is Orbit free?',
    answer:
      'Yes. Orbit is free and open source, with no paid tier, no ads and no account. The code is on GitHub.',
  },
  {
    question: 'Which Macs does Orbit run on?',
    answer:
      'Macs with Apple silicon (M1 or later) on macOS 12 Monterey or later. Windows games also need Rosetta 2, which macOS offers to install on first launch.',
  },
  {
    question: 'How do Windows games run on a Mac?',
    answer:
      'Through Orbit Wine, with D3DMetal from Apple’s Game Porting Toolkit, DXMT and DXVK. Each game gets its own container, set up and kept current for you.',
  },
  {
    question: 'Do I need a controller?',
    answer:
      'No. Orbit is built for controllers over Bluetooth or USB, but every screen works with a keyboard and mouse too.',
  },
  {
    question: 'Does Orbit need an internet connection?',
    answer:
      'Only for what lives online: signing in to Steam, downloading games and artwork, and Xbox Cloud Gaming. Your library and settings are stored on your Mac.',
  },
  {
    question: 'Can I play Xbox Cloud Gaming in Orbit?',
    answer:
      'Yes, with a Microsoft account that includes cloud gaming. Orbit links the account with a code and streams games in its own full-screen player.',
  },
  {
    question: 'Is Orbit a store or an emulator?',
    answer:
      'Neither. Orbit launches the games you already own. It does not sell games and does not ship console emulators.',
  },
]

/** Plain answers to the questions people ask before downloading. */
export function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-6 py-24 sm:py-32">
      <Reveal>
        <p className="text-center font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
          07 — Questions
        </p>
        <h2 className="mt-5 text-center text-4xl font-medium tracking-[-0.045em] sm:text-6xl">
          Good to know.
        </h2>
      </Reveal>
      <div className="mt-14 divide-y divide-white/[0.08] border-y border-white/[0.08]">
        {FAQ.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-base font-medium [&::-webkit-details-marker]:hidden">
              {item.question}
              <span
                aria-hidden="true"
                className="text-xl font-light text-orbit-accent transition group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="pb-6 pr-10 text-sm leading-6 text-white/65">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )
}
