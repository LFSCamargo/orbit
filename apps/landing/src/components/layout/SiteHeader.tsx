import Link from 'next/link'
import { SiteNav } from './SiteNav'

export function SiteHeader() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-4 py-3">
      <div className="orbit-glass relative mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full px-2 py-2">
        <Link href="/" className="flex items-center pl-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
          <img src="/assets/orbit-logo.png" alt="Orbit" className="h-8 w-auto" />
        </Link>
        <SiteNav />
      </div>
    </header>
  )
}
