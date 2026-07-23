import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportPayload } from '../../src/shared/componentTypes'
import {
  createExternalComponentNode,
  createProject,
  createScene,
} from '../../src/renderer/project/createProject'
import {
  pptxComponentSnapshotKey,
  pptxGlobalComponentSnapshotKey,
} from '../../src/renderer/export/pptxShared'

const playerCalls = vi.hoisted(() => [] as Array<{
  payload: ExportPayload
  options: Record<string, unknown>
}>)
const rendererCalls = vi.hoisted(() => ({
  snapshot: vi.fn(),
  snapshotArea: vi.fn(),
  snapshotAttempts: 0,
  failAt: new Set<number>(),
}))
const playerMetrics = vi.hoisted(() => ({
  active: 0,
  maxActive: 0,
  destroyed: 0,
}))

vi.mock('../../src/player/PlayerApp', () => ({
  PlayerApp: class FakePlayerApp {
    private currentIndex = 0
    private destroyed = false
    game = {
      scene: {
        getScene: () => ({ load: { isLoading: () => false } }),
      },
      renderer: {
        snapshot: (
          callback: (snapshot: HTMLImageElement) => void,
        ) => {
          rendererCalls.snapshot()
          const attempt = rendererCalls.snapshotAttempts
          rendererCalls.snapshotAttempts += 1
          if (rendererCalls.failAt.has(attempt)) {
            throw new Error(`component capture ${attempt} failed`)
          }
          const image = new Image()
          image.src = 'data:image/png;base64,U05BUFNIT1Q='
          callback(image)
        },
        snapshotArea: (
          _x: number,
          _y: number,
          _width: number,
          _height: number,
          callback: (snapshot: HTMLImageElement) => void,
        ) => {
          rendererCalls.snapshotArea()
          const image = new Image()
          image.src = 'data:image/png;base64,U05BUFNIT1Q='
          callback(image)
        },
      },
    }

    constructor(
      payload: ExportPayload,
      root: HTMLElement,
      options: Record<string, unknown>,
    ) {
      playerCalls.push({ payload, options })
      playerMetrics.active += 1
      playerMetrics.maxActive = Math.max(
        playerMetrics.maxActive,
        playerMetrics.active,
      )
      const stage = document.createElement('section')
      stage.className = 'lesson-stage'
      const canvasHost = document.createElement('div')
      canvasHost.className = 'lesson-canvas-host'
      stage.append(canvasHost)
      root.append(stage)
    }

    getCurrentSceneIndex(): number {
      return this.currentIndex
    }

    goToScene(index: number): boolean {
      this.currentIndex = index
      return true
    }

    destroy(): void {
      if (this.destroyed) return
      this.destroyed = true
      playerMetrics.active -= 1
      playerMetrics.destroyed += 1
    }
  },
}))

import { renderPptxComponentSnapshots } from '../../src/renderer/export/renderPptxComponentSnapshots'

