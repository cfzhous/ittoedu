import { beforeEach, describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { useEditorStore } from '@/renderer/store/editorStore'
import {
  activateV9SlideScene,
  addV9SlideScene,
  buildV9SlideWorkspaceSnapshot,
  createV9SlideVerticalSliceState,
  deleteV9SlideScene,
  duplicateV9SlideScene,
  redoV9SlideVerticalSlice,
  renameV9SlideScene,
  reorderV9SlideScenes,
  selectV9SlideVerticalSlice,
  setV9SlideEditingScope,
  undoV9SlideVerticalSlice,
  V9_SLIDE_TEST_TEXT_ID,
} from '@/renderer/course/v9SlideVerticalSlice'

const NOW = '2026-08-15T09:00:00.000Z'

function activeSceneId(state: ReturnType<typeof createV9SlideVerticalSliceState>) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected active Slide location')
  return location.sceneId
}

function sceneIds(state: ReturnType<typeof createV9SlideVerticalSliceState>) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected active Slide location')
  const surface = state.history.present.surfaces.find((candidate) => candidate.id === location.surfaceId)
  if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
  return surface.scenes.map((scene) => scene.id)
}

describe('V9 Slide scene session commands', () => {
  it('keeps scope and activation session-only while clearing layer selection', () => {
    const initial = createV9SlideVerticalSliceState()
    const selected = selectV9SlideVerticalSlice(initial, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false,
    })
    const global = setV9SlideEditingScope(selected, 'global')
    const activated = activateV9SlideScene(global, activeSceneId(initial))

    expect(global.history).toBe(initial.history)
    expect(global.editingScope).toBe('global')
    expect(global.selection.selectionIds).toEqual([])
    const globalSnapshot = buildV9SlideWorkspaceSnapshot(global)
    const controller = globalSnapshot.document.nodes.find(
      (node) => node.type === 'teacher-controller',
    )
    expect(controller).toBeDefined()
    expect(selectV9SlideVerticalSlice(global, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false,
    })).toBe(global)
    expect(selectV9SlideVerticalSlice(global, {
      nodeIds: [controller!.id], additive: false,
    }).selection.selectionIds).toEqual([controller!.id])
    expect(activated.history).toBe(initial.history)
    expect(activated.editingScope).toBe('scene')
    expect(activated.selection).toMatchObject({ stateId: null, selectionIds: [] })
  })

  it('commits each scene mutation through exactly one revision and supports undo/redo', () => {
    const initial = createV9SlideVerticalSliceState()
    const originalId = activeSceneId(initial)
    const added = addV9SlideScene(initial, NOW)
    const addedId = activeSceneId(added)
    expect(addedId).not.toBe(originalId)
    expect(added.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(added.history.past).toEqual([initial.history.present])
    expect(added.editingScope).toBe('scene')
    expect(added.selection.selectionIds).toEqual([])

    const renamed = renameV9SlideScene(added, addedId, '新场景', NOW)
    expect(renamed.history.present.revision).toBe(added.history.present.revision + 1)
    expect(renamed.history.past).toHaveLength(2)
    const duplicated = duplicateV9SlideScene(renamed, addedId, NOW)
    const duplicateId = activeSceneId(duplicated)
    expect(duplicateId).not.toBe(addedId)
    expect(duplicated.history.present.revision).toBe(renamed.history.present.revision + 1)
    expect(duplicated.history.past).toHaveLength(3)

    const reorderedIds = [...sceneIds(duplicated)].reverse()
    const reordered = reorderV9SlideScenes(duplicated, reorderedIds, NOW)
    expect(sceneIds(reordered)).toEqual(reorderedIds)
    expect(reordered.history.present.revision).toBe(duplicated.history.present.revision + 1)
    expect(reordered.history.past).toHaveLength(4)
    expect(activeSceneId(reordered)).toBe(duplicateId)

    const deleted = deleteV9SlideScene(reordered, duplicateId, NOW)
    const duplicateIndex = reorderedIds.indexOf(duplicateId)
    const expectedFallback = reorderedIds[duplicateIndex - 1] ?? reorderedIds[duplicateIndex + 1]
    expect(activeSceneId(deleted)).toBe(expectedFallback)
    expect(deleted.history.present.revision).toBe(reordered.history.present.revision + 1)
    expect(deleted.history.past).toHaveLength(5)
    expect(sceneIds(deleted)).not.toContain(duplicateId)
    expect(courseProjectDocumentSchema.parse(deleted.history.present)).toEqual(deleted.history.present)

    const undone = undoV9SlideVerticalSlice(deleted)
    expect(sceneIds(undone)).toContain(duplicateId)
    expect(courseProjectDocumentSchema.safeParse(undone.history.present).success).toBe(true)
    const redone = redoV9SlideVerticalSlice(undone)
    expect(sceneIds(redone)).not.toContain(duplicateId)
    expect(courseProjectDocumentSchema.safeParse(redone.history.present).success).toBe(true)
  })

  it('keeps empty/equal rename and equal reorder as identity no-ops', () => {
    const initial = createV9SlideVerticalSliceState()
    const id = activeSceneId(initial)
    expect(renameV9SlideScene(initial, id, '   ')).toBe(initial)
    const surface = initial.history.present.surfaces[0]
    if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
    expect(renameV9SlideScene(initial, id, surface.scenes[0]!.name)).toBe(initial)
    expect(reorderV9SlideScenes(initial, [id])).toBe(initial)
  })

  it('deletes an inactive scene without switching or clearing a valid active selection', () => {
    const initial = createV9SlideVerticalSliceState()
    const originalId = activeSceneId(initial)
    const added = addV9SlideScene(initial, NOW)
    const inactiveId = activeSceneId(added)
    const original = activateV9SlideScene(added, originalId)
    const selected = selectV9SlideVerticalSlice(original, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false,
    })
    const deleted = deleteV9SlideScene(selected, inactiveId, NOW)

    expect(activeSceneId(deleted)).toBe(originalId)
    expect(deleted.selection).toEqual(selected.selection)
    expect(deleted.editingScope).toBe(selected.editingScope)
    expect(deleted.history.present.revision).toBe(selected.history.present.revision + 1)
    expect(sceneIds(deleted)).not.toContain(inactiveId)
    expect(courseProjectDocumentSchema.safeParse(deleted.history.present).success).toBe(true)
  })
})

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

