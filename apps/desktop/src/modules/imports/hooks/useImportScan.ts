import { open } from '@/lib/dialog'
import { useGameActions } from '@/hooks/useGames'
import { useUiStore } from '@/stores/ui.store'
import type { ScanResult } from '@/types/game'

export type ImportScanId = 'steam' | 'native' | 'astris' | 'gamehub'

export type ImportScanMessageStyle = 'imported' | 'sync'

export type ImportScanOptions = {
  /** Folder for Astris / GameHub when already chosen (skips picker for Astris). */
  folder?: string
  /** Toast / status copy style. Defaults to `sync`. */
  messageStyle?: ImportScanMessageStyle
  /** When true (default), writes success and error messages to the import toast. */
  toast?: boolean
}

export type ImportScanOutcome = {
  result: ScanResult
  message: string
}

function enrichedSuffix(enriched: number) {
  return enriched > 0 ? ` · enriched ${enriched}` : ''
}

function formatScanMessage(
  id: ImportScanId,
  result: ScanResult,
  style: ImportScanMessageStyle,
  folder?: string,
): string {
  if (style === 'imported') {
    switch (id) {
      case 'steam':
        return `Imported ${result.imported} Steam games${enrichedSuffix(result.enriched)}`
      case 'native':
        return `Imported ${result.imported} macOS apps${enrichedSuffix(result.enriched)}`
      case 'astris':
        return `Imported ${result.imported} Switch titles${enrichedSuffix(result.enriched)}`
      case 'gamehub':
        return folder
          ? `Imported ${result.imported} GameHub titles${enrichedSuffix(result.enriched)}`
          : `Imported ${result.imported} GameHub shortcuts${enrichedSuffix(result.enriched)}`
    }
  }

  switch (id) {
    case 'steam':
      return `Steam sync complete · ${result.imported} games${enrichedSuffix(result.enriched)}`
    case 'native':
      return `macOS scan complete · ${result.imported} apps${enrichedSuffix(result.enriched)}`
    case 'astris':
      return `Astris sync complete · ${result.imported} titles${enrichedSuffix(result.enriched)}`
    case 'gamehub':
      return `GameHub sync complete · ${result.imported} shortcuts${enrichedSuffix(result.enriched)}`
  }
}

/**
 * Shared Steam / native / Astris / GameHub scan branches used by Add Game and Imports.
 * O(1) per scan invoke — no list iteration on the frontend.
 */
export function useImportScan() {
  const setImportToast = useUiStore((s) => s.setImportToast)
  const { scanSteam, scanAstris, scanNative, scanGamehub } = useGameActions()

  const runScan = async (
    id: ImportScanId,
    options: ImportScanOptions = {},
  ): Promise<ImportScanOutcome | null> => {
    const messageStyle = options.messageStyle ?? 'sync'
    const toast = options.toast ?? true

    try {
      let result: ScanResult
      const folder = options.folder

      if (id === 'steam') {
        result = await scanSteam.mutateAsync()
      } else if (id === 'native') {
        result = await scanNative.mutateAsync()
      } else if (id === 'astris') {
        let astrisFolder = folder
        if (!astrisFolder) {
          const picked = await open({ directory: true, multiple: false })
          if (!picked || Array.isArray(picked)) return null
          astrisFolder = picked
        }
        result = await scanAstris.mutateAsync(astrisFolder)
      } else {
        result = await scanGamehub.mutateAsync(folder)
      }

      const message = formatScanMessage(id, result, messageStyle, folder)
      if (toast) setImportToast(message)
      return { result, message }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (toast) setImportToast(message)
      throw error
    }
  }

  return { runScan }
}
