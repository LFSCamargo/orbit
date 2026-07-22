import { useMutation } from '@tanstack/react-query'
import {
  scanSwitchLibraryFolder,
  scanSwitchLibraryFromLibrary,
} from '@/lib/tauri'
import type { SwitchContentKind } from '@/types/switch'

export function useSwitchLibraryScan() {
  return useMutation({
    mutationFn: scanSwitchLibraryFromLibrary,
  })
}

export function useSwitchLibraryFolderScan() {
  return useMutation({
    mutationFn: (folder: string) => scanSwitchLibraryFolder(folder),
  })
}

export function kindLabel(kind: SwitchContentKind): string {
  switch (kind) {
    case 'base':
      return 'Base game'
    case 'update':
      return 'Update'
    case 'dlc':
      return 'DLC'
    default:
      return 'Extra'
  }
}
