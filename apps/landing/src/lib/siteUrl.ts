/** The production domain: canonical URLs always point here. */
export const PRODUCTION_URL = 'https://orbit.thelittleluiz.me'

type Env = Record<string, string | undefined>

/**
 * The address this build is served from, so absolute links (`og:image`,
 * `twitter:image`, JSON-LD, share links) point at files that exist on this
 * deployment. A deploy preview's images are not on the production domain yet.
 *
 * - Netlify: `CONTEXT` is `production`, `deploy-preview` or `branch-deploy`;
 *   `DEPLOY_PRIME_URL` is the preview or branch address.
 * - Vercel: `VERCEL_ENV` and `VERCEL_URL` (host without a scheme).
 * - `next dev`: localhost.
 */
export function resolveSiteUrl(env: Env): string {
  const explicit = env.ORBIT_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  if (env.CONTEXT && env.CONTEXT !== 'production') {
    const url = env.DEPLOY_PRIME_URL || env.DEPLOY_URL
    if (url) return url.replace(/\/+$/, '')
  }
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production' && env.VERCEL_URL) {
    return `https://${env.VERCEL_URL.replace(/\/+$/, '')}`
  }
  if (env.NODE_ENV === 'development') return `http://localhost:${env.PORT || 3000}`
  return PRODUCTION_URL
}
