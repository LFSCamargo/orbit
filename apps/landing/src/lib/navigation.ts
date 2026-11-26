/** The site's main navigation: two groups that open on hover, then GitHub
 * and Download. Footer links reuse the same items. */

export type NavIconName =
  | 'play'
  | 'grid'
  | 'layers'
  | 'palette'
  | 'sparkles'
  | 'bolt'
  | 'book'
  | 'download'
  | 'help'
  | 'newspaper'

interface NavItem {
  href: string
  label: string
  description: string
  icon: NavIconName
  isNew?: boolean
}

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    items: [
      {
        href: '/#demo',
        label: 'Demo',
        description: 'Watch Orbit in action',
        icon: 'play',
      },
      {
        href: '/#features',
        label: 'Overview',
        description: 'What Orbit does for your games',
        icon: 'grid',
      },
      {
        href: '/#sources',
        label: 'Sources',
        description: 'Steam, Xbox Cloud and Mac games',
        icon: 'layers',
      },
      {
        href: '/#themes',
        label: 'Themes',
        description: 'Make the launcher yours',
        icon: 'palette',
      },
      {
        href: '/#why',
        label: 'Why',
        description: 'Why a controller-first launcher',
        icon: 'sparkles',
      },
    ],
  },
  {
    id: 'resources',
    label: 'Resources',
    items: [
      {
        href: '/changelog',
        label: 'Changelog',
        description: 'Every release, explained',
        icon: 'bolt',
        isNew: true,
      },
      {
        href: '/docs',
        label: 'Documentation',
        description: 'How Orbit works',
        icon: 'book',
      },
      {
        href: '/install',
        label: 'Install',
        description: 'Get running in minutes',
        icon: 'download',
      },
      {
        href: '/#faq',
        label: 'FAQ',
        description: 'Answers to common questions',
        icon: 'help',
      },
      {
        href: '/blog',
        label: 'Blog',
        description: 'Announcements and engineering notes',
        icon: 'newspaper',
        isNew: true,
      },
    ],
  },
]

/** Whether a page path belongs to a group (its pages, not home anchors). */
export function groupIsActive(group: NavGroup, pathname: string): boolean {
  return group.items.some(
    (item) =>
      !item.href.startsWith('/#') &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  )
}
