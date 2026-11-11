import { RELEASES_URL } from '@/lib/site'

export function ReleasesUnavailable() {
  return (
    <div className="rounded-panel border border-orbit-border bg-orbit-surface p-6">
      <h2 className="text-lg font-semibold">Releases are temporarily unavailable</h2>
      <p className="mt-2 text-orbit-muted">
        We couldn&apos;t load the release list from GitHub. Every version is still
        available on the{' '}
        <a href={RELEASES_URL} className="text-orbit-accent hover:underline">
          GitHub Releases page
        </a>
        .
      </p>
    </div>
  )
}
