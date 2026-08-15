import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import { DeclarativeCourseState } from '@/player/DeclarativeCourseState'
import { PublishedDynamicHostRegistry } from '@/player/surfaces/publishedDynamicHosts'
import { CourseEditorDynamicHostRegistry } from '@/renderer/course/courseEditorDynamicHosts'
import { useEditorStore } from '@/renderer/store/editorStore'
import type { ComponentPackageData } from '@/shared/componentTypes'
import type { ComponentLayerItem } from '@/shared/courseProjectTypes'
import type { PublishedCourseV2Payload } from '@/shared/publishedCourseTypes'
import type { SlideItemMountContext } from '@/player/surfaces/slide/SlideSurfaceHost'

let restoreFocus: (() => void) | undefined

beforeAll(() => {
  const originalFocus = window.focus
  window.focus = () => undefined
  restoreFocus = () => { window.focus = originalFocus }
  useEditorStore.getState().createNewProject()
  useEditorStore.setState({ editorMode: 'professional' })
})

afterAll(() => { restoreFocus?.() })

const PACKAGE_ID = 'component.v'

function courseState(...keys: string[]): DeclarativeCourseState {
  return new DeclarativeCourseState({
    projectId: 'component-v4-test',
    projectRevision: 1,
    declarations: keys.map((key) => ({
      key,
      valueType: 'string' as const,
      defaultValue: '',
    })),
    navigationGuards: [],
    locationIds: ['location-main'],
    startLocationId: 'location-main',
  })
}

/** DOM Component runtime that counts create() calls and records live markers. */
function domRuntimeSource(version: string, marker: string): string {
  return `CoursewareComponent.define({
    id: ${JSON.stringify(PACKAGE_ID)}, runtimeApiVersion: 4,
    create(ctx) {
      const root = ctx.dom.root;
      const count = Number(root.dataset.createCount ?? 0);
      root.dataset.createCount = String(count + 1);
      root.dataset.marker = ${JSON.stringify(marker)};
      return {
        updateProps(props) { root.dataset.title = String(props.title); },
        resize(width, height) { root.dataset.size = width + 'x' + height; },
        destroy() { root.dataset.destroyed = 'yes'; }
      };
    }
  });`
}

function domManifest(version: string, overrides: Partial<ComponentPackageData['manifest']> = {}): ComponentPackageData['manifest'] {
  return {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: PACKAGE_ID,
    name: 'DOM 组件',
    version,
    entry: 'runtime.js',
    defaultSize: { width: 320, height: 180 },
    minSize: { width: 1, height: 1 },
    preserveAspectRatio: false,
    assets: {},
    defaultProps: { title: '默认' },
    supportedScopes: ['scene'],
    renderMode: 'dom',
    ...overrides,
  }
}

function componentPackage(version: string, marker: string): ComponentPackageData {
  const source = domRuntimeSource(version, marker)
  return {
    manifest: domManifest(version),
    runtimeSource: source,
    files: { 'runtime.js': new TextEncoder().encode(source) },
  }
}

function componentItem(
  version: string,
  props: Record<string, unknown> = { title: '初始' },
  layerItemId = `component-${version}`,
): ComponentLayerItem {
  return {
    layerItemId,
    label: `Component ${version}`,
    kind: 'component',
    frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 180 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: PACKAGE_ID, version },
    props,
  }
}

function mountContext<T extends ComponentLayerItem>(
  item: T,
  container: HTMLElement,
  mode: 'playback' | 'inspect' = 'playback',
): SlideItemMountContext<T> {
  return {
    surfaceId: 'surface-main',
    sceneId: 'scene-main',
    item,
    container,
    services: {
      navigate: vi.fn(), getCourseState: vi.fn(), setCourseState: vi.fn(), resolveAsset: vi.fn(),
    },
    signal: new AbortController().signal,
    mode,
    reportHit: vi.fn(),
  }
}

function encodeCode(source: string): { encoding: 'base64-utf16le'; data: string } {
  const bytes = new Uint8Array(source.length * 2)
  source.split('').forEach((character, index) => {
    const code = character.charCodeAt(0)
    bytes[index * 2] = code & 0xff
    bytes[index * 2 + 1] = code >>> 8
  })
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return { encoding: 'base64-utf16le', data: btoa(binary) }
}

