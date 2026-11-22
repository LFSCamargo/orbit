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
    home: '⌂',
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
    home: 'PS',
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
    home: 'Home',
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
    home: '⌂',
  },
}

export function glyphFor(family: ControllerFamily, action: ControllerAction): string {
  return GLYPHS[family][action]
}
