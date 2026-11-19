import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/dm-sans'
import './globals.css'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { SpaceBackdrop } from '@/components/space/SpaceBackdrop'

export const metadata: Metadata = {
  title: {
    default: 'Orbit — Your games. One orbit.',
    template: '%s · Orbit',
  },
  description:
    'Orbit is a controller-first game launcher for macOS. Bring Steam, Windows games and Mac apps together, play Windows games through Orbit Wine, and get from the couch to playing in seconds.',
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
