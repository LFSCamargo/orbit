import { test } from 'node:test'
import assert from 'node:assert/strict'
import { foreignLibraries } from '../lib/linkage.mjs'

// `otool -L` of the 2.6.1 build CircleCI made: it could not start on any Mac.
const broken = `/Applications/Orbit.app/Contents/MacOS/Orbit:
\t/opt/homebrew/opt/xz/lib/liblzma.5.dylib (compatibility version 14.0.0, current version 14.3.0)
\t/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit (compatibility version 45.0.0, current version 2685.0.0)
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1351.0.0)
`

test('a Homebrew library is caught', () => {
  // Regression: 2.6.1 linked Homebrew's liblzma and failed to launch.
  assert.deepEqual(foreignLibraries(broken), ['/opt/homebrew/opt/xz/lib/liblzma.5.dylib'])
})

test('macOS frameworks and system libraries pass', () => {
  const fine = broken
    .split('\n')
    .filter((line) => !line.includes('homebrew'))
    .join('\n')
  assert.deepEqual(foreignLibraries(fine), [])
  assert.deepEqual(foreignLibraries(''), [])
})
