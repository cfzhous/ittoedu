import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { sceneNodeToCourseLayerItem } from '@/shared/courseProjectModel'
import type { RuntimeLayerItem } from '@/shared/courseProjectTypes'
import { createTextNode } from '@/renderer/project/createProject'
import {
  addSlideScene,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  activateV9SlidePresentationState,
  activateV9SlideScene,
  addV9SlidePresentationState,
  buildV9SlideWorkspaceSnapshot,
  captureV9SlideVerticalSliceArchive,
  deleteV9SlideLayer,
  duplicateV9SlideLayer,
  nudgeV9SlideSelection,
  openV9SlideVerticalSliceState,
  redoV9SlideVerticalSlice,
  reorderV9SlideLayers,
  selectV9SlideVerticalSlice,
  setV9SlideEditingScope,
  transformV9SlideVerticalSlice,
  undoV9SlideVerticalSlice,
  updateV9SlideLayer,
  updateV9SlideNativeNode,
  v9SlideLayerContextKey,
} from '@/renderer/course/v9SlideVerticalSlice'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'

const NOW = '2026-08-15T10:00:00.000Z'
const SHARED_ID = 'surface-shared-text'

function sharedText(id = SHARED_ID, order = 10) {
  return sceneNodeToCourseLayerItem(createTextNode({
    id,
    name: '场景间提示',
    text: '每个场景都能看到',
    x: 160,
    y: 120,
  }), order)
}

function runtimeBinding(id: string, targetId: string, order = 20): RuntimeLayerItem {
  return {
    layerItemId: id,
    label: '动态承载',
    frame: { mode: 'absolute', x: 0, y: 0, width: 1280, height: 720 },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'surface',
    playbackInitialVisibility: 'inherit',
    kind: 'runtime',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareSurfaceRuntime.define({ create() { return { destroy() {} } } })',
      content: { values: {} },
      assets: {},
      nodeBindings: { target: targetId },
    },
  }
}

function clickRule(ruleId: string, actionId: string, nodeId = SHARED_ID) {
  return {
    id: ruleId,
    enabled: true,
    trigger: { type: 'node.click' as const, nodeId },
    conditions: [],
    actions: [{
      id: actionId,
      start: 'after-previous' as const,
      delayMs: 0,
      action: {
        type: 'node.enter' as const,
        nodeId,
        effect: 'fade' as const,
        durationMs: 200,
        easing: 'ease-out' as const,
      },
    }],
  }
}

function createTwoSceneSurfaceSession(options: { runtime?: boolean } = {}) {
  let project = createCourseProject({ id: 'surface-session', now: NOW })
  const surface = project.surfaces[0]
  if (!surface || surface.type !== 'slide') throw new Error('expected slide')
  project = addSlideScene(project, surface.id, { id: 'surface-scene-two', now: NOW })
  project = updateCourseProject(project, (draft) => {
    const slide = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!slide || slide.type !== 'slide') throw new Error('expected slide')
    slide.surfaceLayerItems.push({
      item: sharedText(),
      visibility: { mode: 'all', locationIds: [] },
    })
    if (options.runtime) {
      slide.surfaceLayerItems.push({
        item: runtimeBinding('surface-runtime', SHARED_ID),
        visibility: { mode: 'all', locationIds: [] },
      })
    }
  }, NOW)
  return openV9SlideVerticalSliceState({
    project,
    assetFiles: {},
    componentFiles: {},
  }, null)
}

function surfaceFor(state: ReturnType<typeof createTwoSceneSurfaceSession>) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected location')
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('expected slide')
  return surface
}

