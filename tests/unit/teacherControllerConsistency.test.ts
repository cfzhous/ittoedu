import { describe, expect, it } from 'vitest'
import { createBlankSlideCourse } from '../../src/renderer/course/courseLocationCommands'
import {
  createProject,
  createScene,
} from '../../src/renderer/project/createProject'
import { collectProjectHealth } from '../../src/shared/projectHealth'
import { projectDocumentSchema } from '../../src/shared/projectSchema'
import type {
  GlobalLayerItem,
  TeacherControllerNode,
} from '../../src/shared/projectTypes'
import {
  hasDeliveryVisibleTeacherController,
  isCourseDeliveryVisibleTeacherController,
  restoreCourseTeacherControllerLayer,
  synchronizeCourseTeacherControllerControls,
  synchronizeTeacherControllerControls,
} from '../../src/shared/teacherControllerConsistency'

type ControllerItem = GlobalLayerItem & { node: TeacherControllerNode }

function controllerItem(project: ReturnType<typeof createProject>): ControllerItem {
  const item = project.globalLayer.find(
    (candidate) => candidate.node.type === 'teacher-controller',
  )
  if (!item || item.node.type !== 'teacher-controller') {
    throw new Error('测试工程缺少教师控制器')
  }
  return item as ControllerItem
}

const unusableCases: Array<[
  string,
  (item: ControllerItem) => void,
]> = [
  ['underlay', (item) => { item.layer = 'underlay' }],
  ['transparent', (item) => { item.node.opacity = 0 }],
  ['outside canvas', (item) => { item.node.x = 1280 }],
  ['no visible navigation action', (item) => {
    item.node.buttons.forEach((button) => {
      button.visible = button.action.type === 'audio.toggle-mute'
    })
  }],
]

describe('teacher controller delivery consistency', () => {
  it('requires explicit controls when the default controller is omitted', () => {
    expect(() => createProject({ includeDefaultController: false } as never))
      .toThrow('必须显式设置 controls')
  })

  it('accepts the default overlay controller as statically usable', () => {
    const project = createProject()
    expect(hasDeliveryVisibleTeacherController(project)).toBe(true)
    expect(projectDocumentSchema.safeParse(project).success).toBe(true)
  })

  it('accepts multiple usable controllers with different scene scopes', () => {
    const project = createProject()
    project.scenes.push(createScene({ id: 'scene_second', name: '第二场景' }))
    const first = controllerItem(project)
    first.visibility = { mode: 'include', sceneIds: [project.scenes[0]!.id] }
    const second = structuredClone(first)
    second.node.id = 'teacher_controller_second'
    second.node.name = '第二场景教师控制器'
    second.visibility = { mode: 'include', sceneIds: ['scene_second'] }
    project.globalLayer.push(second)

    expect(hasDeliveryVisibleTeacherController(project)).toBe(true)
    expect(projectDocumentSchema.safeParse(project).success).toBe(true)
    expect(collectProjectHealth(project).filter((item) => (
      item.code === 'controller-required-for-canvas' ||
      item.code === 'controller-visible-while-disabled'
    ))).toEqual([])
  })

  it('keeps canvas controls when any one of multiple controllers is usable', () => {
    const project = createProject()
    const unusable = controllerItem(project)
    unusable.layer = 'underlay'
    const usable = structuredClone(unusable)
    usable.node.id = 'teacher_controller_usable'
    usable.node.name = '可用教师控制器'
    usable.layer = 'overlay'
    project.globalLayer.push(usable)

    synchronizeTeacherControllerControls(project)

    expect(project.playback.controls).toBe('canvas')
    expect(projectDocumentSchema.safeParse(project).success).toBe(true)
  })

  it('reports an explicit health error for a zero-scene corrupted project', () => {
    const project = createProject()
    project.scenes = []

    expect(collectProjectHealth(project)).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'scene-required',
      path: ['scenes'],
    }))
  })

  it.each(unusableCases)(
    'rejects a canvas controller that is %s and heals controls to none',
    (_label, mutate) => {
      const project = createProject()
      mutate(controllerItem(project))

      expect(hasDeliveryVisibleTeacherController(project)).toBe(false)
      expect(projectDocumentSchema.safeParse(project).success).toBe(false)
      expect(collectProjectHealth(project)).toContainEqual(expect.objectContaining({
        severity: 'error',
        code: 'controller-required-for-canvas',
      }))

      synchronizeTeacherControllerControls(project)
      expect(project.playback.controls).toBe('none')
    },
  )
})

describe('V9 course teacher controller restore', () => {
  it('restores a delivery-visible canvas controller after an explicit request', () => {
    const created = createBlankSlideCourse({ id: 't06-controller', now: '2026-08-17T05:20:00.000Z' })
    const entry = created.project.globalLayerItems.find(
      (candidate) => candidate.item.kind === 'native'
        && candidate.item.content.nativeType === 'teacher-controller',
    )
    expect(entry).toBeDefined()
    if (
      !entry ||
      entry.item.kind !== 'native' ||
      entry.item.content.nativeType !== 'teacher-controller'
    ) {
      return
    }
    entry.item.visible = false
    entry.item.opacity = 0
    entry.item.content.data.buttons.forEach((button) => {
      button.visible = false
    })
    expect(isCourseDeliveryVisibleTeacherController(
      entry,
      created.project.locations.map((location) => location.id),
    )).toBe(false)

    expect(restoreCourseTeacherControllerLayer(entry)).toBe(true)
    synchronizeCourseTeacherControllerControls(created.project)
    expect(created.project.playback.controls).toBe('canvas')
    expect(isCourseDeliveryVisibleTeacherController(
      entry,
      created.project.locations.map((location) => location.id),
    )).toBe(true)
  })
})
