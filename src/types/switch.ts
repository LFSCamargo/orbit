export type SwitchContentKind = 'base' | 'update' | 'dlc' | 'unknown'

export interface SwitchRomEntry {
  path: string
  fileName: string
  label: string
  titleId?: string
  version?: string
  kind: SwitchContentKind
  sizeBytes?: number
  inLibrary: boolean
}

export interface SwitchTitleGroup {
  groupKey: string
  displayTitle: string
  baseTitleId?: string
  linkedGameId?: string
  base?: SwitchRomEntry
  updates: SwitchRomEntry[]
  dlcs: SwitchRomEntry[]
  extras: SwitchRomEntry[]
}

export interface SwitchLibraryScan {
  folders: string[]
  groups: SwitchTitleGroup[]
  totalFiles: number
}
