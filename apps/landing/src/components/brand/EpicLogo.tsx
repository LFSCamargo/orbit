import type { ProviderLogoProps } from './providerLogo'

export function EpicLogo({ className, label }: ProviderLogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand mark
    <img
      src="/brand/epic-games.svg"
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      className={className}
    />
  )
}
