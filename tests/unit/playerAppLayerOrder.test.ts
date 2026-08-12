import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportPayload } from '../../src/shared/componentTypes'

const appMocks = vi.hoisted(() => ({
  gameDestroy: vi.fn(),
  componentDispose: vi.fn(),
  runtimeDestroy: vi.fn(),
  audioDestroy: vi.fn(),
  sceneLifecycleOrder: [] as string[],
  sceneSetDocumentVisible: vi.fn(),
  playerSceneConstructorArgs: [] as unknown[][],
  runtimeKernelOptions: [] as Array<Record<string, unknown> | undefined>,
}))

vi.mock('phaser', () => ({
  AUTO: 'auto',
  Scale: { FIT: 'fit', CENTER_BOTH: 'center-both' },
  Game: class FakeGame {
    readonly canvas = document.createElement('canvas')

    constructor(config: { parent: HTMLElement }) {
      config.parent.append(this.canvas)
    }

    destroy(): void {
      appMocks.gameDestroy()
      this.canvas.remove()
    }
  },
}))

vi.mock('../../src/player/ComponentRegistry', () => ({
  ComponentRegistry: class FakeComponentRegistry {
    install(): void {}
    executeRuntime(): void {}
    dispose(): void { appMocks.componentDispose() }
  },
}))

vi.mock('../../src/player/componentHostActions', () => ({
  createPlayerComponentHostActions: () => ({}),
}))

vi.mock('../../src/player/CourseRuntimeKernel', () => ({
  CourseRuntimeKernel: class FakeRuntimeKernel {
    readonly events = {
      on: () => () => {},
    }
    constructor(
      _payload: unknown,
      _actions: unknown,
      options?: Record<string, unknown>,
    ) {
      appMocks.runtimeKernelOptions.push(options)
    }
    destroy(): void { appMocks.runtimeDestroy() }
  },
}))

vi.mock('../../src/player/AudioManager', () => ({
  AudioManager: class FakeAudioManager {
    toggleMuted(): void {}
    destroy(): void { appMocks.audioDestroy() }
  },
}))

vi.mock('../../src/player/PlayerScene', () => ({
  PlayerScene: class FakePlayerScene {
    constructor(...args: unknown[]) {
      appMocks.playerSceneConstructorArgs.push(args)
    }
    setDocumentVisible(visible: boolean): void {
      appMocks.sceneSetDocumentVisible(visible)
      appMocks.sceneLifecycleOrder.push(`visible:${visible}`)
    }
    suspendRuntimes(): void {
      appMocks.sceneLifecycleOrder.push('suspend')
    }
    resumeRuntimes(): void {
      appMocks.sceneLifecycleOrder.push('resume')
    }
    async waitForCaptureReady(): Promise<void> {
      appMocks.sceneLifecycleOrder.push('prepare')
    }
  },
}))

vi.mock('../../src/player/PlayerPresenterInput', () => ({
  PlayerPresenterInput: class FakePresenterInput {
    destroy(): void {}
  },
}))

vi.mock('../../src/player/ScenePickerOverlay', () => ({
  SCENE_PICKER_OPEN_EVENT: 'scene-picker:open',
  TEACHER_CONTROLLER_COLLAPSE_EVENT: 'teacher-controller:collapse',
  ScenePickerOverlay: class FakeScenePickerOverlay {
    close(): void {}
    destroy(): void {}
  },
}))

import { PlayerApp } from '../../src/player/PlayerApp'
import { createProject } from '../../src/renderer/project/createProject'

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  appMocks.sceneLifecycleOrder.length = 0
  appMocks.playerSceneConstructorArgs.length = 0
  appMocks.runtimeKernelOptions.length = 0
  document.body.replaceChildren()
})

