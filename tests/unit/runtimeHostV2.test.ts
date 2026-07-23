import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('phaser', () => ({ runtimeMarker: 'phaser-test-module' }))

import { CourseEventBus } from '@/player/CourseEventBus'
import { CourseStateStore } from '@/player/CourseStateStore'
import {
  RuntimeHost,
  type RuntimeHostOptions,
  type RuntimeMountEnvironment,
} from '@/player/RuntimeHost'
import { RuntimeRegistry } from '@/player/RuntimeRegistry'
import type {
  RuntimeApiVersion,
  RuntimeDocument,
  RuntimeRenderMode,
} from '@/shared/runtimeTypes'

class FakeContainer {
  active = true
  visible = true
  name = ''
  readonly children: FakeContainer[] = []

  setName(name: string): this {
    this.name = name
    return this
  }

  setVisible(visible: boolean): this {
    this.visible = visible
    return this
  }

  add(child: FakeContainer): this {
    this.children.push(child)
    return this
  }

  removeAll(destroyChildren = false): this {
    if (destroyChildren) this.children.forEach((child) => child.destroy())
    this.children.length = 0
    return this
  }

  destroy(destroyChildren = false): void {
    if (!this.active) return
    if (destroyChildren) this.removeAll(true)
    this.active = false
  }
}

interface TestEnvironment {
  environment: RuntimeMountEnvironment
  sceneContainers: FakeContainer[]
  phaserUnderlay: FakeContainer
  phaserOverlay: FakeContainer
  domUnderlay: HTMLDivElement
  domOverlay: HTMLDivElement
}

function createEnvironment(): TestEnvironment {
  const sceneContainers: FakeContainer[] = []
  const scene = {
    children: { list: sceneContainers },
    add: {
      container: vi.fn(() => {
        const container = new FakeContainer()
        sceneContainers.push(container)
        return container
      }),
    },
  }
  const phaserUnderlay = new FakeContainer()
  const phaserOverlay = new FakeContainer()
  const domUnderlay = document.createElement('div')
  const domOverlay = document.createElement('div')
  document.body.append(domUnderlay, domOverlay)

  return {
    environment: {
      phaser: {
        scene,
        underlay: phaserUnderlay,
        overlay: phaserOverlay,
      },
      dom: { underlay: domUnderlay, overlay: domOverlay },
      resolveNode: () => null,
      presentation: {
        current: () => null,
        states: () => [],
        setState: () => false,
        transitionTo: () => false,
      },
    } as unknown as RuntimeMountEnvironment,
    sceneContainers,
    phaserUnderlay,
    phaserOverlay,
    domUnderlay,
    domOverlay,
  }
}

function runtime(
  runtimeApiVersion: RuntimeApiVersion,
  renderMode: RuntimeRenderMode,
  source?: string,
): RuntimeDocument {
  return {
    runtimeApiVersion,
    enabled: true,
    renderMode,
    source: source ?? `
      CoursewareRuntime.define({
        runtimeApiVersion: ${runtimeApiVersion},
        create(ctx) {
          window.__runtimeHostContext = ctx
          return { destroy() {} }
        }
      })
    `,
    content: { values: {} },
    assets: {},
  } as RuntimeDocument
}

function createHost(
  documentRuntime: RuntimeDocument,
  testEnvironment = createEnvironment(),
): { host: RuntimeHost; testEnvironment: TestEnvironment; registry: RuntimeRegistry } {
  const registry = new RuntimeRegistry()
  const events = new CourseEventBus()
  const courseState = new CourseStateStore()
  const options: RuntimeHostOptions = {
    registry,
    runtime: documentRuntime,
    label: '测试运行时',
    scope: 'scene',
    mode: 'preview',
    sceneId: 'scene-one',
    width: 1280,
    height: 720,
    environment: testEnvironment.environment,
    actions: Object.freeze({
      goToScene: () => false,
      nextScene: () => false,
      previousScene: () => false,
      replayScene: () => false,
      restartCourse: () => false,
    }),
    events,
    courseState,
    assetUrl: (assetId) => `asset://${assetId}`,
    registerNavigationGuard: () => () => undefined,
  }
  return { host: new RuntimeHost(options), testEnvironment, registry }
}

function capturedContext(): Record<string, unknown> {
  return Reflect.get(window, '__runtimeHostContext') as Record<string, unknown>
}

