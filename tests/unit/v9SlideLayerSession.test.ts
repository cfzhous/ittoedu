import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import {
  addNativeVisualLayer,
  addSlideTextLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { createCourseProjectArchive, openCourseProjectArchive } from '@/renderer/project/courseProjectArchive'
import { buildSlideEditorView } from '@/renderer/course/slideEditorView'
import {
  addV9SlideFormulaLayer,
  addV9SlidePresentationState,
  addV9SlideShapeLayer,
  addV9SlideTextLayer,
  activateV9SlidePresentationState,
  buildV9SlideWorkspaceSnapshot,
  captureCourseGlobalControllerTarget,
  clearV9SlideNativeNodeOverride,
  deleteV9SlideLayer,
  duplicateV9SlideLayer,
  isV9SlideVerticalSliceDirty,
  nudgeV9SlideSelection,
  openV9SlideVerticalSliceState,
  reorderV9SlideLayers,
  selectCourseGlobalController,
  selectV9SlideVerticalSlice,
  transformCourseGlobalController,
  transformV9SlideVerticalSlice,
  undoV9SlideVerticalSlice,
  updateV9SlideLayer,
  updateV9SlideNativeNode,
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
  it('moves the scene-canvas global-controller proxy through one global revision only', () => {
    const initial = createLayerSession()
    const snapshot = buildV9SlideWorkspaceSnapshot(initial)
    const controller = snapshot.document.nodes.find((node) => node.type === 'teacher-controller')
    if (!controller) throw new Error('expected scene-canvas controller proxy')
    const target = captureCourseGlobalControllerTarget(initial)
    if (!target) throw new Error('expected global controller target')
    const sceneItemsBefore = structuredClone(sceneFor(initial).layerItems)

    expect(snapshot.authoringTargets.get(controller.id)).toEqual({
      source: 'global',
      layerItemId: target.layerItemId,
    })
    const selected = selectCourseGlobalController(initial, target)
    const moved = transformCourseGlobalController(selected, target, {
      x: controller.x + 36,
      y: controller.y + 18,
      width: controller.width,
      height: controller.height,
      rotation: controller.rotation,
    }, NOW)

    expect(selected.editingScope).toBe(initial.editingScope)
    expect(selected.selection.globalController).toEqual({
      source: 'global',
      layerItemId: target.layerItemId,
    })
    expect(moved.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(moved.history.past).toEqual([initial.history.present])
    expect(sceneFor(moved).layerItems).toEqual(sceneItemsBefore)
    expect(moved.history.present.globalLayerItems.find(
      (entry) => entry.item.layerItemId === target.layerItemId,
    )?.item.frame).toMatchObject({
      x: controller.x + 36,
      y: controller.y + 18,
    })
    expect(undoV9SlideVerticalSlice(moved).history.present.globalLayerItems.find(
      (entry) => entry.item.layerItemId === target.layerItemId,
    )?.item.frame).toMatchObject({
      x: controller.x,
      y: controller.y,
    })
  })

  it('keeps an exact named-state transform as the same state with zero history', () => {
    const named = addV9SlidePresentationState(createLayerSession(), '反馈态', NOW)
    const selected = selectV9SlideVerticalSlice(named, {
      nodeIds: ['layer-text-a'],
      additive: false,
    })
    const layer = buildSlideEditorView({
      project: selected.history.present,
      locationId: selected.selection.locationId,
      stateId: selected.selection.stateId,
    }).layers.find((candidate) => candidate.selectionId === 'layer-text-a')!
    const result = transformV9SlideVerticalSlice(selected, {
      nodes: [{
        nodeId: layer.selectionId,
        x: layer.item.frame.x,
        y: layer.item.frame.y,
        width: layer.item.frame.width,
        height: layer.item.frame.height,
        rotation: layer.item.rotation,
      }],
    }, NOW)

    expect(result).toBe(selected)
    expect(result.history).toBe(selected.history)
    expect(result.history.past).toBe(selected.history.past)
  })

  it('adds text, formula and the requested shape with one history entry each', () => {
    const initial = createLayerSession()
    const text = addV9SlideTextLayer(initial, 180, 160, NOW)
    const textId = text.selection.selectionIds[0]!
    const formula = addV9SlideFormulaLayer(text, 240, 220, NOW)
    const shape = addV9SlideShapeLayer(formula, 'diamond', 300, 280, NOW)

    expect(sceneFor(text).layerItems.find((item) => item.layerItemId === textId)).toMatchObject({
      label: '文本',
      frame: { x: 180, y: 160 },
      kind: 'native',
      content: { nativeType: 'text', data: { text: '双击编辑文字' } },
    })
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

  it('uses the native 1280 by 720 centered text default when no position is supplied', () => {
    const initial = createLayerSession()
    const next = addV9SlideTextLayer(initial, undefined, undefined, NOW)
    const textId = next.selection.selectionIds[0]!

    expect(sceneFor(next).layerItems.find((item) => item.layerItemId === textId)).toMatchObject({
      label: '文本',
      frame: { x: 440, y: 320, width: 400, height: 80 },
      kind: 'native',
      content: { nativeType: 'text', data: { text: '双击编辑文字' } },
    })
    expect(courseProjectDocumentSchema.safeParse(next.history.present).success).toBe(true)
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

  it('updates common and type-specific properties in one base revision', () => {
    const initial = createLayerSession()
    const text = updateV9SlideNativeNode(initial, 'layer-text-a', {
      x: 196,
      opacity: 0.65,
      style: { color: '#2563eb', fontSize: 52 },
    }, NOW)
    const shape = updateV9SlideNativeNode(text, 'layer-shape-b', {
      shapeType: 'diamond',
      style: { fillColor: '#f59e0b', borderWidth: 5 },
    }, NOW)
    const view = buildSlideEditorView({
      project: shape.history.present,
      locationId: shape.selection.locationId,
      stateId: null,
    })
    const textItem = view.layers.find((layer) => layer.selectionId === 'layer-text-a')?.item
    const shapeItem = view.layers.find((layer) => layer.selectionId === 'layer-shape-b')?.item

    expect(text.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(text.history.past.length).toBe(initial.history.past.length + 1)
    expect(textItem).toMatchObject({
      frame: { x: 196 },
      opacity: 0.65,
      content: { data: { style: { color: '#2563eb', fontSize: 52 } } },
    })
    expect(shapeItem).toMatchObject({
      content: {
        data: {
          shapeType: 'diamond',
          style: { fillColor: '#f59e0b', borderWidth: 5 },
        },
      },
    })
    expect(shape.history.present.revision).toBe(initial.history.present.revision + 2)
    expect(courseProjectDocumentSchema.safeParse(shape.history.present).success).toBe(true)
  })

  it('commits one canvas text session as exactly one history entry with runs preserved', () => {
    const initial = createLayerSession()
    const runs = [
      { start: 0, end: 2, style: { bold: true } },
      { start: 5, end: 7, style: { color: '#dc2626' } },
    ]
    const updated = updateV9SlideNativeNode(initial, 'layer-text-a', {
      text: 'V9 富文本内容',
      runs,
    }, NOW)
    const view = buildSlideEditorView({
      project: updated.history.present,
      locationId: updated.selection.locationId,
      stateId: updated.selection.stateId,
    })
    const item = view.layers.find((layer) => layer.selectionId === 'layer-text-a')?.item

    expect(updated.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(updated.history.past.length).toBe(initial.history.past.length + 1)
    expect(item).toMatchObject({
      content: { data: { text: 'V9 富文本内容', runs } },
    })
    expect(courseProjectDocumentSchema.safeParse(updated.history.present).success).toBe(true)
  })

  it('stores a named-state text+runs commit as one sparse override and one revision', () => {
    const named = addV9SlidePresentationState(createLayerSession(), '文字态', NOW)
    const runs = [{ start: 0, end: 3, style: { underline: true } }]
    const updated = updateV9SlideNativeNode(named, 'layer-text-a', {
      text: '状态文字',
      runs,
    }, NOW)
    const scene = sceneFor(updated)
    const override = scene.presentation?.states.find(
      (state) => state.id === updated.selection.stateId,
    )?.layerItemOverrides['layer-text-a']
    const view = buildSlideEditorView({
      project: updated.history.present,
      locationId: updated.selection.locationId,
      stateId: updated.selection.stateId,
    })
    const effective = view.layers.find(
      (layer) => layer.selectionId === 'layer-text-a',
    )?.item

    expect(override).toEqual({
      nativeData: { text: '状态文字', runs },
    })
    expect(effective).toMatchObject({
      content: { data: { text: '状态文字', runs } },
    })
    expect(updated.history.present.revision).toBe(named.history.present.revision + 1)
    expect(updated.history.past.length).toBe(named.history.past.length + 1)
    expect(courseProjectDocumentSchema.safeParse(updated.history.present).success).toBe(true)
  })

  it('treats an unchanged text session commit as a zero-revision no-op', () => {
    const initial = createLayerSession()
    const updated = updateV9SlideNativeNode(initial, 'layer-text-a', {
      text: '第一层',
      runs: [],
    }, NOW)

    expect(updated).toBe(initial)
    expect(updated.history).toBe(initial.history)
    expect(updated.history.present.revision).toBe(initial.history.present.revision)
  })

  it('stores named-state property edits as deeply sparse valid overrides', () => {
    const initial = createLayerSession()
    const named = addV9SlidePresentationState(initial, '属性态', NOW)
    const updated = updateV9SlideNativeNode(named, 'layer-text-a', {
      x: 388,
      style: { color: '#dc2626', bold: true },
    }, NOW)
    const scene = sceneFor(updated)
    const override = scene.presentation?.states.find(
      (state) => state.id === updated.selection.stateId,
    )?.layerItemOverrides['layer-text-a']
    const view = buildSlideEditorView({
      project: updated.history.present,
      locationId: updated.selection.locationId,
      stateId: updated.selection.stateId,
    })
    const effective = view.layers.find(
      (layer) => layer.selectionId === 'layer-text-a',
    )?.item

    expect(override).toEqual({
      frame: { x: 388 },
      nativeData: { style: { color: '#dc2626', bold: true } },
    })
    expect(effective).toMatchObject({
      frame: { x: 388 },
      content: {
        data: {
          style: {
            color: '#dc2626',
            bold: true,
            fontFamily: expect.any(String),
          },
        },
      },
    })
    expect(updated.history.present.revision).toBe(named.history.present.revision + 1)
    expect(updated.history.past.length).toBe(named.history.past.length + 1)
    expect(courseProjectDocumentSchema.safeParse(updated.history.present).success).toBe(true)

    const restored = clearV9SlideNativeNodeOverride(updated, 'layer-text-a', NOW)
    const restoredState = sceneFor(restored).presentation?.states.find(
      (state) => state.id === restored.selection.stateId,
    )
    const restoredView = buildSlideEditorView({
      project: restored.history.present,
      locationId: restored.selection.locationId,
      stateId: restored.selection.stateId,
    })
    expect(restoredState?.layerItemOverrides['layer-text-a']).toBeUndefined()
    expect(restoredView.layers.find(
      (layer) => layer.selectionId === 'layer-text-a',
    )?.item).toMatchObject({
      content: { data: { style: { color: '#1f2937', bold: false } } },
    })
    expect(restored.history.present.revision).toBe(updated.history.present.revision + 1)
    expect(restored.history.past.length).toBe(updated.history.past.length + 1)
  })

  it('replaces formula ASTs atomically in base and named states', () => {
    const initial = addV9SlideFormulaLayer(createLayerSession(), 260, 180, NOW)
    const formulaId = initial.selection.selectionIds[0]!
    const rootAst = {
      type: 'root' as const,
      radicand: {
        type: 'token' as const,
        value: 'x',
      },
      index: {
        type: 'token' as const,
        value: '3',
      },
    }
    const base = updateV9SlideNativeNode(initial, formulaId, {
      ast: rootAst,
      accessibleText: 'x 的三次方根',
    }, NOW)
    const baseItem = sceneFor(base).layerItems.find(
      (item) => item.layerItemId === formulaId,
    )

    expect(baseItem).toMatchObject({
      content: { data: { ast: rootAst, accessibleText: 'x 的三次方根' } },
    })
    if (
      !baseItem || baseItem.kind !== 'native' ||
      baseItem.content.nativeType !== 'formula'
    ) throw new Error('expected formula layer')
    expect(baseItem.content.data.ast).not.toHaveProperty('children')

    const named = addV9SlidePresentationState(base, '公式态', NOW)
    const tokenAst = { type: 'token' as const, value: 'y' }
    const updated = updateV9SlideNativeNode(named, formulaId, {
      ast: tokenAst,
      accessibleText: 'y',
    }, NOW)
    const override = sceneFor(updated).presentation?.states.find(
      (state) => state.id === updated.selection.stateId,
    )?.layerItemOverrides[formulaId]
    const view = buildSlideEditorView({
      project: updated.history.present,
      locationId: updated.selection.locationId,
      stateId: updated.selection.stateId,
    })
    const effective = view.layers.find((layer) => layer.selectionId === formulaId)?.item

    expect(override?.nativeData).toMatchObject({
      ast: tokenAst,
      accessibleText: 'y',
    })
    expect(override?.nativeData?.ast).not.toHaveProperty('radicand')
    expect(effective).toMatchObject({
      content: { data: { ast: tokenAst, accessibleText: 'y' } },
    })
    expect(courseProjectDocumentSchema.safeParse(updated.history.present).success).toBe(true)
  })

  it('rejects stable identifiers, incomplete semantic patches and unknown fields', () => {
    const initial = addV9SlideFormulaLayer(createLayerSession(), 260, 180, NOW)
    const formulaId = initial.selection.selectionIds[0]!
    const historyBefore = initial.history

    expect(() => updateV9SlideNativeNode(initial, formulaId, {
      formulaId: 'replacement-id',
    }, NOW)).toThrow('暂不支持修改这项属性')
    expect(() => updateV9SlideNativeNode(initial, formulaId, {
      ast: { type: 'token', value: 'z' },
    }, NOW)).toThrow('必须同时更新无障碍描述')
    expect(() => updateV9SlideNativeNode(initial, formulaId, {
      name: 'x'.repeat(201),
    }, NOW)).toThrow('最多 200 个字符')
    expect(() => updateV9SlideNativeNode(initial, formulaId, {
      style: { color: '#2563eb', unknownStyle: true },
    } as never, NOW)).toThrow('属性值无效')
    expect(() => updateV9SlideNativeNode(initial, 'layer-text-a', {
      text: '只改文字但没有局部格式',
    }, NOW)).toThrow('必须同时保留局部格式')
    expect(initial.history).toBe(historyBefore)

    const runsOnly = updateV9SlideNativeNode(initial, 'layer-text-a', {
      runs: [{ start: 0, end: 1, style: { bold: true } }],
    }, NOW)
    expect(runsOnly.history.present.revision).toBe(
      initial.history.present.revision + 1,
    )
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

  it('round-trips a committed text+runs session through save and reopen', () => {
    const initial = createLayerSession()
    const runs = [
      { start: 0, end: 2, style: { bold: true } },
      { start: 5, end: 7, style: { color: '#dc2626' } },
    ]
    const committed = updateV9SlideNativeNode(initial, 'layer-text-a', {
      text: '保存重开富文本',
      runs,
    }, NOW)
    const bytes = createCourseProjectArchive({
      project: committed.history.present,
      assetFiles: {},
      componentFiles: {},
    }, { mtime: NOW })
    const opened = openCourseProjectArchive(bytes)
    const reopened = openV9SlideVerticalSliceState(
      opened,
      'C:\\courseware\\text-roundtrip.h5lesson',
    )
    const view = buildSlideEditorView({
      project: reopened.history.present,
      locationId: reopened.selection.locationId,
      stateId: reopened.selection.stateId,
    })
    const item = view.layers.find((layer) => layer.selectionId === 'layer-text-a')?.item

    expect(item).toMatchObject({
      content: { data: { text: '保存重开富文本', runs } },
    })
    expect(courseProjectDocumentSchema.safeParse(reopened.history.present).success).toBe(true)
    expect(isV9SlideVerticalSliceDirty(reopened)).toBe(false)
  })
})
