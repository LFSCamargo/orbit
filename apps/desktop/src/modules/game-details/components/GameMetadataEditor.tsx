import { useState } from 'react'
import { Download, Save, Sparkles } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Focusable } from '@/components/focus/Focusable'
import { useDrawer } from '@/components/layout/DrawerProvider'
import { ArtworkSlotPicker } from '@/components/artwork/ArtworkSlotPicker'
import { ImageSearchModal } from '@/components/artwork/ImageSearchModal'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { useRandomArtwork } from '../hooks/useRandomArtwork'
import { useGameActions } from '@/hooks/useGames'
import type { ArtworkSlot } from '@/lib/artwork'
import { normalizeArtwork } from '@/lib/artworkApi'
import { enrichGameMetadata, getGame } from '@/lib/tauri'
import type { Game } from '@/types/game'
import { buttonClass } from '@/components/ui/button'
import { Spinner } from '@/components/feedback/Spinner'

export function GameMetadataEditor({
  game,
  section,
  canSave,
}: {
  game: Game
  section: 'general' | 'artwork'
  canSave: boolean
}) {
  const { update } = useGameActions()
  const queryClient = useQueryClient()
  const { openDrawer, closeDrawer } = useDrawer()
  const persisted = canSave
  const [baseline, setBaseline] = useState(game)
  const [title, setTitle] = useState(game.title)
  const [description, setDescription] = useState(game.description ?? '')
  const [cover, setCover] = useState<string | undefined>(game.artwork.cover)
  const [hero, setHero] = useState<string | undefined>(game.artwork.hero)
  const [icon, setIcon] = useState<string | undefined>(game.artwork.icon)
  const [saving, setSaving] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmFetch, setConfirmFetch] = useState(false)
  const dirty =
    title !== baseline.title ||
    description !== (baseline.description ?? '') ||
    cover !== baseline.artwork.cover ||
    hero !== baseline.artwork.hero ||
    icon !== baseline.artwork.icon
  const resetDraft = (next: Game) => {
    setTitle(next.title)
    setDescription(next.description ?? '')
    setCover(next.artwork.cover)
    setHero(next.artwork.hero)
    setIcon(next.artwork.icon)
    setBaseline(next)
  }
  const setSlot = (slot: ArtworkSlot, value: string | undefined) => {
    if (slot === 'cover') setCover(value)
    if (slot === 'hero') setHero(value)
    if (slot === 'icon') setIcon(value)
  }
  const randomArtwork = useRandomArtwork(game.id, title, setSlot)
  const chooseArtwork = (slot: ArtworkSlot) => {
    openDrawer(
      <ImageSearchModal
        open
        initialQuery={title}
        slot={slot}
        gameId={game.id}
        onClose={closeDrawer}
        onSelect={(dataUrl) => {
          setSlot(slot, dataUrl)
          closeDrawer()
        }}
      />,
    )
  }
  const fetchMetadata = async () => {
    setEnriching(true)
    setMessage(null)
    try {
      const result = await enrichGameMetadata(game.id)
      await queryClient.invalidateQueries({ queryKey: ['games'] })
      await queryClient.invalidateQueries({ queryKey: ['library'] })
      await queryClient.invalidateQueries({ queryKey: ['library-entry'] })
      const refreshed = await getGame(game.id)
      if (refreshed) resetDraft(refreshed)
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setEnriching(false)
    }
  }
  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const artwork = await normalizeArtwork(
        game.id,
        { cover, hero, icon, logo: game.artwork.logo },
        game.artwork,
      )
      await update.mutateAsync({
        gameId: game.id,
        request: {
          title: title.trim() || game.title,
          description: description.trim() || undefined,
          artwork,
        },
      })
      const refreshed = await getGame(game.id)
      if (refreshed) resetDraft(refreshed)
      setMessage('Changes saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }
  const busy = saving || enriching || randomArtwork.busySlot !== null
  return (
    <div className="orbit-properties">
      <div hidden={section !== 'general'} role="tabpanel" aria-label="General">
        <div className="orbit-panel rounded-theme p-6">
          <div className="mb-5 flex items-center gap-2 text-orbit-accent">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">
              Details
            </span>
          </div>
          <label className="block text-sm text-orbit-muted">
            Game title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
            />
          </label>
          <label className="mt-4 block text-sm text-orbit-muted">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={7}
              className="mt-2 min-h-[44px] w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
            />
          </label>
        </div>
      </div>
      <div hidden={section !== 'artwork'} role="tabpanel" aria-label="Artwork">
        <div className="grid gap-4 md:grid-cols-2">
          {(['icon', 'cover', 'hero'] as const).map((slot, order) => (
            <ArtworkSlotPicker
              key={slot}
              slot={slot}
              value={slot === 'icon' ? icon : slot === 'cover' ? cover : hero}
              order={order}
              onChange={(value) => setSlot(slot, value)}
              onSearch={() => chooseArtwork(slot)}
              onRandom={() => void randomArtwork.randomize(slot)}
              busy={randomArtwork.busySlot === slot}
              disabled={busy}
            />
          ))}
        </div>
      </div>
      {message && (
        <p role="status" className="mt-3 text-sm text-orbit-muted">
          {message}
        </p>
      )}
      {randomArtwork.error && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {randomArtwork.error}
        </p>
      )}
      <div className="orbit-editor-actions mt-6 flex flex-wrap gap-3 py-4">
        <Focusable
          focusId="edit-enrich"
          group="edit-actions"
          order={0}
          noScale
          disabled={busy || !persisted}
          onClick={() => (dirty ? setConfirmFetch(true) : void fetchMetadata())}
          className="orbit-glass-control inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-3 disabled:cursor-wait disabled:opacity-40"
        >
          {enriching ? <Spinner size={16} /> : <Download className="h-4 w-4" />}
          Refresh metadata
        </Focusable>
        <Focusable
          focusId="edit-save"
          group="edit-actions"
          order={1}
          noScale
          disabled={!dirty || !title.trim() || busy || !persisted}
          onClick={() => void save()}
          className={buttonClass({
            size: 'lg',
            className: 'disabled:cursor-wait',
          })}
        >
          {saving ? <Spinner size={16} /> : <Save className="h-4 w-4" />}
          Save changes
        </Focusable>
      </div>
      <ConfirmDialog
        open={confirmFetch}
        title="Replace unsaved metadata and artwork?"
        description="Fetched information will replace the title, description, and artwork you have not saved."
        confirmLabel="Replace with fetched data"
        busy={enriching}
        onCancel={() => setConfirmFetch(false)}
        onConfirm={() => {
          setConfirmFetch(false)
          void fetchMetadata()
        }}
      />
    </div>
  )
}
