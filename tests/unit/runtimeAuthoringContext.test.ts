import { describe, expect, it } from 'vitest'
import {
  isEphemeralRuntimeHitIdentity,
  runtimePersistedAuthoringField,
  runtimeSameSceneLimitMessage,
  runtimeTargetMatchesEditingContext,
} from '../../src/renderer/authoring/runtimeAuthoringContext'

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

  it('persists the declared content key, never a Runtime DOM hitId', () => {
    expect(runtimePersistedAuthoringField({ key: 'title' })).toBe('title')
    expect(isEphemeralRuntimeHitIdentity('registered:1')).toBe(true)
    expect(isEphemeralRuntimeHitIdentity('dom:overlay-hit')).toBe(true)
    expect(isEphemeralRuntimeHitIdentity('title')).toBe(false)
    expect(runtimeSameSceneLimitMessage()).toMatch(/只投射第一个已启用的 Runtime API 2 层/)
  })
})
