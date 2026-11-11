import Link from 'next/link'
import { DOCS, GITHUB_URL } from '@/lib/site'

const PRODUCT_LINKS = [
  { href: '/#features', label: 'Overview' },
  { href: '/docs', label: 'Documentation' },
  { href: '/install', label: 'Install' },
  { href: '/download', label: 'All releases' },
]

const PROJECT_LINKS = [
  { href: GITHUB_URL, label: 'Source code' },
  { href: DOCS.changelog, label: 'Changelog' },
  { href: DOCS.contributing, label: 'Contributing' },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-orbit-border bg-black/20">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-14 sm:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 font-semibold">
            <img
              src="/assets/orbit-logo.png"
              alt="Orbit"
              className="h-7 w-auto opacity-90"
            />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-6 text-orbit-muted">
            A local, controller-first home for the games you already own.
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-orbit-muted">
            Product
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-orbit-muted hover:text-orbit-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-orbit-muted">
            Project
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {PROJECT_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-orbit-muted hover:text-orbit-foreground"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-2 border-t border-white/[0.06] px-6 py-6 font-mono text-[10px] uppercase tracking-widest text-orbit-muted sm:flex-row sm:justify-between">
        <p>Orbit is free and open source.</p>
        <p>No accounts. No cloud. Just play.</p>
      </div>
    </footer>
  )
}
