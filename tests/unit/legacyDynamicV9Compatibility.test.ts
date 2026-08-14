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
    projectId: 'legacy-v9-test',
    projectRevision: 1,
    declarations: keys.map((key) => ({ key, valueType: 'string' as const, defaultValue: '' })),
    navigationGuards: [],
    locationIds: ['location-main'],
    startLocationId: 'location-main',
  })
}

function componentItem(props: Record<string, unknown> = { title: '初始' }): ComponentLayerItem {
  return {
    layerItemId: 'phaser-component',
    label: 'Phaser Component',
    kind: 'component',
    frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 180 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: 'component.phaser-v9', version: '1.0.0' },
    props,
  }
}

const PHASER_COMPONENT_SOURCE = `
CoursewareComponent.define({
  id: 'component.phaser-v9', runtimeApiVersion: 4,
  create(ctx) {
    ctx.courseState.set('componentCreated', 'yes');
    const box = ctx.phaser.scene.add.rectangle(24, 18, 48, 36, 0x2563eb);
    ctx.phaser.root.add(box);
    ctx.editor.registerTextRegion({key:'title',label:'标题',getBounds(){return{x:4,y:6,width:90,height:30}}});
    return {
      setMode(mode) { ctx.courseState.set('componentMode', mode); },
      updateProps(props) { ctx.courseState.set('componentTitle', String(props.title)); },
      suspend() { ctx.courseState.set('componentActivity', 'suspended'); },
      resume() { ctx.courseState.set('componentActivity', 'resumed'); },
      prepareCapture() { ctx.courseState.set('componentCapture', 'ready'); },
      destroy() { ctx.courseState.set('componentDestroyed', 'yes'); }
    };
  }
});`

function phaserPackage(): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 4,
      runtimeApiVersion: 4,
      id: 'component.phaser-v9',
      name: 'Phaser V9',
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

function slideLayerContainer(): { container: HTMLDivElement; nativeWrapper: HTMLDivElement } {
  const surface = document.createElement('section')
  surface.className = 'slide-surface'
  const nativeWrapper = document.createElement('div')
  nativeWrapper.dataset.layerItemId = 'native-target'
  nativeWrapper.dataset.layerKind = 'native'
  Object.assign(nativeWrapper.style, {
    position: 'absolute', left: '10px', top: '20px', width: '100px', height: '60px',
    opacity: '1', transform: '',
  })
  const runtimeWrapper = document.createElement('div')
  runtimeWrapper.dataset.layerItemId = 'hybrid-runtime'
  runtimeWrapper.dataset.layerKind = 'runtime'
  const container = document.createElement('div')
  container.className = 'slide-layer-content'
  runtimeWrapper.appendChild(container)
  surface.append(nativeWrapper, runtimeWrapper)
  return { container, nativeWrapper }
}

const HYBRID_RUNTIME_SOURCE = `
CoursewareRuntime.define({
  runtimeApiVersion: 2,
  create(ctx) {
    ctx.courseState.set('runtimeCreated', 'yes');
    const target = ctx.nodes.get('target');
    if (!target) throw new Error('migrated node binding was not bridged');
    target.root.setPosition(230, 140).setAngle(17).setAlpha(0.35).setVisible(false);
    const box = ctx.phaser.scene.add.rectangle(30, 20, 60, 40, 0xef4444);
    ctx.phaser.overlay.add(box);
    const marker = ctx.dom.overlay.ownerDocument.createElement('span');
    marker.dataset.hybridRuntime = 'mounted';
    marker.textContent = ctx.content.get('title');
    ctx.dom.overlay.appendChild(marker);
    ctx.actions.nextScene();
    return {
      resize(width, height) { ctx.courseState.set('runtimeSize', width + 'x' + height); },
      suspend() { ctx.courseState.set('runtimeActivity', 'suspended'); },
      resume() { ctx.courseState.set('runtimeActivity', 'resumed'); },
      prepareCapture() { ctx.courseState.set('runtimeCapture', 'ready'); },
      destroy() { ctx.courseState.set('runtimeDestroyed', 'yes'); }
    };
  }
});`

function hybridRuntimeItem(): RuntimeLayerItem {
  return {
    layerItemId: 'hybrid-runtime',
    label: 'Hybrid Runtime',
    kind: 'runtime',
    frame: { mode: 'absolute', x: 0, y: 0, width: 400, height: 240 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'legacy-runtime-v2',
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'hybrid',
      source: HYBRID_RUNTIME_SOURCE,
      content: { values: { title: '混合运行时' } },
      assets: {},
      nodeBindings: { target: 'native-target' },
    },
  }
}

