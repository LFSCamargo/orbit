import { notify } from '@/lib/toast'
import { open } from '@/lib/dialog'
import { useGameActions } from '@/hooks/useGames'
import type { ScanResult } from '@/types/game'

export type ImportScanId = 'steam' | 'native' | 'astris'

export type ImportScanMessageStyle = 'imported' | 'sync'

export type ImportScanOptions = {
  folder?: string
  messageStyle?: ImportScanMessageStyle
  toast?: boolean
}

export type ImportScanOutcome = {
  result: ScanResult
  message: string
}

function enrichedSuffix(enriched: number) {
  return enriched > 0 ? ` · enriched ${enriched}` : ''
}

export function formatScanMessage(
  id: ImportScanId,
  result: ScanResult,
  style: ImportScanMessageStyle,
): string {
  if (style === 'imported') {
    switch (id) {
      case 'steam':
        return `Imported ${result.imported} Steam games${enrichedSuffix(result.enriched)}`
      case 'native':
        return `Imported ${result.imported} macOS apps${enrichedSuffix(result.enriched)}`
      case 'astris':
        return `Imported ${result.imported} Switch titles${enrichedSuffix(result.enriched)}`
    }
  }

  switch (id) {
    case 'steam':
      return `Steam sync complete · ${result.imported} games${enrichedSuffix(result.enriched)}`
    case 'native':
      return `macOS scan complete · ${result.imported} apps${enrichedSuffix(result.enriched)}`
    case 'astris':
      return `Astris sync complete · ${result.imported} titles${enrichedSuffix(result.enriched)}`
  }
}

/** Shared Steam / native / Astris scan branches used by Add Game and Imports. */
export function useImportScan() {
  const { scanSteam, scanAstris, scanNative } = useGameActions()

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
      } else {
        let astrisFolder = folder
        if (!astrisFolder) {
          const picked = await open({ directory: true, multiple: false })
          if (!picked || Array.isArray(picked)) return null
          astrisFolder = picked
        }
        result = await scanAstris.mutateAsync(astrisFolder)
      }

      const message = formatScanMessage(id, result, messageStyle)
      if (toast) notify.success({ title: 'Library updated', message })
      return { result, message }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (toast) notify.error({ title: 'Import failed', message })
      throw error
    }
  }

  return { runScan }
}
