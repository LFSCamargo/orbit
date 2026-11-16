import { clsx } from 'clsx'
import { HardDrive, Heart, LayoutGrid, Search } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { OptionSelect } from '@/components/ui/option-select'
import { TabList } from '@/components/ui/tab-list'
import type { LibrarySort } from '@/types/game'

const VIEWS = [
  { id: 'installed', label: 'Installed', icon: HardDrive },
  { id: 'all', label: 'All games', icon: LayoutGrid },
  { id: 'favorites', label: 'Favorites', icon: Heart },
] as const

const FILTER =
  'library-filter !h-12 !min-h-12 !w-auto min-w-[9.5rem] !rounded-full !border-0 !bg-transparent !px-3.5 !text-[13px] !font-[550] !shadow-none hover:!bg-white/[0.08] data-[state=open]:!bg-white/[0.1]'

export function LibraryToolbar({
  search = false,
  view,
  query,
  sort,
  platform,
  onView,
  onQuery,
  onSort,
  onPlatform,
  onClear,
  showFavorites = false,
}: {
  search?: boolean
  view: (typeof VIEWS)[number]['id']
  query: string
  sort: LibrarySort
  platform: string
  onView: (view: (typeof VIEWS)[number]['id']) => void
  onQuery: (query: string) => void
  onSort: (sort: LibrarySort) => void
  onPlatform: (platform: string) => void
  onClear: () => void
  showFavorites?: boolean
}) {
  const views = showFavorites ? VIEWS : VIEWS.filter((item) => item.id !== 'favorites')
  return (
    <div
      className={clsx(
        'library-toolbar sticky top-0 z-[3]',
        '-mx-[var(--console-gutter)] mb-7 px-[var(--console-gutter)] py-2',
      )}
    >
      <div className="library-toolbar-clusters relative flex flex-wrap items-center gap-3">
        {!search && (
          <TabList
            label="Library view"
            role="group"
            className="[&>button]:!min-h-12 [&>button]:gap-2 [&>button]:px-4"
          >
            {views.map(({ id, label, icon: Icon }, order) => (
              <Focusable
                key={id}
                focusId={`library-view-${id}`}
                group="library-view"
                order={order}
                noScale
                noRing
                aria-label={label}
                aria-pressed={id === view}
                onClick={() => onView(id)}
              >
                <Icon
                  size={16}
                  fill={id === 'favorites' && id === view ? 'currentColor' : 'none'}
                />
                <span className="max-[700px]:sr-only">{label}</span>
              </Focusable>
            ))}
          </TabList>
        )}
        <LiquidGlass
          surface="toolbar"
          radius={999}
          className="library-search min-w-[min(100%,18rem)] flex-1 p-[5px] focus-within:outline focus-within:outline-2 focus-within:outline-offset-[-3px] focus-within:outline-orbit-focus"
        >
          <label className="flex min-h-12 items-center gap-3 rounded-[999px] px-4">
            <Search size={18} className="shrink-0 text-white/45" />
            <input
              aria-label="Search your collection"
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search games…"
              className="h-12 w-full min-w-0 bg-transparent text-[15px] text-orbit-foreground outline-none placeholder:text-white/40"
            />
          </label>
        </LiquidGlass>
        {search && (
          <LiquidGlass surface="toolbar" radius={999} className="p-[5px]">
            <Focusable
              focusId="search-clear"
              group="library-toolbar"
              order={2}
              noScale
              onClick={onClear}
              className="inline-flex min-h-12 items-center justify-center rounded-full px-5 text-[13px] font-[550]"
            >
              Clear
            </Focusable>
          </LiquidGlass>
        )}
        <LiquidGlass
          surface="toolbar"
          radius={999}
          className="library-filters flex shrink-0 gap-0.5 p-[5px]"
        >
          <OptionSelect
            focusId="library-sort-alphabetical"
            aria-label="Sort games"
            className={FILTER}
            value={sort}
            onValueChange={(value) => onSort(value as LibrarySort)}
          >
            <option value="alphabetical">Title · A–Z</option>
            <option value="recently-played">Recently played</option>
            <option value="playtime">Most played</option>
          </OptionSelect>
          <OptionSelect
            aria-label="Filter platform"
            className={FILTER}
            value={platform}
            onValueChange={onPlatform}
          >
            <option value="all">All platforms</option>
            <option value="macos">macOS</option>
            <option value="windows">Windows</option>
            <option value="nintendo-switch">Nintendo Switch</option>
          </OptionSelect>
        </LiquidGlass>
      </div>
    </div>
  )
}
