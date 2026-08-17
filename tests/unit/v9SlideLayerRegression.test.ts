import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import { sceneNodeToCourseLayerItem } from '@/shared/courseProjectModel'
import type {
  CourseProjectDocument,
  RuntimeLayerItem,
  SlideSceneDocument,
  SlideSurfaceDocument,
} from '@/shared/courseProjectTypes'
import type { InteractionRule } from '@/shared/interactionTypes'
import {
  addNativeVisualLayer,
  addSlideTextLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  createImageNode,
  createVideoNode,
} from '@/renderer/project/createProject'
import {
  addV9SlidePresentationState,
  addV9SlideShapeLayer,
  buildV9SlideWorkspaceSnapshot,
  deleteV9SlideLayer,
  duplicateV9SlideLayer,
  openV9SlideVerticalSliceState,
  selectV9SlideVerticalSlice,
  transformV9SlideVerticalSlice,
  updateV9SlideLayer,
  type V9SlideVerticalSliceState,
} from '@/renderer/course/v9SlideVerticalSlice'

const NOW = '2026-08-15T09:00:00.000Z'

function slideSurface(project: CourseProjectDocument): SlideSurfaceDocument {
  const surface = project.surfaces[0]
  if (!surface || surface.type !== 'slide') throw new Error('expected slide surface')
  return surface
}

function currentScene(state: V9SlideVerticalSliceState): SlideSceneDocument {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') throw new Error('expected slide location')
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('expected slide surface')
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  if (!scene) throw new Error('expected current scene')
  return scene
}

function open(project: CourseProjectDocument): V9SlideVerticalSliceState {
  return openV9SlideVerticalSliceState({
    project,
    assetFiles: {},
    componentFiles: {},
  }, null)
}

function runtimeLayer(
  layerItemId: string,
  order: number,
  nodeBindings: Record<string, string>,
): RuntimeLayerItem {
  return {
    layerItemId,
    label: layerItemId,
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
      nodeBindings,
    },
  }
}

function clickRule(nodeId: string, suffix: string): InteractionRule {
  return {
    id: `rule-click-${suffix}`,
    enabled: true,
    trigger: { type: 'node.click', nodeId },
    conditions: [],
    actions: [{
      id: `action-next-${suffix}`,
      start: 'after-previous',
      delayMs: 0,
      action: { type: 'scene.next' },
    }],
  }
}

function motionGraph(nodeId: string): InteractionRule[] {
  return [{
    id: 'rule-source-click',
    enabled: true,
    trigger: { type: 'node.click', nodeId },
    conditions: [],
    actions: [{
      id: 'action-source-enter',
      start: 'after-previous',
      delayMs: 0,
      action: {
        type: 'node.enter',
        nodeId,
        effect: 'fade',
        durationMs: 180,
        easing: 'ease-out',
      },
    }],
  }, {
    id: 'rule-source-completed',
    enabled: true,
    trigger: { type: 'animation.completed', actionId: 'action-source-enter' },
    conditions: [],
    actions: [{
      id: 'action-source-exit',
      start: 'after-previous',
      delayMs: 0,
      action: {
        type: 'node.exit',
        nodeId,
        effect: 'fade',
        durationMs: 120,
        easing: 'ease-in',
      },
    }],
  }]
}

function createTwoLayerProject(): CourseProjectDocument {
  let project = createCourseProject({ id: 'v9-layer-regression', now: NOW })
  const surface = slideSurface(project)
  const sceneId = surface.scenes[0]!.id
  project = addSlideTextLayer(project, surface.id, sceneId, '原始标题', {
    id: 'source-text',
    x: 120,
    y: 90,
    now: NOW,
  })
  return addNativeVisualLayer(project, {
    surfaceId: surface.id,
    sceneId,
    nativeType: 'shape',
    shapeType: 'rectangle',
    id: 'other-shape',
    x: 420,
    y: 260,
    now: NOW,
  })
}

