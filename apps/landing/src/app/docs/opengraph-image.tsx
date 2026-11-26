import { renderOgCard } from '@/og/card'

export const alt = 'Orbit documentation — Your library, without the busywork.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return renderOgCard({
    variant: 'docs',
    eyebrow: 'Documentation',
    title: [
      [{ text: 'Your library,' }],
      [{ text: 'without the busywork.', highlight: true }],
    ],
    subtitle: 'How Orbit imports, launches and themes the games you already own.',
  })
}
