import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="mt-3 text-orbit-muted">
        That page or version doesn&apos;t exist. Pick a release from the download page.
      </p>
      <Link
        href="/download"
        className="mt-8 inline-flex rounded-full bg-orbit-accent px-6 py-3 font-semibold text-orbit-canvas"
      >
        Go to downloads
      </Link>
    </div>
  )
}
