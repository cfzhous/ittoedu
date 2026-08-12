import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportPayload } from '../../src/shared/componentTypes'
import {
  createExternalComponentNode,
  createProject,
  createScene,
  createTextNode,
} from '../../src/renderer/project/createProject'
import { runtimeSnapshotKey } from '../../src/renderer/export/exportPayloadSupport'

const playerCalls = vi.hoisted(() => [] as Array<{
  payload: ExportPayload
  options: Record<string, unknown>
}>)
const sceneNodeVisibilityAtCapture = vi.hoisted(() => [] as boolean[])
const globalNodeVisibilityAtReady = vi.hoisted(() => [] as boolean[][])
const globalNodeVisibilityAtCapture = vi.hoisted(() => [] as boolean[][])
const globalRuntimeVisibilityAtCapture = vi.hoisted(() => [] as boolean[][])
const globalNodeVisibilityAtDestroy = vi.hoisted(() => [] as boolean[][])
const captureReadyFailures = vi.hoisted(() => new Set<number>())
const layerCaptureFailures = vi.hoisted(() => ({
  attempts: 0,
  failAt: new Set<number>(),
}))

class FakeLayer {
  readonly list: FakeLayer[] = []

  constructor(readonly name = '') {}

  visible = true

  setVisible(visible: boolean): this {
    this.visible = visible
    return this
  }
}

vi.mock('../../src/player/PlayerApp', () => ({
  PlayerApp: class FakePlayerApp {
    private currentIndex = 0
    private readonly layers = new Map([
      ['global-underlay', new FakeLayer('global-underlay')],
      ['scene-underlay', new FakeLayer('scene-underlay')],
      ['scene-nodes', new FakeLayer('scene-nodes')],
      ['scene-overlay', new FakeLayer('scene-overlay')],
      ['global-overlay', new FakeLayer('global-overlay')],
    ])

    game = {
      scene: {
        getScene: () => ({
          children: {
            getByName: (name: string) => this.layers.get(name),
          },
        }),
      },
    }

    constructor(
      payload: ExportPayload,
      root: HTMLElement,
      options: Record<string, unknown>,
    ) {
      playerCalls.push({ payload, options })
      for (const item of payload.project.globalLayer) {
        this.layers.get(`global-${item.layer}`)?.list.push(
          new FakeLayer(`node:${item.node.id}`),
        )
      }
      if (payload.project.globalRuntime?.enabled) {
        this.layers.get('global-underlay')?.list.push(
          new FakeLayer('global-runtime:phaser-underlay'),
        )
        this.layers.get('global-overlay')?.list.push(
          new FakeLayer('global-runtime:phaser-overlay'),
        )
      }
      const stage = document.createElement('section')
      stage.className = 'lesson-stage'
      root.append(stage)
    }

    getCurrentSceneIndex(): number {
      return this.currentIndex
    }

    goToScene(index: number): boolean {
      this.currentIndex = index
      return true
    }

    sceneNodesVisible(): boolean {
      return this.layers.get('scene-nodes')?.visible ?? true
    }

    globalNodeVisibility(): boolean[] {
      return [...this.layers.values()].flatMap((layer) => layer.list
        .filter((child) => child.name.startsWith('node:'))
        .map((child) => child.visible))
    }

    globalRuntimeVisibility(): boolean[] {
      return [...this.layers.values()].flatMap((layer) => layer.list
        .filter((child) => child.name.startsWith('global-runtime:'))
        .map((child) => child.visible))
    }

    destroy(): void {
      globalNodeVisibilityAtDestroy.push(this.globalNodeVisibility())
    }
  },
}))

