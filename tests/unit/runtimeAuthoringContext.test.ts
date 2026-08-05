import { describe, expect, it } from 'vitest'
import { runtimeTargetMatchesEditingContext } from '../../src/renderer/authoring/runtimeAuthoringContext'

describe('runtime authoring editing context', () => {
  it('shows only targets belonging to the active scene scope', () => {
    expect(runtimeTargetMatchesEditingContext(
      { scope: 'scene', sceneId: 'scene-a' },
      'scene',
      'scene-a',
    )).toBe(true)
    expect(runtimeTargetMatchesEditingContext(
      { scope: 'scene', sceneId: 'scene-b' },
      'scene',
      'scene-a',
    )).toBe(false)
    expect(runtimeTargetMatchesEditingContext(
      { scope: 'global' },
      'scene',
      'scene-a',
    )).toBe(false)
  })

  it('shows global Runtime targets only while editing the global layer', () => {
    expect(runtimeTargetMatchesEditingContext(
      { scope: 'global' },
      'global',
      'scene-a',
    )).toBe(true)
    expect(runtimeTargetMatchesEditingContext(
      { scope: 'scene', sceneId: 'scene-a' },
      'global',
      'scene-a',
    )).toBe(false)
  })
})
