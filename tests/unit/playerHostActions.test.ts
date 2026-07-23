import { describe, expect, it, vi } from 'vitest'
import { createPlayerComponentHostActions } from '@/player/componentHostActions'

describe('component host actions', () => {
  it('forwards the stable action contract without exposing PlayerScene', () => {
    const target = {
      goToSceneById: vi.fn(() => true),
      nextScene: vi.fn(() => true),
      previousScene: vi.fn(() => false),
      replayScene: vi.fn(() => true),
      restartCourse: vi.fn(() => true),
    }
    const actions = createPlayerComponentHostActions(target)

    expect(actions.goToScene('scene-detail')).toBe(true)
    expect(actions.goToScene('scene-detail', 'state-expanded')).toBe(true)
    expect(actions.nextScene()).toBe(true)
    expect(actions.previousScene()).toBe(false)
    expect(actions.replayScene()).toBe(true)
    expect(actions.restartCourse()).toBe(true)
    expect(target.goToSceneById).toHaveBeenNthCalledWith(
      1,
      'scene-detail',
      undefined,
    )
    expect(target.goToSceneById).toHaveBeenNthCalledWith(
      2,
      'scene-detail',
      'state-expanded',
    )
    expect(Object.isFrozen(actions)).toBe(true)
    expect(actions).not.toHaveProperty('playerScene')
  })
})
