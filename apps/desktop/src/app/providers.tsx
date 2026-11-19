import { useEffect, useState, StrictMode, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GlassMaterialBootstrap } from '@/components/ui/GlassMaterialBootstrap'
import { DrawerProvider } from '@/components/layout/DrawerProvider'
import { usePreferencesStore } from '@/stores/preferences.store'
import { useThemeStore } from '@/stores/theme.store'

/** Theme and app preferences load before the first screen, so Orbit opens
 * on the right palette and knows whether to start with onboarding.
 */
function ThemeBootstrap({ children }: { children: ReactNode }) {
  const hydrate = useThemeStore((s) => s.hydrate)
  const themeReady = useThemeStore((s) => s.ready)
  const hydratePreferences = usePreferencesStore((s) => s.hydrate)
  const preferencesReady = usePreferencesStore((s) => s.ready)

  useEffect(() => {
    void hydrate()
    void hydratePreferences()
  }, [hydrate, hydratePreferences])

  // The splash screen (index.html) covers Orbit until it is ready.
  if (!themeReady || !preferencesReady) return null

  return children
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )

  return (
    <StrictMode>
      <QueryClientProvider client={client}>
        <GlassMaterialBootstrap />
        <ThemeBootstrap>
          <DrawerProvider>{children}</DrawerProvider>
        </ThemeBootstrap>
      </QueryClientProvider>
    </StrictMode>
  )
}
