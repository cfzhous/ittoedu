import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import { DeclarativeCourseState } from '@/player/DeclarativeCourseState'
import {
  CourseEditorDynamicHostRegistry,
  type CourseEditorDynamicEnvironment,
} from '@/renderer/course/courseEditorDynamicHosts'
import type { RuntimeLayerItem } from '@/shared/courseProjectTypes'
import type {
  SlideItemMountContext,
  SlideItemHost,
} from '@/player/surfaces/slide/SlideSurfaceHost'

/**
 * Surface Runtime V1 (API 3) full chain at the unified editor host level:
 * version negotiation, load, message routing, asset access, error isolation,
 * authoring targets + stable hit fields, hot update, capture/checkpoint and
 * destroy. Authoring operations must never write course state or navigate, so
 * one runtime operation can never create editor history or dirty.
 */

const OLD_SOURCE = `
CoursewareSurfaceRuntime.define({
  runtimeApiVersion: 3,
  create(ctx) {
    const root = ctx.dom.root;
    root.dataset.createCount = String(Number(root.dataset.createCount || 0) + 1);
    const text = root.ownerDocument.createElement('p');
    text.dataset.coursewareContentKey = 'title/a~b';
    text.textContent = ctx.content.get('title/a~b');
    root.appendChild(text);
    const image = root.ownerDocument.createElement('img');
    image.dataset.coursewareAssetKey = 'hero/x~y';
    image.src = ctx.assets.url('hero/x~y');
    root.appendChild(image);
    ctx.authoring.registerAsset({
      key: 'hero/x~y', label: '主图',
      bounds: { x: 8, y: 9, width: 40, height: 30 },
    });
    return {
      setMode(mode) { root.dataset.mode = mode; },
      updateContent(values) {
        root.dataset.hotUpdateCount = String(Number(root.dataset.hotUpdateCount || 0) + 1);
        const label = root.querySelector('[data-courseware-content-key="title/a~b"]');
        if (label) label.textContent = values['title/a~b'];
      },
      updateAssets(bindings) {
        root.dataset.hotAssetCount = String(Number(root.dataset.hotAssetCount || 0) + 1);
        root.dataset.hotAssetId = bindings['hero/x~y']?.assetId ?? '';
      },
      suspend() { root.dataset.suspended = String(Number(root.dataset.suspended || 0) + 1); },
      resume() { root.dataset.resumed = String(Number(root.dataset.resumed || 0) + 1); },
      prepareCapture() { root.dataset.preparedCapture = 'true'; },
      exportAuthoringCheckpoint() { return { score: 3, answers: ['A', 'B'] }; },
      restoreAuthoringCheckpoint(checkpoint) {
        root.dataset.restoredCheckpoint = JSON.stringify(checkpoint);
      },
      destroy() { root.dataset.destroyed = String(Number(root.dataset.destroyed || 0) + 1); }
    };
  }
});`

const NEW_SOURCE = `
CoursewareSurfaceRuntime.define({
  runtimeApiVersion: 3,
  create(ctx) {
    const root = ctx.dom.root;
    root.dataset.createCount = String(Number(root.dataset.createCount || 0) + 1);
    const text = root.ownerDocument.createElement('p');
    text.dataset.coursewareContentKey = 'title/a~b';
    text.textContent = ctx.content.get('title/a~b');
    root.appendChild(text);
    return {
      restoreAuthoringCheckpoint(checkpoint) {
        root.dataset.restoredCheckpoint = JSON.stringify(checkpoint);
      },
      destroy() { root.dataset.destroyed = String(Number(root.dataset.destroyed || 0) + 1); }
    };
  }
});`

const FAILING_SOURCE = `
CoursewareSurfaceRuntime.define({
  runtimeApiVersion: 3,
  create(ctx) { throw new Error('运行时资源解码失败'); }
});`

function runtimeItem(
  overrides: Partial<RuntimeLayerItem['runtime']> = {},
): RuntimeLayerItem {
  return {
    layerItemId: 'runtime-surface-v1',
    label: 'Runtime V1',
    frame: { mode: 'absolute', x: 0, y: 0, width: 640, height: 360 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    kind: 'runtime',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: OLD_SOURCE,
      content: { values: { 'title/a~b': '可命中文字' } },
      assets: { 'hero/x~y': { assetId: 'asset-hero' } },
      ...overrides,
    },
  }
}

interface TestHarness {
  registry: CourseEditorDynamicHostRegistry
  events: CourseEventBus
  courseState: DeclarativeCourseState
  navigation: CourseEditorDynamicEnvironment['navigation']
  reportDiagnostic: ReturnType<typeof vi.fn>
  stateWrites: string[]
  projectAssetCalls: string[]
}

