import { MacosHome, type ThemeHomeProps } from './components/MacosHome'

export type { ThemeHomeProps }

export function ThemeHome(props: ThemeHomeProps) {
  return <MacosHome {...props} />
}
