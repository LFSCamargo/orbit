'use client'

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

export type LiquidGlassProps = HTMLAttributes<HTMLDivElement> & {
  contentClassName?: string
  /** Corner radius in px. Default 999 (pill). */
  radius?: number
  /** Rim band that bends light, in px. */
  bevelDepth?: number
  /** Displacement strength in px. */
  scale?: number
  /** Chromatic aberration spread in px. */
  aberration?: number
  /** Extra blur after refraction, in px. */
  frost?: number
  /** White body tint 0–1. */
  tint?: number
}

type FilterDefinition = {
  id: string
  mapUrl: string
  width: number
  height: number
  scale: number
  aberration: number
  frost: number
}

/**
 * Liquid glass surface adapted from the Aceternity UI `liquid-glass` registry
 * component. A Snell's-law displacement map bends whatever sits behind the
 * element through an SVG filter used as `backdrop-filter`. Chromium refracts;
 * Safari, Firefox and reduced-transparency fall back to frosted glass.
 */
export function LiquidGlass({
  children,
  className,
  contentClassName,
  radius = 999,
  bevelDepth = 14,
  scale = 48,
  aberration = 4,
  frost = 0.4,
  tint = 0.12,
  style,
  ...rest
}: LiquidGlassProps) {
  const reactId = useId().replace(/:/g, '')
  const rootRef = useRef<HTMLDivElement>(null)
  const blobRef = useRef<string | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [filter, setFilter] = useState<FilterDefinition | null>(null)
  const [mode, setMode] = useState<'pending' | 'simple' | 'opaque'>('pending')

  useEffect(() => {
    if (prefersReducedTransparency()) setMode('opaque')
    else if (isSafariLike() || !supportsUrlBackdropFilter()) setMode('simple')
  }, [])

  useEffect(() => {
    const el = rootRef.current
    if (!el || mode !== 'pending' || typeof ResizeObserver === 'undefined') {
      if (mode === 'pending') setMode('simple')
      return
    }

    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const box = entry.borderBoxSize?.[0]
      const width = box?.inlineSize ?? entry.contentRect.width
      const height = box?.blockSize ?? entry.contentRect.height
      setSize({
        w: Math.max(1, Math.round(width)),
        h: Math.max(1, Math.round(height)),
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])

  useEffect(() => {
    if (mode !== 'pending' || size.w <= 1 || size.h <= 1) return
    let cancelled = false

    void (async () => {
      try {
        const mapUrl = await generateDisplacementBlobUrl({
          width: size.w,
          height: size.h,
          radius: Math.min(radius, size.w / 2, size.h / 2),
          bevelDepth: Math.min(bevelDepth, Math.min(size.w, size.h) / 2),
          dpr: Math.min(window.devicePixelRatio || 1, 2),
        })
        await new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = img.onerror = () => resolve()
          img.src = mapUrl
        })
        if (cancelled) {
          URL.revokeObjectURL(mapUrl)
          return
        }
        if (blobRef.current) URL.revokeObjectURL(blobRef.current)
        blobRef.current = mapUrl
        setFilter({
          id: `lg-${reactId}-${size.w}x${size.h}-${Date.now().toString(36)}`,
          mapUrl,
          width: size.w,
          height: size.h,
          scale,
          aberration,
          frost,
        })
      } catch {
        if (!cancelled) setMode('simple')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mode, size.w, size.h, radius, bevelDepth, scale, aberration, frost, reactId])

  useEffect(
    () => () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current)
    },
    [],
  )

  const backdrop =
    mode === 'opaque'
      ? 'none'
      : mode === 'simple'
        ? 'blur(20px) saturate(1.4)'
        : filter
          ? `url(#${filter.id}) blur(0.5px) saturate(1.85) brightness(1.02)`
          : 'blur(10px) saturate(1.6) brightness(1.04)'

  return (
    <div
      ref={rootRef}
      data-refract={mode === 'pending' && filter ? 'true' : 'false'}
      className={cn(
        'relative overflow-hidden border border-white/10 bg-neutral-900/45',
        mode === 'simple' && 'bg-neutral-900/60',
        mode === 'opaque' && 'bg-neutral-900',
        className,
      )}
      style={
        {
          borderRadius: radius,
          backgroundColor: mode === 'pending' ? `rgb(255 255 255 / ${tint})` : undefined,
          backdropFilter: backdrop,
          WebkitBackdropFilter: backdrop,
          ...style,
        } as CSSProperties
      }
      {...rest}
    >
      {filter ? <LiquidGlassFilter filter={filter} /> : null}
      {contentClassName ? <div className={contentClassName}>{children}</div> : children}
    </div>
  )
}

function LiquidGlassFilter({ filter }: { filter: FilterDefinition }) {
  const pad = Math.ceil(filter.scale + filter.aberration + 4)
  const px = (pad / Math.max(1, filter.width)) * 100
  const py = (pad / Math.max(1, filter.height)) * 100
  const mapProps = {
    href: filter.mapUrl,
    x: 0,
    y: 0,
    width: filter.width,
    height: filter.height,
    result: 'map',
    preserveAspectRatio: 'none',
  }

  return (
    <span aria-hidden className="pointer-events-none absolute size-0 overflow-hidden">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        xmlnsXlink="http://www.w3.org/1999/xlink"
        width="0"
        height="0"
        style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      >
        <filter
          id={filter.id}
          colorInterpolationFilters="sRGB"
          x={`-${px.toFixed(3)}%`}
          y={`-${py.toFixed(3)}%`}
          width={`${(100 + 2 * px).toFixed(3)}%`}
          height={`${(100 + 2 * py).toFixed(3)}%`}
        >
          <feImage {...mapProps} />
          {filter.aberration <= 0 ? (
            <feDisplacementMap
              in="SourceGraphic"
              in2="map"
              scale={filter.scale}
              xChannelSelector="R"
              yChannelSelector="G"
              result="rgb"
            />
          ) : (
            <>
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={filter.scale + filter.aberration}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dispR"
              />
              <feColorMatrix
                in="dispR"
                type="matrix"
                values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="red"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={filter.scale}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dispG"
              />
              <feColorMatrix
                in="dispG"
                type="matrix"
                values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
                result="green"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={Math.max(0, filter.scale - filter.aberration)}
                xChannelSelector="R"
                yChannelSelector="G"
                result="dispB"
              />
              <feColorMatrix
                in="dispB"
                type="matrix"
                values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
                result="blue"
              />
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" result="rgb" />
            </>
          )}
          <feGaussianBlur in="rgb" stdDeviation={filter.frost} />
        </filter>
      </svg>
    </span>
  )
}

function supportsUrlBackdropFilter() {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return (
    CSS.supports('backdrop-filter', 'url(#x)') ||
    CSS.supports('-webkit-backdrop-filter', 'url(#x)')
  )
}

function prefersReducedTransparency() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-transparency: reduce)').matches
}

