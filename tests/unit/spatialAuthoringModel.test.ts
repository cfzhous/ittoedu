import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  addSpatialCameraFrame,
  addSpatialRelation,
  addSpatialTextLayer,
  commitCourseHistory,
  createCourseHistory,
  createCourseProject,
  deleteLayerItem,
  deleteSpatialCameraFrame,
  renameSpatialCameraFrame,
  reorderSpatialCameraFrames,
  setSpatialHomeCamera,
  updateLayerItems,
  updateSpatialRelation,
  undoCourseHistory,
} from '@/renderer/course/courseStudioModel'
import { cutCourseLayerItems } from '@/renderer/course/courseLayerClipboard'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import {
  cullSpatialItems,
  fitSpatialSurfaceCamera,
  SPATIAL_CANONICAL_VIEWPORT,
  spatialCameraFromPose,
} from '@/player/surfaces/spatial/spatialModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { SPATIAL_MAX_ZOOM } from '@/shared/courseProjectTypes'

const NOW = '2026-08-14T00:00:00.000Z'

function spatialProject() {
  let project = createCourseProject({ id: 'spatial-authoring', now: NOW })
  project = addCourseSurface(project, 'spatial-2d', { id: 'spatial-main', now: NOW })
  project = addSpatialTextLayer(project, 'spatial-main', '节点甲', {
    id: 'node-a', x: 0, y: 0, now: NOW,
  })
  project = addSpatialTextLayer(project, 'spatial-main', '节点乙', {
    id: 'node-b', x: 400, y: 0, now: NOW,
  })
  return project
}

