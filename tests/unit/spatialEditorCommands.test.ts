import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  createCourseHistory,
  createCourseProject,
  redoCourseHistory,
  undoCourseHistory,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import {
  addSpatialWorldComponentLayer,
  addSpatialWorldFormulaLayer,
  addSpatialWorldImageLayer,
  addSpatialWorldShapeLayer,
  addSpatialWorldTextLayer,
  selectSpatialEditorLayers,
  transformSpatialWorldLayers,
  type SpatialEditorSelection,
} from '@/renderer/course/spatialEditorCommands'
import { buildSpatialEditorView } from '@/renderer/course/spatialEditorView'
import type { CourseProjectDocument, LayerItem } from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T01:00:00.000Z'

function baseProject(): CourseProjectDocument {
  let project = createCourseProject({ id: 'course-spatial-command', now: NOW })
  project = addCourseSurface(project, 'spatial-2d', { id: 'space', now: NOW })
  return project
}

function worldFixture(): {
  project: CourseProjectDocument
  locationId: string
  surfaceId: string
  controllerId: string
} {
  let project = baseProject()
  const surfaceId = 'space'
  const location = project.locations.find(
    (candidate) => candidate.kind === 'spatial-camera' && candidate.surfaceId === surfaceId,
  )
  if (!location || location.kind !== 'spatial-camera') throw new Error('expected Spatial location')
  const locationId = location.id
  let history = createCourseHistory(project)

  history = addSpatialWorldTextLayer(history, surfaceId, '可移动文字', {
    id: 'world-text',
    x: 120,
    y: 140,
    now: NOW,
  })
  history = addSpatialWorldShapeLayer(history, surfaceId, 'rectangle', {
    id: 'world-shape',
    x: 40,
    y: 60,
    now: NOW,
  })

  project = updateCourseProject(history.present, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    const text = surface.world.layerItems.find((item) => item.layerItemId === 'world-text')!
    const shape = surface.world.layerItems.find((item) => item.layerItemId === 'world-shape')!

    draft.globalLayerItems[0]!.item.order = 50
    text.order = 20
    shape.order = 30

    const hiddenGlobal = structuredClone(text)
    hiddenGlobal.layerItemId = 'hidden-global-text'
    hiddenGlobal.order = 10
    draft.globalLayerItems.unshift({
      item: hiddenGlobal,
      visibility: { mode: 'exclude', locationIds: [locationId] },
    })

    const sharedSurface = structuredClone(text)
    sharedSurface.layerItemId = 'surface-text'
    sharedSurface.order = 25
    surface.surfaceLayerItems.push({
      item: sharedSurface,
      visibility: { mode: 'include', locationIds: [locationId] },
    })
  }, NOW)

  return {
    project,
    locationId,
    surfaceId,
    controllerId: project.globalLayerItems[0]!.item.layerItemId,
  }
}

function selection(
  project: CourseProjectDocument,
  locationId: string,
  selectedLayerItemIds: readonly string[],
): SpatialEditorSelection {
  return selectSpatialEditorLayers({ project, locationId, selectedLayerItemIds })
}

function worldItem(
  project: CourseProjectDocument,
  surfaceId: string,
  itemId: string,
): LayerItem {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
  const item = surface.world.layerItems.find((candidate) => candidate.layerItemId === itemId)
  if (!item) throw new Error(`missing item ${itemId}`)
  return item
}

function effectiveTransform(
  project: CourseProjectDocument,
  locationId: string,
  layerItemId: string,
): {
    layerItemId: string
    x: number
    y: number
    width: number
    height: number
    rotation: number
  } {
  const layer = buildSpatialEditorView({ project, locationId }).layers.find(
    (candidate) => candidate.selectionId === layerItemId,
  )
  if (!layer) throw new Error(`missing layer ${layerItemId}`)
  return {
    layerItemId,
    x: layer.item.frame.x,
    y: layer.item.frame.y,
    width: layer.item.frame.width,
    height: layer.item.frame.height,
    rotation: layer.item.rotation,
  }
}

