import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getGlassMaterial, isTauriRuntime } from '@/lib/tauri'

/** One native material request for the app, shared with portaled drawers. */
export function GlassMaterialBootstrap() {
  const { data } = useQuery({
    queryKey: ['glass-material'],
    queryFn: getGlassMaterial,
    enabled: isTauriRuntime(),
    staleTime: Infinity,
    retry: false,
  })

  useEffect(() => {
    if (!data) return
    const root = document.documentElement
    root.style.setProperty('--glass-grain', `url("${data.grain}")`)
    root.style.setProperty('--glass-toolbar-blur', `${data.toolbarBlur}px`)
    root.style.setProperty('--glass-panel-blur', `${data.panelBlur}px`)
    return () => {
      root.style.removeProperty('--glass-grain')
      root.style.removeProperty('--glass-toolbar-blur')
      root.style.removeProperty('--glass-panel-blur')
    }
  }, [data])

  return null
}
