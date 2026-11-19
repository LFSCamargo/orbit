import Link from 'next/link'
import { AppleIcon } from '@/components/download/AppleIcon'
import { buttonClass } from '@/components/ui/button'
import { GITHUB_URL } from '@/lib/site'

const NAV = [
  { href: '/#features', label: 'Overview' },
  { href: '/docs', label: 'Docs' },
  { href: '/install', label: 'Install' },
]

const NAV_LINK =
  'rounded-full px-3 py-1.5 text-white/80 transition hover:bg-white/[0.08] hover:text-white'

export function SiteHeader() {
  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-4 py-3">
      <div className="orbit-glass mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full px-2 py-2">
        <Link href="/" className="flex items-center pl-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
          <img src="/assets/orbit-logo.png" alt="Orbit" className="h-8 w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 text-sm sm:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={NAV_LINK}>
              {item.label}
            </Link>
          ))}
          <a href={GITHUB_URL} className={NAV_LINK}>
            GitHub
          </a>
        </nav>
        <Link href="/download" className={buttonClass({ className: 'min-h-[40px]' })}>
          <AppleIcon className="h-4 w-4" />
          Download
        </Link>
      </div>
    </header>
  )
}