describe('V9 Slide layer regressions', () => {
  it('keeps same-id references in another scene while cleaning only the deleted local owner', () => {
    let project = createCourseProject({ id: 'local-layer-id-scopes', now: NOW })
    const surface = slideSurface(project)
    const firstSceneId = surface.scenes[0]!.id
    project = addSlideTextLayer(project, surface.id, firstSceneId, '本地同名元素', {
      id: 'same-local-id',
      now: NOW,
    })
    project = updateCourseProject(project, (draft) => {
      const draftSurface = slideSurface(draft)
      const first = draftSurface.scenes[0]!
      first.interactions = [clickRule('same-local-id', 'scene-a')]
      first.layerItems.push(runtimeLayer('runtime-scene-a', 3, {
        target: 'same-local-id',
      }))

      const second = structuredClone(first)
      second.id = 'scene-b'
      second.name = '场景 B'
      second.interactions = [clickRule('same-local-id', 'scene-b')]
      const secondRuntime = second.layerItems.find(
        (item): item is RuntimeLayerItem => item.kind === 'runtime',
      )
      if (!secondRuntime) throw new Error('expected second runtime')
      secondRuntime.layerItemId = 'runtime-scene-b'
      secondRuntime.label = 'runtime-scene-b'
      draftSurface.scenes.push(second)
      draft.locations.push({
        id: 'location-scene-b',
        label: '场景 B',
        kind: 'slide-scene',
        surfaceId: draftSurface.id,
        sceneId: second.id,
      })
    }, NOW)
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)

    const deleted = deleteV9SlideLayer(open(project), 'same-local-id', NOW)
    const [first, second] = slideSurface(deleted.history.present).scenes
    const firstRuntime = first!.layerItems.find(
      (item): item is RuntimeLayerItem => item.kind === 'runtime',
    )!
    const secondRuntime = second!.layerItems.find(
      (item): item is RuntimeLayerItem => item.kind === 'runtime',
    )!

    expect(first!.layerItems.some((item) => item.layerItemId === 'same-local-id')).toBe(false)
    expect(first!.interactions).toEqual([])
    expect(firstRuntime.runtime.nodeBindings).toEqual({})
    expect(second!.layerItems.some((item) => item.layerItemId === 'same-local-id')).toBe(true)
    expect(second!.interactions).toEqual([clickRule('same-local-id', 'scene-b')])
    expect(secondRuntime.runtime.nodeBindings).toEqual({ target: 'same-local-id' })
    expect(courseProjectDocumentSchema.safeParse(deleted.history.present).success).toBe(true)
  })

  it('cleans other-scene, global interaction and every runtime reference for a project-unique id', () => {
    let project = createCourseProject({ id: 'unique-layer-id-scope', now: NOW })
    const surface = slideSurface(project)
    const firstSceneId = surface.scenes[0]!.id
    project = addSlideTextLayer(project, surface.id, firstSceneId, '项目唯一元素', {
      id: 'project-unique-id',
      now: NOW,
    })
    project = updateCourseProject(project, (draft) => {
      const draftSurface = slideSurface(draft)
      const first = draftSurface.scenes[0]!
      first.interactions = [clickRule('project-unique-id', 'scene-a')]
      first.layerItems.push(runtimeLayer('runtime-current', 3, {
        target: 'project-unique-id',
      }))

      const second = structuredClone(first)
      second.id = 'scene-b'
      second.name = '场景 B'
      second.layerItems = [runtimeLayer('runtime-remote', 3, {
        target: 'project-unique-id',
      })]
      second.interactions = [clickRule('project-unique-id', 'scene-b')]
      draftSurface.scenes.push(second)
      draft.locations.push({
        id: 'location-scene-b',
        label: '场景 B',
        kind: 'slide-scene',
        surfaceId: draftSurface.id,
        sceneId: second.id,
      })
      draft.globalLayerItems.push({
        item: runtimeLayer('runtime-global', 4, { target: 'project-unique-id' }),
        visibility: { mode: 'all', locationIds: [] },
      })
      draft.globalInteractions = [clickRule('project-unique-id', 'global')]
    }, NOW)
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)

    const deleted = deleteV9SlideLayer(open(project), 'project-unique-id', NOW)
    const [first, second] = slideSurface(deleted.history.present).scenes
    const currentRuntime = first!.layerItems.find(
      (item): item is RuntimeLayerItem => item.kind === 'runtime',
    )!
    const remoteRuntime = second!.layerItems.find(
      (item): item is RuntimeLayerItem => item.kind === 'runtime',
    )!
    const globalRuntime = deleted.history.present.globalLayerItems.find(
      (entry): entry is { item: RuntimeLayerItem; visibility: typeof entry.visibility } =>
        entry.item.kind === 'runtime',
    )!.item

    expect(first!.interactions).toEqual([])
    expect(second!.interactions).toEqual([])
    expect(deleted.history.present.globalInteractions).toEqual([])
    expect(currentRuntime.runtime.nodeBindings).toEqual({})
    expect(remoteRuntime.runtime.nodeBindings).toEqual({})
    expect(globalRuntime.runtime.nodeBindings).toEqual({})
    expect(courseProjectDocumentSchema.safeParse(deleted.history.present).success).toBe(true)
  })

  it('copies base duplication into named-state sparse overrides without locked/order residue', () => {
    const base = open(createTwoLayerProject())
    const named = addV9SlidePresentationState(base, '讲解态', NOW)
    const stateId = named.selection.stateId!
    const withOverrides = updateCourseProject(named.history.present, (draft) => {
      const scene = slideSurface(draft).scenes[0]!
      const presentationState = scene.presentation!.states.find(
        (candidate) => candidate.id === stateId,
      )!
      presentationState.layerItemOverrides['source-text'] = {
        frame: { x: 310, y: 220 },
        label: '命名态标题',
        locked: true,
        order: 9_876,
      }
      presentationState.layerItemOrder = ['source-text', 'other-shape']
    }, NOW)

    const duplicated = duplicateV9SlideLayer(open(withOverrides), 'source-text', NOW)
    const duplicateId = duplicated.selection.selectionIds[0]!
    const presentationState = currentScene(duplicated).presentation!.states.find(
      (candidate) => candidate.id === stateId,
    )!

    expect(presentationState.layerItemOverrides[duplicateId]).toEqual({
      frame: { x: 334, y: 244 },
      label: '命名态标题 副本',
    })
    expect(presentationState.layerItemOverrides[duplicateId]?.locked).toBeUndefined()
    expect(presentationState.layerItemOverrides[duplicateId]?.order).toBeUndefined()
    expect(presentationState.layerItemOrder).toEqual([
      'source-text',
      duplicateId,
      'other-shape',
    ])
    expect(courseProjectDocumentSchema.safeParse(duplicated.history.present).success).toBe(true)
  })

  it('duplicates the complete named-state click graph with fresh rule and action ids', () => {
    let project = createTwoLayerProject()
    project = updateCourseProject(project, (draft) => {
      slideSurface(draft).scenes[0]!.interactions = motionGraph('source-text')
    }, NOW)
    const named = addV9SlidePresentationState(open(project), '互动态', NOW)
    const duplicated = duplicateV9SlideLayer(named, 'source-text', NOW)
    const duplicateId = duplicated.selection.selectionIds[0]!
    const scene = currentScene(duplicated)
    const originalRuleIds = new Set(['rule-source-click', 'rule-source-completed'])
    const originalActionIds = new Set(['action-source-enter', 'action-source-exit'])
    const clonedClick = scene.interactions.find(
      (rule) => rule.trigger.type === 'node.click' && rule.trigger.nodeId === duplicateId,
    )
    const clonedCompletion = scene.interactions.find(
      (rule) => rule.trigger.type === 'animation.completed' &&
        rule.trigger.actionId === clonedClick?.actions[0]?.id,
    )

    expect(scene.interactions).toHaveLength(4)
    expect(clonedClick).toBeDefined()
    expect(clonedCompletion).toBeDefined()
    expect(originalRuleIds.has(clonedClick!.id)).toBe(false)
    expect(originalRuleIds.has(clonedCompletion!.id)).toBe(false)
    expect(clonedClick!.actions.every((step) => !originalActionIds.has(step.id))).toBe(true)
    expect(clonedCompletion!.actions.every((step) => !originalActionIds.has(step.id))).toBe(true)
    expect(clonedClick!.actions[0]!.action).toMatchObject({ nodeId: duplicateId })
    expect(clonedCompletion!.actions[0]!.action).toMatchObject({ nodeId: duplicateId })
    expect(new Set(scene.interactions.map((rule) => rule.id)).size).toBe(4)
    expect(new Set(scene.interactions.flatMap((rule) => rule.actions.map((step) => step.id))).size)
      .toBe(4)
    expect(courseProjectDocumentSchema.safeParse(duplicated.history.present).success).toBe(true)
  })

  it('removes the last sparse override when deleting a named-state-only hidden-base item', () => {
    const named = addV9SlidePresentationState(open(createTwoLayerProject()), '临时态', NOW)
    const inserted = addV9SlideShapeLayer(named, 'ellipse', 520, 300, NOW)
    const insertedId = inserted.selection.selectionIds[0]!
    const before = currentScene(inserted)
    const baseBefore = before.layerItems.find((item) => item.layerItemId === insertedId)!
    const stateBefore = before.presentation!.states.find(
      (candidate) => candidate.id === inserted.selection.stateId,
    )!
    expect(baseBefore.visible).toBe(false)
    expect(stateBefore.layerItemOverrides[insertedId]).toEqual({ visible: true })

    const deleted = deleteV9SlideLayer(inserted, insertedId, NOW)
    const scene = currentScene(deleted)
    const presentationState = scene.presentation!.states.find(
      (candidate) => candidate.id === deleted.selection.stateId,
    )!

    expect(scene.layerItems.find((item) => item.layerItemId === insertedId)?.visible).toBe(false)
    expect(presentationState.layerItemOverrides[insertedId]).toBeUndefined()
    expect(deleted.selection.selectionIds).toEqual([])
    expect(courseProjectDocumentSchema.safeParse(deleted.history.present).success).toBe(true)
  })

  it('round-trips image and video natives through snapshot, layer edits, transform and duplicate', () => {
    let project = createCourseProject({ id: 'native-media-regression', now: NOW })
    project = updateCourseProject(project, (draft) => {
      draft.assets['image-asset'] = {
        id: 'image-asset',
        filename: 'image.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'assets/image.png',
        byteLength: 16,
        width: 640,
        height: 360,
      }
      draft.assets['video-asset'] = {
        id: 'video-asset',
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        kind: 'video',
        path: 'assets/video.mp4',
        byteLength: 32,
        width: 1280,
        height: 720,
        duration: 12,
      }
      const scene = slideSurface(draft).scenes[0]!
      scene.layerItems.push(
        sceneNodeToCourseLayerItem(createImageNode({
          id: 'native-image',
          name: '示意图片',
          assetId: 'image-asset',
          x: 80,
          y: 100,
          width: 320,
          height: 180,
        }), 2),
        sceneNodeToCourseLayerItem(createVideoNode({
          id: 'native-video',
          name: '讲解视频',
          assetId: 'video-asset',
          x: 520,
          y: 100,
          width: 480,
          height: 270,
        }), 3),
      )
    }, NOW)
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)

    let state = open(project)
    const initialSnapshot = buildV9SlideWorkspaceSnapshot(state)
    expect(
      initialSnapshot.document.nodes
        .map((node) => node.type)
        .filter((type) => type !== 'teacher-controller'),
    ).toEqual(['image', 'video'])
    // The effective global teacher-controller is exposed as a scene-canvas proxy.
    expect(initialSnapshot.document.nodes.some((node) => node.type === 'teacher-controller')).toBe(true)

    state = selectV9SlideVerticalSlice(state, {
      nodeIds: ['native-image', 'native-video'],
      additive: false,
    })
    state = updateV9SlideLayer(state, 'native-image', { visible: false, locked: true }, NOW)
    state = updateV9SlideLayer(state, 'native-video', { visible: false, locked: true }, NOW)
    const hiddenSnapshot = buildV9SlideWorkspaceSnapshot(state)
    expect(hiddenSnapshot.selectedNodeIds).toEqual(['native-image', 'native-video'])
    expect(hiddenSnapshot.document.nodes.find((node) => node.id === 'native-image'))
      .toMatchObject({ type: 'image', visible: false, locked: true })
    expect(hiddenSnapshot.document.nodes.find((node) => node.id === 'native-video'))
      .toMatchObject({ type: 'video', visible: false, locked: true })

    state = updateV9SlideLayer(state, 'native-image', { visible: true, locked: false }, NOW)
    state = updateV9SlideLayer(state, 'native-video', { visible: true, locked: false }, NOW)
    state = transformV9SlideVerticalSlice(state, {
      nodes: [{
        nodeId: 'native-image',
        x: 100,
        y: 120,
        width: 300,
        height: 168,
        rotation: 6,
      }, {
        nodeId: 'native-video',
        x: 500,
        y: 140,
        width: 460,
        height: 258,
        rotation: -4,
      }],
    }, NOW)
    const transformedSnapshot = buildV9SlideWorkspaceSnapshot(state)
    expect(transformedSnapshot.document.nodes.find((node) => node.id === 'native-image'))
      .toMatchObject({ x: 100, y: 120, width: 300, height: 168, rotation: 6 })
    expect(transformedSnapshot.document.nodes.find((node) => node.id === 'native-video'))
      .toMatchObject({ x: 500, y: 140, width: 460, height: 258, rotation: -4 })

    state = duplicateV9SlideLayer(state, 'native-image', NOW)
    const imageCopyId = state.selection.selectionIds[0]!
    state = duplicateV9SlideLayer(state, 'native-video', NOW)
    const videoCopyId = state.selection.selectionIds[0]!
    const scene = currentScene(state)
    expect(scene.layerItems.find((item) => item.layerItemId === imageCopyId)).toMatchObject({
      frame: { x: 124, y: 144, width: 300, height: 168 },
      content: { nativeType: 'image', data: { assetId: 'image-asset' } },
    })
    expect(scene.layerItems.find((item) => item.layerItemId === videoCopyId)).toMatchObject({
      frame: { x: 524, y: 164, width: 460, height: 258 },
      content: { nativeType: 'video', data: { assetId: 'video-asset' } },
    })
    expect(courseProjectDocumentSchema.safeParse(state.history.present).success).toBe(true)
  })

  it('renders a scene-authored teacher controller without exposing unsupported scene commands', () => {
    let project = createCourseProject({ id: 'scene-controller-snapshot', now: NOW })
    const surface = slideSurface(project)
    project = addSlideTextLayer(project, surface.id, surface.scenes[0]!.id, '可编辑正文', {
      id: 'visible-text',
      now: NOW,
    })
    project = updateCourseProject(project, (draft) => {
      const controller = draft.globalLayerItems[0]?.item
      if (
        !controller ||
        controller.kind !== 'native' ||
        controller.content.nativeType !== 'teacher-controller'
      ) throw new Error('expected global teacher controller')
      const localController = structuredClone(controller)
      localController.layerItemId = 'scene-teacher-controller'
      localController.label = '场景教师控制器'
      localController.order = 3
      slideSurface(draft).scenes[0]!.layerItems.push(localController)
    }, NOW)

    const state = open(project)
    const snapshot = buildV9SlideWorkspaceSnapshot(state)

    expect(snapshot.document.nodes.some((node) => node.id === 'visible-text')).toBe(true)
    // A scene-authored controller stays out of the document canvas; only the
    // effective global controller appears there as a proxy.
    expect(snapshot.document.nodes.some((node) => node.id === 'scene-teacher-controller')).toBe(false)
    expect(
      snapshot.document.nodes.filter(
        (node) => node.type === 'teacher-controller' && node.id !== 'scene-teacher-controller',
      ),
    ).toHaveLength(1)
    expect(snapshot.previewDocument.nodes.find(
      (node) => node.id === 'scene-teacher-controller',
    )).toMatchObject({ type: 'teacher-controller', name: '场景教师控制器' })
    expect(snapshot.previewDocument.nodes.filter((node) => node.type === 'teacher-controller'))
      .toHaveLength(2)
    expect(selectV9SlideVerticalSlice(state, {
      nodeIds: ['scene-teacher-controller'],
      additive: false,
    })).toBe(state)
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
  })
})
