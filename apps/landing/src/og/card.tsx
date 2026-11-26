import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import type { ReactNode } from 'react'

/** Every social card is the standard 1200×630 Open Graph size, which X,
 * LinkedIn, Facebook, Slack, Discord, iMessage and WhatsApp all accept. */
const OG_SIZE = { width: 1200, height: 630 }

/** `text` cut at a word boundary to at most `max` characters, with an ellipsis. */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.—-]+$/, '')}…`
}

type OgVariant = 'landing' | 'blog' | 'changelog' | 'install' | 'docs' | 'download'

export interface OgCardProps {
  variant: OgVariant
  /** Small label above the title (the card's section). */
  eyebrow?: string
  /** Title lines; wrap a part in `highlight` to paint it with Orbit's fire. */
  title: { text: string; highlight?: boolean }[][]
  subtitle?: string
  /** Pills under the subtitle; the first can be emphasised (a version). */
  badges?: { label: string; emphasis?: boolean; check?: boolean }[]
}

const ASSETS = join(process.cwd(), 'src/og/assets')

let assets: Promise<{
  background: string
  logo: string
  medium: Buffer
  bold: Buffer
}> | null = null

function loadAssets() {
  assets ??= Promise.all([
    readFile(join(ASSETS, 'og-background.jpg')),
    readFile(join(ASSETS, 'orbit-logo.png')),
    readFile(join(ASSETS, 'dm-sans-latin-500-normal.woff')),
    readFile(join(ASSETS, 'dm-sans-latin-700-normal.woff')),
  ]).then(([background, logo, medium, bold]) => ({
    background: `data:image/jpeg;base64,${background.toString('base64')}`,
    logo: `data:image/png;base64,${logo.toString('base64')}`,
    medium,
    bold,
  }))
  return assets
}

const FIRE = '#ff7a1f'
const FIRE_GRADIENT = 'linear-gradient(90deg, #ff9a3c 0%, #ff6a1a 100%)'

function Icon({ variant }: { variant: OgVariant }): ReactNode {
  const common = {
    width: 30,
    height: 30,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: FIRE,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (variant) {
    case 'blog':
      return (
        <svg {...common}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      )
    case 'changelog':
      return (
        <svg {...common}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      )
    case 'install':
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
      )
    case 'docs':
      return (
        <svg {...common}>
          <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" />
          <path d="M4 19a2 2 0 0 1 2-2h13" />
        </svg>
      )
    default:
      return null
  }
}

function Check() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f5f5f4"
      strokeWidth="2.6"
    >
      <path d="m5 12 5 5 9-10" />
    </svg>
  )
}

/** The Orbit social card: the space scene and planet horizon behind the
 * wordmark, an optional section eyebrow, a two-tone title and pills. */
export async function renderOgCard({
  variant,
  eyebrow,
  title,
  subtitle,
  badges,
}: OgCardProps) {
  const { background, logo, medium, bold } = await loadAssets()
  const longest = Math.max(
    ...title.map((line) => line.map((part) => part.text).join('').length),
  )
  const titleSize = longest > 30 ? 58 : longest > 22 ? 70 : 82

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        fontFamily: 'DM Sans',
        color: '#f5f5f4',
        backgroundColor: '#070607',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- satori draws plain img */}
      <img
        src={background}
        alt=""
        width={1200}
        height={630}
        style={{ position: 'absolute', inset: 0 }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 18,
          borderRadius: 34,
          border: '1.5px solid rgba(255, 150, 80, 0.38)',
          display: 'flex',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '60px 72px',
          width: '100%',
          height: '100%',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- satori draws plain img */}
        <img src={logo} alt="Orbit" width={188} height={63} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: eyebrow ? 'flex-start' : 'center',
            marginTop: eyebrow ? 34 : 0,
            flexGrow: 1,
            paddingBottom: eyebrow ? 0 : 70,
          }}
        >
          {eyebrow ? (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}
            >
              <Icon variant={variant} />
              <span style={{ fontSize: 30, fontWeight: 500, color: FIRE }}>
                {eyebrow}
              </span>
            </div>
          ) : null}
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 900 }}>
            {title.map((line, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  fontSize: titleSize,
                  fontWeight: 700,
                  lineHeight: 1.02,
                  letterSpacing: -2.4,
                }}
              >
                {line.map((part, partIndex) => (
                  <span
                    key={partIndex}
                    style={
                      part.highlight
                        ? {
                            backgroundImage: FIRE_GRADIENT,
                            backgroundClip: 'text',
                            color: 'transparent',
                            whiteSpace: 'pre',
                          }
                        : { whiteSpace: 'pre' }
                    }
                  >
                    {part.text}
                  </span>
                ))}
              </div>
            ))}
          </div>
          {subtitle ? (
            <div
              style={{
                display: 'flex',
                marginTop: 22,
                maxWidth: 640,
                fontSize: 28,
                fontWeight: 500,
                lineHeight: 1.35,
                color: 'rgba(245, 245, 244, 0.82)',
              }}
            >
              {subtitle}
            </div>
          ) : null}
          {badges?.length ? (
            <div style={{ display: 'flex', gap: 14, marginTop: 28 }}>
              {badges.map((badge) => (
                <div
                  key={badge.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: badge.emphasis ? '9px 24px' : '9px 20px',
                    borderRadius: 999,
                    fontSize: badge.emphasis ? 26 : 20,
                    fontWeight: badge.emphasis ? 700 : 500,
                    color: badge.emphasis ? '#ffb27a' : '#f5f5f4',
                    border: badge.emphasis
                      ? '2px solid rgba(255, 140, 60, 0.95)'
                      : '1.5px solid rgba(255, 255, 255, 0.28)',
                    backgroundColor: badge.emphasis
                      ? 'rgba(255, 110, 30, 0.16)'
                      : 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  {badge.check ? <Check /> : null}
                  {badge.label}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: 'DM Sans', data: medium, weight: 500, style: 'normal' },
        { name: 'DM Sans', data: bold, weight: 700, style: 'normal' },
      ],
    },
  )
}
