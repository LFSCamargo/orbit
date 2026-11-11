'use client'

import Link from 'next/link'
import { HoverBorderGradient } from '@/components/ui/hover-border-gradient'

export function DocsCta({ children }: { children: React.ReactNode }) {
  return (
    <HoverBorderGradient as={Link} href="/docs">
      {children}
    </HoverBorderGradient>
  )
}
