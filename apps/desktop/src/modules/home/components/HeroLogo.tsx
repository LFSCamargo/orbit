import { useState } from 'react'
import { clsx } from 'clsx'

/** The featured game's logo. Not every Steam app has `logo.png`; a logo that
 * fails to load is hidden instead of showing the browser's broken image. */
export function HeroLogo({ src }: { src?: string }) {
  const [failed, setFailed] = useState<string>()
  if (!src || failed === src) return null
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(src)}
      className={clsx(
        'macos-hero-logo',
        'pointer-events-none fixed right-[var(--console-gutter)] top-[100px] z-[1] max-h-[90px] max-w-[220px] object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.35)]',
        'max-[900px]:top-[90px] max-[900px]:max-h-16 max-[900px]:max-w-[150px]',
        'max-[520px]:hidden',
      )}
      aria-hidden="true"
      draggable={false}
    />
  )
}