function isSafariLike() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua)
}

type DisplacementOptions = {
  width: number
  height: number
  radius: number
  bevelDepth: number
  gain?: number
  light?: { x: number; y: number }
  dpr?: number
}

/** Signed distance to a rounded box centred at the origin. <0 inside. */
function sdRoundedBox(px: number, py: number, halfW: number, halfH: number, r: number) {
  const qx = Math.abs(px) - halfW + r
  const qy = Math.abs(py) - halfH + r
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  const inside = Math.min(Math.max(qx, qy), 0)
  return inside + outside - r
}

/** Squircle-dome slope → Snell's-law bend. `x` = 0 at the rim, 1 at centre. */
function bendFromDepth(x: number) {
  const u = 1 - Math.min(1, Math.max(0, x))
  const denom = (1 - u ** 4) ** 0.75
  if (denom < 1e-6) return 0
  const thetaI = Math.atan(Math.min(u ** 3 / denom, 8))
  const sinT = Math.sin(thetaI) / 1.5
  if (sinT >= 1) return Math.sin(thetaI)
  return Math.sin(thetaI - Math.asin(sinT))
}

/** φ(d) = ∫ bend along the distance from the rim. */
function buildPhiTable(bevelPx: number) {
  const n = Math.max(1, Math.ceil(bevelPx))
  const phi = new Float32Array(n + 1)
  for (let d = 1; d <= n; d++) phi[d] = phi[d - 1] + bendFromDepth(d / n)
  return phi
}

