import Link from 'next/link'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { GITHUB_URL } from '@/lib/site'

const NAV = [
  { href: '/#features', label: 'Overview' },
  { href: '/docs', label: 'Docs' },
  { href: '/install', label: 'Install' },
]

export function SiteHeader() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-4 py-3">
      <LiquidGlass
        radius={999}
        className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-2 py-2"
        aberration={100}
        frost={5}
        tint={0}
      >
        <Link href="/" className="flex items-center pl-2">
          <img src="/assets/orbit-logo.png" alt="Orbit" className="h-10 w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm sm:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/[0.08] hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            className="rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/[0.08] hover:text-white"
          >
            GitHub
          </a>
        </nav>
        <Link
          href="/download"
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-orbit-canvas transition hover:bg-orange-300"
        >
          Download
        </Link>
      </LiquidGlass>
    </header>
  )
}