vi.mock('../../src/renderer/export/playerCapture', () => ({
  capturePlayerStage: vi.fn(async (player: {
    sceneNodesVisible(): boolean
    globalNodeVisibility(): boolean[]
    globalRuntimeVisibility(): boolean[]
  }) => {
    sceneNodeVisibilityAtCapture.push(player.sceneNodesVisible())
    globalNodeVisibilityAtCapture.push(player.globalNodeVisibility())
    globalRuntimeVisibilityAtCapture.push(player.globalRuntimeVisibility())
    const attempt = layerCaptureFailures.attempts
    layerCaptureFailures.attempts += 1
    if (layerCaptureFailures.failAt.has(attempt)) {
      throw new Error(`runtime layer capture ${attempt} failed`)
    }
    return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" />'
  }),
  createHiddenPlayerRoot: vi.fn(() => {
    const root = document.createElement('div')
    for (const suffix of [
      'global-underlay',
      'scene-underlay',
      'scene-overlay',
      'global-overlay',
    ]) {
      const layer = document.createElement('div')
      layer.className = `lesson-runtime-layer lesson-runtime-layer--${suffix}`
      root.append(layer)
    }
    document.body.append(root)
    return root
  }),
  playerSupportsRuntimeCapture: vi.fn(() => true),
  settleCaptureFrames: vi.fn(async () => undefined),
  sizeHiddenPlayerStage: vi.fn(),
  waitForPlayerCaptureReady: vi.fn(async (player: {
    getCurrentSceneIndex(): number
    globalNodeVisibility(): boolean[]
  }) => {
    globalNodeVisibilityAtReady.push(player.globalNodeVisibility())
    const index = player.getCurrentSceneIndex()
    if (captureReadyFailures.has(index)) {
      throw new Error(`runtime scene ${index} failed`)
    }
  }),
  waitForPlayerScene: vi.fn(async () => undefined),
}))

import { renderPptxRuntimeSnapshots } from '../../src/renderer/export/renderPptxRuntimeSnapshots'

beforeEach(() => {
  playerCalls.length = 0
  sceneNodeVisibilityAtCapture.length = 0
  globalNodeVisibilityAtReady.length = 0
  globalNodeVisibilityAtCapture.length = 0
  globalRuntimeVisibilityAtCapture.length = 0
  globalNodeVisibilityAtDestroy.length = 0
  captureReadyFailures.clear()
  layerCaptureFailures.attempts = 0
  layerCaptureFailures.failAt.clear()
  vi.clearAllMocks()
})

