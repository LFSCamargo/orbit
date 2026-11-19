import { useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Search } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { Drawer } from '@/components/ui/drawer'
import { fetchThemeArtwork } from '@/lib/tauri'
import { searchThemeStudioArtwork } from '@/lib/themeArtwork'
import type { ArtworkSlot } from '@/lib/artwork'
import type { ArtworkSearchHit } from '@/lib/artworkApi'
import { fetchArtworkFromUrl, searchGameArtwork } from '@/lib/artworkApi'
import { buttonClass } from '@/components/ui/button'
import { BusyLabel } from '@/components/feedback/BusyLabel'
import { SkeletonBlock } from '@/components/feedback/Skeleton'
import { Spinner } from '@/components/feedback/Spinner'

const SLOT_ASPECT: Record<ArtworkSlot, string> = {
  cover: 'aspect-[2/3]',
  hero: 'aspect-video',
  icon: 'aspect-square',
  logo: 'aspect-[16/6]',
}

interface ImageSearchModalProps {
  open: boolean
  themeArtwork?: boolean
  initialQuery?: string
  slot?: ArtworkSlot
  gameId?: string
  onClose: () => void
  onSelect: (dataUrl: string) => void
}

export function ImageSearchModal({
  open,
  themeArtwork = false,
  initialQuery = '',
  slot = 'cover',
  gameId,
  onClose,
  onSelect,
}: ImageSearchModalProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<
    (ArtworkSearchHit & { width?: number; height?: number })[]
  >([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [source, setSource] = useState('All sources')
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const request = useRef(0)
  const dialog = useRef<HTMLDivElement>(null)

  const runSearch = async (term: string) => {
    const ticket = ++request.current
    setResults([])
    setWarnings([])
    setSource('All sources')
    setError(null)
    setSelecting(null)
    if (!term.trim()) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result =
        themeArtwork && (slot === 'logo' || slot === 'hero')
          ? await searchThemeStudioArtwork(term.trim(), slot)
          : await searchGameArtwork(term.trim(), slot, gameId)
      if (ticket !== request.current) return
      setResults(result.hits)
      setWarnings(result.warnings)
    } catch (err) {
      if (ticket === request.current)
        setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (ticket === request.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setQuery(initialQuery)
      void runSearch(initialQuery)
    }
    return () => {
      request.current++
    }
    // Search on each new editing context, not on each keystroke or callback render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery, slot, gameId, themeArtwork])

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return
      if (event.key !== 'Tab') return
      const elements = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ) ?? []),
      ]
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open, onClose])

  const choose = async (hit: ArtworkSearchHit) => {
    if (selecting) return
    const ticket = request.current
    setSelecting(hit.id)
    setError(null)
    try {
      const image =
        themeArtwork && (slot === 'logo' || slot === 'hero')
          ? await fetchThemeArtwork(hit.imageUrl, slot)
          : await fetchArtworkFromUrl(hit.imageUrl)
      if (ticket !== request.current) return
      onSelect(image)
      onClose()
    } catch (err) {
      if (ticket === request.current)
        setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (ticket === request.current) setSelecting(null)
    }
  }
  const sources = ['All sources', ...new Set(results.map((hit) => hit.source))]
  const visible =
    source === 'All sources' ? results : results.filter((hit) => hit.source === source)

  return (
    <AnimatePresence>
      {open && (
        <Drawer
          id="image-search"
          title={`Choose ${slot} artwork`}
          description={
            themeArtwork
              ? slot === 'logo'
                ? 'Choose a SteamGridDB logo.'
                : 'Browse connected sources for a background.'
              : 'SteamGridDB · TheGamesDB · RAWG · Wikimedia · Steam Store. Choose an image, then save your changes.'
          }
          closeLabel="Close artwork picker"
          onClose={onClose}
          side="left"
          width="min(960px, 100vw)"
          zIndex={200}
          focusGroup="image-picker"
          closeFocusId="image-search-close"
          dialogRef={dialog}
          bodyBusy={loading || selecting !== null}
          bodyClassName="block"
          toolbar={
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void runSearch(query)
                }}
                className="flex gap-3 pb-3"
              >
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Game title to search</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orbit-muted" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    maxLength={200}
                    placeholder="Search game artwork…"
                    className="w-full rounded-card border border-orbit-border bg-orbit-surface py-3 pl-10 pr-4 outline-none ring-orbit-focus focus:ring-2"
                  />
                </label>
                <Focusable
                  focusId="image-search-run"
                  group="image-picker"
                  order={1}
                  noScale
                  disabled={loading || selecting !== null || !query.trim()}
                  onClick={() => void runSearch(query)}
                  className={buttonClass({})}
                >
                  <BusyLabel busy={loading}>Search</BusyLabel>
                </Focusable>
              </form>
              <div
                className="flex flex-wrap gap-2 pb-2"
                role="group"
                aria-label="Artwork sources"
              >
                {sources.map((item, index) => (
                  <Focusable
                    key={item}
                    focusId={`image-source-${index}`}
                    group="image-picker"
                    order={2 + index}
                    noScale
                    disabled={selecting !== null}
                    aria-pressed={source === item}
                    onClick={() => setSource(item)}
                    className={`rounded-full px-3 py-2 text-sm ${source === item ? 'bg-orbit-accent text-orbit-canvas' : 'orbit-glass-control bg-white/10'}`}
                  >
                    {item} (
                    {item === 'All sources'
                      ? results.length
                      : results.filter((hit) => hit.source === item).length}
                    )
                  </Focusable>
                ))}
              </div>
            </>
          }
        >
          {error && (
            <p role="alert" className="mb-4 text-sm text-rose-300">
              {error}
            </p>
          )}
          {warnings.length > 0 && (
            <div className="mb-4 space-y-1 text-sm text-orbit-muted">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
          {loading && (
            <div
              role="status"
              aria-label="Searching artwork sources"
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <SkeletonBlock key={index} className="aspect-[2/3] rounded-card" />
              ))}
            </div>
          )}
          <p
            role="status"
            aria-label={selecting ? 'Downloading your selection' : undefined}
            className="mb-4 text-sm text-orbit-muted"
            hidden={loading}
          >
            {selecting ? (
              <Spinner size={16} />
            ) : !visible.length ? (
              'No qualifying images found. Try the exact game title or configure provider keys in Settings.'
            ) : (
              `${visible.length} images available`
            )}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((hit, index) => (
              <Focusable
                key={hit.id}
                focusId={`image-hit-${hit.id}`}
                group="image-picker"
                order={100 + index}
                noScale
                disabled={selecting !== null}
                onClick={() => void choose(hit)}
                aria-label={`${hit.title} — ${hit.source}`}
                className="overflow-hidden rounded-card bg-orbit-surface text-left ring-1 ring-orbit-border/50"
              >
                <img
                  src={hit.previewUrl}
                  alt=""
                  loading="lazy"
                  className={`w-full bg-orbit-panel object-contain ${SLOT_ASPECT[slot]}`}
                />
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-medium">{hit.title}</p>
                  <p className="mt-1 text-xs text-orbit-muted">
                    {hit.source}
                    {hit.width ? ` · ${hit.width} × ${hit.height}` : ''}
                  </p>
                </div>
              </Focusable>
            ))}
          </div>
        </Drawer>
      )}
    </AnimatePresence>
  )
}