function publishedPayload(components: Record<string, NonNullable<PublishedCourseV2Payload['components'][string]>>): PublishedCourseV2Payload {
  return {
    format: 'h5course-published',
    formatVersion: 2,
    sourceSchemaVersion: 9,
    courseId: 'component-v4-course',
    title: 'Component V4',
    assets: { 'component-fallback': { mimeType: 'image/png', url: 'data:image/png;base64,AA==' } },
    components,
    designTokens: {} as PublishedCourseV2Payload['designTokens'],
    media: {} as PublishedCourseV2Payload['media'],
    playback: {} as PublishedCourseV2Payload['playback'],
    courseState: [],
    navigationGuards: [],
    locations: [{
      id: 'location-main', label: 'Main', kind: 'slide-scene',
      surfaceId: 'surface-main', sceneId: 'scene-main',
    }],
    startLocationId: 'location-main',
    globalLayerItems: [],
    globalInteractions: [],
    surfaces: [],
  }
}

function publishedComponent(version: string, marker: string) {
  return {
    id: PACKAGE_ID,
    name: `Published ${version}`,
    version,
    contentSha256: version,
    apiVersion: 4 as const,
    scopes: ['scene'] as Array<'global' | 'scene'>,
    renderMode: 'dom' as const,
    code: encodeCode(domRuntimeSource(version, marker)),
    assets: {},
  }
}

