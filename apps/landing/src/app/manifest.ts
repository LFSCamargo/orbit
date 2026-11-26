import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Orbit',
    short_name: 'Orbit',
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#080809',
    theme_color: '#080809',
    icons: [{ src: '/assets/orbit-app-icon.png', sizes: '256x256', type: 'image/png' }],
  }
}
