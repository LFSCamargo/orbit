import { expect, it } from 'vitest'
import { formatScanMessage } from '../useImportScan'

it('describes Steam, native, and Astris scans', () => {
  const result = { imported: 4, enriched: 1, provider: 'steam' }
  expect(formatScanMessage('steam', result, 'imported')).toBe(
    'Imported 4 Steam games · enriched 1',
  )
  expect(formatScanMessage('native', result, 'sync')).toBe(
    'macOS scan complete · 4 apps · enriched 1',
  )
  expect(formatScanMessage('astris', result, 'imported')).toBe(
    'Imported 4 Switch titles · enriched 1',
  )
})
