const UNITS = ['B', 'KB', 'MB', 'GB']

export function formatBytes(bytes: number): string {
  let value = bytes
  let index = 0
  while (value >= 1024 && index < UNITS.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${UNITS[index]}`
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export function formatReleaseDate(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return dateFormatter.format(date)
}
