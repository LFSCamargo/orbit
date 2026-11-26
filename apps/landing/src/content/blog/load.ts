import type { ComponentType } from 'react'

/** The compiled MDX body for a post (slugs come from POSTS only). */
export async function loadPostBody(slug: string): Promise<ComponentType> {
  const mod = (await import(`./${slug}.mdx`)) as { default: ComponentType }
  return mod.default
}
