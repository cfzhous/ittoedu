import { describe, expect, it } from 'vitest'
import {
  addSlidePresentationState,
  addSlideScene,
  addSlideTextLayer,
  clearSlidePresentationStateOverrides,
  createCourseProject,
  deleteSlidePresentationState,
  duplicateSlidePresentationState,
  renameSlidePresentationState,
  setInitialSlidePresentationState,
  setThumbnailSlidePresentationState,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-15T09:30:00.000Z'

function activeSlide(project: ReturnType<typeof createCourseProject>) {
  const surface = project.surfaces[0]
  if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
  return surface
}

describe('Course Studio Slide presentation-state commands', () => {
  it('adds, duplicates, renames, marks and clears a state with one revision each', () => {
    let project = createCourseProject({ id: 'state-edit', now: NOW })
    const surfaceId = activeSlide(project).id
    const sceneId = activeSlide(project).scenes[0]!.id
    project = addSlideTextLayer(project, surfaceId, sceneId, '状态文字', {
      id: 'state-text', now: NOW,
    })
    const added = addSlidePresentationState(project, surfaceId, sceneId, '展开', {
      id: 'state-reveal', now: NOW,
    })
    expect(added.revision).toBe(project.revision + 1)
    project = updateCourseProject(added, (draft) => {
      const surface = draft.surfaces[0]
      if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
      const scene = surface.scenes[0]!
      const state = scene.presentation!.states.find((candidate) => candidate.id === 'state-reveal')!
      state.backgroundColor = '#112233'
      state.backgroundAssetId = null
      state.layerItemOverrides['state-text'] = { visible: false }
      state.layerItemOrder = ['state-text']
      scene.interactions = [{
        id: 'state-condition',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [{ type: 'presentation.in', stateIds: ['state-reveal'] }],
        actions: [{
          id: 'state-next',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.next' },
        }],
      }]
    }, NOW)

    const duplicated = duplicateSlidePresentationState(
      project,
      surfaceId,
      sceneId,
      'state-reveal',
      { id: 'state-copy', now: NOW },
    )
    expect(duplicated.revision).toBe(project.revision + 1)
    let scene = activeSlide(duplicated).scenes[0]!
    const copy = scene.presentation!.states.find((state) => state.id === 'state-copy')!
    expect(copy).toMatchObject({
      name: '展开 副本',
      backgroundColor: '#112233',
      backgroundAssetId: null,
      layerItemOverrides: { 'state-text': { visible: false } },
      layerItemOrder: ['state-text'],
    })
    expect(scene.interactions[0]!.conditions[0]).toEqual({
      type: 'presentation.in', stateIds: ['state-reveal', 'state-copy'],
    })

    const renamed = renameSlidePresentationState(
      duplicated, surfaceId, sceneId, 'state-copy', '  讲解  ', NOW,
    )
    const initial = setInitialSlidePresentationState(
      renamed, surfaceId, sceneId, 'state-copy', NOW,
    )
    const thumbnail = setThumbnailSlidePresentationState(
      initial, surfaceId, sceneId, 'state-copy', NOW,
    )
    const cleared = clearSlidePresentationStateOverrides(
      thumbnail, surfaceId, sceneId, 'state-copy', NOW,
    )
    expect(renamed.revision).toBe(duplicated.revision + 1)
    expect(initial.revision).toBe(renamed.revision + 1)
    expect(thumbnail.revision).toBe(initial.revision + 1)
    expect(cleared.revision).toBe(thumbnail.revision + 1)
    scene = activeSlide(cleared).scenes[0]!
    expect(scene.presentation).toMatchObject({
      initialStateId: 'state-copy',
      thumbnailStateId: 'state-copy',
    })
    expect(scene.presentation!.states.find((state) => state.id === 'state-copy')).toEqual({
      id: 'state-copy',
      name: '讲解',
      layerItemOverrides: {},
    })
    expect(courseProjectDocumentSchema.parse(cleared)).toEqual(cleared)
  })

  it('deletes a state while repairing local and cross-scene references', () => {
    let project = createCourseProject({ id: 'state-delete', now: NOW })
    const surfaceId = activeSlide(project).id
    const sceneId = activeSlide(project).scenes[0]!.id
    project = addSlidePresentationState(project, surfaceId, sceneId, '待删除', {
      id: 'state-delete-target', now: NOW,
    })
    project = addSlideScene(project, surfaceId, { id: 'state-other-scene', now: NOW })
    project = updateCourseProject(project, (draft) => {
      const surface = draft.surfaces[0]
      if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
      const scene = surface.scenes.find((candidate) => candidate.id === sceneId)!
      scene.presentation!.initialStateId = 'state-delete-target'
      scene.presentation!.thumbnailStateId = 'state-delete-target'
      draft.locations.push({
        id: 'location-delete-state',
        label: '待删除状态位置',
        kind: 'slide-scene',
        surfaceId,
        sceneId,
        stateId: 'state-delete-target',
      })
      scene.interactions = [
        {
          id: 'trigger-deleted-state',
          enabled: true,
          trigger: { type: 'presentation.enter', stateId: 'state-delete-target' },
          conditions: [],
          actions: [{
            id: 'trigger-action',
            start: 'after-previous',
            delayMs: 0,
            action: { type: 'scene.replay' },
          }],
        },
        {
          id: 'partial-state-reference',
          enabled: true,
          trigger: { type: 'scene.enter' },
          conditions: [{
            type: 'presentation.in',
            stateIds: ['state_initial', 'state-delete-target'],
          }],
          actions: [
            {
              id: 'set-deleted-state',
              start: 'after-previous',
              delayMs: 0,
              action: { type: 'presentation.set', stateId: 'state-delete-target' },
            },
            {
              id: 'keep-after-delete',
              start: 'with-previous',
              delayMs: 0,
              action: { type: 'node.enter', nodeId: draft.globalLayerItems[0]!.item.layerItemId, durationMs: 100, easing: 'linear', effect: 'fade' },
            },
          ],
        },
        {
          id: 'dangling-completion',
          enabled: true,
          trigger: { type: 'animation.completed', actionId: 'set-deleted-state' },
          conditions: [],
          actions: [{
            id: 'completion-action',
            start: 'after-previous',
            delayMs: 0,
            action: { type: 'scene.replay' },
          }],
        },
      ]
      const other = surface.scenes.find((candidate) => candidate.id === 'state-other-scene')!
      other.interactions = [{
        id: 'other-go-state',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [{
          id: 'other-go-action',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.go', sceneId, targetStateId: 'state-delete-target' },
        }],
      }]
      draft.globalInteractions = [{
        id: 'global-go-state',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [{
          id: 'global-go-action',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.go', sceneId, targetStateId: 'state-delete-target' },
        }],
      }]
      const controller = draft.globalLayerItems[0]!.item
      if (controller.kind !== 'native' || controller.content.nativeType !== 'teacher-controller') {
        throw new Error('expected teacher controller')
      }
      controller.content.data.buttons.push({
        id: 'controller-go-state',
        label: '去命名状态',
        visible: true,
        action: { type: 'scene.go', sceneId, targetStateId: 'state-delete-target' },
      })
    }, NOW)

    const deleted = deleteSlidePresentationState(
      project, surfaceId, sceneId, 'state-delete-target', NOW,
    )
    expect(deleted.revision).toBe(project.revision + 1)
    const scene = activeSlide(deleted).scenes.find((candidate) => candidate.id === sceneId)!
    expect(scene.presentation).toMatchObject({
      initialStateId: 'state_initial',
      thumbnailStateId: 'state_initial',
      states: [{ id: 'state_initial' }],
    })
    const stateLocation = deleted.locations.find((location) => location.id === 'location-delete-state')
    expect(stateLocation?.kind).toBe('slide-scene')
    expect(stateLocation && 'stateId' in stateLocation ? stateLocation.stateId : undefined).toBeUndefined()
    expect(scene.interactions.map((rule) => rule.id)).toEqual(['partial-state-reference'])
    expect(scene.interactions[0]!.conditions).toEqual([
      { type: 'presentation.in', stateIds: ['state_initial'] },
    ])
    expect(scene.interactions[0]!.actions).toHaveLength(1)
    expect(scene.interactions[0]!.actions[0]).toMatchObject({
      id: 'keep-after-delete', start: 'after-previous',
    })
    const otherAction = activeSlide(deleted).scenes.find((candidate) => candidate.id === 'state-other-scene')!
      .interactions[0]!.actions[0]!.action
    expect(otherAction).toEqual({ type: 'scene.go', sceneId })
    expect(deleted.globalInteractions[0]!.actions[0]!.action).toEqual({ type: 'scene.go', sceneId })
    const controller = deleted.globalLayerItems[0]!.item
    if (controller.kind !== 'native' || controller.content.nativeType !== 'teacher-controller') {
      throw new Error('expected teacher controller')
    }
    expect(controller.content.data.buttons.find((button) => button.id === 'controller-go-state')?.action)
      .toEqual({ type: 'scene.go', sceneId })
    expect(courseProjectDocumentSchema.parse(deleted)).toEqual(deleted)
    expect(() => deleteSlidePresentationState(
      deleted, surfaceId, sceneId, 'state_initial', NOW,
    )).toThrow('至少需要一个命名状态')
  })
})
