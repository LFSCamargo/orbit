import type { ControllerAction, ControllerFamily } from './ControllerMapping'

const GLYPHS: Record<ControllerFamily, Record<ControllerAction, string>> = {
  xbox: {
    'navigate-up': '↑',
    'navigate-down': '↓',
    'navigate-left': '←',
    'navigate-right': '→',
    confirm: 'A',
    back: 'B',
    secondary: 'X',
    context: 'Y',
    'section-prev': 'LB',
    'section-next': 'RB',
    menu: '☰',
  },
  playstation: {
    'navigate-up': '↑',
    'navigate-down': '↓',
    'navigate-left': '←',
    'navigate-right': '→',
    confirm: '✕',
    back: '○',
    secondary: '□',
    context: '△',
    'section-prev': 'L1',
    'section-next': 'R1',
    menu: 'Options',
  },
  nintendo: {
    'navigate-up': '↑',
    'navigate-down': '↓',
    'navigate-left': '←',
    'navigate-right': '→',
    confirm: 'A',
    back: 'B',
    secondary: 'Y',
    context: 'X',
    'section-prev': 'L',
    'section-next': 'R',
    menu: '+',
  },
  generic: {
    'navigate-up': '↑',
    'navigate-down': '↓',
    'navigate-left': '←',
    'navigate-right': '→',
    confirm: 'A',
    back: 'B',
    secondary: 'X',
    context: 'Y',
    'section-prev': 'L1',
    'section-next': 'R1',
    menu: '☰',
  },
}

export function glyphFor(
  family: ControllerFamily,
  action: ControllerAction,
): string {
  return GLYPHS[family][action]
}

export function actionLabel(action: ControllerAction): string {
  switch (action) {
    case 'confirm':
      return 'Select'
    case 'back':
      return 'Back'
    case 'secondary':
      return 'Favorite'
    case 'context':
      return 'Options'
    case 'section-prev':
      return 'Previous row'
    case 'section-next':
      return 'Next row'
    case 'menu':
      return 'Menu'
    case 'navigate-up':
      return 'Up'
    case 'navigate-down':
      return 'Down'
    case 'navigate-left':
      return 'Left'
    case 'navigate-right':
      return 'Right'
  }
}
