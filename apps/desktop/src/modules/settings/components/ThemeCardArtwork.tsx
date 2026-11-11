import { ArtworkImage } from '@/components/artwork/ArtworkImage'
import { ThemeBrand } from '@/themes/ThemeBrand'
import './theme-card.css'

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
    <div className="theme-card-artwork" aria-busy={preparing}>
      {preparing ? (
        <span className="artwork-skeleton" aria-hidden="true" />
      ) : (
        <>
          {hero && <ArtworkImage src={hero} className="theme-card-hero" />}
          <span className="theme-card-artwork-shade" aria-hidden="true" />
          {logo ? (
            <ArtworkImage
              src={logo}
              alt={title}
              fit="contain"
              className="theme-card-logo"
            />
          ) : (
            <ThemeBrand className="theme-brand-preview" />
          )}
        </>
      )}
    </div>
  )
}
