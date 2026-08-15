import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  addSpatialTextLayer,
  commitCourseHistory,
  createCourseHistory,
  createCourseProject,
  type CourseHistoryState,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  addSpatialEditorCameraFrame,
  addSpatialEditorSemanticZoomRule,
  deleteSpatialCameraFrame,
  deleteSpatialEditorSemanticZoomRule,
  renameSpatialCameraFrame,
  reorderSpatialCameraFrames,
  setSpatialCameraHome,
  updateSpatialEditorSemanticZoomRule,
} from '@/renderer/course/spatialCameraCommands'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type { SpatialSurfaceDocument } from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T00:00:00.000Z'
const SURFACE_ID = 'spatial'

function spatialFixture(): {
  history: CourseHistoryState
  surfaceOf(project: CourseHistoryState['present']): SpatialSurfaceDocument
  firstFrameId(project: CourseHistoryState['present']): string
} {
  let project = createCourseProject({
    id: 'course-spatial-camera',
    title: '镜头课程',
    now: NOW,
  })
  project = addCourseSurface(project, 'spatial-2d', {
    id: SURFACE_ID,
    title: '空间探索',
    now: NOW,
  })
  project = addSpatialTextLayer(project, SURFACE_ID, '标题文字', {
    id: 'world-title',
    now: NOW,
  })

  const surfaceOf = (current: CourseHistoryState['present']): SpatialSurfaceDocument => {
    const surface = current.surfaces.find((candidate) => candidate.id === SURFACE_ID)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    return surface
  }
  const firstFrameId = (current: CourseHistoryState['present']): string => {
    const frame = surfaceOf(current).camera.frames[0]
    if (!frame) throw new Error('expected an initial camera frame')
    return frame.id
  }

  return { history: createCourseHistory(project), surfaceOf, firstFrameId }
}

