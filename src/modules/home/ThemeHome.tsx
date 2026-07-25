import { useThemeLayout } from '@/themes/useThemeLayout'
import { OrbitHome } from './components/OrbitHome'
import { Ps5Home } from './components/Ps5Home'
import { SwitchHome } from './components/SwitchHome'
import type { ThemeHomeProps } from './hooks/useHomeGameActions'

export type { ThemeHomeProps }

export function ThemeHome(props: ThemeHomeProps) {
  const layout = useThemeLayout()
  if (layout === 'ps5') return <Ps5Home {...props} />
  if (layout === 'switch') return <SwitchHome {...props} />
  return <OrbitHome {...props} />
}
