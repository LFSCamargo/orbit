export const STEAM_LOGIN_WIDTH = 840
export const STEAM_LOGIN_HEIGHT = 520

/** O(1) viewport box for Steam's 840×520 login window. Rust adds the webview origin. */
export function steamLoginHostFrame(
  rect: Pick<DOMRect, 'left' | 'top'> & Partial<Pick<DOMRect, 'width' | 'height'>>,
) {
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width || STEAM_LOGIN_WIDTH),
    height: Math.round(rect.height || STEAM_LOGIN_HEIGHT),
  }
}
