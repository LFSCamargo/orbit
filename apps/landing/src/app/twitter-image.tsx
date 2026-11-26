import { renderOgCard } from '@/og/card'

export const alt =
  'Orbit — Every game. One orbit. A controller-first game launcher for Mac that unifies your library.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return renderOgCard({
    variant: 'landing',
    title: [[{ text: 'Every game.' }], [{ text: 'One orbit.', highlight: true }]],
    subtitle: 'A controller-first game launcher for Mac that unifies your library.',
  })
}
