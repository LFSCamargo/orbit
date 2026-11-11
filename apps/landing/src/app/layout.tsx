import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import '@fontsource-variable/dm-sans'
import './globals.css'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'

export const metadata: Metadata = {
  title: {
    default: 'Orbit — Your games. One orbit.',
    template: '%s · Orbit',
  },
  description:
    'Orbit is a controller-first desktop game launcher for macOS, Windows, and Linux. Bring your game libraries together, customize your home screen, and play.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
