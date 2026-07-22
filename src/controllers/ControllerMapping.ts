export type ControllerFamily = 'xbox' | 'playstation' | 'nintendo' | 'generic'

export type ControllerAction =
  | 'navigate-up'
  | 'navigate-down'
  | 'navigate-left'
  | 'navigate-right'
  | 'confirm'
  | 'back'
  | 'secondary'
  | 'context'
  | 'section-prev'
  | 'section-next'
  | 'menu'

export interface MappedButtons {
  confirm: number
  back: number
  secondary: number
  context: number
  sectionPrev: number
  sectionNext: number
  menu: number
  dpadUp: number
  dpadDown: number
  dpadLeft: number
  dpadRight: number
}

/** Standard Gamepad button indices with family-aware confirm/back semantics. */
export function detectControllerFamily(id: string): ControllerFamily {
  const lower = id.toLowerCase()
  if (
    lower.includes('playstation') ||
    lower.includes('dualshock') ||
    lower.includes('dualsense') ||
    lower.includes('sony')
  ) {
    return 'playstation'
  }
  if (
    lower.includes('nintendo') ||
    lower.includes('switch') ||
    lower.includes('joy-con') ||
    lower.includes('pro controller')
  ) {
    return 'nintendo'
  }
  if (
    lower.includes('xbox') ||
    lower.includes('xinput') ||
    lower.includes('microsoft')
  ) {
    return 'xbox'
  }
  return 'generic'
}

export function mappingForFamily(family: ControllerFamily): MappedButtons {
  // Browser Standard Gamepad layout. Confirm/back swap for Nintendo.
  const base: MappedButtons = {
    confirm: 0,
    back: 1,
    secondary: 2,
    context: 3,
    sectionPrev: 4,
    sectionNext: 5,
    menu: 9,
    dpadUp: 12,
    dpadDown: 13,
    dpadLeft: 14,
    dpadRight: 15,
  }

  if (family === 'nintendo') {
    return {
      ...base,
      confirm: 1,
      back: 0,
    }
  }

  return base
}

export function actionFromButton(
  buttonIndex: number,
  mapping: MappedButtons,
): ControllerAction | null {
  switch (buttonIndex) {
    case mapping.confirm:
      return 'confirm'
    case mapping.back:
      return 'back'
    case mapping.secondary:
      return 'secondary'
    case mapping.context:
      return 'context'
    case mapping.sectionPrev:
      return 'section-prev'
    case mapping.sectionNext:
      return 'section-next'
    case mapping.menu:
      return 'menu'
    case mapping.dpadUp:
      return 'navigate-up'
    case mapping.dpadDown:
      return 'navigate-down'
    case mapping.dpadLeft:
      return 'navigate-left'
    case mapping.dpadRight:
      return 'navigate-right'
    default:
      return null
  }
}
