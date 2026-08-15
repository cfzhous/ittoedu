import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import { DeclarativeCourseState } from '@/player/DeclarativeCourseState'
import {
  CourseEditorDynamicHostRegistry,
  type CourseEditorDynamicEnvironment,
} from '@/renderer/course/courseEditorDynamicHosts'
import type { RuntimeLayerItem } from '@/shared/courseProjectTypes'
import type { SlideItemMountContext } from '@/player/surfaces/slide/SlideSurfaceHost'

/**
 * Runtime API 2 (legacy-runtime-v2) DOM path at the unified editor host level.
 * The migrated V8 whole-canvas runtime must still negotiate its version, load,
 * expose authoring V1 targets with stable hit fields, remount when authored
 * content changes and clean up on destroy — without writing course state or
 * navigating, i.e. without producing editor history/dirty.
 */

const SOURCE = `
CoursewareRuntime.define({
  runtimeApiVersion: 2,
  authoringApiVersion: 1,
  create(ctx) {
    const root = ctx.dom.overlay;
    root.dataset.runtimeOverlay = 'true';
    root.dataset.createCount = String(Number(root.dataset.createCount || 0) + 1);
    const text = root.ownerDocument.createElement('p');
    text.dataset.runtimeText = 'true';
    text.textContent = ctx.content.get('title');
    root.appendChild(text);
    ctx.authoring.register({
      kind: 'text',
      key: 'title',
      label: '主标题',
      getBounds() { return { x: 80, y: 60, width: 400, height: 72 }; }
    });
    return {
      suspend() { root.dataset.suspended = String(Number(root.dataset.suspended || 0) + 1); },
      resume() { root.dataset.resumed = String(Number(root.dataset.resumed || 0) + 1); },
      resize(width, height) {
        root.dataset.resized = width + 'x' + height;
      },
      destroy() { root.dataset.destroyed = String(Number(root.dataset.destroyed || 0) + 1); }
    };
  }
});`

