import type { QueryClient } from '@tanstack/react-query'

type Query = { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }

export interface OnboardingPreload {
  /** What Setup shows first, so it opens on real rows. */
  queries: Record<string, Query>
  /** Code split chunks the scene renders with. */
  modules: (() => Promise<unknown>)[]
  /** Images on screen in the first step, decoded ahead. */
  images: string[]
  timeoutMs?: number
}

function decode(src: string): Promise<unknown> {
  if (typeof Image === 'undefined') return Promise.resolve()
  const image = new Image()
  image.src = src
  return typeof image.decode === 'function'
    ? image.decode()
    : new Promise((resolve) => {
        image.onload = image.onerror = resolve
      })
}

/** Loads everything onboarding needs before it is shown, so it appears whole
 * rather than filling in. Failures are ignored (each part has its own error
 * state), and it gives up waiting after `timeoutMs`. */
export async function preloadOnboarding(
  client: QueryClient,
  { queries, modules, images, timeoutMs = 6000 }: OnboardingPreload,
): Promise<void> {
  const work = [
    ...Object.values(queries).map((query) => client.prefetchQuery(query)),
    ...modules.map((load) => load()),
    ...images.map(decode),
    typeof document !== 'undefined' ? document.fonts?.ready : undefined,
  ].map((task) => Promise.resolve(task).catch(() => undefined))
  let timer: ReturnType<typeof setTimeout> | undefined
  await Promise.race([
    Promise.all(work),
    new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs)
    }),
  ])
  clearTimeout(timer)
}