function publishedPayload(): PublishedCourseV2Payload {
  return {
    format: 'h5course-published',
    formatVersion: 2,
    sourceSchemaVersion: 9,
    courseId: 'legacy-v9-test',
    title: 'Legacy compatibility',
    assets: {},
    components: {},
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

const PUBLISHED_PHASER_COMPONENT_SOURCE = `
CoursewareComponent.define({
  id: 'component.phaser-v9', runtimeApiVersion: 4,
  create(ctx) {
    ctx.courseState.set('componentCreated', 'published');
    const box = ctx.phaser.scene.add.rectangle(20, 20, 40, 40, 0x16a34a);
    ctx.phaser.root.add(box);
    return {
      updateProps(props) { ctx.courseState.set('componentTitle', String(props.title)); },
      prepareCapture() { ctx.courseState.set('componentCapture', 'published'); },
      destroy() { ctx.courseState.set('componentDestroyed', 'published'); }
    };
  }
});`

function payloadWithPhaserComponent(): PublishedCourseV2Payload {
  const payload = publishedPayload()
  payload.components['component.phaser-v9@1.0.0'] = {
    id: 'component.phaser-v9',
    name: 'Published Phaser',
    version: '1.0.0',
    contentSha256: 'a'.repeat(64),
    apiVersion: 4,
    scopes: ['scene'],
    renderMode: 'phaser',
    code: encodeCode(PUBLISHED_PHASER_COMPONENT_SOURCE),
    assets: {},
  }
  return payload
}

describe('V9 legacy Phaser and Hybrid execution', () => {
  it('runs a Phaser Component in Course Studio and preserves inspect/update/destroy lifecycle', async () => {
    const courseState = state(
      'componentCreated', 'componentMode', 'componentTitle', 'componentActivity', 'componentDestroyed',
      'componentCapture',
    )
    const registry = new CourseEditorDynamicHostRegistry({
      courseState,
      events: new CourseEventBus(),
      navigation: {
        goToScene: () => true, next: () => true, previous: () => true,
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

    expect(courseState.get('componentCreated')).toBe('yes')
    expect(courseState.get('componentActivity')).toBe('resumed')
    expect(container.querySelector('.course-legacy-phaser-canvas')).not.toBeNull()

    await host.update?.(componentItem({ title: '已修改' }), mountContext(item, container))
    expect(courseState.get('componentTitle')).toBe('已修改')
    await host.setInspectionMode?.('inspect')
    expect(courseState.get('componentMode')).toBe('edit')
    const target = container.querySelector<HTMLElement>('[data-dynamic-hit-id]')
    expect(target).not.toBeNull()
    target?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(reportHit).toHaveBeenCalledWith(expect.objectContaining({ field: 'props/title' }))
    expect(await host.capture?.({ purpose: 'authoring' })).toMatchObject({ format: 'html' })
    expect(courseState.get('componentCapture')).toBe('ready')

    await host.destroy?.()
    expect(courseState.get('componentDestroyed')).toBe('yes')
    expect(container.querySelector('.course-legacy-phaser-canvas')).toBeNull()
    registry.dispose()
  })

  it('runs a Hybrid legacy Runtime in Course Studio without leaving its item root', async () => {
    const courseState = state('runtimeCreated', 'runtimeSize', 'runtimeActivity', 'runtimeDestroyed', 'runtimeCapture')
    const next = vi.fn(() => true)
    const registry = new CourseEditorDynamicHostRegistry({
      courseState,
      events: new CourseEventBus(),
      navigation: {
        goToScene: () => true, next, previous: () => true, replay: () => true,
        restart: () => true, setPresentationState: () => true,
        presentationState: () => ({ current: null, states: [] }),
      },
      resolveProjectAsset: () => undefined,
      resolveComponent: () => undefined,
    })
    const item = hybridRuntimeItem()
    const host = registry.runtimeHost(item)
    const { container, nativeWrapper } = slideLayerContainer()
    await host.mount(mountContext(item, container))
    await host.activate?.()

    expect(courseState.get('runtimeCreated')).toBe('yes')
    expect(next).toHaveBeenCalledOnce()
    expect(container.querySelector('.course-legacy-runtime-dom-overlay .lesson-runtime-mount')).not.toBeNull()
    expect(nativeWrapper.style.left).toBe('180px')
    expect(nativeWrapper.style.top).toBe('110px')
    expect(nativeWrapper.style.transform).toBe('rotate(17deg)')
    expect(nativeWrapper.style.opacity).toBe('0.35')
    expect(nativeWrapper.style.visibility).toBe('hidden')

    await host.setInspectionMode?.('inspect')
    expect(courseState.get('runtimeActivity')).toBe('suspended')
    expect(await host.capture?.({ purpose: 'authoring' })).toMatchObject({ format: 'html' })
    expect(courseState.get('runtimeCapture')).toBe('ready')
    await host.destroy?.()
    expect(courseState.get('runtimeDestroyed')).toBe('yes')
    expect(nativeWrapper.style.left).toBe('10px')
    expect(nativeWrapper.style.top).toBe('20px')
    expect(nativeWrapper.style.visibility).toBe('')
    registry.dispose()
  })

  it('runs a Phaser Component from Published Course V2 code and updates it in place', async () => {
    const courseState = state('componentCreated', 'componentTitle', 'componentDestroyed', 'componentCapture')
    const registry = new PublishedDynamicHostRegistry({
      payload: payloadWithPhaserComponent(),
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
    expect(courseState.get('componentCreated')).toBe('published')
    expect(container.querySelector('.course-legacy-phaser-canvas')).not.toBeNull()

    await host.update?.(componentItem({ title: '发布态更新' }), mountContext(item, container))
    expect(courseState.get('componentTitle')).toBe('发布态更新')
    expect(await host.capture?.({ purpose: 'export' })).toMatchObject({ format: 'html' })
    expect(courseState.get('componentCapture')).toBe('published')
    await host.destroy?.()
    expect(courseState.get('componentDestroyed')).toBe('published')
    registry.dispose()
  })

  it('runs a Hybrid legacy Runtime in Published Course V2 with Phaser, DOM, actions and lifecycle', async () => {
    const courseState = state('runtimeCreated', 'runtimeSize', 'runtimeActivity', 'runtimeDestroyed', 'runtimeCapture')
    const navigation = {
      goToScene: vi.fn(), next: vi.fn(), previous: vi.fn(), replay: vi.fn(), restart: vi.fn(),
      setPresentationState: vi.fn(), presentationState: () => ({ current: null, states: [] }),
    }
    const registry = new PublishedDynamicHostRegistry({
      payload: publishedPayload(),
      courseState,
      events: new CourseEventBus(),
      navigation,
    })
    const item = hybridRuntimeItem()
    const host = registry.runtimeHost(item)
    const { container, nativeWrapper } = slideLayerContainer()
    await host.mount(mountContext(item, container))
    await host.activate?.()

    expect(courseState.get('runtimeCreated')).toBe('yes')
    expect(courseState.get('runtimeActivity')).toBe('resumed')
    expect(navigation.next).toHaveBeenCalledOnce()
    expect(nativeWrapper.style.left).toBe('180px')
    expect(nativeWrapper.style.top).toBe('110px')
    expect(nativeWrapper.style.visibility).toBe('hidden')
    const runtimeMarker = [...container.querySelectorAll<HTMLElement>('.lesson-runtime-mount')]
      .map((mount) => mount.shadowRoot?.querySelector('[data-hybrid-runtime="mounted"]'))
      .find(Boolean)
    expect(runtimeMarker).toHaveTextContent('混合运行时')

    const resized = hybridRuntimeItem()
    resized.frame.width = 640
    resized.frame.height = 360
    await host.update?.(resized, mountContext(resized, container))
    expect(courseState.get('runtimeSize')).toBe('640x360')
    await host.suspend?.()
    expect(courseState.get('runtimeActivity')).toBe('suspended')
    await host.resume?.()
    expect(courseState.get('runtimeActivity')).toBe('resumed')
    expect(await host.capture?.({ purpose: 'export' })).toMatchObject({ format: 'html' })
    expect(courseState.get('runtimeCapture')).toBe('ready')

    await host.destroy?.()
    expect(courseState.get('runtimeDestroyed')).toBe('yes')
    expect(container.querySelector('.course-legacy-phaser-canvas')).toBeNull()
    expect(nativeWrapper.style.left).toBe('10px')
    expect(nativeWrapper.style.top).toBe('20px')
    expect(nativeWrapper.style.visibility).toBe('')
    registry.dispose()
  })
})
