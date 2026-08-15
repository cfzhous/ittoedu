import { beforeEach, describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { useEditorStore } from '@/renderer/store/editorStore'
import {
  activateV9SlidePresentationState,
  addV9SlidePresentationState,
  clearV9SlidePresentationStateOverrides,
  createV9SlideVerticalSliceState,
  deleteV9SlidePresentationState,
  duplicateV9SlidePresentationState,
  transformV9SlideVerticalSlice,
  redoV9SlideVerticalSlice,
  renameV9SlidePresentationState,
  selectV9SlideVerticalSlice,
  setInitialV9SlidePresentationState,
  setThumbnailV9SlidePresentationState,
  undoV9SlideVerticalSlice,
  V9_SLIDE_TEST_TEXT_ID,
} from '@/renderer/course/v9SlideVerticalSlice'

const NOW = '2026-08-15T10:00:00.000Z'

function sceneOf(state: ReturnType<typeof createV9SlideVerticalSliceState>) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected Slide location')
  const surface = state.history.present.surfaces.find((candidate) => candidate.id === location.surfaceId)
  if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
  return surface.scenes.find((candidate) => candidate.id === location.sceneId)!
}

describe('V9 Slide presentation-state session commands', () => {
  it('activates without history and commits every document mutation exactly once', () => {
    const initial = createV9SlideVerticalSliceState()
    const selected = selectV9SlideVerticalSlice(initial, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false,
    })
    const activatedBase = activateV9SlidePresentationState(selected, null)
    expect(activatedBase.history).toBe(initial.history)
    expect(activatedBase.selection).toMatchObject({ stateId: null, selectionIds: [] })
    expect(activatedBase.editingScope).toBe('scene')

    const added = addV9SlidePresentationState(activatedBase, '展开', NOW)
    const addedId = added.selection.stateId!
    expect(added.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(added.history.past).toEqual([initial.history.present])
    const duplicated = duplicateV9SlidePresentationState(added, addedId, NOW)
    const duplicateId = duplicated.selection.stateId!
    expect(duplicateId).not.toBe(addedId)
    expect(duplicated.history.present.revision).toBe(added.history.present.revision + 1)
    expect(duplicated.history.past).toHaveLength(2)

    const renamed = renameV9SlidePresentationState(duplicated, duplicateId, '讲解', NOW)
    const initialMarked = setInitialV9SlidePresentationState(renamed, duplicateId, NOW)
    const thumbnailMarked = setThumbnailV9SlidePresentationState(initialMarked, duplicateId, NOW)
    expect(renamed.history.present.revision).toBe(duplicated.history.present.revision + 1)
    expect(initialMarked.history.present.revision).toBe(renamed.history.present.revision + 1)
    expect(thumbnailMarked.history.present.revision).toBe(initialMarked.history.present.revision + 1)

    const selectedText = selectV9SlideVerticalSlice(thumbnailMarked, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false,
    })
    const moved = transformV9SlideVerticalSlice(selectedText, {
      nodes: [{
        nodeId: V9_SLIDE_TEST_TEXT_ID,
        x: 500,
        y: 360,
        width: 400,
        height: 80,
        rotation: 0,
      }],
    }, NOW)
    expect(sceneOf(moved).presentation!.states.find((state) => state.id === duplicateId)!
      .layerItemOverrides[V9_SLIDE_TEST_TEXT_ID]).toBeDefined()
    const cleared = clearV9SlidePresentationStateOverrides(moved, duplicateId, NOW)
    expect(cleared.history.present.revision).toBe(moved.history.present.revision + 1)
    expect(sceneOf(cleared).presentation!.states.find((state) => state.id === duplicateId)!
      .layerItemOverrides).toEqual({})

    const deleted = deleteV9SlidePresentationState(cleared, duplicateId, NOW)
    const presentation = sceneOf(deleted).presentation!
    expect(deleted.history.present.revision).toBe(cleared.history.present.revision + 1)
    expect(deleted.selection.stateId).toBe(presentation.initialStateId)
    expect(presentation.states.map((state) => state.id)).not.toContain(duplicateId)
    expect(courseProjectDocumentSchema.safeParse(deleted.history.present).success).toBe(true)

    const undone = undoV9SlideVerticalSlice(deleted)
    expect(sceneOf(undone).presentation!.states.map((state) => state.id)).toContain(duplicateId)
    const redone = redoV9SlideVerticalSlice(undone)
    expect(sceneOf(redone).presentation!.states.map((state) => state.id)).not.toContain(duplicateId)
  })

  it('rejects deleting the final named state', () => {
    const initial = createV9SlideVerticalSliceState()
    const onlyStateId = sceneOf(initial).presentation!.states[0]!.id
    expect(() => deleteV9SlidePresentationState(initial, onlyStateId, NOW))
      .toThrow('至少需要一个命名状态')
    expect(initial.history.past).toEqual([])
  })

  it('preserves a valid layer selection when deleting a different presentation state', () => {
    const initial = createV9SlideVerticalSliceState()
    const added = addV9SlidePresentationState(initial, '待删状态', NOW)
    const deletedStateId = added.selection.stateId!
    const retainedStateId = sceneOf(added).presentation!.initialStateId
    const active = activateV9SlidePresentationState(added, retainedStateId)
    const selected = selectV9SlideVerticalSlice(active, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false,
    })

    const deleted = deleteV9SlidePresentationState(selected, deletedStateId, NOW)

    expect(deleted.selection).toEqual(selected.selection)
    expect(deleted.editingScope).toBe(selected.editingScope)
    expect(sceneOf(deleted).presentation!.states.map((state) => state.id))
      .not.toContain(deletedStateId)
    expect(courseProjectDocumentSchema.safeParse(deleted.history.present).success).toBe(true)
  })
})

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

describe('V9 Slide presentation-state Store actions', () => {
  it('routes state actions through only the Course Project history', () => {
    const store = useEditorStore.getState()
    const legacyProject = store.project
    const legacyHistory = store.history
    store.activateV9SlideFixture()
    const initial = useEditorStore.getState().courseSession!
    const initialStateId = sceneOf(initial).presentation!.initialStateId

    store.activateCoursePresentationState(initialStateId)
    let current = useEditorStore.getState().courseSession!
    expect(current.history).toBe(initial.history)
    store.addCoursePresentationState('存储状态')
    current = useEditorStore.getState().courseSession!
    const addedId = current.selection.stateId!
    store.duplicateCoursePresentationState(addedId)
    current = useEditorStore.getState().courseSession!
    const duplicateId = current.selection.stateId!
    store.renameCoursePresentationState(duplicateId, '存储讲解')
    store.setInitialCoursePresentationState(duplicateId)
    store.setThumbnailCoursePresentationState(duplicateId)
    store.selectCourseLayers({ nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false })
    store.transformCourseLayers({
      nodes: [{
        nodeId: V9_SLIDE_TEST_TEXT_ID,
        x: 520,
        y: 380,
        width: 400,
        height: 80,
        rotation: 0,
      }],
    })
    store.clearCoursePresentationStateOverrides(duplicateId)
    store.deleteCoursePresentationState(duplicateId)
    current = useEditorStore.getState().courseSession!

    expect(current.history.present.revision).toBe(initial.history.present.revision + 8)
    expect(current.history.past).toHaveLength(8)
    expect(courseProjectDocumentSchema.safeParse(current.history.present).success).toBe(true)
    expect(useEditorStore.getState().project).toBe(legacyProject)
    expect(useEditorStore.getState().history).toBe(legacyHistory)
  })
})
