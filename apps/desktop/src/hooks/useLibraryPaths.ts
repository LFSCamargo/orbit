import { useState } from 'react'
import { useSteamWindows } from '@/hooks/useSteamWindows'
import { open } from '@/lib/dialog'

/** Extra Steam library folders Orbit scans (`additionalLibraryPaths`), shared
 * by Settings → Steam and onboarding. `onAdded` runs after a folder is saved,
 * e.g. to rescan right away.
 */
export function useLibraryPaths({ onAdded }: { onAdded?: () => Promise<unknown> } = {}) {
  const { preferences, savePreferences } = useSteamWindows()
  const [pickerError, setPickerError] = useState('')
  const [failedPath, setFailedPath] = useState('')
  const current = preferences.data
  const paths = current?.additionalLibraryPaths ?? []

  /** Saves a folder; resolves false (keeping the caller's draft) when saving fails. */
  const add = async (value: string) => {
    const trimmed = value.trim()
    if (!current || !trimmed) return false
    setFailedPath('')
    try {
      await savePreferences.mutateAsync({
        ...current,
        additionalLibraryPaths: [...new Set([...paths, trimmed])],
      })
    } catch {
      setFailedPath(trimmed)
      return false
    }
    try {
      await onAdded?.()
    } catch {
      /* The caller shows its own follow-up error. */
    }
    return true
  }

  const remove = (value: string) => {
    if (!current) return
    savePreferences.mutate({
      ...current,
      additionalLibraryPaths: paths.filter((item) => item !== value),
    })
  }

  const browse = async (title: string) => {
    setPickerError('')
    try {
      const selected = await open({ directory: true, title })
      if (typeof selected === 'string') return add(selected)
    } catch {
      setPickerError('Could not open the folder picker. Paste a folder path instead.')
    }
    return false
  }

  const clearFailed = () => {
    setFailedPath('')
    setPickerError('')
    savePreferences.reset()
  }

  return {
    paths,
    loaded: Boolean(current),
    saving: savePreferences.isPending,
    loadError: preferences.isError,
    failedPath,
    error:
      pickerError ||
      (savePreferences.isError
        ? savePreferences.error instanceof Error
          ? savePreferences.error.message
          : String(savePreferences.error)
        : ''),
    add,
    remove,
    browse,
    clearFailed,
  }
}