describe('Spatial world layer wrappers', () => {
  it('adds native text, shape, formula, image and component as exactly one history entry each', () => {
    let project = baseProject()
    project = updateCourseProject(project, (draft) => {
      draft.assets['asset-1'] = {
        id: 'asset-1',
        filename: 'pixel.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'assets/pixel.png',
        byteLength: 128,
        width: 640,
        height: 360,
      }
      draft.componentPackages['pkg-1'] = {
        packageId: 'pkg-1',
        version: '1.0.0',
        name: '测试组件',
        manifestPath: 'components/pkg-1/manifest.json',
        runtimePath: 'components/pkg-1/runtime.js',
        contentSha256: 'a'.repeat(64),
      }
    }, NOW)
    const surfaceId = 'space'
    let history = createCourseHistory(project)

    history = addSpatialWorldTextLayer(history, surfaceId, '公式文字', {
      id: 'w-text',
      now: NOW,
    })
    expect(history.present.revision).toBe(project.revision + 1)
    expect(history.past).toEqual([project])
    expect(worldItem(history.present, surfaceId, 'w-text').kind).toBe('native')

    history = addSpatialWorldShapeLayer(history, surfaceId, {
      shapeType: 'ellipse',
      id: 'w-shape',
      now: NOW,
    })
    expect(worldItem(history.present, surfaceId, 'w-shape')).toMatchObject({
      kind: 'native',
      content: { nativeType: 'shape' },
    })
    expect(history.past).toHaveLength(2)

    history = addSpatialWorldFormulaLayer(history, surfaceId, {
      id: 'w-formula',
      now: NOW,
    })
    expect(worldItem(history.present, surfaceId, 'w-formula')).toMatchObject({
      kind: 'native',
      content: { nativeType: 'formula' },
    })
    expect(history.past).toHaveLength(3)

    history = addSpatialWorldImageLayer(history, surfaceId, 'asset-1', {
      id: 'w-image',
      width: 320,
      height: 180,
      x: 10,
      y: 20,
      now: NOW,
    })
    expect(worldItem(history.present, surfaceId, 'w-image')).toMatchObject({
      kind: 'native',
      content: { nativeType: 'image' },
      frame: { x: 10, y: 20, width: 320, height: 180 },
    })
    expect(history.past).toHaveLength(4)

    history = addSpatialWorldComponentLayer(history, {
      surfaceId,
      packageId: 'pkg-1',
      version: '1.0.0',
      label: '世界组件',
      props: { a: 1 },
      id: 'w-component',
      width: 200,
      height: 120,
      x: 30,
      y: 40,
      now: NOW,
    })
    expect(worldItem(history.present, surfaceId, 'w-component')).toMatchObject({
      kind: 'component',
      component: { packageId: 'pkg-1', version: '1.0.0' },
      frame: { x: 30, y: 40, width: 200, height: 120 },
    })
    expect(history.past).toHaveLength(5)
    expect(courseProjectDocumentSchema.parse(history.present).revision).toBe(project.revision + 5)
  })

  it('rejects non-Spatial surfaces before committing history', () => {
    const project = baseProject()
    const history = createCourseHistory(project)
    const slideSurface = project.surfaces.find((surface) => surface.type === 'slide')!
    expect(() => addSpatialWorldTextLayer(history, slideSurface.id, 'x', {},)).toThrow(
      '目标不是 Spatial 表面',
    )
    expect(() => addSpatialWorldShapeLayer(history, slideSurface.id, 'rectangle')).toThrow(
      '目标不是 Spatial 表面',
    )
    expect(history.past).toEqual([])
    expect(history.present).toBe(project)
  })
})

