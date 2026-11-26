/** Where a page can be shared, with each network's own compose/submit URL. */

export type ShareNetwork =
  'x' | 'bluesky' | 'linkedin' | 'reddit' | 'hackernews' | 'facebook'

export interface ShareTarget {
  network: ShareNetwork
  label: string
  url: string
}

export function shareTargets(pageUrl: string, title: string): ShareTarget[] {
  const url = encodeURIComponent(pageUrl)
  const text = encodeURIComponent(title)
  const both = encodeURIComponent(`${title} ${pageUrl}`)
  return [
    {
      network: 'x',
      label: 'X',
      url: `https://x.com/intent/post?text=${text}&url=${url}`,
    },
    {
      network: 'bluesky',
      label: 'Bluesky',
      url: `https://bsky.app/intent/compose?text=${both}`,
    },
    {
      network: 'linkedin',
      label: 'LinkedIn',
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
    },
    {
      network: 'reddit',
      label: 'Reddit',
      url: `https://www.reddit.com/submit?url=${url}&title=${text}`,
    },
    {
      network: 'hackernews',
      label: 'Hacker News',
      url: `https://news.ycombinator.com/submitlink?u=${url}&t=${text}`,
    },
    {
      network: 'facebook',
      label: 'Facebook',
      url: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    },
  ]
}