describe('Spatial camera commands', () => {
  it('adds a camera frame from a session pose in exactly one history entry', () => {
    const { history, surfaceOf } = spatialFixture()
    const before = history.present
    const added = addSpatialEditorCameraFrame(
      history,
      SURFACE_ID,
      { x: 120, y: 240, zoom: 1.5 },
      { name: ' 特写 ', now: NOW },
    )

    expect(added.present.revision).toBe(before.revision + 1)
    expect(added.past).toEqual([before])
    expect(added.future).toEqual([])

    const surface = surfaceOf(added.present)
    expect(surface.camera.frames).toHaveLength(2)
    const frame = surface.camera.frames.find((candidate) => candidate.name === '特写')
    expect(frame).toMatchObject({ x: 120, y: 240, zoom: 1.5 })
    expect(frame?.id).toMatch(/^camera-/u)

    const location = added.present.locations.find((candidate) =>
      candidate.kind === 'spatial-camera' &&
      candidate.surfaceId === SURFACE_ID &&
      candidate.cameraFrameId === frame?.id,
    )
    expect(location).toBeDefined()
    expect(location?.label).toBe('空间探索 · 特写')

    const printEntry = added.present.mixedPrintPlan?.entries.find((entry) =>
      entry.kind === 'spatial-frames' && entry.surfaceId === SURFACE_ID,
    )
    if (printEntry?.kind !== 'spatial-frames') throw new Error('expected Spatial print entry')
    expect(printEntry.cameraFrameIds).toContain(frame?.id)
    expect(courseProjectDocumentSchema.parse(added.present)).toEqual(added.present)
  })

  it('renames a camera frame and keeps its location label in sync with one history entry', () => {
    const { history, surfaceOf, firstFrameId } = spatialFixture()
    const frameId = firstFrameId(history.present)
    const renamed = renameSpatialCameraFrame(history, SURFACE_ID, frameId, ' 全景总览 ', NOW)

    expect(renamed.present.revision).toBe(history.present.revision + 1)
    expect(renamed.past).toEqual([history.present])
    expect(renamed.future).toEqual([])
    expect(surfaceOf(renamed.present).camera.frames[0]?.name).toBe('全景总览')

    const location = renamed.present.locations.find((candidate) =>
      candidate.kind === 'spatial-camera' &&
      candidate.surfaceId === SURFACE_ID &&
      candidate.cameraFrameId === frameId,
    )
    expect(location?.label).toBe('空间探索 · 全景总览')

    const same = renameSpatialCameraFrame(renamed, SURFACE_ID, frameId, ' 全景总览 ', NOW)
    expect(same).toBe(renamed)
  })

  it('reorders camera frames with one history entry and treats no-op moves as no-ops', () => {
    const { history, surfaceOf } = spatialFixture()
    let current = addSpatialEditorCameraFrame(history, SURFACE_ID, { x: 10, y: 20, zoom: 0.5 }, { name: '近景', now: NOW })
    current = addSpatialEditorCameraFrame(current, SURFACE_ID, { x: -10, y: -20, zoom: 2 }, { name: '远景', now: NOW })

    const moved = reorderSpatialCameraFrames(current, SURFACE_ID, surfaceOf(current.present).camera.frames[2]!.id, 0, NOW)
    expect(moved.present.revision).toBe(current.present.revision + 1)
    expect(moved.past).toEqual([...current.past, current.present])
    expect(moved.past).toHaveLength(current.past.length + 1)
    expect(moved.future).toEqual([])
    expect(surfaceOf(moved.present).camera.frames.map((frame) => frame.name)).toEqual([
      '远景',
      '总览',
      '近景',
    ])

    const boundary = reorderSpatialCameraFrames(moved, SURFACE_ID, surfaceOf(moved.present).camera.frames[0]!.id, 0, NOW)
    expect(boundary).toBe(moved)
  })

  it('deletes a camera frame and repairs locations, start location and print plan in one history entry', () => {
    const { history, surfaceOf, firstFrameId } = spatialFixture()
    const initialFrameId = firstFrameId(history.present)
    const added = addSpatialEditorCameraFrame(history, SURFACE_ID, { x: 80, y: 90, zoom: 1.2 }, { name: '特写', now: NOW })
    const addedFrameId = surfaceOf(added.present).camera.frames.find((frame) => frame.name === '特写')!.id

    const prepared = updateCourseProject(added.present, (draft) => {
      draft.startLocationId = addedFrameId
    }, NOW)
    const preparedHistory = commitCourseHistory(added, prepared)

    const deleted = deleteSpatialCameraFrame(preparedHistory, SURFACE_ID, addedFrameId, NOW)
    expect(deleted.present.revision).toBe(prepared.revision + 1)
    expect(deleted.past).toEqual([...preparedHistory.past, prepared])
    expect(deleted.past).toHaveLength(preparedHistory.past.length + 1)
    expect(deleted.future).toEqual([])

    const surface = surfaceOf(deleted.present)
    expect(surface.camera.frames.map((frame) => frame.id)).toEqual([initialFrameId])
    expect(deleted.present.locations.some((location) =>
      location.kind === 'spatial-camera' &&
      location.surfaceId === SURFACE_ID &&
      location.cameraFrameId === addedFrameId,
    )).toBe(false)
    expect(deleted.present.startLocationId).not.toBe(addedFrameId)
    expect(deleted.present.locations.some((location) => location.id === deleted.present.startLocationId)).toBe(true)

    const printEntry = deleted.present.mixedPrintPlan?.entries.find((entry) =>
      entry.kind === 'spatial-frames' && entry.surfaceId === SURFACE_ID,
    )
    if (printEntry?.kind !== 'spatial-frames') throw new Error('expected Spatial print entry')
    expect(printEntry.cameraFrameIds).toEqual([initialFrameId])
    expect(courseProjectDocumentSchema.parse(deleted.present)).toEqual(deleted.present)

    expect(() => deleteSpatialCameraFrame(deleted, SURFACE_ID, initialFrameId, NOW))
      .toThrow(/至少需要一个镜头画面/)
  })

  it('persists only the home camera in one history entry', () => {
    const { history, surfaceOf } = spatialFixture()
    const home = setSpatialCameraHome(history, SURFACE_ID, { x: 33, y: 44, zoom: 0.75 }, NOW)

    expect(home.present.revision).toBe(history.present.revision + 1)
    expect(home.past).toEqual([history.present])
    expect(home.future).toEqual([])
    expect(surfaceOf(home.present).camera.home).toEqual({ x: 33, y: 44, zoom: 0.75 })
    expect(surfaceOf(home.present).camera.frames).toHaveLength(1)
    expect(home.present.locations).toEqual(history.present.locations)

    const same = setSpatialCameraHome(home, SURFACE_ID, { x: 33, y: 44, zoom: 0.75 }, NOW)
    expect(same).toBe(home)
  })
})

