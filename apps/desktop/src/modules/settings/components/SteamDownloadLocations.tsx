import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, HardDrive, Laptop, Plus, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { open } from '@/lib/dialog'
import { errorText, INSTALL_LOCATIONS_KEY, spaceCaption } from '@/lib/installLocations'
import {
  addInstallLocation,
  listInstallLocations,
  removeInstallLocation,
} from '@/lib/tauri'
import type { InstallLocation } from '@/types/downloads'
import {
  LIBRARY_CARD,
  LIBRARY_CARD_DESC,
  LIBRARY_CARD_TITLE,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from './libraryStyles'

/** Settings → Library card for adding external SSDs or folders for Steam downloads. */
export function SteamDownloadLocations() {
  const client = useQueryClient()
  const locations = useQuery({
    queryKey: INSTALL_LOCATIONS_KEY,
    queryFn: listInstallLocations,
  })
  const [path, setPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [addedNotice, setAddedNotice] = useState('')

  const refresh = () => client.invalidateQueries({ queryKey: INSTALL_LOCATIONS_KEY })

  const add = async (rawPath: string) => {
    const trimmed = rawPath.trim()
    if (!trimmed) return
    setBusy(true)
    setError('')
    setAddedNotice('')
    try {
      const added = await addInstallLocation(trimmed)
      setPath('')
      setAddedNotice(
        `Prepared ${added.label} (${added.path ?? trimmed}). Downloads can now be saved there.`,
      )
      await refresh()
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  const browse = async () => {
    setError('')
    setAddedNotice('')
    try {
      const picked = await open({
        directory: true,
        title: 'Choose a drive or folder for Steam downloads',
      })
      if (typeof picked === 'string') await add(picked)
    } catch {
      setError('Could not open the folder picker. Paste a folder path instead.')
    }
  }

  const remove = async (location: InstallLocation) => {
    setError('')
    setAddedNotice('')
    setBusy(true)
    try {
      await removeInstallLocation(location.id)
      await refresh()
    } catch (caught) {
      setError(errorText(caught))
    } finally {
      setBusy(false)
    }
  }

  const list = locations.data ?? []

  return (
    <section className={LIBRARY_CARD} aria-labelledby="steam-download-locations-title">
      <div>
        <h3 id="steam-download-locations-title" className={LIBRARY_CARD_TITLE}>
          Steam download locations
        </h3>
        <p className={LIBRARY_CARD_DESC}>
          Where Orbit downloads and installs new Windows Steam games. Add an empty SSD or
          folder path and Orbit creates its Steam library folder automatically.
        </p>
      </div>

      {list.length > 0 && (
        <ul
          aria-label="Steam download locations"
          className="m-0 grid list-none gap-px overflow-hidden rounded-[14px] border border-white/[0.08] p-0"
        >
          {list.map((location, order) => {
            const Icon = location.path ? HardDrive : Laptop
            return (
              <li
                key={location.id}
                className="flex items-center gap-3 bg-white/[0.035] px-3.5 py-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/[0.07] text-orbit-accent">
                  <Icon size={17} aria-hidden />
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-white">
                      {location.label}
                    </span>
                    {location.isDefault && (
                      <span className="rounded-full bg-orbit-accent/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-orbit-accent">
                        Default
                      </span>
                    )}
                    {location.gameCount > 0 && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/75">
                        {location.gameCount} {location.gameCount === 1 ? 'game' : 'games'}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[12px] text-orbit-muted">
                    {spaceCaption(location)}
                    {location.path ? ` · ${location.path}` : ''}
                  </span>
                </span>
                {location.path && location.gameCount === 0 && (
                  <Focusable
                    focusId={`settings-steam-download-remove-${order}`}
                    group="settings-steam"
                    order={1 + order}
                    noScale
                    disabled={busy}
                    aria-label={`Remove download location ${location.label}`}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-orbit-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                    onClick={() => void remove(location)}
                  >
                    <X size={16} aria-hidden />
                  </Focusable>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="grid gap-2">
        <label
          className="text-[12px] font-semibold text-orbit-muted"
          htmlFor="steam-download-location"
        >
          New download drive or folder
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="steam-download-location"
            className="orbit-input min-h-[40px] min-w-[220px] flex-1 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[14px] text-orbit-foreground placeholder:text-white/30"
            value={path}
            disabled={busy}
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add(path)
            }}
            placeholder="/Volumes/Fast Drive/Orbit"
            spellCheck={false}
          />
          <Focusable
            focusId="settings-steam-download-browse"
            group="settings-steam"
            order={2 + list.length}
            noScale
            disabled={busy}
            className={QUIET_BUTTON}
            onClick={() => void browse()}
          >
            <FolderOpen size={14} aria-hidden />
            Browse folders
          </Focusable>
          <Focusable
            focusId="settings-steam-download-add"
            group="settings-steam"
            order={3 + list.length}
            noScale
            disabled={busy || !path.trim()}
            className={PRIMARY_BUTTON}
            onClick={() => void add(path)}
          >
            <Plus size={14} aria-hidden />
            Add download folder
          </Focusable>
        </div>
      </div>

      {addedNotice && (
        <p role="status" className="m-0 text-[13px] text-emerald-300">
          {addedNotice}
        </p>
      )}
      {locations.isError && (
        <p role="alert" className="m-0 text-[13px] text-rose-300">
          Could not load download locations.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-rose-300">
          {error}
        </p>
      )}
    </section>
  )
}
