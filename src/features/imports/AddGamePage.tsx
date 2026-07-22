import { useMemo, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Joystick,
} from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { useGameActions } from '@/hooks/useGames'
import { backTarget } from '@/lib/navigation'
import { useUiStore } from '@/stores/ui.store'
import { ThemePage } from '@/themes/ThemePage'
import type { GamePlatform, GameProvider, LaunchConfiguration } from '@/types/game'

type Step = 'source' | 'path' | 'details' | 'done'

const SOURCES: Array<{
  id: string
  title: string
  body: string
  provider: GameProvider
  extensions: string[]
  folder?: boolean
  autoSteam?: boolean
}> = [
  {
    id: 'steam',
    title: 'Steam',
    body: 'Scan your Steam library. Playtime, size, and achievements are detected automatically.',
    provider: 'steam',
    extensions: [],
    autoSteam: true,
  },
  {
    id: 'astris',
    title: 'Astris (.nsp / .xci)',
    body: 'Pick a folder of Nintendo Switch dumps. Orbit parses filenames only.',
    provider: 'astris',
    extensions: ['nsp', 'xci'],
    folder: true,
  },
  {
    id: 'gamehub',
    title: 'GameHub (.exe / .app)',
    body: 'Scan a GameHub / Wine folder for Windows executables and apps.',
    provider: 'gamehub',
    extensions: ['exe', 'app'],
    folder: true,
  },
  {
    id: 'native',
    title: 'macOS Applications',
    body: 'Scan /Applications for likely games using bundle metadata.',
    provider: 'native',
    extensions: ['app'],
  },
  {
    id: 'manual-file',
    title: 'Single file',
    body: 'Add one .app, .exe, .nsp, or .xci with custom title and artwork next.',
    provider: 'manual',
    extensions: ['app', 'exe', 'nsp', 'xci'],
  },
]

