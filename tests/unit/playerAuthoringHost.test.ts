import { describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({
  Scene: class {},
  Loader: { Events: { COMPLETE: 'complete' } },
  Math: {
    Clamp: (value: number, minimum: number, maximum: number) =>
      Math.max(minimum, Math.min(maximum, value)),
  },
}))

import {
  PlayerScene,
  resolvePlayerSceneEntryStateId,
} from '../../src/player/PlayerScene'
import { PlayerApp } from '../../src/player/PlayerApp'
import { CourseRuntimeKernel } from '../../src/player/CourseRuntimeKernel'
import {
  PLAYER_AUTHORING_MESSAGE_TYPES,
  PLAYER_AUTHORING_PROTOCOL_VERSION,
  type PlayerAuthoringPatchCommand,
} from '../../src/shared/playerAuthoringProtocol'
import {
  createProject,
  createRectangleNode,
} from '../../src/renderer/project/createProject'
import type { ExportPayload } from '../../src/shared/componentTypes'

function createSceneHarness() {
  const project = createProject({ includeDefaultController: false })
  const scene = project.scenes[0]!
  const first = createRectangleNode({ id: 'first', name: '节点 A', x: 40 })
  const second = createRectangleNode({ id: 'second', name: '节点 B', x: 240 })
  scene.nodes = [first, second]
  const stateId = scene.presentation!.initialStateId
  const payload: ExportPayload = { project, assets: {}, components: {} }
  const firstHandle = {
    id: first.id,
    type: first.type,
    root: { setDepth: vi.fn() },
    update: vi.fn(),
    destroy: vi.fn(),
  }
  const secondHandle = {
    id: second.id,
    type: second.type,
    root: { setDepth: vi.fn() },
    update: vi.fn(),
    destroy: vi.fn(),
  }
  const motionDirector = {
    prepareStableUpdate: vi.fn(),
    update: vi.fn(),
    refreshInputStates: vi.fn(),
    preview: vi.fn(() => true),
  }
  const sceneNodesRoot = { moveTo: vi.fn() }
  const applySceneBackground = vi.fn()
  const playerScene = Object.create(PlayerScene.prototype) as PlayerScene
  Reflect.set(playerScene, 'payload', payload)
  Reflect.set(playerScene, 'authoringMode', true)
  Reflect.set(playerScene, 'ready', true)
  Reflect.set(playerScene, 'renderingScene', false)
  Reflect.set(playerScene, 'currentSceneIndex', 0)
  Reflect.set(playerScene, 'currentPresentationStateId', stateId)
  Reflect.set(playerScene, 'renderedNodes', [firstHandle, secondHandle])
  Reflect.set(playerScene, 'renderedGlobalItems', [])
  Reflect.set(playerScene, 'globalVisibilityByNodeId', new Map<string, boolean>())
  Reflect.set(playerScene, 'sceneMotionDirector', motionDirector)
  Reflect.set(playerScene, 'sceneNodesRoot', sceneNodesRoot)
  Reflect.set(playerScene, 'applySceneBackground', applySceneBackground)

  return {
    project,
    scene,
    stateId,
    playerScene,
    first,
    second,
    firstHandle,
    secondHandle,
    motionDirector,
    sceneNodesRoot,
    applySceneBackground,
  }
}

