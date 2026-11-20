/** The turning 3D globe is for the desktop web: it needs WebGL, is pure
 * motion, and is too heavy for phones and tablets, so it also needs a mouse or
 * trackpad (a phone in landscape is wide enough but has neither). */
export function canShow3DGlobe({
  webgl,
  reducedMotion,
  width,
  finePointer,
}: {
  webgl: boolean
  reducedMotion: boolean
  width: number
  finePointer: boolean
}): boolean {
  return webgl && !reducedMotion && finePointer && width >= 768
}

/** Renderer names of software rasterizers (no GPU: VMs, acceleration off,
 * headless browsers), as in the app's onboarding (graphicsSupport.ts). */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i

export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE.test(renderer)
}

/** What this browser offers, read once on the client. WebGL counts only on a
 * real GPU: software rendering would make the globe slow and hot. */
export function readGlobeSupport() {
  let webgl = false
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    const renderer =
      gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    webgl = Boolean(gl) && !isSoftwareRenderer(renderer)
  } catch {
    webgl = false
  }
  return {
    webgl,
    reducedMotion:
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    width: window.innerWidth,
    finePointer:
      window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false,
  }
}
