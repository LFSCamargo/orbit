import { FolderOpen, Search, SearchX, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/feedback/EmptyState'
import { clsx } from 'clsx'
import { Focusable } from '@/components/focus/Focusable'
import { formatBytes, formatRelativeDate } from '@/lib/format'
import type { StorageItem } from '@/types/storage'
import {
  CATEGORIES,
  categoryMeta,
  filterCounts,
  visibleItems,
  type StorageFilter,
  type StorageSort,
} from './storageModel'

const FILTERS: Array<{ id: StorageFilter; label: string }> = [
  { id: 'all', label: 'All items' },
  ...CATEGORIES.map((category) => ({ id: category.kind, label: category.plural })),
]

const SORTS: Array<{ id: StorageSort; label: string }> = [
  { id: 'size', label: 'Size' },
  { id: 'name', label: 'Name' },
  { id: 'installed', label: 'Installed' },
]

const ACTION =
  'grid size-8 place-items-center rounded-full bg-white/[0.06] text-white/80 hover:bg-white/[0.12] disabled:opacity-30'

/** Every item Orbit stores, filterable by type, with reveal and remove actions. */
export function StorageItemsTable({
  items,
  filter,
  query,
  sort,
  onFilter,
  onQuery,
  onSort,
  onReveal,
  onRemove,
}: {
  items: StorageItem[]
  filter: StorageFilter
  query: string
  sort: StorageSort
  onFilter: (filter: StorageFilter) => void
  onQuery: (query: string) => void
  onSort: (sort: StorageSort) => void
  onReveal: (item: StorageItem) => void
  onRemove: (item: StorageItem) => void
}) {
  const counts = filterCounts(items)
  const rows = visibleItems(items, filter, query, sort)
  return (
    <section className="grid gap-4" aria-label="Installed items">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Item type">
          {FILTERS.filter((item) => item.id === 'all' || counts[item.id] > 0).map(
            (item, index) => (
              <Focusable
                key={item.id}
                focusId={`storage-filter-${item.id}`}
                group="settings-storage"
                order={20 + index}
                noScale
                role="tab"
                aria-selected={filter === item.id}
                onClick={() => onFilter(item.id)}
                className={clsx(
                  'rounded-full border px-3.5 py-2 text-[12px] font-semibold',
                  filter === item.id
                    ? 'border-orbit-accent bg-orbit-accent/15 text-white'
                    : 'border-white/10 bg-white/[0.04] text-white/75',
                )}
              >
                {item.label} ({counts[item.id]})
              </Focusable>
            ),
          )}
        </div>
        <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[12px] sm:max-w-[260px]">
          <Search size={14} className="text-orbit-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search installed items…"
            aria-label="Search installed items"
            className="w-full bg-transparent outline-none placeholder:text-orbit-muted"
          />
        </label>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-orbit-muted">
        <span>Sort by</span>
        {SORTS.map((item, index) => (
          <Focusable
            key={item.id}
            focusId={`storage-sort-${item.id}`}
            group="settings-storage"
            order={30 + index}
            noScale
            aria-pressed={sort === item.id}
            onClick={() => onSort(item.id)}
            className={clsx(
              'rounded-full px-2.5 py-1',
              sort === item.id ? 'bg-white/10 text-white' : 'hover:text-white',
            )}
          >
            {item.label}
          </Focusable>
        ))}
      </div>
      <table className="w-full table-fixed border-collapse text-left text-[13px]">
        <thead className="text-[10px] font-semibold tracking-[0.12em] text-orbit-muted">
          <tr>
            <th className="w-auto pb-2 font-semibold">NAME</th>
            <th className="w-[96px] pb-2 font-semibold max-[700px]:hidden">TYPE</th>
            <th className="w-[112px] pb-2 font-semibold max-[1100px]:hidden">SOURCE</th>
            <th className="w-[84px] pb-2 text-right font-semibold">SIZE</th>
            <th className="w-[112px] pb-2 pl-4 font-semibold max-[900px]:hidden">
              INSTALLED
            </th>
            <th className="w-[84px] pb-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-3">
                <EmptyState
                  size="sm"
                  icon={SearchX}
                  title="Nothing matches"
                  description="Try another name or category."
                />
              </td>
            </tr>
          )}
          {rows.map((item, index) => {
            const meta = categoryMeta(item.kind)
            const removable = item.removal.type !== 'none'
            return (
              <tr
                key={item.id}
                className="border-t border-white/[0.06]"
                data-testid="storage-row"
              >
                <td className="truncate py-2.5 pr-3 font-semibold" title={item.path}>
                  {item.name}
                </td>
                <td className="py-2.5 max-[700px]:hidden">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color: meta.color, background: `${meta.color}22` }}
                  >
                    {meta.label}
                  </span>
                </td>
                <td
                  className="truncate py-2.5 pr-2 text-orbit-muted max-[1100px]:hidden"
                  title={item.path}
                >
                  {item.source}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  {formatBytes(item.sizeBytes)}
                </td>
                <td className="py-2.5 pl-4 text-orbit-muted max-[900px]:hidden">
                  {item.installedAt ? formatRelativeDate(item.installedAt) : '—'}
                </td>
                <td className="py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <Focusable
                      focusId={`storage-reveal-${item.id}`}
                      group="settings-storage"
                      order={40 + index}
                      noScale
                      aria-label={`Show ${item.name} in Finder`}
                      className={ACTION}
                      onClick={() => onReveal(item)}
                    >
                      <FolderOpen size={14} />
                    </Focusable>
                    <Focusable
                      focusId={`storage-remove-${item.id}`}
                      group="settings-storage"
                      order={40 + index}
                      noScale
                      disabled={!removable}
                      aria-label={
                        item.removal.type === 'game' ||
                        item.removal.type === 'msStoreGame'
                          ? `Uninstall ${item.name}`
                          : `Remove ${item.name}`
                      }
                      title={
                        removable
                          ? undefined
                          : item.kind === 'game'
                            ? 'Installed outside Orbit; remove it from Steam'
                            : 'Orbit needs this to run your games'
                      }
                      className={ACTION}
                      onClick={() => onRemove(item)}
                    >
                      <Trash2 size={14} />
                    </Focusable>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
