import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { clsx } from 'clsx'
import { FolderPlus, HardDrive, Laptop, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { useOverlayBack } from '@/controllers/overlayStack'
import { useModalFocus } from '@/hooks/useModalFocus'
import { open as openPanel } from '@/lib/dialog'
import { useDownloadStore } from '@/lib/downloadProgress'
import { formatBytes } from '@/lib/format'
import {
  addInstallLocation,
  enqueueMsStoreDownload,
  enqueueSteamDownload,
  listInstallLocations,
  removeInstallLocation,
} from '@/lib/tauri'
import { notify } from '@/lib/toast'
import type { InstallLocation } from '@/types/downloads'

const GROUP = 'install-location'
const INSTALL_LOCATIONS_KEY = ['install-locations'] as const

/** The location preselected when the picker opens: the last one used while
 * it is connected, else This Mac. */
export function initialLocation(locations: InstallLocation[]): string {
  const preferred = locations.find((location) => location.isDefault && location.available)
  return preferred?.id ?? 'this-mac'
}

export function spaceCaption(location: InstallLocation): string {
  if (!location.available) return 'Not connected'
  if (location.freeBytes == null) return location.path ?? ''
  const total = location.totalBytes ? ` of ${formatBytes(location.totalBytes)}` : ''
  return `${formatBytes(location.freeBytes)} free${total}`
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Asks where to install a Steam game before it joins the download queue:
 * This Mac or any folder the person adds (an external drive, for example).
 */
export function InstallLocationDialog({
  game,
  onClose,
}: {
  game: { appId: string; title: string; provider?: 'steam' | 'ms-store' } | null
  onClose: () => void
}) {
  const open = game !== null
  const client = useQueryClient()
  const locations = useQuery({
    queryKey: INSTALL_LOCATIONS_KEY,
    queryFn: listInstallLocations,
    enabled: open,
  })
  const [selected, setSelected] = useState('this-mac')
  const [busy, setBusy] = useState(false)
  // Preselect once per opening; a refetch after adding a folder must not
  // undo the person's pick.
  const preselected = useRef<string | null>(null)
  useEffect(() => {
    if (!game) {
      preselected.current = null
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

  const addFolder = async () => {
    const picked = await openPanel({
      directory: true,
      title: 'Choose where to install games',
    })
    if (!picked || Array.isArray(picked)) return
    setBusy(true)
    try {
      const added = await addInstallLocation(picked)
      await refresh()
      setSelected(added.id)
    } catch (error) {
      notify.error({ title: 'Could not use that folder', message: errorText(error) })
    } finally {
      setBusy(false)
    }
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
    const isMsStore = game.provider === 'ms-store'
    const key = isMsStore ? `msstore:${game.appId}` : `steam:${game.appId}`
    useDownloadStore.getState().start({ key, label: game.title })
    onClose()
    const request = isMsStore
      ? enqueueMsStoreDownload(game.appId, selected)
      : enqueueSteamDownload(game.appId, selected)
    void request
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
              Choose where to keep the game’s files. Other drives work too: add a folder
              on one.
            </p>
            <div
              className="mt-5 grid gap-2"
              role="radiogroup"
              aria-label="Install location"
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
              <Focusable
                focusId="install-location-add"
                group={GROUP}
                order={list.length}
                noScale
                disabled={busy}
                onClick={() => void addFolder()}
                className="flex items-center gap-3 rounded-full border border-dashed border-white/20 px-4 py-3 text-left text-sm font-semibold text-white/85 hover:bg-white/[0.05]"
              >
                <FolderPlus size={18} aria-hidden />
                Add a folder…
              </Focusable>
            </div>
            <div className="mt-7 flex justify-end gap-3">
              <Focusable
                focusId="install-location-cancel"
                group={GROUP}
                order={list.length + 1}
                disabled={busy}
                onClick={onClose}
                className="orbit-glass-control rounded-full bg-white/10 px-5 py-3 font-semibold"
              >
                Cancel
              </Focusable>
              <Focusable
                focusId="install-location-confirm"
                group={GROUP}
                order={list.length + 2}
                disabled={busy || !choice?.available}
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