function runtimeItem(
  overrides: Partial<RuntimeLayerItem['runtime']> = {},
): RuntimeLayerItem {
  return {
    layerItemId: 'runtime-legacy-dom',
    label: 'Legacy Runtime',
    frame: { mode: 'legacy-whole-canvas', x: 0, y: 0, width: 640, height: 360 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'surface',
    playbackInitialVisibility: 'inherit',
    kind: 'runtime',
    runtime: {
      protocol: 'legacy-runtime-v2',
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: SOURCE,
      content: { values: { title: '画布标题' } },
      assets: {},
      ...overrides,
    },
  }
}

function createHarness() {
  const events = new CourseEventBus()
  const courseState = new DeclarativeCourseState({
    projectId: 'editor-legacy-runtime-course',
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
  const environment: CourseEditorDynamicEnvironment = {
    courseState: recordingState,
    events,
    navigation,
    resolveProjectAsset: () => 'data:image/png;base64,AA==',
    resolveComponent: () => undefined,
    reportDiagnostic,
  }
  return {
    registry: new CourseEditorDynamicHostRegistry(environment),
    events,
    navigation,
    reportDiagnostic,
    stateWrites,
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

function runtimeOverlay(
  context: SlideItemMountContext<RuntimeLayerItem>,
): HTMLElement {
  const overlay = context.container.querySelector<HTMLElement>('[data-runtime-overlay]')
  if (!overlay) throw new Error('runtime overlay is not mounted')
  return overlay
}

afterEach(() => {
  delete window.CoursewareRuntime
  document.body.replaceChildren()
})

describe('Runtime API 2 编辑宿主（legacy dom）全链', () => {
  it('版本协商只接受 legacy-runtime-v2 + API 2', () => {
    const { registry } = createHarness()
    expect(registry.runtimeHost(runtimeItem())).toBeDefined()
    expect(() => registry.runtimeHost(runtimeItem({
      protocol: 'legacy-runtime-v2', runtimeApiVersion: 3,
    }))).toThrow(/不支持的 Runtime 协议/)
    expect(() => registry.runtimeHost(runtimeItem({
      protocol: 'surface-v1', runtimeApiVersion: 2,
    }))).toThrow(/不支持的 Runtime 协议/)
  })

  it('检查态挂载：authoring V1 目标映射稳定字段，缩放标准化后回到项坐标', async () => {
    const { registry, stateWrites } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)
    await Promise.resolve()

    expect(runtimeOverlay(ctx).dataset.createCount).toBe('1')
    expect(runtimeOverlay(ctx).dataset.suspended).toBe('1')
    expect(ctx.container.querySelector<HTMLElement>('[data-runtime-text="true"]'))
      .toHaveTextContent('画布标题')
    const overlay = ctx.container.querySelector<HTMLElement>(
      '[data-dynamic-field="runtime/content/values/title"]',
    )!
    expect(overlay.style.cssText).toContain('left: 80px')
    expect(overlay.style.cssText).toContain('top: 60px')
    expect(overlay).toHaveAttribute('data-dynamic-hit-id', 'registered:1')

    overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(ctx.reportHit).toHaveBeenCalledWith({
      field: 'runtime/content/values/title',
      hitId: 'registered:1',
      targetKind: 'text',
    })
    expect(stateWrites).toEqual([])
  })

  it('内容变更时重挂 dom 实例并显示最新文字，作者目标继续可命中', async () => {
    const { registry, stateWrites } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)
    await Promise.resolve()
    expect(runtimeOverlay(ctx).dataset.createCount).toBe('1')
    const previousOverlay = runtimeOverlay(ctx)

    const updated = structuredClone(item)
    updated.runtime.content.values.title = '重挂后的标题'
    updated.frame.width = 800
    host.update!(updated, ctx)
    await Promise.resolve()

    // 旧实例被销毁并从 DOM 移除，新实例在同一容器重挂
    expect(previousOverlay.dataset.destroyed).toBe('1')
    expect(previousOverlay.isConnected).toBe(false)
    expect(runtimeOverlay(ctx).dataset.createCount).toBe('1')
    expect(ctx.container.querySelector<HTMLElement>('[data-runtime-text="true"]'))
      .toHaveTextContent('重挂后的标题')
    const overlay = ctx.container.querySelector<HTMLElement>(
      '[data-dynamic-field="runtime/content/values/title"]',
    )!
    overlay.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(ctx.reportHit).toHaveBeenCalledWith({
      field: 'runtime/content/values/title',
      hitId: 'registered:1',
      targetKind: 'text',
    })
    expect(stateWrites).toEqual([])
  })

  it('纯尺寸变化不重挂，只转发 resize 并刷新作者目标', async () => {
    const { registry } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)
    await Promise.resolve()
    expect(runtimeOverlay(ctx).dataset.createCount).toBe('1')

    const resized = structuredClone(item)
    resized.frame.width = 900
    resized.frame.height = 500
    host.update!(resized, ctx)

    expect(runtimeOverlay(ctx).dataset.createCount).toBe('1')
    expect(runtimeOverlay(ctx).dataset.resized).toBe('900x500')
  })

  it('destroy 释放实例、authoring 注册表与命中覆盖层', async () => {
    const { registry } = createHarness()
    const item = runtimeItem()
    const host = registry.runtimeHost(item)
    const ctx = mountContext(item)
    host.mount(ctx)
    await Promise.resolve()
    const overlay = ctx.container.querySelector<HTMLElement>(
      '[data-dynamic-field="runtime/content/values/title"]',
    )!

    host.destroy?.()
    expect(runtimeOverlay(ctx).dataset.destroyed).toBe('1')
    // 命中覆盖层从 DOM 移除，目标元素随之脱离文档，无法再接收真实命中
    expect(ctx.container.querySelector('.course-dynamic-authoring-targets')).toBeNull()
    expect(overlay.isConnected).toBe(false)
  })
})
