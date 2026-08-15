import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import {
  addNativeVisualLayer,
  addSlideTextLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { buildSlideEditorView } from '@/renderer/course/slideEditorView'
import {
  addV9SlideFormulaLayer,
  addV9SlidePresentationState,
  addV9SlideShapeLayer,
  addV9SlideTextLayer,
  activateV9SlidePresentationState,
  deleteV9SlideLayer,
  duplicateV9SlideLayer,
  nudgeV9SlideSelection,
  openV9SlideVerticalSliceState,
  reorderV9SlideLayers,
  selectV9SlideVerticalSlice,
  updateV9SlideLayer,
} from '@/renderer/course/v9SlideVerticalSlice'

const NOW = '2026-08-15T08:00:00.000Z'

function createLayerSession() {
  let project = createCourseProject({ id: 'v9-layer-session', now: NOW })
  const surface = project.surfaces[0]
  if (!surface || surface.type !== 'slide') throw new Error('expected slide')
  const sceneId = surface.scenes[0]!.id
  project = addSlideTextLayer(project, surface.id, sceneId, '第一层', {
    id: 'layer-text-a',
    now: NOW,
  })
  project = addNativeVisualLayer(project, {
    surfaceId: surface.id,
    sceneId,
    nativeType: 'shape',
    shapeType: 'rectangle',
    id: 'layer-shape-b',
    now: NOW,
  })
  return openV9SlideVerticalSliceState({
    project,
    assetFiles: {},
    componentFiles: {},
  }, null)
}

function sceneFor(state: ReturnType<typeof createLayerSession>) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected slide location')
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('expected slide')
  return surface.scenes.find((candidate) => candidate.id === location.sceneId)!
}