describe('V9 Slide current-content shared authoring scope', () => {
  it('uses a collision-safe authoring context key with null state identity intact', () => {
    const left = v9SlideLayerContextKey({
      sessionId: 'session|location',
      locationId: 'current',
      stateId: null,
      editingScope: 'surface',
    })
    const right = v9SlideLayerContextKey({
      sessionId: 'session',
      locationId: 'location|current',
      stateId: null,
      editingScope: 'surface',
    })

    expect(left).not.toBe(right)
    expect(JSON.parse(left)[2]).toBeNull()
  })

  it('routes snapshot, selection, move, nudge, history and reopen through surfaceLayerItems', () => {
    const initial = createTwoSceneSurfaceSession()
    const surface = setV9SlideEditingScope(initial, 'surface')
    const snapshot = buildV9SlideWorkspaceSnapshot(surface)
    const selected = selectV9SlideVerticalSlice(surface, {
      nodeIds: [SHARED_ID],
      additive: false,
    })
    const moved = transformV9SlideVerticalSlice(selected, {
      nodes: [{
        nodeId: SHARED_ID,
        x: 236,
        y: 174,
        width: snapshot.document.nodes[0]!.width,
        height: snapshot.document.nodes[0]!.height,
        rotation: 7,
      }],
    }, NOW)

    expect(snapshot.document.nodes.map((node) => node.id)).toEqual([SHARED_ID])
    expect(snapshot.previewDocument.nodes.map((node) => node.id)).toContain(SHARED_ID)
    expect(moved.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(moved.history.past).toEqual([initial.history.present])
    expect(moved.selection.selectionIds).toEqual([SHARED_ID])
    expect(surfaceFor(moved).surfaceLayerItems[0]!.item.frame).toMatchObject({
      x: 236,
      y: 174,
    })

    const undone = undoV9SlideVerticalSlice(moved)
    const redone = redoV9SlideVerticalSlice(undone)
    expect(surfaceFor(undone).surfaceLayerItems[0]!.item.frame).toMatchObject({
      x: 160,
      y: 120,
    })
    expect(surfaceFor(redone).surfaceLayerItems[0]!.item.frame).toMatchObject({
      x: 236,
      y: 174,
    })

    const nudged = nudgeV9SlideSelection(redone, 4, -3, NOW)
    expect(surfaceFor(nudged).surfaceLayerItems[0]!.item.frame).toMatchObject({
      x: 240,
      y: 171,
    })
    expect(nudged.history.past.length).toBe(moved.history.past.length + 1)

    const secondSceneId = surfaceFor(nudged).scenes[1]!.id
    const secondScene = activateV9SlideScene(nudged, secondSceneId)
    expect(buildV9SlideWorkspaceSnapshot(secondScene).previewDocument.nodes)
      .toContainEqual(expect.objectContaining({ id: SHARED_ID, x: 240, y: 171 }))

    const beforeSave = surfaceFor(nudged).surfaceLayerItems[0]!.item
    const bytes = createCourseProjectArchive(
      captureV9SlideVerticalSliceArchive(nudged),
      { mtime: NOW },
    )
    const reopened = setV9SlideEditingScope(openV9SlideVerticalSliceState(
      openCourseProjectArchive(bytes),
      'C:\\courseware\\surface-shared.h5lesson',
    ), 'surface')
    const reopenedItem = surfaceFor(reopened).surfaceLayerItems[0]!.item
    expect(reopenedItem).toMatchObject({
      layerItemId: beforeSave.layerItemId,
      order: beforeSave.order,
      frame: beforeSave.frame,
    })
    expect(courseProjectDocumentSchema.safeParse(reopened.history.present).success).toBe(true)
  })

  it.each(['surface', 'global'] as const)(
    'keeps %s base visibility authorable while scoped visibility hides only the preview',
    (editingScope) => {
      const opened = createTwoSceneSurfaceSession()
      const excludedLocationId = opened.selection.locationId
      const project = updateCourseProject(opened.history.present, (draft) => {
        const slide = draft.surfaces[0]
        if (!slide || slide.type !== 'slide') throw new Error('expected slide')
        const entry = slide.surfaceLayerItems.find(
          (candidate) => candidate.item.layerItemId === SHARED_ID,
        )
        if (!entry) throw new Error('expected shared item')
        entry.visibility = { mode: 'exclude', locationIds: [excludedLocationId] }
        if (editingScope === 'global') {
          slide.surfaceLayerItems = slide.surfaceLayerItems.filter(
            (candidate) => candidate.item.layerItemId !== SHARED_ID,
          )
          draft.globalLayerItems.push(entry)
        }
      }, NOW)
      const scoped = setV9SlideEditingScope(openV9SlideVerticalSliceState({
        project,
        assetFiles: {},
        componentFiles: {},
      }, null), editingScope)
      const snapshot = buildV9SlideWorkspaceSnapshot(scoped)
      const authorNode = snapshot.document.nodes.find((node) => node.id === SHARED_ID)
      const previewNode = snapshot.previewDocument.nodes.find((node) => node.id === SHARED_ID)

      expect(authorNode?.visible).toBe(true)
      expect(previewNode?.visible).toBe(false)

      const selected = selectV9SlideVerticalSlice(scoped, {
        nodeIds: [SHARED_ID],
        additive: false,
      })
      expect(selected.selection.selectionIds).toEqual([SHARED_ID])
      const moved = transformV9SlideVerticalSlice(selected, {
        nodes: [{
          nodeId: SHARED_ID,
          x: authorNode!.x + 20,
          y: authorNode!.y + 10,
          width: authorNode!.width,
          height: authorNode!.height,
          rotation: authorNode!.rotation,
        }],
      }, NOW)
      expect(moved.history.present.revision).toBe(scoped.history.present.revision + 1)

      const hidden = updateV9SlideLayer(moved, SHARED_ID, { visible: false }, NOW)
      expect(hidden.history.present.revision).toBe(moved.history.present.revision + 1)
      expect(buildV9SlideWorkspaceSnapshot(hidden).document.nodes.find(
        (node) => node.id === SHARED_ID,
      )?.visible).toBe(false)
      expect(buildV9SlideWorkspaceSnapshot(hidden).previewDocument.nodes.find(
        (node) => node.id === SHARED_ID,
      )?.visible).toBe(false)

      const shown = updateV9SlideLayer(hidden, SHARED_ID, { visible: true }, NOW)
      expect(shown.history.present.revision).toBe(hidden.history.present.revision + 1)
      expect(buildV9SlideWorkspaceSnapshot(shown).document.nodes.find(
        (node) => node.id === SHARED_ID,
      )?.visible).toBe(true)
      expect(buildV9SlideWorkspaceSnapshot(shown).previewDocument.nodes.find(
        (node) => node.id === SHARED_ID,
      )?.visible).toBe(false)

      const secondSceneId = surfaceFor(shown).scenes[1]!.id
      const includedLocation = activateV9SlideScene(shown, secondSceneId)
      expect(buildV9SlideWorkspaceSnapshot(includedLocation).previewDocument.nodes.find(
        (node) => node.id === SHARED_ID,
      )?.visible).toBe(true)
    },
  )

  it.each(['scene', 'surface'] as const)(
    'allows Nodes selection to restore a hidden %s item without allowing movement',
    (editingScope) => {
      const opened = createTwoSceneSurfaceSession()
      const project = updateCourseProject(opened.history.present, (draft) => {
        const slide = draft.surfaces[0]
        if (!slide || slide.type !== 'slide') throw new Error('expected slide')
        const entry = slide.surfaceLayerItems.find(
          (candidate) => candidate.item.layerItemId === SHARED_ID,
        )
        if (!entry) throw new Error('expected shared item')
        entry.item.visible = false
        if (editingScope === 'scene') {
          slide.surfaceLayerItems = slide.surfaceLayerItems.filter(
            (candidate) => candidate.item.layerItemId !== SHARED_ID,
          )
          slide.scenes[0]!.layerItems.push(entry.item)
        }
      }, NOW)
      const scoped = setV9SlideEditingScope(openV9SlideVerticalSliceState({
        project,
        assetFiles: {},
        componentFiles: {},
      }, null), editingScope)
      const hiddenNode = buildV9SlideWorkspaceSnapshot(scoped).document.nodes.find(
        (node) => node.id === SHARED_ID,
      )!
      expect(hiddenNode.visible).toBe(false)

      const selected = selectV9SlideVerticalSlice(scoped, {
        nodeIds: [SHARED_ID],
        additive: false,
      })
      expect(selected.selection.selectionIds).toEqual([SHARED_ID])
      expect(transformV9SlideVerticalSlice(selected, {
        nodes: [{
          nodeId: SHARED_ID,
          x: hiddenNode.x + 20,
          y: hiddenNode.y + 10,
          width: hiddenNode.width,
          height: hiddenNode.height,
          rotation: hiddenNode.rotation,
        }],
      }, NOW)).toBe(selected)
      expect(nudgeV9SlideSelection(selected, 1, 0, NOW)).toBe(selected)

      const shown = updateV9SlideLayer(selected, SHARED_ID, { visible: true }, NOW)
      expect(shown.history.present.revision).toBe(selected.history.present.revision + 1)
      expect(buildV9SlideWorkspaceSnapshot(shown).document.nodes.find(
        (node) => node.id === SHARED_ID,
      )?.visible).toBe(true)
    },
  )

  it('writes shared Native properties to the surface base even from a named-state location', () => {
    const initial = createTwoSceneSurfaceSession()
    const named = addV9SlidePresentationState(initial, '讲解态', NOW)
    const stateId = named.selection.stateId!
    const surface = setV9SlideEditingScope(named, 'surface')
    const selected = selectV9SlideVerticalSlice(surface, {
      nodeIds: [SHARED_ID],
      additive: false,
    })
    const updated = updateV9SlideNativeNode(selected, SHARED_ID, {
      name: '共用提示（已改）',
      x: 312,
      style: { color: '#2563eb', bold: true },
    }, NOW)
    const slide = surfaceFor(updated)
    const item = slide.surfaceLayerItems[0]!.item
    const state = slide.scenes[0]!.presentation!.states.find(
      (candidate) => candidate.id === stateId,
    )!

    expect(item).toMatchObject({
      label: '共用提示（已改）',
      frame: { x: 312 },
      content: { data: { style: { color: '#2563eb', bold: true } } },
    })
    expect(state.layerItemOverrides[SHARED_ID]).toBeUndefined()
    expect(updated.history.present.revision).toBe(named.history.present.revision + 1)
    expect(activateV9SlidePresentationState(
      setV9SlideEditingScope(updated, 'scene'),
      stateId,
    ).selection.stateId).toBe(stateId)
  })

  it('duplicates a shared Native and its per-scene interaction graph with fresh IDs', () => {
    const opened = createTwoSceneSurfaceSession()
    const project = updateCourseProject(opened.history.present, (draft) => {
      const slide = draft.surfaces[0]
      if (!slide || slide.type !== 'slide') throw new Error('expected slide')
      slide.scenes.forEach((scene, index) => {
        scene.interactions = [clickRule(`rule-${index}`, `action-${index}`)]
      })
    }, NOW)
    const surface = setV9SlideEditingScope(openV9SlideVerticalSliceState({
      project,
      assetFiles: {},
      componentFiles: {},
    }, null), 'surface')
    const duplicated = duplicateV9SlideLayer(surface, SHARED_ID, NOW)
    const duplicateId = duplicated.selection.selectionIds[0]!
    const slide = surfaceFor(duplicated)

    expect(duplicateId).not.toBe(SHARED_ID)
    expect(slide.surfaceLayerItems.map((entry) => entry.item.layerItemId))
      .toContain(duplicateId)
    slide.scenes.forEach((scene, index) => {
      expect(scene.interactions).toHaveLength(2)
      const duplicateRule = scene.interactions.find(
        (rule) => rule.trigger.type === 'node.click' && rule.trigger.nodeId === duplicateId,
      )
      expect(duplicateRule).toMatchObject({
        trigger: { type: 'node.click', nodeId: duplicateId },
        actions: [{ action: { type: 'node.enter', nodeId: duplicateId } }],
      })
      expect(duplicateRule?.id).not.toBe(`rule-${index}`)
      expect(duplicateRule?.actions[0]?.id).not.toBe(`action-${index}`)
    })
    expect(courseProjectDocumentSchema.safeParse(duplicated.history.present).success).toBe(true)
  })

  it('keeps a non-start scene and surface scope when undo removes a selected duplicate', () => {
    const initial = createTwoSceneSurfaceSession()
    const secondSceneId = surfaceFor(initial).scenes[1]!.id
    const secondLocation = activateV9SlideScene(initial, secondSceneId)
    const surface = setV9SlideEditingScope(secondLocation, 'surface')
    const duplicated = duplicateV9SlideLayer(surface, SHARED_ID, NOW)
    const duplicateId = duplicated.selection.selectionIds[0]!
    const undone = undoV9SlideVerticalSlice(duplicated)

    expect(secondLocation.selection.locationId).not.toBe(
      initial.history.present.startLocationId,
    )
    expect(duplicated.selection.selectionIds).toEqual([duplicateId])
    expect(undone.selection.locationId).toBe(secondLocation.selection.locationId)
    expect(undone.selection.stateId).toBe(secondLocation.selection.stateId)
    expect(undone.selection.selectionIds).toEqual([])
    expect(undone.editingScope).toBe('surface')
  })

  it('deletes only current-surface references when another surface reuses the same layer ID', () => {
    const first = createCourseProject({ id: 'surface-delete-first', now: NOW })
    const second = createCourseProject({ id: 'surface-delete-second', now: NOW })
    const project = updateCourseProject(first, (draft) => {
      const firstSlide = draft.surfaces[0]
      const secondSlide = structuredClone(second.surfaces[0])
      if (!firstSlide || firstSlide.type !== 'slide' || secondSlide.type !== 'slide') {
        throw new Error('expected slides')
      }
      firstSlide.surfaceLayerItems.push(
        { item: sharedText(), visibility: { mode: 'all', locationIds: [] } },
        { item: runtimeBinding('runtime-first', SHARED_ID), visibility: { mode: 'all', locationIds: [] } },
      )
      firstSlide.scenes[0]!.interactions = [clickRule('rule-first', 'action-first')]
      secondSlide.surfaceLayerItems.push(
        { item: sharedText(), visibility: { mode: 'all', locationIds: [] } },
        { item: runtimeBinding('runtime-second', SHARED_ID), visibility: { mode: 'all', locationIds: [] } },
      )
      secondSlide.scenes[0]!.interactions = [clickRule('rule-second', 'action-second')]
      draft.surfaces.push(secondSlide)
      draft.locations.push(...structuredClone(second.locations))
      draft.globalInteractions = [clickRule('rule-global', 'action-global')]
      draft.mixedPrintPlan = {
        pageSize: 'surface-native',
        orientation: 'auto',
        entries: [firstSlide, secondSlide].map((slide) => ({
          id: `print:${slide.id}`,
          kind: 'slide-scenes' as const,
          surfaceId: slide.id,
          sceneIds: slide.scenes.map((scene) => scene.id),
        })),
      }
    }, NOW)
    const surface = setV9SlideEditingScope(openV9SlideVerticalSliceState({
      project,
      assetFiles: {},
      componentFiles: {},
    }, null), 'surface')
    const deleted = deleteV9SlideLayer(surface, SHARED_ID, NOW)
    const firstSlide = deleted.history.present.surfaces.find(
      (candidate) => candidate.id === first.surfaces[0]!.id,
    )
    const secondSlide = deleted.history.present.surfaces.find(
      (candidate) => candidate.id === second.surfaces[0]!.id,
    )
    if (!firstSlide || firstSlide.type !== 'slide' || !secondSlide || secondSlide.type !== 'slide') {
      throw new Error('expected slides')
    }

    expect(firstSlide.surfaceLayerItems.some(
      (entry) => entry.item.layerItemId === SHARED_ID,
    )).toBe(false)
    expect(firstSlide.scenes[0]!.interactions).toEqual([])
    expect(firstSlide.surfaceLayerItems.find(
      (entry) => entry.item.layerItemId === 'runtime-first',
    )?.item).toMatchObject({ runtime: { nodeBindings: {} } })
    expect(secondSlide.surfaceLayerItems.some(
      (entry) => entry.item.layerItemId === SHARED_ID,
    )).toBe(true)
    expect(secondSlide.scenes[0]!.interactions).toHaveLength(1)
    expect(secondSlide.surfaceLayerItems.find(
      (entry) => entry.item.layerItemId === 'runtime-second',
    )?.item).toMatchObject({ runtime: { nodeBindings: { target: SHARED_ID } } })
    expect(deleted.history.present.globalInteractions).toHaveLength(1)
    expect(courseProjectDocumentSchema.safeParse(deleted.history.present).success).toBe(true)
  })

  it('reorders all-Native shared layers in one history entry and gates no hidden order data', () => {
    const opened = createTwoSceneSurfaceSession()
    const project = updateCourseProject(opened.history.present, (draft) => {
      const slide = draft.surfaces[0]
      if (!slide) throw new Error('expected surface')
      slide.surfaceLayerItems.push({
        item: sharedText('surface-shared-second', 30),
        visibility: { mode: 'all', locationIds: [] },
      })
    }, NOW)
    const surface = setV9SlideEditingScope(openV9SlideVerticalSliceState({
      project,
      assetFiles: {},
      componentFiles: {},
    }, null), 'surface')
    const reordered = reorderV9SlideLayers(
      surface,
      ['surface-shared-second', SHARED_ID],
      NOW,
    )

    expect(surfaceFor(reordered).surfaceLayerItems.map((entry) => entry.item.layerItemId))
      .toEqual(['surface-shared-second', SHARED_ID])
    expect(reordered.history.present.revision).toBe(surface.history.present.revision + 1)
    expect(reordered.history.past.length).toBe(surface.history.past.length + 1)
  })

  it('returns to the current scene after deleting the final shared item', () => {
    const surface = setV9SlideEditingScope(createTwoSceneSurfaceSession(), 'surface')
    const deleted = deleteV9SlideLayer(surface, SHARED_ID, NOW)

    expect(deleted.editingScope).toBe('scene')
    expect(deleted.selection.selectionIds).toEqual([])
    expect(surfaceFor(deleted).surfaceLayerItems).toEqual([])
  })
})
