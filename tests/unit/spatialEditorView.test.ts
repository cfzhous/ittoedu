import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  addSpatialTextLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  buildSpatialEditorView,
  buildSpatialViewportOverlays,
  spatialLayerAuthoringAddress,
  spatialSemanticZoomHitOrder,
  type DeepReadonly,
} from '@/renderer/course/spatialEditorView'
import type { CourseProjectDocument, NativeLayerItem } from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T00:00:00.000Z'

function spatialFixture(): {
  project: CourseProjectDocument
  locationId: string
  surfaceId: string
  controllerId: string
} {
  let project = createCourseProject({ id: 'course-spatial-view', title: '空间投影', now: NOW })
  project = addCourseSurface(project, 'spatial-2d', {
    id: 'space',
    title: '空间表面',
    now: NOW,
  })
  const surfaceId = 'space'
  const location = project.locations.find(
    (candidate) => candidate.kind === 'spatial-camera' && candidate.surfaceId === surfaceId,
  )
  if (!location || location.kind !== 'spatial-camera') throw new Error('expected Spatial location')
  const locationId = location.id

  project = addSpatialTextLayer(project, surfaceId, '世界文字 A', {
    id: 'world-a',
    x: 100,
    y: 120,
    now: NOW,
  })
  project = addSpatialTextLayer(project, surfaceId, '世界文字 B', {
    id: 'world-b',
    x: 300,
    y: 120,
    now: NOW,
  })
  const controllerId = project.globalLayerItems[0]!.item.layerItemId

  project = updateCourseProject(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    const worldA = surface.world.layerItems.find((item) => item.layerItemId === 'world-a')!
    const worldB = surface.world.layerItems.find((item) => item.layerItemId === 'world-b')!

    draft.globalLayerItems[0]!.item.order = 50
    worldA.order = 20
    worldB.order = 30

    surface.camera.home = { x: 10, y: 20, zoom: 2 }
    surface.camera.frames = [
      { id: 'cam-1', name: '近景', x: 10, y: 20, zoom: 2 },
      { id: 'cam-2', name: '远景', x: -50, y: 40, zoom: 0.5 },
    ]
    const spatialPrint = draft.mixedPrintPlan?.entries.find(
      (entry) => entry.kind === 'spatial-frames' && entry.surfaceId === surfaceId,
    )
    if (spatialPrint && spatialPrint.kind === 'spatial-frames') {
      spatialPrint.cameraFrameIds = ['cam-1', 'cam-2']
    }
    surface.semanticZoom = [{
      id: 'sz-1',
      layerItemIds: ['world-a'],
      minZoom: 0.5,
      maxZoom: 2,
      visible: true,
    }]
    surface.world.bounds = { mode: 'finite', x: -100, y: -80, width: 1200, height: 900 }

    const spatialLocation = draft.locations.find((candidate) => candidate.id === locationId)
    if (!spatialLocation || spatialLocation.kind !== 'spatial-camera') {
      throw new Error('expected Spatial location')
    }
    spatialLocation.cameraFrameId = 'cam-1'

    const hiddenGlobal = structuredClone(worldA)
    hiddenGlobal.layerItemId = 'global-hidden'
    hiddenGlobal.label = '作用域外全局文字'
    hiddenGlobal.order = 10
    draft.globalLayerItems.unshift({
      item: hiddenGlobal,
      visibility: { mode: 'exclude', locationIds: [locationId] },
    })

    const sharedSurface = structuredClone(worldA)
    sharedSurface.layerItemId = 'surface-shared'
    sharedSurface.label = '表面共享文字'
    sharedSurface.order = 25
    surface.surfaceLayerItems.push({
      item: sharedSurface,
      visibility: { mode: 'include', locationIds: [locationId] },
    })
  }, NOW)

  return { project, locationId, surfaceId, controllerId }
}

type ReadonlyTextContent = Extract<
  DeepReadonly<NativeLayerItem>['content'],
  { readonly nativeType: 'text' }
>

function nativeText(item: DeepReadonly<NativeLayerItem>): ReadonlyTextContent['data'] {
  if (item.content.nativeType !== 'text') throw new Error('expected text content')
  return item.content.data
}

