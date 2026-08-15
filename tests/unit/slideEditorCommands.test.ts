import { describe, expect, it } from 'vitest'
import {
  addNativeVisualLayer,
  addSlideTextLayer,
  createCourseHistory,
  createCourseProject,
  redoCourseHistory,
  undoCourseHistory,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  selectSlideEditorLayers,
  transformSelectedSlideNativeLayers,
  type SlideEditorSelection,
  type SlideEditorTransformInput,
} from '@/renderer/course/slideEditorCommands'
import { buildSlideEditorView } from '@/renderer/course/slideEditorView'
import type { CourseProjectDocument, LayerItem } from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T01:00:00.000Z'

function fixture(): {
  project: CourseProjectDocument
  locationId: string
  surfaceId: string
  sceneId: string
  controllerId: string
} {
  let project = createCourseProject({ id: 'course-slide-command', now: NOW })
  const surface = project.surfaces[0]
  if (surface?.type !== 'slide') throw new Error('expected initial Slide surface')
  const sceneId = surface.scenes[0]!.id
  const locationId = project.startLocationId
  project = addSlideTextLayer(project, surface.id, sceneId, '可移动文字', {
    id: 'scene-text', now: NOW,
  })
  project = addNativeVisualLayer(project, {
    surfaceId: surface.id,
    sceneId,
    nativeType: 'shape',
    id: 'scene-shape',
    x: 40,
    y: 60,
    now: NOW,
  })
  project = updateCourseProject(project, (draft) => {
    const slide = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
    const scene = slide.scenes.find((candidate) => candidate.id === sceneId)!
    const text = scene.layerItems.find((candidate) => candidate.layerItemId === 'scene-text')!
    const state = scene.presentation!.states[0]!
    state.layerItemOverrides['scene-text'] = {
      label: '命名状态文字',
      frame: { x: 320, width: 555 },
    }
    const hiddenGlobal = structuredClone(text)
    hiddenGlobal.layerItemId = 'hidden-global-text'
    hiddenGlobal.order = 4
    draft.globalLayerItems.push({
      item: hiddenGlobal,
      visibility: { mode: 'exclude', locationIds: [locationId] },
    })
    const sharedSurface = structuredClone(text)
    sharedSurface.layerItemId = 'surface-text'
    sharedSurface.order = 5
    slide.surfaceLayerItems.push({
      item: sharedSurface,
      visibility: { mode: 'include', locationIds: [locationId] },
    })
    const location = draft.locations.find((candidate) => candidate.id === locationId)
    if (!location || location.kind !== 'slide-scene') throw new Error('expected Slide location')
    location.stateId = state.id
  }, NOW)
  return {
    project,
    locationId,
    surfaceId: surface.id,
    sceneId,
    controllerId: project.globalLayerItems[0]!.item.layerItemId,
  }
}

function selection(
  project: CourseProjectDocument,
  locationId: string,
  selectionIds: readonly string[],
  stateId: string | null | undefined = null,
): SlideEditorSelection {
  return selectSlideEditorLayers({ project, locationId, stateId, selectionIds })
}

function sceneItem(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  itemId: string,
): LayerItem {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
  const item = surface.scenes.find((candidate) => candidate.id === sceneId)?.layerItems.find(
    (candidate) => candidate.layerItemId === itemId,
  )
  if (!item) throw new Error(`missing item ${itemId}`)
  return item
}

function effectiveTransform(
  project: CourseProjectDocument,
  locationId: string,
  stateId: string | null,
  nodeId: string,
): SlideEditorTransformInput['nodes'][number] {
  const layer = buildSlideEditorView({ project, locationId, stateId }).layers.find(
    (candidate) => candidate.selectionId === nodeId,
  )
  if (!layer) throw new Error(`missing layer ${nodeId}`)
  return {
    nodeId,
    x: layer.item.frame.x,
    y: layer.item.frame.y,
    width: layer.item.frame.width,
    height: layer.item.frame.height,
    rotation: layer.item.rotation,
  }
}

