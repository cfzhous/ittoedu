import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { useEditorStore } from '@/renderer/store/editorStore'
import {
  addNativeVisualLayer,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import {
  buildV9SlideWorkspaceSnapshot,
  captureV9SlideVerticalSliceArchive,
  completeV9SlideVerticalSliceSave,
  createV9SlideVerticalSliceState,
  isV9SlideVerticalSliceDirty,
  nudgeV9SlideSelection,
  openV9SlideVerticalSliceState,
  redoV9SlideVerticalSlice,
  renameV9SlideVerticalSlice,
  resolveEditorStartupBackend,
  selectV9SlideVerticalSlice,
  setV9SlideEditingScope,
  transformV9SlideVerticalSlice,
  undoV9SlideVerticalSlice,
  V9_EDITOR_BACKEND,
  V9_SLIDE_TEST_BACKEND,
  V9_SLIDE_TEST_QUERY,
  V9_SLIDE_TEST_TEXT_ID,
} from '@/renderer/course/v9SlideVerticalSlice'

const MOVE_NOW = '2026-08-15T02:05:00.000Z'

function textTransform(x: number, y: number) {
  return {
    nodeId: V9_SLIDE_TEST_TEXT_ID,
    x,
    y,
    width: 400,
    height: 80,
    rotation: 0,
  }
}

function selectFixtureText(state: ReturnType<typeof createV9SlideVerticalSliceState>) {
  return selectV9SlideVerticalSlice(state, {
    nodeIds: [V9_SLIDE_TEST_TEXT_ID],
    additive: false,
  })
}

function stateWithShape() {
  const initial = createV9SlideVerticalSliceState()
  const location = initial.history.present.locations.find(
    (candidate) => candidate.id === initial.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected Slide location')
  const project = addNativeVisualLayer(initial.history.present, {
    surfaceId: location.surfaceId,
    sceneId: location.sceneId,
    nativeType: 'shape',
    shapeType: 'ellipse',
    id: 'v9-test-shape',
    x: 80,
    y: 90,
  })
  return openV9SlideVerticalSliceState({
    project,
    assetFiles: {},
    componentFiles: {},
  }, null)
}

describe('test-only V9 Slide vertical slice', () => {
  it('uses production V9 by default and reserves one exact query for the fixture', () => {
    expect(resolveEditorStartupBackend(V9_SLIDE_TEST_QUERY)).toBe(V9_SLIDE_TEST_BACKEND)
    for (const search of [
      '',
      '?editor-backend=v8',
      '?editor-backend=v9-slide-test&extra=1',
      '?extra=1&editor-backend=v9-slide-test',
      'editor-backend=v9-slide-test',
      '?editor-backend=V9-slide-test',
    ]) {
      expect(resolveEditorStartupBackend(search)).toBe(V9_EDITOR_BACKEND)
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
      selectionIds: [],
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
    expect(snapshot.previewDocument.nodes.map((node) => node.type)).toEqual([
      'teacher-controller',
      'text',
    ])
  })

  it('authors the global teacher controller in one history entry and preserves its frame on reopen', () => {
    const initial = createV9SlideVerticalSliceState()
    const controller = initial.history.present.globalLayerItems.find(
      (entry) => entry.item.kind === 'native' &&
        entry.item.content.nativeType === 'teacher-controller',
    )?.item
    if (!controller || controller.kind !== 'native') throw new Error('expected controller')

    const global = setV9SlideEditingScope(initial, 'global')
    const globalSnapshot = buildV9SlideWorkspaceSnapshot(global)
    const selected = selectV9SlideVerticalSlice(global, {
      nodeIds: [controller.layerItemId],
      additive: false,
    })
    const moved = transformV9SlideVerticalSlice(selected, {
      nodes: [{
        nodeId: controller.layerItemId,
        x: controller.frame.x + 37,
        y: controller.frame.y - 18,
        width: controller.frame.width,
        height: controller.frame.height,
        rotation: controller.rotation,
      }],
    }, MOVE_NOW)

    expect(globalSnapshot.document.nodes).toEqual([
      expect.objectContaining({
        id: controller.layerItemId,
        type: 'teacher-controller',
      }),
    ])
    expect(globalSnapshot.previewDocument.nodes.map((node) => node.id)).toEqual([
      controller.layerItemId,
      V9_SLIDE_TEST_TEXT_ID,
    ])
    expect(moved.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(moved.history.past).toEqual([initial.history.present])
    expect(moved.selection.selectionIds).toEqual([controller.layerItemId])
    expect(moved.history.present.globalLayerItems[0]!.item.frame).toMatchObject({
      x: controller.frame.x + 37,
      y: controller.frame.y - 18,
    })
    expect(undoV9SlideVerticalSlice(moved).history.present.globalLayerItems[0]!.item.frame)
      .toEqual(controller.frame)

    const bytes = createCourseProjectArchive(
      captureV9SlideVerticalSliceArchive(moved),
      { mtime: '2026-08-15T02:10:00.000Z' },
    )
    const reopened = setV9SlideEditingScope(openV9SlideVerticalSliceState(
      openCourseProjectArchive(bytes),
      'C:\\courseware\\global-controller.h5lesson',
    ), 'global')
    const reopenedController = buildV9SlideWorkspaceSnapshot(reopened).document.nodes[0]
    expect(reopenedController).toMatchObject({
      id: controller.layerItemId,
      type: 'teacher-controller',
      x: controller.frame.x + 37,
      y: controller.frame.y - 18,
    })
    expect(isV9SlideVerticalSliceDirty(reopened)).toBe(false)
  })

  it('flattens global, surface, and scene Native layers by unified order while proxies stay scope-local', () => {
    const initial = createV9SlideVerticalSliceState()
    const project = updateCourseProject(initial.history.present, (draft) => {
      const location = draft.locations.find((candidate) => candidate.id === draft.startLocationId)
      if (!location || location.kind !== 'slide-scene') throw new Error('expected location')
      const surface = draft.surfaces.find((candidate) => candidate.id === location.surfaceId)
      if (!surface || surface.type !== 'slide') throw new Error('expected surface')
      const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
      const sceneText = scene?.layerItems.find(
        (item) => item.layerItemId === V9_SLIDE_TEST_TEXT_ID,
      )
      if (!scene || !sceneText || sceneText.kind !== 'native') throw new Error('expected text')
      const globalText = structuredClone(sceneText)
      globalText.layerItemId = 'global-native-text'
      globalText.label = '全局文字'
      globalText.order = 10
      const surfaceText = structuredClone(sceneText)
      surfaceText.layerItemId = 'surface-native-text'
      surfaceText.label = '表面文字'
      surfaceText.order = 20
      sceneText.order = 30
      const controller = draft.globalLayerItems[0]!.item
      controller.order = 40
      draft.globalLayerItems.push({
        item: globalText,
        visibility: { mode: 'all', locationIds: [] },
      })
      draft.globalLayerItems.sort((left, right) => left.item.order - right.item.order)
      surface.surfaceLayerItems.push({
        item: surfaceText,
        visibility: { mode: 'all', locationIds: [] },
      })
      scene.layerItems.push({
        layerItemId: 'scene-runtime-gate',
        label: '暂不可编辑的动态内容',
        frame: { mode: 'absolute', x: 0, y: 0, width: 1280, height: 720 },
        order: 25,
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
        },
      })
      scene.layerItems.sort((left, right) => left.order - right.order)
    }, MOVE_NOW)
    const sceneState = openV9SlideVerticalSliceState({
      project,
      assetFiles: {},
      componentFiles: {},
    }, null)
    const sceneSnapshot = buildV9SlideWorkspaceSnapshot(sceneState)
    const globalSnapshot = buildV9SlideWorkspaceSnapshot(
      setV9SlideEditingScope(sceneState, 'global'),
    )
    const controllerId = project.globalLayerItems.find(
      (entry) => entry.item.kind === 'native' &&
        entry.item.content.nativeType === 'teacher-controller',
    )!.item.layerItemId

    expect(sceneSnapshot.document.nodes.map((node) => node.id)).toEqual([
      V9_SLIDE_TEST_TEXT_ID,
    ])
    expect(globalSnapshot.document.nodes.map((node) => node.id)).toEqual([
      'global-native-text',
      controllerId,
    ])
    expect(sceneSnapshot.previewDocument.nodes.map((node) => node.id)).toEqual([
      'global-native-text',
      'surface-native-text',
      V9_SLIDE_TEST_TEXT_ID,
      controllerId,
    ])
    expect(sceneSnapshot.previewDocument.nodes).not.toContainEqual(
      expect.objectContaining({ id: 'scene-runtime-gate' }),
    )
  })

  it('projects non-text scene Native layers and commits a multi-transform atomically', () => {
    const initial = stateWithShape()
    const snapshot = buildV9SlideWorkspaceSnapshot(initial)
    expect(snapshot.document.nodes.map(({ id, type }) => [id, type])).toEqual(
      expect.arrayContaining([
        [V9_SLIDE_TEST_TEXT_ID, 'text'],
        ['v9-test-shape', 'shape'],
      ]),
    )
    const selected = selectV9SlideVerticalSlice(initial, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID, 'v9-test-shape'],
      additive: false,
    })
    const transformed = transformV9SlideVerticalSlice(selected, {
      nodes: snapshot.document.nodes.map((node) => ({
        nodeId: node.id,
        x: node.x + (node.id === V9_SLIDE_TEST_TEXT_ID ? 10 : 11),
        y: node.y + (node.id === V9_SLIDE_TEST_TEXT_ID ? 20 : 21),
        width: node.width + 30,
        height: node.height + 40,
        rotation: node.rotation + 15,
      })),
    }, MOVE_NOW)
    const transformedSnapshot = buildV9SlideWorkspaceSnapshot(transformed)

    expect(transformed.selection.selectionIds).toEqual([
      V9_SLIDE_TEST_TEXT_ID,
      'v9-test-shape',
    ])
    expect(transformed.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(transformed.history.past).toEqual([initial.history.present])
    expect(transformedSnapshot.document.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: V9_SLIDE_TEST_TEXT_ID, x: 450, y: 340, width: 430, height: 120, rotation: 15 }),
      expect.objectContaining({ id: 'v9-test-shape', x: 91, y: 111, rotation: 15 }),
    ]))
  })

  it('allows selecting locked Native layers while keyboard nudge transforms only unlocked selection', () => {
    const unlocked = stateWithShape()
    const project = structuredClone(unlocked.history.present)
    const location = project.locations.find((candidate) => candidate.id === project.startLocationId)
    if (!location || location.kind !== 'slide-scene') throw new Error('expected Slide location')
    const surface = project.surfaces.find((candidate) => candidate.id === location.surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
    const shape = scene?.layerItems.find((candidate) => candidate.layerItemId === 'v9-test-shape')
    if (!shape) throw new Error('expected shape layer')
    shape.locked = true
    const initial = openV9SlideVerticalSliceState({
      project,
      assetFiles: {},
      componentFiles: {},
    }, null)
    const selected = selectV9SlideVerticalSlice(initial, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID, 'v9-test-shape'],
      additive: false,
    })
    const nudged = nudgeV9SlideSelection(selected, 3, -2, MOVE_NOW)
    const snapshot = buildV9SlideWorkspaceSnapshot(nudged)

    expect(selected.selection.selectionIds).toEqual([
      V9_SLIDE_TEST_TEXT_ID,
      'v9-test-shape',
    ])
    expect(nudged.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(nudged.history.past).toEqual([initial.history.present])
    expect(snapshot.document.nodes.find(({ id }) => id === V9_SLIDE_TEST_TEXT_ID))
      .toMatchObject({ x: 443, y: 318 })
    expect(snapshot.document.nodes.find(({ id }) => id === 'v9-test-shape'))
      .toMatchObject({ x: 80, y: 90, locked: true })
  })

  it('selects and transforms through V9 history exactly once without writing the V8 Store', () => {
    const v8ProjectBefore = structuredClone(useEditorStore.getState().project)
    const initial = createV9SlideVerticalSliceState()
    const initialProject = structuredClone(initial.history.present)
    const initialSnapshot = buildV9SlideWorkspaceSnapshot(initial)
    const selected = selectV9SlideVerticalSlice(initial, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID],
      additive: false,
    })
    const moved = transformV9SlideVerticalSlice(selected, {
      nodes: [textTransform(540, 387)],
    }, MOVE_NOW)
    const movedSnapshot = buildV9SlideWorkspaceSnapshot(moved)

    expect(selected.history).toBe(initial.history)
    expect(selected.selection.selectionIds).toEqual([V9_SLIDE_TEST_TEXT_ID])
    expect(moved.selection.selectionIds).toEqual([V9_SLIDE_TEST_TEXT_ID])
    expect(moved.history.present.revision).toBe(selected.history.present.revision + 1)
    expect(moved.history.past).toEqual([selected.history.present])
    expect(moved.history.future).toEqual([])
    expect(movedSnapshot.selectedNodeIds).toEqual([V9_SLIDE_TEST_TEXT_ID])
    expect(movedSnapshot.document.nodes[0]).toMatchObject({ x: 540, y: 387 })
    expect(initialSnapshot.document.nodes[0]).toMatchObject({ x: 440, y: 320 })
    expect(initial.history.present).toEqual(initialProject)
    expect(useEditorStore.getState().project).toEqual(v8ProjectBefore)
  })

  it('keeps unknown, duplicate and invalid transform input as strict no-ops', () => {
    const state = createV9SlideVerticalSliceState()
    const selected = selectFixtureText(state)
    expect(selectV9SlideVerticalSlice(state, {
      nodeIds: ['missing-node'], additive: false,
    })).toBe(state)
    expect(selectV9SlideVerticalSlice(state, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID, 'missing-node'], additive: false,
    })).toBe(state)
    expect(selectV9SlideVerticalSlice(state, {
      nodeIds: [], additive: true,
    })).toBe(state)
    expect(transformV9SlideVerticalSlice(selected, {
      nodes: [{ ...textTransform(1, 2), nodeId: 'missing-node' }],
    })).toBe(selected)
    expect(transformV9SlideVerticalSlice(selected, {
      nodes: [
        textTransform(1, 2),
        { ...textTransform(3, 4), nodeId: 'missing-node' },
      ],
    })).toBe(selected)
    expect(transformV9SlideVerticalSlice(selected, {
      nodes: [textTransform(Number.NaN, 2)],
    })).toBe(selected)
    expect(transformV9SlideVerticalSlice(selected, {
      nodes: [{ ...textTransform(1, 2), width: 0 }],
    })).toBe(selected)
    expect(transformV9SlideVerticalSlice(selected, {
      nodes: [textTransform(1, 2), textTransform(3, 4)],
    })).toBe(selected)
  })

  it('uses additive selection as a stable single-ID toggle', () => {
    const state = createV9SlideVerticalSliceState()
    const selected = selectV9SlideVerticalSlice(state, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: true,
    })
    const cleared = selectV9SlideVerticalSlice(selected, {
      nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: true,
    })
    expect(selected.selection.selectionIds).toEqual([V9_SLIDE_TEST_TEXT_ID])
    expect(cleared.selection.selectionIds).toEqual([])
    expect(cleared.history).toBe(state.history)
  })

  it('tracks dirty state by saved project identity across undo, redo and save', () => {
    const initial = createV9SlideVerticalSliceState()
    const selected = selectFixtureText(initial)
    const moved = transformV9SlideVerticalSlice(selected, {
      nodes: [textTransform(540, 387)],
    }, MOVE_NOW)
    const undone = undoV9SlideVerticalSlice(moved)
    const redone = redoV9SlideVerticalSlice(undone)
    const saved = completeV9SlideVerticalSliceSave(
      redone,
      captureV9SlideVerticalSliceArchive(redone),
      'C:\\courseware\\v9-slide.h5lesson',
    )
    const changedFromSaved = undoV9SlideVerticalSlice(saved)

    expect(isV9SlideVerticalSliceDirty(initial)).toBe(false)
    expect(isV9SlideVerticalSliceDirty(moved)).toBe(true)
    expect(isV9SlideVerticalSliceDirty(undone)).toBe(false)
    expect(buildV9SlideWorkspaceSnapshot(undone).document.nodes[0]).toMatchObject({
      id: V9_SLIDE_TEST_TEXT_ID,
      x: 440,
      y: 320,
    })
    expect(isV9SlideVerticalSliceDirty(redone)).toBe(true)
    expect(buildV9SlideWorkspaceSnapshot(redone).document.nodes[0]).toMatchObject({
      id: V9_SLIDE_TEST_TEXT_ID,
      x: 540,
      y: 387,
    })
    expect(isV9SlideVerticalSliceDirty(saved)).toBe(false)
    expect(saved.projectPath).toBe('C:\\courseware\\v9-slide.h5lesson')
    expect(isV9SlideVerticalSliceDirty(changedFromSaved)).toBe(true)
    const foreignSnapshot = captureV9SlideVerticalSliceArchive(
      createV9SlideVerticalSliceState(),
    )
    foreignSnapshot.project.id = 'another-course-project'
    expect(() => completeV9SlideVerticalSliceSave(
      saved,
      foreignSnapshot,
      'C:\\courseware\\other.h5lesson',
    )).toThrow('保存结果不属于当前课件工程')
  })

  it('updates the path but stays dirty when an older captured snapshot finishes saving', () => {
    const initial = createV9SlideVerticalSliceState()
    const selected = selectFixtureText(initial)
    const firstEdit = transformV9SlideVerticalSlice(selected, {
      nodes: [textTransform(500, 360)],
    }, MOVE_NOW)
    const captured = captureV9SlideVerticalSliceArchive(firstEdit)
    const secondEdit = transformV9SlideVerticalSlice(firstEdit, {
      nodes: [textTransform(530, 390)],
    }, '2026-08-15T02:06:00.000Z')
    const completed = completeV9SlideVerticalSliceSave(
      secondEdit,
      captured,
      'C:\\courseware\\concurrent-save.h5lesson',
    )

    expect(completed.projectPath).toBe('C:\\courseware\\concurrent-save.h5lesson')
    expect(completed.history.present).toBe(secondEdit.history.present)
    expect(isV9SlideVerticalSliceDirty(completed)).toBe(true)
  })

  it('renames through one V9 history entry and keeps empty or equal titles as no-ops', () => {
    const initial = createV9SlideVerticalSliceState()
    const renamed = renameV9SlideVerticalSlice(initial, '  苏轼与暴雨  ', MOVE_NOW)

    expect(renamed.history.present.title).toBe('苏轼与暴雨')
    expect(renamed.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(renamed.history.past).toEqual([initial.history.present])
    expect(isV9SlideVerticalSliceDirty(renamed)).toBe(true)
    expect(renameV9SlideVerticalSlice(renamed, '苏轼与暴雨')).toBe(renamed)
    expect(renameV9SlideVerticalSlice(renamed, '   ')).toBe(renamed)

    const undone = undoV9SlideVerticalSlice(renamed)
    expect(undone.history.present.title).toBe(initial.history.present.title)
    expect(isV9SlideVerticalSliceDirty(undone)).toBe(false)
    expect(redoV9SlideVerticalSlice(undone).history.present.title).toBe('苏轼与暴雨')
  })

  it('reopens a schemaVersion 9 archive with the exact text frame and stable ID', () => {
    const initial = createV9SlideVerticalSliceState()
    const selected = selectFixtureText(initial)
    const moved = transformV9SlideVerticalSlice(selected, {
      nodes: [textTransform(515.5, 366.25)],
    }, MOVE_NOW)
    const bytes = createCourseProjectArchive({
      project: moved.history.present,
      assetFiles: {},
      componentFiles: {},
    }, { mtime: '2026-08-15T02:10:00.000Z' })
    const opened = openCourseProjectArchive(bytes)
    const reopened = openV9SlideVerticalSliceState(
      opened,
      'C:\\courseware\\roundtrip.h5lesson',
    )
    const snapshot = buildV9SlideWorkspaceSnapshot(reopened)

    expect(opened.project.schemaVersion).toBe(9)
    expect(opened.assetFiles).toEqual({})
    expect(opened.componentFiles).toEqual({})
    expect(snapshot.document.nodes).toHaveLength(1)
    expect(snapshot.document.nodes[0]).toMatchObject({
      id: V9_SLIDE_TEST_TEXT_ID,
      text: 'V9 可移动文字',
      x: 515.5,
      y: 366.25,
    })
    expect(reopened.history.past).toEqual([])
    expect(reopened.history.future).toEqual([])
    expect(reopened.projectPath).toBe('C:\\courseware\\roundtrip.h5lesson')
    expect(isV9SlideVerticalSliceDirty(reopened)).toBe(false)
  })

  it('keeps archive asset sidecars attached for a lossless subsequent save', () => {
    const initial = createV9SlideVerticalSliceState()
    const project = structuredClone(initial.history.present)
    const bytes = new Uint8Array([0, 1, 2, 3])
    project.assets.diagram = {
      id: 'diagram',
      filename: 'diagram.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/diagram.bin',
      byteLength: bytes.byteLength,
      width: 2,
      height: 2,
    }
    const state = openV9SlideVerticalSliceState({
      project,
      assetFiles: { diagram: bytes },
      componentFiles: {},
    }, 'C:\\courseware\\with-assets.h5lesson')
    const reopened = openCourseProjectArchive(createCourseProjectArchive({
      project: state.history.present,
      assetFiles: state.assetFiles,
      componentFiles: state.componentFiles,
    }))

    expect(reopened.assetFiles.diagram).toEqual(bytes)
    expect(reopened.project.assets.diagram).toEqual(project.assets.diagram)
  })
})
