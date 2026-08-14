import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import {
  addCourseStateDeclaration,
  deleteCourseStateDeclaration,
  replaceCourseGlobalInteractions,
  replaceCourseNavigationGuards,
  updateCourseStateDeclaration,
} from '@/renderer/course/courseLogicModel'
import { createCourseProject } from '@/renderer/course/courseStudioModel'

describe('V9 course logic model', () => {
  it('keeps stable variable references valid through rename and type changes', () => {
    const original = createCourseProject({ id: 'course-logic-state', now: '2026-08-14T00:00:00.000Z' })
    const withState = addCourseStateDeclaration(original, {
      key: '已完成',
      valueType: 'boolean',
      defaultValue: false,
    }, '2026-08-14T00:00:01.000Z')
    const withGuard = replaceCourseNavigationGuards(withState, [{
      id: 'guard-next',
      effect: 'block',
      toLocationIds: [withState.locations[0]!.id],
      match: 'all',
      conditions: [{ type: 'compare', key: '已完成', operator: 'eq', value: true }],
      message: '请先完成任务。',
    }], '2026-08-14T00:00:02.000Z')

    const renamed = updateCourseStateDeclaration(withGuard, '已完成', {
      key: '任务得分',
      valueType: 'number',
      defaultValue: 0,
    }, '2026-08-14T00:00:03.000Z')

    expect(renamed.revision).toBe(withGuard.revision + 1)
    expect(renamed.navigationGuards[0]!.conditions[0]).toEqual({
      type: 'compare',
      key: '任务得分',
      operator: 'eq',
      value: 0,
    })
    expect(courseProjectDocumentSchema.safeParse(renamed).success).toBe(true)
  })

  it('removes dependent conditions and empty guards with a deleted variable', () => {
    let project = createCourseProject({ id: 'course-logic-delete', now: '2026-08-14T00:00:00.000Z' })
    project = addCourseStateDeclaration(project, { key: 'ready', valueType: 'boolean', defaultValue: false })
    project = replaceCourseNavigationGuards(project, [{
      id: 'guard-ready',
      effect: 'block',
      toLocationIds: [project.locations[0]!.id],
      match: 'all',
      conditions: [{ type: 'compare', key: 'ready', operator: 'eq', value: true }],
      message: '尚未完成。',
    }])

    const next = deleteCourseStateDeclaration(project, 'ready')
    expect(next.courseState).toEqual([])
    expect(next.navigationGuards).toEqual([])
    expect(next.revision).toBe(project.revision + 1)
  })

  it('stores course-wide conditions and executable actions in one revision', () => {
    const project = createCourseProject({ id: 'course-logic-global', now: '2026-08-14T00:00:00.000Z' })
    const surface = project.surfaces[0]
    if (surface?.type !== 'slide') throw new Error('expected Slide surface')
    const scene = surface.scenes[0]!
    const next = replaceCourseGlobalInteractions(project, [{
      id: 'global-enter',
      name: '进入后继续',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [{ type: 'scene.in', sceneIds: [scene.id] }],
      actions: [{
        id: 'restart-course',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'course.restart' },
      }],
    }])

    expect(next.revision).toBe(project.revision + 1)
    expect(next.globalInteractions[0]!.conditions).toHaveLength(1)
    expect(courseProjectDocumentSchema.safeParse(next).success).toBe(true)
  })
})
