import type { Metadata } from 'next'
import Link from 'next/link'
import { DownloadButton } from '@/components/download/DownloadButton'
import { CodeBlock } from '@/components/install/CodeBlock'
import { InstallHero } from '@/components/install/InstallHero'
import { InstallSection } from '@/components/install/InstallSection'
import { InstallSteps } from '@/components/install/InstallSteps'
import { buttonClass } from '@/components/ui/button'
import { fetchLatestRelease } from '@/lib/github'
import { pageMetadata } from '@/lib/seo'
import { DOCS, GITHUB_URL } from '@/lib/site'

export const revalidate = 120

export const metadata: Metadata = pageMetadata({
  title: 'Install',
  description:
    'Get Orbit running in minutes: download it for your Mac, set it up, verify your download, update the app, or build it from source.',
  path: '/install',
})

const CONTENTS = [
  { id: 'macos', label: 'Install on your Mac' },
  { id: 'first-launch', label: 'First launch' },
  { id: 'verify', label: 'Verify downloads' },
  { id: 'update', label: 'Update and uninstall' },
  { id: 'source', label: 'Build from source' },
]

export default async function InstallPage() {
  const latest = await fetchLatestRelease()
  const version = latest?.version ?? '<version>'
  const dmg = `Orbit-${version}-aarch64.dmg`

  return (
    <>
      <InstallHero latest={latest} version={latest?.version ?? 'latest'} />
      <InstallSteps />
      <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-10 lg:grid-cols-[13rem_1fr] lg:pb-24">
        <nav
          aria-label="On this page"
          className="orbit-glass rounded-[20px] p-5 lg:sticky lg:top-28 lg:self-start"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-orbit-accent">
            Installation
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
        </nav>

        <div className="min-w-0 max-w-3xl space-y-12">
          <header>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-orbit-accent">
              Detailed guide
            </p>
            <h2 className="mt-4 text-4xl font-medium tracking-[-0.045em] sm:text-5xl">
              Install Orbit, step by step
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-orbit-muted">
              Orbit is a Mac app: download the disk image, drag it to Applications, and
              its first launch sets up everything Windows games need.
            </p>
            <p className="mt-4 text-sm text-orbit-muted">
              New to Orbit?{' '}
              <Link href="/docs" className="text-orbit-accent hover:text-orbit-focus">
                Read what it does first
              </Link>
              .
            </p>
          </header>

          <InstallSection id="macos" title="Install on your Mac" step={1}>
            <p>
              Requires a Mac with Apple silicon and macOS 12 Monterey or later. Windows
              games also need Rosetta 2, which macOS offers to install the first time one
              starts.
            </p>
            <ol>
              <li>
                Open <code>{dmg}</code> from your Downloads folder.
              </li>
              <li>Drag Orbit into Applications, then eject the disk image.</li>
              <li>Launch Orbit and grant access when asked for your game folders.</li>
            </ol>
            <h3 className="!mt-6 text-base">If macOS blocks the first launch</h3>
            <p>
              Orbit is not notarized by Apple yet. Open{' '}
              <strong>System Settings → Privacy &amp; Security</strong>, find the Orbit
              message, and choose <strong>Open Anyway</strong>. If macOS reports that the
              app is damaged, remove its quarantine attribute:
            </p>
            <CodeBlock>xattr -dr com.apple.quarantine /Applications/Orbit.app</CodeBlock>
            <p>
              An <code>.app.tar.gz</code> archive is also available in releases that
              include it:
            </p>
            <CodeBlock>{`tar -xzf Orbit-${version}-aarch64.app.tar.gz\nmv Orbit.app /Applications/`}</CodeBlock>
          </InstallSection>

          <InstallSection id="first-launch" title="First launch" step={2}>
            <p>
              Orbit opens with a short setup. It installs Orbit Wine and prepares the game
              container Windows games run in, adds Game Porting Toolkit, DXMT and DXVK
              where you choose, signs you in to Steam if you like, and scans your Mac for
              games. Everything can be changed later in Settings.
            </p>
          </InstallSection>

          <InstallSection id="verify" title="Verify the download">
            <p>
              Releases can include <code>SHA256SUMS.txt</code>. Compare the checksum for
              your downloaded file with the matching line before installing.
            </p>
            <CodeBlock>{`shasum -a 256 ${dmg}`}</CodeBlock>
          </InstallSection>

          <InstallSection id="update" title="Update and uninstall">
            <p>
              Install the newer package over the existing app. Your library is separate
              from the application bundle, so updating does not require importing again.
            </p>
            <p>
              To uninstall, move Orbit from Applications to the Trash. Your library lives
              in <code>~/Library/Application Support/Orbit</code>; keeping it preserves
              your library, and deleting it also erases the database, cached artwork,
              settings, custom themes, Orbit Wine and your game containers.
            </p>
          </InstallSection>

          <InstallSection id="source" title="Build from source">
            <p>
              You need a Mac with Xcode Command Line Tools, Node.js 22+, Bun and Rust
              stable.
            </p>
            <CodeBlock>{`git clone ${GITHUB_URL}.git\ncd orbit\nbun install\nbun run tauri:dev    # development mode\nbun run release:macos --install  # build Orbit.app and copy it to Applications`}</CodeBlock>
            <p>
              See <a href={DOCS.running}>RUNNING.md</a> for development modes and
              troubleshooting, or <Link href="/download">browse every release</Link>.
            </p>
          </InstallSection>
        </div>
      </div>
      <section className="relative isolate overflow-hidden px-6 pb-28 pt-8">
        <div className="orbit-glass relative mx-auto max-w-5xl overflow-hidden rounded-[32px] px-8 py-14 text-center sm:px-14">
          <div
            aria-hidden="true"
            className="glow-breathe pointer-events-none absolute -bottom-40 left-1/2 -z-10 h-72 w-[120%] -translate-x-1/2 rounded-[100%] bg-[radial-gradient(50%_50%,rgb(255_120_50/0.4),transparent_70%)]"
          />
          <h2 className="text-4xl font-medium tracking-[-0.045em] sm:text-5xl">
            Ready to <span className="fire-text">play?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-white/70">
            Your games are one download away. Orbit is free, open source and keeps your
            library on your Mac.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <DownloadButton release={latest} />
            <Link
              href="/docs"
              className={buttonClass({ variant: 'secondary', size: 'lg' })}
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
