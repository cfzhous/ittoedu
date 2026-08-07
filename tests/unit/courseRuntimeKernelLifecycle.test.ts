import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExportPayload } from '@/shared/componentTypes'
import type { RuntimeHostOptions, RuntimeMountEnvironment } from '@/player/RuntimeHost'
import { createProjectV8Fields } from '../helpers/projectV8'

interface MockRuntimeHost {
  options: RuntimeHostOptions
  resize: ReturnType<typeof vi.fn>
  setVisible: ReturnType<typeof vi.fn>
  suspend: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  waitForCaptureReady: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}

const hostState = vi.hoisted(() => ({
  instances: [] as MockRuntimeHost[],
}))

vi.mock('@/player/RuntimeHost', () => ({
  RuntimeHost: class implements MockRuntimeHost {
    readonly resize = vi.fn()
    readonly setVisible = vi.fn()
    readonly suspend = vi.fn()
    readonly resume = vi.fn()
    readonly waitForCaptureReady = vi.fn().mockResolvedValue(undefined)
    readonly destroy = vi.fn()

    constructor(readonly options: RuntimeHostOptions) {
      hostState.instances.push(this)
    }
  },
}))

import { CourseRuntimeKernel } from '@/player/CourseRuntimeKernel'

function payload(): ExportPayload {
  const globalRuntime = {
    runtimeApiVersion: 2 as const,
    enabled: true,
    renderMode: 'dom' as const,
    source: 'CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})',
    content: { values: {} },
    assets: {},
  }
  return {
    project: {
      schemaVersion: 8,
      id: 'project-runtime-lifecycle',
      title: '运行时生命周期测试',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      canvas: { width: 1280, height: 720 },
      scenes: [
        {
          id: 'scene-one',
          name: '第一页',
          backgroundColor: '#ffffff',
          nodes: [],
          interactions: [],
          runtime: { ...globalRuntime, renderMode: 'phaser' },
        },
      ],
      assets: {},
      componentPackages: {},
      globalLayer: [],
      globalRuntime,
      ...createProjectV8Fields(),
    },
    assets: {},
    components: {},
  }
}

const actions = Object.freeze({
  goToScene: () => false,
  nextScene: () => false,
  previousScene: () => false,
  replayScene: () => false,
  restartCourse: () => false,
})

beforeEach(() => {
  hostState.instances.length = 0
})

describe('CourseRuntimeKernel lifecycle proxy', () => {
  it('保留未挂载前的尺寸、可见性和暂停状态，并同步代理到全局与场景运行时', async () => {
    const data = payload()
    const kernel = new CourseRuntimeKernel(data, actions)
    const environment = {} as RuntimeMountEnvironment

    kernel.resize(960, 540)
    kernel.setVisible(false)
    kernel.suspend()
    kernel.mountGlobal(environment)
    kernel.enterScene(data.project.scenes[0]!, environment)

    expect(hostState.instances).toHaveLength(2)
    for (const host of hostState.instances) {
      expect(host.options.width).toBe(960)
      expect(host.options.height).toBe(540)
      expect(host.setVisible).toHaveBeenCalledOnce()
      expect(host.setVisible).toHaveBeenCalledWith(false)
      expect(host.suspend).toHaveBeenCalledOnce()
    }

    kernel.resize(800, 450)
    kernel.setVisible(true)
    kernel.resume()
    await kernel.waitForCaptureReady()

    for (const host of hostState.instances) {
      expect(host.resize).toHaveBeenCalledWith(800, 450)
      expect(host.setVisible).toHaveBeenLastCalledWith(true)
      expect(host.resume).toHaveBeenCalledOnce()
      expect(host.waitForCaptureReady).toHaveBeenCalledOnce()
    }

    kernel.destroy()
    for (const host of hostState.instances) {
      expect(host.destroy).toHaveBeenCalledOnce()
    }
  })
})