describe('V9 Slide native layer session commands', () => {
  it('adds text, formula and the requested shape with one history entry each', () => {
    const initial = createLayerSession()
    const text = addV9SlideTextLayer(initial, 180, 160, NOW)
    const formula = addV9SlideFormulaLayer(text, 240, 220, NOW)
    const shape = addV9SlideShapeLayer(formula, 'diamond', 300, 280, NOW)

    expect(shape.history.present.revision - initial.history.present.revision).toBe(3)
    expect(shape.history.past.length - initial.history.past.length).toBe(3)
    expect(shape.selection.selectionIds).toHaveLength(1)
    const selectedId = shape.selection.selectionIds[0]!
    expect(sceneFor(shape).layerItems.find((item) => item.layerItemId === selectedId)).toMatchObject({
      frame: { x: 300, y: 280 },
      kind: 'native',
      content: { nativeType: 'shape', data: { shapeType: 'diamond' } },
    })
    expect(courseProjectDocumentSchema.safeParse(shape.history.present).success).toBe(true)
  })

  it('keeps hidden and locked rows selectable while refusing their canvas nudge', () => {
    const initial = createLayerSession()
    const updated = updateV9SlideLayer(initial, 'layer-text-a', {
      label: '隐藏且锁定',
      visible: false,
      locked: true,
    }, NOW)
    const selected = selectV9SlideVerticalSlice(updated, {
      nodeIds: ['layer-text-a'],
      additive: false,
    })
    const nudged = nudgeV9SlideSelection(selected, 10, 10, NOW)

    expect(selected.selection.selectionIds).toEqual(['layer-text-a'])
    expect(nudged).toBe(selected)
    expect(sceneFor(updated).layerItems.find((item) => item.layerItemId === 'layer-text-a'))
      .toMatchObject({ label: '隐藏且锁定', visible: false, locked: true })
  })

  it('writes named-state insertion and row edits as sparse overrides only', () => {
    const initial = createLayerSession()
    const named = addV9SlidePresentationState(initial, '讲解态', NOW)
    const inserted = addV9SlideShapeLayer(named, 'ellipse', 360, 260, NOW)
    const itemId = inserted.selection.selectionIds[0]!
    const updated = updateV9SlideLayer(inserted, itemId, {
      label: '状态圆形',
      locked: true,
    }, NOW)
    const scene = sceneFor(updated)
    const base = scene.layerItems.find((item) => item.layerItemId === itemId)!
    const override = scene.presentation?.states.find(
      (state) => state.id === updated.selection.stateId,
    )?.layerItemOverrides[itemId]

    expect(base).toMatchObject({ visible: false, locked: false })
    expect(override).toMatchObject({ visible: true, label: '状态圆形', locked: true })
    expect(courseProjectDocumentSchema.safeParse(updated.history.present).success).toBe(true)
  })

  it('duplicates and reorders base layers atomically', () => {
    const initial = createLayerSession()
    const duplicated = duplicateV9SlideLayer(initial, 'layer-text-a', NOW)
    const duplicateId = duplicated.selection.selectionIds[0]!
    const beforeOrder = sceneFor(duplicated).layerItems.map((item) => item.layerItemId)
    const reordered = reorderV9SlideLayers(
      duplicated,
      [...beforeOrder].reverse(),
      NOW,
    )

    expect(duplicateId).not.toBe('layer-text-a')
    expect(sceneFor(duplicated).layerItems.find((item) => item.layerItemId === duplicateId))
      .toMatchObject({ label: '第一层 副本', locked: false })
    const controllerOrder = duplicated.history.present.globalLayerItems.find(
      (entry) => entry.item.kind === 'native' &&
        entry.item.content.nativeType === 'teacher-controller',
    )?.item.order
    const duplicateOrder = sceneFor(duplicated).layerItems.find(
      (item) => item.layerItemId === duplicateId,
    )?.order
    expect(controllerOrder).toBeGreaterThan(duplicateOrder ?? Number.POSITIVE_INFINITY)
    expect(reordered.history.present.revision - initial.history.present.revision).toBe(2)
    expect(reordered.history.past.length - initial.history.past.length).toBe(2)
    expect(sceneFor(reordered).layerItems.map((item) => item.layerItemId))
      .toEqual([...beforeOrder].reverse())
  })

  it('makes named-state layerItemOrder the only ordering override', () => {
    const initial = createLayerSession()
    const named = addV9SlidePresentationState(initial, '排序态', NOW)
    const stateId = named.selection.stateId!
    const withLegacyOrder = updateCourseProject(named.history.present, (draft) => {
      const surface = draft.surfaces[0]
      if (!surface || surface.type !== 'slide') throw new Error('expected slide')
      const state = surface.scenes[0]!.presentation!.states.find(
        (candidate) => candidate.id === stateId,
      )!
      state.layerItemOverrides['layer-text-a'] = { order: 10_000 }
    }, NOW)
    const opened = openV9SlideVerticalSliceState({
      project: withLegacyOrder,
      assetFiles: {},
      componentFiles: {},
    }, null)
    const active = activateV9SlidePresentationState(opened, stateId)
    const reordered = reorderV9SlideLayers(
      active,
      ['layer-text-a', 'layer-shape-b'],
      NOW,
    )
    const presentationState = sceneFor(reordered).presentation!.states.find(
      (candidate) => candidate.id === stateId,
    )!
    const view = buildSlideEditorView({
      project: reordered.history.present,
      locationId: reordered.selection.locationId,
      stateId,
    })

    expect(presentationState.layerItemOverrides['layer-text-a']?.order).toBeUndefined()
    expect(presentationState.layerItemOrder).toBeUndefined()
    expect(view.layers.filter((layer) => layer.source === 'scene').map((layer) => layer.selectionId))
      .toEqual(['layer-text-a', 'layer-shape-b'])
  })

  it('deletes base references and dependent completion rules in one valid revision', () => {
    const opened = createLayerSession()
    const project = updateCourseProject(opened.history.present, (draft) => {
      const surface = draft.surfaces[0]
      if (!surface || surface.type !== 'slide') throw new Error('expected slide')
      const scene = surface.scenes[0]!
      scene.presentation!.states[0]!.layerItemOverrides['layer-text-a'] = { visible: true }
      scene.presentation!.states[0]!.layerItemOrder = ['layer-shape-b', 'layer-text-a']
      scene.interactions = [{
        id: 'rule-click-text',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'layer-text-a' },
        conditions: [],
        actions: [{
          id: 'action-enter-text',
          start: 'after-previous',
          delayMs: 0,
          action: {
            type: 'node.enter',
            nodeId: 'layer-text-a',
            effect: 'fade',
            durationMs: 200,
            easing: 'ease-out',
          },
        }],
      }, {
        id: 'rule-after-enter',
        enabled: true,
        trigger: { type: 'animation.completed', actionId: 'action-enter-text' },
        conditions: [],
        actions: [{
          id: 'action-next',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.next' },
        }],
      }]
    }, NOW)
    const state = openV9SlideVerticalSliceState({
      project,
      assetFiles: {},
      componentFiles: {},
    }, null)
    const deleted = deleteV9SlideLayer(state, 'layer-text-a', NOW)
    const scene = sceneFor(deleted)

    expect(scene.layerItems.some((item) => item.layerItemId === 'layer-text-a')).toBe(false)
    expect(scene.presentation?.states[0]!.layerItemOverrides['layer-text-a']).toBeUndefined()
    expect(scene.presentation?.states[0]!.layerItemOrder).toEqual(['layer-shape-b'])
    expect(scene.interactions).toEqual([])
    expect(deleted.history.present.revision).toBe(state.history.present.revision + 1)
    expect(courseProjectDocumentSchema.safeParse(deleted.history.present).success).toBe(true)
  })

  it('keeps base content when delete is invoked in a named state', () => {
    const initial = createLayerSession()
    const named = addV9SlidePresentationState(initial, '隐藏态', NOW)
    const selected = selectV9SlideVerticalSlice(named, {
      nodeIds: ['layer-text-a'],
      additive: false,
    })
    const deleted = deleteV9SlideLayer(selected, 'layer-text-a', NOW)
    const scene = sceneFor(deleted)
    const view = buildSlideEditorView({
      project: deleted.history.present,
      locationId: deleted.selection.locationId,
      stateId: deleted.selection.stateId,
    })

    expect(scene.layerItems.some((item) => item.layerItemId === 'layer-text-a')).toBe(true)
    expect(view.layers.find((layer) => layer.selectionId === 'layer-text-a')?.item.visible)
      .toBe(false)
    expect(deleted.selection.selectionIds).toEqual([])
  })
})
