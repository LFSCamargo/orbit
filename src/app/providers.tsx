import { useEffect, useState, StrictMode, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useThemeStore } from '@/stores/theme.store'

function ThemeBootstrap({ children }: { children: ReactNode }) {
  const hydrate = useThemeStore((s) => s.hydrate)
  const ready = useThemeStore((s) => s.ready)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-orbit-canvas font-body text-orbit-muted">
        Starting Orbit…
      </div>
    )
  }

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
        <ThemeBootstrap>{children}</ThemeBootstrap>
      </QueryClientProvider>
    </StrictMode>
  )
}
