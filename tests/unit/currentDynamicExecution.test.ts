import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import { DeclarativeCourseState } from '@/player/DeclarativeCourseState'
import { PublishedDynamicHostRegistry } from '@/player/surfaces/publishedDynamicHosts'
import { CourseEditorDynamicHostRegistry } from '@/renderer/course/courseEditorDynamicHosts'
import type { ComponentPackageData } from '@/shared/componentTypes'
import type { ComponentLayerItem, RuntimeLayerItem } from '@/shared/courseProjectTypes'
import type { PublishedCourseV2Payload } from '@/shared/publishedCourseTypes'

let restoreCanvas: (() => void) | undefined
let restoreCanvasDataUrl: (() => void) | undefined
let restoreImage: (() => void) | undefined
let restoreFocus: (() => void) | undefined

beforeAll(() => {
  const originalFocus = window.focus
  window.focus = () => undefined
  restoreFocus = () => { window.focus = originalFocus }
  const original = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    const pixels = new Uint8ClampedArray([10, 20, 30, 128])
    const gradient = { addColorStop: () => undefined }
    const base: Record<string, unknown> = {
      canvas: this,
      fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1,
      globalCompositeOperation: 'source-over', font: '10px sans-serif',
      getImageData: () => ({ data: pixels, width: 1, height: 1 }),
      createImageData: () => ({ data: pixels, width: 1, height: 1 }),
      measureText: (text: string) => ({ width: text.length * 8 }),
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => null,
    }
    return new Proxy(base, {
      get(target, property) {
        if (property in target) return target[property as string]
        return () => undefined
      },
      set(target, property, value) {
        target[property as string] = value
        return true
      },
    }) as unknown as CanvasRenderingContext2D
  } as unknown as typeof HTMLCanvasElement.prototype.getContext
  restoreCanvas = () => { HTMLCanvasElement.prototype.getContext = original }
  const originalToDataUrl = HTMLCanvasElement.prototype.toDataURL
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AA=='
  restoreCanvasDataUrl = () => { HTMLCanvasElement.prototype.toDataURL = originalToDataUrl }
  const imageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    get() { return this.getAttribute('src') ?? '' },
    set(value: string) {
      this.setAttribute('src', value)
      queueMicrotask(() => this.dispatchEvent(new Event('load')))
    },
  })
  restoreImage = () => {
    if (imageSource) Object.defineProperty(HTMLImageElement.prototype, 'src', imageSource)
  }
})

afterAll(() => { restoreCanvas?.(); restoreCanvasDataUrl?.(); restoreImage?.(); restoreFocus?.() })

function state(...keys: string[]): DeclarativeCourseState {
  return new DeclarativeCourseState({
    projectId: 'current-dynamic-test',
    projectRevision: 1,
    declarations: keys.map((key) => ({ key, valueType: 'string' as const, defaultValue: '' })),
    navigationGuards: [],
    locationIds: ['location-main'],
    startLocationId: 'location-main',
  })
}

function componentItem(props: Record<string, unknown> = { title: '初始' }): ComponentLayerItem {
  return {
    layerItemId: 'component-layer',
    label: '当前组件',
    kind: 'component',
    frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 180 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: 'component.current-v4', version: '1.0.0' },
    props,
  }
}

const PHASER_COMPONENT_SOURCE = `
CoursewareComponent.define({
  id: 'component.current-v4', runtimeApiVersion: 4,
  create(ctx) {
    ctx.courseState.set('created', 'editor');
    const box = ctx.phaser.scene.add.rectangle(24, 18, 48, 36, 0x2563eb);
    ctx.phaser.root.add(box);
    ctx.editor.registerTextRegion({key:'title',label:'标题',getBounds(){return{x:4,y:6,width:90,height:30}}});
    return {
      setMode(mode) { ctx.courseState.set('mode', mode); },
      updateProps(props) { ctx.courseState.set('title', String(props.title)); },
      resume() { ctx.courseState.set('activity', 'resumed'); },
      prepareCapture() {
        ctx.courseState.set('capture', 'ready');
        ctx.actions.nextScene();
        ctx.events.emit('capture:effect', { ready: true });
      },
      destroy() { ctx.courseState.set('destroyed', 'yes'); }
    };
  }
});`

