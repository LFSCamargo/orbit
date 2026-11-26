import { renderOgCard } from '@/og/card'

export const alt = 'Orbit Blog — Building the future of Mac gaming.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return renderOgCard({
    variant: 'blog',
    eyebrow: 'Orbit Blog',
    title: [
      [{ text: 'Building the future' }],
      [{ text: 'of ' }, { text: 'Mac gaming.', highlight: true }],
    ],
    subtitle:
      'Product stories, engineering notes, and launch updates from the Orbit team.',
  })
}
