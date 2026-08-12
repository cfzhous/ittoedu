export type LayoutMeasurementMode =
  | 'browser-canvas'
  | 'deterministic-fallback'

export interface LayoutMeasureContext {
  font: string
  measureText(value: string): { width: number }
}

export interface ResolvedLayoutMeasureContext {
  context: LayoutMeasureContext
  mode: LayoutMeasurementMode
}

function fontSize(font: string): number {
  const match = /(?:^|\s)(\d+(?:\.\d+)?)px(?:\s|$)/u.exec(font)
  const value = match ? Number(match[1]) : 16
  return Number.isFinite(value) && value > 0 ? value : 16
}

function characterAdvance(character: string): number {
  if (/\p{White_Space}/u.test(character)) return 0.33
  if (
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Bopomofo}]/u
      .test(character) ||
    /\p{Extended_Pictographic}/u.test(character)
  ) return 1
  if (/\p{Lu}/u.test(character)) return 0.64
  if (/\p{Ll}/u.test(character)) return 0.54
  if (/\p{N}/u.test(character)) return 0.56
  if (/\p{P}/u.test(character)) return 0.38
  if (/\p{S}/u.test(character)) return 0.68
  return 0.62
}

function deterministicWidth(font: string, value: string): number {
  const size = fontSize(font)
  const weightFactor = /(?:^|\s)(?:bold|[6-9]00)(?:\s|$)/u.test(font)
    ? 1.035
    : 1
  return Array.from(value).reduce(
    (width, character) => width + characterAdvance(character) * size,
    0,
  ) * weightFactor
}

function browserCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  // jsdom exposes a canvas element but intentionally has no 2D backend. Calling
  // getContext there emits a noisy "not implemented" diagnostic before it
  // returns null, so treat it as the same deterministic Node environment used
  // by the headless validator.
  if (
    typeof navigator !== 'undefined' &&
    /\bjsdom\b/iu.test(navigator.userAgent)
  ) return null
  try {
    return document.createElement('canvas').getContext('2d')
  } catch {
    return null
  }
}

/**
 * Analysis uses the browser's real Canvas metrics when available. Node-only
 * validation intentionally falls back to a deterministic approximation so a
 * CLI never has to launch Electron or install a native Canvas dependency.
 */
export function resolveLayoutMeasureContext(): ResolvedLayoutMeasureContext {
  const browser = browserCanvasContext()
  if (browser) return { context: browser, mode: 'browser-canvas' }

  const fallback: LayoutMeasureContext = {
    font: '16px sans-serif',
    measureText(value) {
      return { width: deterministicWidth(fallback.font, value) }
    },
  }
  return { context: fallback, mode: 'deterministic-fallback' }
}

export function detectLayoutMeasurementMode(): LayoutMeasurementMode {
  return browserCanvasContext() ? 'browser-canvas' : 'deterministic-fallback'
}
