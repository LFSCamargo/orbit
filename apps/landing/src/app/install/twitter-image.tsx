import { renderOgCard } from '@/og/card'

export const alt = 'Install Orbit — Get Orbit running in minutes.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return renderOgCard({
    variant: 'install',
    eyebrow: 'Installation',
    title: [[{ text: 'Get Orbit running' }], [{ text: 'in minutes.', highlight: true }]],
    subtitle: 'Download, set up, and launch games on Mac in a few simple steps.',
  })
}
