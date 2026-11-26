import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/dm-sans'
import './globals.css'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SpaceBackdrop } from '@/components/space/SpaceBackdrop'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/seo'

const DEFAULT_TITLE = 'Orbit — Every game. One orbit.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: DEFAULT_TITLE,
    template: '%s · Orbit',
  },
  description: SITE_DESCRIPTION,
  keywords: [
    'Mac gaming',
    'game launcher',
    'macOS',
    'Steam on Mac',
    'Windows games on Mac',
    'Wine',
    'Game Porting Toolkit',
    'controller',
    'Xbox Cloud Gaming',
  ],
  category: 'games',
  alternates: {
    canonical: '/',
    types: { 'application/rss+xml': [{ url: '/blog/rss.xml', title: 'Orbit Blog' }] },
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: SITE_NAME,
    locale: 'en_US',
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        {/* The sky behind every page, for the glass to refract. */}
        <div className="fixed inset-0 -z-10">
          <SpaceBackdrop embers={false} />
        </div>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
