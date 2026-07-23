import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ExportPayload } from '../../src/shared/componentTypes'

const appMocks = vi.hoisted(() => ({
  gameDestroy: vi.fn(),
  componentDispose: vi.fn(),
  runtimeDestroy: vi.fn(),
  audioDestroy: vi.fn(),
  sceneLifecycleOrder: [] as string[],
  sceneSetDocumentVisible: vi.fn(),
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

vi.mock('../../src/player/PlayerControls', () => ({
  PlayerControls: class FakePlayerControls {},
}))

vi.mock('../../src/player/PlayerKeyboardNavigation', () => ({
  PlayerKeyboardNavigation: class FakeKeyboardNavigation {},
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
    const player = new PlayerApp(payload, root, {
      controls: false,
      mode: 'capture',
    })

    const zIndex = (selector: string): string | undefined =>
      root.querySelector<HTMLElement>(selector)?.style.zIndex
    expect(zIndex('.lesson-runtime-layer--global-underlay')).toBe('0')
    expect(zIndex('.lesson-runtime-layer--scene-underlay')).toBe('1')
    expect(zIndex('.lesson-canvas-host')).toBe('2')
    expect(zIndex('.lesson-runtime-layer--scene-overlay')).toBe('3')
    expect(zIndex('.lesson-runtime-layer--global-overlay')).toBe('4')

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
})
