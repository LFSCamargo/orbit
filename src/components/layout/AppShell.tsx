import type { ReactNode } from 'react'
import { NavBar } from './NavBar'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { PlayingScreen } from '@/features/session/PlayingScreen'
import { useSessionStore } from '@/stores/session.store'
import { Ps5Shell } from '@/themes/Ps5Shell'
import { SwitchShell } from '@/themes/SwitchShell'
import { useThemeLayout } from '@/themes/useThemeLayout'

export function AppShell({
  children,
  family,
}: {
  children: ReactNode
  family: ControllerFamily
}) {
  const activeSession = useSessionStore((s) => s.activeSession)
  const layout = useThemeLayout()

  if (activeSession) {
    return <PlayingScreen session={activeSession} family={family} />
  }

  if (layout === 'switch') {
    return <SwitchShell family={family}>{children}</SwitchShell>
  }

  if (layout === 'ps5') {
    return <Ps5Shell family={family}>{children}</Ps5Shell>
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-orbit-canvas font-body text-orbit-foreground orbit-transition">
      <div className="theme-bg" />
      <NavBar family={family} />
      <main className="relative z-10 pt-[5.5rem]">{children}</main>
    </div>
  )
}
