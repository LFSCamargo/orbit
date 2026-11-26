import { renderOgCard } from '@/og/card'

export const alt = 'Download Orbit for Mac.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return renderOgCard({
    variant: 'download',
    eyebrow: 'Download',
    title: [[{ text: 'Download Orbit' }], [{ text: 'for your Mac.', highlight: true }]],
    subtitle:
      'Free and open source for Apple silicon. Every release, with notes and checksums.',
  })
}
