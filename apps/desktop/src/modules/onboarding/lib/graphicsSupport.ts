/** Renderer names of software rasterizers (no GPU acceleration: VMs, GPU
 * acceleration off, headless test browsers). */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i

export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE.test(renderer)
}

/** How much the onboarding scenery may draw: the WebGL globe and particle
 * canvas need a real GPU; without one (software rendering, or no WebGL at
 * all) the lighter CSS planet and stars stand in, and look much the same. */
export function graphicsTier(): 'gpu' | 'software' | 'none' {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return 'none'
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
    return isSoftwareRenderer(renderer) ? 'software' : 'gpu'
  } catch {
    return 'none'
  }
}
