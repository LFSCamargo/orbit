import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { ArrowLeft, FolderOpen, RefreshCw } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { SwitchTitleGroupCard } from '@/components/switch/SwitchTitleGroupCard'
import {
  useSwitchLibraryFolderScan,
  useSwitchLibraryScan,
} from '@/hooks/useSwitchLibrary'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'
import type { SwitchLibraryScan } from '@/types/switch'

export function SwitchLibraryPage() {
  const setScreen = useUiStore((s) => s.setScreen)
  const openGameDetails = useUiStore((s) => s.openGameDetails)
  const scanLibrary = useSwitchLibraryScan()
  const scanFolder = useSwitchLibraryFolderScan()
  const [scan, setScan] = useState<SwitchLibraryScan | null>(null)

  const refreshFromLibrary = async () => {
    const result = await scanLibrary.mutateAsync()
    setScan(result)
  }

  useEffect(() => {
    void refreshFromLibrary()
  }, [])

  const browseFolder = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected !== 'string') return
    const result = await scanFolder.mutateAsync(selected)
    setScan(result)
  }

  const busy = scanLibrary.isPending || scanFolder.isPending
  const folders = scan?.folders ?? []

  return (
    <ThemePage
      title="Switch content"
      subtitle="Base games, updates, and DLC detected from folders used by your imported Astris library."
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Focusable
          focusId="switch-library-back"
          group="switch-library-actions"
          order={0}
          noScale
          onClick={() => setScreen('settings')}
          className="inline-flex items-center gap-2 rounded-card bg-white/10 px-4 py-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Focusable>
        <Focusable
          focusId="switch-library-scan"
          group="switch-library-actions"
          order={1}
          noScale
          disabled={busy}
          onClick={() => void refreshFromLibrary()}
          className="inline-flex items-center gap-2 rounded-card bg-orbit-accent px-4 py-2 font-semibold text-orbit-canvas"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          {busy ? 'Scanning…' : 'Rescan from library'}
        </Focusable>
        <Focusable
          focusId="switch-library-browse"
          group="switch-library-actions"
          order={2}
          noScale
          disabled={busy}
          onClick={() => void browseFolder()}
          className="inline-flex items-center gap-2 rounded-card bg-white/10 px-4 py-2"
        >
          <FolderOpen className="h-4 w-4" />
          Scan a folder…
        </Focusable>
      </div>

      {scan && (
        <div className="mb-6 rounded-card bg-black/20 px-4 py-3 text-sm text-orbit-muted ring-1 ring-white/10">
          <p>
            {scan.totalFiles} ROM file{scan.totalFiles === 1 ? '' : 's'} across{' '}
            {folders.length} folder{folders.length === 1 ? '' : 's'} · {scan.groups.length}{' '}
            title{scan.groups.length === 1 ? '' : 's'}
          </p>
          {folders.length > 0 && (
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {folders.map((folder) => (
                <li key={folder} className="truncate" title={folder}>
                  {folder}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!busy && scan && folders.length === 0 && (
        <div className="orbit-panel rounded-theme p-6 text-sm text-orbit-muted">
          No Switch ROM folders found. Import Astris games first — Orbit reads each game&apos;s
          file path in your library and scans that directory for related content.
        </div>
      )}

      {scan && scan.groups.length > 0 && (
        <div className="space-y-4">
          {scan.groups.map((group, index) => (
            <SwitchTitleGroupCard
              key={group.groupKey}
              group={group}
              order={index}
              onOpenGame={openGameDetails}
            />
          ))}
        </div>
      )}
    </ThemePage>
  )
}
