import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  Scene: class {},
  Math: {
    Clamp: (value: number, minimum: number, maximum: number) =>
      Math.max(minimum, Math.min(maximum, value)),
  },
}))

import { PlayerScene } from '../../src/player/PlayerScene'
import type { RuntimePresentationTransition } from '../../src/shared/runtimeTypes'

type TransitionNormalizer = (
  this: { interactionsEnabled: boolean },
  transition?: RuntimePresentationTransition,
) => RuntimePresentationTransition | undefined

function normalizer(): TransitionNormalizer {
  const value = Reflect.get(PlayerScene.prototype, 'normalizeTransition')
  if (typeof value !== 'function') throw new Error('PlayerScene transition normalizer missing')
  return value as TransitionNormalizer
}

describe('PlayerScene animation mode semantics', () => {
  it('keeps authored transitions in preview but resolves capture immediately to the final frame', () => {
    const normalize = normalizer()
    const transition = { duration: 2_400, ease: 'Sine.easeInOut' }

    expect(normalize.call({ interactionsEnabled: true }, transition)).toEqual(
      transition,
    )
    expect(normalize.call({ interactionsEnabled: false }, transition)).toEqual({
      duration: 0,
      ease: 'Sine.easeInOut',
    })
  })

  it('bounds preview transition duration without creating a transition when none was requested', () => {
    const normalize = normalizer()
    expect(normalize.call({ interactionsEnabled: true })).toBeUndefined()
    expect(normalize.call(
      { interactionsEnabled: true },
      { duration: 99_999 },
    )).toEqual({ duration: 10_000 })
  })
})
