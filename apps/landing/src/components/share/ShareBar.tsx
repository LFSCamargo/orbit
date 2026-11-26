'use client'

import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import {
  BlueskyIcon,
  CheckIcon,
  FacebookIcon,
  HackerNewsIcon,
  LinkIcon,
  LinkedInIcon,
  RedditIcon,
  ShareIcon,
  XLogoIcon,
} from '@/components/ui/icons'
import { shareTargets, type ShareNetwork } from '@/lib/share'

const ICONS: Record<ShareNetwork, ComponentType<SVGProps<SVGSVGElement>>> = {
  x: XLogoIcon,
  bluesky: BlueskyIcon,
  linkedin: LinkedInIcon,
  reddit: RedditIcon,
  hackernews: HackerNewsIcon,
  facebook: FacebookIcon,
}

const BUTTON =
  'orbit-glass inline-flex h-10 items-center justify-center gap-2 rounded-full px-3.5 text-sm text-white/80 transition hover:-translate-y-0.5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-orbit-focus'

/** Share links for each network, copy-link, and the system share sheet
 * where the browser has one. */
export function ShareBar({
  url,
  title,
  label = 'Share',
}: {
  url: string
  title: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    setCanNativeShare(
      typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    )
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-orbit-muted">
        {label}
      </p>
      <ul className="flex flex-wrap gap-2" aria-label={label}>
        {shareTargets(url, title).map((target) => {
          const Icon = ICONS[target.network]
          return (
            <li key={target.network}>
              <a
                href={target.url}
                target="_blank"
                rel="noopener noreferrer"
                className={BUTTON}
                aria-label={`Share on ${target.label}`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{target.label}</span>
              </a>
            </li>
          )
        })}
        <li>
          <button type="button" onClick={copy} className={BUTTON} aria-live="polite">
            {copied ? (
              <CheckIcon className="h-4 w-4 text-orbit-accent" />
            ) : (
              <LinkIcon className="h-4 w-4" />
            )}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </li>
        {canNativeShare && (
          <li>
            <button
              type="button"
              className={BUTTON}
              onClick={() => navigator.share({ title, url }).catch(() => undefined)}
            >
              <ShareIcon className="h-4 w-4" />
              More
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}
