'use client'

import { useEffect, useState } from 'react'
import { EyeIcon } from '@/components/ui/icons'
import { formatCount } from './PostStats'

let request: Promise<Record<string, number>> | null = null

/** One request for every card on the page. */
function loadViews() {
  request ??= fetch('/api/blog/stats')
    .then((response) =>
      response.ok ? (response.json() as Promise<Record<string, number>>) : {},
    )
    .catch(() => ({}))
  return request
}

export function BlogViewCount({ slug }: { slug: string }) {
  const [views, setViews] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    loadViews().then((all) => {
      if (active) setViews(all[slug] ?? 0)
    })
    return () => {
      active = false
    }
  }, [slug])
  return (
    <span className="inline-flex items-center gap-1.5">
      <EyeIcon className="h-3.5 w-3.5" />
      {views === null ? '—' : formatCount(views)}
      <span className="sr-only"> views</span>
    </span>
  )
}