beforeEach(() => {
  playerCalls.length = 0
  playerMetrics.active = 0
  playerMetrics.maxActive = 0
  playerMetrics.destroyed = 0
  rendererCalls.snapshotAttempts = 0
  rendererCalls.failAt.clear()
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PPTX component snapshot capture semantics', () => {
  it('starts the isolated Player in capture mode so playback-only hiding cannot leak into snapshots', async () => {
    const project = createProject({ includeDefaultController: false })
    const node = createExternalComponentNode({
      id: 'animated-component',
      component: { packageId: 'com.example.animated', version: '1.0.0' },
      playbackInitialVisibility: 'hidden',
    })
    project.scenes[0]!.nodes = [node]
    const payload: ExportPayload = { project, assets: {}, components: {} }

    const pending = renderPptxComponentSnapshots(payload)
    await vi.runAllTimersAsync()
    const snapshots = await pending

    expect(playerCalls).toHaveLength(1)
    expect(playerCalls[0]!.options).toMatchObject({
      transparent: true,
      controls: false,
      mode: 'capture',
    })
    expect(playerCalls[0]!.payload.project.scenes[0]!.nodes[0]).toMatchObject({
      id: node.id,
      x: 0,
      y: 0,
      visible: true,
      playbackInitialVisibility: 'hidden',
    })
    expect(snapshots.get(pptxComponentSnapshotKey(
      project.scenes[0]!.id,
      node.id,
    ))).toBe('data:image/png;base64,U05BUFNIT1Q=')
    expect(rendererCalls.snapshot).toHaveBeenCalledOnce()
    expect(rendererCalls.snapshotArea).not.toHaveBeenCalled()
  })

  it('逐实例销毁 Player，避免场景与全局组件并发持久化', async () => {
    const project = createProject({ includeDefaultController: false })
    project.scenes.push(createScene({ id: 'scene-2', name: '场景 2' }))
    const sceneNodes = project.scenes.map((scene, index) => {
      const node = createExternalComponentNode({
        id: `scene-component-${index + 1}`,
        width: 320,
        height: 180,
        component: { packageId: 'com.example.scene', version: '1.0.0' },
      })
      scene.nodes = [node]
      return node
    })
    const globalNode = createExternalComponentNode({
      id: 'global-component',
      width: 320,
      height: 180,
      component: { packageId: 'com.example.global', version: '1.0.0' },
    })
    project.globalLayer = [{
      node: globalNode,
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
    }]
    const payload: ExportPayload = { project, assets: {}, components: {} }

    const pending = renderPptxComponentSnapshots(payload)
    await vi.runAllTimersAsync()
    const snapshots = await pending

    // Entry order remains scene component, then its visible global component,
    // repeated for each authored scene. Every isolated payload contains only
    // the one component instance being captured.
    expect(playerCalls).toHaveLength(4)
    expect(playerMetrics).toEqual({ active: 0, maxActive: 1, destroyed: 4 })
    for (const { payload: isolated } of playerCalls) {
      expect(isolated.project.scenes).toHaveLength(1)
      const componentCount = isolated.project.scenes[0]!.nodes.filter(
        (node) => node.type === 'external-component',
      ).length + isolated.project.globalLayer.filter(
        (item) => item.node.type === 'external-component',
      ).length
      expect(componentCount).toBe(1)
    }

    project.scenes.forEach((scene, index) => {
      expect(snapshots.has(pptxComponentSnapshotKey(
        scene.id,
        sceneNodes[index]!.id,
      ))).toBe(true)
      expect(snapshots.has(pptxGlobalComponentSnapshotKey(
        scene.id,
        globalNode.id,
      ))).toBe(true)
    })
  })

  it('单个组件快照失败时保留前后实例，并只报告失败实例', async () => {
    const project = createProject({ includeDefaultController: false })
    project.scenes.push(
      createScene({ id: 'scene-2', name: '场景 2' }),
      createScene({ id: 'scene-3', name: '场景 3' }),
    )
    const nodes = project.scenes.map((scene, index) => {
      const node = createExternalComponentNode({
        id: `isolated-component-${index + 1}`,
        component: { packageId: 'com.example.isolated', version: '1.0.0' },
      })
      scene.nodes = [node]
      return node
    })
    const payload: ExportPayload = { project, assets: {}, components: {} }
    const onFailure = vi.fn()
    rendererCalls.failAt.add(1)

    const pending = renderPptxComponentSnapshots(payload, { onFailure })
    await vi.runAllTimersAsync()
    const snapshots = await pending

    expect(snapshots.has(pptxComponentSnapshotKey(
      project.scenes[0]!.id,
      nodes[0]!.id,
    ))).toBe(true)
    expect(snapshots.has(pptxComponentSnapshotKey(
      project.scenes[1]!.id,
      nodes[1]!.id,
    ))).toBe(false)
    expect(snapshots.has(pptxComponentSnapshotKey(
      project.scenes[2]!.id,
      nodes[2]!.id,
    ))).toBe(true)
    expect(onFailure).toHaveBeenCalledOnce()
    expect(onFailure).toHaveBeenCalledWith(expect.objectContaining({
      snapshotKey: pptxComponentSnapshotKey(
        project.scenes[1]!.id,
        nodes[1]!.id,
      ),
      sceneId: project.scenes[1]!.id,
      nodeId: nodes[1]!.id,
    }))
    expect(playerMetrics).toEqual({ active: 0, maxActive: 1, destroyed: 3 })
  })
})
