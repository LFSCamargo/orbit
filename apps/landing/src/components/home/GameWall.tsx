import Image from 'next/image'

/** Cover art cropped from Orbit's own library and home screens. */
const ROWS = [
  [
    'god-of-war',
    'devil-may-cry-5',
    'cyberpunk-2077',
    '33-immortals',
    'resident-evil-2',
    'battlefield-4',
    'hogwarts-legacy',
    'age-of-empires-4',
    'counter-strike-2',
    'aliens-dark-descent',
    'skate',
    'bioshock-infinite',
    'absolum',
    'watch-dogs',
    'aphelion',
  ],
  [
    'call-of-duty-mw3',
    'abiotic-factor',
    'bioshock-remastered',
    'expendabros',
    'battlefield-5',
    'age-of-mythology',
    'grounds',
    'black-ops-3',
    'abyssus',
    'chained-together',
    'albion-online',
    'bioshock-2-remastered',
    'aniimo',
    'age-of-empires-2',
    'anno-mutationem',
  ],
]

/** Two rows of real covers drifting past each other: the library, at a glance. */
export function GameWall() {
  return (
    <section aria-labelledby="game-wall-title" className="relative py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
          Hundreds of games, one shelf
        </p>
        <h2
          id="game-wall-title"
          className="mx-auto mt-5 max-w-3xl text-4xl font-medium tracking-[-0.045em] sm:text-6xl"
        >
          Your whole library. <span className="fire-text">Finally in one place.</span>
        </h2>
      </div>
      <div
        aria-hidden="true"
        className="mt-14 space-y-4 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]"
      >
        {ROWS.map((row, index) => (
          <div
            key={row[0]}
            className={`game-marquee flex w-max gap-4 ${index % 2 ? 'game-marquee-reverse' : ''}`}
          >
            {[...row, ...row].map((slug, i) => (
              <Image
                key={`${slug}-${i}`}
                src={`/covers/${slug}.jpg`}
                alt=""
                width={160}
                height={160}
                sizes="160px"
                className="h-32 w-32 shrink-0 rounded-[22px] object-cover shadow-[0_12px_30px_rgb(0_0_0/0.45)] ring-1 ring-white/10 sm:h-40 sm:w-40"
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
