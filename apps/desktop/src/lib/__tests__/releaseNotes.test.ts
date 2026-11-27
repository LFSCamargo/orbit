import { expect, it } from 'vitest'
import { parseReleaseNotes, plainInline } from '../releaseNotes'

it('splits release notes into headings, paragraphs and lists', () => {
  const notes = [
    'Orbit Wine 26.3.0-2, a rebuild of CrossOver 26.3.0.',
    '',
    'New in this build:',
    '- mmdevapi reads ORBIT_AUDIO_BUFFER_MS, so games stop crackling.',
    "- SDL2 with Orbit's pad bridge,",
    '  so 2.4 GHz dongles reach games.',
    '',
    '## Licence',
    'LGPL-2.1-or-later.',
  ].join('\n')
  expect(parseReleaseNotes(notes)).toEqual([
    { kind: 'paragraph', text: 'Orbit Wine 26.3.0-2, a rebuild of CrossOver 26.3.0.' },
    { kind: 'paragraph', text: 'New in this build:' },
    {
      kind: 'list',
      items: [
        'mmdevapi reads ORBIT_AUDIO_BUFFER_MS, so games stop crackling.',
        "SDL2 with Orbit's pad bridge, so 2.4 GHz dongles reach games.",
      ],
    },
    { kind: 'heading', text: 'Licence' },
    { kind: 'paragraph', text: 'LGPL-2.1-or-later.' },
  ])
})

it('keeps only the text of inline Markdown, never markup', () => {
  expect(plainInline('**Fixed** `audio` in [the docs](https://x.test) <img src=x>')).toBe(
    'Fixed audio in the docs <img src=x>',
  )
  expect(parseReleaseNotes('')).toEqual([])
  expect(parseReleaseNotes('1. one\n2) two')).toEqual([
    { kind: 'list', items: ['one', 'two'] },
  ])
})
