export const ELEMENT_ENTRANCE_PRESETS = [
  'none',
  'fade',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'scale',
] as const

export type ElementEntrancePreset = typeof ELEMENT_ENTRANCE_PRESETS[number]

export interface ElementEntranceAnimation {
  preset: ElementEntrancePreset
  durationMs: number
  delayMs: number
}

export interface ElementEntranceStartFrame {
  xOffset: number
  yOffset: number
  alphaMultiplier: number
  scaleMultiplier: number
}

export const DEFAULT_ELEMENT_ENTRANCE_ANIMATION: Readonly<ElementEntranceAnimation> =
  Object.freeze({
    preset: 'none',
    durationMs: 420,
    delayMs: 0,
  })

const MIN_DURATION_MS = 80
const MAX_DURATION_MS = 4_000
const MAX_DELAY_MS = 10_000
const SLIDE_DISTANCE = 48

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeElementEntranceAnimation(
  value: Partial<ElementEntranceAnimation> | null | undefined,
): ElementEntranceAnimation {
  const preset = ELEMENT_ENTRANCE_PRESETS.includes(
    value?.preset as ElementEntrancePreset,
  )
    ? value!.preset as ElementEntrancePreset
    : DEFAULT_ELEMENT_ENTRANCE_ANIMATION.preset

  return {
    preset,
    durationMs: Math.min(
      MAX_DURATION_MS,
      Math.max(
        MIN_DURATION_MS,
        finiteOr(value?.durationMs, DEFAULT_ELEMENT_ENTRANCE_ANIMATION.durationMs),
      ),
    ),
    delayMs: Math.min(
      MAX_DELAY_MS,
      Math.max(0, finiteOr(value?.delayMs, DEFAULT_ELEMENT_ENTRANCE_ANIMATION.delayMs)),
    ),
  }
}

export function elementEntranceStartFrame(
  preset: ElementEntrancePreset,
): ElementEntranceStartFrame {
  switch (preset) {
    case 'fade':
      return { xOffset: 0, yOffset: 0, alphaMultiplier: 0, scaleMultiplier: 1 }
    case 'slide-left':
      return { xOffset: -SLIDE_DISTANCE, yOffset: 0, alphaMultiplier: 0, scaleMultiplier: 1 }
    case 'slide-right':
      return { xOffset: SLIDE_DISTANCE, yOffset: 0, alphaMultiplier: 0, scaleMultiplier: 1 }
    case 'slide-up':
      return { xOffset: 0, yOffset: -SLIDE_DISTANCE, alphaMultiplier: 0, scaleMultiplier: 1 }
    case 'slide-down':
      return { xOffset: 0, yOffset: SLIDE_DISTANCE, alphaMultiplier: 0, scaleMultiplier: 1 }
    case 'scale':
      return { xOffset: 0, yOffset: 0, alphaMultiplier: 0, scaleMultiplier: 0.82 }
    case 'none':
      return { xOffset: 0, yOffset: 0, alphaMultiplier: 1, scaleMultiplier: 1 }
  }
}

/** Scene mounts animate visible nodes; state changes animate only newly shown nodes. */
export function shouldPlayElementEntrance(
  animation: Partial<ElementEntranceAnimation> | null | undefined,
  wasVisible: boolean | null,
  isVisible: boolean,
): boolean {
  if (!isVisible) return false
  if (normalizeElementEntranceAnimation(animation).preset === 'none') return false
  return wasVisible === null || wasVisible === false
}
