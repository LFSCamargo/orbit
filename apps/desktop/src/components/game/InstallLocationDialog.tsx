import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { clsx } from 'clsx'
import { FolderPlus, HardDrive, Laptop, Plus, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useModalFocus } from '@/hooks/useModalFocus'
import { open as openPanel } from '@/lib/dialog'
import { useDownloadStore } from '@/lib/downloadProgress'
import {
  errorText,
  initialLocation,
  INSTALL_LOCATIONS_KEY,
  spaceCaption,
} from '@/lib/installLocations'
import {
  addInstallLocation,
  enqueueSteamDownload,
  listInstallLocations,
  removeInstallLocation,
} from '@/lib/tauri'
import { notify } from '@/lib/toast'
import type { InstallLocation } from '@/types/downloads'

const GROUP = 'install-location'

export { initialLocation, spaceCaption }

/** A Steam title about to join the download queue. */
export type InstallRequest = {
  appId: string
  title: string
  /** Steam ships a macOS build: Steam for Mac downloads it into its own library. */
  native?: boolean
}

/**
 * Asks where to install a Steam game before it joins the download queue:
 * This Mac or any folder the person adds (an external drive, for example).
 * A game with a macOS build has no folder to pick: Steam for Mac keeps it.
 */
export function InstallLocationDialog({
  game,
  onClose,
}: {
  game: InstallRequest | null
  onClose: () => void
}) {
  const open = game !== null
  const native = game?.native === true
  const client = useQueryClient()
  const locations = useQuery({
    queryKey: INSTALL_LOCATIONS_KEY,
    queryFn: listInstallLocations,
    enabled: open && !native,
  })
  const [selected, setSelected] = useState('this-mac')
  const [busy, setBusy] = useState(false)
  const [showPathInput, setShowPathInput] = useState(false)
  const [customPath, setCustomPath] = useState('')
  // Preselect once per opening; a refetch after adding a folder must not
  // undo the person's pick.
  const preselected = useRef<string | null>(null)
  useEffect(() => {
    if (!game) {
      preselected.current = null
      setShowPathInput(false)
      setCustomPath('')
      return
    }
    if (locations.data && preselected.current !== game.appId) {
      preselected.current = game.appId
      setSelected(initialLocation(locations.data))
    }
  }, [game, locations.data])
  useModalFocus(open, GROUP, 'install-location-confirm')
  useOverlayBack(open, () => {
    if (!busy) onClose()
  })

  const refresh = () => client.invalidateQueries({ queryKey: INSTALL_LOCATIONS_KEY })

  const addPath = async (targetPath: string) => {
    const trimmed = targetPath.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      const added = await addInstallLocation(trimmed)
      await refresh()
      setSelected(added.id)
      setCustomPath('')
      setShowPathInput(false)
    } catch (error) {
      notify.error({ title: 'Could not use that folder', message: errorText(error) })
    } finally {
      setBusy(false)
    }
  }

  const addFolder = async () => {
    const picked = await openPanel({
      directory: true,
      title: 'Choose where to install games',
    })
    if (!picked || Array.isArray(picked)) return
    await addPath(picked)
  }

  const remove = async (location: InstallLocation) => {
    try {
      await removeInstallLocation(location.id)
      if (selected === location.id) setSelected('this-mac')
      await refresh()
    } catch (error) {
      notify.error({ title: 'Could not remove the location', message: errorText(error) })
    }
  }

  const install = () => {
    if (!game) return
    const key = `steam:${game.appId}`
    useDownloadStore.getState().start({ key, label: game.title })
    onClose()
    void enqueueSteamDownload(game.appId, native ? undefined : selected)
      .then(() => refresh())
      .catch((error: unknown) => useDownloadStore.getState().fail(key, errorText(error)))
  }

  const list = locations.data ?? []
  const choice = list.find((location) => location.id === selected)
  // A portal keeps the sheet full-window when opened from a transformed
  // drawer, such as the Downloads sidebar.
  return createPortal(
    <AnimatePresence>
      {game && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!busy) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Install ${game.title}`}
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="orbit-panel w-full max-w-md rounded-theme p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="font-display text-2xl font-semibold">Install {game.title}</h2>
            <p className="mt-2 leading-relaxed text-orbit-muted">
              {native
                ? 'Steam has a macOS build of this game, so Orbit installs that one. Steam for Mac downloads it into its own library. If Steam is open, confirm the install there.'
                : 'Choose where to keep the game’s files. Other drives work too: add a folder on one.'}
            </p>
            <div
              className={clsx('mt-5 grid gap-2', native && 'hidden')}
              role="radiogroup"
              aria-label="Install location"
              aria-hidden={native || undefined}
            >
              {list.map((location, index) => {
                const checked = location.id === selected
                const Icon = location.path ? HardDrive : Laptop
                return (
                  <div key={location.id} className="flex items-center gap-2">
                    <Focusable
                      focusId={`install-location-${index}`}
                      group={GROUP}
                      order={index}
                      noScale
                      role="radio"
                      aria-checked={checked}
                      disabled={!location.available || busy}
                      onClick={() => setSelected(location.id)}
                      className={clsx(
                        'orbit-glass-control flex min-w-0 flex-1 items-center gap-3 rounded-card px-4 py-3 text-left disabled:opacity-45',
                        checked
                          ? 'bg-orbit-accent/20 ring-2 ring-orbit-accent'
                          : 'bg-white/[0.06]',
                      )}
                    >
                      <Icon size={18} className="shrink-0 text-white/80" aria-hidden />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate text-sm font-semibold">
                          {location.label}
                        </span>
                        <span className="truncate text-xs text-orbit-muted">
                          {spaceCaption(location)}
                          {location.path ? ` · ${location.path}` : ''}
                        </span>
                      </span>
                    </Focusable>
                    {location.path && location.gameCount === 0 && (
                      <Focusable
                        focusId={`install-location-remove-${index}`}
                        group={GROUP}
                        order={index}
                        noScale
                        aria-label={`Remove ${location.label}`}
                        disabled={busy}
                        onClick={() => void remove(location)}
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/15"
                      >
                        <X size={14} />
                      </Focusable>
                    )}
                  </div>
                )
              })}
              <div className="flex flex-wrap gap-2">
                <Focusable
                  focusId="install-location-add"
                  group={GROUP}
                  order={list.length}
                  noScale
                  disabled={busy}
                  onClick={() => void addFolder()}
                  className="flex flex-1 items-center gap-3 rounded-full border border-dashed border-white/20 px-4 py-3 text-left text-sm font-semibold text-white/85 hover:bg-white/[0.05]"
                >
                  <FolderPlus size={18} aria-hidden />
                  Add a folder…
                </Focusable>
                <Focusable
                  focusId="install-location-enter-path"
                  group={GROUP}
                  order={list.length + 1}
                  noScale
                  disabled={busy}
                  onClick={() => setShowPathInput((current) => !current)}
                  className="flex items-center gap-2 rounded-full border border-dashed border-white/20 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/[0.05]"
                >
                  <Plus size={16} aria-hidden />
                  Enter path…
                </Focusable>
              </div>
              {showPathInput && (
                <div className="mt-1 flex items-center gap-2">
                  <input
                    aria-label="New install folder path"
                    className="orbit-input min-h-[40px] min-w-0 flex-1 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm text-orbit-foreground placeholder:text-white/30"
                    value={customPath}
                    disabled={busy}
                    onChange={(event) => setCustomPath(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void addPath(customPath)
                    }}
                    placeholder="/Volumes/Fast Drive/Orbit"
                    spellCheck={false}
                  />
                  <Focusable
                    focusId="install-location-create-path"
                    group={GROUP}
                    order={list.length + 2}
                    noScale
                    disabled={busy || !customPath.trim()}
                    onClick={() => void addPath(customPath)}
                    className="rounded-full bg-white/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-45"
                  >
                    Add
                  </Focusable>
                </div>
              )}
            </div>
            <div className="mt-7 flex justify-end gap-3">
              <Focusable
                focusId="install-location-cancel"
                group={GROUP}
                order={list.length + 3}
                disabled={busy}
                onClick={onClose}
                className="orbit-glass-control rounded-full bg-white/10 px-5 py-3 font-semibold"
              >
                Cancel
              </Focusable>
              <Focusable
                focusId="install-location-confirm"
                group={GROUP}
                order={list.length + 4}
                disabled={busy || (!native && !choice?.available)}
                onClick={install}
                className="rounded-full bg-orbit-accent px-5 py-3 font-semibold text-white disabled:opacity-45"
              >
                Install
              </Focusable>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
