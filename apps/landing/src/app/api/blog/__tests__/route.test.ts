import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { GET, POST } from '../[slug]/route'

const SLUG = 'introducing-the-orbit-blog'
const context = (slug: string) => ({ params: Promise.resolve({ slug }) })

function request(body: unknown, cookie = '') {
  return new NextRequest(`http://localhost/api/blog/${SLUG}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
  })
}

describe('/api/blog/[slug]', () => {
  it('rejects unknown posts', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/blog/nope'),
      context('nope'),
    )
    expect(response.status).toBe(404)
  })

  it('counts a view once per browser window', async () => {
    const first = await POST(request({ action: 'view' }), context(SLUG))
    const { stats } = await first.json()
    const cookie = first.headers.get('set-cookie') ?? ''
    expect(cookie).toContain(`ov_${SLUG}=1`)
    expect(cookie.toLowerCase()).toContain('httponly')

    const again = await POST(request({ action: 'view' }, `ov_${SLUG}=1`), context(SLUG))
    expect((await again.json()).stats.views).toBe(stats.views)
  })

  it('adds a reaction once and removes it again', async () => {
    const added = await POST(
      request({ action: 'react', reaction: 'rocket', active: true }),
      context(SLUG),
    )
    const body = await added.json()
    expect(body.mine).toEqual(['rocket'])
    const count = body.stats.reactions.rocket

    const repeat = await POST(
      request({ action: 'react', reaction: 'rocket', active: true }, `or_${SLUG}=rocket`),
      context(SLUG),
    )
    expect((await repeat.json()).stats.reactions.rocket).toBe(count)

    const removed = await POST(
      request(
        { action: 'react', reaction: 'rocket', active: false },
        `or_${SLUG}=rocket`,
      ),
      context(SLUG),
    )
    const after = await removed.json()
    expect(after.mine).toEqual([])
    expect(after.stats.reactions.rocket).toBe(count - 1)
  })

  it('rejects unknown actions and reactions', async () => {
    expect((await POST(request({ action: 'delete' }), context(SLUG))).status).toBe(400)
    expect(
      (
        await POST(
          request({ action: 'react', reaction: 'evil', active: true }),
          context(SLUG),
        )
      ).status,
    ).toBe(400)
  })
})
