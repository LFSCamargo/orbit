import { useMutation, useQueryClient } from '@tanstack/react-query'
import { scanSteamInstallations } from '@/lib/tauri'
import { useState } from 'react'
import { FolderOpen, HardDrive, Plus, RefreshCw, X } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { open } from '@/lib/dialog'
import {
  LIBRARY_CARD,
  LIBRARY_CARD_DESC,
  LIBRARY_CARD_TITLE,
  PRIMARY_BUTTON,
  QUIET_BUTTON,
} from './libraryStyles'

/** The library's own name: `…/GameHub/steamapps/common` reads as "GameHub". */
export function libraryFolderName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  const steamapps = parts.lastIndexOf('steamapps')
  const name = steamapps > 0 ? parts[steamapps - 1] : parts[parts.length - 1]
  return name ?? path
}

export function SteamLibraryFolders() {
  const client = useQueryClient()
  const scan = useMutation({
    mutationFn: scanSteamInstallations,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['games'] }),
        client.invalidateQueries({ queryKey: ['library'] }),
        client.invalidateQueries({ queryKey: ['library-entry'] }),
        client.invalidateQueries({ queryKey: ['steam-windows-library'] }),
      ])
    },
  })
  const { preferences, savePreferences } = useSteamWindows()
  const [path, setPath] = useState('')
  const [pickerError, setPickerError] = useState('')
  const current = preferences.data
  const paths = current?.additionalLibraryPaths ?? []
  const busy = savePreferences.isPending || scan.isPending || !current
  const add = async (value: string) => {
    if (!current || !value.trim()) return
    try {
      await savePreferences.mutateAsync({
        ...current,
        additionalLibraryPaths: [...new Set([...paths, value.trim()])],
      })
      setPath('')
      await scan.mutateAsync()
    } catch {
      /* The mutation error is displayed below; keep the draft. */
    }
  }
  const browse = async () => {
    setPickerError('')
    try {
      const selected = await open({
        directory: true,
        title: 'Choose an existing Steam library folder',
      })
      if (typeof selected === 'string') await add(selected)
    } catch {
      setPickerError('Could not open the folder picker. Paste a folder path instead.')
    }
  }
  return (
    <section className={LIBRARY_CARD} aria-labelledby="steam-library-folders-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="steam-library-folders-title" className={LIBRARY_CARD_TITLE}>
            Steam library folders
          </h3>
          <p className={LIBRARY_CARD_DESC}>
            Orbit finds games already installed in these folders. Pick a Steam library or
            its steamapps/common folder. New downloads keep their current location.
          </p>
        </div>
        {paths.length > 0 && (
          <Focusable
            focusId="settings-steam-library-scan"
            group="settings-steam"
            order={8}
            noScale
            disabled={busy}
            className={QUIET_BUTTON}
            onClick={() => scan.mutate()}
          >
            <RefreshCw
              size={14}
              className={scan.isPending ? 'animate-spin' : undefined}
              aria-hidden
            />
            {scan.isPending ? 'Scanning installed games…' : 'Scan installed games'}
          </Focusable>
        )}
      </div>

      {paths.length > 0 ? (
        <ul
          aria-label="Steam library folders"
          className="m-0 grid list-none gap-px overflow-hidden rounded-[14px] border border-white/[0.08] p-0"
        >
          {paths.map((value, order) => (
            <li
              key={value}
              className="flex items-center gap-3 bg-white/[0.035] px-3.5 py-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/[0.07] text-orbit-accent">
                <HardDrive size={17} aria-hidden />
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-[14px] font-semibold text-white">
                  {libraryFolderName(value)}
                </span>
                <span className="truncate text-[12px] text-orbit-muted" title={value}>
                  {value}
                </span>
              </span>
              <Focusable
                focusId={`settings-steam-library-remove-${order}`}
                group="settings-steam"
                order={9 + order}
                noScale
                disabled={busy}
                aria-label={`Remove library folder ${value}`}
                className="grid size-8 shrink-0 place-items-center rounded-full text-orbit-muted transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                onClick={() => {
                  if (current)
                    savePreferences.mutate({
                      ...current,
                      additionalLibraryPaths: paths.filter((item) => item !== value),
                    })
                }}
              >
                <X size={16} aria-hidden />
              </Focusable>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 rounded-[14px] border border-dashed border-white/[0.12] px-4 py-5 text-center text-[13px] text-orbit-muted">
          No extra folders yet
        </p>
      )}

      <div className="grid gap-2">
        <label
          className="text-[12px] font-semibold text-orbit-muted"
          htmlFor="steam-additional-library"
        >
          Additional Steam library folder
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="steam-additional-library"
            className="orbit-input min-h-[40px] min-w-[220px] flex-1 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[14px] text-orbit-foreground placeholder:text-white/30"
            value={path}
            disabled={busy}
            onChange={(event) => setPath(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void add(path)
            }}
            placeholder="/Users/you/SteamLibrary"
            spellCheck={false}
          />
          <Focusable
            focusId="settings-steam-library-browse"
            group="settings-steam"
            order={9 + paths.length}
            noScale
            disabled={busy}
            className={QUIET_BUTTON}
            onClick={() => void browse()}
          >
            <FolderOpen size={14} aria-hidden />
            Browse folders
          </Focusable>
          <Focusable
            focusId="settings-steam-library-add"
            group="settings-steam"
            order={10 + paths.length}
            noScale
            disabled={busy || !path.trim()}
            className={PRIMARY_BUTTON}
            onClick={() => void add(path)}
          >
            <Plus size={14} aria-hidden />
            Add library folder
          </Focusable>
        </div>
      </div>

      {scan.isSuccess && (
        <p role="status" className="m-0 text-[13px] text-emerald-300">
          Library scan complete. {scan.data.imported} new games added.
        </p>
      )}
      {scan.isError && (
        <p role="alert" className="m-0 text-[13px] text-rose-300">
          Folder saved, but the library scan failed:{' '}
          {scan.error instanceof Error ? scan.error.message : String(scan.error)}. Use
          Scan installed games to retry.
        </p>
      )}
      {preferences.isError && (
        <p role="alert" className="m-0 text-[13px] text-rose-300">
          Could not load library folder preferences.
        </p>
      )}
      {(savePreferences.isError || pickerError) && (
        <p role="alert" className="m-0 text-[13px] text-rose-300">
          {pickerError ||
            (savePreferences.error instanceof Error
              ? savePreferences.error.message
              : String(savePreferences.error))}
        </p>
      )}
    </section>
  )
}
