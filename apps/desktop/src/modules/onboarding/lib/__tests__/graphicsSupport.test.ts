import { afterEach, expect, it, vi } from 'vitest'
import { graphicsTier, isSoftwareRenderer } from '../graphicsSupport'

afterEach(() => vi.restoreAllMocks())

it('recognises software rasterizers', () => {
  for (const name of [
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)',
    'llvmpipe (LLVM 15.0.7, 256 bits)',
    'Software Rasterizer',
    'Microsoft Basic Render Driver',
  ]) {
    expect(isSoftwareRenderer(name), name).toBe(true)
  }
  for (const name of [
    'ANGLE (Apple, ANGLE Metal Renderer: Apple M5)',
    'Apple M2 Pro',
    'AMD Radeon Pro 5500M',
  ]) {
    expect(isSoftwareRenderer(name), name).toBe(false)
  }
})

function fakeWebGL(renderer: string | null) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
    type: string,
  ) => {
    if (!type.startsWith('webgl') || renderer === null) return null
    return {
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
      getParameter: () => renderer,
    }
  }) as never)
}

it('uses the GPU scenery only with a hardware renderer', () => {
  fakeWebGL('ANGLE (Apple, ANGLE Metal Renderer: Apple M5)')
  expect(graphicsTier()).toBe('gpu')
  fakeWebGL('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)')
  expect(graphicsTier()).toBe('software')
  fakeWebGL(null)
  expect(graphicsTier()).toBe('none')
})
