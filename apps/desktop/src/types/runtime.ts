export interface WineInstallation {
  path: string
  serverPath: string
  version: string
}
export type GraphicsBackend = 'auto' | 'wine' | 'dxvk' | 'dxmt' | 'd3dmetal'
export type Synchronization = 'default' | 'esync' | 'msync'
export type Resolution = 'auto' | 'custom'

export interface CompatibilitySettings {
  graphics: GraphicsBackend
  synchronization: Synchronization
  retinaMode: boolean
  metalHud: boolean
  avx: boolean
  upscaling: boolean
  upscaleRatio: number
  frameGeneration: boolean
  frameGenerationVsync: boolean
  frameRateLimit: number | null
  dxmtNvidiaExtensions: boolean
  resolution: Resolution
  resolutionWidth: number
  resolutionHeight: number
}

export type CompatibilityOverrides = Partial<CompatibilitySettings>

export interface WineProfile {
  executable: string
  runtimePath: string
  arguments: string[]
  environment: Record<string, string>
  compatibility?: CompatibilityOverrides
}

export interface CompatibilityStatus {
  /** Backend system flag. Managed compatibility is intentionally macOS-only. */
  supported: boolean
  managed: WineInstallation | null
  package: {
    version: string
    downloadBytes: number
  }
}

export interface GptkFormula {
  tap: string
  name: string
  version: string
  fullName: string
}

export interface LocalGptkPackage {
  path: string
  file: string
  version: string
  kind: 'complete' | 'evaluation'
  sizeBytes: number
  digestVerified: boolean
}

export interface ComponentVersion {
  version: string
  prerelease: boolean
  asset: {
    name: string
    url: string
    size: number
    sha256: string | null
  }
  homebrewFormula: GptkFormula | null
  localPackage: LocalGptkPackage | null
}

export interface CatalogComponent {
  id: string
  name: string
  technology: string
  sourceUrl: string
  distribution: string
  downloadable: boolean
  versions: ComponentVersion[]
}

export interface CompatibilityCatalog {
  components: CatalogComponent[]
  fetchedAt: string
  warnings: string[]
}

export interface InstalledComponent {
  id: string
  version: string
  kind: 'wine' | 'dxvk' | 'dxmt' | 'moltenVk' | 'gptk' | 'vkd3dproton' | 'zink'
  path: string
  installedAt: string
}

export interface ComponentSpec {
  id: string
  version: string
  url: string
  size: number
  sha256: string | null
}

/** Component id to the installed version a launch should use. */
export type ActiveComponents = Record<string, string>

export type SetupProgress =
  | {
      phase: 'Downloading'
      component: string
      downloadedBytes: number
      totalBytes: number
    }
  | { phase: 'Verifying'; component: string }
  | { phase: 'Extracting'; component: string }
  | { phase: 'Installing'; component: string }
  | { phase: 'Ready'; component: string; message: string }