function createHarness(): TestHarness {
  const events = new CourseEventBus()
  const courseState = new DeclarativeCourseState({
    projectId: 'editor-runtime-course',
    projectRevision: 0,
    declarations: [],
    navigationGuards: [],
    locationIds: ['location-runtime'],
    startLocationId: 'location-runtime',
  })
  const navigation = {
    goToScene: vi.fn(() => true),
    next: vi.fn(() => true),
    previous: vi.fn(() => true),
    replay: vi.fn(() => true),
    restart: vi.fn(() => true),
    setPresentationState: vi.fn(() => true),
    presentationState: () => ({ current: null, states: [] }),
  }
  const reportDiagnostic = vi.fn()
  const stateWrites: string[] = []
  const recordingState = new Proxy(courseState, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (property === 'set' || property === 'delete' || property === 'clear') {
        return (...args: unknown[]) => {
          stateWrites.push(String(property))
          return Reflect.apply(value, target, args)
        }
      }
      return value
    },
  })
  const projectAssetCalls: string[] = []
  const environment: CourseEditorDynamicEnvironment = {
    courseState: recordingState,
    events,
    navigation,
    resolveProjectAsset: (assetId) => {
      projectAssetCalls.push(assetId)
      return assetId === 'asset-hero' ? 'data:image/png;base64,AA==' : undefined
    },
    resolveComponent: () => undefined,
    reportDiagnostic,
  }
  return {
    registry: new CourseEditorDynamicHostRegistry(environment),
    events,
    courseState,
    navigation,
    reportDiagnostic,
    stateWrites,
    projectAssetCalls,
  }
}

type HitDetail = {
  field?: string
  hitId?: string
  targetKind?: 'text' | 'asset'
}
type HitReporter = (detail?: HitDetail) => void

function mountContext(
  item: RuntimeLayerItem,
): Omit<SlideItemMountContext<RuntimeLayerItem>, 'reportHit'> & {
  reportHit: ReturnType<typeof vi.fn<HitReporter>>
} {
  const container = document.createElement('div')
  const reportHit = vi.fn<HitReporter>()
  return {
    surfaceId: 'surface-runtime',
    sceneId: 'scene-runtime',
    item,
    container,
    services: {
      navigate: vi.fn(),
      getCourseState: vi.fn(),
      setCourseState: vi.fn(),
      resolveAsset: vi.fn(),
      reportDiagnostic: vi.fn(),
    },
    signal: new AbortController().signal,
    mode: 'inspect',
    reportHit,
  }
}

afterEach(() => {
  delete window.CoursewareSurfaceRuntime
  document.body.replaceChildren()
})

