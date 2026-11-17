import { useMutation, useQueryClient } from '@tanstack/react-query'
import { scanSteamInstallations } from '@/lib/tauri'
import { useState } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { open } from '@/lib/dialog'

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
    <section
      className="settings-card-inner mt-4 !px-0 !py-5"
      aria-labelledby="steam-library-folders-title"
    >
      <h3
        id="steam-library-folders-title"
        className="settings-row-title font-display text-[17px] font-semibold text-white"
      >
        Additional library folders
      </h3>
      <p className="settings-row-desc mt-1 max-w-[520px] text-[13px] text-[#ffffffa0]">
        Find existing Steam installations. Choose a Steam library folder or its
        steamapps/common folder. New downloads keep their current location.
      </p>
      <label className="mt-4 block text-sm" htmlFor="steam-additional-library">
        Additional Steam library folder
      </label>
      <div className="mt-2 flex flex-wrap gap-3">
        <input
          id="steam-additional-library"
          className="orbit-input min-h-[44px] min-w-0 flex-1 rounded-xl border border-orbit-border bg-orbit-surface px-3.5 py-2.5 text-base text-orbit-foreground"
          value={path}
          disabled={busy}
          onChange={(event) => setPath(event.target.value)}
          placeholder="/Users/you/SteamLibrary/steamapps/common"
          spellCheck={false}
        />
        <Focusable
          focusId="settings-steam-library-browse"
          group="settings-steam"
          order={8}
          noScale
          disabled={busy}
          className="steam-activity-button justify-self-start rounded-full bg-[#f7f8fb] px-3.5 py-[9px] text-[13px] font-[680] text-[#12141a] disabled:opacity-55"
          onClick={() => void browse()}
        >
          Browse folders
        </Focusable>
        <Focusable
          focusId="settings-steam-library-add"
          group="settings-steam"
          order={9}
          noScale
          disabled={busy || !path.trim()}
          className="steam-activity-button justify-self-start rounded-full bg-[#f7f8fb] px-3.5 py-[9px] text-[13px] font-[680] text-[#12141a] disabled:opacity-55"
          onClick={() => void add(path)}
        >
          Add library folder
        </Focusable>
      </div>
      {paths.length > 0 && (
        <Focusable
          focusId="settings-steam-library-scan"
          group="settings-steam"
          order={10}
          noScale
          disabled={busy}
          className="steam-activity-button mt-3 justify-self-start rounded-full bg-[#f7f8fb] px-3.5 py-[9px] text-[13px] font-[680] text-[#12141a] disabled:opacity-55"
          onClick={() => scan.mutate()}
        >
          {scan.isPending ? 'Scanning installed games…' : 'Scan installed games'}
        </Focusable>
      )}
      {scan.isSuccess && (
        <p role="status" className="mt-3 text-sm">
          Library scan complete. {scan.data.imported} new games added.
        </p>
      )}
      {scan.isError && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          Folder saved, but the library scan failed:{' '}
          {scan.error instanceof Error ? scan.error.message : String(scan.error)}. Use
          Scan installed games to retry.
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {paths.map((value, order) => (
          <li key={value} className="flex items-center justify-between gap-3">
            <span className="min-w-0 break-all text-sm">{value}</span>
            <Focusable
              focusId={`settings-steam-library-remove-${order}`}
              group="settings-steam"
              order={10 + order}
              noScale
              disabled={busy}
              aria-label={`Remove library folder ${value}`}
              className="steam-activity-button shrink-0 justify-self-start rounded-full bg-[#f7f8fb] px-3.5 py-[9px] text-[13px] font-[680] text-[#12141a] disabled:opacity-55"
              onClick={() => {
                if (current)
                  savePreferences.mutate({
                    ...current,
                    additionalLibraryPaths: paths.filter((item) => item !== value),
                  })
              }}
            >
              Remove
            </Focusable>
          </li>
        ))}
      </ul>
      {preferences.isError && (
        <p role="alert">Could not load library folder preferences.</p>
      )}
      {(savePreferences.isError || pickerError) && (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {pickerError ||
            (savePreferences.error instanceof Error
              ? savePreferences.error.message
              : String(savePreferences.error))}
        </p>
      )}
    </section>
  )
}