export function AddGamePage() {
  const screen = useUiStore((s) => s.screen)
  const previousScreen = useUiStore((s) => s.previousScreen)
  const setScreen = useUiStore((s) => s.setScreen)
  const setImportToast = useUiStore((s) => s.setImportToast)
  const {
    scanSteam,
    scanAstris,
    scanNative,
    scanGamehub,
    create,
  } = useGameActions()

  const [step, setStep] = useState<Step>('source')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const source = useMemo(
    () => SOURCES.find((item) => item.id === sourceId) ?? null,
    [sourceId],
  )

  const runAutoImport = async (id: string) => {
    setBusy(true)
    setStatus(null)
    try {
      if (id === 'steam') {
        const result = await scanSteam.mutateAsync()
        finish(`Imported ${result.imported} Steam games`)
      } else if (id === 'native') {
        const result = await scanNative.mutateAsync()
        finish(`Imported ${result.imported} macOS apps`)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const pickPath = async () => {
    if (!source) return
    setBusy(true)
    try {
      const selected = await open({
        directory: Boolean(source.folder),
        multiple: false,
        filters: source.folder
          ? undefined
          : [
              {
                name: 'Games',
                extensions: source.extensions,
              },
            ],
      })
      if (!selected || Array.isArray(selected)) {
        setBusy(false)
        return
      }
      setSelectedPath(selected)

      if (source.id === 'astris') {
        const result = await scanAstris.mutateAsync(selected)
        finish(`Imported ${result.imported} Switch titles`)
      } else if (source.id === 'gamehub') {
        const result = await scanGamehub.mutateAsync(selected)
        finish(`Imported ${result.imported} GameHub titles`)
      } else if (source.id === 'manual-file') {
        const base = selected.split('/').pop() ?? 'New Game'
        setTitle(base.replace(/\.(app|exe|nsp|xci)$/i, ''))
        setStep('details')
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const saveManual = async () => {
    if (!selectedPath || !title.trim()) return
    setBusy(true)
    try {
      const ext = selectedPath.split('.').pop()?.toLowerCase() ?? ''
      const { provider, platform, launchConfig } = launchFromPath(selectedPath, ext)
      await create.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        provider,
        platform,
        launchConfig,
      })
      finish(`Added ${title.trim()}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const finish = (message: string) => {
    setStatus(message)
    setImportToast(message)
    setStep('done')
  }

  return (
    <ThemePage title="Add game" subtitle="Controller-friendly import for Steam, Astris, GameHub, and local files.">
      <div className="mb-8">
        <Focusable
          focusId="add-back"
          group="add-nav"
          order={0}
          noScale
          onClick={() => setScreen(backTarget(screen, previousScreen))}
          className="inline-flex items-center gap-2 rounded-card bg-white/10 px-4 py-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Focusable>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 'source' && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {SOURCES.map((item, index) => (
                <Focusable
                  key={item.id}
                  focusId={`add-source-${item.id}`}
                  group="add-source"
                  order={index}
                  disabled={busy}
                  onClick={() => {
                    setSourceId(item.id)
                    if (item.autoSteam || item.id === 'native') {
                      void runAutoImport(item.id)
                    } else {
                      setStep('path')
                    }
                  }}
                  className="orbit-panel rounded-theme p-6 text-left"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orbit-accent/15 text-orbit-accent">
                    {item.id === 'steam' ? (
                      <Joystick className="h-5 w-5" />
                    ) : item.id === 'astris' ? (
                      <Gamepad2 className="h-5 w-5" />
                    ) : (
                      <HardDrive className="h-5 w-5" />
                    )}
                  </div>
                  <h2 className="font-display text-2xl font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-orbit-muted">{item.body}</p>
                </Focusable>
              ))}
            </div>
          )}

          {step === 'path' && source && (
            <div className="orbit-panel max-w-2xl rounded-theme p-8">
              <h2 className="font-display text-3xl font-semibold">{source.title}</h2>
              <p className="mt-2 text-orbit-muted">{source.body}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Focusable
                  focusId="add-pick-path"
                  group="add-path"
                  order={0}
                  disabled={busy}
                  onClick={() => void pickPath()}
                  className="inline-flex items-center gap-2 rounded-card bg-orbit-accent px-5 py-3 font-semibold text-orbit-canvas"
                >
                  <FolderOpen className="h-4 w-4" />
                  {source.folder ? 'Choose folder' : 'Choose file'}
                </Focusable>
                <Focusable
                  focusId="add-path-back"
                  group="add-path"
                  order={1}
                  onClick={() => setStep('source')}
                  className="rounded-card bg-white/10 px-5 py-3"
                >
                  Change source
                </Focusable>
              </div>
              {selectedPath && (
                <p className="mt-4 truncate text-sm text-orbit-muted">{selectedPath}</p>
              )}
            </div>
          )}

          {step === 'details' && (
            <div className="orbit-panel max-w-2xl rounded-theme p-8">
              <h2 className="font-display text-3xl font-semibold">Game details</h2>
              <p className="mt-2 text-orbit-muted">
                Confirm the title and optional description. Artwork can be set in Edit
                Properties after import.
              </p>
              <label className="mt-6 block text-sm text-orbit-muted">
                Title
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
                  rows={4}
                  className="mt-2 w-full rounded-card border border-orbit-border bg-orbit-surface px-4 py-3 text-orbit-foreground outline-none ring-orbit-focus focus:ring-2"
                />
              </label>
              <div className="mt-6 flex flex-wrap gap-3">
                <Focusable
                  focusId="add-save"
                  group="add-details"
                  order={0}
                  disabled={busy || !title.trim()}
                  onClick={() => void saveManual()}
                  className="rounded-card bg-orbit-accent px-5 py-3 font-semibold text-orbit-canvas"
                >
                  Add to library
                </Focusable>
                <Focusable
                  focusId="add-details-back"
                  group="add-details"
                  order={1}
                  onClick={() => setStep('path')}
                  className="rounded-card bg-white/10 px-5 py-3"
                >
                  Back
                </Focusable>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="orbit-panel max-w-xl rounded-theme p-8">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                <Check className="h-6 w-6" />
              </div>
              <h2 className="font-display text-3xl font-semibold">All set</h2>
              <p className="mt-2 text-orbit-muted">{status}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Focusable
                  focusId="add-done-library"
                  group="add-done"
                  order={0}
                  onClick={() => setScreen('library')}
                  className="rounded-card bg-orbit-accent px-5 py-3 font-semibold text-orbit-canvas"
                >
                  Open library
                </Focusable>
                <Focusable
                  focusId="add-done-again"
                  group="add-done"
                  order={1}
                  onClick={() => {
                    setStep('source')
                    setSourceId(null)
                    setSelectedPath(null)
                    setTitle('')
                    setDescription('')
                    setStatus(null)
                  }}
                  className="rounded-card bg-white/10 px-5 py-3"
                >
                  Add another
                </Focusable>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {status && step !== 'done' && (
        <p className="mt-6 text-sm text-orbit-muted">{status}</p>
      )}
    </ThemePage>
  )
}

function launchFromPath(
  path: string,
  ext: string,
): {
  provider: GameProvider
  platform: GamePlatform
  launchConfig: LaunchConfiguration
} {
  if (ext === 'nsp' || ext === 'xci') {
    return {
      provider: 'astris',
      platform: 'nintendo-switch',
      launchConfig: { type: 'open-file', filePath: path },
    }
  }
  if (ext === 'app') {
    return {
      provider: 'native',
      platform: 'macos',
      launchConfig: { type: 'open-application', applicationPath: path },
    }
  }
  if (ext === 'exe') {
    return {
      provider: 'gamehub',
      platform: 'windows',
      launchConfig: { type: 'open-file', filePath: path },
    }
  }
  return {
    provider: 'manual',
    platform: 'unknown',
    launchConfig: { type: 'open-file', filePath: path },
  }
}
