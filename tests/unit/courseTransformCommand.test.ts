import { describe, expect, it } from 'vitest'
import {
  addSlideTextLayer,
  createCourseProject,
  updateLayerItem,
} from '../../src/renderer/course/courseStudioModel'
import { commitCourseTransform } from '../../src/renderer/course/courseTransformCommand'

describe('V9 transform command', () => {
  it('commits a multi-selection gesture as one revision', () => {
    let project = createCourseProject({ now: '2026-08-14T00:00:00.000Z' })
    const surface = project.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('expected slide')
    const sceneId = surface.scenes[0]!.id
    project = addSlideTextLayer(project, surface.id, sceneId, 'A', { id: 'a' })
    project = addSlideTextLayer(project, surface.id, sceneId, 'B', { id: 'b' })
    const revision = project.revision
    const scene = project.surfaces[0]!.type === 'slide' ? project.surfaces[0]!.scenes[0]! : undefined
    const source = scene!.layerItems.filter((item) => item.layerItemId === 'a' || item.layerItemId === 'b')

    project = commitCourseTransform(
      project,
      source.map((item) => ({ surfaceId: surface.id, sceneId, source: 'scene' as const, layerItemId: item.layerItemId })),
      source.map((item) => ({
        layerItemId: item.layerItemId,
        frame: { ...item.frame, x: item.frame.x + 40, y: item.frame.y + 20 },
        rotation: item.rotation + 15,
        locked: item.locked,
      })),
      '2026-08-14T00:01:00.000Z',
    )

    expect(project.revision).toBe(revision + 1)
    const changed = project.surfaces[0]!.type === 'slide' ? project.surfaces[0]!.scenes[0]!.layerItems : []
    for (const before of source) {
      expect(changed.find((item) => item.layerItemId === before.layerItemId)).toMatchObject({
        frame: { x: before.frame.x + 40, y: before.frame.y + 20 },
        rotation: before.rotation + 15,
      })
    }
  })

  it('refuses to transform locked or unselected layers', () => {
    let project = createCourseProject()
    const surface = project.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('expected slide')
    const sceneId = surface.scenes[0]!.id
    project = addSlideTextLayer(project, surface.id, sceneId, '锁定', { id: 'locked' })
    project = updateLayerItem(project, {
      surfaceId: surface.id,
      sceneId,
      source: 'scene',
      layerItemId: 'locked',
    }, (item) => { item.locked = true })
    const currentSurface = project.surfaces.find((candidate) => candidate.id === surface.id)
    const controller = currentSurface?.type === 'slide'
      ? currentSurface.scenes[0]!.layerItems.find((item) => item.layerItemId === 'locked')
      : undefined
    expect(controller).toBeDefined()
    expect(() => commitCourseTransform(project, [{
      surfaceId: surface.id,
      sceneId,
      source: 'scene',
      layerItemId: controller!.layerItemId,
    }], [{
      layerItemId: controller!.layerItemId,
      frame: { ...controller!.frame, x: controller!.frame.x + 1 },
      rotation: controller!.rotation,
      locked: true,
    }])).toThrow(/已锁定/)
  })
})
