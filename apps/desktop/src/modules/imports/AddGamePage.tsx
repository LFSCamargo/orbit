import { WineProfileEditor } from '@/components/runtime/WineProfileEditor'
import type { WineProfile } from '@/types/runtime'
import { useEffect, useMemo, useState } from 'react'
import { open } from '@/lib/dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, FolderOpen, Gamepad2, HardDrive } from 'lucide-react'
import { Focusable } from '@/components/focus/Focusable'
import { focusManager } from '@/controllers/FocusManager'
import { useGameActions } from '@/hooks/useGames'
import { useImportScan, type ImportScanId } from '@/modules/imports/hooks/useImportScan'
import { useUiStore } from '@/stores/ui.store'
import { notify } from '@/lib/toast'
import { ThemePage } from '@/themes/ThemePage'
import type { GamePlatform, GameProvider, LaunchConfiguration } from '@/types/game'
import { buttonClass } from '@/components/ui/button'

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
    id: 'astris',
    title: 'Astris (.nsp / .xci)',
    body: 'Pick a folder of Nintendo Switch dumps. Orbit parses filenames only.',
    provider: 'astris',
    extensions: ['nsp', 'xci'],
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
  const setScreen = useUiStore((s) => s.setScreen)
  const { create } = useGameActions()
  const { runScan } = useImportScan()

  const [step, setStep] = useState<Step>('source')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wineProfile, setWineProfile] = useState<WineProfile>({
    executable: '',
    runtimePath: '',
    arguments: [],
    environment: {},
  })

  const source = useMemo(
    () => SOURCES.find((item) => item.id === sourceId) ?? null,
    [sourceId],
  )
  useEffect(() => {
    if (step !== 'source') return
    let attempts = 0
    let frame = 0
    const focusSource = () => {
      if (document.querySelector('[data-screen="add-game"] [data-focused="true"]')) return
      if (focusManager.hasNode('add-source-astris')) {
        focusManager.setFocus('add-source-astris')
        return
      }
      if (++attempts < 30) frame = requestAnimationFrame(focusSource)
    }
    frame = requestAnimationFrame(focusSource)
    return () => cancelAnimationFrame(frame)
  }, [step])

  const runAutoImport = async (id: string) => {
    setBusy(true)
    setStatus(null)
    try {
      const outcome = await runScan(id as ImportScanId, {
        messageStyle: 'imported',
        toast: false,
      })
      if (outcome) finish(outcome.message)
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
      setWineProfile((p) => ({ ...p, executable: selected }))

      if (source.id === 'astris') {
        const outcome = await runScan(source.id, {
          folder: selected,
          messageStyle: 'imported',
          toast: false,
        })
        if (outcome) finish(outcome.message)
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
        launchConfig:
          ext === 'exe' ? { type: 'wine', profile: wineProfile } : launchConfig,
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
    notify.success({ title: message })
    setStep('done')
  }

  return (
    <ThemePage
      title="Add game"
      subtitle="Controller-friendly import for Astris, macOS apps, and local files."
    >
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
                  <div className="orbit-glass-control mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-orbit-accent/15 text-orbit-accent">
                    {item.id === 'astris' ? (
                      <Gamepad2 className="h-5 w-5" />
                    ) : (
                      <HardDrive className="h-5 w-5" />
                    )}
                  </div>
                  <h2 className="font-display text-2xl font-semibold">{item.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-orbit-muted">
                    {item.body}
                  </p>
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
                  className={buttonClass({ size: 'lg', shape: 'card' })}
                >
                  <FolderOpen className="h-4 w-4" />
                  {source.folder ? 'Choose folder' : 'Choose file'}
                </Focusable>
                <Focusable
                  focusId="add-path-back"
                  group="add-path"
                  order={1}
                  onClick={() => setStep('source')}
                  className="orbit-glass-control rounded-card bg-white/10 px-5 py-3"
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
              {selectedPath?.toLowerCase().endsWith('.exe') && (
                <div className="mt-6">
                  <WineProfileEditor value={wineProfile} onChange={setWineProfile} />
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Focusable
                  focusId="add-save"
                  group="add-details"
                  order={0}
                  disabled={
                    busy ||
                    !title.trim() ||
                    (selectedPath?.toLowerCase().endsWith('.exe') &&
                      !wineProfile.runtimePath)
                  }
                  onClick={() => void saveManual()}
                  className={buttonClass({ size: 'lg', shape: 'card' })}
                >
                  Add to library
                </Focusable>
                <Focusable
                  focusId="add-details-back"
                  group="add-details"
                  order={1}
                  onClick={() => setStep('path')}
                  className="orbit-glass-control rounded-card bg-white/10 px-5 py-3"
                >
                  Back
                </Focusable>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="orbit-panel max-w-xl rounded-theme p-8">
              <div className="orbit-glass-control mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
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
                  className={buttonClass({ size: 'lg', shape: 'card' })}
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
                  className="orbit-glass-control rounded-card bg-white/10 px-5 py-3"
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
      provider: 'manual',
      platform: 'windows',
      launchConfig: {
        type: 'wine',
        profile: { executable: path, runtimePath: '', arguments: [], environment: {} },
      },
    }
  }
  return {
    provider: 'manual',
    platform: 'unknown',
    launchConfig: { type: 'open-file', filePath: path },
  }
}