describe('unified Player authoring host', () => {
  it('keeps explicit null as the base authoring state without changing playback fallback', () => {
    const project = createProject({ includeDefaultController: false })
    const scene = project.scenes[0]!
    const initialStateId = scene.presentation!.initialStateId

    expect(resolvePlayerSceneEntryStateId(scene, null, true)).toBeNull()
    expect(resolvePlayerSceneEntryStateId(scene, null, false)).toBe(initialStateId)
    expect(resolvePlayerSceneEntryStateId(scene, undefined, true)).toBe(initialStateId)
  })

  it('switches a named authoring view back to base through an explicit null entry', () => {
    const harness = createSceneHarness()
    harness.scene.presentation!.states[0]!.nodeOverrides.first = { x: 96 }
    const projectBefore = structuredClone(harness.project)

    expect(harness.playerScene.showAuthoringBaseState()).toBe(true)
    expect(harness.playerScene.getCurrentPresentationStateId()).toBeNull()
    expect(harness.firstHandle.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'first', x: 40 }),
    )
    expect(harness.applySceneBackground).toHaveBeenCalledWith(
      expect.objectContaining({ id: harness.scene.id }),
    )
    expect(harness.project).toEqual(projectBefore)
  })

  it('exposes read-only presentation actions to authoring runtimes/components', () => {
    const harness = createSceneHarness()
    const presentationApi = Reflect.get(
      PlayerScene.prototype,
      'presentationApi',
    ).call(harness.playerScene) as {
      setState(stateId: string): boolean
      transitionTo(stateId: string): boolean
    }

    expect(presentationApi.setState('another-state')).toBe(false)
    expect(presentationApi.transitionTo('another-state')).toBe(false)
    expect(harness.playerScene.getCurrentPresentationStateId()).toBe(harness.stateId)
  })

  it('lets editor synchronization bypass runtime navigation guards', () => {
    const project = createProject({ includeDefaultController: false })
    const playerScene = Object.create(PlayerScene.prototype) as PlayerScene
    const resolveNavigation = vi.fn(() => null)
    const processPendingNavigation = vi.fn()
    Reflect.set(playerScene, 'payload', { project, assets: {}, components: {} })
    Reflect.set(playerScene, 'ready', true)
    Reflect.set(playerScene, 'currentSceneIndex', -1)
    Reflect.set(playerScene, 'pendingNavigation', null)
    Reflect.set(playerScene, 'renderingScene', false)
    Reflect.set(playerScene, 'applyingPresentation', false)
    Reflect.set(playerScene, 'runtimeKernel', { resolveNavigation })
    Reflect.set(playerScene, 'processPendingNavigation', processPendingNavigation)

    expect(playerScene.showScene(0, false, null, true)).toBe(true)
    expect(resolveNavigation).not.toHaveBeenCalled()
    expect(processPendingNavigation).toHaveBeenCalledOnce()
  })

  it('updates a full materialized node without mutating Project V8', async () => {
    const harness = createSceneHarness()
    const projectBefore = structuredClone(harness.project)
    const nextNode = { ...structuredClone(harness.first), x: 318, opacity: 0.6 }

    const result = await harness.playerScene.applyAuthoringPatch(
      { sceneId: harness.scene.id, stateId: harness.stateId },
      {
        kind: 'native-node',
        target: { kind: 'native-node', scope: 'scene', nodeId: nextNode.id },
        node: nextNode,
      },
    )

    expect(result).toEqual({
      ok: true,
      target: { kind: 'native-node', scope: 'scene', nodeId: 'first' },
    })
    expect(harness.firstHandle.update).toHaveBeenCalledWith(nextNode)
    expect(harness.motionDirector.prepareStableUpdate).toHaveBeenCalledWith('first')
    expect(harness.project).toEqual(projectBefore)
  })

  it('在 Player 真实节点上执行不写工程的临时动画预览', async () => {
    const harness = createSceneHarness()
    const projectBefore = structuredClone(harness.project)
    const motion = {
      type: 'node.enter' as const,
      nodeId: harness.first.id,
      effect: 'fade' as const,
      durationMs: 360,
      easing: 'ease-out' as const,
    }

    const result = await harness.playerScene.applyAuthoringPatch(
      { sceneId: harness.scene.id, stateId: harness.stateId },
      {
        kind: 'preview-node-motion',
        target: {
          kind: 'native-node',
          scope: 'scene',
          nodeId: harness.first.id,
        },
        action: motion,
        delayMs: 120,
      },
    )

    expect(result.ok).toBe(true)
    expect(harness.motionDirector.preview).toHaveBeenCalledWith(motion, 120)
    expect(harness.firstHandle.update).not.toHaveBeenCalled()
    expect(harness.project).toEqual(projectBefore)
  })

  it('rejects stale context, changed identity, and incomplete order', async () => {
    const harness = createSceneHarness()
    const context = { sceneId: harness.scene.id, stateId: harness.stateId }

    await expect(harness.playerScene.applyAuthoringPatch(
      { ...context, sceneId: 'stale-scene' },
      {
        kind: 'native-node',
        target: { kind: 'native-node', scope: 'scene', nodeId: 'first' },
        node: structuredClone(harness.first),
      },
    )).resolves.toMatchObject({ ok: false, code: 'scene-mismatch' })

    await expect(harness.playerScene.applyAuthoringPatch(
      context,
      {
        kind: 'native-node',
        target: { kind: 'native-node', scope: 'scene', nodeId: 'first' },
        node: { ...structuredClone(harness.first), id: 'second' },
      },
    )).resolves.toMatchObject({ ok: false, code: 'target-mismatch' })

    await expect(harness.playerScene.applyAuthoringPatch(
      context,
      {
        kind: 'scene-order',
        target: { kind: 'scene-order', scope: 'scene' },
        nodeIds: ['first'],
      },
    )).resolves.toMatchObject({ ok: false, code: 'target-mismatch' })
    expect(harness.firstHandle.update).not.toHaveBeenCalled()
  })

  it('applies complete scene order only to rendered roots', async () => {
    const harness = createSceneHarness()
    const result = await harness.playerScene.applyAuthoringPatch(
      { sceneId: harness.scene.id, stateId: harness.stateId },
      {
        kind: 'scene-order',
        target: { kind: 'scene-order', scope: 'scene' },
        nodeIds: ['second', 'first'],
      },
    )

    expect(result.ok).toBe(true)
    expect(harness.secondHandle.root.setDepth).toHaveBeenCalledWith(0)
    expect(harness.firstHandle.root.setDepth).toHaveBeenCalledWith(1)
    expect(harness.sceneNodesRoot.moveTo.mock.calls).toEqual([
      [harness.secondHandle.root, 0],
      [harness.firstHandle.root, 1],
    ])
    expect(harness.scene.nodes.map((node) => node.id)).toEqual(['first', 'second'])
  })

  it('updates the materialized background without changing the scene document', async () => {
    const harness = createSceneHarness()
    const sceneBefore = structuredClone(harness.scene)

    const result = await harness.playerScene.applyAuthoringPatch(
      { sceneId: harness.scene.id, stateId: harness.stateId },
      {
        kind: 'scene-background',
        target: { kind: 'scene-background', scope: 'scene' },
        backgroundColor: '#123456',
        backgroundAssetId: null,
      },
    )

    expect(result.ok).toBe(true)
    expect(harness.applySceneBackground).toHaveBeenCalledWith(
      expect.objectContaining({
        id: harness.scene.id,
        backgroundColor: '#123456',
        backgroundAssetId: null,
      }),
    )
    expect(harness.scene).toEqual(sceneBefore)
  })

  it('updates a visible global native node through the same transient path', async () => {
    const harness = createSceneHarness()
    const globalNode = createRectangleNode({
      id: 'global-node',
      name: '全局节点',
      x: 12,
    })
    const item = {
      node: globalNode,
      layer: 'overlay' as const,
      visibility: { mode: 'include' as const, sceneIds: ['another-scene'] },
    }
    const handle = {
      id: globalNode.id,
      type: globalNode.type,
      root: { setDepth: vi.fn() },
      update: vi.fn(),
      setHostVisible: vi.fn(),
      destroy: vi.fn(),
    }
    const globalMotionDirector = {
      update: vi.fn(),
      refreshInputStates: vi.fn(),
    }
    Reflect.set(harness.playerScene, 'renderedGlobalItems', [{ item, handle }])
    Reflect.set(harness.playerScene, 'globalMotionDirector', globalMotionDirector)
    Reflect.set(harness.playerScene, 'authoringScope', 'global')
    const nextNode = { ...structuredClone(globalNode), x: 480 }

    const result = await harness.playerScene.applyAuthoringPatch(
      { sceneId: harness.scene.id, stateId: harness.stateId },
      {
        kind: 'native-node',
        target: { kind: 'native-node', scope: 'global', nodeId: globalNode.id },
        node: nextNode,
      },
    )

    expect(result.ok).toBe(true)
    expect(handle.update).toHaveBeenCalledWith(nextNode)
    expect(handle.setHostVisible).toHaveBeenCalledWith(true)
    expect(globalMotionDirector.update).toHaveBeenCalled()
  })

  it('全局层编辑显示全部全局元素，场景编辑仍遵守可见范围', () => {
    const harness = createSceneHarness()
    const globalNode = createRectangleNode({
      id: 'conditional-global',
      name: '条件全局节点',
    })
    const item = {
      node: globalNode,
      layer: 'overlay' as const,
      visibility: { mode: 'include' as const, sceneIds: ['another-scene'] },
    }
    const handle = {
      id: globalNode.id,
      type: globalNode.type,
      root: { setDepth: vi.fn() },
      update: vi.fn(),
      setHostVisible: vi.fn(),
      destroy: vi.fn(),
    }
    const globalMotionDirector = {
      update: vi.fn(),
      refreshInputStates: vi.fn(),
      flushActivations: vi.fn(),
    }
    Reflect.set(harness.playerScene, 'renderedGlobalItems', [{ item, handle }])
    Reflect.set(harness.playerScene, 'globalMotionDirector', globalMotionDirector)
    Reflect.set(harness.playerScene, 'authoringScope', 'global')

    Reflect.get(PlayerScene.prototype, 'updateGlobalLayerVisibility').call(
      harness.playerScene,
      harness.scene.id,
    )
    expect(handle.setHostVisible).toHaveBeenLastCalledWith(true)

    Reflect.set(harness.playerScene, 'authoringScope', 'scene')
    Reflect.get(PlayerScene.prototype, 'updateGlobalLayerVisibility').call(
      harness.playerScene,
      harness.scene.id,
    )
    expect(handle.setHostVisible).toHaveBeenLastCalledWith(false)
  })

  it('freezes runtime course-state writes only in authoring hosts', () => {
    const project = createProject({ includeDefaultController: false })
    const payload: ExportPayload = { project, assets: {}, components: {} }
    const actions = {
      goToScene: () => false,
      nextScene: () => false,
      previousScene: () => false,
      replayScene: () => false,
      restartCourse: () => false,
    }
    const authoringKernel = new CourseRuntimeKernel(payload, actions, {
      freezeCourseState: true,
    })
    const previewKernel = new CourseRuntimeKernel(payload, actions)

    authoringKernel.courseState.set('score', 8)
    previewKernel.courseState.set('score', 8)

    expect(authoringKernel.courseState.snapshot()).toEqual({})
    expect(previewKernel.courseState.snapshot()).toEqual({ score: 8 })
    authoringKernel.destroy()
    previewKernel.destroy()
  })

  it('serializes commands and rejects an already-applied revision', async () => {
    const harness = createSceneHarness()
    const player = Object.create(PlayerApp.prototype) as PlayerApp
    Reflect.set(player, 'authoringMode', true)
    Reflect.set(player, 'destroyed', false)
    Reflect.set(player, 'authoringQueue', Promise.resolve())
    Reflect.set(player, 'lastAuthoringRevision', -1)
    Reflect.set(player, 'playerScene', harness.playerScene)
    const command: PlayerAuthoringPatchCommand = {
      type: PLAYER_AUTHORING_MESSAGE_TYPES.patch,
      protocolVersion: PLAYER_AUTHORING_PROTOCOL_VERSION,
      sessionId: 'session-a',
      requestId: 'request-a',
      revision: 1,
      context: { sceneId: harness.scene.id, stateId: harness.stateId },
      patch: {
        kind: 'native-node',
        target: { kind: 'native-node', scope: 'scene', nodeId: 'first' },
        node: { ...structuredClone(harness.first), x: 400 },
      },
    }

    await expect(player.applyAuthoringCommand(command)).resolves.toMatchObject({
      type: PLAYER_AUTHORING_MESSAGE_TYPES.ack,
      revision: 1,
    })
    await expect(player.applyAuthoringCommand({
      ...command,
      requestId: 'request-stale',
    })).resolves.toMatchObject({
      type: PLAYER_AUTHORING_MESSAGE_TYPES.error,
      code: 'stale-revision',
    })
    expect(harness.firstHandle.update).toHaveBeenCalledTimes(1)
  })
})
