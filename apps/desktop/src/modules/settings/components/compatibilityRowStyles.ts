import { clsx } from 'clsx'
import { buttonClass } from '@/components/ui/button'

/** Row layout shared by the Compatibility components rows. */
export const COMPAT_ROW = clsx(
  'compatibility-component grid min-h-[78px] grid-cols-[34px_minmax(0,1fr)_minmax(130px,34%)] items-center gap-3.5 p-4',
  'even:bg-orbit-foreground/[0.035] hover:bg-orbit-foreground/[0.055]',
  'max-[700px]:grid-cols-[36px_minmax(0,1fr)]',
  'max-[700px]:[&>button]:col-start-2 max-[700px]:[&>button]:w-full max-[700px]:[&>button]:text-left',
)

export const COMPONENT_ICON =
  'compatibility-component-icon grid size-[34px] place-items-center rounded-xl border border-orbit-border bg-orbit-foreground/[0.04] text-orbit-foreground/70'

export const COMPONENT_STATUS =
  'compatibility-status mt-[7px] inline-flex items-center gap-[5px] text-[11px] text-orbit-muted data-[ready=true]:text-[#86d6ab]'

export const PRIMARY_BUTTON = clsx(
  buttonClass({ size: 'sm', className: 'settings-primary-button' }),
  'disabled:cursor-not-allowed disabled:opacity-40',
)
