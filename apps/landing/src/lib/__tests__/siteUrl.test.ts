import { describe, expect, it } from 'vitest'
import { PRODUCTION_URL, resolveSiteUrl } from '../siteUrl'

describe('resolveSiteUrl', () => {
  it('advertises a deploy preview its own URL, not production', () => {
    // Regression: previews pointed og:image at the production domain, where
    // the new image routes did not exist yet (404).
    expect(
      resolveSiteUrl({
        CONTEXT: 'deploy-preview',
        DEPLOY_PRIME_URL: 'https://deploy-preview-11--site.netlify.app',
      }),
    ).toBe('https://deploy-preview-11--site.netlify.app')
    expect(
      resolveSiteUrl({
        CONTEXT: 'branch-deploy',
        DEPLOY_PRIME_URL: 'https://b--site.netlify.app/',
      }),
    ).toBe('https://b--site.netlify.app')
    expect(
      resolveSiteUrl({ VERCEL_ENV: 'preview', VERCEL_URL: 'orbit-abc.vercel.app' }),
    ).toBe('https://orbit-abc.vercel.app')
  })

  it('uses the production domain for production builds', () => {
    expect(
      resolveSiteUrl({
        CONTEXT: 'production',
        DEPLOY_PRIME_URL: 'https://main--site.netlify.app',
      }),
    ).toBe(PRODUCTION_URL)
    expect(resolveSiteUrl({ VERCEL_ENV: 'production', VERCEL_URL: 'x.vercel.app' })).toBe(
      PRODUCTION_URL,
    )
    expect(resolveSiteUrl({})).toBe(PRODUCTION_URL)
  })

  it('prefers an explicit value and uses localhost in development', () => {
    expect(
      resolveSiteUrl({
        ORBIT_SITE_URL: 'https://example.test/',
        CONTEXT: 'deploy-preview',
      }),
    ).toBe('https://example.test')
    expect(resolveSiteUrl({ NODE_ENV: 'development', PORT: '4000' })).toBe(
      'http://localhost:4000',
    )
  })
})