function phaserPackage(): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 4,
      runtimeApiVersion: 4,
      id: 'component.current-v4',
      name: '当前 Phaser 组件',
      version: '1.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 320, height: 180 },
      minSize: { width: 1, height: 1 },
      preserveAspectRatio: false,
      assets: {},
      defaultProps: { title: '初始' },
      supportedScopes: ['scene'],
      renderMode: 'phaser',
      editor: { properties: [{ key: 'title', label: '标题', type: 'text' }] },
    },
    runtimeSource: PHASER_COMPONENT_SOURCE,
    files: { 'runtime.js': new TextEncoder().encode(PHASER_COMPONENT_SOURCE) },
  }
}

function mountContext<T extends ComponentLayerItem | RuntimeLayerItem>(
  item: T,
  container: HTMLElement,
  mode: 'playback' | 'inspect' = 'playback',
  reportHit = vi.fn(),
) {
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
    reportHit,
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

const HYBRID_COMPONENT_SOURCE = `
CoursewareComponent.define({
  id: 'component.current-v4', runtimeApiVersion: 4,
  create(ctx) {
    ctx.courseState.set('created', 'published-hybrid');
    const box = ctx.phaser.scene.add.rectangle(20, 20, 40, 40, 0x16a34a);
    ctx.phaser.root.add(box);
    const marker = ctx.dom.root.ownerDocument.createElement('strong');
    marker.dataset.hybridMarker = 'mounted';
    marker.textContent = String(ctx.props.title);
    ctx.dom.root.appendChild(marker);
    return {
      updateProps(props) { marker.textContent = String(props.title); ctx.courseState.set('title', String(props.title)); },
      prepareCapture() { ctx.courseState.set('capture', 'published'); },
      destroy() { ctx.courseState.set('destroyed', 'published'); }
    };
  }
});`

function publishedPayload(): PublishedCourseV2Payload {
  return {
    format: 'h5course-published',
    formatVersion: 2,
    sourceSchemaVersion: 9,
    courseId: 'current-dynamic-test',
    title: '当前动态执行',
    assets: {},
    components: {
      'component.current-v4@1.0.0': {
        id: 'component.current-v4',
        name: '发布态 Hybrid',
        version: '1.0.0',
        contentSha256: 'a'.repeat(64),
        apiVersion: 4,
        scopes: ['scene'],
        renderMode: 'hybrid',
        code: encodeCode(HYBRID_COMPONENT_SOURCE),
        assets: {},
      },
    },
    designTokens: {} as PublishedCourseV2Payload['designTokens'],
    media: {} as PublishedCourseV2Payload['media'],
    playback: {} as PublishedCourseV2Payload['playback'],
    courseState: [],
    navigationGuards: [],
    locations: [{
      id: 'location-main', label: '主场景', kind: 'slide-scene',
      surfaceId: 'surface-main', sceneId: 'scene-main',
    }],
    startLocationId: 'location-main',
    globalLayerItems: [],
    globalInteractions: [],
    surfaces: [],
  }
}

describe('Course Project V9 current dynamic execution', () => {
  it('runs a Phaser Component API 4 item in Course Studio with inspect/update/capture lifecycle', async () => {
    const courseState = state('created', 'mode', 'title', 'activity', 'capture', 'destroyed')
    const next = vi.fn(() => true)
    const events = new CourseEventBus()
    const captureEffect = vi.fn()
    events.on('capture:effect', captureEffect)
    const registry = new CourseEditorDynamicHostRegistry({
      courseState,
      events,
      navigation: {
        goToScene: () => true, next, previous: () => true,
        replay: () => true, restart: () => true, setPresentationState: () => true,
        presentationState: () => ({ current: null, states: [] }),
      },
      resolveProjectAsset: () => undefined,
      resolveComponent: () => phaserPackage(),
    })
    const item = componentItem()
    const host = registry.componentHost(item)
    const container = document.createElement('div')
    const reportHit = vi.fn()
    await host.mount(mountContext(item, container, 'playback', reportHit))
    await host.activate?.()

    expect(courseState.get('created')).toBe('editor')
    expect(courseState.get('activity')).toBe('resumed')
    expect(container.querySelector('.course-component-phaser-canvas')).not.toBeNull()
    expect(container.querySelector('[class*="legacy"]')).toBeNull()

    const changed = componentItem({ title: '已修改' })
    await host.update?.(changed, mountContext(changed, container))
    expect(courseState.get('title')).toBe('已修改')
    await host.setInspectionMode?.('inspect')
    expect(courseState.get('mode')).toBe('edit')
    const target = container.querySelector<HTMLElement>('[data-dynamic-hit-id]')
    target?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledWith(expect.objectContaining({ field: 'props/title' }))
    expect(await host.capture?.({ purpose: 'authoring' })).toMatchObject({ format: 'html' })
    expect(courseState.get('capture')).toBe('ready')
    expect(next).toHaveBeenCalledTimes(1)
    expect(captureEffect).toHaveBeenCalledTimes(1)

    await host.destroy?.()
    expect(courseState.get('destroyed')).toBe('yes')
    expect(container.querySelector('.course-component-phaser-canvas')).toBeNull()
    registry.dispose()
  }, 10_000)

  it('restores a live Surface Runtime mode when capture preparation fails', async () => {
    const registry = new CourseEditorDynamicHostRegistry({
      courseState: state(),
      events: new CourseEventBus(),
      navigation: {
        goToScene: () => true, next: () => true, previous: () => true,
        replay: () => true, restart: () => true, setPresentationState: () => true,
        presentationState: () => ({ current: null, states: [] }),
      },
      resolveProjectAsset: () => undefined,
      resolveComponent: () => undefined,
    })
    const item: RuntimeLayerItem = {
      layerItemId: 'runtime-capture-failure',
      label: '捕获失败运行内容',
      kind: 'runtime',
      frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 180 },
      order: 0,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      runtime: {
        enabled: true,
        protocol: 'surface-v1',
        runtimeApiVersion: 3,
        renderMode: 'dom',
        source: `CoursewareSurfaceRuntime.define({runtimeApiVersion:3,create(ctx){return{
          setMode(mode){ctx.dom.root.dataset.modes=[ctx.dom.root.dataset.modes,mode].filter(Boolean).join(',')},
          prepareCapture(){throw new Error('capture failed')},destroy(){}
        }}})`,
        content: { values: {} },
        assets: {},
      },
    }
    const container = document.createElement('div')
    const host = registry.runtimeHost(item)
    await host.mount(mountContext(item, container))
    await expect(host.capture?.({ purpose: 'export' })).rejects.toThrow('capture failed')
    expect(container.dataset.modes?.split(',').slice(-2)).toEqual(['capture', 'playback'])
    await host.destroy?.()
    registry.dispose()
  })

  it('runs a Hybrid Component API 4 item from Published Course V2 without legacy planes', async () => {
    const courseState = state('created', 'title', 'capture', 'destroyed')
    const registry = new PublishedDynamicHostRegistry({
      payload: publishedPayload(),
      courseState,
      events: new CourseEventBus(),
      navigation: {
        goToScene: vi.fn(), next: vi.fn(), previous: vi.fn(), replay: vi.fn(), restart: vi.fn(),
        setPresentationState: vi.fn(), presentationState: () => ({ current: null, states: [] }),
      },
    })
    const item = componentItem()
    const host = registry.componentHost(item)
    const container = document.createElement('div')
    await host.mount(mountContext(item, container))
    await host.activate?.()

    expect(courseState.get('created')).toBe('published-hybrid')
    expect(container.querySelector('.course-component-phaser-canvas')).not.toBeNull()
    expect(container.querySelector('[class*="legacy"]')).toBeNull()
    const mount = container.querySelector<HTMLElement>('.lesson-component-mount')
    expect(mount?.shadowRoot?.querySelector('[data-hybrid-marker="mounted"]')).toHaveTextContent('初始')

    const changed = componentItem({ title: '发布态更新' })
    await host.update?.(changed, mountContext(changed, container))
    expect(courseState.get('title')).toBe('发布态更新')
    expect(mount?.shadowRoot?.querySelector('[data-hybrid-marker="mounted"]')).toHaveTextContent('发布态更新')
    expect(await host.capture?.({ purpose: 'export' })).toMatchObject({ format: 'html' })
    expect(courseState.get('capture')).toBe('published')

    await host.destroy?.()
    expect(courseState.get('destroyed')).toBe('published')
    registry.dispose()
  })
})