describe('Spatial semantic zoom commands', () => {
  it('adds a semantic zoom rule with one history entry and rejects invalid ranges or dangling layers', () => {
    const { history, surfaceOf } = spatialFixture()
    const added = addSpatialEditorSemanticZoomRule(history, SURFACE_ID, {
      layerItemIds: ['world-title'],
      minZoom: 0,
      maxZoom: 2,
      visible: false,
      now: NOW,
    })

    expect(added.present.revision).toBe(history.present.revision + 1)
    expect(added.past).toEqual([history.present])
    expect(added.future).toEqual([])
    const rule = surfaceOf(added.present).semanticZoom[0]
    expect(rule).toMatchObject({
      layerItemIds: ['world-title'],
      minZoom: 0,
      maxZoom: 2,
      visible: false,
    })
    expect(rule?.id).toMatch(/^semantic-zoom-/u)
    expect(courseProjectDocumentSchema.parse(added.present)).toEqual(added.present)

    expect(() => addSpatialEditorSemanticZoomRule(history, SURFACE_ID, {
      layerItemIds: ['world-title'],
      minZoom: 2,
      maxZoom: 1,
    })).toThrow(/最小缩放必须小于最大缩放/)

    expect(() => addSpatialEditorSemanticZoomRule(history, SURFACE_ID, {
      layerItemIds: ['missing-world-layer'],
      minZoom: 0,
      maxZoom: 2,
    })).toThrow(/不存在的世界图层/)

    expect(() => addSpatialEditorSemanticZoomRule(history, SURFACE_ID, {
      layerItemIds: [],
      minZoom: 0,
      maxZoom: 2,
    })).toThrow(/至少需要引用一个世界图层/)

    expect(history.present.revision).toBe(2)
  })

  it('updates a semantic zoom rule immutably with one history entry and rejects invalid merged rules', () => {
    const { history, surfaceOf } = spatialFixture()
    const added = addSpatialEditorSemanticZoomRule(history, SURFACE_ID, {
      id: 'rule_1',
      layerItemIds: ['world-title'],
      minZoom: 0,
      maxZoom: 2,
      now: NOW,
    })

    const updated = updateSpatialEditorSemanticZoomRule(added, SURFACE_ID, 'rule_1', {
      maxZoom: 3,
      visible: false,
    }, NOW)
    expect(updated.present.revision).toBe(added.present.revision + 1)
    expect(updated.past).toEqual([...added.past, added.present])
    expect(updated.past).toHaveLength(added.past.length + 1)
    expect(updated.future).toEqual([])
    const rule = surfaceOf(updated.present).semanticZoom[0]
    expect(rule).toMatchObject({ id: 'rule_1', minZoom: 0, maxZoom: 3, visible: false })

    const same = updateSpatialEditorSemanticZoomRule(updated, SURFACE_ID, 'rule_1', {
      maxZoom: 3,
      visible: false,
    }, NOW)
    expect(same).toBe(updated)

    expect(() => updateSpatialEditorSemanticZoomRule(updated, SURFACE_ID, 'rule_1', {
      minZoom: 4,
      maxZoom: 3,
    }, NOW)).toThrow(/最小缩放必须小于最大缩放/)

    expect(() => updateSpatialEditorSemanticZoomRule(updated, SURFACE_ID, 'rule_1', {
      layerItemIds: ['missing-world-layer'],
    }, NOW)).toThrow(/不存在的世界图层/)
  })

  it('deletes a semantic zoom rule with one history entry and keeps the rule id immutable', () => {
    const { history, surfaceOf } = spatialFixture()
    const added = addSpatialEditorSemanticZoomRule(history, SURFACE_ID, {
      id: 'rule_1',
      layerItemIds: ['world-title'],
      minZoom: 0,
      maxZoom: 2,
      now: NOW,
    })
    const updated = updateSpatialEditorSemanticZoomRule(added, SURFACE_ID, 'rule_1', (rule) => {
      rule.id = 'other'
      rule.maxZoom = 2.5
    }, NOW)
    expect(surfaceOf(updated.present).semanticZoom[0]).toMatchObject({ id: 'rule_1', maxZoom: 2.5 })

    const deleted = deleteSpatialEditorSemanticZoomRule(updated, SURFACE_ID, 'rule_1', NOW)
    expect(deleted.present.revision).toBe(updated.present.revision + 1)
    expect(deleted.past).toEqual([...updated.past, updated.present])
    expect(deleted.past).toHaveLength(updated.past.length + 1)
    expect(deleted.future).toEqual([])
    expect(surfaceOf(deleted.present).semanticZoom).toHaveLength(0)
    expect(() => deleteSpatialEditorSemanticZoomRule(deleted, SURFACE_ID, 'rule_1', NOW))
      .toThrow(/找不到语义缩放规则/)
  })

  it('survives save/reopen as a schema-valid project after camera and semantic zoom edits', () => {
    const { history, surfaceOf, firstFrameId } = spatialFixture()
    const initialFrameId = firstFrameId(history.present)
    let current = addSpatialEditorCameraFrame(history, SURFACE_ID, { x: 10, y: 20, zoom: 1.25 }, { name: '近景', now: NOW })
    current = setSpatialCameraHome(current, SURFACE_ID, { x: 5, y: 6, zoom: 0.8 }, NOW)
    current = addSpatialEditorSemanticZoomRule(current, SURFACE_ID, {
      layerItemIds: ['world-title'],
      minZoom: 0.5,
      maxZoom: 2.5,
      now: NOW,
    })
    current = renameSpatialCameraFrame(current, SURFACE_ID, initialFrameId, '重开总览', NOW)

    const reopened = JSON.parse(JSON.stringify(current.present)) as typeof current.present
    const parsed = courseProjectDocumentSchema.parse(reopened)
    expect(parsed).toEqual(reopened)

    const reopenedSurface = surfaceOf(reopened)
    expect(reopenedSurface.camera.home).toEqual({ x: 5, y: 6, zoom: 0.8 })
    expect(reopenedSurface.camera.frames.some((frame) => frame.name === '重开总览')).toBe(true)
    expect(reopenedSurface.camera.frames.some((frame) => frame.name === '近景')).toBe(true)
    expect(reopenedSurface.semanticZoom).toHaveLength(1)
    expect(reopenedSurface.semanticZoom[0]).toMatchObject({
      layerItemIds: ['world-title'],
      minZoom: 0.5,
      maxZoom: 2.5,
      visible: true,
    })
  })
})