function samplePhi(phi: Float32Array, depth: number) {
  const max = phi.length - 1
  if (depth <= 0) return phi[0]
  if (depth >= max) return phi[max]
  const i = Math.floor(depth)
  const f = depth - i
  return phi[i] * (1 - f) + phi[i + 1] * f
}

function computeDisplacementData(opts: DisplacementOptions) {
  const dpr = opts.dpr ?? 1
  const gain = opts.gain ?? 1.35
  const light = opts.light ?? { x: -0.55, y: -0.85 }
  const lightLen = Math.hypot(light.x, light.y) || 1
  const lx = light.x / lightLen
  const ly = light.y / lightLen

  const W = Math.max(1, Math.round(opts.width * dpr))
  const H = Math.max(1, Math.round(opts.height * dpr))
  const halfW = W / 2
  const halfH = H / 2
  const r = Math.min(opts.radius * dpr, halfW, halfH)
  const bevel = Math.max(1, opts.bevelDepth * dpr)
  const phi = buildPhiTable(bevel)

  const field = new Float32Array(W * H)
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5
    for (let x = 0; x < W; x++) {
      const d = sdRoundedBox(x - halfW + 0.5, py, halfW, halfH, r)
      field[y * W + x] = d > 0 ? 0 : samplePhi(phi, Math.min(bevel, -d))
    }
  }

  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    const py = y - halfH + 0.5
    for (let x = 0; x < W; x++) {
      const px = x - halfW + 0.5
      const i = (y * W + x) << 2
      const d = sdRoundedBox(px, py, halfW, halfH, r)

      if (d > 0) {
        data[i] = data[i + 1] = data[i + 2] = 128
        data[i + 3] = 0
        continue
      }

      const x0 = Math.max(0, x - 1)
      const x1 = Math.min(W - 1, x + 1)
      const y0 = Math.max(0, y - 1)
      const y1 = Math.min(H - 1, y + 1)
      const dPhiX = (field[y * W + x1] - field[y * W + x0]) / (x1 - x0 || 1)
      const dPhiY = (field[y1 * W + x] - field[y0 * W + x]) / (y1 - y0 || 1)

      const dx = Math.max(-1, Math.min(1, dPhiX * gain))
      const dy = Math.max(-1, Math.min(1, dPhiY * gain))

      let specular = 0
      if (d >= -bevel) {
        const gx =
          sdRoundedBox(px + 1, py, halfW, halfH, r) -
          sdRoundedBox(px - 1, py, halfW, halfH, r)
        const gy =
          sdRoundedBox(px, py + 1, halfW, halfH, r) -
          sdRoundedBox(px, py - 1, halfW, halfH, r)
        const len = Math.hypot(gx, gy) || 1
        const dot = (gx / len) * lx + (gy / len) * ly
        const rim = 1 - Math.min(1, -d / bevel)
        specular = (Math.max(0, dot) + Math.max(0, -dot) * 0.35) * rim
      }

      data[i] = 128 + dx * 127
      data[i + 1] = 128 + dy * 127
      data[i + 2] = Math.round(specular * 255)
      data[i + 3] = 255
    }
  }

  return { data, width: W, height: H }
}

/** PNG blob URL for feImage (WebKit rejects data: URIs inside feImage). */
async function generateDisplacementBlobUrl(opts: DisplacementOptions) {
  const { data, width, height } = computeDisplacementData(opts)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  ctx.putImageData(new ImageData(data, width, height), 0, 0)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  )
  if (!blob) throw new Error('Failed to encode displacement map')
  return URL.createObjectURL(blob)
}
