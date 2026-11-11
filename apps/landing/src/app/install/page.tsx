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
    'Install Orbit on macOS, Windows, or Linux, verify your download, update the app, or build it from source.',
}

const CONTENTS = [
  { id: 'macos', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
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
    <div className="mx-auto grid max-w-7xl gap-12 px-6 py-16 lg:grid-cols-[13rem_1fr] lg:py-24">
      <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
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
            macOS · Windows · Linux
          </p>
          <h1 className="mt-5 text-5xl font-medium tracking-[-0.05em] sm:text-6xl">
            Install Orbit
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-orbit-muted">
            Pick your desktop platform below. Release pages provide prebuilt files when
            available; the source build works as an alternative on every supported
            desktop.
          </p>
          <p className="mt-4 text-sm text-orbit-muted">
            New to Orbit?{' '}
            <Link href="/docs" className="text-orbit-accent hover:text-orbit-focus">
              Read what it does first
            </Link>
            .
          </p>
        </header>

        <InstallSection id="macos" title="macOS" step={1}>
          <p>
            Requires macOS 12 Monterey or later. Published installers prefer Apple
            Silicon; Intel Macs can use a compatible release or build from source.
          </p>
          <div className="pt-2">
            <DownloadButton release={latest} platform="macos" />
          </div>
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
            An <code>.app.tar.gz</code> archive is also available in releases that include
            it:
          </p>
          <CodeBlock>{`tar -xzf Orbit-${version}-aarch64.app.tar.gz\nmv Orbit.app /Applications/`}</CodeBlock>
        </InstallSection>

        <InstallSection id="windows" title="Windows" step={2}>
          <p>
            Use the Windows <code>.exe</code> installer when it is attached to the
            release. An <code>.msi</code> package may also be available for managed
            installations.
          </p>
          <div className="pt-2">
            <DownloadButton release={latest} platform="windows" compact />
          </div>
          <ol>
            <li>Download the x86-64 or ARM64 installer that matches your PC.</li>
            <li>Open the installer and follow the setup prompts.</li>
            <li>
              If SmartScreen warns about an unrecognized app, verify the file checksum and
              publisher details before choosing whether to continue.
            </li>
            <li>Start Orbit from the Start menu and choose your game folders.</li>
          </ol>
          <p>
            No Windows bundle in the latest release?{' '}
            <a href="#source" className="text-orbit-accent hover:text-orbit-focus">
              Build the Windows app from source
            </a>{' '}
            on your PC.
          </p>
        </InstallSection>

        <InstallSection id="linux" title="Linux" step={3}>
          <p>
            Releases may include an <code>AppImage</code>, <code>.deb</code>, and{' '}
            <code>.rpm</code>. Choose AppImage for a portable option or the package format
            used by your distribution.
          </p>
          <div className="pt-2">
            <DownloadButton release={latest} platform="linux" compact />
          </div>
          <h3 className="!mt-6 text-base">AppImage</h3>
          <CodeBlock>{`chmod +x Orbit-${version}-x86_64.AppImage\n./Orbit-${version}-x86_64.AppImage`}</CodeBlock>
          <h3 className="!mt-6 text-base">Debian / Ubuntu</h3>
          <CodeBlock>{`sudo apt install ./Orbit-${version}-amd64.deb`}</CodeBlock>
          <h3 className="!mt-6 text-base">Fedora / RHEL</h3>
          <CodeBlock>{`sudo dnf install ./Orbit-${version}-x86_64.rpm`}</CodeBlock>
          <p>
            Orbit uses the system webview. If your distribution does not install WebKitGTK
            automatically, use your package manager to add the Tauri runtime dependencies
            or use the source instructions below.
          </p>
        </InstallSection>

        <InstallSection id="verify" title="Verify the download">
          <p>
            Releases can include <code>SHA256SUMS.txt</code>. Compare the checksum for
            your downloaded file with the matching line before installing.
          </p>
          <CodeBlock>{`# macOS\nshasum -a 256 ${dmg}\n\n# Linux\nsha256sum Orbit-${version}-x86_64.AppImage\n\n# Windows PowerShell\nGet-FileHash .\\Orbit-${version}-x64-setup.exe -Algorithm SHA256`}</CodeBlock>
        </InstallSection>

        <InstallSection id="update" title="Update and uninstall">
          <p>
            Install the newer package over the existing app. Your library is separate from
            the application bundle, so updating does not require importing again.
          </p>
          <p>
            To uninstall, remove Orbit using Applications on macOS, Apps &amp; Features on
            Windows, or your Linux package manager. Keeping the Orbit application-data
            folder preserves your library; delete that folder only if you also want to
            erase the database, cached artwork, settings, and custom themes.
          </p>
        </InstallSection>

        <InstallSection id="source" title="Build from source">
          <p>
            You need Node.js 22+, Yarn 4, Rust stable, and the platform dependencies for
            Tauri 2. On macOS, install Xcode Command Line Tools. On Windows, install the
            Microsoft C++ Build Tools and WebView2. On Linux, install the WebKitGTK and
            related Tauri development packages.
          </p>
          <CodeBlock>{`git clone ${GITHUB_URL}.git\ncd orbit\nyarn install\nyarn tauri:dev    # development mode\nyarn tauri:build  # create native app bundles`}</CodeBlock>
          <p>
            See <a href={DOCS.running}>RUNNING.md</a> for development modes and
            troubleshooting, or <Link href="/download">browse every release</Link>.
          </p>
        </InstallSection>
      </div>
    </div>
  )
}
