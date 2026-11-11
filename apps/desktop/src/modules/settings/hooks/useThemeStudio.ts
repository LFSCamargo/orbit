import { useState } from 'react'
import { useThemeStore } from '@/stores/theme.store'
import { buildStudioTheme, draftFromTheme, type StudioDraft } from '@/themes/studio'
import type { ThemeDefinition } from '@/themes/types'

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Draft state for the active theme; remount (key by theme id) to reset. */
export function useThemeStudio(base: ThemeDefinition) {
  const saveTheme = useThemeStore((s) => s.saveTheme)
  const deleteTheme = useThemeStore((s) => s.deleteTheme)
  const [draft, setDraft] = useState<StudioDraft>(() => draftFromTheme(base))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (patch: Partial<StudioDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
    } catch (err) {
      setError(message(err))
    } finally {
      setBusy(false)
    }
  }

  return {
    draft,
    update,
    busy,
    error,
    canDelete: base.kind === 'custom' && base.id.startsWith('custom-'),
    preview: buildStudioTheme(base, draft),
    save: () => run(() => saveTheme(buildStudioTheme(base, draft))),
    remove: () => run(() => deleteTheme(base.id)),
  }
}
