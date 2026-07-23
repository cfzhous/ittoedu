import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({}))

import { SCENE_PICKER_OPEN_EVENT } from '../../src/player/ScenePickerOverlay'
import {
  invokeControllerAction,
} from '../../src/player/renderTeacherController'
import type { RenderNodeContext } from '../../src/player/renderNode'

describe('teacher controller actions', () => {
  it('opens the runtime scene directory without binding a scene or state', () => {
    const emit = vi.fn()
    const actions = {
      goToScene: vi.fn(),
      nextScene: vi.fn(),
      previousScene: vi.fn(),
      replayScene: vi.fn(),
      restartCourse: vi.fn(),
    }
    const context = {
      actions,
      events: { emit },
    } as unknown as RenderNodeContext

    invokeControllerAction({ type: 'scene.open-picker' }, context)

    expect(emit).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith(SCENE_PICKER_OPEN_EVENT)
    expect(actions.goToScene).not.toHaveBeenCalled()
  })
})
