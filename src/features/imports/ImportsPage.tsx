import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions, useImporters } from '@/hooks/useGames'
import { GAMEHUB_SETUP_STEPS } from '@/lib/launchConfig'
import { useUiStore } from '@/stores/ui.store'

const IMPORTERS = [
  {
    id: 'steam',
    title: 'Steam',
    body: 'Detects Steam libraries, playtime, install size, and local achievements. Launches via steam://rungameid.',
  },
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
    id: 'gamehub',
    title: 'GameHub',
    body: 'Import GameHub shortcuts from /Applications and ~/Applications. Only .app bundles with bundle id com.gamehub.shortcut.* are added.',
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
  const setImportToast = useUiStore((s) => s.setImportToast)
  const importToast = useUiStore((s) => s.importToast)
  const { data: statuses = [] } = useImporters()
  const { scanSteam, scanAstris, scanNative, scanGamehub } = useGameActions()
  const [busyId, setBusyId] = useState<string | null>(null)

  const statusFor = (id: string) => statuses.find((item) => item.id === id)

  const run = async (id: string) => {
    if (id === 'manual') {
      openAddGame()
      return
    }

    setBusyId(id)
    try {
      if (id === 'steam') {
        const result = await scanSteam.mutateAsync()
        setImportToast(`Steam sync complete · ${result.imported} games`)
      } else if (id === 'native') {
        const result = await scanNative.mutateAsync()
        setImportToast(`macOS scan complete · ${result.imported} apps`)
      } else if (id === 'astris') {
        const folder = await open({ directory: true, multiple: false })
        if (!folder || Array.isArray(folder)) return
        const result = await scanAstris.mutateAsync(folder)
        setImportToast(`Astris sync complete · ${result.imported} titles`)
      } else if (id === 'gamehub') {
        const result = await scanGamehub.mutateAsync(undefined)
        setImportToast(`GameHub sync complete · ${result.imported} shortcuts`)
      }
    } catch (error) {
      setImportToast(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="orbit-panel rounded-theme p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-semibold">Import games</h2>
          <p className="mt-1 text-sm text-orbit-muted">
            Bring games into Orbit from Steam, Astris, GameHub, native macOS apps, or a single file.
          </p>
        </div>
        <Focusable
          focusId="imports-add"
          group="imports-top"
          order={0}
          noScale
          noRing
          onClick={openAddGame}
          className="rounded-card bg-orbit-accent px-5 py-3 font-semibold text-orbit-canvas"
        >
          Add game journey
        </Focusable>
      </div>

      <AnimatePresence>
        {importToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-5 rounded-card bg-orbit-accent/15 px-4 py-3 text-sm text-orbit-accent ring-1 ring-orbit-accent/30"
          >
            {importToast}
          </motion.div>
        )}
      </AnimatePresence>

      <Focusable
        focusId="imports-switch-library"
        group="imports-top"
        order={1}
        noScale
        noRing
        onClick={() => setScreen('switch-library')}
        className="mt-5 block rounded-card bg-white/5 p-5 text-left ring-1 ring-white/10"
      >
        <h3 className="font-display text-lg font-semibold">Switch content visualizer</h3>
        <p className="mt-2 text-sm text-orbit-muted">
          See base games, updates, and DLC for titles already in your library. Orbit scans the ROM
          folders from your imported Astris paths automatically.
        </p>
      </Focusable>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {IMPORTERS.map((item, index) => {
          const status = statusFor(item.id)
          const label =
            busyId === item.id
              ? 'Scanning…'
              : status?.detected
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
              className="rounded-card bg-white/5 p-5 text-left orbit-transition ring-1 ring-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] uppercase tracking-wider text-orbit-muted">
                  {label}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-orbit-muted">{item.body}</p>
              {item.id === 'gamehub' && (
                <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-orbit-muted">
                  {GAMEHUB_SETUP_STEPS.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              )}
            </Focusable>
          )
        })}
      </div>
    </div>
  )
}
