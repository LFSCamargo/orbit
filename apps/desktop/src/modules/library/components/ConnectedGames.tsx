import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Focusable } from '@/components/focus/Focusable'
import {
  getGameHubLibrary,
  installSteamGame,
  isTauriRuntime,
  openGameHub,
} from '@/lib/tauri'
import { ConnectedGameCard } from './ConnectedGameCard'

export function ConnectedGames({
  query,
  screen,
}: {
  query: string
  screen: 'library' | 'search'
}) {
  const [limit, setLimit] = useState(24)
  const library = useQuery({
    queryKey: ['gamehub-library'],
    queryFn: getGameHubLibrary,
    refetchInterval: 5000,
  })
  const handoff = useMutation({
    mutationFn: async (appId?: string) => {
      if (appId) {
        await installSteamGame(appId)
        return isTauriRuntime()
          ? 'Steam opened. Confirm the installation there.'
          : 'Preview · Steam install requested.'
      }
      await openGameHub(true)
      return isTauriRuntime()
        ? 'GameHub opened. Find the title in your GameHub library.'
        : 'GameHub opened in preview.'
    },
  })
  const term = query.trim().toLowerCase()
  const matches = (library.data?.games ?? []).filter(
    (game) =>
      !term ||
      game.title.toLowerCase().includes(term) ||
      game.store.includes(term) ||
      'gamehub'.includes(term),
  )
  return (
    <section className="mt-8" aria-labelledby={`${screen}-connected-title`}>
      <h2 id={`${screen}-connected-title`} className="text-xl font-semibold">
        Connected games
      </h2>
      <p className="mb-4 mt-1 text-sm text-orbit-muted">
        Local GameHub records and downloads{!isTauriRuntime() ? ' · sample data' : ''}.
      </p>
      {library.isError && (
        <p role="alert" className="mb-3 text-sm text-rose-300">
          Could not read GameHub records.
        </p>
      )}
      {library.data?.warnings.map((warning) => (
        <p key={warning} className="mb-2 text-sm text-orbit-muted">
          {warning}
        </p>
      ))}
      {handoff.isError && (
        <p role="alert" className="mb-3 text-sm text-rose-300">
          {String(handoff.error)}
        </p>
      )}
      {handoff.isSuccess && (
        <p role="status" className="mb-3 text-sm text-orbit-muted">
          {handoff.data}
        </p>
      )}
      {library.isPending && <p className="text-orbit-muted">Checking GameHub…</p>}
      {!library.isPending && !library.isError && !matches.length && (
        <p className="text-sm text-orbit-muted">
          {term
            ? 'No connected games matched your search.'
            : 'No local GameHub records yet.'}
        </p>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-4">
        {matches.slice(0, limit).map((game, index) => (
          <ConnectedGameCard
            key={game.id}
            game={game}
            group={`${screen}-connected`}
            order={index}
            busy={handoff.isPending}
            onManage={() => handoff.mutate(undefined)}
            onInstall={handoff.mutate}
          />
        ))}
      </div>
      {matches.length > limit && (
        <Focusable
          focusId={`${screen}-connected-more`}
          group={`${screen}-connected`}
          order={limit * 2}
          noScale
          onClick={() => setLimit(limit + 24)}
          className="orbit-glass-control mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm"
        >
          Show more games
        </Focusable>
      )}
    </section>
  )
}