describe('Slide editor Native selection and transform command', () => {
  it('freezes a stable multi-selection while retaining location state and unfiltered layers', () => {
    const current = fixture()
    const followed = selectSlideEditorLayers({
      project: current.project,
      locationId: current.locationId,
      stateId: undefined,
      selectionIds: ['hidden-global-text'],
    })
    const base = selection(current.project, current.locationId, ['scene-text', 'scene-shape'])
    const cleared = selection(current.project, current.locationId, [])

    expect(followed).toEqual({
      locationId: current.locationId,
      stateId: 'state_initial',
      selectionIds: ['hidden-global-text'],
    })
    expect(base).toEqual({
      locationId: current.locationId,
      stateId: null,
      selectionIds: ['scene-text', 'scene-shape'],
    })
    expect(cleared.selectionIds).toEqual([])
    expect(Object.isFrozen(followed)).toBe(true)
    expect(Object.isFrozen(followed.selectionIds)).toBe(true)
    expect(() => selection(current.project, current.locationId, ['missing-layer'])).toThrow(
      '所选元素已失效，请重新选择',
    )
    expect(() => selection(current.project, current.locationId, ['scene-text', 'scene-text'])).toThrow(
      '选择中不能包含重复元素',
    )
  })

  it('commits a base-scene multi-transform as exactly one revision and history entry', () => {
    const current = fixture()
    const history = createCourseHistory(current.project)
    const selected = selection(
      current.project,
      current.locationId,
      ['scene-text', 'scene-shape'],
    )
    const textBefore = effectiveTransform(current.project, current.locationId, null, 'scene-text')
    const shapeBefore = effectiveTransform(current.project, current.locationId, null, 'scene-shape')
    const input = {
      nodes: [
        { ...textBefore, x: textBefore.x + 5, y: textBefore.y - 7, width: textBefore.width + 20 },
        { ...shapeBefore, x: shapeBefore.x + 30, height: shapeBefore.height + 10, rotation: 15 },
      ],
    }
    const beforeHistory = structuredClone(history)
    const beforeSelection = structuredClone(selected)
    const next = transformSelectedSlideNativeLayers(history, selected, input, NOW)

    expect(next.present.revision).toBe(history.present.revision + 1)
    expect(next.past).toEqual([history.present])
    expect(next.future).toEqual([])
    expect(history).toEqual(beforeHistory)
    expect(selected).toEqual(beforeSelection)
    expect(sceneItem(next.present, current.surfaceId, current.sceneId, 'scene-text')).toMatchObject({
      frame: { x: textBefore.x + 5, y: textBefore.y - 7, width: textBefore.width + 20 },
    })
    expect(sceneItem(next.present, current.surfaceId, current.sceneId, 'scene-shape')).toMatchObject({
      frame: { x: shapeBefore.x + 30, height: shapeBefore.height + 10 },
      rotation: 15,
    })

    const undone = undoCourseHistory(next)
    const redone = redoCourseHistory(undone)
    expect(sceneItem(undone.present, current.surfaceId, current.sceneId, 'scene-text').frame)
      .toEqual(sceneItem(history.present, current.surfaceId, current.sceneId, 'scene-text').frame)
    expect(sceneItem(redone.present, current.surfaceId, current.sceneId, 'scene-shape').rotation).toBe(15)
    expect(selection(undone.present, current.locationId, selected.selectionIds).selectionIds)
      .toEqual(selected.selectionIds)
  })

  it('writes sparse named-state frame/rotation overrides and leaves the base unchanged', () => {
    const current = fixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, ['scene-text'], 'state_initial')
    const effective = effectiveTransform(
      current.project,
      current.locationId,
      'state_initial',
      'scene-text',
    )
    const next = transformSelectedSlideNativeLayers(history, selected, {
      nodes: [{ ...effective, x: 330, y: 100, rotation: 12 }],
    }, NOW)
    const base = sceneItem(next.present, current.surfaceId, current.sceneId, 'scene-text')
    const surface = next.present.surfaces.find((candidate) => candidate.id === current.surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
    const override = surface.scenes[0]!.presentation!.states[0]!
      .layerItemOverrides['scene-text']!

    expect(base.frame).toMatchObject({ x: 120, y: 120 })
    expect(base.rotation).toBe(0)
    expect(override).toEqual({
      label: '命名状态文字',
      frame: { x: 330, y: 100, width: 555 },
      rotation: 12,
    })

    const restored = transformSelectedSlideNativeLayers(next, selected, {
      nodes: [{
        nodeId: 'scene-text',
        x: base.frame.x,
        y: base.frame.y,
        width: base.frame.width,
        height: base.frame.height,
        rotation: base.rotation,
      }],
    }, NOW)
    const restoredSurface = restored.present.surfaces.find(
      (candidate) => candidate.id === current.surfaceId,
    )
    if (!restoredSurface || restoredSurface.type !== 'slide') throw new Error('expected Slide surface')
    expect(restoredSurface.scenes[0]!.presentation!.states[0]!
      .layerItemOverrides['scene-text']).toEqual({ label: '命名状态文字' })
  })

  it('keeps no-op input out of history and rejects unsafe transforms atomically', () => {
    const current = fixture()
    const history = createCourseHistory(current.project)
    const selected = selection(current.project, current.locationId, ['scene-text'])
    const unchanged = effectiveTransform(current.project, current.locationId, null, 'scene-text')
    expect(transformSelectedSlideNativeLayers(history, selected, { nodes: [unchanged] }, NOW))
      .toBe(history)

    expect(() => transformSelectedSlideNativeLayers(history, selected, {
      nodes: [{ ...unchanged, width: 0 }],
    }, NOW)).toThrow('元素宽高必须大于零')
    expect(() => transformSelectedSlideNativeLayers(history, selected, {
      nodes: [{ ...unchanged, x: Number.NaN }],
    }, NOW)).toThrow('元素位置和尺寸必须是有效数字')
    expect(() => transformSelectedSlideNativeLayers(history, selected, {
      nodes: [unchanged, unchanged],
    }, NOW)).toThrow('一次变换不能包含重复元素')

    const surfaceSelected = selection(current.project, current.locationId, ['surface-text'])
    const surfaceTransform = effectiveTransform(current.project, current.locationId, null, 'surface-text')
    expect(() => transformSelectedSlideNativeLayers(history, surfaceSelected, {
      nodes: [{ ...surfaceTransform, x: surfaceTransform.x + 1 }],
    }, NOW)).toThrow('当前选择不属于当前幻灯片')

    const locked = updateCourseProject(current.project, (draft) => {
      const slide = draft.surfaces.find((candidate) => candidate.id === current.surfaceId)
      if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
      slide.scenes[0]!.layerItems.find(
        (item) => item.layerItemId === 'scene-text',
      )!.locked = true
    }, NOW)
    const lockedSelection = selection(locked, current.locationId, ['scene-text'])
    const lockedTransform = effectiveTransform(locked, current.locationId, null, 'scene-text')
    expect(() => transformSelectedSlideNativeLayers(
      createCourseHistory(locked),
      lockedSelection,
      { nodes: [{ ...lockedTransform, x: lockedTransform.x + 1 }] },
      NOW,
    )).toThrow('当前元素已锁定')

    const stale = Object.freeze({
      locationId: current.locationId,
      stateId: null,
      selectionIds: Object.freeze(['stale-layer']),
    }) as SlideEditorSelection
    expect(() => transformSelectedSlideNativeLayers(history, stale, {
      nodes: [{ ...unchanged, nodeId: 'stale-layer' }],
    }, NOW)).toThrow('所选元素已失效，请重新选择')
    expect(history.past).toEqual([])
    expect(history.present).toBe(current.project)
  })
})
