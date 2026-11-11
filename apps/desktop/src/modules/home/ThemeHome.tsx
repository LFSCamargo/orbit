import { MacosHome } from './components/MacosHome'
import type { ThemeHomeProps } from './hooks/useHomeGameActions'

export type { ThemeHomeProps }

export function ThemeHome(props: ThemeHomeProps) {
  return <MacosHome {...props} />
}
