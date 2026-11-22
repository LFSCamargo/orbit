/** Perceived brightness of an sRGB colour, 0 (black) to 1 (white). */
export function relativeLuminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}
