import type { Metadata } from 'next'
import Link from 'next/link'
import { DownloadButton } from '@/components/download/DownloadButton'
import { CodeBlock } from '@/components/install/CodeBlock'
import { InstallSection } from '@/components/install/InstallSection'
import { fetchReleases } from '@/lib/github'
import { latestStable } from '@/lib/releases'
import { DOCS, GITHUB_URL } from '@/lib/site'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Install',
  description:
    'Install Orbit on your Mac, verify your download, update the app, or build it from source.',
}

const CONTENTS = [
  { id: 'macos', label: 'Install on your Mac' },
  { id: 'first-launch', label: 'First launch' },
  { id: 'verify', label: 'Verify downloads' },
  { id: 'update', label: 'Update and uninstall' },
  { id: 'source', label: 'Build from source' },
]

export default async function InstallPage() {
  const releases = await fetchReleases()
  const latest = releases ? latestStable(releases) : undefined
  const version = latest?.version ?? '<version>'
  const dmg = `Orbit-${version}-aarch64.dmg`

  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-32 lg:grid-cols-[13rem_1fr] lg:pb-28 lg:pt-36">
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
            macOS · Apple silicon
          </p>
          <h1 className="mt-5 text-5xl font-medium tracking-[-0.05em] sm:text-6xl">
            Install Orbit
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-orbit-muted">
            Orbit is a Mac app: download the disk image, drag it to Applications, and its
            first launch sets up everything Windows games need.
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
          <div className="pt-2">
            <DownloadButton release={latest} />
          </div>
          <ol>
            <li>
              Open <code>{dmg}</code> from your Downloads folder.
            </li>
            <li>Drag Orbit into Applications, then eject the disk image.</li>
            <li>Launch Orbit and grant access when asked for your game folders.</li>
          </ol>
          <h3 className="!mt-6 text-base">If macOS says it could not verify Orbit</h3>
          <p>
            Open <strong>System Settings → Privacy &amp; Security</strong>, scroll to the
            Orbit message, and choose <strong>Open Anyway</strong>. You only do this once;
            later launches and updates open normally.
          </p>
          <h3 className="!mt-6 text-base">Why the extra step</h3>
          <p>
            macOS trusts apps whose developer pays for an Apple Developer ID and sends
            every build to Apple for a malware scan, called notarization. Orbit is an
            independent open-source project and is not enrolled yet, so macOS cannot tell
            who made it and asks you to approve it yourself. It says nothing bad about the
            app: every release is built from the public source on{' '}
            <a href={GITHUB_URL}>GitHub</a> by its release workflow, and you can{' '}
            <a href="#verify">check its checksum</a> before opening it.
          </p>
          <h3 className="!mt-6 text-base">What comes next</h3>
          <p>
            Signing and notarizing Orbit is planned for an upcoming release. After that,
            macOS will only ask once whether you want to open an app downloaded from the
            internet, the same as any other Mac app, and this section will go away.
          </p>
          <details className="group">
            <summary className="cursor-pointer text-orbit-foreground">
              Still blocked, or macOS says Orbit is damaged?
            </summary>
            <div className="mt-3 space-y-3">
              <p>
                In rare cases macOS cannot check the download at all and shows no Open
                Anyway button. Removing the mark macOS puts on downloaded files lets Orbit
                open:
              </p>
              <CodeBlock>
                xattr -dr com.apple.quarantine /Applications/Orbit.app
              </CodeBlock>
            </div>
          </details>
        </InstallSection>

        <InstallSection id="first-launch" title="First launch" step={2}>
          <p>
            Orbit opens with a short setup. It installs Orbit Wine and prepares the game
            container Windows games run in, adds Game Porting Toolkit, DXMT and DXVK where
            you choose, signs you in to Steam if you like, and scans your Mac for games.
            Everything can be changed later in Settings.
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
            Install the newer package over the existing app. Your library is separate from
            the application bundle, so updating does not require importing again.
          </p>
          <p>
            To uninstall, move Orbit from Applications to the Trash. Your library lives in{' '}
            <code>~/Library/Application Support/Orbit</code>; keeping it preserves your
            library, and deleting it also erases the database, cached artwork, settings,
            custom themes, Orbit Wine and your game containers.
          </p>
        </InstallSection>

        <InstallSection id="source" title="Build from source">
          <p>
            You need a Mac with Xcode Command Line Tools, Node.js 22+, Yarn 4 and Rust
            stable.
          </p>
          <CodeBlock>{`git clone ${GITHUB_URL}.git\ncd orbit\nyarn install\nyarn tauri:dev    # development mode\nyarn release:macos --install  # build Orbit.app and copy it to Applications`}</CodeBlock>
          <p>
            See <a href={DOCS.running}>RUNNING.md</a> for development modes and
            troubleshooting, or <Link href="/download">browse every release</Link>.
          </p>
        </InstallSection>
      </div>
    </div>
  )
}
