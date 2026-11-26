import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { POSTS, findPost, titleParts } from '../posts'

describe('blog posts', () => {
  it('have unique URL-safe slugs, valid dates and an MDX body each', () => {
    const slugs = new Set<string>()
    for (const post of POSTS) {
      expect(post.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(slugs.has(post.slug)).toBe(false)
      slugs.add(post.slug)
      expect(Number.isNaN(new Date(post.date).getTime())).toBe(false)
      expect(existsSync(join(__dirname, '..', `${post.slug}.mdx`))).toBe(true)
      if (post.highlight) expect(post.title).toContain(post.highlight)
    }
  })

  it('are listed newest first', () => {
    const dates = POSTS.map((post) => post.date)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('splits the title around the highlighted words for the social card', () => {
    const post = findPost('introducing-the-orbit-blog')
    expect(post && titleParts(post)).toEqual([
      { text: 'Introducing the ' },
      { text: 'Orbit blog', highlight: true },
    ])
  })
})
