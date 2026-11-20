import { expect, it } from 'vitest'
import { teredoEndpoint } from '../teredo'

it('decodes the IPv4 endpoint hidden in a Teredo address', () => {
  // 2001:0:4136:e378:8000:63bf:3fff:fdd2 → 192.0.2.45:40000
  expect(teredoEndpoint('2001:0:4136:e378:8000:63bf:3fff:fdd2')).toEqual({
    address: '192.0.2.45',
    port: 40000,
  })
  expect(teredoEndpoint('20.1.2.3')).toBeNull()
  expect(teredoEndpoint('2001:db8::1')).toBeNull()
})
