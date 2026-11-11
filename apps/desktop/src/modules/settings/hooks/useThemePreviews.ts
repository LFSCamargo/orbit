import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isTauriRuntime, prepareThemePreviews, type ThemePreview } from '@/lib/tauri'
import { packagedThemePreview } from '@/lib/bundledArtwork'
import { BUILT_IN_THEMES } from '@/themes/catalog'

const KEY = ['bundled-theme-previews'] as const
const PACKAGED: Record<string, ThemePreview> = {}
for (const theme of BUILT_IN_THEMES) {
  if (theme.kind !== 'game') continue
  const logo = packagedThemePreview(theme.id, 'logo')
  const hero = packagedThemePreview(theme.id, 'hero')
  if (logo && hero) PACKAGED[theme.id] = { themeId: theme.id, logo, hero }
}
const NEEDS_PREPARATION = BUILT_IN_THEMES.some(
  (theme) => theme.kind === 'game' && !PACKAGED[theme.id],
)

/** One native batch streams results into a bounded cache shared by all theme cards. */
export function useThemePreviews() {
  const client = useQueryClient()
  const native = isTauriRuntime()
  const query = useQuery({
    queryKey: KEY,
    enabled: native && NEEDS_PREPARATION,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const previews: Record<string, ThemePreview> = { ...PACKAGED }
      await prepareThemePreviews((preview) => {
        previews[preview.themeId] = preview
        client.setQueryData(KEY, { ...previews })
      })
      return previews
    },
  })
  return {
    previews: query.data ?? PACKAGED,
    preparing:
      native &&
      NEEDS_PREPARATION &&
      !query.isError &&
      (query.isPending || query.isFetching),
  }
}