describe('PPTX runtime snapshot isolation', () => {
  it('保留真实初始 presentation 和节点语义，但不执行外部组件', async () => {
    const project = createProject({ includeDefaultController: false })
    const scene = project.scenes[0]!
    const title = createTextNode({
      id: 'runtime-title',
      text: '原始文本',
      visible: true,
    })
    const component = createExternalComponentNode({
      id: 'stateful-component',
      visible: true,
      component: { packageId: 'com.example.stateful', version: '1.0.0' },
      props: { writesCourseState: true },
    })
    scene.nodes = [title, component]
    scene.presentation = {
      initialStateId: 'state-authored-initial',
      thumbnailStateId: 'state-authored-initial',
      states: [{
        id: 'state-authored-initial',
        name: '作者初始态',
        nodeOverrides: {
          [title.id]: { x: 360, visible: false },
          [component.id]: { props: { writesCourseState: false } },
        },
      }, {
        id: 'state-later',
        name: '后续状态',
        nodeOverrides: {},
      }],
    }
    scene.runtime = {
      enabled: true,
      runtimeApiVersion: 2,
      renderMode: 'dom',
      source: 'CoursewareRuntime.define({runtimeApiVersion:2,create:function(){return{destroy:function(){}}}})',
      content: { values: {} },
      assets: {},
      nodeBindings: { title: title.id, component: component.id },
    }
    const payload: ExportPayload = {
      project,
      assets: {},
      components: {
        'com.example.stateful@1.0.0': {
          manifest: {
            schemaVersion: 4,
            runtimeApiVersion: 4,
            id: 'com.example.stateful',
            name: '有状态组件',
            version: '1.0.0',
            entry: 'runtime.js',
            defaultSize: { width: 320, height: 180 },
            minSize: { width: 16, height: 16 },
            preserveAspectRatio: false,
            assets: {},
            defaultProps: {},
            supportedScopes: ['scene'],
            renderMode: 'phaser',
          },
          runtimeSource: 'throw new Error("must not execute")',
          assets: {},
        },
      },
    }

    const snapshots = await renderPptxRuntimeSnapshots(payload)

    expect(playerCalls).toHaveLength(1)
    const isolated = playerCalls[0]!.payload
    expect(playerCalls[0]!.options).toMatchObject({
      transparent: true,
      controls: false,
      mode: 'capture',
    })
    expect(Object.keys(isolated.components)).toEqual([
      'com.example.stateful@1.0.0',
    ])
    expect(
      isolated.components['com.example.stateful@1.0.0']?.runtimeSource,
    ).toContain('CoursewareComponent.define')
    expect(
      isolated.components['com.example.stateful@1.0.0']?.runtimeSource,
    ).not.toContain('must not execute')
    expect(isolated.project.scenes[0]!.presentation).toEqual(scene.presentation)
    expect(isolated.project.scenes[0]!.nodes).toEqual(scene.nodes)
    expect(isolated.project.scenes[0]!.runtime?.nodeBindings).toEqual({
      title: title.id,
      component: component.id,
    })
    expect(sceneNodeVisibilityAtCapture).toEqual([false, false])
    expect(snapshots.has(runtimeSnapshotKey('scene', scene.id, 'underlay')))
      .toBe(true)
    expect(snapshots.has(runtimeSnapshotKey('scene', scene.id, 'overlay')))
      .toBe(true)
  })

  it('为 global runtime 保留原生全局节点，仅在像素捕获窗口隐藏它们', async () => {
    const project = createProject({ includeDefaultController: false })
    const nativeGlobal = createTextNode({
      id: 'global-runtime-label',
      x: 48,
      y: 32,
      visible: true,
      text: '全局语义节点',
    })
    const externalGlobal = createExternalComponentNode({
      id: 'global-side-effect-component',
      component: { packageId: 'com.example.side-effect', version: '1.0.0' },
    })
    project.globalLayer = [{
      node: nativeGlobal,
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
    }, {
      node: externalGlobal,
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
    }]
    project.globalRuntime = {
      enabled: true,
      runtimeApiVersion: 2,
      renderMode: 'phaser',
      source: 'CoursewareRuntime.define({runtimeApiVersion:2,create:function(){return{destroy:function(){}}}})',
      content: { values: {} },
      assets: {},
      nodeBindings: {
        label: nativeGlobal.id,
        unsupportedComponent: externalGlobal.id,
      },
    }
    const payload: ExportPayload = {
      project,
      assets: {},
      components: {
        'com.example.side-effect@1.0.0': {
          manifest: {
            schemaVersion: 4,
            runtimeApiVersion: 4,
            id: 'com.example.side-effect',
            name: '有副作用的全局组件',
            version: '1.0.0',
            entry: 'runtime.js',
            defaultSize: { width: 320, height: 180 },
            minSize: { width: 16, height: 16 },
            preserveAspectRatio: false,
            assets: {},
            defaultProps: {},
            supportedScopes: ['global'],
            renderMode: 'phaser',
          },
          runtimeSource: 'throw new Error("must not execute")',
          assets: {},
        },
      },
    }

    const snapshots = await renderPptxRuntimeSnapshots(payload)

    expect(playerCalls).toHaveLength(1)
    const isolatedGlobal = playerCalls[0]!.payload.project.globalLayer
    expect(isolatedGlobal.map((item) => item.node.id)).toEqual([
      nativeGlobal.id,
      externalGlobal.id,
    ])
    expect(isolatedGlobal[0]!.node).toMatchObject({
      x: 48,
      y: 32,
      visible: true,
    })
    // Runtime create()/prepareCapture sees the authored node visibility. Only
    // the two actual canvas reads hide the `node:*` child, while runtime mounts
    // remain visible; the authored visibility is restored before destruction.
    expect(globalNodeVisibilityAtReady).toEqual([[true, true]])
    expect(globalNodeVisibilityAtCapture).toEqual([
      [false, false],
      [false, false],
    ])
    expect(globalRuntimeVisibilityAtCapture).toEqual([
      [true, true],
      [true, true],
    ])
    expect(globalNodeVisibilityAtDestroy).toEqual([[true, true]])
    const sceneId = project.scenes[0]!.id
    expect(snapshots.has(runtimeSnapshotKey('global', sceneId, 'underlay')))
      .toBe(true)
    expect(snapshots.has(runtimeSnapshotKey('global', sceneId, 'overlay')))
      .toBe(true)
  })

  it('单个场景运行时准备失败时保留前后条目的成功快照', async () => {
    const project = createProject({ includeDefaultController: false })
    project.scenes.push(
      createScene({ id: 'scene-2', name: '场景 2' }),
      createScene({ id: 'scene-3', name: '场景 3' }),
    )
    for (const scene of project.scenes) {
      scene.runtime = {
        enabled: true,
        runtimeApiVersion: 2,
        renderMode: 'dom',
        source: 'CoursewareRuntime.define({runtimeApiVersion:2,create:function(){return{destroy:function(){}}}})',
        content: { values: {} },
        assets: {},
      }
    }
    const payload: ExportPayload = { project, assets: {}, components: {} }
    const onFailure = vi.fn()
    captureReadyFailures.add(1)

    const snapshots = await renderPptxRuntimeSnapshots(payload, { onFailure })

    for (const layer of ['underlay', 'overlay'] as const) {
      expect(snapshots.has(runtimeSnapshotKey(
        'scene',
        project.scenes[0]!.id,
        layer,
      ))).toBe(true)
      expect(snapshots.has(runtimeSnapshotKey(
        'scene',
        project.scenes[1]!.id,
        layer,
      ))).toBe(false)
      expect(snapshots.has(runtimeSnapshotKey(
        'scene',
        project.scenes[2]!.id,
        layer,
      ))).toBe(true)
    }
    expect(onFailure).toHaveBeenCalledOnce()
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      entryKey: runtimeSnapshotKey('scene', project.scenes[1]!.id),
      snapshotKey: runtimeSnapshotKey('scene', project.scenes[1]!.id),
      sceneId: project.scenes[1]!.id,
      scope: 'scene',
    }))
    expect(playerCalls).toHaveLength(1)
    expect(globalNodeVisibilityAtDestroy).toHaveLength(1)
  })

  it('单层合成失败时保留同条目和后续条目的成功图层', async () => {
    const project = createProject({ includeDefaultController: false })
    project.scenes.push(createScene({ id: 'scene-2', name: '场景 2' }))
    for (const scene of project.scenes) {
      scene.runtime = {
        enabled: true,
        runtimeApiVersion: 2,
        renderMode: 'dom',
        source: 'CoursewareRuntime.define({runtimeApiVersion:2,create:function(){return{destroy:function(){}}}})',
        content: { values: {} },
        assets: {},
      }
    }
    const payload: ExportPayload = { project, assets: {}, components: {} }
    const onFailure = vi.fn()
    // Scene 1 underlay succeeds, scene 1 overlay fails, then scene 2 keeps
    // capturing both layers instead of discarding the partial batch.
    layerCaptureFailures.failAt.add(1)

    const snapshots = await renderPptxRuntimeSnapshots(payload, { onFailure })

    expect(snapshots.has(runtimeSnapshotKey(
      'scene',
      project.scenes[0]!.id,
      'underlay',
    ))).toBe(true)
    expect(snapshots.has(runtimeSnapshotKey(
      'scene',
      project.scenes[0]!.id,
      'overlay',
    ))).toBe(false)
    expect(snapshots.has(runtimeSnapshotKey(
      'scene',
      project.scenes[1]!.id,
      'underlay',
    ))).toBe(true)
    expect(snapshots.has(runtimeSnapshotKey(
      'scene',
      project.scenes[1]!.id,
      'overlay',
    ))).toBe(true)
    expect(onFailure).toHaveBeenCalledOnce()
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      entryKey: runtimeSnapshotKey('scene', project.scenes[0]!.id),
      snapshotKey: runtimeSnapshotKey(
        'scene',
        project.scenes[0]!.id,
        'overlay',
      ),
      layer: 'overlay',
    }))
  })
})
