import { beforeEach, describe, expect, it } from 'vitest'
import {
  captureV9SlideVerticalSliceArchive,
  isV9SlideVerticalSliceDirty,
} from '@/renderer/course/v9SlideVerticalSlice'
import { useEditorStore } from '@/renderer/store/editorStore'

function courseSession() {
  return useEditorStore.getState().courseSession!
}

function flowSurface(session: ReturnType<typeof courseSession>) {
  const surface = session.history.present.surfaces.find(
    (candidate) => candidate.type === 'flow',
  )
  if (!surface || surface.type !== 'flow') throw new Error('missing flow surface')
  return surface
}

function spatialSurface(session: ReturnType<typeof courseSession>) {
  const surface = session.history.present.surfaces.find(
    (candidate) => candidate.type === 'spatial-2d',
  )
  if (!surface || surface.type !== 'spatial-2d') {
    throw new Error('missing spatial surface')
  }
  return surface
}

beforeEach(() => {
  useEditorStore.getState().createNewCourseProject()
})

describe('multi-surface editorStore commands', () => {
  it('keeps Slide authoring unchanged after the selection type extension', () => {
    const store = useEditorStore.getState()
    const initial = courseSession()
    expect(initial.selection).toMatchObject({
      surfaceKind: 'slide',
      flowBlockId: null,
      selectionIds: [],
    })

    store.addCourseTextLayer(180, 140)
    const added = courseSession()
    const layerItemId = added.selection.selectionIds[0]!
    expect(added.history.past).toHaveLength(1)
    expect(added.selection).toMatchObject({ surfaceKind: 'slide' })

    store.transformCourseLayers({
      nodes: [{
        nodeId: layerItemId,
        x: 240,
        y: 180,
        width: 400,
        height: 80,
        rotation: 0,
      }],
    })
    const moved = courseSession()
    expect(moved.history.past).toHaveLength(2)
    expect(
      moved.history.present.surfaces
        .find((surface) => surface.type === 'slide')!.scenes[0]!
        .layerItems.find((item) => item.layerItemId === layerItemId)!.frame,
    ).toMatchObject({ x: 240, y: 180 })

    store.undoCourseProject()
    const undone = courseSession()
    expect(undone.history.past).toHaveLength(1)
    expect(undone.selection).toMatchObject({ surfaceKind: 'slide' })

    store.redoCourseProject()
    const redone = courseSession()
    expect(redone.history.past).toHaveLength(2)
    expect(redone.selection).toMatchObject({ surfaceKind: 'slide' })
  })

  it('runs Flow surface commands as one-history entries and repairs selection on delete', () => {
    const store = useEditorStore.getState()
    store.addCourseSurface('flow', '流式讲义')
    let session = courseSession()
    expect(session.history.past).toHaveLength(1)
    expect(session.history.present.surfaces).toHaveLength(2)
    expect(session.history.present.mixedPrintPlan?.entries).toHaveLength(2)
    expect(session.selection).toMatchObject({
      surfaceKind: 'flow',
    })
    expect(session.selection.flowBlockId).toBe(
      flowSurface(session).blocks[0]!.id,
    )

    store.insertCourseFlowBlock(
      { type: 'paragraph', text: '第一段' },
      { parentId: null, index: 1 },
    )
    session = courseSession()
    expect(session.history.past).toHaveLength(2)
    const paragraphId = session.selection.flowBlockId!
    expect(paragraphId).toBe(flowSurface(session).blocks[1]!.id)
    expect(flowSurface(session).blocks[1]).toMatchObject({
      type: 'paragraph',
      text: '第一段',
    })

    store.updateCourseFlowBlock(paragraphId, { text: '更新后的段落' })
    session = courseSession()
    expect(session.history.past).toHaveLength(3)
    expect(
      flowSurface(session).blocks.find((block) => block.id === paragraphId),
    ).toMatchObject({ text: '更新后的段落' })

    store.duplicateCourseFlowBlock(paragraphId)
    session = courseSession()
    expect(session.history.past).toHaveLength(4)
    const duplicateId = session.selection.flowBlockId!
    expect(duplicateId).not.toBe(paragraphId)
    expect(flowSurface(session).blocks).toHaveLength(3)

    store.reorderCourseFlowBlock(duplicateId, 0)
    session = courseSession()
    expect(session.history.past).toHaveLength(5)
    expect(flowSurface(session).blocks[0]!.id).toBe(duplicateId)

    store.moveCourseFlowBlock(duplicateId, { parentId: null, index: 1 })
    session = courseSession()
    expect(session.history.past).toHaveLength(6)
    expect(flowSurface(session).blocks[1]!.id).toBe(duplicateId)

    store.deleteCourseFlowBlock(duplicateId)
    session = courseSession()
    expect(session.history.past).toHaveLength(7)
    expect(flowSurface(session).blocks.some((block) => block.id === duplicateId)).toBe(false)
    expect(session.selection.flowBlockId).toBe(flowSurface(session).blocks[0]!.id)
    expect(session.selection.surfaceKind).toBe('flow')
  })

  it('runs Spatial surface commands as one-history entries and keeps selection valid', () => {
    const store = useEditorStore.getState()
    store.addCourseSurface('spatial-2d', '空间探索')
    let session = courseSession()
    expect(session.history.past).toHaveLength(1)
    expect(session.selection).toMatchObject({
      surfaceKind: 'spatial-2d',
      spatialLayerItemIds: [],
    })

    store.addCourseSpatialTextLayer({ x: 10, y: 20 })
    session = courseSession()
    expect(session.history.past).toHaveLength(2)
    const textId = spatialSurface(session).world.layerItems[0]!.layerItemId

    store.selectCourseSpatialLayers([textId])
    session = courseSession()
    expect(session.history.past).toHaveLength(2)
    expect(session.selection.spatialLayerItemIds).toEqual([textId])

    store.transformCourseSpatialLayers({
      layers: [{
        layerItemId: textId,
        x: 50,
        y: 60,
        width: 400,
        height: 80,
        rotation: 0,
      }],
    })
    session = courseSession()
    expect(session.history.past).toHaveLength(3)
    expect(
      spatialSurface(session).world.layerItems.find(
        (item) => item.layerItemId === textId,
      )!.frame,
    ).toMatchObject({ x: 50, y: 60, width: 400, height: 80 })

    store.addCourseSpatialCameraFrame({ x: 5, y: 6, zoom: 2 })
    session = courseSession()
    expect(session.history.past).toHaveLength(4)
    const firstFrameId = spatialSurface(session).camera.frames[0]!.id
    const secondFrameId = spatialSurface(session).camera.frames[1]!.id

    store.renameCourseSpatialCameraFrame(secondFrameId, '特写')
    session = courseSession()
    expect(session.history.past).toHaveLength(5)
    expect(
      spatialSurface(session).camera.frames.find((frame) => frame.id === secondFrameId),
    ).toMatchObject({ name: '特写' })

    store.reorderCourseSpatialCameraFrames([secondFrameId, firstFrameId])
    session = courseSession()
    expect(session.history.past).toHaveLength(6)
    expect(spatialSurface(session).camera.frames.map((frame) => frame.id)).toEqual([
      secondFrameId,
      firstFrameId,
    ])

    store.setCourseSpatialCameraHome({ x: 1, y: 2, zoom: 3 })
    session = courseSession()
    expect(session.history.past).toHaveLength(7)
    expect(spatialSurface(session).camera.home).toMatchObject({ x: 1, y: 2, zoom: 3 })

    store.deleteCourseSpatialCameraFrame(secondFrameId)
    session = courseSession()
    expect(session.history.past).toHaveLength(8)
    expect(spatialSurface(session).camera.frames).toHaveLength(1)
    expect(session.selection.locationId).toBe(
      session.history.present.locations.find(
        (location) =>
          location.kind === 'spatial-camera' &&
          location.surfaceId === spatialSurface(session).id &&
          location.cameraFrameId === firstFrameId,
      )!.id,
    )
  })

  it('runs semantic zoom, path and relation commands as one-history entries', () => {
    const store = useEditorStore.getState()
    store.addCourseSurface('spatial-2d', '空间探索')
    store.addCourseSpatialTextLayer({ x: 10, y: 20 })
    let session = courseSession()
    const surfaceId = spatialSurface(session).id
    const textId = spatialSurface(session).world.layerItems[0]!.layerItemId

    store.addCourseSpatialShapeLayer({ x: 100, y: 100 })
    session = courseSession()
    const shapeId = spatialSurface(session).world.layerItems[1]!.layerItemId

    store.addCourseSpatialSemanticZoomRule({
      layerItemIds: [textId],
      minZoom: 0,
      maxZoom: 2,
    })
    session = courseSession()
    expect(session.history.past).toHaveLength(4)
    const ruleId = spatialSurface(session).semanticZoom[0]!.id

    store.updateCourseSpatialSemanticZoomRule(ruleId, { maxZoom: 3 })
    session = courseSession()
    expect(session.history.past).toHaveLength(5)
    expect(spatialSurface(session).semanticZoom[0]).toMatchObject({ maxZoom: 3 })

    store.addCourseSpatialPath({
      surfaceId,
      name: '路径一',
      layerItemIds: [textId],
    })
    session = courseSession()
    expect(session.history.past).toHaveLength(6)
    const pathId = spatialSurface(session).world.paths?.[0]!.id
    expect(pathId).toBeTruthy()

    store.updateCourseSpatialPath(pathId!, { name: '更新路径' })
    session = courseSession()
    expect(session.history.past).toHaveLength(7)
    expect(spatialSurface(session).world.paths?.[0]).toMatchObject({ name: '更新路径' })

    store.addCourseSpatialRelation({
      surfaceId,
      sourceLayerItemId: textId,
      targetLayerItemId: shapeId,
      kind: 'arrow',
    })
    session = courseSession()
    expect(session.history.past).toHaveLength(8)
    const relationId = spatialSurface(session).world.relations?.[0]!.id
    expect(relationId).toBeTruthy()

    store.updateCourseSpatialRelation(relationId!, { label: '关系标签' })
    session = courseSession()
    expect(session.history.past).toHaveLength(9)
    expect(spatialSurface(session).world.relations?.[0]).toMatchObject({
      label: '关系标签',
    })

    store.deleteCourseSpatialSemanticZoomRule(ruleId)
    session = courseSession()
    expect(session.history.past).toHaveLength(10)
    expect(spatialSurface(session).semanticZoom).toHaveLength(0)

    store.deleteCourseSpatialPath(pathId!)
    session = courseSession()
    expect(session.history.past).toHaveLength(11)
    expect(spatialSurface(session).world.paths).toHaveLength(0)

    store.deleteCourseSpatialRelation(relationId!)
    session = courseSession()
    expect(session.history.past).toHaveLength(12)
    expect(spatialSurface(session).world.relations).toHaveLength(0)
  })

  it('rejects stale Flow and Spatial targets with teacher-safe errors', () => {
    const store = useEditorStore.getState()
    const before = courseSession()

    store.updateCourseFlowBlock('missing-block', { text: '不会成功' })
    expect(useEditorStore.getState().courseSession).toBe(before)
    expect(useEditorStore.getState().errorMessage).toBeTruthy()

    store.addCourseSurface('spatial-2d', '空间探索')
    const spatialSession = courseSession()
    store.transformCourseSpatialLayers({
      layers: [{
        layerItemId: 'missing-layer',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        rotation: 0,
      }],
    })
    expect(useEditorStore.getState().courseSession).toBe(spatialSession)
    expect(useEditorStore.getState().errorMessage).toBeTruthy()
  })

  it('save/reopen restores multi-surface project data and derives the start location', () => {
    const store = useEditorStore.getState()
    store.addCourseSurface('flow', '流式讲义')
    store.insertCourseFlowBlock(
      { type: 'paragraph', text: '第一段' },
      { parentId: null, index: 1 },
    )
    const before = courseSession()
    const archive = captureV9SlideVerticalSliceArchive(before)

    useEditorStore.getState().loadCourseProject(archive, null)
    const reopened = courseSession()
    expect(reopened.history.present.surfaces).toHaveLength(2)
    expect(reopened.history.present.locations).toHaveLength(3)
    expect(reopened.selection).toMatchObject({
      surfaceKind: 'slide',
      flowBlockId: null,
    })
    expect(
      reopened.history.present.surfaces.find((surface) => surface.type === 'flow')!
        .blocks,
    ).toHaveLength(2)
    expect(isV9SlideVerticalSliceDirty(reopened)).toBe(false)

    const flowLocation = reopened.history.present.locations.find(
      (location) => location.kind === 'flow-block',
    )!
    useEditorStore.getState().selectCourseLocation(flowLocation.id)
    expect(courseSession().selection).toMatchObject({
      surfaceKind: 'flow',
      flowBlockId: flowLocation.blockId,
    })
  })

  it('undo/redo traverses multi-surface history in one-entry steps', () => {
    const store = useEditorStore.getState()
    store.addCourseSurface('flow', '流式讲义')
    store.addCourseSurface('spatial-2d', '空间探索')
    const second = courseSession()
    expect(second.history.past).toHaveLength(2)
    expect(second.selection).toMatchObject({ surfaceKind: 'spatial-2d' })

    store.undoCourseProject()
    const undone = courseSession()
    expect(undone.history.past).toHaveLength(1)
    expect(undone.history.present.surfaces).toHaveLength(2)
    expect(undone.selection).toMatchObject({
      surfaceKind: 'slide',
      flowBlockId: null,
    })

    const flowLocation = undone.history.present.locations.find(
      (location) => location.kind === 'flow-block',
    )!
    store.selectCourseLocation(flowLocation.id)
    expect(courseSession().selection).toMatchObject({
      surfaceKind: 'flow',
      flowBlockId: flowLocation.blockId,
    })

    store.redoCourseProject()
    const redone = courseSession()
    expect(redone.history.past).toHaveLength(2)
    expect(redone.history.present.surfaces).toHaveLength(3)
    expect(redone.selection).toMatchObject({ surfaceKind: 'flow' })

    const spatialLocation = redone.history.present.locations.find(
      (location) => location.kind === 'spatial-camera',
    )!
    store.selectCourseLocation(spatialLocation.id)
    expect(courseSession().selection).toMatchObject({
      surfaceKind: 'spatial-2d',
      spatialLayerItemIds: [],
    })
  })
})
