import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import {
  addCourseSurface,
  addSlideScene,
  addSlideTextLayer,
  addVideoLayer,
  createCourseProject,
  deleteSlideScene,
  duplicateSlideScene,
  reorderSlideScenes,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'

function withAsset(
  project: CourseProjectDocument,
  id: string,
  kind: 'image' | 'video',
): CourseProjectDocument {
  return updateCourseProject(project, (draft) => {
    draft.assets[id] = {
      id,
      filename: kind === 'video' ? `${id}.mp4` : `${id}.png`,
      mimeType: kind === 'video' ? 'video/mp4' : 'image/png',
      kind,
      path: kind === 'video' ? `assets/${id}.mp4` : `assets/${id}.png`,
      byteLength: 128,
      width: 640,
      height: 360,
      ...(kind === 'video' ? { duration: 18 } : {}),
    }
  })
}

describe('Course Studio V9 media and Slide scene commands', () => {
  it('adds editable video layers to Slide and Spatial in one revision each', () => {
    let project = withAsset(createCourseProject({ id: 'video-course' }), 'lesson-video', 'video')
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    const beforeSlideVideo = project.revision
    project = addVideoLayer(project, {
      surfaceId: slide.id,
      sceneId: slide.scenes[0]!.id,
      assetId: 'lesson-video',
      id: 'slide-video',
      x: 90,
      y: 110,
      width: 720,
      height: 405,
      autoplay: true,
      muted: true,
      loop: true,
      now: '2026-08-14T04:00:00.000Z',
    })

    expect(project.revision).toBe(beforeSlideVideo + 1)
    const nextSlide = project.surfaces[0]!
    if (nextSlide.type !== 'slide') throw new Error('missing slide')
    const slideVideo = nextSlide.scenes[0]!.layerItems.find(
      (item) => item.layerItemId === 'slide-video',
    )
    expect(slideVideo).toMatchObject({
      kind: 'native',
      label: '视频',
      frame: { x: 90, y: 110, width: 720, height: 405 },
    })
    if (slideVideo?.kind !== 'native' || slideVideo.content.nativeType !== 'video') {
      throw new Error('missing native video')
    }
    expect(slideVideo.content.data).toMatchObject({
      assetId: 'lesson-video',
      autoplay: true,
      muted: true,
      loop: true,
    })

    project = addCourseSurface(project, 'spatial-2d', { id: 'video-space' })
    const beforeSpatialVideo = project.revision
    project = addVideoLayer(project, {
      surfaceId: 'video-space',
      assetId: 'lesson-video',
      id: 'spatial-video',
      x: -240,
      y: 80,
      showControls: false,
    })
    expect(project.revision).toBe(beforeSpatialVideo + 1)
    const spatial = project.surfaces.find((surface) => surface.id === 'video-space')
    if (spatial?.type !== 'spatial-2d') throw new Error('missing spatial surface')
    expect(spatial.world.layerItems.find((item) => item.layerItemId === 'spatial-video'))
      .toMatchObject({ kind: 'native', frame: { x: -240, y: 80 } })
    expect(() => courseProjectDocumentSchema.parse(project)).not.toThrow()

    const withImage = withAsset(project, 'still-image', 'image')
    expect(() => addVideoLayer(withImage, {
      surfaceId: 'video-space',
      assetId: 'still-image',
    })).toThrow(/not video|\u4e0d是视频/)
  })

  it('duplicates a Slide scene with fresh authoring identities and synchronized references', () => {
    let project = createCourseProject({ id: 'duplicate-scene-course' })
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    const sourceSceneId = slide.scenes[0]!.id
    project = addSlideTextLayer(project, slide.id, sourceSceneId, '原场景文字', {
      id: 'source-layer',
    })
    project = addCourseSurface(project, 'flow', { id: 'duplicate-flow' })
    const sourceLocation = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === sourceSceneId
    ))!
    project = updateCourseProject(project, (draft) => {
      const draftSlide = draft.surfaces.find((surface) => surface.id === slide.id)
      if (draftSlide?.type !== 'slide') throw new Error('missing slide')
      const scene = draftSlide.scenes[0]!
      scene.presentation = {
        initialStateId: 'state-visible',
        thumbnailStateId: 'state-visible',
        states: [{
          id: 'state-visible',
          name: '展开状态',
          layerItemOverrides: { 'source-layer': { frame: { x: 260 }, visible: true } },
          layerItemOrder: ['source-layer'],
        }],
      }
      scene.interactions = [{
        id: 'source-rule',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'source-layer' },
        conditions: [{ type: 'scene.in', sceneIds: [sourceSceneId] }],
        actions: [
          {
            id: 'source-motion',
            start: 'after-previous',
            delayMs: 0,
            action: {
              type: 'node.enter',
              nodeId: 'source-layer',
              durationMs: 240,
              easing: 'ease-out',
              effect: 'fade',
            },
          },
          {
            id: 'source-navigation',
            start: 'after-previous',
            delayMs: 0,
            action: { type: 'scene.go', sceneId: sourceSceneId },
          },
        ],
      }, {
        id: 'after-source-motion',
        enabled: true,
        trigger: { type: 'animation.completed', actionId: 'source-motion' },
        conditions: [{ type: 'scene.in', sceneIds: [sourceSceneId] }],
        actions: [{
          id: 'after-source-restart',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }]
      draft.globalLayerItems[0]!.visibility = {
        mode: 'include',
        locationIds: [sourceLocation.id],
      }
      draft.courseState = [{ key: 'ready', valueType: 'boolean', defaultValue: false }]
      draft.navigationGuards = [{
        id: 'source-guard',
        effect: 'block',
        fromLocationIds: [sourceLocation.id],
        toLocationIds: [sourceLocation.id],
        match: 'all',
        conditions: [{ type: 'compare', key: 'ready', operator: 'eq', value: true }],
        message: '完成后继续',
      }]
      draft.globalInteractions = [{
        id: 'global-source-rule',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [{ type: 'scene.in', sceneIds: [sourceSceneId] }],
        actions: [{
          id: 'global-restart',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }, {
        id: 'global-local-node-rule',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'source-layer' },
        conditions: [{ type: 'scene.in', sceneIds: [sourceSceneId] }],
        actions: [{
          id: 'global-local-restart',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }]
    })

    const revisionBefore = project.revision
    project = duplicateSlideScene(project, slide.id, sourceSceneId, {
      id: 'scene-copy',
      now: '2026-08-14T05:00:00.000Z',
    })
    expect(project.revision).toBe(revisionBefore + 1)
    const duplicatedSlide = project.surfaces.find((surface) => surface.id === slide.id)
    if (duplicatedSlide?.type !== 'slide') throw new Error('missing slide')
    expect(duplicatedSlide.scenes.map((scene) => scene.id).slice(0, 2)).toEqual([
      sourceSceneId,
      'scene-copy',
    ])
    const copy = duplicatedSlide.scenes[1]!
    const copiedLayer = copy.layerItems[0]!
    expect(copiedLayer.layerItemId).not.toBe('source-layer')
    expect(copy.presentation?.states[0]?.layerItemOverrides).toHaveProperty(
      copiedLayer.layerItemId,
    )
    expect(copy.presentation?.states[0]?.layerItemOrder).toEqual([copiedLayer.layerItemId])
    expect(copy.interactions[0]?.id).not.toBe('source-rule')
    expect(copy.interactions[0]?.trigger).toEqual({
      type: 'node.click',
      nodeId: copiedLayer.layerItemId,
    })
    expect(copy.interactions[0]?.conditions).toEqual([
      { type: 'scene.in', sceneIds: ['scene-copy'] },
    ])
    expect(copy.interactions[0]?.actions[0]?.action).toMatchObject({
      type: 'node.enter',
      nodeId: copiedLayer.layerItemId,
    })
    expect(copy.interactions[0]?.actions[1]?.action).toEqual({
      type: 'scene.go',
      sceneId: 'scene-copy',
    })
    expect(copy.interactions[1]?.trigger).toEqual({
      type: 'animation.completed',
      actionId: copy.interactions[0]?.actions[0]?.id,
    })

    const copiedLocation = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === 'scene-copy'
    ))!
    expect(copiedLocation.id).toBe('scene-copy')
    expect(project.globalLayerItems[0]!.visibility.locationIds).toEqual([
      sourceLocation.id,
      copiedLocation.id,
    ])
    expect(project.navigationGuards[0]?.toLocationIds).toEqual([
      sourceLocation.id,
      copiedLocation.id,
    ])
    expect(project.globalInteractions[0]?.conditions).toEqual([
      { type: 'scene.in', sceneIds: [sourceSceneId, 'scene-copy'] },
    ])
    expect(project.globalInteractions[1]?.conditions).toEqual([
      { type: 'scene.in', sceneIds: [sourceSceneId] },
    ])
    expect(project.mixedPrintPlan?.entries.find((entry) => entry.surfaceId === slide.id))
      .toMatchObject({ kind: 'slide-scenes', sceneIds: [sourceSceneId, 'scene-copy'] })
    expect(() => courseProjectDocumentSchema.parse(project)).not.toThrow()
  })

  it('reorders Slide scenes, their locations and mixed print entry as one transaction', () => {
    let project = createCourseProject({ id: 'reorder-scenes-course' })
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    const firstId = slide.scenes[0]!.id
    project = addCourseSurface(project, 'flow', { id: 'reorder-flow' })
    project = addSlideScene(project, slide.id, { id: 'scene-two', name: '第二幕' })
    project = addSlideScene(project, slide.id, { id: 'scene-three', name: '第三幕' })
    const flowLocation = project.locations.find((location) => location.kind === 'flow-block')!
    const flowIndexBefore = project.locations.indexOf(flowLocation)
    const startBefore = project.startLocationId
    const revisionBefore = project.revision
    const order = ['scene-three', firstId, 'scene-two']

    project = reorderSlideScenes(
      project,
      slide.id,
      order,
      '2026-08-14T06:00:00.000Z',
    )
    expect(project.revision).toBe(revisionBefore + 1)
    const reorderedSlide = project.surfaces.find((surface) => surface.id === slide.id)
    if (reorderedSlide?.type !== 'slide') throw new Error('missing slide')
    expect(reorderedSlide.scenes.map((scene) => scene.id)).toEqual(order)
    expect(project.locations.flatMap((location) => (
      location.kind === 'slide-scene' && location.surfaceId === slide.id
        ? [location.sceneId]
        : []
    ))).toEqual(order)
    expect(project.locations.findIndex((location) => location.id === flowLocation.id))
      .toBe(flowIndexBefore)
    expect(project.startLocationId).toBe(startBefore)
    expect(project.mixedPrintPlan?.entries.find((entry) => entry.surfaceId === slide.id))
      .toMatchObject({ kind: 'slide-scenes', sceneIds: order })
    expect(() => courseProjectDocumentSchema.parse(project)).not.toThrow()
    expect(() => reorderSlideScenes(project, slide.id, [firstId, 'scene-two']))
      .toThrow(/全部场景/)
  })

  it('deletes a Slide scene and removes every dangling navigation reference', () => {
    let project = createCourseProject({ id: 'delete-scene-course' })
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('missing slide')
    const deletedSceneId = slide.scenes[0]!.id
    project = addSlideTextLayer(project, slide.id, deletedSceneId, '即将删除的场景图层', {
      id: 'deleted-scene-layer',
    })
    project = addSlideScene(project, slide.id, { id: 'remaining-scene', name: '保留场景' })
    project = addCourseSurface(project, 'flow', { id: 'delete-flow' })
    const deletedLocation = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === deletedSceneId
    ))!
    const remainingLocation = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === 'remaining-scene'
    ))!
    project = updateCourseProject(project, (draft) => {
      const draftSlide = draft.surfaces.find((surface) => surface.id === slide.id)
      if (draftSlide?.type !== 'slide') throw new Error('missing slide')
      const remaining = draftSlide.scenes.find((scene) => scene.id === 'remaining-scene')!
      remaining.interactions = [{
        id: 'dangling-scene-action',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [{
          id: 'go-deleted',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.go', sceneId: deletedSceneId },
        }],
      }]
      draft.globalInteractions = [{
        id: 'dangling-scene-condition',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [{ type: 'scene.in', sceneIds: [deletedSceneId] }],
        actions: [{
          id: 'restart',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }, {
        id: 'dangling-layer-trigger',
        enabled: true,
        trigger: { type: 'node.click', nodeId: 'deleted-scene-layer' },
        conditions: [],
        actions: [{
          id: 'restart-from-deleted-layer',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'course.restart' },
        }],
      }]
      draft.courseState = [{ key: 'ready', valueType: 'boolean', defaultValue: false }]
      draft.navigationGuards = [{
        id: 'deleted-location-guard',
        effect: 'block',
        fromLocationIds: [deletedLocation.id],
        toLocationIds: [deletedLocation.id],
        match: 'all',
        conditions: [{ type: 'compare', key: 'ready', operator: 'eq', value: true }],
        message: '不可进入',
      }]
      draft.globalLayerItems[0]!.visibility = {
        mode: 'include',
        locationIds: [deletedLocation.id, remainingLocation.id],
      }
      const controller = draft.globalLayerItems[0]!.item
      if (controller.kind !== 'native' || controller.content.nativeType !== 'teacher-controller') {
        throw new Error('missing teacher controller')
      }
      controller.content.data.buttons = [{
        id: 'go-deleted-scene',
        label: '前往旧场景',
        visible: true,
        action: { type: 'scene.go', sceneId: deletedSceneId },
      }]
      draft.globalLayerItems.push({
        item: {
          layerItemId: 'deleted-scene-runtime-binding',
          label: '场景绑定运行时',
          kind: 'runtime',
          frame: { mode: 'absolute', x: 0, y: 0, width: 260, height: 140 },
          order: 3,
          visible: true,
          locked: false,
          rotation: 0,
          opacity: 1,
          hitPolicy: 'auto',
          playbackInitialVisibility: 'inherit',
          runtime: {
            protocol: 'surface-v1',
            runtimeApiVersion: 3,
            enabled: true,
            renderMode: 'dom',
            source: 'CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(){return{destroy(){}}}})',
            content: { values: {} },
            assets: {},
            nodeBindings: { target: 'deleted-scene-layer' },
          },
        },
        visibility: { mode: 'all', locationIds: [] },
      })
    })
    const revisionBefore = project.revision

    project = deleteSlideScene(
      project,
      slide.id,
      deletedSceneId,
      '2026-08-14T07:00:00.000Z',
    )
    expect(project.revision).toBe(revisionBefore + 1)
    const remainingSlide = project.surfaces.find((surface) => surface.id === slide.id)
    if (remainingSlide?.type !== 'slide') throw new Error('missing slide')
    expect(remainingSlide.scenes.map((scene) => scene.id)).toEqual(['remaining-scene'])
    expect(project.locations.some((location) => location.id === deletedLocation.id)).toBe(false)
    expect(project.locations.some((location) => location.id === project.startLocationId)).toBe(true)
    expect(project.globalLayerItems[0]!.visibility.locationIds).not.toContain(deletedLocation.id)
    expect(project.globalLayerItems[0]!.visibility.locationIds).toHaveLength(1)
    expect(project.navigationGuards).toEqual([])
    expect(project.globalInteractions).toEqual([])
    expect(remainingSlide.scenes[0]!.interactions).toEqual([])
    const controller = project.globalLayerItems[0]!.item
    if (controller.kind !== 'native' || controller.content.nativeType !== 'teacher-controller') {
      throw new Error('missing teacher controller')
    }
    expect(controller.content.data.buttons).toMatchObject([{
      label: '下一场景',
      action: { type: 'scene.next' },
    }])
    const runtime = project.globalLayerItems.find(({ item }) => (
      item.layerItemId === 'deleted-scene-runtime-binding'
    ))?.item
    expect(runtime?.kind === 'runtime' ? runtime.runtime.nodeBindings : null).toBeUndefined()
    expect(project.mixedPrintPlan?.entries.find((entry) => entry.surfaceId === slide.id))
      .toMatchObject({ kind: 'slide-scenes', sceneIds: ['remaining-scene'] })
    expect(() => courseProjectDocumentSchema.parse(project)).not.toThrow()

    expect(() => deleteSlideScene(project, slide.id, 'remaining-scene'))
      .toThrow(/至少需要一个场景/)
  })
})