describe('Surface Runtime API 3 编辑宿主全链', () => {
  it('版本协商拒绝协议/API 不匹配的组合，只接受 surface-v1 + API 3', () => {
    const { registry } = createHarness()
    expect(() => registry.runtimeHost(runtimeItem({
      protocol: 'surface-v1', runtimeApiVersion: 2,
    }))).toThrow(/不支持的 Runtime 协议/)
    expect(() => registry.runtimeHost(runtimeItem({
      protocol: 'legacy-runtime-v2', runtimeApiVersion: 3,
    }))).toThrow(/不支持的 Runtime 协议/)
    const host = registry.runtimeHost(runtimeItem())
    expect(host).toBeDefined()
  })

  it('检查态挂载：内容/素材可读、作者目标命中稳定 product 字段且 hitId 仅限会话', () => {
    const { registry, projectAssetCalls } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)

    const text = ctx.container.querySelector<HTMLElement>(
      '[data-courseware-content-key="title/a~b"]',
    )!
    const bounds = ctx.container.querySelector<HTMLElement>(
      '[data-surface-runtime-target-key="hero/x~y"]',
    )!
    expect(text).toHaveTextContent('可命中文字')
    expect(ctx.container.dataset.createCount).toBe('1')
    expect(ctx.container.dataset.suspended).toBe('1')
    expect(bounds.style.cssText).toContain('left: 8px')
    expect(projectAssetCalls).toContain('asset-hero')

    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    bounds.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(ctx.reportHit).toHaveBeenCalledWith(expect.objectContaining({
      field: 'runtime/content/values/title~1a~0b',
      hitId: expect.stringMatching(/^surface-runtime:text:/),
      targetKind: 'text',
    }))
    expect(ctx.reportHit).toHaveBeenCalledWith(expect.objectContaining({
      field: 'runtime/assets/hero~1x~0y/assetId',
      hitId: expect.stringMatching(/^surface-runtime:asset:/),
      targetKind: 'asset',
    }))
  })

  it('消息路由：运行时 emit 直达宿主事件总线，事件与作者操作互不污染', () => {
    const { registry, events } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)

    const received: unknown[] = []
    const disposer = events.on('runtime:custom', (payload) => { received.push(payload) })
    const itemDom = ctx.container.querySelector<HTMLElement>('[data-courseware-content-key="title/a~b"]')!
    const routedSource = `
CoursewareSurfaceRuntime.define({
  runtimeApiVersion: 3,
  create(ctx) {
    const button = ctx.dom.root.ownerDocument.createElement('button');
    button.dataset.routed = 'true';
    button.addEventListener('click', () => ctx.emit('runtime:custom', { kind: 'continue', value: 1 }));
    ctx.dom.root.appendChild(button);
    return { destroy() {} };
  }
});`
    const routedHost = registry.runtimeHost(runtimeItem({ source: routedSource }))
    const routedCtx = mountContext(runtimeItem({ source: routedSource }))
    routedHost.mount(routedCtx)
    routedCtx.container.querySelector<HTMLElement>('[data-routed="true"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(received).toEqual([{ kind: 'continue', value: 1 }])
    disposer()
    expect(itemDom).toBeTruthy()
    expect(events.listenerCount()).toBe(0)
  })

  it('状态热更新：内容/素材变更走 updateContent/updateAssets，不重挂实例', () => {
    const { registry } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)
    expect(ctx.container.dataset.createCount).toBe('1')

    const updated = structuredClone(item)
    updated.runtime.content.values['title/a~b'] = '热更新后的标题'
    updated.runtime.assets['hero/x~y'] = { assetId: 'asset-hero-2' }
    updated.frame.width = 800
    host.update!(updated, ctx)

    expect(ctx.container.dataset.createCount).toBe('1')
    expect(ctx.container.dataset.hotUpdateCount).toBe('1')
    expect(ctx.container.dataset.hotAssetCount).toBe('1')
    expect(ctx.container.dataset.hotAssetId).toBe('asset-hero-2')
    expect(ctx.container.querySelector<HTMLElement>(
      '[data-courseware-content-key="title/a~b"]',
    )).toHaveTextContent('热更新后的标题')
    // 作者桥接在同一实例上继续有效
    ctx.container.querySelector<HTMLElement>(
      '[data-courseware-content-key="title/a~b"]',
    )!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(ctx.reportHit).toHaveBeenCalledWith(expect.objectContaining({
      field: 'runtime/content/values/title~1a~0b',
    }))
  })

  it('capture：prepareCapture 等待注册的资源屏障', async () => {
    const { registry } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)
    await host.capture!({ purpose: 'thumbnail' })
    expect(ctx.container.dataset.preparedCapture).toBe('true')
  })

  it('checkpoint：可执行变更导出检查点、销毁旧实例并恢复新实例，不重写工程', async () => {
    const { registry, stateWrites, navigation } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)
    expect(ctx.container.dataset.createCount).toBe('1')

    const updated = structuredClone(item)
    updated.runtime.source = NEW_SOURCE
    updated.runtime.content.values['title/a~b'] = '重挂后的文字'
    host.update!(updated, ctx)

    expect(ctx.container.dataset.createCount).toBe('2')
    expect(ctx.container.dataset.destroyed).toBe('1')
    expect(ctx.container.dataset.restoredCheckpoint).toBe(JSON.stringify({ score: 3, answers: ['A', 'B'] }))
    expect(ctx.container.querySelector<HTMLElement>(
      '[data-courseware-content-key="title/a~b"]',
    )).toHaveTextContent('重挂后的文字')
    // 作者操作不写会话状态、不触发导航 → 不会产生编辑器 history/dirty
    expect(stateWrites).toEqual([])
    expect(navigation.goToScene).not.toHaveBeenCalled()
    expect(navigation.next).not.toHaveBeenCalled()
  })

  it('错误隔离：create 抛错只影响当前项，桥接资源被清理，相邻 Runtime 不受影响', () => {
    const { registry, reportDiagnostic } = createHarness()
    const failingItem = runtimeItem({ source: FAILING_SOURCE })
    const failingHost = registry.runtimeHost(failingItem)
    const failingCtx = mountContext(failingItem)
    expect(() => failingHost.mount(failingCtx)).toThrow('运行时资源解码失败')
    expect(failingCtx.container.querySelector('.surface-runtime-authoring-targets')).toBeNull()
    expect(reportDiagnostic).not.toHaveBeenCalled()

    const goodItem = runtimeItem()
    const goodHost = registry.runtimeHost(goodItem)
    const goodCtx = mountContext(goodItem)
    goodHost.mount(goodCtx)
    expect(goodCtx.container.dataset.createCount).toBe('1')
    expect(goodCtx.container.querySelector<HTMLElement>(
      '[data-courseware-content-key="title/a~b"]',
    )).toHaveTextContent('可命中文字')
  })

  it('destroy：释放实例、作者桥接与命中监听，后续点击不再上报', () => {
    const { registry } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)
    const text = ctx.container.querySelector<HTMLElement>(
      '[data-courseware-content-key="title/a~b"]',
    )!
    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(ctx.reportHit).toHaveBeenCalledOnce()

    host.destroy?.()
    expect(ctx.container.dataset.destroyed).toBe('1')
    expect(ctx.container.querySelector('.surface-runtime-authoring-targets')).toBeNull()
    text.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(ctx.reportHit).toHaveBeenCalledOnce()
  })
})
