import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { createCourseProject } from '@/renderer/course/courseStudioModel'
import { replaceSlideSceneInteractions } from '@/renderer/course/v9InteractionModel'

describe('V9 interaction model', () => {
  it('replaces one scene rule list in exactly one V9 revision', () => {
    const project = createCourseProject({ id: 'interaction-model', now: '2026-08-14T00:00:00.000Z' })
    const surface = project.surfaces[0]
    if (surface?.type !== 'slide') throw new Error('expected Slide surface')
    const scene = surface.scenes[0]!

    const next = replaceSlideSceneInteractions(project, surface.id, scene.id, [{
      id: 'rule-enter',
      name: '进入后显示标题',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: 'action-show',
        start: 'after-previous',
        delayMs: 300,
        action: {
          type: 'presentation.set',
          stateId: scene.presentation!.initialStateId,
        },
      }],
    }], '2026-08-14T00:00:01.000Z')

    expect(next.revision).toBe(project.revision + 1)
    expect(project.surfaces[0]).not.toBe(next.surfaces[0])
    expect(scene.interactions).toEqual([])
    const nextSurface = next.surfaces[0]
    if (nextSurface?.type !== 'slide') throw new Error('expected Slide surface')
    expect(nextSurface.scenes[0]!.interactions).toHaveLength(1)
    expect(courseProjectDocumentSchema.safeParse(next).success).toBe(true)
  })

  it('rejects non-Slide targets without mutating the document', () => {
    const project = createCourseProject({ id: 'interaction-target', now: '2026-08-14T00:00:00.000Z' })
    expect(() => replaceSlideSceneInteractions(project, 'missing', 'missing', [])).toThrow('幻灯片表面')
    expect(project.revision).toBe(0)
  })
})
