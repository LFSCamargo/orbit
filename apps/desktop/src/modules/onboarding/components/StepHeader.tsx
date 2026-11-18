/** Centered step title and a short explanation. */
export function StepHeader({
  title,
  subtitle,
  hero = false,
}: {
  title: string
  subtitle: string
  /** Welcome's larger title. */
  hero?: boolean
}) {
  return (
    <header className="text-center">
      <h1
        id="onboarding-title"
        className={
          hero
            ? 'm-0 font-display text-[clamp(36px,7.4cqh,56px)] font-semibold tracking-[-0.015em] text-white'
            : 'm-0 font-display text-[clamp(30px,5.6cqh,44px)] font-semibold tracking-[-0.01em] text-white'
        }
      >
        {title}
      </h1>
      <p className="mx-auto mt-[clamp(6px,1.4cqh,12px)] max-w-[640px] text-[clamp(15px,2.6cqh,19px)] leading-relaxed text-white/70">
        {subtitle}
      </p>
    </header>
  )
}
