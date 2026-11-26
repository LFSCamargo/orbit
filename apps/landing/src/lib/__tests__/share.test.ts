import { describe, expect, it } from 'vitest'
import { shareTargets } from '../share'

describe('shareTargets', () => {
  it('encodes the page and title for every network', () => {
    const targets = shareTargets('https://orbit.test/blog/a?b=1', 'Hello & welcome')
    expect(targets.map((target) => target.network)).toEqual([
      'x',
      'bluesky',
      'linkedin',
      'reddit',
      'hackernews',
      'facebook',
    ])
    for (const target of targets) {
      expect(target.url.startsWith('https://')).toBe(true)
      expect(target.url).not.toContain('Hello & welcome')
    }
    expect(targets[0].url).toContain(encodeURIComponent('https://orbit.test/blog/a?b=1'))
  })
})
