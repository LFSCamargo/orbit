export type ProviderLogoProps = { className?: string; label?: string }

export function providerLogoA11y(label: string | undefined) {
  return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
}