describe('Component API 4 host chain', () => {
  it('explicitly rejects a published payload that embeds two versions of one package', async () => {
    const events = new CourseEventBus()
    const registry = new PublishedDynamicHostRegistry({
      payload: publishedPayload({
        'component.v@1.0.0': publishedComponent('1.0.0', 'v1'),
        'component.v@2.0.0': publishedComponent('2.0.0', 'v2'),
      }),
      courseState: courseState(),
      events,
      navigation: {
        goToScene: vi.fn(), next: vi.fn(), previous: vi.fn(), replay: vi.fn(), restart: vi.fn(),
        setPresentationState: vi.fn(), presentationState: () => ({ current: null, states: [] }),
      },
    })

    const hostV1 = registry.componentHost(componentItem('1.0.0'))
    const containerV1 = document.createElement('div')
    await hostV1.mount(mountContext(componentItem('1.0.0'), containerV1))
    expect(containerV1.dataset.marker).toBe('v1')

    // The second version must fail loudly instead of silently overwriting v1.
    expect(() => registry.componentHost(componentItem('2.0.0'))).toThrowError(/版本冲突/)

    // The installed version keeps working after the rejection.
    await hostV1.update?.(
      componentItem('1.0.0', { title: '更新后' }),
      mountContext(componentItem('1.0.0', { title: '更新后' }), containerV1),
    )
    expect(containerV1.dataset.createCount).toBe('1')
    expect(containerV1.dataset.title).toBe('更新后')

    await hostV1.destroy?.()
    expect(containerV1.dataset.destroyed).toBe('yes')
    events.dispose()
    registry.dispose()
  })

  it('applies props updates and resizes to a live DOM instance without recreating it', async () => {
    const events = new CourseEventBus()
    const registry = new PublishedDynamicHostRegistry({
      payload: publishedPayload({ 'component.v@1.0.0': publishedComponent('1.0.0', 'live') }),
      courseState: courseState(),
      events,
      navigation: {
        goToScene: vi.fn(), next: vi.fn(), previous: vi.fn(), replay: vi.fn(), restart: vi.fn(),
        setPresentationState: vi.fn(), presentationState: () => ({ current: null, states: [] }),
      },
    })
    const host = registry.componentHost(componentItem('1.0.0'))
    const container = document.createElement('div')
    await host.mount(mountContext(componentItem('1.0.0'), container))
    expect(container.dataset.createCount).toBe('1')

    const updated = componentItem('1.0.0', { title: '新标题' })
    updated.frame.width = 640
    updated.frame.height = 360
    await host.update?.(updated, mountContext(updated, container))
    expect(container.dataset.createCount).toBe('1')
    expect(container.dataset.title).toBe('新标题')
    expect(container.dataset.size).toBe('640x360')

    await host.destroy?.()
    expect(container.dataset.destroyed).toBe('yes')
    events.dispose()
    registry.dispose()
  })

  it('hot-updates only the affected editor instance and leaves unrelated instances running', async () => {
    const events = new CourseEventBus()
    let source = domRuntimeSource('1.0.0', 'old')
    const resolveComponent = vi.fn(() => ({
      manifest: domManifest('1.0.0'),
      runtimeSource: source,
      files: { 'runtime.js': new TextEncoder().encode(source) },
    }))
    const reportDiagnostic = vi.fn()
    const registry = new CourseEditorDynamicHostRegistry({
      courseState: courseState(),
      events,
      navigation: {
        goToScene: () => true, next: () => true, previous: () => true, replay: () => true,
        restart: () => true, setPresentationState: () => true,
        presentationState: () => ({ current: null, states: [] }),
      },
      resolveProjectAsset: () => undefined,
      resolveComponent,
      reportDiagnostic,
    })

    const itemA = componentItem('1.0.0', { title: 'A' }, 'component-a')
    const itemB = componentItem('1.0.0', { title: 'B' }, 'component-b')
    const hostA = registry.componentHost(itemA)
    const hostB = registry.componentHost(itemB)
    const containerA = document.createElement('div')
    const containerB = document.createElement('div')
    await hostA.mount(mountContext(itemA, containerA))
    await hostB.mount(mountContext(itemB, containerB))
    expect(containerA.dataset.createCount).toBe('1')
    expect(containerB.dataset.createCount).toBe('1')

    // A plain props update never rebuilds the instance.
    await hostA.update?.(
      componentItem('1.0.0', { title: 'A 改' }, 'component-a'),
      mountContext(itemA, containerA),
    )
    expect(containerA.dataset.createCount).toBe('1')
    expect(containerA.dataset.title).toBe('A 改')

    // A runtime hot update rebuilds only this host; the unrelated B instance
    // keeps its live definition and create count.
    source = domRuntimeSource('1.0.0', 'new')
    await hostA.update?.(
      componentItem('1.0.0', { title: 'A 热更' }, 'component-a'),
      mountContext(itemA, containerA),
    )
    expect(containerA.dataset.createCount).toBe('2')
    expect(containerA.dataset.marker).toBe('new')
    expect(containerB.dataset.createCount).toBe('1')
    expect(containerB.dataset.marker).toBe('old')
    expect(reportDiagnostic).toHaveBeenCalledWith(
      expect.any(String),
      'component-a',
      expect.objectContaining({ message: expect.stringContaining('必须重新挂载') }),
    )

    await hostA.destroy?.()
    await hostB.destroy?.()
    events.dispose()
    registry.dispose()
  })

  it('separates static fallback, thumbnail and the real running surface', async () => {
    const events = new CourseEventBus()
    const registry = new PublishedDynamicHostRegistry({
      payload: publishedPayload({ 'component.v@1.0.0': publishedComponent('1.0.0', 'live') }),
      courseState: courseState(),
      events,
      navigation: {
        goToScene: vi.fn(), next: vi.fn(), previous: vi.fn(), replay: vi.fn(), restart: vi.fn(),
        setPresentationState: vi.fn(), presentationState: () => ({ current: null, states: [] }),
      },
      reportDiagnostic: vi.fn(),
    })

    // Live surface: the real runtime renders; no static fallback image appears.
    const liveBlock = {
      id: 'flow-live', type: 'component' as const,
      component: { packageId: PACKAGE_ID, version: '1.0.0' },
      props: {},
      staticFallbackAssetId: 'component-fallback',
    }
    const live = registry.renderFlowComponent('surface-flow', liveBlock, document)
    const liveNode = live.node as HTMLElement
    await vi.waitFor(() => {
      expect(liveNode.dataset.marker).toBe('live')
    })
    expect(liveNode.querySelector('img')).toBeNull()
    expect(liveNode.dataset.hostError).toBeUndefined()

    // Static fallback: a missing/conflicting package renders the authored
    // fallback image and never mounts the runtime.
    const missingBlock = {
      id: 'flow-missing', type: 'component' as const,
      component: { packageId: 'component.missing', version: '9.0.0' },
      props: {},
      staticFallbackAssetId: 'component-fallback',
    }
    const fallen = registry.renderFlowComponent('surface-flow', missingBlock, document)
    const fallenNode = fallen.node as HTMLElement
    const fallbackImage = fallenNode.querySelector<HTMLImageElement>('img')
    expect(fallbackImage?.src).toBe('data:image/png;base64,AA==')
    expect(fallenNode.dataset.hostError).toBe('true')
    expect(fallenNode.textContent).toContain('互动组件无法运行')

    // Thumbnail is a catalog-only asset, never part of the running surface.
    const editorEvents = new CourseEventBus()
    const editorRegistry = new CourseEditorDynamicHostRegistry({
      courseState: courseState(),
      events: editorEvents,
      navigation: {
        goToScene: () => true, next: () => true, previous: () => true, replay: () => true,
        restart: () => true, setPresentationState: () => true,
        presentationState: () => ({ current: null, states: [] }),
      },
      resolveProjectAsset: () => undefined,
      resolveComponent: () => {
        const source = domRuntimeSource('1.0.0', 'thumb-live')
        return {
          manifest: domManifest('1.0.0', { thumbnail: 'thumbnails/preview.svg' }),
          runtimeSource: source,
          files: { 'runtime.js': new TextEncoder().encode(source) },
        }
      },
    })
    const item = componentItem('1.0.0', {}, 'thumb-component')
    const editorHost = editorRegistry.componentHost(item)
    const container = document.createElement('div')
    await editorHost.mount(mountContext(item, container))
    expect(container.dataset.marker).toBe('thumb-live')
    expect(container.innerHTML).not.toContain('thumbnails/preview.svg')
    await editorHost.destroy?.()

    events.dispose()
    editorEvents.dispose()
    registry.dispose()
    editorRegistry.dispose()
  })

  it('routes component actions and events to the session only, leaving editor history/dirty untouched', async () => {
    const events = new CourseEventBus()
    const received: unknown[] = []
    events.on('quiz:answered', (payload) => { received.push(payload) })
    const next = vi.fn(() => true)
    const goToScene = vi.fn(() => true)
    const registry = new CourseEditorDynamicHostRegistry({
      courseState: courseState('score'),
      events,
      navigation: {
        goToScene, next, previous: () => true, replay: () => true, restart: () => true,
        setPresentationState: () => true, presentationState: () => ({ current: null, states: [] }),
      },
      resolveProjectAsset: () => undefined,
      resolveComponent: () => {
        const source = `CoursewareComponent.define({
          id: ${JSON.stringify(PACKAGE_ID)}, runtimeApiVersion: 4,
          create(ctx) {
            ctx.dom.root.dataset.captured = 'yes';
            window.__componentContext = ctx;
            return { destroy() {} };
          }
        });`
        return {
          manifest: domManifest('1.0.0'),
          runtimeSource: source,
          files: { 'runtime.js': new TextEncoder().encode(source) },
        }
      },
    })
    const item = componentItem('1.0.0', {}, 'session-component')
    const host = registry.componentHost(item)
    const container = document.createElement('div')
    await host.mount(mountContext(item, container))
    expect(container.dataset.captured).toBe('yes')

    const beforeHistory = useEditorStore.getState().history.past.length
    const beforeDirty = useEditorStore.getState().dirty
    const ctx = (window as unknown as { __componentContext: NonNullable<unknown> }).__componentContext as {
      emit: (name: string, payload?: unknown) => void
      actions: { nextScene(): boolean; goToScene(sceneId: string, stateId?: string): boolean }
      courseState: { set(key: string, value: unknown): void }
      history?: unknown
      dirty?: unknown
      store?: unknown
    }
    ctx.emit('quiz:answered', { value: 3 })
    expect(received).toEqual([{ value: 3 }])
    expect(ctx.actions.nextScene()).toBe(true)
    expect(next).toHaveBeenCalledWith('component')
    expect(ctx.actions.goToScene('scene-next')).toBe(true)
    expect(goToScene).toHaveBeenCalledWith('scene-next', undefined, 'component')
    ctx.courseState.set('score', '5')

    // The runtime context exposes session surfaces only, never the editor store.
    expect('history' in ctx).toBe(false)
    expect('dirty' in ctx).toBe(false)
    expect('store' in ctx).toBe(false)
    expect(useEditorStore.getState().history.past.length).toBe(beforeHistory)
    expect(useEditorStore.getState().dirty).toBe(beforeDirty)

    delete (window as unknown as { __componentContext?: unknown }).__componentContext
    await host.destroy?.()
    events.dispose()
    registry.dispose()
  })
})
