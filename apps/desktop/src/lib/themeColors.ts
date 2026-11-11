/** Theme colors are stored as space-separated "R G B" so CSS can apply alpha. */
export function rgbToHex(rgb: string): string {
  const parts = rgb.split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return '#000000'
  }
  return `#${parts.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

export function hexToRgb(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const value = parseInt(match[1], 16)
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`
}

/** Lighter companion of an accent for focus rings. */
export function focusFromAccent(rgb: string): string {
  return rgb
    .split(/\s+/)
    .map((part) => Math.round(Number(part) + (255 - Number(part)) * 0.45))
    .join(' ')
}

export function studioThemeId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `custom-${slug || 'theme'}`
}