afterEach(() => {
  delete window.CoursewareRuntime
  Reflect.deleteProperty(window, '__runtimeHostContext')
  Reflect.deleteProperty(window, '__runtimeLifecycleCalls')
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('RuntimeHost API 2', () => {
  it('API 1 不受 renderMode 裁剪，继续同时暴露 Phaser、DOM 和节点能力', () => {
    const { host, testEnvironment, registry } = createHost(runtime(1, 'dom'))
    const context = capturedContext()

    expect(context.runtimeApiVersion).toBe(1)
    expect(context).not.toHaveProperty('renderMode')
    expect(context).toHaveProperty('Phaser')
    expect(context).toHaveProperty('phaser')
    expect(context).toHaveProperty('domRoot')
    expect(context).toHaveProperty('dom')
    expect(context).toHaveProperty('nodes')
    expect(testEnvironment.phaserUnderlay.children).toHaveLength(1)
    expect(testEnvironment.phaserOverlay.children).toHaveLength(1)
    expect(testEnvironment.domUnderlay.children).toHaveLength(1)
    expect(testEnvironment.domOverlay.children).toHaveLength(1)

    host.destroy()
    registry.dispose()
  })

  it.each([
    ['phaser', true, false, true],
    ['dom', false, true, false],
    ['hybrid', true, true, true],
  ] as const)(
    'API 2 renderMode=%s 只创建并暴露已声明的渲染面',
    (renderMode, exposesPhaser, exposesDom, exposesNodes) => {
      const { host, testEnvironment, registry } = createHost(
        runtime(2, renderMode),
      )
      const context = capturedContext()

      expect(context.runtimeApiVersion).toBe(2)
      expect(context.renderMode).toBe(renderMode)
      expect('Phaser' in context).toBe(exposesPhaser)
      expect('phaser' in context).toBe(exposesPhaser)
      expect('domRoot' in context).toBe(exposesDom)
      expect('dom' in context).toBe(exposesDom)
      expect('nodes' in context).toBe(exposesNodes)
      expect(testEnvironment.phaserUnderlay.children).toHaveLength(
        exposesPhaser ? 1 : 0,
      )
      expect(testEnvironment.phaserOverlay.children).toHaveLength(
        exposesPhaser ? 1 : 0,
      )
      expect(testEnvironment.domUnderlay.children).toHaveLength(
        exposesDom ? 1 : 0,
      )
      expect(testEnvironment.domOverlay.children).toHaveLength(
        exposesDom ? 1 : 0,
      )

      host.destroy()
      registry.dispose()
    },
  )

  it('代理完整生命周期，prepareCapture 后会继续等待新登记的承诺', async () => {
    const source = `
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create(ctx) {
           const calls = window.__runtimeLifecycleCalls = []
          ctx.capture.waitUntil(new Promise(function (resolve) {
            window.__resolveRuntimeInitialCapture = function () {
              calls.push('create-wait')
              resolve()
            }
          }))
          return {
            resize(width, height) { calls.push(['resize', width, height]) },
            setVisible(visible) { calls.push(['visible', visible]) },
            suspend() { calls.push('suspend') },
            resume() { calls.push('resume') },
            async prepareCapture() {
              calls.push('prepare')
              await Promise.resolve()
              ctx.capture.waitUntil(Promise.resolve().then(function () {
                calls.push('capture-wait-1')
                ctx.capture.waitUntil(Promise.resolve().then(function () {
                  calls.push('capture-wait-2')
                }))
              }))
            },
            destroy() { calls.push('destroy') }
          }
        }
      })
    `
    const { host, testEnvironment, registry } = createHost(
      runtime(2, 'hybrid', source),
    )

    host.resize(960, 540)
    host.setVisible(false)
    host.suspend()
    host.resume()
    const snapshotSurfaces = vi.fn()
    const pendingCapture = host.waitForCaptureReady(snapshotSurfaces)
    await Promise.resolve()
    const callsBeforeResources = Reflect.get(
      window,
      '__runtimeLifecycleCalls',
    ) as unknown[]
    expect(callsBeforeResources).not.toContain('prepare')
    const resolveInitialCapture = Reflect.get(
      window,
      '__resolveRuntimeInitialCapture',
    ) as (() => void) | undefined
    resolveInitialCapture?.()
    await pendingCapture

    const calls = Reflect.get(window, '__runtimeLifecycleCalls') as unknown[]
    expect(calls).toContainEqual(['resize', 960, 540])
    expect(calls).toContainEqual(['visible', false])
    expect(calls).toContain('suspend')
    expect(calls).toContain('resume')
    expect(calls).toContain('prepare')
    expect(calls).toContain('create-wait')
    expect(calls).toContain('capture-wait-1')
    expect(calls).toContain('capture-wait-2')
    expect(snapshotSurfaces).toHaveBeenCalledOnce()
    const capturedRoots = snapshotSurfaces.mock.calls[0]?.[0] as HTMLElement[]
    expect(capturedRoots).toHaveLength(2)
    expect(capturedRoots.map((root) => root.className)).toEqual([
      'courseware-runtime-root',
      'courseware-runtime-root',
    ])
    expect(testEnvironment.phaserUnderlay.children[0]?.visible).toBe(false)
    expect(
      (testEnvironment.domUnderlay.firstElementChild as HTMLElement).style.visibility,
    ).toBe('hidden')

    host.destroy()
    expect(calls).toContain('destroy')
    registry.dispose()
  })

  it('捕获资源失败会持续阻断后续快照，而不是下一次静默成功', async () => {
    const source = `
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create(ctx) {
          ctx.capture.waitUntil(Promise.reject(new Error('GLB 解码失败')))
          return { destroy() {} }
        }
      })
    `
    const { host, registry } = createHost(runtime(2, 'dom', source))

    await expect(host.waitForCaptureReady()).rejects.toThrow('GLB 解码失败')
    await expect(host.waitForCaptureReady()).rejects.toThrow(
      '此前执行失败，不能生成可靠快照',
    )

    host.destroy()
    registry.dispose()
  })

  it('源码声明与文档 API 不匹配时不执行 create，并让捕获进入后备链路', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const source = `
      CoursewareRuntime.define({
        runtimeApiVersion: 1,
        create(ctx) {
          window.__runtimeHostContext = ctx
          return { destroy() {} }
        }
      })
    `
    const { host, testEnvironment, registry } = createHost(
      runtime(2, 'phaser', source),
    )

    expect(Reflect.has(window, '__runtimeHostContext')).toBe(false)
    const errorHost = testEnvironment.domOverlay.firstElementChild as HTMLElement
    expect(errorHost.shadowRoot?.textContent).toContain(
      '文档为 2，源码为 1',
    )
    expect(error).toHaveBeenCalled()
    await expect(host.waitForCaptureReady()).rejects.toThrow(
      '此前执行失败，不能生成可靠快照',
    )

    host.destroy()
    registry.dispose()
  })
})
