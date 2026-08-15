import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  addSlideScene,
  addSlideTextLayer,
  createCourseProject,
  deleteSlideScene,
  duplicateSlideScene,
  renameSlideScene,
  reorderSlideScenes,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-15T08:00:00.000Z'

function slide(project: ReturnType<typeof createCourseProject>) {
  const surface = project.surfaces[0]
  if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
  return surface
}

describe('Course Studio Slide scene commands', () => {
  it('adds every Slide scene with an initial presentation and preserves interleaved location slots', () => {
    let project = createCourseProject({ id: 'scene-add', now: NOW })
    const surfaceId = slide(project).id
    project = addCourseSurface(project, 'flow', { id: 'flow-add', now: NOW })
    const flowLocation = project.locations.find((location) => location.kind === 'flow-block')!
    project = updateCourseProject(project, (draft) => {
      const [initialLocation] = draft.locations
      draft.locations = [initialLocation!, flowLocation]
      const entry = draft.mixedPrintPlan!.entries.find((candidate) => candidate.surfaceId === surfaceId)
      if (entry?.kind === 'slide-scenes') entry.sceneIds = [slide(project).scenes[0]!.id]
    }, NOW)
    project = addSlideScene(project, surfaceId, { id: 'scene-added', now: NOW })

    const current = slide(project)
    expect(current.scenes[1]).toMatchObject({
      id: 'scene-added',
      presentation: {
        initialStateId: 'state_initial',
        thumbnailStateId: 'state_initial',
        states: [{ id: 'state_initial', name: '初始', layerItemOverrides: {} }],
      },
    })
    expect(project.locations.map((location) => location.id)).toEqual([
      current.scenes[0]!.id,
      'scene-added',
      flowLocation.id,
    ])
    const printEntry = project.mixedPrintPlan!.entries.find((entry) => entry.surfaceId === surfaceId)
    expect(printEntry?.kind === 'slide-scenes' ? printEntry.sceneIds : []).toEqual([
      current.scenes[0]!.id,
      'scene-added',
    ])
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })

  it('renames and reorders scenes, locations and only the authored print subset in one revision', () => {
    let project = createCourseProject({ id: 'scene-order', now: NOW })
    const surfaceId = slide(project).id
    const firstId = slide(project).scenes[0]!.id
    project = addSlideScene(project, surfaceId, { id: 'scene-second', now: NOW })
    project = addSlideScene(project, surfaceId, { id: 'scene-third', now: NOW })
    project = addCourseSurface(project, 'flow', { id: 'flow-order', now: NOW })
    const flowLocation = project.locations.find((location) => location.kind === 'flow-block')!
    project = updateCourseProject(project, (draft) => {
      const locations = new Map(draft.locations.map((location) => [location.id, location]))
      draft.locations = [
        locations.get(firstId)!,
        flowLocation,
        locations.get('scene-second')!,
        locations.get('scene-third')!,
      ]
      const entry = draft.mixedPrintPlan!.entries.find((candidate) => candidate.surfaceId === surfaceId)
      if (entry?.kind === 'slide-scenes') entry.sceneIds = [firstId, 'scene-third']
    }, NOW)

    const renamed = renameSlideScene(project, surfaceId, 'scene-second', '  新名称  ', NOW)
    expect(renamed.revision).toBe(project.revision + 1)
    expect(slide(renamed).scenes[1]!.name).toBe('新名称')
    expect(renamed.locations.find((location) => location.id === 'scene-second')?.label)
      .toContain('新名称')

    const reordered = reorderSlideScenes(
      renamed,
      surfaceId,
      ['scene-third', firstId, 'scene-second'],
      NOW,
    )
    expect(reordered.revision).toBe(renamed.revision + 1)
    expect(slide(reordered).scenes.map((scene) => scene.id)).toEqual([
      'scene-third', firstId, 'scene-second',
    ])
    expect(reordered.locations.map((location) => location.id)).toEqual([
      'scene-third', flowLocation.id, firstId, 'scene-second',
    ])
    const printEntry = reordered.mixedPrintPlan!.entries.find((entry) => entry.surfaceId === surfaceId)
    expect(printEntry?.kind === 'slide-scenes' ? printEntry.sceneIds : []).toEqual([
      'scene-third', firstId,
    ])
    expect(courseProjectDocumentSchema.parse(reordered)).toEqual(reordered)
  })

  it('duplicates all local IDs and references while extending visibility and scene conditions', () => {
    let project = createCourseProject({ id: 'scene-duplicate', now: NOW })
    const surfaceId = slide(project).id
    const sourceId = slide(project).scenes[0]!.id
    const sourceLocationId = project.startLocationId
    project = addSlideTextLayer(project, surfaceId, sourceId, '复制文字', {
      id: 'source-text', now: NOW,
    })
    project = addSlideScene(project, surfaceId, { id: 'scene-other', now: NOW })
    project = addCourseSurface(project, 'flow', { id: 'flow-duplicate', now: NOW })
    project = updateCourseProject(project, (draft) => {
      const current = draft.surfaces[0]
      if (!current || current.type !== 'slide') throw new Error('expected Slide surface')
      const source = current.scenes[0]!
      source.presentation!.states.push({
        id: 'state-revealed',
        name: '展开',
        layerItemOverrides: { 'source-text': { visible: false } },
        layerItemOrder: ['source-text'],
      })
      source.presentation!.thumbnailStateId = 'state-revealed'
      const localController = structuredClone(draft.globalLayerItems[0]!.item)
      localController.layerItemId = 'source-controller'
      localController.order = 3
      if (
        localController.kind !== 'native' ||
        localController.content.nativeType !== 'teacher-controller'
      ) {
        throw new Error('expected teacher controller')
      }
      localController.content.data.buttons = [{
        id: 'external-state-button',
        action: {
          type: 'scene.go',
          sceneId: 'scene-other',
          targetStateId: 'state-revealed',
        },
        label: '去外部场景同名状态',
        visible: true,
      }]
      source.layerItems.push(localController)
      source.interactions = [{
        id: 'rule-source',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'source-text' },
        conditions: [
          { type: 'presentation.in', stateIds: ['state_initial'] },
          { type: 'scene.in', sceneIds: [sourceId] },
        ],
        actions: [
          {
            id: 'action-state',
            start: 'after-previous',
            delayMs: 0,
            action: { type: 'presentation.set', stateId: 'state-revealed' },
          },
          {
            id: 'action-go',
            start: 'after-previous',
            delayMs: 0,
            action: { type: 'scene.go', sceneId: sourceId, targetStateId: 'state-revealed' },
          },
        ],
      }]
      draft.locations.push({
        id: 'location-revealed',
        label: '展开位置',
        kind: 'slide-scene',
        surfaceId,
        sceneId: sourceId,
        stateId: 'state-revealed',
      })
      draft.globalLayerItems[0]!.visibility = {
        mode: 'include',
        locationIds: [sourceLocationId, 'location-revealed'],
      }
      draft.globalInteractions = [{
        id: 'global-scene-condition',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [{ type: 'scene.in', sceneIds: [sourceId] }],
        actions: [{
          id: 'global-next',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.next' },
        }],
      }]
      const other = current.scenes[1]!
      other.presentation!.states.push({
        id: 'state-revealed',
        name: '外部场景展开',
        layerItemOverrides: {},
      })
      other.interactions = [{
        id: 'other-scene-condition',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [{ type: 'scene.in', sceneIds: [sourceId] }],
        actions: [{
          id: 'other-replay',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.replay' },
        }],
      }]
      const printEntry = draft.mixedPrintPlan!.entries.find((entry) => entry.surfaceId === surfaceId)
      if (printEntry?.kind === 'slide-scenes') printEntry.sceneIds = [sourceId]
    }, NOW)

    const duplicated = duplicateSlideScene(project, surfaceId, sourceId, {
      id: 'scene-copy', now: NOW,
    })
    const current = slide(duplicated)
    const source = current.scenes.find((scene) => scene.id === sourceId)!
    const copy = current.scenes.find((scene) => scene.id === 'scene-copy')!
    expect(duplicated.revision).toBe(project.revision + 1)
    expect(current.scenes.map((scene) => scene.id)).toEqual([sourceId, 'scene-copy', 'scene-other'])
    expect(copy.layerItems[0]!.layerItemId).not.toBe(source.layerItems[0]!.layerItemId)
    expect(copy.presentation!.states.map((state) => state.id))
      .not.toEqual(source.presentation!.states.map((state) => state.id))
    const copiedStateIds = new Set(copy.presentation!.states.map((state) => state.id))
    const copiedLayerId = copy.layerItems[0]!.layerItemId
    expect(Object.keys(copy.presentation!.states[1]!.layerItemOverrides)).toEqual([copiedLayerId])
    expect(copy.presentation!.states[1]!.layerItemOrder).toEqual([copiedLayerId])
    expect(copy.interactions[0]!.id).not.toBe('rule-source')
    expect(copy.interactions[0]!.trigger).toEqual({ type: 'node.click', nodeId: copiedLayerId })
    expect(copy.interactions[0]!.conditions).toEqual([
      { type: 'presentation.in', stateIds: [copy.presentation!.states[0]!.id] },
      { type: 'scene.in', sceneIds: ['scene-copy'] },
    ])
    expect(copy.interactions[0]!.actions[0]!.action).toMatchObject({
      type: 'presentation.set',
      stateId: copy.presentation!.states[1]!.id,
    })
    expect(copy.interactions[0]!.actions[1]!.action).toMatchObject({
      type: 'scene.go',
      sceneId: 'scene-copy',
      targetStateId: copy.presentation!.states[1]!.id,
    })
    expect(copy.interactions[0]!.actions.every((step) =>
      step.id !== 'action-state' && step.id !== 'action-go',
    )).toBe(true)
    const copiedController = copy.layerItems.find((item) =>
      item.kind === 'native' && item.content.nativeType === 'teacher-controller',
    )
    if (
      !copiedController ||
      copiedController.kind !== 'native' ||
      copiedController.content.nativeType !== 'teacher-controller'
    ) {
      throw new Error('expected copied teacher controller')
    }
    expect(copiedController.content.data.buttons[0]!.action).toEqual({
      type: 'scene.go',
      sceneId: 'scene-other',
      targetStateId: 'state-revealed',
    })
    expect([...copiedStateIds]).toHaveLength(2)

    const copiedLocations = duplicated.locations.filter((location) =>
      location.kind === 'slide-scene' && location.sceneId === 'scene-copy',
    )
    expect(copiedLocations).toHaveLength(2)
    expect(copiedLocations.map((location) => location.id)).not.toContain(sourceLocationId)
    expect(duplicated.globalLayerItems[0]!.visibility.locationIds).toEqual(expect.arrayContaining(
      copiedLocations.map((location) => location.id),
    ))
    expect(duplicated.globalInteractions[0]!.conditions[0]).toEqual({
      type: 'scene.in', sceneIds: [sourceId, 'scene-copy'],
    })
    expect(current.scenes.find((scene) => scene.id === 'scene-other')!.interactions[0]!.conditions[0])
      .toEqual({ type: 'scene.in', sceneIds: [sourceId, 'scene-copy'] })
    const printEntry = duplicated.mixedPrintPlan!.entries.find((entry) => entry.surfaceId === surfaceId)
    expect(printEntry?.kind === 'slide-scenes' ? printEntry.sceneIds : []).toEqual([
      sourceId, 'scene-copy',
    ])
    expect(courseProjectDocumentSchema.parse(duplicated)).toEqual(duplicated)
  })

  it('deletes a scene and cleans locations, guards, scoped visibility and explicit references', () => {
    let project = createCourseProject({ id: 'scene-delete', now: NOW })
    const surfaceId = slide(project).id
    const firstId = slide(project).scenes[0]!.id
    project = addSlideScene(project, surfaceId, { id: 'scene-delete-target', now: NOW })
    project = addSlideScene(project, surfaceId, { id: 'scene-delete-last', now: NOW })
    project = addCourseSurface(project, 'flow', { id: 'flow-delete', now: NOW })
    project = updateCourseProject(project, (draft) => {
      const targetLocation = draft.locations.find((location) => location.id === 'scene-delete-target')!
      draft.startLocationId = targetLocation.id
      draft.courseState = [{ key: 'ready', valueType: 'boolean', defaultValue: false }]
      draft.navigationGuards = [
        {
          id: 'guard-only-target',
          effect: 'block',
          toLocationIds: [targetLocation.id],
          match: 'all',
          conditions: [{ type: 'exists', key: 'ready', exists: true }],
          message: '未完成',
        },
        {
          id: 'guard-only-deleted-source',
          effect: 'block',
          fromLocationIds: [targetLocation.id],
          toLocationIds: [firstId],
          match: 'all',
          conditions: [{ type: 'exists', key: 'ready', exists: true }],
          message: '未完成',
        },
        {
          id: 'guard-partial-source',
          effect: 'block',
          fromLocationIds: [targetLocation.id, firstId],
          toLocationIds: [targetLocation.id, firstId],
          match: 'all',
          conditions: [{ type: 'exists', key: 'ready', exists: true }],
          message: '未完成',
        },
      ]
      const controller = draft.globalLayerItems[0]!
      controller.visibility = { mode: 'exclude', locationIds: [targetLocation.id] }
      if (controller.item.kind !== 'native' || controller.item.content.nativeType !== 'teacher-controller') {
        throw new Error('expected teacher controller')
      }
      controller.item.content.data.buttons = [{
        id: 'go-deleted',
        action: { type: 'scene.go', sceneId: 'scene-delete-target' },
        label: '去删除场景',
        visible: true,
      }]
      draft.globalInteractions = [
        {
          id: 'rule-delete-reference',
          enabled: true,
          trigger: { type: 'scene.enter' },
          conditions: [{ type: 'scene.in', sceneIds: ['scene-delete-target', 'scene-delete-last'] }],
          actions: [
            {
              id: 'action-keep',
              start: 'after-previous',
              delayMs: 0,
              action: {
                type: 'node.enter',
                nodeId: controller.item.layerItemId,
                durationMs: 100,
                easing: 'linear',
                effect: 'fade',
              },
            },
            {
              id: 'action-delete',
              start: 'after-previous',
              delayMs: 0,
              action: { type: 'scene.go', sceneId: 'scene-delete-target' },
            },
          ],
        },
        {
          id: 'rule-impossible-after-delete',
          enabled: true,
          trigger: { type: 'scene.enter' },
          conditions: [{ type: 'scene.in', sceneIds: ['scene-delete-target'] }],
          actions: [{
            id: 'removed-motion',
            start: 'after-previous',
            delayMs: 0,
            action: {
              type: 'node.enter',
              nodeId: controller.item.layerItemId,
              durationMs: 100,
              easing: 'linear',
              effect: 'fade',
            },
          }],
        },
        {
          id: 'rule-dependent-on-removed-motion',
          enabled: true,
          trigger: { type: 'animation.completed', actionId: 'removed-motion' },
          conditions: [],
          actions: [{
            id: 'dependent-motion',
            start: 'after-previous',
            delayMs: 0,
            action: {
              type: 'node.exit',
              nodeId: controller.item.layerItemId,
              durationMs: 100,
              easing: 'linear',
              effect: 'fade',
            },
          }],
        },
        {
          id: 'rule-transitive-completion',
          enabled: true,
          trigger: { type: 'animation.completed', actionId: 'dependent-motion' },
          conditions: [],
          actions: [{
            id: 'transitive-action',
            start: 'after-previous',
            delayMs: 0,
            action: { type: 'scene.next' },
          }],
        },
      ]
      const printEntry = draft.mixedPrintPlan!.entries.find((entry) => entry.surfaceId === surfaceId)
      if (printEntry?.kind === 'slide-scenes') printEntry.sceneIds = ['scene-delete-target']
    }, NOW)

    const deleted = deleteSlideScene(project, surfaceId, 'scene-delete-target', NOW)
    expect(deleted.revision).toBe(project.revision + 1)
    expect(slide(deleted).scenes.map((scene) => scene.id)).toEqual([firstId, 'scene-delete-last'])
    expect(deleted.locations.some((location) => location.id === 'scene-delete-target')).toBe(false)
    expect(deleted.startLocationId).toBe(firstId)
    expect(deleted.navigationGuards.map((guard) => guard.id)).toEqual(['guard-partial-source'])
    expect(deleted.navigationGuards[0]).toMatchObject({ toLocationIds: [firstId] })
    expect(deleted.navigationGuards[0]!.fromLocationIds).toEqual([firstId])
    expect(deleted.globalLayerItems[0]!.visibility).toEqual({ mode: 'all', locationIds: [] })
    const controller = deleted.globalLayerItems[0]!.item
    if (controller.kind !== 'native' || controller.content.nativeType !== 'teacher-controller') {
      throw new Error('expected teacher controller')
    }
    expect(controller.content.data.buttons.some((button) => button.id === 'go-deleted')).toBe(false)
    expect(controller.content.data.buttons).toMatchObject([
      { action: { type: 'scene.next' }, label: '下一场景', visible: true },
    ])
    expect(deleted.globalInteractions[0]!.conditions).toEqual([
      { type: 'scene.in', sceneIds: ['scene-delete-last'] },
    ])
    expect(deleted.globalInteractions[0]!.actions.map((step) => step.id)).toEqual(['action-keep'])
    expect(deleted.globalInteractions.map((rule) => rule.id)).toEqual(['rule-delete-reference'])
    const printEntry = deleted.mixedPrintPlan!.entries.find((entry) => entry.surfaceId === surfaceId)
    expect(printEntry?.kind === 'slide-scenes' ? printEntry.sceneIds : []).toEqual([
      firstId,
    ])
    expect(courseProjectDocumentSchema.parse(deleted)).toEqual(deleted)
  })
})
