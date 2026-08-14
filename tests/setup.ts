import '@testing-library/jest-dom/vitest'

// jsdom deliberately does not implement canvas. A small null-returning stub
// matches browsers where a requested context is unavailable and keeps tests
// from emitting misleading "Not implemented" diagnostics; tests that exercise
// pixels install their own explicit context mock.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext
}