describe('Spatial V9 teacher authoring model', () => {
  it('clamps an empty fit-all camera and preserves it through a real save/reopen', () => {
    let project = createCourseProject({ id: 'empty-spatial-roundtrip', now: NOW })
    project = addCourseSurface(project, 'spatial-2d', { id: 'empty-spatial', now: NOW })
    const spatial = project.surfaces.find((surface) => surface.id === 'empty-spatial')
    if (spatial?.type !== 'spatial-2d') throw new Error('expected empty Spatial surface')
    const controller = project.globalLayerItems[0]?.item
    if (!controller) throw new Error('default teacher controller missing')
    const initialCamera = spatialCameraFromPose(spatial.camera.home, SPATIAL_CANONICAL_VIEWPORT)
    expect(cullSpatialItems([controller], initialCamera).map(({ item }) => item.layerItemId))
      .toEqual([controller.layerItemId])
    const fitted = fitSpatialSurfaceCamera(spatial)
    expect(fitted).toEqual({
      x: SPATIAL_CANONICAL_VIEWPORT.width / 2,
      y: SPATIAL_CANONICAL_VIEWPORT.height / 2,
      zoom: SPATIAL_MAX_ZOOM,
    })
    project = setSpatialHomeCamera(project, spatial.id, fitted, NOW)
    const outOfRange = structuredClone(project)
    const outOfRangeSpatial = outOfRange.surfaces.find((surface) => surface.id === spatial.id)
    if (outOfRangeSpatial?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    outOfRangeSpatial.camera.home.zoom = SPATIAL_MAX_ZOOM + 1
    expect(courseProjectDocumentSchema.safeParse(outOfRange).success).toBe(false)

    const bytes = createCourseProjectArchive({ project, assetFiles: {}, componentFiles: {} }, { mtime: NOW })
    const reopened = openCourseProjectArchive(bytes).project
    const reopenedSpatial = reopened.surfaces.find((surface) => surface.id === spatial.id)
    if (reopenedSpatial?.type !== 'spatial-2d') throw new Error('reopened Spatial surface missing')
    expect(reopenedSpatial.camera.home).toEqual(fitted)
    expect(spatialCameraFromPose(reopenedSpatial.camera.home, SPATIAL_CANONICAL_VIEWPORT).zoom)
      .toBe(SPATIAL_MAX_ZOOM)
  })

  it('fits visible shared layers together with the Spatial world', () => {
    const project = spatialProject()
    const spatial = project.surfaces.find((surface) => surface.id === 'spatial-main')
    if (spatial?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    const distant = structuredClone(project.globalLayerItems[0]!.item)
    distant.frame.x = 5_000
    distant.frame.y = 2_000
    const pose = fitSpatialSurfaceCamera(spatial, 36, [
      ...spatial.world.layerItems,
      distant,
    ])
    const camera = spatialCameraFromPose(pose, SPATIAL_CANONICAL_VIEWPORT)
    const viewport = {
      left: camera.x - camera.viewportWidth / 2 / camera.zoom,
      right: camera.x + camera.viewportWidth / 2 / camera.zoom,
      top: camera.y - camera.viewportHeight / 2 / camera.zoom,
      bottom: camera.y + camera.viewportHeight / 2 / camera.zoom,
    }
    expect(viewport.left).toBeLessThanOrEqual(spatial.world.layerItems[0]!.frame.x)
    expect(viewport.right).toBeGreaterThanOrEqual(distant.frame.x + distant.frame.width)
    expect(viewport.bottom).toBeGreaterThanOrEqual(distant.frame.y + distant.frame.height)
  })

  it('creates an editable bound line and label, then follows endpoint transforms', () => {
    let project = spatialProject()
    const beforeRevision = project.revision
    project = addSpatialRelation(project, 'spatial-main', {
      id: 'relation-ab',
      lineLayerItemId: 'relation-line-ab',
      labelLayerItemId: 'relation-label-ab',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      name: '因果',
      now: NOW,
    })
    expect(project.revision).toBe(beforeRevision + 1)
    let surface = project.surfaces.find((candidate) => candidate.id === 'spatial-main')
    if (surface?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    expect(surface.relations).toEqual([expect.objectContaining({
      id: 'relation-ab',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      lineLayerItemId: 'relation-line-ab',
      labelLayerItemId: 'relation-label-ab',
    })])
    const firstLine = surface.world.layerItems.find((item) => item.layerItemId === 'relation-line-ab')
    expect(firstLine).toMatchObject({
      kind: 'native',
      frame: { x: 200, y: 38, width: 400, height: 4 },
      rotation: 0,
    })

    project = updateLayerItems(project, [{
      surfaceId: 'spatial-main',
      source: 'world',
      layerItemId: 'node-b',
      update: (item) => { item.frame.y += 240 },
    }], NOW)
    surface = project.surfaces.find((candidate) => candidate.id === 'spatial-main')
    if (surface?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    const movedLine = surface.world.layerItems.find((item) => item.layerItemId === 'relation-line-ab')!
    expect(movedLine.rotation).toBeGreaterThan(20)
    expect(movedLine.frame.width).toBeGreaterThan(460)

    project = updateSpatialRelation(project, 'spatial-main', 'relation-ab', (relation) => {
      relation.name = '影响'
    }, NOW)
    surface = project.surfaces.find((candidate) => candidate.id === 'spatial-main')
    if (surface?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    const label = surface.world.layerItems.find((item) => item.layerItemId === 'relation-label-ab')
    expect(label?.kind === 'native' && label.content.nativeType === 'text'
      ? label.content.data.text
      : '').toBe('影响')
    expect(() => courseProjectDocumentSchema.parse(project)).not.toThrow()
  })

  it('manages the ordered teaching path, home camera and reference cleanup', () => {
    let project = spatialProject()
    project = addSpatialRelation(project, 'spatial-main', {
      id: 'relation-ab',
      lineLayerItemId: 'relation-line-ab',
      labelLayerItemId: 'relation-label-ab',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      name: '关系',
      now: NOW,
    })
    project = addSpatialCameraFrame(project, 'spatial-main', { x: 100, y: 80, zoom: 1.5 }, {
      id: 'camera-detail', name: '局部', now: NOW,
    })
    project = addSpatialCameraFrame(project, 'spatial-main', { x: 400, y: 200, zoom: 2 }, {
      id: 'camera-evidence', name: '证据', now: NOW,
    })
    let surface = project.surfaces.find((candidate) => candidate.id === 'spatial-main')
    if (surface?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    const originalFirst = surface.camera.frames[0]!.id
    const evidenceLocation = project.locations.find((location) => (
      location.kind === 'spatial-camera' &&
      location.surfaceId === 'spatial-main' &&
      location.cameraFrameId === 'camera-evidence'
    ))
    if (!evidenceLocation || evidenceLocation.kind !== 'spatial-camera') {
      throw new Error('expected Spatial location')
    }
    project = structuredClone(project)
    project.locations.push({
      ...structuredClone(evidenceLocation),
      id: 'location-spatial-evidence-alternate',
      label: '空间画布 · 证据入口二',
    })
    project = reorderSpatialCameraFrames(project, 'spatial-main', [
      'camera-evidence', originalFirst, 'camera-detail',
    ], NOW)
    expect(project.locations.filter((location) => (
      location.kind === 'spatial-camera' && location.surfaceId === 'spatial-main'
    )).map((location) => location.kind === 'spatial-camera' ? location.cameraFrameId : '')).toEqual([
      'camera-evidence', 'camera-evidence', originalFirst, 'camera-detail',
    ])
    project = renameSpatialCameraFrame(project, 'spatial-main', 'camera-evidence', '结论证据', NOW)
    expect(project.locations.filter((location) => (
      location.kind === 'spatial-camera' &&
      location.surfaceId === 'spatial-main' &&
      location.cameraFrameId === 'camera-evidence'
    )).every((location) => location.label.endsWith('· 结论证据'))).toBe(true)
    project = setSpatialHomeCamera(project, 'spatial-main', { x: 20, y: 30, zoom: 0.8 }, NOW)
    project = deleteSpatialCameraFrame(project, 'spatial-main', 'camera-detail', NOW)
    surface = project.surfaces.find((candidate) => candidate.id === 'spatial-main')
    if (surface?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    expect(surface.camera.home).toEqual({ x: 20, y: 30, zoom: 0.8 })
    expect(surface.camera.frames.map((frame) => [frame.id, frame.name])).toEqual([
      ['camera-evidence', '结论证据'],
      [originalFirst, '总览'],
    ])
    expect(project.locations.some((location) => (
      location.kind === 'spatial-camera' && location.cameraFrameId === 'camera-detail'
    ))).toBe(false)

    project = deleteLayerItem(project, {
      surfaceId: 'spatial-main', source: 'world', layerItemId: 'node-a',
    }, NOW)
    surface = project.surfaces.find((candidate) => candidate.id === 'spatial-main')
    if (surface?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    expect(surface.relations).toEqual([])
    expect(surface.world.layerItems.some((item) => (
      item.layerItemId === 'relation-line-ab' || item.layerItemId === 'relation-label-ab'
    ))).toBe(false)
    expect(() => courseProjectDocumentSchema.parse(project)).not.toThrow()
  })

  it('删除空间节点只修复目标表面，不误删另一表面的同名节点和关系', () => {
    let project = spatialProject()
    project = addSpatialRelation(project, 'spatial-main', {
      id: 'relation-main',
      lineLayerItemId: 'relation-line-main',
      labelLayerItemId: 'relation-label-main',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      name: '主画布关系',
      now: NOW,
    })
    project = addCourseSurface(project, 'spatial-2d', { id: 'spatial-second', now: NOW })
    project = addSpatialTextLayer(project, 'spatial-second', '另一个甲', {
      id: 'node-a', x: 0, y: 0, now: NOW,
    })
    project = addSpatialTextLayer(project, 'spatial-second', '另一个乙', {
      id: 'node-b', x: 360, y: 0, now: NOW,
    })
    project = addSpatialRelation(project, 'spatial-second', {
      id: 'relation-second',
      lineLayerItemId: 'relation-line-second',
      labelLayerItemId: 'relation-label-second',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      name: '第二画布关系',
      now: NOW,
    })

    project = deleteLayerItem(project, {
      surfaceId: 'spatial-main',
      source: 'world',
      layerItemId: 'node-a',
    }, NOW)
    const first = project.surfaces.find((surface) => surface.id === 'spatial-main')
    const second = project.surfaces.find((surface) => surface.id === 'spatial-second')
    if (first?.type !== 'spatial-2d' || second?.type !== 'spatial-2d') {
      throw new Error('expected Spatial surfaces')
    }
    expect(first.relations).toEqual([])
    expect(first.world.layerItems.some((item) => item.layerItemId === 'relation-line-main')).toBe(false)
    expect(second.relations).toEqual([expect.objectContaining({ id: 'relation-second' })])
    expect(second.world.layerItems.map((item) => item.layerItemId)).toEqual(expect.arrayContaining([
      'node-a', 'node-b', 'relation-line-second', 'relation-label-second',
    ]))
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })

  it('does not let a cut silently break an authored spatial relation', () => {
    let project = spatialProject()
    project = addSpatialRelation(project, 'spatial-main', {
      id: 'relation-ab',
      lineLayerItemId: 'relation-line-ab',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      name: '因果联系',
      now: NOW,
    })
    expect(() => cutCourseLayerItems(project, [{
      surfaceId: 'spatial-main',
      source: 'world',
      layerItemId: 'node-a',
    }])).toThrow(/先删除该关系再剪切/)
  })

  it('rejects a relation whose endpoint no longer exists', () => {
    let project = spatialProject()
    project = addSpatialRelation(project, 'spatial-main', {
      id: 'relation-ab',
      lineLayerItemId: 'relation-line-ab',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      name: '关系',
      now: NOW,
    })
    const broken = structuredClone(project)
    const surface = broken.surfaces.find((candidate) => candidate.id === 'spatial-main')
    if (surface?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    surface.relations[0]!.targetLayerItemId = 'missing-node'
    expect(() => courseProjectDocumentSchema.parse(broken)).toThrow(/Spatial relation target is missing/)
  })

  it('records a teacher-authored connection as one undoable history action', () => {
    const project = spatialProject()
    const changed = addSpatialRelation(project, 'spatial-main', {
      id: 'relation-ab',
      lineLayerItemId: 'relation-line-ab',
      labelLayerItemId: 'relation-label-ab',
      sourceLayerItemId: 'node-a',
      targetLayerItemId: 'node-b',
      name: '支持',
      now: NOW,
    })
    const history = commitCourseHistory(createCourseHistory(project), changed)
    expect(history.past).toHaveLength(1)
    expect(history.present.revision).toBe(project.revision + 1)
    expect(undoCourseHistory(history).present).toEqual(project)
  })
})
