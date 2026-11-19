import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { Focusable } from '@/components/focus/Focusable'
import { UninstallDialog } from '@/components/game/UninstallDialog'
import { formatBytes, formatRelativeDate } from '@/lib/format'
import { removeComponent, revealPath } from '@/lib/tauri'
import { notify } from '@/lib/toast'
import type { StorageItem } from '@/types/storage'
import { LargestInstalls } from './LargestInstalls'
import { StorageDistribution } from './StorageDistribution'
import { StorageItemsTable } from './StorageItemsTable'
import { StorageOverviewCard } from './StorageOverviewCard'
import { StorageSkeleton } from './StorageSkeleton'
import type { StorageFilter, StorageSort } from './storageModel'
import { useStorageOverview } from './useStorageOverview'

/** Settings → Storage: what Orbit keeps on this Mac and what can be removed. */
export function StorageSettings() {
  const client = useQueryClient()
  const { overview, rescan } = useStorageOverview()
  const [filter, setFilter] = useState<StorageFilter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<StorageSort>('size')
  const [uninstalling, setUninstalling] = useState<StorageItem | null>(null)
  const [removing, setRemoving] = useState<StorageItem | null>(null)
  const remove = useMutation({
    mutationFn: async (item: StorageItem) => {
      if (item.removal.type !== 'component') return
      await removeComponent(item.removal.id, item.removal.version)
    },
    onSuccess: (_, item) => {
      notify.success({
        title: `Removed ${item.name}`,
        message: `Freed ${formatBytes(item.sizeBytes)}.`,
      })
      for (const key of ['storage-overview', 'component-status', 'active-components'])
        void client.invalidateQueries({ queryKey: [key] })
    },
    onError: (error) =>
      notify.error({ title: 'Could not remove it', message: errorText(error) }),
    onSettled: () => setRemoving(null),
  })

  const data = overview.data
  const onRemove = (item: StorageItem) => {
    if (item.removal.type === 'game') setUninstalling(item)
    else if (item.removal.type === 'component') setRemoving(item)
  }
  const reveal = (item: StorageItem) => {
    revealPath(item.path).catch((error: unknown) =>
      notify.error({ title: 'Could not show the folder', message: errorText(error) }),
    )
  }

  return (
    <div className="grid gap-5" data-testid="settings-storage-view">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[12px] text-orbit-muted">
          {data
            ? `Scanned ${formatRelativeDate(data.scannedAt).toLowerCase()}${data.truncated ? ' · sizes are approximate' : ''}`
            : 'Measuring Orbit’s folders…'}
        </p>
        <Focusable
          focusId="storage-rescan"
          group="settings-storage"
          order={0}
          noScale
          disabled={rescan.isPending || overview.isFetching}
          onClick={() => rescan.mutate()}
          className="inline-flex items-center gap-2 rounded-full bg-white/[0.08] px-3.5 py-2 text-[12px] font-semibold"
        >
          <RefreshCw
            size={14}
            className={rescan.isPending ? 'animate-spin' : undefined}
          />
          Rescan
        </Focusable>
      </div>
      {overview.error && (
        <p className="m-0 text-[13px] text-[#ffb4b4]" role="alert">
          {overview.error instanceof Error
            ? overview.error.message
            : String(overview.error)}
        </p>
      )}
      {!data && !overview.error && <StorageSkeleton />}
      {data && (
        <>
          <div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <StorageOverviewCard overview={data} />
            <LargestInstalls items={data.items} />
          </div>
          <StorageDistribution overview={data} />
          <StorageItemsTable
            items={data.items}
            filter={filter}
            query={query}
            sort={sort}
            onFilter={setFilter}
            onQuery={setQuery}
            onSort={setSort}
            onReveal={reveal}
            onRemove={onRemove}
          />
        </>
      )}
      <UninstallDialog
        game={
          uninstalling?.removal.type === 'game'
            ? {
                appId: uninstalling.removal.appId,
                title: uninstalling.name,
                sizeBytes: uninstalling.sizeBytes,
              }
            : null
        }
        onClose={() => setUninstalling(null)}
      />
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        description="Games set to use this version switch to another installed one. You can download it again from Compatibility."
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) remove.mutate(removing)
        }}
      />
    </div>
  )
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
