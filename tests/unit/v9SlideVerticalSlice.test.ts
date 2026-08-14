import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { useEditorStore } from '@/renderer/store/editorStore'
import {
  buildV9SlideWorkspaceSnapshot,
  createV9SlideVerticalSliceState,
  moveV9SlideVerticalSlice,
  resolveEditorStartupBackend,
  selectV9SlideVerticalSlice,
  V9_SLIDE_TEST_BACKEND,
  V9_SLIDE_TEST_QUERY,
  V9_SLIDE_TEST_TEXT_ID,
} from '@/renderer/course/v9SlideVerticalSlice'

const MOVE_NOW = '2026-08-15T02:05:00.000Z'

describe('test-only V9 Slide vertical slice', () => {
  it('enables the V9 backend for one exact startup query only', () => {
    expect(resolveEditorStartupBackend(V9_SLIDE_TEST_QUERY)).toBe(V9_SLIDE_TEST_BACKEND)
    for (const search of [
      '',
      '?editor-backend=v8',
      '?editor-backend=v9-slide-test&extra=1',
      '?extra=1&editor-backend=v9-slide-test',
      'editor-backend=v9-slide-test',
      '?editor-backend=V9-slide-test',
    ]) {
      expect(resolveEditorStartupBackend(search)).toBe('v8')
    }
  })

  it('projects one directly authored V9 text with its layerItemId unchanged', () => {
    const state = createV9SlideVerticalSliceState()
    const snapshot = buildV9SlideWorkspaceSnapshot(state)

    expect(courseProjectDocumentSchema.parse(state.history.present)).toEqual(state.history.present)
    expect(state.history.present).toMatchObject({
      schemaVersion: 9,
      id: 'v9-slide-vertical-slice',
    })
    expect(state.history.past).toEqual([])
    expect(state.history.future).toEqual([])
    expect(state.selection).toMatchObject({
      locationId: state.history.present.startLocationId,
      stateId: null,
      selectionId: null,
    })
    expect(snapshot.selectedNodeIds).toEqual([])
    expect(snapshot.componentPackages).toEqual({})
    expect(snapshot.document.nodes).toHaveLength(1)
    expect(snapshot.document.nodes[0]).toMatchObject({
      id: V9_SLIDE_TEST_TEXT_ID,
      name: 'V9 可移动文字',
      type: 'text',
      x: 440,
      y: 320,
      width: 400,
      height: 80,
      text: 'V9 可移动文字',
    })
  })

  it('selects and moves through V9 history exactly once without writing the V8 Store', () => {
    const v8ProjectBefore = structuredClone(useEditorStore.getState().project)
    const initial = createV9SlideVerticalSliceState()
    const initialProject = structuredClone(initial.history.present)
    const initialSnapshot = buildV9SlideWorkspaceSnapshot(initial)
    const selected = selectV9SlideVerticalSlice(initial, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID],
      additive: false,
    })
    const moved = moveV9SlideVerticalSlice(selected, {
      nodes: [{ nodeId: V9_SLIDE_TEST_TEXT_ID, x: 540, y: 387 }],
    }, MOVE_NOW)
    const movedSnapshot = buildV9SlideWorkspaceSnapshot(moved)

    expect(selected.history).toBe(initial.history)
    expect(selected.selection.selectionId).toBe(V9_SLIDE_TEST_TEXT_ID)
    expect(moved.selection.selectionId).toBe(V9_SLIDE_TEST_TEXT_ID)
    expect(moved.history.present.revision).toBe(selected.history.present.revision + 1)
    expect(moved.history.past).toEqual([selected.history.present])
    expect(moved.history.future).toEqual([])
    expect(movedSnapshot.selectedNodeIds).toEqual([V9_SLIDE_TEST_TEXT_ID])
    expect(movedSnapshot.document.nodes[0]).toMatchObject({ x: 540, y: 387 })
    expect(initialSnapshot.document.nodes[0]).toMatchObject({ x: 440, y: 320 })
    expect(initial.history.present).toEqual(initialProject)
    expect(useEditorStore.getState().project).toEqual(v8ProjectBefore)
  })

  it('keeps unknown, multi-node and non-finite bridge input as strict no-ops', () => {
    const state = createV9SlideVerticalSliceState()
    expect(selectV9SlideVerticalSlice(state, {
      nodeIds: ['missing-node'], additive: false,
    })).toBe(state)
    expect(selectV9SlideVerticalSlice(state, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID, 'missing-node'], additive: false,
    })).toBe(state)
    expect(selectV9SlideVerticalSlice(state, {
      nodeIds: [], additive: true,
    })).toBe(state)
    expect(moveV9SlideVerticalSlice(state, {
      nodes: [{ nodeId: 'missing-node', x: 1, y: 2 }],
    })).toBe(state)
    expect(moveV9SlideVerticalSlice(state, {
      nodes: [
        { nodeId: V9_SLIDE_TEST_TEXT_ID, x: 1, y: 2 },
        { nodeId: 'missing-node', x: 3, y: 4 },
      ],
    })).toBe(state)
    expect(moveV9SlideVerticalSlice(state, {
      nodes: [{ nodeId: V9_SLIDE_TEST_TEXT_ID, x: Number.NaN, y: 2 }],
    })).toBe(state)
    expect(moveV9SlideVerticalSlice(state, {
      nodes: [{ nodeId: V9_SLIDE_TEST_TEXT_ID, x: 1, y: Number.POSITIVE_INFINITY }],
    })).toBe(state)
  })

  it('uses additive selection as a stable single-ID toggle', () => {
    const state = createV9SlideVerticalSliceState()
    const selected = selectV9SlideVerticalSlice(state, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: true,
    })
    const cleared = selectV9SlideVerticalSlice(selected, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: true,
    })
    expect(selected.selection.selectionId).toBe(V9_SLIDE_TEST_TEXT_ID)
    expect(cleared.selection.selectionId).toBeNull()
    expect(cleared.history).toBe(state.history)
  })
})
