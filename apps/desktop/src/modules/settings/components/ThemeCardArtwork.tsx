import { ArtworkImage, ArtworkSkeleton } from '@/components/artwork/ArtworkImage'
import { ThemeBrand } from '@/themes/ThemeBrand'

export function ThemeCardArtwork({
  logo,
  hero,
  title,
  preparing,
}: {
  logo?: string
  hero?: string
  title: string
  preparing: boolean
}) {
  return (
    <div
      className="theme-card-artwork relative w-full shrink-0 overflow-hidden bg-orbit-surface bg-[radial-gradient(ellipse_at_80%_10%,rgb(var(--orbit-accent)/0.2),transparent_75%)] [aspect-ratio:2/1]"
      aria-busy={preparing}
    >
      {preparing ? (
        <ArtworkSkeleton />
      ) : (
        <>
          {hero && (
            <ArtworkImage src={hero} className="theme-card-hero absolute inset-0" />
          )}
          <span
            className="theme-card-artwork-shade pointer-events-none absolute inset-0 bg-[linear-gradient(0deg,rgb(0_0_0/0.45),rgb(0_0_0/0.08))]"
            aria-hidden="true"
          />
          {logo ? (
            <ArtworkImage
              src={logo}
              alt={title}
              fit="contain"
              className="theme-card-logo absolute inset-[15%_10%]"
            />
          ) : (
            <ThemeBrand className="theme-brand-preview" preview />
          )}
        </>
      )}
    </div>
  )
}
