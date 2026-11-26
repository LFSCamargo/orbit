import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Stroke({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
      {...props}
    >
      {children}
    </svg>
  )
}

export const ChevronDownIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="m6 9 6 6 6-6" />
  </Stroke>
)
export const ArrowRightIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Stroke>
)
export const ArrowLeftIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Stroke>
)
export const ExternalIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Stroke>
)
export const PlayIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="m10 8.5 5 3.5-5 3.5z" />
  </Stroke>
)
export const GridIcon = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Stroke>
)
export const LayersIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3 13 9 5 9-5" />
  </Stroke>
)
export const PaletteIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.8-.4-1.2.3-2.2 1.6-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10" cy="7" r="1" />
    <circle cx="15" cy="7.5" r="1" />
  </Stroke>
)
export const SparklesIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
  </Stroke>
)
export const BoltIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Stroke>
)
export const BookIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19a2 2 0 0 1 2-2h13" />
  </Stroke>
)
export const DownloadIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Stroke>
)
export const HelpIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />
  </Stroke>
)
export const NewspaperIcon = (props: IconProps) => (
  <Stroke {...props}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </Stroke>
)
export const MenuIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Stroke>
)
export const CloseIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Stroke>
)
export const EyeIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Stroke>
)
export const LinkIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </Stroke>
)
export const ShareIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
  </Stroke>
)
export const CheckIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="m5 12 5 5 9-10" />
  </Stroke>
)
export const CodeIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
  </Stroke>
)
export const CommitIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M3 12h5.5M15.5 12H21" />
  </Stroke>
)
export const PullRequestIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="M6 8.5v7M18 15.5V9a3 3 0 0 0-3-3h-4M13 4l-2 2 2 2" />
  </Stroke>
)
export const ClockIcon = (props: IconProps) => (
  <Stroke {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Stroke>
)
export const RssIcon = (props: IconProps) => (
  <Stroke {...props}>
    <path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14" />
    <circle cx="6" cy="18" r="1.2" />
  </Stroke>
)

function Fill({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="h-4 w-4"
      {...props}
    >
      {children}
    </svg>
  )
}

export const GitHubIcon = (props: IconProps) => (
  <Fill {...props}>
    <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.4 1.1 3 .8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5 0-1.1.4-2 1-2.7-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.7 9.7 0 0 1 5 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7.6.7 1 1.6 1 2.7 0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z" />
  </Fill>
)
export const XLogoIcon = (props: IconProps) => (
  <Fill {...props}>
    <path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.3-8.3L2 3h6.3l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z" />
  </Fill>
)
export const BlueskyIcon = (props: IconProps) => (
  <Fill {...props}>
    <path d="M6.3 4.2C8.6 5.9 11 9.4 12 11.3c1-1.9 3.4-5.4 5.7-7.1 1.6-1.2 4.3-2.2 4.3.9 0 .6-.4 5.2-.6 5.9-.7 2.6-3.3 3.2-5.6 2.8 4 .7 5 3 2.8 5.3-4.2 4.3-6-1.1-6.5-2.5L12 16l-.1.6c-.5 1.4-2.3 6.8-6.5 2.5-2.2-2.3-1.2-4.6 2.8-5.3-2.3.4-4.9-.2-5.6-2.8C2.4 10.3 2 5.7 2 5.1c0-3.1 2.7-2.1 4.3-.9z" />
  </Fill>
)
export const LinkedInIcon = (props: IconProps) => (
  <Fill {...props}>
    <path d="M20.4 2H3.6A1.6 1.6 0 0 0 2 3.6v16.8A1.6 1.6 0 0 0 3.6 22h16.8a1.6 1.6 0 0 0 1.6-1.6V3.6A1.6 1.6 0 0 0 20.4 2zM8 19H5V9.5h3zM6.5 8.2a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 0 3.5zM19 19h-3v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4V19h-3V9.5h2.9v1.3a3.2 3.2 0 0 1 2.9-1.6c3.1 0 3.6 2 3.6 4.7z" />
  </Fill>
)
export const RedditIcon = (props: IconProps) => (
  <Fill {...props}>
    <path d="M22 12.1a2.2 2.2 0 0 0-3.7-1.6 10.8 10.8 0 0 0-5.8-1.8l1-4.6 3.2.7a1.6 1.6 0 1 0 .2-1l-3.6-.8a.5.5 0 0 0-.6.4l-1.1 5.3a10.9 10.9 0 0 0-5.9 1.8 2.2 2.2 0 1 0-2.4 3.6 4.3 4.3 0 0 0 0 .7c0 3.6 4.2 6.5 9.3 6.5s9.3-2.9 9.3-6.5a4.3 4.3 0 0 0 0-.7 2.2 2.2 0 0 0 1.1-2zm-15.6 1.6a1.6 1.6 0 1 1 1.6 1.6 1.6 1.6 0 0 1-1.6-1.6zm9 4.3a5.9 5.9 0 0 1-3.8 1.2A5.9 5.9 0 0 1 7.8 18a.4.4 0 0 1 .6-.6 5.1 5.1 0 0 0 3.2.9 5.1 5.1 0 0 0 3.2-.9.4.4 0 0 1 .6.6zm-.3-2.7a1.6 1.6 0 1 1 1.6-1.6 1.6 1.6 0 0 1-1.6 1.6z" />
  </Fill>
)
export const HackerNewsIcon = (props: IconProps) => (
  <Fill {...props}>
    <path d="M3 3h18v18H3zm8.2 10.4V17h1.6v-3.6L16 7h-1.8l-2.2 4.4L9.8 7H8z" />
  </Fill>
)
export const FacebookIcon = (props: IconProps) => (
  <Fill {...props}>
    <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
  </Fill>
)