describe('Spatial editor selection and world transform command', () => {
  it('freezes a stable multi-selection with surface id and accepted cross-scope ids', () => {
    const current = worldFixture()
    const worldSelection = selection(current.project, current.locationId, [
      'world-text',
      'world-shape',
    ])
    const globalSelection = selection(current.project, current.locationId, ['hidden-global-text'])

    expect(worldSelection).toEqual({
      locationId: current.locationId,
      surfaceId: 'space',
      selectedLayerItemIds: ['world-text', 'world-shape'],
    })
    expect(globalSelection.selectedLayerItemIds).toEqual(['hidden-global-text'])
    expect(Object.isFrozen(worldSelection)).toBe(true)
    expect(Object.isFrozen(worldSelection.selectedLayerItemIds)).toBe(true)
    expect(() => selection(current.project, current.locationId, ['missing-layer'])).toThrow(
      '所选元素已失效，请重新选择',
    )
    expect(() => selection(current.project, current.locationId, ['world-text', 'world-text'])).toThrow(
      '选择中不能包含重复元素',
    )
  })

  it('commits one world gesture as exactly one revision and history entry, and undo/redo stay schema-valid', () => {
    const current = worldFixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, ['world-text', 'world-shape'])
    const textBefore = effectiveTransform(current.project, current.locationId, 'world-text')
    const shapeBefore = effectiveTransform(current.project, current.locationId, 'world-shape')
    const input = {
      nodes: [
        { ...textBefore, x: textBefore.x + 5, y: textBefore.y - 7, width: textBefore.width + 20 },
        { ...shapeBefore, x: shapeBefore.x + 30, height: shapeBefore.height + 10, rotation: 15 },
      ],
    }
    const beforeHistory = structuredClone(history)
    const beforeSelection = structuredClone(selected)
    const next = transformSpatialWorldLayers(history, selected, input, NOW)

    expect(next.present.revision).toBe(history.present.revision + 1)
    expect(next.past).toEqual([history.present])
    expect(next.future).toEqual([])
    expect(history).toEqual(beforeHistory)
    expect(selected).toEqual(beforeSelection)
    expect(worldItem(next.present, current.surfaceId, 'world-text')).toMatchObject({
      frame: { x: textBefore.x + 5, y: textBefore.y - 7, width: textBefore.width + 20 },
    })
    expect(worldItem(next.present, current.surfaceId, 'world-shape')).toMatchObject({
      frame: { x: shapeBefore.x + 30, height: shapeBefore.height + 10 },
      rotation: 15,
    })
    expect(courseProjectDocumentSchema.parse(next.present).revision).toBe(next.present.revision)

    const undone = undoCourseHistory(next)
    const redone = redoCourseHistory(undone)
    expect(courseProjectDocumentSchema.parse(undone.present).revision).toBe(undone.present.revision)
    expect(courseProjectDocumentSchema.parse(redone.present).revision).toBe(redone.present.revision)
    expect(worldItem(undone.present, current.surfaceId, 'world-text').frame)
      .toEqual(worldItem(history.present, current.surfaceId, 'world-text').frame)
    expect(worldItem(redone.present, current.surfaceId, 'world-shape').rotation).toBe(15)
  })

  it('keeps no-op input out of history and rejects unsafe transforms atomically', () => {
    const current = worldFixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, ['world-text'])
    const unchanged = effectiveTransform(current.project, current.locationId, 'world-text')
    expect(transformSpatialWorldLayers(history, selected, { nodes: [unchanged] }, NOW))
      .toBe(history)

    expect(() => transformSpatialWorldLayers(history, selected, {
      nodes: [{ ...unchanged, width: 0 }],
    }, NOW)).toThrow('元素宽高必须大于零')
    expect(() => transformSpatialWorldLayers(history, selected, {
      nodes: [{ ...unchanged, x: Number.NaN }],
    }, NOW)).toThrow('元素位置和尺寸必须是有效数字')
    expect(() => transformSpatialWorldLayers(history, selected, {
      nodes: [{ ...unchanged, rotation: 36_001 }],
    }, NOW)).toThrow('元素旋转角度超出允许范围')
    expect(() => transformSpatialWorldLayers(history, selected, {
      nodes: [unchanged, unchanged],
    }, NOW)).toThrow('一次变换不能包含重复元素')

    const surfaceSelected = selection(current.project, current.locationId, ['surface-text'])
    const surfaceTransform = effectiveTransform(current.project, current.locationId, 'surface-text')
    expect(() => transformSpatialWorldLayers(history, surfaceSelected, {
      nodes: [{ ...surfaceTransform, x: surfaceTransform.x + 1 }],
    }, NOW)).toThrow('当前选择不属于当前空间世界')

    const locked = updateCourseProject(current.project, (draft) => {
      const surface = draft.surfaces.find((candidate) => candidate.id === current.surfaceId)
      if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
      surface.world.layerItems.find(
        (item) => item.layerItemId === 'world-text',
      )!.locked = true
    }, NOW)
    const lockedSelection = selection(locked, current.locationId, ['world-text'])
    const lockedTransform = effectiveTransform(locked, current.locationId, 'world-text')
    expect(() => transformSpatialWorldLayers(
      createCourseHistory(locked),
      lockedSelection,
      { nodes: [{ ...lockedTransform, x: lockedTransform.x + 1 }] },
      NOW,
    )).toThrow('当前元素已锁定')

    const invisible = updateCourseProject(current.project, (draft) => {
      const surface = draft.surfaces.find((candidate) => candidate.id === current.surfaceId)
      if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
      surface.world.layerItems.find(
        (item) => item.layerItemId === 'world-text',
      )!.visible = false
    }, NOW)
    const invisibleSelection = selection(invisible, current.locationId, ['world-text'])
    const invisibleTransform = effectiveTransform(invisible, current.locationId, 'world-text')
    expect(() => transformSpatialWorldLayers(
      createCourseHistory(invisible),
      invisibleSelection,
      { nodes: [{ ...invisibleTransform, x: invisibleTransform.x + 1 }] },
      NOW,
    )).toThrow('当前元素不可见')

    const stale = Object.freeze({
      locationId: current.locationId,
      surfaceId: current.surfaceId,
      selectedLayerItemIds: Object.freeze(['stale-layer']),
    }) as SpatialEditorSelection
    expect(() => transformSpatialWorldLayers(history, stale, {
      nodes: [{ ...unchanged, layerItemId: 'stale-layer' }],
    }, NOW)).toThrow('所选元素已失效，请重新选择')
    expect(history.past).toEqual([])
    expect(history.present).toBe(current.project)
  })

  it('accepts layers alias for one completed gesture and never writes session camera to history', () => {
    const current = worldFixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, ['world-text'])
    const before = effectiveTransform(current.project, current.locationId, 'world-text')
    const next = transformSpatialWorldLayers(history, selected, {
      layers: [{ ...before, x: before.x + 11 }],
    }, NOW)

    expect(next.present.revision).toBe(history.present.revision + 1)
    expect(worldItem(next.present, current.surfaceId, 'world-text').frame.x).toBe(before.x + 11)
    const surfaceAfter = next.present.surfaces.find((candidate) => candidate.id === current.surfaceId)
    if (!surfaceAfter || surfaceAfter.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    const surfaceBefore = current.project.surfaces.find((candidate) => candidate.id === current.surfaceId)
    if (!surfaceBefore || surfaceBefore.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    expect(surfaceAfter.camera).toEqual(surfaceBefore.camera)
    expect(next.past).toEqual([history.present])
  })
})