describe('V9 Slide scene Store actions', () => {
  it('exposes typed scene actions without touching legacy history', () => {
    const store = useEditorStore.getState()
    const legacyProject = store.project
    const legacyHistory = store.history
    store.activateV9SlideFixture()
    const initial = useEditorStore.getState().courseSession!
    const initialId = activeSceneId(initial)

    store.selectCourseLayers({ nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false })
    store.setCourseEditingScope('global')
    let current = useEditorStore.getState().courseSession!
    expect(current.editingScope).toBe('global')
    expect(current.selection.selectionIds).toEqual([])
    expect(current.history).toBe(initial.history)

    store.activateCourseScene(initialId)
    store.addCourseScene()
    current = useEditorStore.getState().courseSession!
    const addedId = activeSceneId(current)
    expect(current.history.past).toHaveLength(1)
    store.renameCourseScene(addedId, '存储场景')
    store.duplicateCourseScene(addedId)
    current = useEditorStore.getState().courseSession!
    const duplicateId = activeSceneId(current)
    store.reorderCourseScenes([...sceneIds(current)].reverse())
    store.deleteCourseScene(duplicateId)
    current = useEditorStore.getState().courseSession!

    expect(current.history.past).toHaveLength(5)
    expect(current.history.present.revision).toBe(initial.history.present.revision + 5)
    expect(courseProjectDocumentSchema.safeParse(current.history.present).success).toBe(true)
    expect(useEditorStore.getState().project).toBe(legacyProject)
    expect(useEditorStore.getState().history).toBe(legacyHistory)
  })
})
