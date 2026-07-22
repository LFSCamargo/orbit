import type { ReactNode } from 'react'
import { NavBar } from './NavBar'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
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
      {activeSession && (
        <div className="fixed right-8 top-20 z-50 rounded-full bg-emerald-500/20 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-400/30 backdrop-blur-md">
          Playing · session active
        </div>
      )}
      <main className="relative z-10 pt-[5.5rem]">{children}</main>
    </div>
  )
}
