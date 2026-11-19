import { useState } from 'react'
import { Focusable } from '@/components/focus/Focusable'
import { useImporters } from '@/hooks/useGames'
import { useImportScan, type ImportScanId } from '@/modules/imports/hooks/useImportScan'
import { useUiStore } from '@/stores/ui.store'
import { buttonClass } from '@/components/ui/button'
import { BusyLabel } from '@/components/feedback/BusyLabel'

const IMPORTERS = [
  {
    id: 'astris',
    title: 'Nintendo Switch (Astris)',
    body: 'Select folders containing .nsp / .xci files. Orbit parses filenames only — no decryption.',
  },
  {
    id: 'native',
    title: 'macOS Applications',
    body: 'Scans /Applications and ~/Applications for likely games using bundle metadata.',
  },
  {
    id: 'manual',
    title: 'Manual game',
    body: 'Guided journey to add a custom .app, .exe, .nsp, or .xci with your own metadata.',
  },
]

export function ImportsSection() {
  const openAddGame = useUiStore((s) => s.openAddGame)
  const setScreen = useUiStore((s) => s.setScreen)
  const { data: statuses = [] } = useImporters()
  const { runScan } = useImportScan()
  const [busyId, setBusyId] = useState<string | null>(null)

  const statusFor = (id: string) => statuses.find((item) => item.id === id)

  const run = async (id: string) => {
    if (id === 'manual') {
      openAddGame()
      return
    }

    setBusyId(id)
    try {
      await runScan(id as ImportScanId, { messageStyle: 'sync' })
    } catch {
      // Toast already set by useImportScan
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Import games</h2>
          <p className="mt-1 text-sm text-orbit-muted">
            Bring games into Orbit from Astris, native macOS apps, or a single file.
          </p>
        </div>
        <Focusable
          focusId="imports-add"
          group="imports-top"
          order={0}
          noScale
          noRing
          onClick={openAddGame}
          className={buttonClass({ size: 'lg' })}
        >
          Add game journey
        </Focusable>
      </div>

      <Focusable
        focusId="imports-switch-library"
        group="imports-top"
        order={1}
        noScale
        noRing
        onClick={() => setScreen('switch-library')}
        className="orbit-glass-control mt-5 block rounded-card bg-white/5 p-5 text-left ring-1 ring-white/10"
      >
        <h3 className="font-display text-lg font-semibold">Switch content visualizer</h3>
        <p className="mt-2 text-sm text-orbit-muted">
          See base games, updates, and DLC for titles already in your library. Orbit scans
          the ROM folders from your imported Astris paths automatically.
        </p>
      </Focusable>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {IMPORTERS.map((item, index) => {
          const status = statusFor(item.id)
          const label = status?.detected
            ? 'Detected'
            : item.id === 'manual'
              ? 'Guided'
              : 'Choose path'
          return (
            <Focusable
              key={item.id}
              focusId={`import-${item.id}`}
              group="imports"
              order={index}
              noScale
              noRing
              disabled={busyId !== null}
              onClick={() => void run(item.id)}
              className="orbit-transition orbit-glass-control rounded-card bg-white/5 p-5 text-left ring-1 ring-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                <span className="orbit-glass-control bg-white/8 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider text-orbit-muted">
                  <BusyLabel busy={busyId === item.id}>{label}</BusyLabel>
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-orbit-muted">{item.body}</p>
            </Focusable>
          )
        })}
      </div>
    </div>
  )
}