describe('PlayerApp fixed renderer planes', () => {
  it('使全局/场景 underlay 位于 Phaser 下方，overlay 位于上方', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const payload: ExportPayload = {
      project: createProject({ includeDefaultController: false }),
      assets: {},
      components: {},
    }
    const ignoredComponentTargets = vi.fn()
    const player = new PlayerApp(payload, root, {
      controls: false,
      mode: 'capture',
      onComponentAuthoringTargetsChanged: ignoredComponentTargets,
    })

    const zIndex = (selector: string): string | undefined =>
      root.querySelector<HTMLElement>(selector)?.style.zIndex
    expect(zIndex('.lesson-runtime-layer--global-underlay')).toBe('0')
    expect(zIndex('.lesson-runtime-layer--scene-underlay')).toBe('1')
    expect(zIndex('.lesson-canvas-host')).toBe('2')
    expect(zIndex('.lesson-runtime-layer--scene-overlay')).toBe('3')
    expect(zIndex('.lesson-runtime-layer--global-overlay')).toBe('4')
    expect(appMocks.playerSceneConstructorArgs.at(-1)?.[13]).toBeUndefined()

    player.destroy()
    expect(root).toBeEmptyDOMElement()
    expect(appMocks.gameDestroy).toHaveBeenCalledOnce()
  })

  it('构造时文档已隐藏也会把初始状态传给 PlayerScene', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    const root = document.createElement('div')
    document.body.append(root)
    const payload: ExportPayload = {
      project: createProject({ includeDefaultController: false }),
      assets: {},
      components: {},
    }

    const player = new PlayerApp(payload, root, { controls: false })

    expect(appMocks.sceneLifecycleOrder).toEqual(['visible:false', 'suspend'])
    player.destroy()
  })

  it('捕获模式在 prepareCapture 前先暂停运行时与组件', async () => {
    const root = document.createElement('div')
    document.body.append(root)
    const payload: ExportPayload = {
      project: createProject({ includeDefaultController: false }),
      assets: {},
      components: {},
    }
    const player = new PlayerApp(payload, root, {
      controls: false,
      mode: 'capture',
    })
    appMocks.sceneLifecycleOrder.length = 0

    await player.waitForCaptureReady()

    expect(appMocks.sceneLifecycleOrder).toEqual(['suspend', 'prepare'])
    player.destroy()
  })

  it('编辑宿主保留显式 null 基础态并屏蔽 Player 输入', () => {
    const root = document.createElement('div')
    document.body.append(root)
    const project = createProject({ includeDefaultController: false })
    const payload: ExportPayload = { project, assets: {}, components: {} }
    const onComponentAuthoringTargetsChanged = vi.fn()

    const player = new PlayerApp(payload, root, {
      controls: false,
      hostMode: 'authoring',
      initialSceneId: project.scenes[0]!.id,
      initialStateId: null,
      onComponentAuthoringTargetsChanged,
    })

    const args = appMocks.playerSceneConstructorArgs.at(-1)!
    expect(args[11]).toEqual({ sceneIndex: 0, stateId: null })
    expect(args[12]).toBe(true)
    expect(args[13]).toBe(onComponentAuthoringTargetsChanged)
    expect(appMocks.runtimeKernelOptions.at(-1)).toMatchObject({
      mode: 'capture',
      freezeCourseState: true,
    })
    expect(root.querySelector('.lesson-authoring-input-shield')).not.toBeNull()
    expect(root.querySelector('.lesson-canvas-host')).toHaveStyle({
      pointerEvents: 'none',
    })
    expect(root.querySelector('.lesson-footer')).toBeNull()
    player.destroy()
  })

  it('Project V8 不创建外层底栏，并按工程控制画布内控制器', () => {
    const noneRoot = document.createElement('div')
    const noneProject = createProject({ includeDefaultController: false })
    const nonePlayer = new PlayerApp({
      project: noneProject,
      assets: {},
      components: {},
    }, noneRoot)

    expect(noneRoot.querySelector('.lesson-footer')).toBeNull()
    expect(appMocks.playerSceneConstructorArgs.at(-1)?.[8]).toBe(false)
    nonePlayer.destroy()

    const canvasRoot = document.createElement('div')
    const canvasProject = createProject({ includeDefaultController: true })
    const canvasPlayer = new PlayerApp({
      project: canvasProject,
      assets: {},
      components: {},
    }, canvasRoot)

    expect(canvasRoot.querySelector('.lesson-footer')).toBeNull()
    expect(appMocks.playerSceneConstructorArgs.at(-1)?.[8]).toBe(true)
    canvasPlayer.destroy()
  })
})
