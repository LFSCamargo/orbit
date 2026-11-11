import '@testing-library/jest-dom/vitest'

// jsdom does not implement layout APIs used by the focus manager.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
