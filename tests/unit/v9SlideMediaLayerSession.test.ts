import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type { AssetMeta } from '@/shared/projectTypes'
import { useEditorStore } from '@/renderer/store/editorStore'
import {
  buildV9SlideWorkspaceSnapshot,
  captureV9SlideVerticalSliceArchive,
  completeV9SlideVerticalSliceSave,
  createV9CourseEditorState,
  isV9SlideVerticalSliceDirty,
  openV9SlideVerticalSliceState,
  redoV9SlideVerticalSlice,
  addV9SlideMediaLayers,
  addV9SlidePresentationState,
  activateV9SlidePresentationState,
  clearV9SlideSceneBackgroundOverride,
  importV9SlideAssets,
  registeredV9SlideAssetFiles,
  setV9SlideSceneBackgroundAsset,
  setV9SlideSceneBackgroundColor,
  transformV9SlideVerticalSlice,
  selectV9SlideVerticalSlice,
  undoV9SlideVerticalSlice,
  updateV9SlideNativeNode,
  V9_MEDIA_BATCH_LIMIT,
  type V9SlideMediaInsertItem,
} from '@/renderer/course/v9SlideVerticalSlice'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'

const NOW = '2026-08-15T03:00:00.000Z'

function imageItem(id: string, overrides: Partial<AssetMeta> = {}): V9SlideMediaInsertItem {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
  return {
    meta: {
      id,
      filename: `${id}.png`,
      mimeType: 'image/png',
      kind: 'image',
      path: `assets/${id}.png`,
      byteLength: bytes.byteLength,
      width: 800,
      height: 600,
      ...overrides,
    },
    bytes,
  }
}

function videoItem(id: string, overrides: Partial<AssetMeta> = {}): V9SlideMediaInsertItem {
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5])
  return {
    meta: {
      id,
      filename: `${id}.mp4`,
      mimeType: 'video/mp4',
      kind: 'video',
      path: `assets/${id}.mp4`,
      byteLength: bytes.byteLength,
      duration: 12.5,
      width: 1280,
      height: 720,
      ...overrides,
    },
    bytes,
  }
}

function sceneLayerIds(state: ReturnType<typeof createV9CourseEditorState>): string[] {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected Slide location')
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('expected Slide surface')
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  if (!scene) throw new Error('expected scene')
  return scene.layerItems.map((item) => item.layerItemId)
}

