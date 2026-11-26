import { describe, expect, it } from 'vitest'
import {
  codeTokens,
  countItems,
  isVersion,
  parseChangelog,
  parseItem,
  parseReleaseNotes,
} from '../changelog'

const CHANGELOG = `# Changelog

Intro text that is not a release.

## [Unreleased]

## [2.4.0] - 2026-11-22

D3DMetal DLSS and \`D3DM_MAX_FPS\`

### Changed

- Enabled frame rate limiting via \`D3DM_MAX_FPS\`.
- Separated D3DMetal DLSS support
  from DXMT spatial upscaling.

### Fixed

- Fixed DLSS initialization.

[2.4.0]: https://github.com/LFSCamargo/orbit/releases/tag/v2.4.0

## [2.2.0] - 2026-11-21

Controller performance

### Removed

- Unused helpers.

### Added

- Knip.
`

describe('parseChangelog', () => {
  it('reads every released version, newest first, without Unreleased or link definitions', () => {
    const releases = parseChangelog(CHANGELOG)
    expect(releases.map((release) => release.version)).toEqual(['2.4.0', '2.2.0'])
    const [latest] = releases
    expect(latest.date).toBe('2026-11-22')
    expect(latest.summary).toBe('D3DMetal DLSS and `D3DM_MAX_FPS`')
    expect(latest.sections.map((section) => section.kind)).toEqual(['changed', 'fixed'])
    expect(latest.sections[0].items[1].body).toBe(
      'Separated D3DMetal DLSS support from DXMT spatial upscaling.',
    )
    expect(countItems(latest)).toBe(3)
  })

  it('orders sections as added, changed, fixed, removed', () => {
    const [, older] = parseChangelog(CHANGELOG)
    expect(older.sections.map((section) => section.kind)).toEqual(['added', 'removed'])
  })
})

describe('parseItem', () => {
  it('splits a bold lead-in from its explanation', () => {
    expect(
      parseItem('**RE Engine stability (`re2_config.ini`)** — Pre-launch fixes.'),
    ).toEqual({
      title: 'RE Engine stability (`re2_config.ini`)',
      body: 'Pre-launch fixes.',
      code: ['re2_config.ini'],
    })
  })

  it('keeps a sentence that only starts in bold as one body', () => {
    expect(parseItem('**Bold** only').title).toBe('Bold')
    expect(parseItem('Plain text').title).toBeNull()
  })
})

describe('parseReleaseNotes', () => {
  it('reads highlights and the what’s new sections', () => {
    const notes = parseReleaseNotes(`Orbit **2.4.0**

## Highlights

- First highlight.
- Second highlight.

## What’s new since v2.2.0

### Fixed

- **Bridge** — Explained.

## Install or update

- Not a change.
`)
    expect(notes.highlights.map((item) => item.body)).toEqual([
      'First highlight.',
      'Second highlight.',
    ])
    expect(notes.sections).toHaveLength(1)
    expect(notes.sections[0].items[0]).toMatchObject({
      title: 'Bridge',
      body: 'Explained.',
    })
  })
})

describe('helpers', () => {
  it('collects unique code spans', () => {
    expect(codeTokens('`a1` and `a1` and `b2`')).toEqual(['a1', 'b2'])
  })

  it('only accepts plain versions as file names', () => {
    expect(isVersion('2.4.0')).toBe(true)
    expect(isVersion('2.4.0-rc.1')).toBe(true)
    expect(isVersion('../../etc/passwd')).toBe(false)
    expect(isVersion('2.4')).toBe(false)
  })
})
