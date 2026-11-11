const base = 'https://github.com/LFSCamargo/orbit/releases/download'

function asset(tag: string, name: string, size = 1024) {
  return { name, size, browser_download_url: `${base}/${tag}/${name}` }
}

export function githubRelease(
  version: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const tag = `v${version}`
  return {
    tag_name: tag,
    name: `Orbit ${version}`,
    body: `Orbit **${version}**`,
    draft: false,
    prerelease: false,
    published_at: '2026-11-01T12:00:00Z',
    html_url: `https://github.com/LFSCamargo/orbit/releases/tag/${tag}`,
    assets: [
      asset(tag, `Orbit-${version}-aarch64.dmg`, 12_582_912),
      asset(tag, `Orbit-${version}-aarch64.app.tar.gz`, 10_485_760),
      asset(tag, 'SHA256SUMS.txt', 180),
    ],
    ...overrides,
  }
}
