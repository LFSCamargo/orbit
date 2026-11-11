import type { AssetPlatform } from '@/lib/releases'

export function PlatformIcon({ platform }: { platform: AssetPlatform }) {
  if (platform === 'windows') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
        <path d="M3 4.5 10.5 3v8H3V4.5Zm9-1.7L21 1v10h-9V2.8ZM3 12.5h7.5v8L3 19.2v-6.7Zm9 0h9v10l-9-1.7v-8.3Z" />
      </svg>
    )
  }

  if (platform === 'macos') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
        <path d="M17.1 12.6c0-2.8 2.3-4.1 2.4-4.2-1.3-1.9-3.3-2.2-4-2.2-1.7-.2-3.3 1-4.2 1-.9 0-2.2-1-3.7-1-1.9 0-3.7 1.1-4.7 2.8-2 3.5-.5 8.7 1.4 11.5.9 1.4 2 2.9 3.5 2.8 1.4-.1 1.9-.9 3.6-.9s2.2.9 3.7.9c1.5 0 2.5-1.4 3.4-2.8 1.1-1.5 1.5-3 1.5-3.1-.1 0-2.9-1.1-2.9-4.8ZM14.4 4.5c.8-1 1.3-2.3 1.2-3.5-1.1.1-2.6.8-3.4 1.7-.7.8-1.4 2.2-1.2 3.4 1.3.1 2.6-.6 3.4-1.6Z" />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-6 w-6 fill-none stroke-current"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="3" width="19" height="18" rx="3" />
      <path d="m6.5 8 3 3-3 3M11.5 15h5" />
    </svg>
  )
}
