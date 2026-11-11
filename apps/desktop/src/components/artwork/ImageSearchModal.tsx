import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { LiquidGlass } from '@/components/ui/liquid-glass'
import { useModalFocus } from '@/hooks/useModalFocus'
import { fetchThemeArtwork } from '@/lib/tauri'
import { searchThemeStudioArtwork } from '@/lib/themeArtwork'
import type { ArtworkSlot } from '@/lib/artwork'
import type { ArtworkSearchHit } from '@/lib/artworkApi'
import { fetchArtworkFromUrl, searchGameArtwork } from '@/lib/artworkApi'

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
  useModalFocus(open, 'image-picker', 'image-search-close')

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
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
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
        <motion.div
          className="fixed inset-0 z-[200] flex justify-start"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div
            className="absolute inset-0 backdrop-blur-sm"
            style={{
              background: 'linear-gradient(to right, rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.7))',
            }}
            aria-hidden="true"
          />
          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-picker-title"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            onClick={(event) => event.stopPropagation()}
            className="image-search-drawer relative"
          >
            <LiquidGlass className="flex h-full flex-col overflow-hidden" radius={0}>
              <header className="flex items-start justify-between gap-4 border-b border-orbit-border/60 px-6 py-5">
                <div>
                  <h2
                    id="image-picker-title"
                    className="font-display text-2xl font-semibold"
                  >
                    Choose {slot} artwork
                  </h2>
                  <p className="text-sm text-orbit-muted">
                    {themeArtwork
                      ? slot === 'logo'
                        ? 'Choose a SteamGridDB logo.'
                        : 'Browse connected sources for a background.'
                      : 'SteamGridDB · TheGamesDB · RAWG · Wikimedia · Steam Store. Choose an image, then save your changes.'}
                  </p>
                </div>
                <Focusable
                  focusId="image-search-close"
                  group="image-picker"
                  order={0}
                  noScale
                  onClick={onClose}
                  aria-label="Close artwork picker"
                  className="orbit-glass-control rounded-full bg-white/10 p-2"
                >
                  <X className="h-5 w-5" />
                </Focusable>
              </header>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void runSearch(query)
                }}
                className="flex gap-3 px-6 py-4"
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
                  className="rounded-card bg-orbit-accent px-5 py-3 font-semibold text-orbit-canvas"
                >
                  {loading ? 'Searching…' : 'Search'}
                </Focusable>
              </form>
              <div
                className="flex flex-wrap gap-2 border-b border-orbit-border/40 px-6 pb-4"
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
                    className={`rounded-card px-3 py-2 text-sm ${source === item ? 'bg-orbit-accent text-orbit-canvas' : 'orbit-glass-control bg-white/10'}`}
                  >
                    {item} (
                    {item === 'All sources'
                      ? results.length
                      : results.filter((hit) => hit.source === item).length}
                    )
                  </Focusable>
                ))}
              </div>
              <div
                className="scrollbar-none flex-1 overflow-y-auto px-6 py-4"
                aria-busy={loading || selecting !== null}
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
                <p role="status" className="mb-4 text-sm text-orbit-muted">
                  {loading
                    ? 'Searching artwork sources…'
                    : selecting
                      ? 'Downloading your selection…'
                      : !visible.length
                        ? 'No qualifying images found. Try the exact game title or configure provider keys in Settings.'
                        : `${visible.length} images available`}
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
              </div>
            </LiquidGlass>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
