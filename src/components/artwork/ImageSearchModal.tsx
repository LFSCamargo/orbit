import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import type { ArtworkSearchHit } from '@/lib/artworkApi'
import { fetchArtworkFromUrl, searchPublicArtwork } from '@/lib/artworkApi'

interface ImageSearchModalProps {
  open: boolean
  initialQuery?: string
  onClose: () => void
  onSelect: (dataUrl: string) => void
}

export function ImageSearchModal({
  open,
  initialQuery = '',
  onClose,
  onSelect,
}: ImageSearchModalProps) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<ArtworkSearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const hits = await searchPublicArtwork(query.trim())
      setResults(hits)
      if (hits.length === 0) setError('No images found. Try a different search.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="orbit-panel flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-theme"
          >
            <div className="flex items-center justify-between border-b border-orbit-border/60 px-6 py-4">
              <div>
                <h2 className="font-display text-2xl font-semibold">Search artwork</h2>
                <p className="text-sm text-orbit-muted">
                  Wikimedia Commons + RAWG (optional API key in Settings)
                </p>
              </div>
              <Focusable
                focusId="image-search-close"
                group="image-search"
                order={0}
                noScale
                onClick={onClose}
                className="rounded-full bg-white/10 p-2"
              >
                <X className="h-5 w-5" />
              </Focusable>
            </div>

            <div className="flex gap-3 border-b border-orbit-border/40 px-6 py-4">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orbit-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
                  placeholder="Search game cover art…"
                  className="w-full rounded-card border border-orbit-border bg-orbit-surface py-3 pl-10 pr-4 outline-none ring-orbit-focus focus:ring-2"
                />
              </div>
              <Focusable
                focusId="image-search-run"
                group="image-search"
                order={1}
                noScale
                disabled={loading}
                onClick={() => void runSearch()}
                className="rounded-card bg-orbit-accent px-5 py-3 font-semibold text-orbit-canvas"
              >
                {loading ? 'Searching…' : 'Search'}
              </Focusable>
            </div>

            <div className="scrollbar-none flex-1 overflow-y-auto px-6 py-4">
              {error && <p className="mb-4 text-sm text-rose-300">{error}</p>}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {results.map((hit, index) => (
                  <Focusable
                    key={hit.id}
                    focusId={`image-hit-${hit.id}`}
                    group="image-results"
                    order={index}
                    noScale
                    onClick={() => {
                      void fetchArtworkFromUrl(hit.imageUrl)
                        .then((dataUrl) => {
                          onSelect(dataUrl)
                          onClose()
                        })
                        .catch((err) =>
                          setError(err instanceof Error ? err.message : String(err)),
                        )
                    }}
                    className="overflow-hidden rounded-card bg-orbit-surface text-left ring-1 ring-orbit-border/50"
                  >
                    <div
                      className="aspect-video bg-cover bg-center"
                      style={{ backgroundImage: `url(${hit.previewUrl})` }}
                    />
                    <div className="p-3">
                      <p className="line-clamp-2 text-sm font-medium">{hit.title}</p>
                      <p className="mt-1 text-xs text-orbit-muted">{hit.source}</p>
                    </div>
                  </Focusable>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