describe('Spatial editor read projection', () => {
  it('projects one unified global/surface/world order with camera, semanticZoom and world bounds', () => {
    const fixture = spatialFixture()
    const before = structuredClone(fixture.project)
    const view = buildSpatialEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
    })

    expect(view).toMatchObject({
      projectId: 'course-spatial-view',
      revision: fixture.project.revision,
      locationId: fixture.locationId,
      surfaceId: 'space',
      surfaceTitle: '空间表面',
      activeCameraFrameId: 'cam-1',
    })
    expect(view.camera.home).toEqual({ x: 10, y: 20, zoom: 2 })
    expect(view.camera.frames.map((frame) => ({ ...frame }))).toEqual([
      { id: 'cam-1', name: '近景', x: 10, y: 20, zoom: 2 },
      { id: 'cam-2', name: '远景', x: -50, y: 40, zoom: 0.5 },
    ])
    expect(view.semanticZoom.map((rule) => ({ ...rule, layerItemIds: [...rule.layerItemIds] })))
      .toEqual([{
        id: 'sz-1',
        layerItemIds: ['world-a'],
        minZoom: 0.5,
        maxZoom: 2,
        visible: true,
      }])
    expect(view.worldBounds).toEqual({ mode: 'finite', x: -100, y: -80, width: 1200, height: 900 })
    expect(view.layers.map(({ selectionId, item }) => [selectionId, item.order])).toEqual([
      ['global-hidden', 10],
      ['world-a', 20],
      ['surface-shared', 25],
      ['world-b', 30],
      [fixture.controllerId, 50],
    ])
    expect(view.layers.map(({ source }) => source)).toEqual([
      'global', 'world', 'surface', 'world', 'global',
    ])
    expect(view.layers.every(({ selectionId, item }) => selectionId === item.layerItemId)).toBe(true)
    expect(view.layers.find(({ selectionId }) => selectionId === 'global-hidden')).toMatchObject({
      scopedVisible: false,
      effectiveVisible: false,
    })
    expect(view.layers.find(({ selectionId }) => selectionId === 'surface-shared')).toMatchObject({
      scopedVisible: true,
      effectiveVisible: true,
    })

    const worldLayer = view.layers.find(({ selectionId }) => selectionId === 'world-a')!
    expect(worldLayer).toMatchObject({
      source: 'world',
      scopedVisible: true,
      effectiveVisible: true,
      item: { label: '世界文字 A', frame: { x: 100, y: 120 } },
    })
    if (worldLayer.item.kind !== 'native') throw new Error('expected native layer')
    expect(nativeText(worldLayer.item)).toMatchObject({ text: '世界文字 A' })

    expect(fixture.project).toEqual(before)
    expect(worldLayer.item).not.toBe(
      (fixture.project.surfaces.find((surface) => surface.id === 'space') as {
        world: { layerItems: unknown[] }
      }).world.layerItems[0],
    )
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.layers)).toBe(true)
    expect(Object.isFrozen(worldLayer.item)).toBe(true)
    expect(Object.isFrozen(worldLayer.item.frame)).toBe(true)
    expect(() => {
      ;(view.layers as unknown[]).push({})
    }).toThrow()
  })

  it('rejects unknown locations and non-Spatial locations with teacher-safe messages', () => {
    const fixture = spatialFixture()
    expect(() => buildSpatialEditorView({
      project: fixture.project,
      locationId: 'missing-location',
    })).toThrow('找不到课程位置：missing-location')

    const slideLocation = fixture.project.locations.find((location) => location.kind === 'slide-scene')!
    expect(() => buildSpatialEditorView({
      project: fixture.project,
      locationId: slideLocation.id,
    })).toThrow(`SpatialEditorView 只接受 Spatial 镜头位置：${slideLocation.id}`)

    const mixed = addCourseSurface(fixture.project, 'flow', { id: 'flow', now: NOW })
    const flowLocation = mixed.locations.find((location) => location.kind === 'flow-block')!
    expect(() => buildSpatialEditorView({
      project: mixed,
      locationId: flowLocation.id,
    })).toThrow(`SpatialEditorView 只接受 Spatial 镜头位置：${flowLocation.id}`)
  })

  it('keeps infinite world bounds deterministic from home and world items', () => {
    let project = createCourseProject({ id: 'course-spatial-infinite', title: '无限空间', now: NOW })
    project = addCourseSurface(project, 'spatial-2d', { id: 'space-infinite', now: NOW })
    const location = project.locations.find(
      (candidate) => candidate.kind === 'spatial-camera' && candidate.surfaceId === 'space-infinite',
    )!
    const emptyView = buildSpatialEditorView({ project, locationId: location.id })
    expect(emptyView.worldBounds).toEqual({ x: -1, y: -1, width: 2, height: 2 })

    const withText = addSpatialTextLayer(project, 'space-infinite', '边界文字', {
      id: 'bounds-text',
      x: 100,
      y: 200,
      now: NOW,
    })
    const filledView = buildSpatialEditorView({ project: withText, locationId: location.id })
    expect(filledView.worldBounds).toEqual({ x: 100, y: 200, width: 400, height: 80 })
  })

  it('projects viewport overlays and a deterministic semantic-zoom hit order', () => {
    const fixture = spatialFixture()
    const view = buildSpatialEditorView({
      project: fixture.project,
      locationId: fixture.locationId,
    })
    const overlays = buildSpatialViewportOverlays(view)
    expect(overlays.every((overlay) => overlay.source === 'global' || overlay.source === 'surface')).toBe(true)
    expect(overlays.some((overlay) => overlay.layerItemId === fixture.controllerId)).toBe(true)
    expect(overlays.every((overlay) => overlay.layerItemId !== 'world-a')).toBe(true)

    expect(spatialSemanticZoomHitOrder(view, 1)).toEqual(['world-a', 'world-b'])

    const hidden = updateCourseProject(fixture.project, (draft) => {
      const surface = draft.surfaces.find((candidate) => candidate.id === fixture.surfaceId)
      if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
      surface.semanticZoom.push({
        id: 'sz-hide',
        layerItemIds: ['world-a'],
        minZoom: 0,
        maxZoom: 0.4,
        visible: false,
      })
    }, NOW)
    const hiddenView = buildSpatialEditorView({
      project: hidden,
      locationId: fixture.locationId,
    })
    expect(spatialSemanticZoomHitOrder(hiddenView, 0.25)).toEqual(['world-b'])

    const worldLayer = view.layers.find((layer) => layer.selectionId === 'world-a')!
    const address = spatialLayerAuthoringAddress(view, worldLayer)
    expect(address).toContain('world-a')
    expect(address).toContain('content.text')
  })
})
