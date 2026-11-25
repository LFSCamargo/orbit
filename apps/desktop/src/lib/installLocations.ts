import { formatBytes } from '@/lib/format'
import type { InstallLocation } from '@/types/downloads'

export const INSTALL_LOCATIONS_KEY = ['install-locations'] as const

/** The location preselected when the picker opens: the last one used while
 * it is connected, else This Mac. */
export function initialLocation(locations: InstallLocation[]): string {
  const preferred = locations.find((location) => location.isDefault && location.available)
  return preferred?.id ?? 'this-mac'
}

export function spaceCaption(location: InstallLocation): string {
  if (!location.available) return 'Not connected'
  if (location.freeBytes == null) return location.path ?? ''
  const total = location.totalBytes ? ` of ${formatBytes(location.totalBytes)}` : ''
  return `${formatBytes(location.freeBytes)} free${total}`
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
