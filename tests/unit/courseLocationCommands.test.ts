import { describe, expect, it } from 'vitest'
import { buildCourseStructureViewModel } from '@/renderer/course/courseEditorLayout'
import {
  addCoursePage,
  createBlankFlowCourse,
  createBlankSlideCourse,
  createBlankSpatialCourse,
  deleteCourseLocation,
  reorderCoursePages,
  selectCourseLocation,
  selectGlobalLayerScope,
} from '@/renderer/course/courseLocationCommands'
import { addCourseSurface, createCourseProject } from '@/renderer/course/courseStudioModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-17T00:00:00.000Z'

describe('course location commands', () => {
  it('creates blank Slide, Flow and Spatial documents without importing', () => {
    const slide = createBlankSlideCourse({ id: 'blank-slide', title: '空白演示', now: NOW })
    const flow = createBlankFlowCourse({ id: 'blank-flow', title: '空白讲义', now: NOW })
    const spatial = createBlankSpatialCourse({ id: 'blank-spatial', title: '空白画布', now: NOW })

    expect(slide.layout.layout).toBe('slide')
    expect(flow.layout.layout).toBe('flow')
    expect(spatial.layout.layout).toBe('spatial')
    expect(slide.project.revision).toBe(0)
    expect(flow.project.revision).toBe(0)
    expect(spatial.project.revision).toBe(0)
    expect(slide.activatedLocationId).toBe(slide.project.startLocationId)
    expect(flow.activatedLocationId).toBe(flow.project.startLocationId)
    expect(spatial.activatedLocationId).toBe(spatial.project.startLocationId)
    expect(courseProjectDocumentSchema.parse(slide.project)).toEqual(slide.project)
    expect(courseProjectDocumentSchema.parse(flow.project)).toEqual(flow.project)
    expect(courseProjectDocumentSchema.parse(spatial.project)).toEqual(spatial.project)

    const flowSurface = flow.project.surfaces[0]
    if (flowSurface?.type !== 'flow') throw new Error('expected flow')
    expect(flowSurface.blocks.map((block) => block.type)).toEqual(['heading', 'paragraph'])
    expect(flow.project.locations).toHaveLength(1)
    expect(flow.project.locations[0]).toMatchObject({
      kind: 'flow-block',
      blockId: flowSurface.blocks[0]?.id,
    })

    const spatialSurface = spatial.project.surfaces[0]
    if (spatialSurface?.type !== 'spatial-2d') throw new Error('expected spatial')
    expect(spatialSurface.camera.frames).toHaveLength(1)
    expect(spatial.project.locations[0]).toMatchObject({
      kind: 'spatial-camera',
      cameraFrameId: spatialSurface.camera.frames[0]?.id,
    })
  })

  it('adds a page atomically and re-derives Mixed for the store history wrapper', () => {
    const created = createBlankSlideCourse({ id: 'cmd-add', title: '演示', now: NOW })
    const added = addCoursePage(created.project, 'flow', { id: 'added-flow', now: NOW })
    expect(added.project.revision).toBe(created.project.revision + 1)
    expect(added.activatedLocationId).not.toBe(created.activatedLocationId)
    expect(added.project.locations.some((location) => location.id === added.activatedLocationId)).toBe(true)
    expect(added.layout.layout).toBe('mixed')
    expect(added.layout.referencedSurfaceTypes).toEqual(['slide', 'flow'])
    expect(courseProjectDocumentSchema.parse(added.project)).toEqual(added.project)

    const fromFlow = addCoursePage(createBlankFlowCourse({ id: 'cmd-add-slide', now: NOW }).project, 'slide', {
      id: 'added-slide',
      now: NOW,
    })
    expect(fromFlow.layout.referencedSurfaceTypes).toEqual(['flow', 'slide'])

    const spatial = addCoursePage(added.project, 'spatial-2d', { id: 'added-spatial', now: NOW })
    expect(spatial.layout.layout).toBe('mixed')
    expect(spatial.layout.referencedSurfaceTypes).toEqual(['slide', 'flow', 'spatial-2d'])
    const tree = buildCourseStructureViewModel(spatial.project)
    expect(tree.pageTree.nodes.map((node) => node.kind)).toEqual([
      'slide-page',
      'flow-page',
      'spatial-page',
    ])
  })

  it('refuses to delete the last location and re-derives Pure after removing the other type', () => {
    const slide = createCourseProject({ id: 'cmd-delete', now: NOW })
    expect(() => deleteCourseLocation(slide, slide.startLocationId, { now: NOW }))
      .toThrow('不可删除最后一个课程位置')

    const mixed = addCourseSurface(slide, 'flow', { id: 'delete-flow', now: NOW })
    const flowLocation = mixed.locations.find((location) => location.kind === 'flow-block')
    if (!flowLocation) throw new Error('expected flow location')
    const deleted = deleteCourseLocation(mixed, flowLocation.id, {
      now: NOW,
      activeLocationId: mixed.startLocationId,
    })
    expect(deleted.layout.layout).toBe('slide')
    expect(deleted.activatedLocationId).toBe(mixed.startLocationId)
    expect(deleted.project.locations).toHaveLength(1)
    expect(courseProjectDocumentSchema.parse(deleted.project)).toEqual(deleted.project)
    expect(() => deleteCourseLocation(deleted.project, deleted.activatedLocationId, { now: NOW }))
      .toThrow('不可删除最后一个课程位置')
  })

  it('reorders page groups together and keeps child locations under the same parent', () => {
    let project = createCourseProject({ id: 'cmd-reorder', now: NOW })
    project = addCourseSurface(project, 'flow', { id: 'reorder-flow', now: NOW })
    project = addCourseSurface(project, 'spatial-2d', { id: 'reorder-spatial', now: NOW })
    const surfaceIds = project.locations
      .map((location) => location.surfaceId)
      .filter((surfaceId, index, all) => all.indexOf(surfaceId) === index)
    expect(surfaceIds).toHaveLength(3)
    const reordered = reorderCoursePages(project, [surfaceIds[2]!, surfaceIds[0]!, surfaceIds[1]!], {
      now: NOW,
      activeLocationId: project.startLocationId,
    })
    expect(reordered.layout.layout).toBe('mixed')
    expect(buildCourseStructureViewModel(reordered.project).pageTree.nodes.map((node) => node.kind))
      .toEqual(['spatial-page', 'slide-page', 'flow-page'])
    expect(reordered.activatedLocationId).toBe(project.startLocationId)
    expect(reordered.project.revision).toBe(project.revision + 1)
  })

  it('selects a location or the global layer without changing project revision', () => {
    const project = createCourseProject({ id: 'cmd-select', now: NOW })
    const revision = project.revision
    const selected = selectCourseLocation(project, project.startLocationId)
    expect(selected).toEqual({
      activatedLocationId: project.startLocationId,
      authoringScope: 'location',
      layout: {
        layout: 'slide',
        referencedSurfaceTypes: ['slide'],
      },
    })
    const global = selectGlobalLayerScope(project, project.startLocationId)
    expect(global).toEqual({
      activatedLocationId: project.startLocationId,
      authoringScope: 'global-layer',
      layout: {
        layout: 'slide',
        referencedSurfaceTypes: ['slide'],
      },
    })
    expect(project.revision).toBe(revision)
    expect(project.startLocationId).toBe(selected.activatedLocationId)
    expect(() => selectCourseLocation(project, 'missing-location')).toThrow('找不到课程位置：missing-location')
  })
})
