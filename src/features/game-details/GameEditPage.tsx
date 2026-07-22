import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Sparkles } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { ArtworkSlotPicker } from '@/components/artwork/ArtworkSlotPicker'
import { ImageSearchModal } from '@/components/artwork/ImageSearchModal'
import { useGame, useGameActions } from '@/hooks/useGames'
import type { ArtworkSlot } from '@/lib/artwork'
import { normalizeArtwork } from '@/lib/artworkApi'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'

export function GameEditPage() {
  const selectedGameId = useUiStore((s) => s.selectedGameId)
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const { data: game, isLoading } = useGame(selectedGameId)
  const { update } = useGameActions()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [cover, setCover] = useState<string | undefined>()
  const [hero, setHero] = useState<string | undefined>()
  const [icon, setIcon] = useState<string | undefined>()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [searchSlot, setSearchSlot] = useState<ArtworkSlot | null>(null)

  useEffect(() => {
    if (!game) return
    setTitle(game.title)
    setDescription(game.description ?? '')
    setCover(game.artwork.cover)
    setHero(game.artwork.hero)
    setIcon(game.artwork.icon)
  }, [game])

  if (isLoading) {
    return (
      <ThemePage title="Edit game">
        <p className="text-orbit-muted">Loading…</p>
      </ThemePage>
    )
  }

  if (!game) {
    return (
      <ThemePage title="Edit game">
        <p className="text-orbit-muted">Game not found.</p>
      </ThemePage>
    )
  }

  const setSlot = (slot: ArtworkSlot, value: string | undefined) => {
    if (slot === 'cover') setCover(value)
    if (slot === 'hero') setHero(value)
    if (slot === 'icon') setIcon(value)
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const artwork = await normalizeArtwork({
        cover,
        hero,
        icon,
        logo: game.artwork.logo,
      })
      await update.mutateAsync({
        gameId: game.id,
        request: {
          title: title.trim() || game.title,
          description: description.trim() || undefined,
          artwork,
        },
      })
      setMessage('Saved — artwork stored as Base64 in your local library.')
      openGameDetails(game.id)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ThemePage
      title="Edit properties"
      subtitle="Customize metadata and artwork. Images are embedded in your local database."
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-8 xl:grid-cols-[1fr_1.1fr]"
      >
        <div className="space-y-5">
          <div className="orbit-panel rounded-theme p-6">
            <div className="mb-5 flex items-center gap-2 text-orbit-accent">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-semibold uppercase tracking-wider">Details</span>
            </div>
            <label className="block text-sm text-orbit-muted">
              Game title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
              />
            </label>
            <label className="mt-4 block text-sm text-orbit-muted">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={7}
                className="mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Focusable
              focusId="edit-back"
              group="edit-nav"
              order={0}
              noScale
              onClick={() => openGameDetails(game.id)}
              className="inline-flex items-center gap-2 rounded-card bg-white/10 px-4 py-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Focusable>
            <Focusable
              focusId="edit-save"
              group="edit-actions"
              order={1}
              noScale
              disabled={saving}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-card bg-orbit-accent px-6 py-3 font-semibold text-orbit-canvas"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </Focusable>
          </div>
          {message && <p className="text-sm text-orbit-muted">{message}</p>}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <ArtworkSlotPicker
            slot="icon"
            value={icon}
            order={0}
            onChange={(v) => setSlot('icon', v)}
            onSearch={() => setSearchSlot('icon')}
          />
          <ArtworkSlotPicker
            slot="cover"
            value={cover}
            order={1}
            onChange={(v) => setSlot('cover', v)}
            onSearch={() => setSearchSlot('cover')}
          />
          <ArtworkSlotPicker
            slot="hero"
            value={hero}
            order={2}
            onChange={(v) => setSlot('hero', v)}
            onSearch={() => setSearchSlot('hero')}
          />
        </div>
      </motion.div>

      <ImageSearchModal
        open={searchSlot !== null}
        initialQuery={title}
        onClose={() => setSearchSlot(null)}
        onSelect={(dataUrl) => {
          if (searchSlot) setSlot(searchSlot, dataUrl)
        }}
      />
    </ThemePage>
  )
}
