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
  authoring?: RuntimeHostOptions['authoring'],
  onAssessmentEvaluated?: RuntimeHostOptions['onAssessmentEvaluated'],
  onActionRecorded?: RuntimeHostOptions['onActionRecorded'],
): { host: RuntimeHost; testEnvironment: TestEnvironment; registry: RuntimeRegistry; events: CourseEventBus } {
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
    ...(authoring ? { authoring } : {}),
    ...(onAssessmentEvaluated ? { onAssessmentEvaluated } : {}),
    ...(onActionRecorded ? { onActionRecorded } : {}),
  }
  return { host: new RuntimeHost(options), testEnvironment, registry, events }
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
  it('仅在定义与隔离宿主同时启用 authoring V1 时提供目标登记桥梁', async () => {
    const source = `
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        authoringApiVersion: 1,
        create(ctx) {
          window.__runtimeHostContext = ctx
          window.__disposeRuntimeTarget = ctx.authoring.register({
            kind: 'text',
            key: 'title',
            getBounds() { return { x: 80, y: 60, width: 400, height: 72 } }
          })
          return { destroy() {} }
        }
      })
    `
    const documentRuntime = runtime(2, 'dom', source)
    documentRuntime.content = {
      values: { title: '画布标题' },
      metadata: { title: { label: '主标题', maxLength: 80 } },
    }
    const onTargetsChanged = vi.fn()
    const { host, registry } = createHost(
      documentRuntime,
      createEnvironment(),
      { onTargetsChanged },
    )
    await Promise.resolve()

    expect(capturedContext()).toHaveProperty('authoring')
    expect(onTargetsChanged).toHaveBeenCalledWith(expect.objectContaining({
      revision: 1,
      targets: [expect.objectContaining({
        scope: 'scene',
        sceneId: 'scene-one',
        kind: 'text',
        key: 'title',
        label: '主标题',
        bounds: { x: 80, y: 60, width: 400, height: 72 },
      })],
    }))

    const disposeTarget = Reflect.get(
      window,
      '__disposeRuntimeTarget',
    ) as (() => void) | undefined
    disposeTarget?.()
    await Promise.resolve()
    expect(onTargetsChanged.mock.calls.at(-1)?.[0].targets).toEqual([])

    host.destroy()
    registry.dispose()
  })

  it('不向未声明扩展的 Runtime 暴露 authoring，即使宿主有接收器', async () => {
    const onTargetsChanged = vi.fn()
    const { host, registry } = createHost(
      runtime(2, 'dom'),
      createEnvironment(),
      { onTargetsChanged },
    )
    await Promise.resolve()

    expect(capturedContext()).not.toHaveProperty('authoring')
    expect(onTargetsChanged).not.toHaveBeenCalled()

    host.destroy()
    registry.dispose()
  })

  it('宿主未启用画布编辑时，声明扩展的 Runtime 仍按普通预览运行', () => {
    const source = `
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        authoringApiVersion: 1,
        create(ctx) {
          window.__runtimeHostContext = ctx
          return { destroy() {} }
        }
      })
    `
    const { host, registry } = createHost(runtime(2, 'dom', source))

    expect(capturedContext()).not.toHaveProperty('authoring')

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
      expect(context).toHaveProperty('assessment')
      expect(context).toHaveProperty('evidence')
      expect(context).not.toHaveProperty('teacherEscape')
      expect(context).not.toHaveProperty('hostEvidenceRecorder')
      expect(Object.keys(context.evidence as object)).toEqual(['recordAction'])
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

  it('事件消息路由：运行时 emit 携带作用域元数据，scoped 事件随宿主释放', () => {
    const source = `
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create(ctx) {
          window.__runtimeHostContext = ctx
          return { destroy() {} }
        }
      })
    `
    const { host, registry, events } = createHost(runtime(2, 'dom', source))
    const context = capturedContext() as {
      emit(eventName: string, payload?: unknown): void
      events: {
        on(eventName: string, listener: (payload: unknown) => void): () => void
      }
    }
    const routed: unknown[] = []
    const disposer = events.on('runtime:event', (detail) => { routed.push(detail) })
    context.emit('custom-event', { value: 7 })

    expect(routed).toEqual([{
      scope: 'scene',
      sceneId: 'scene-one',
      eventName: 'custom-event',
      payload: { value: 7 },
    }])

    const received: unknown[] = []
    context.events.on('runtime:ping', (payload) => received.push(payload))
    events.emit('runtime:ping', 'pong')
    expect(received).toEqual(['pong'])

    host.destroy()
    disposer()
    expect(events.listenerCount()).toBe(0)
    registry.dispose()
  })

  it('资源访问与文字读取只暴露已声明的绑定，缺失键报错', () => {
    const source = `
      CoursewareRuntime.define({
        runtimeApiVersion: 2,
        create(ctx) {
          window.__runtimeHostContext = ctx
          return { destroy() {} }
        }
      })
    `
    const documentRuntime = runtime(2, 'dom', source)
    documentRuntime.content = { values: { title: '标题', 'a/b': '斜杠' } }
    documentRuntime.assets = { hero: { assetId: 'asset-hero' } }
    const { host, registry } = createHost(documentRuntime)
    const context = capturedContext() as {
      content: {
        get(key: string): string
        all(): Record<string, string>
      }
      assets: {
        url(bindingKey: string): string
        projectUrl(assetId: string): string
      }
    }

    expect(context.content.get('title')).toBe('标题')
    expect(context.content.get('a/b')).toBe('斜杠')
    expect(context.content.all()).toEqual({ title: '标题', 'a/b': '斜杠' })
    expect(Object.isFrozen(context.content.all())).toBe(true)
    expect(() => context.content.get('missing')).toThrow('不存在')
    expect(context.assets.url('hero')).toBe('asset://asset-hero')
    expect(context.assets.projectUrl('asset-other')).toBe('asset://asset-other')
    expect(() => context.assets.url('missing')).toThrow('不存在')

    host.destroy()
    registry.dispose()
  })

  it('公开调用 Capability Index 登记的离线判定器并拒绝伪造 ID', () => {
    const onAssessmentEvaluated = vi.fn()
    const { host, registry } = createHost(
      runtime(2, 'dom'),
      createEnvironment(),
      undefined,
      onAssessmentEvaluated,
    )
    const assessment = capturedContext().assessment as {
      evaluate(request: {
        responseId?: string
        evaluatorId: string
        input: string
        acceptedValues: string[]
      }): { status: string; normalizedInput: string }
    }

    expect(assessment.evaluate({
      responseId: 'RESP-001',
      evaluatorId: 'EVAL-normalized-short-v1',
      input: '  Ａ   B  ',
      acceptedValues: ['a b'],
    })).toMatchObject({ status: 'pass', normalizedInput: 'a b' })
    expect(onAssessmentEvaluated).toHaveBeenCalledOnce()
    expect(onAssessmentEvaluated).toHaveBeenCalledWith({
      scope: 'scene',
      sceneId: 'scene-one',
      request: {
        responseId: 'RESP-001',
        evaluatorId: 'EVAL-normalized-short-v1',
        input: '  Ａ   B  ',
        acceptedValues: ['a b'],
      },
      result: {
        evaluatorId: 'EVAL-normalized-short-v1',
        normalizedInput: 'a b',
        status: 'pass',
      },
    })
    const receipt = onAssessmentEvaluated.mock.calls[0]?.[0]
    expect(Object.isFrozen(receipt.request)).toBe(true)
    expect(Object.isFrozen(receipt.request.acceptedValues)).toBe(true)
    expect(Object.isFrozen(receipt.result)).toBe(true)
    expect(() => assessment.evaluate({
      evaluatorId: 'EVAL-invented-v1',
      input: 'A',
      acceptedValues: ['A'],
    })).toThrow('未发布的判定器')
    expect(() => assessment.evaluate({
      responseId: 'RESP-1',
      evaluatorId: 'EVAL-finite-choice-v1',
      input: 'A',
      acceptedValues: ['A'],
    })).toThrow('responseId')
    expect(onAssessmentEvaluated).toHaveBeenCalledOnce()

    host.destroy()
    registry.dispose()
  })

  it('只为浏览器正在分发的可信事件记录批准动作', () => {
    const onActionRecorded = vi.fn()
    const { host, registry } = createHost(
      runtime(2, 'dom'),
      createEnvironment(),
      undefined,
      undefined,
      onActionRecorded,
    )
    const evidence = capturedContext().evidence as {
      recordAction(request: Record<string, unknown>): void
    }

    expect(() => evidence.recordAction({
      actId: 'ACT-001',
      responseId: 'RESP-001',
      actionKind: 'click',
      event: new Event('click'),
    })).toThrow('isTrusted')
    expect(() => evidence.recordAction({
      actId: 'ACT-001',
      actionKind: 'click',
      event: { isTrusted: true, type: 'click' },
    })).toThrow('Event')

    const button = document.createElement('button')
    document.body.append(button)
    button.addEventListener('click', (event) => {
      const implementation = Object.getOwnPropertySymbols(event)
        .map((symbol) => Reflect.get(event, symbol))
        .find((value) => value && typeof value === 'object' &&
          'isTrusted' in (value as object)) as { isTrusted: boolean } | undefined
      // jsdom never emits trusted input. Mutate its private implementation only
      // to exercise the same native isTrusted getter/brand path as Chromium.
      if (!implementation) throw new Error('jsdom Event implementation missing')
      implementation.isTrusted = true
      evidence.recordAction({
        actId: 'ACT-001',
        responseId: 'RESP-001',
        actionKind: 'click',
        event,
      })
    })
    button.click()

    expect(onActionRecorded).toHaveBeenCalledOnce()
    expect(onActionRecorded).toHaveBeenCalledWith({
      scope: 'scene',
      sceneId: 'scene-one',
      actId: 'ACT-001',
      responseId: 'RESP-001',
      actionKind: 'click',
      eventType: 'click',
    })
    expect(Object.isFrozen(onActionRecorded.mock.calls[0]?.[0])).toBe(true)

    host.destroy()
    registry.dispose()
  })

  it('动作证据拒绝非法 ID、类型与事后重用的事件', () => {
    const onActionRecorded = vi.fn()
    const { host, registry } = createHost(
      runtime(2, 'dom'),
      createEnvironment(),
      undefined,
      undefined,
      onActionRecorded,
    )
    const evidence = capturedContext().evidence as {
      recordAction(request: Record<string, unknown>): void
    }
    const button = document.createElement('button')
    let capturedEvent: Event | undefined
    document.body.append(button)
    button.addEventListener('click', (event) => {
      const implementation = Object.getOwnPropertySymbols(event)
        .map((symbol) => Reflect.get(event, symbol))
        .find((value) => value && typeof value === 'object' &&
          'isTrusted' in (value as object)) as { isTrusted: boolean } | undefined
      if (!implementation) throw new Error('jsdom Event implementation missing')
      implementation.isTrusted = true
      capturedEvent = event
      expect(() => evidence.recordAction({
        actId: 'ACT-1', actionKind: 'click', event,
      })).toThrow('actId')
      expect(() => evidence.recordAction({
        actId: 'ACT-001', responseId: 'RESP-1', actionKind: 'click', event,
      })).toThrow('responseId')
      expect(() => evidence.recordAction({
        actId: 'ACT-001', actionKind: 'invented', event,
      })).toThrow('未批准')
    })
    button.click()
    expect(capturedEvent).toBeDefined()
    expect(() => evidence.recordAction({
      actId: 'ACT-001', actionKind: 'click', event: capturedEvent,
    })).toThrow('正在分发')
    expect(onActionRecorded).not.toHaveBeenCalled()

    host.destroy()
    registry.dispose()
  })

  it('评估请求只读取一次 getter 并使评估与回执共用快照', () => {
    const onAssessmentEvaluated = vi.fn()
    const { host, registry } = createHost(
      runtime(2, 'dom'),
      createEnvironment(),
      undefined,
      onAssessmentEvaluated,
    )
    const assessment = capturedContext().assessment as {
      evaluate(request: object): unknown
    }
    const reads = { responseId: 0, evaluatorId: 0, input: 0, acceptedValues: 0 }
    const request = Object.fromEntries(Object.keys(reads).map((key) => [
      key,
      {
        get: () => {
          reads[key as keyof typeof reads] += 1
          return ({
            responseId: 'RESP-001',
            evaluatorId: 'EVAL-finite-choice-v1',
            input: 'A',
            acceptedValues: ['A'],
          } as const)[key as keyof typeof reads]
        },
        enumerable: true,
      },
    ]))
    const getterRequest = Object.defineProperties({}, request)

    expect(assessment.evaluate(getterRequest)).toMatchObject({ status: 'pass' })
    expect(reads).toEqual({
      responseId: 1,
      evaluatorId: 1,
      input: 1,
      acceptedValues: 1,
    })
    expect(onAssessmentEvaluated.mock.calls[0]?.[0].request).toEqual({
      responseId: 'RESP-001',
      evaluatorId: 'EVAL-finite-choice-v1',
      input: 'A',
      acceptedValues: ['A'],
    })

    host.destroy()
    registry.dispose()
  })

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
      '只支持 runtimeApiVersion 2',
    )
    expect(error).toHaveBeenCalled()
    await expect(host.waitForCaptureReady()).rejects.toThrow(
      '此前执行失败，不能生成可靠快照',
    )

    host.destroy()
    registry.dispose()
  })
})
