import type { ReactNode } from 'react'
import { MacosShell } from '@/themes/MacosShell'
import type { ControllerFamily } from '@/controllers/ControllerMapping'
import { PlayingScreen } from '@/modules/session/PlayingScreen'
import { useSessionStore } from '@/stores/session.store'

export function AppShell({
  children,
  family,
}: {
  children: ReactNode
  family: ControllerFamily
}) {
  const activeSession = useSessionStore((s) => s.activeSession)

  if (activeSession) {
    return <PlayingScreen session={activeSession} family={family} />
  }

  return <MacosShell family={family}>{children}</MacosShell>
}
