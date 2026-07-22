export function formatPlaytime(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Never played'
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours <= 0) return `${minutes}m`
  if (minutes <= 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const digits = value >= 10 || unit === 0 ? 0 : 1
  return `${value.toFixed(digits)} ${units[unit]}`
}

export function formatAchievementProgress(unlocked: number, total: number): string {
  if (total <= 0) return 'None detected'
  return `${unlocked}/${total}`
}

export function formatRelativeDate(iso?: string): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'

  const diffMs = Date.now() - date.getTime()
  const dayMs = 86_400_000
  const days = Math.floor(diffMs / dayMs)

  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case 'astris':
      return 'Nintendo Switch'
    case 'steam':
      return 'Steam'
    case 'gamehub':
      return 'GameHub'
    case 'native':
      return 'macOS'
    case 'manual':
      return 'Manual'
    default:
      return provider
  }
}

export function formatDlcCount(count: number): string {
  if (count <= 0) return 'No DLC'
  return count === 1 ? '1 DLC' : `${count} DLC`
}

const HOME_DLC_NAME_LIMIT = 3

export function formatDlcNamesPreview(names: string[], limit = HOME_DLC_NAME_LIMIT): string {
  if (names.length === 0) return ''
  const shown = names.slice(0, limit)
  const preview = shown.join(' · ')
  const remaining = names.length - shown.length
  if (remaining <= 0) return preview
  return `${preview} +${remaining} more`
}

export function formatContentVersion(label?: string): string {
  return label?.trim() || 'Unknown'
}

export function formatContentDetail(summary: {
  versionDetail?: string
  dlcCount: number
  dlcNames: string[]
  updateCount: number
}): string {
  if (summary.versionDetail) return summary.versionDetail
  if (summary.dlcNames.length > 0) {
    return formatDlcNamesPreview(summary.dlcNames)
  }
  if (summary.updateCount > 0) {
    return `${summary.updateCount} update${summary.updateCount === 1 ? '' : 's'} on disk`
  }
  if (summary.dlcCount > 0) {
    return `${summary.dlcCount} add-on${summary.dlcCount === 1 ? '' : 's'} installed`
  }
  return 'Ready to play'
}

export function placeholderGradient(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h1 = Math.abs(hash) % 360
  const h2 = (h1 + 48) % 360
  return `linear-gradient(145deg, hsl(${h1} 42% 28%), hsl(${h2} 55% 14%) 60%, #07090d)`
}