describe('V9 media authoring session (image/video/background)', () => {
  it('inserts one image with its asset in a single history entry and selects it', () => {
    const initial = createV9CourseEditorState()
    const item = imageItem('asset_photo')
    const state = addV9SlideMediaLayers(initial, 'image', [item], undefined, undefined, NOW)

    expect(courseProjectDocumentSchema.parse(state.history.present)).toEqual(state.history.present)
    expect(state.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(state.history.past).toEqual([initial.history.present])
    expect(state.history.future).toEqual([])
    expect(state.assetFiles.asset_photo).toEqual(item.bytes)
    expect(state.history.present.assets.asset_photo).toMatchObject({
      id: 'asset_photo',
      kind: 'image',
      byteLength: item.bytes.byteLength,
    })
    const ids = sceneLayerIds(state)
    expect(ids).toHaveLength(1)
    const layerItemId = ids[0]!
    expect(layerItemId).toMatch(/^image-/)
    expect(state.selection.selectionIds).toEqual([layerItemId])
    const layer = state.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide'
        ? surface.scenes.flatMap((scene) => scene.layerItems)
        : [])
      .find((candidate) => candidate.layerItemId === layerItemId)
    expect(layer).toMatchObject({
      kind: 'native',
      label: '图片',
      content: {
        nativeType: 'image',
        data: { assetId: 'asset_photo', preserveAspectRatio: true },
      },
    })
    const snapshot = buildV9SlideWorkspaceSnapshot(state)
    expect(snapshot.document.nodes.find((node) => node.id === layerItemId)).toMatchObject({
      type: 'image',
      assetId: 'asset_photo',
      width: 640,
      height: 480,
    })
    expect(snapshot.selectedNodeIds).toEqual([layerItemId])
  })

  it('inserts videos at native aspect with a grid layout for a small batch', () => {
    const initial = createV9CourseEditorState()
    const state = addV9SlideMediaLayers(
      initial,
      'video',
      [videoItem('asset_v1'), videoItem('asset_v2', { width: 640, height: 480 })],
      undefined,
      undefined,
      NOW,
    )
    const ids = sceneLayerIds(state)
    expect(ids).toHaveLength(2)
    expect(state.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(state.history.past).toEqual([initial.history.present])
    expect(state.selection.selectionIds).toEqual(ids)
    const nodes = buildV9SlideWorkspaceSnapshot(state).document.nodes
    expect(nodes.every((node) => node.type === 'video')).toBe(true)
    const first = nodes.find((node) => node.id === ids[0])!
    const second = nodes.find((node) => node.id === ids[1])!
    // Batch grid scales the 1280x720 clip while preserving its 16:9 aspect.
    expect(first.width / first.height).toBeCloseTo(16 / 9, 2)
    // Non-overlapping grid rows place the two videos at different y positions.
    expect(second.y).not.toBe(first.y)
    expect(state.history.present.assets.asset_v1).toBeDefined()
    expect(state.history.present.assets.asset_v2).toBeDefined()
  })

  it('rejects oversized batches, empty batches and asset id collisions', () => {
    const initial = createV9CourseEditorState()
    expect(addV9SlideMediaLayers(initial, 'image', [])).toBe(initial)
    const oversized = Array.from({ length: V9_MEDIA_BATCH_LIMIT + 1 }, (_, index) =>
      imageItem(`asset_${index}`))
    expect(() => addV9SlideMediaLayers(initial, 'image', oversized))
      .toThrow(`一次最多添加 ${V9_MEDIA_BATCH_LIMIT} 个媒体元素`)
    expect(() => addV9SlideMediaLayers(initial, 'image', [
      imageItem('asset_x'),
      imageItem('asset_x', { filename: 'other.png' }),
    ])).toThrow('素材 ID 冲突')
  })

  it('edits generic properties of a media layer and rejects media-specific fields', () => {
    const initial = createV9CourseEditorState()
    const state = addV9SlideMediaLayers(initial, 'image', [imageItem('asset_photo')], undefined, undefined, NOW)
    const layerItemId = state.selection.selectionIds[0]!
    const updated = updateV9SlideNativeNode(state, layerItemId, {
      x: 123,
      y: 45,
      rotation: 15,
      opacity: 0.5,
      width: 300,
      height: 225,
    }, NOW)
    expect(updated.history.present.revision).toBe(state.history.present.revision + 1)
    const node = buildV9SlideWorkspaceSnapshot(updated).document.nodes.find(
      (candidate) => candidate.id === layerItemId,
    )!
    expect(node).toMatchObject({ x: 123, y: 45, rotation: 15, opacity: 0.5, width: 300, height: 225 })
    expect(() => updateV9SlideNativeNode(state, layerItemId, {
      fit: 'cover',
    } as never)).toThrow('当前元素暂不支持修改这项属性')
    expect(() => updateV9SlideNativeNode(state, layerItemId, {
      assetId: 'asset_other',
    } as never)).toThrow('当前元素暂不支持修改这项属性')
  })

  it('selects and transforms inserted media layers through one V9 history entry', () => {
    const initial = createV9CourseEditorState()
    const state = addV9SlideMediaLayers(initial, 'image', [imageItem('asset_photo')], undefined, undefined, NOW)
    const layerItemId = state.selection.selectionIds[0]!
    const transformed = transformV9SlideVerticalSlice(state, {
      nodes: [{
        nodeId: layerItemId,
        x: 100,
        y: 200,
        width: 320,
        height: 240,
        rotation: 0,
      }],
    }, NOW)
    expect(transformed.history.present.revision).toBe(state.history.present.revision + 1)
    expect(buildV9SlideWorkspaceSnapshot(transformed).document.nodes[0])
      .toMatchObject({ x: 100, y: 200, width: 320, height: 240 })
    const selectionAfter = selectV9SlideVerticalSlice(transformed, {
      nodeIds: [layerItemId],
      additive: false,
    })
    expect(selectionAfter.selection.selectionIds).toEqual([layerItemId])
  })

  it('survives save/reopen with the asset bytes and the stable layer id', () => {
    const initial = createV9CourseEditorState()
    const state = addV9SlideMediaLayers(initial, 'image', [imageItem('asset_photo')], undefined, undefined, NOW)
    const layerItemId = state.selection.selectionIds[0]!
    const bytes = createCourseProjectArchive(
      captureV9SlideVerticalSliceArchive(state),
      { mtime: '2026-08-15T03:10:00.000Z' },
    )
    const reopened = openV9SlideVerticalSliceState(
      openCourseProjectArchive(bytes),
      'C:\\courseware\\media.h5lesson',
    )
    expect(reopened.assetFiles.asset_photo).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    expect(reopened.history.present.assets.asset_photo).toMatchObject({ id: 'asset_photo' })
    expect(isV9SlideVerticalSliceDirty(reopened)).toBe(false)
    const node = buildV9SlideWorkspaceSnapshot(reopened).document.nodes.find(
      (candidate) => candidate.id === layerItemId,
    )!
    expect(node).toMatchObject({ id: layerItemId, type: 'image', assetId: 'asset_photo' })
  })

  it('undoes and redoes media insertion while keeping save valid after undo', () => {
    const initial = createV9CourseEditorState()
    const state = addV9SlideMediaLayers(initial, 'video', [videoItem('asset_clip')], undefined, undefined, NOW)
    const layerItemId = state.selection.selectionIds[0]!
    const undone = undoV9SlideVerticalSlice(state)
    expect(undone.history.present.assets.asset_clip).toBeUndefined()
    expect(undone.history.present.revision).toBe(initial.history.present.revision)
    expect(sceneLayerIds(undone)).toEqual([])
    // Raw session bytes survive undo so a later redo can render the asset.
    expect(undone.assetFiles.asset_clip).toBeDefined()
    // Save after undo must not fail with unregistered asset files.
    const archive = captureV9SlideVerticalSliceArchive(undone)
    expect(archive.assetFiles.asset_clip).toBeUndefined()
    expect(() => createCourseProjectArchive(archive, { mtime: NOW })).not.toThrow()

    const redone = redoV9SlideVerticalSlice(undone)
    expect(redone.history.present.assets.asset_clip).toBeDefined()
    expect(sceneLayerIds(redone)).toEqual([layerItemId])
    const redoneArchive = captureV9SlideVerticalSliceArchive(redone)
    expect(redoneArchive.assetFiles.asset_clip).toBeDefined()
    expect(() => createCourseProjectArchive(redoneArchive, { mtime: NOW })).not.toThrow()

    // Dirty: back to the exact saved project with the exact registered files is clean.
    const saved = completeV9SlideVerticalSliceSave(
      state,
      captureV9SlideVerticalSliceArchive(state),
      'C:\\courseware\\media.h5lesson',
    )
    expect(isV9SlideVerticalSliceDirty(saved)).toBe(false)
    expect(isV9SlideVerticalSliceDirty(undoV9SlideVerticalSlice(saved))).toBe(true)
    expect(isV9SlideVerticalSliceDirty(redoV9SlideVerticalSlice(undoV9SlideVerticalSlice(saved)))).toBe(false)
  })

  it('imports assets library-only and keeps registered views in sync', () => {
    const initial = createV9CourseEditorState()
    const state = importV9SlideAssets(initial, [imageItem('asset_lib')], NOW)
    expect(state.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(state.history.present.assets.asset_lib).toBeDefined()
    expect(state.assetFiles.asset_lib).toBeDefined()
    expect(sceneLayerIds(state)).toEqual([])
    expect(registeredV9SlideAssetFiles(state.history.present, state.assetFiles).asset_lib)
      .toBeDefined()
    expect(registeredV9SlideAssetFiles(
      undoV9SlideVerticalSlice(state).history.present,
      state.assetFiles,
    ).asset_lib).toBeUndefined()
  })

  it('edits the base scene background color and asset with save/reopen', () => {
    const initial = createV9CourseEditorState()
    const colorState = setV9SlideSceneBackgroundColor(initial, '#ffcc00', NOW)
    expect(colorState.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(() => setV9SlideSceneBackgroundAsset(colorState, { assetId: 'asset_missing' }))
      .toThrow('找不到素材')
    const withAsset = addV9SlideMediaLayers(colorState, 'image', [imageItem('asset_photo')], undefined, undefined, NOW)
    const setState = setV9SlideSceneBackgroundAsset(withAsset, { assetId: 'asset_photo' }, NOW)
    const scene = setState.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .find(() => true)!
    expect(scene).toMatchObject({
      backgroundColor: '#ffcc00',
      backgroundAssetId: 'asset_photo',
    })
    expect(() => setV9SlideSceneBackgroundColor(initial, 'not-a-color')).toThrow('背景颜色必须是 #RRGGBB 格式')

    const cleared = setV9SlideSceneBackgroundAsset(setState, { assetId: null }, NOW)
    const clearedScene = cleared.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .find(() => true)!
    expect(clearedScene.backgroundAssetId).toBeNull()
    expect(clearedScene.backgroundColor).toBe('#ffcc00')

    const bytes = createCourseProjectArchive(
      captureV9SlideVerticalSliceArchive(setState),
      { mtime: NOW },
    )
    const reopened = openV9SlideVerticalSliceState(
      openCourseProjectArchive(bytes),
      'C:\\courseware\\bg.h5lesson',
    )
    const reopenedScene = reopened.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .find(() => true)!
    expect(reopenedScene).toMatchObject({
      backgroundColor: '#ffcc00',
      backgroundAssetId: 'asset_photo',
    })
    expect(buildV9SlideWorkspaceSnapshot(reopened).document.backgroundColor).toBe('#ffcc00')
  })

  it('imports a file-backed background asset and clears the state override', () => {
    const initial = createV9CourseEditorState()
    const state = setV9SlideSceneBackgroundAsset(
      initial,
      { meta: imageItem('asset_bgfile').meta, bytes: imageItem('asset_bgfile').bytes },
      NOW,
    )
    expect(state.history.present.assets.asset_bgfile).toBeDefined()
    expect(state.assetFiles.asset_bgfile).toBeDefined()

    const withState = addV9SlidePresentationState(state, '讲解态', NOW)
    const stateId = withState.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .find(() => true)!
      .presentation!.states.find((candidate) => candidate.name === '讲解态')!.id
    const active = activateV9SlidePresentationState(withState, stateId)
    const overridden = setV9SlideSceneBackgroundColor(active, '#112233', NOW)
    const overriddenScene = overridden.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .find(() => true)!
    expect(overriddenScene.backgroundColor).toBe('#ffffff')
    expect(overriddenScene.presentation!.states.find((candidate) => candidate.id === stateId))
      .toMatchObject({ backgroundColor: '#112233' })

    const cleared = clearV9SlideSceneBackgroundOverride(overridden, NOW)
    const clearedScene = cleared.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .find(() => true)!
    expect(clearedScene.presentation!.states.find((candidate) => candidate.id === stateId)!.backgroundColor)
      .toBeUndefined()
  })
})

describe('V9 media store routing', () => {
  it('routes media insertion and background updates through the V9 session without writing V8', () => {
    const v8ProjectBefore = structuredClone(useEditorStore.getState().project)
    useEditorStore.getState().createNewCourseProject()
    const ids = useEditorStore.getState().addCourseMediaLayers(
      'image',
      [imageItem('asset_store')],
    )
    expect(ids).toHaveLength(1)
    let session = useEditorStore.getState().courseSession
    expect(session).not.toBeNull()
    expect(session!.history.present.assets.asset_store).toBeDefined()
    expect(session!.assetFiles.asset_store).toBeDefined()
    expect(session!.selection.selectionIds).toEqual(ids)

    expect(useEditorStore.getState().setCourseSceneBackground({
      backgroundColor: '#abcdef',
    })).toBe(true)
    session = useEditorStore.getState().courseSession
    expect(session!.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .find(() => true)!.backgroundColor).toBe('#abcdef')

    expect(useEditorStore.getState().setCourseSceneBackgroundWithAsset(
      imageItem('asset_bg').meta,
      imageItem('asset_bg').bytes,
    )).toBe(true)
    session = useEditorStore.getState().courseSession
    expect(session!.history.present.assets.asset_bg).toBeDefined()
    expect(session!.history.present.surfaces
      .flatMap((surface) => surface.type === 'slide' ? surface.scenes : [])
      .find(() => true)!.backgroundAssetId).toBe('asset_bg')

    expect(useEditorStore.getState().importCourseAssets([imageItem('asset_lib2')]))
    session = useEditorStore.getState().courseSession
    expect(session!.history.present.assets.asset_lib2).toBeDefined()

    // The V8 Store document stays untouched by V9 media authoring.
    expect(useEditorStore.getState().project).toEqual(v8ProjectBefore)
  })
})
