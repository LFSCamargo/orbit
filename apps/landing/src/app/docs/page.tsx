import type { Metadata } from 'next'
import Link from 'next/link'
import { DOCS } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Learn what Orbit does: import your games, navigate with a controller, customize themes, manage artwork, and keep your library local.',
}

const CONTENTS = [
  { id: 'what-is-orbit', label: 'What is Orbit?' },
  { id: 'library', label: 'Your library' },
  { id: 'controllers', label: 'Controller navigation' },
  { id: 'sessions', label: 'Launching and playtime' },
  { id: 'artwork', label: 'Artwork and metadata' },
  { id: 'themes', label: 'Themes' },
  { id: 'local-data', label: 'Local data and privacy' },
  { id: 'boundaries', label: 'What Orbit does not do' },
]

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[14rem_1fr] lg:py-24">
      <aside>
        <nav aria-label="Documentation" className="lg:sticky lg:top-28">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-orbit-accent">
            Orbit manual
          </p>
          <ul className="mt-5 space-y-3 text-sm">
            {CONTENTS.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-orbit-muted hover:text-orbit-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-8 border-t border-orbit-border pt-6 text-sm">
            <Link href="/install" className="text-orbit-accent hover:text-orbit-focus">
              Installation guide →
            </Link>
          </div>
        </nav>
      </aside>

      <article className="docs-prose min-w-0 max-w-3xl">
        <header>
          <p className="!mt-0 font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
            Documentation
          </p>
          <h1 className="mt-5 text-5xl font-medium tracking-[-0.05em] sm:text-6xl">
            Your library,
            <br />
            without the busywork.
          </h1>
          <p className="max-w-2xl !text-base">
            Orbit is a controller-first desktop launcher that gives the games you already
            own one consistent, cinematic home. This guide explains the product, not just
            the setup.
          </p>
        </header>

        <section id="what-is-orbit" className="scroll-mt-28">
          <h2>What is Orbit?</h2>
          <p>
            Orbit sits between your game libraries and your screen. It indexes game paths,
            presents them as a visual collection, launches the original game or launcher,
            and keeps a local record of your sessions. It is especially useful on a TV,
            living-room PC, or any setup where a controller is easier than a mouse.
          </p>
          <p>
            Think of it as a front end for your collection—not a store, subscription,
            emulator, or replacement for the services that installed your games.
          </p>
        </section>

        <section id="library" className="scroll-mt-28">
          <h2>Your library</h2>
          <p>
            The home screen highlights a featured game and recent activity. The library
            gives you a filterable grid, and search helps you find a title quickly. You
            can favorite games, hide entries, edit details, or add a game manually.
          </p>
          <h3>Import sources</h3>
          <ul>
            <li>
              <strong>Steam:</strong> discover installed titles from your local Steam
              library.
            </li>
            <li>
              <strong>Astris:</strong> import supported game files from a folder you
              choose.
            </li>
            <li>
              <strong>GameHub:</strong> browse and import an existing local GameHub
              library.
            </li>
            <li>
              <strong>Native apps and manual paths:</strong> add games from your computer
              or point Orbit directly at an executable or app.
            </li>
          </ul>
          <p>
            Imports use local files. Orbit does not sign in to Steam or download games on
            your behalf.
          </p>
        </section>

        <section id="controllers" className="scroll-mt-28">
          <h2>Controller navigation</h2>
          <p>
            Spatial focus is built into the interface. Use a D-pad or analog stick to
            move, A to select, B to go back, shoulder buttons to change sections, and Menu
            for settings. The same actions remain available from the keyboard.
          </p>
          <p>
            Focus states are intentionally visible so you always know where the next input
            will go, even from across the room.
          </p>
        </section>

        <section id="sessions" className="scroll-mt-28">
          <h2>Launching and playtime</h2>
          <p>
            When you press play, Orbit starts the configured local target and tracks the
            process as a session. The playing screen stays out of your way; when the game
            exits, Orbit records the session and returns you to your library.
          </p>
          <p>
            Playtime and recent activity are descriptive stats for your collection. They
            are not an online leaderboard or social profile.
          </p>
        </section>

        <section id="artwork" className="scroll-mt-28">
          <h2>Artwork and metadata</h2>
          <p>
            Each game can have a cover, hero image, icon, title, and description. Choose
            local artwork or explicitly search supported public artwork providers from the
            app. You can edit the result at any time, so the library reflects your taste.
          </p>
          <p>
            Orbit does not silently scrape artwork in the background. Provider features
            may require your own API key, which is stored locally.
          </p>
        </section>

        <section id="themes" className="scroll-mt-28">
          <h2>Themes</h2>
          <p>
            Themes control the shell around your collection: color, wallpaper, logo,
            motion, and game-specific accents. Use the built-in studio for a visual
            editor, or author plain JSON files for precise control.
          </p>
          <p>
            Read the <a href={DOCS.themes}>theme authoring guide</a> or start from the{' '}
            <a href={DOCS.exampleTheme}>Arcade Neon example</a>.
          </p>
        </section>

        <section id="local-data" className="scroll-mt-28">
          <h2>Local data and privacy</h2>
          <p>
            Your library database, cached artwork, playtime, settings, and custom themes
            live on your computer. Orbit has no account system, cloud sync, advertising
            profile, or social feed. Network requests are limited to actions such as
            checking releases or the artwork searches you initiate.
          </p>
        </section>

        <section id="boundaries" className="scroll-mt-28">
          <h2>What Orbit does not do</h2>
          <ul>
            <li>Download or decrypt commercial games.</li>
            <li>Manage licenses, encryption keys, or emulator installations.</li>
            <li>Authenticate with your Steam account.</li>
            <li>Replace the stores or launchers required by your games.</li>
            <li>Sync your collection to a cloud account.</li>
          </ul>
          <p>
            Ready to try it? <Link href="/install">Install Orbit</Link> or browse the{' '}
            <Link href="/download">latest downloads</Link>.
          </p>
        </section>
      </article>
    </div>
  )
}
