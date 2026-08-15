import { describe, expect, it, vi } from 'vitest'
import type {
  ComponentLayerItem,
  LayerItem,
  LayerItemBase,
  NativeLayerItem,
  RuntimeLayerItem,
  SlideSurfaceDocument,
} from '../../src/shared/courseProjectTypes'
import type { TeacherControllerAction } from '../../src/shared/projectTypes'
import type { RuntimeHostActions } from '../../src/shared/runtimeTypes'
import { CourseEventBus } from '../../src/player/CourseEventBus'
import {
  SlideSurfaceHost,
  type SlideItemHost,
  type SlideItemMountContext,
} from '../../src/player/surfaces/slide/SlideSurfaceHost'

function layerBase(id: string, order: number, frame: Partial<LayerItemBase['frame']> = {}): LayerItemBase {
  return {
    layerItemId: id,
    label: id,
    frame: {
      mode: 'absolute',
      x: 20,
      y: 20,
      width: 200,
      height: 100,
      ...frame,
    },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
  }
}

function textItem(id: string, order: number, text = id): NativeLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'native',
    content: {
      nativeType: 'text',
      data: {
        text,
        runs: [],
        style: {
          fontFamily: 'sans-serif',
          fontSize: 24,
          color: '#172033',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          emphasis: false,
          highlightColor: null,
          align: 'left',
          verticalAlign: 'top',
          writingMode: 'horizontal',
          lineSpacing: 1.3,
          letterSpacing: 0,
          padding: 4,
          overflow: 'fixed',
          backgroundColor: '#ffffff',
          backgroundOpacity: 0,
          cornerRadius: 0,
        },
      },
    },
  }
}

function formulaItem(id: string, order: number): NativeLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'native',
    content: {
      nativeType: 'formula',
      data: {
        formulaId: 'formula.quadratic',
        accessibleText: 'x 的平方等于四',
        ast: {
          type: 'row',
          children: [
            { type: 'script', base: { type: 'token', value: 'x' }, superscript: { type: 'token', value: '2' } },
            { type: 'operator', value: '=' },
            { type: 'token', value: '4' },
          ],
        },
        style: { fontSize: 32, color: '#111827', align: 'center' },
      },
    },
  }
}

function imageItem(id: string, order: number): NativeLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'native',
    content: {
      nativeType: 'image',
      data: {
        assetId: 'image-asset',
        preserveAspectRatio: true,
        fit: 'contain',
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        cropX: 0.5,
        cropY: 0.5,
        flipX: false,
        flipY: false,
        cornerRadius: 8,
        feather: { amount: 0, mode: 'rectangle' },
        safeAreas: [],
      },
    },
  }
}

function videoItem(id: string, order: number): NativeLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'native',
    content: {
      nativeType: 'video',
      data: {
        assetId: 'video-asset',
        fit: 'cover',
        autoplay: false,
        loop: false,
        muted: true,
        volume: 0.5,
        playbackRate: 1,
        showControls: true,
        clickToToggle: false,
        startTime: 0,
        endTime: null,
        poster: { mode: 'image', time: 0, assetId: 'poster-asset' },
        backgroundAudioMode: 'none',
      },
    },
  }
}

function shapeItem(id: string, order: number): NativeLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'native',
    content: {
      nativeType: 'shape',
      data: {
        shapeType: 'diamond',
        style: {
          fillColor: '#dbeafe',
          fillOpacity: 1,
          borderColor: '#2563eb',
          borderOpacity: 1,
          borderWidth: 2,
          lineStyle: 'solid',
          cornerRadius: 0,
          startArrow: 'none',
          endArrow: 'none',
        },
      },
    },
  }
}

function controllerItem(id: string, order: number): NativeLayerItem {
  return {
    ...layerBase(id, order, { x: 820, y: 640, width: 420, height: 60 }),
    kind: 'native',
    content: {
      nativeType: 'teacher-controller',
      data: {
        title: '教师控制器',
        showSceneProgress: true,
        compact: true,
        collapsible: false,
        defaultCollapsed: false,
        buttons: [
          {
            id: 'mute',
            action: { type: 'audio.toggle-mute' },
            label: '静音',
            visible: true,
          },
        ],
        style: {
          backgroundColor: '#111827',
          backgroundOpacity: 0.9,
          accentColor: '#60a5fa',
          textColor: '#ffffff',
          cornerRadius: 12,
        },
        includeInStaticExports: false,
      },
    },
  }
}

function componentItem(id: string, order: number): ComponentLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'component',
    component: { packageId: `package.${id}`, version: '1.0.0' },
    props: { value: id },
    staticFallbackAssetId: 'component-fallback',
  }
}

function runtimeItem(id: string, order: number): RuntimeLayerItem {
  return {
    ...layerBase(id, order),
    kind: 'runtime',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: 'export default () => undefined',
      content: { values: {} },
      assets: {},
      staticFallback: { assetId: 'runtime-fallback', coverage: 'scene' },
    },
  }
}

function slide(items: LayerItem[]): SlideSurfaceDocument {
  return {
    id: 'slide-surface',
    type: 'slide',
    title: '统一图层测试',
    canvas: { width: 1280, height: 720 },
    surfaceLayerItems: [],
    scenes: [{
      id: 'scene-1',
      name: '场景一',
      backgroundColor: '#ffffff',
      layerItems: items,
      interactions: [],
    }],
  }
}

function services() {
  return {
    navigate: vi.fn(),
    getCourseState: vi.fn(),
    setCourseState: vi.fn(),
    resolveAsset: (id: string) => `asset://${id}`,
    reportDiagnostic: vi.fn(),
  }
}

function mountContext(container: HTMLElement, service = services()) {
  return {
    surfaceId: 'slide-surface',
    container,
    services: service,
    signal: new AbortController().signal,
  }
}

class ProbeHost implements SlideItemHost<ComponentLayerItem | RuntimeLayerItem> {
  readonly calls: string[] = []
  element: HTMLElement | null = null
  context: SlideItemMountContext | null = null
  constructor(readonly id: string, private readonly lifecycleLog: string[] = []) {}

  mount(context: SlideItemMountContext): void {
    this.context = context
    this.calls.push('mount')
    this.lifecycleLog.push(`mount:${this.id}`)
    this.element = context.container.ownerDocument.createElement('div')
    this.element.dataset.probeId = this.id
    this.element.textContent = `live:${this.id}`
    this.element.style.position = 'fixed'
    context.container.appendChild(this.element)
  }
  update(item: ComponentLayerItem | RuntimeLayerItem): void {
    this.calls.push('update')
    this.lifecycleLog.push(`update:${this.id}`)
    if (this.element) this.element.textContent = `updated:${item.label}`
  }
  activate(): void { this.calls.push('activate'); this.lifecycleLog.push(`activate:${this.id}`) }
  suspend(): void { this.calls.push('suspend'); this.lifecycleLog.push(`suspend:${this.id}`) }
  resume(): void { this.calls.push('resume'); this.lifecycleLog.push(`resume:${this.id}`) }
  reset(): void { this.calls.push('reset'); this.lifecycleLog.push(`reset:${this.id}`) }
  setInspectionMode(mode: 'playback' | 'inspect'): void {
    this.calls.push(`inspect:${mode}`)
    this.lifecycleLog.push(`inspect:${mode}:${this.id}`)
  }
  capture(): { format: 'html'; content: string } {
    this.calls.push('capture')
    this.lifecycleLog.push(`capture:${this.id}`)
    return { format: 'html', content: `<span data-captured-id="${this.id}">capture</span>` }
  }
  destroy(): void { this.calls.push('destroy'); this.lifecycleLog.push(`destroy:${this.id}`) }
}

function directOrder(root: HTMLElement): string[] {
  return Array.from(root.children).map((element) => (element as HTMLElement).dataset.layerItemId!)
}

function controlMediaPlayback(element: HTMLMediaElement, initiallyPlaying: boolean) {
  let paused = !initiallyPlaying
  Object.defineProperty(element, 'paused', { configurable: true, get: () => paused })
  Object.defineProperty(element, 'ended', { configurable: true, get: () => false })
  const pause = vi.fn(() => { paused = true })
  const play = vi.fn(() => { paused = false; return Promise.resolve() })
  Object.defineProperty(element, 'pause', { configurable: true, value: pause })
  Object.defineProperty(element, 'play', { configurable: true, value: play })
  return { pause, play }
}

function controlRootAnimation(root: HTMLElement) {
  let playState: AnimationPlayState = 'running'
  const animation = {
    get playState() { return playState },
    pending: false,
    pause: vi.fn(() => { playState = 'paused' }),
    play: vi.fn(() => { playState = 'running' }),
  } as unknown as Animation
  Object.defineProperty(root, 'getAnimations', {
    configurable: true,
    value: vi.fn(() => [animation]),
  })
  return animation
}

describe('SlideSurfaceHost unified compositor', () => {
  it('interleaves Native, multiple Runtime instances, Component and controller in one DOM paint order', async () => {
    const runtimeHosts = new Map<string, ProbeHost>()
    const componentHosts = new Map<string, ProbeHost>()
    const document = slide([
      runtimeItem('runtime-b', 3),
      textItem('native-title', 0, '二次函数'),
      runtimeItem('runtime-a', 1),
    ])
    document.surfaceLayerItems = [
      {
        item: componentItem('component', 2),
        visibility: { mode: 'all', locationIds: [] },
      },
      {
        item: controllerItem('controller', 5),
        visibility: { mode: 'include', locationIds: ['location-scene-1'] },
      },
    ]
    const host = new SlideSurfaceHost(document, {
      globalLayerItems: [{
        item: runtimeItem('runtime-global', 4),
        visibility: { mode: 'all', locationIds: [] },
      }],
      runtimeHostFactory: (item) => {
        const probe = new ProbeHost(item.layerItemId)
        runtimeHosts.set(item.layerItemId, probe)
        return probe
      },
      componentHostFactory: (item) => {
        const probe = new ProbeHost(item.layerItemId)
        componentHosts.set(item.layerItemId, probe)
        return probe
      },
      resolveLocationId: (sceneId) => `location-${sceneId}`,
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()

    const root = host.rootElement!
    expect(directOrder(root)).toEqual([
      'native-title',
      'runtime-a',
      'component',
      'runtime-b',
      'runtime-global',
      'controller',
    ])
    expect(runtimeHosts.size).toBe(3)
    expect(componentHosts.size).toBe(1)
    expect(root.children).toHaveLength(6)
    expect(root.querySelectorAll(':scope > .slide-layer-item')).toHaveLength(6)
    expect(root.querySelectorAll(':scope > [data-runtime-plane], :scope > iframe')).toHaveLength(0)
    expect(root.querySelector('[data-layer-item-id="runtime-b"]')).toHaveStyle({ contain: 'layout paint style' })
    expect(root.lastElementChild).toHaveAttribute('data-layer-item-id', 'controller')
    expect(root.lastElementChild).toHaveTextContent('教师控制器')
    expect(runtimeHosts.get('runtime-a')?.calls).toContain('activate')
    expect(runtimeHosts.get('runtime-b')?.calls).toContain('activate')
  })

  it('applies named-state ordering through sparse scene slots without crossing global layers', async () => {
    const document = slide([textItem('scene-a', 0), textItem('scene-b', 10)])
    document.scenes[0]!.presentation = {
      initialStateId: 'review-order',
      states: [{
        id: 'review-order',
        name: '复核顺序',
        layerItemOverrides: {},
        layerItemOrder: ['scene-b', 'scene-a'],
      }],
    }
    const host = new SlideSurfaceHost(document, {
      globalLayerItems: [{
        item: textItem('global-middle', 5),
        visibility: { mode: 'all', locationIds: [] },
      }],
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))

    expect(directOrder(host.rootElement!)).toEqual([
      'scene-b',
      'global-middle',
      'scene-a',
    ])
    expect([...host.rootElement!.children].map((element) => (
      (element as HTMLElement).dataset.layerOrder
    ))).toEqual(['0', '5', '10'])
  })

  it('reorders and updates existing hosts without remounting them', async () => {
    const probes = new Map<string, ProbeHost>()
    const source = slide([runtimeItem('runtime-a', 0), componentItem('component', 1), runtimeItem('runtime-b', 2)])
    const host = new SlideSurfaceHost(source, {
      runtimeHostFactory: (item) => {
        const probe = new ProbeHost(item.layerItemId)
        probes.set(item.layerItemId, probe)
        return probe
      },
      componentHostFactory: (item) => {
        const probe = new ProbeHost(item.layerItemId)
        probes.set(item.layerItemId, probe)
        return probe
      },
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))
    const originalWrapper = host.rootElement!.querySelector('[data-layer-item-id="runtime-a"]')

    const updated = structuredClone(source)
    updated.scenes[0]!.layerItems[0]!.order = 2
    updated.scenes[0]!.layerItems[0]!.label = 'runtime-a-updated'
    updated.scenes[0]!.layerItems[1]!.order = 0
    updated.scenes[0]!.layerItems[2]!.order = 1
    await host.updateDocument(updated)

    expect(directOrder(host.rootElement!)).toEqual(['component', 'runtime-b', 'runtime-a'])
    expect(host.rootElement!.querySelector('[data-layer-item-id="runtime-a"]')).toBe(originalWrapper)
    expect(probes.get('runtime-a')?.calls).toEqual(['mount', 'update'])
    expect(probes.get('component')?.calls).toEqual(['mount', 'update'])
    expect(probes.get('runtime-b')?.calls).toEqual(['mount', 'update'])
  })

  it('uses the paint list in reverse for hits and ignores pass-through layers', async () => {
    const bottom = textItem('bottom', 0)
    const middle = runtimeItem('middle', 1)
    const top = componentItem('top', 2)
    top.hitPolicy = 'pass-through'
    const hits = vi.fn()
    const runtimeProbe = new ProbeHost('middle')
    const host = new SlideSurfaceHost(slide([top, bottom, middle]), {
      onLayerHit: hits,
      runtimeHostFactory: () => runtimeProbe,
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))

    expect(host.hitStack(40, 40).map((hit) => hit.layerItemId)).toEqual(['middle', 'bottom'])
    expect(host.hitTest(40, 40)).toMatchObject({ layerItemId: 'middle', order: 1 })
    const text = host.rootElement!.querySelector('[data-layer-item-id="bottom"] .slide-native-text')!
    text.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(hits).toHaveBeenCalledWith(expect.objectContaining({
      surfaceId: 'slide-surface',
      sceneId: 'scene-1',
      layerItemId: 'bottom',
      kind: 'native',
    }))
    await host.setInspectionMode('inspect')
    text.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    expect(hits).toHaveBeenLastCalledWith(expect.objectContaining({
      layerItemId: 'bottom',
      field: 'content.data.text',
    }))
    runtimeProbe.context!.reportHit({ field: 'content.values.prompt', hitId: 'runtime-local-text' })
    expect(hits).toHaveBeenLastCalledWith(expect.objectContaining({
      layerItemId: 'middle',
      field: 'content.values.prompt',
      hitId: 'runtime-local-text',
    }))
  })

  it('keeps playback-hidden items hidden when inspecting the frozen frame', async () => {
    const hidden = textItem('hidden-until-revealed', 0)
    hidden.playbackInitialVisibility = 'hidden'
    const host = new SlideSurfaceHost(slide([hidden]))
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()
    const wrapper = host.rootElement!.querySelector<HTMLElement>(
      '[data-layer-item-id="hidden-until-revealed"]',
    )!
    expect(wrapper.hidden).toBe(true)
    await host.setInspectionMode('inspect')
    expect(wrapper.hidden).toBe(true)
    expect(host.rootElement!.querySelector('[data-layer-item-id="hidden-until-revealed"]')).toBe(wrapper)
  })

  it('keeps the current runtime DOM while entering inspect mode and preserves canonical capture order', async () => {
    const lifecycle: string[] = []
    const probes = new Map<string, ProbeHost>()
    const host = new SlideSurfaceHost(slide([
      runtimeItem('runtime-a', 0),
      componentItem('component', 1),
      runtimeItem('runtime-b', 2),
    ]), {
      runtimeHostFactory: (item) => {
        const probe = new ProbeHost(item.layerItemId, lifecycle)
        probes.set(item.layerItemId, probe)
        return probe
      },
      componentHostFactory: (item) => {
        const probe = new ProbeHost(item.layerItemId, lifecycle)
        probes.set(item.layerItemId, probe)
        return probe
      },
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()
    const runtimeDom = probes.get('runtime-a')!.element!
    runtimeDom.textContent = 'interaction checkpoint'

    await host.setInspectionMode('inspect')
    expect(probes.get('runtime-a')!.element).toBe(runtimeDom)
    expect(runtimeDom).toHaveTextContent('interaction checkpoint')
    expect(host.rootElement).toHaveAttribute('data-inspection-mode', 'inspect')
    expect(probes.get('runtime-a')?.calls.filter((call) => call === 'mount')).toHaveLength(1)

    lifecycle.length = 0
    const capture = await host.capture({ purpose: 'authoring' })
    expect(lifecycle).toEqual(['capture:runtime-a', 'capture:component', 'capture:runtime-b'])
    expect(capture.content.indexOf('data-captured-id="runtime-a"'))
      .toBeLessThan(capture.content.indexOf('data-captured-id="component"'))
    expect(capture.content.indexOf('data-captured-id="component"'))
      .toBeLessThan(capture.content.indexOf('data-captured-id="runtime-b"'))

    await host.suspend()
    await host.resume()
    await host.reset('surface')
    await host.destroy()
    for (const probe of probes.values()) {
      expect(probe.calls).toEqual(expect.arrayContaining(['suspend', 'resume', 'reset', 'destroy']))
    }
  })

  it('preserves runtime-authored wrapper geometry across playback and inspect mode changes', async () => {
    const host = new SlideSurfaceHost(slide([textItem('runtime-moved-native', 0)]))
    const container = document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()
    await host.setInspectionMode('playback')
    const wrapper = host.rootElement!.querySelector<HTMLElement>(
      '[data-layer-item-id="runtime-moved-native"]',
    )!
    wrapper.style.left = '246px'
    wrapper.style.top = '138px'
    wrapper.style.width = '420px'
    wrapper.style.height = '96px'
    wrapper.style.transform = 'rotate(13deg)'
    wrapper.style.opacity = '0.63'
    wrapper.style.visibility = 'hidden'

    await host.setInspectionMode('inspect')
    expect(host.rootElement!.querySelector('[data-layer-item-id="runtime-moved-native"]')).toBe(wrapper)
    expect(wrapper.style.cssText).toContain('left: 246px')
    expect(wrapper.style.cssText).toContain('top: 138px')
    expect(wrapper.style.cssText).toContain('width: 420px')
    expect(wrapper.style.cssText).toContain('height: 96px')
    expect(wrapper.style.transform).toBe('rotate(13deg)')
    expect(wrapper.style.opacity).toBe('0.63')
    expect(wrapper.style.visibility).toBe('hidden')

    await host.setInspectionMode('playback')
    expect(host.rootElement!.querySelector('[data-layer-item-id="runtime-moved-native"]')).toBe(wrapper)
    expect(wrapper.style.left).toBe('246px')
    expect(wrapper.style.top).toBe('138px')
    expect(wrapper.style.transform).toBe('rotate(13deg)')
    expect(wrapper.style.opacity).toBe('0.63')
    expect(wrapper.style.visibility).toBe('hidden')
    await host.destroy()
  })

  it('settles live capture hooks before cloning DOM and materializes the current Canvas bitmap', async () => {
    const currentPixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zc4sAAAAASUVORK5CYII='
    class CurrentFrameHost implements SlideItemHost<RuntimeLayerItem> {
      marker: HTMLSpanElement | null = null
      canvas: HTMLCanvasElement | null = null

      mount(context: SlideItemMountContext<RuntimeLayerItem>): void {
        this.marker = context.container.ownerDocument.createElement('span')
        this.marker.dataset.capturePhase = 'before'
        this.marker.textContent = 'before prepareCapture'
        this.canvas = context.container.ownerDocument.createElement('canvas')
        this.canvas.width = 1
        this.canvas.height = 1
        this.canvas.dataset.pixelPhase = 'before'
        this.canvas.toDataURL = vi.fn(() => (
          this.canvas?.dataset.pixelPhase === 'after'
            ? currentPixelPng
            : 'data:image/png;base64,c3RhbGU='
        ))
        context.container.append(this.marker, this.canvas)
      }

      capture(): void {
        this.marker!.dataset.capturePhase = 'after'
        this.marker!.textContent = 'after prepareCapture'
        this.canvas!.dataset.pixelPhase = 'after'
      }
    }

    const current = new CurrentFrameHost()
    const host = new SlideSurfaceHost(slide([runtimeItem('runtime-current-frame', 0)]), {
      runtimeHostFactory: () => current,
    })
    const container = document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()

    const capture = await host.capture({ purpose: 'export' })
    const template = document.createElement('template')
    template.innerHTML = capture.content
    const clonedContent = template.content.querySelector<HTMLElement>('.slide-layer-content')!
    expect(clonedContent.querySelector('[data-capture-phase="after"]')?.textContent).toBe('after prepareCapture')
    expect(clonedContent.querySelector('canvas')).toBeNull()
    expect(clonedContent.querySelector<HTMLImageElement>('img[data-capture-canvas="true"]')?.src).toBe(currentPixelPng)
    expect(current.canvas?.toDataURL).toHaveBeenCalledWith('image/png')
    expect(current.marker).toHaveTextContent('after prepareCapture')
    expect(current.canvas?.dataset.pixelPhase).toBe('after')

    await host.destroy()
  })

  it('freezes Native media and host animations in inspect without replacing or rewinding DOM', async () => {
    const host = new SlideSurfaceHost(slide([
      videoItem('playing-video', 0),
      videoItem('already-paused-video', 1),
    ]))
    const container = document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()
    const root = host.rootElement!
    const [playing, alreadyPaused] = [...root.querySelectorAll<HTMLVideoElement>('.slide-native-video')]
    playing!.currentTime = 12.5
    const playingControl = controlMediaPlayback(playing!, true)
    const pausedControl = controlMediaPlayback(alreadyPaused!, false)
    const animation = controlRootAnimation(root)

    await host.setInspectionMode('inspect')
    expect(playingControl.pause).toHaveBeenCalledOnce()
    expect(pausedControl.pause).not.toHaveBeenCalled()
    expect(animation.pause).toHaveBeenCalledOnce()
    expect(root.querySelector('.slide-native-video')).toBe(playing)
    expect(playing!.currentTime).toBe(12.5)
    alreadyPaused!.dispatchEvent(new Event('play'))
    expect(pausedControl.pause).toHaveBeenCalledOnce()

    await host.setInspectionMode('playback')
    expect(playingControl.play).toHaveBeenCalledOnce()
    expect(pausedControl.play).not.toHaveBeenCalled()
    expect(animation.play).toHaveBeenCalledOnce()
    expect(root.querySelector('.slide-native-video')).toBe(playing)
    expect(playing!.currentTime).toBe(12.5)

    await host.suspend()
    expect(playingControl.pause).toHaveBeenCalledTimes(2)
    expect(animation.pause).toHaveBeenCalledTimes(2)
    await host.resume()
    expect(playingControl.play).toHaveBeenCalledTimes(2)
    expect(pausedControl.play).not.toHaveBeenCalled()
    expect(animation.play).toHaveBeenCalledTimes(2)
    expect(root.querySelector('.slide-native-video')).toBe(playing)
    await host.destroy()
  })

  it('isolates factory, mount and activate failures while healthy runtimes remain live', async () => {
    const healthy = new ProbeHost('healthy')
    const mountFailure: SlideItemHost<RuntimeLayerItem> = {
      mount: () => { throw new Error('mount failure') },
      destroy: vi.fn(),
    }
    const activateFailure: SlideItemHost<RuntimeLayerItem> = {
      mount: (context) => { context.container.textContent = 'mounted before activation' },
      activate: () => { throw new Error('activate failure') },
      destroy: vi.fn(),
    }
    const service = services()
    const host = new SlideSurfaceHost(slide([
      runtimeItem('factory-failure', 0),
      runtimeItem('mount-failure', 1),
      runtimeItem('activate-failure', 2),
      runtimeItem('healthy', 3),
    ]), {
      runtimeHostFactory: (item) => {
        if (item.layerItemId === 'factory-failure') throw new Error('factory failure')
        if (item.layerItemId === 'mount-failure') return mountFailure
        if (item.layerItemId === 'activate-failure') return activateFailure
        return healthy
      },
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container, service))
    await host.activate()

    expect(healthy.calls).toEqual(['mount', 'activate'])
    expect(host.rootElement!.querySelectorAll('[data-host-error="true"]')).toHaveLength(3)
    expect(host.rootElement!.querySelector('[data-layer-item-id="healthy"]')).toHaveTextContent('live:healthy')
    expect(service.reportDiagnostic).toHaveBeenCalledTimes(3)
    expect(service.reportDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      surfaceId: 'slide-surface',
      severity: 'error',
    }))
  })

  it('renders every Native carrier as readable, accessible DOM', async () => {
    const actions: TeacherControllerAction[] = []
    const host = new SlideSurfaceHost(slide([
      textItem('text', 0, '可编辑文字'),
      formulaItem('formula', 1),
      imageItem('image', 2),
      shapeItem('shape', 3),
      videoItem('video', 4),
      controllerItem('controller', 5),
    ]), {
      onTeacherControllerAction: (action) => actions.push(action),
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))

    const text = host.rootElement!.querySelector<HTMLElement>('[data-native-type="text"]')!
    expect(text).toHaveTextContent('可编辑文字')
    expect(Number.parseFloat(text.style.lineHeight)).toBeCloseTo(30.58)
    expect(text.style.flexDirection).toBe('column')
    expect(host.rootElement!.querySelector('[data-native-type="formula"]')).toHaveAttribute('role', 'math')
    expect(host.rootElement!.querySelector('[data-native-type="formula"]')).toHaveAttribute('aria-label', 'x 的平方等于四')
    expect(host.rootElement!.querySelector('[data-native-type="formula"] svg')).toHaveAttribute('aria-label', 'x 的平方等于四')
    expect(host.rootElement!.querySelectorAll('[data-native-type="formula"] svg text').length).toBeGreaterThan(1)
    expect(host.rootElement!.querySelector('img[data-asset-id="image-asset"]')).toHaveAttribute('alt', 'image')
    expect(host.rootElement!.querySelector('[data-native-type="shape"]')).toHaveAttribute('aria-label', 'shape')
    expect(host.rootElement!.querySelector('[data-native-type="shape"] svg polygon')).not.toBeNull()
    expect(host.rootElement!.querySelector('video[data-asset-id="video-asset"]')).toHaveAttribute('controls')
    ;(host.rootElement!.querySelector('[data-controller-button-id="mute"]') as HTMLButtonElement).click()
    expect(actions).toEqual([{ type: 'audio.toggle-mute' }])
  })

  it('allows an asynchronous navigation guard to block teacher-controller side effects', async () => {
    const controller = controllerItem('controller', 1)
    if (controller.content.nativeType !== 'teacher-controller') throw new Error('expected controller')
    controller.content.data.buttons = [{
      id: 'next',
      action: { type: 'scene.next' },
      label: '下一场景',
      visible: true,
    }]
    const document = slide([textItem('first', 0), controller])
    document.scenes.push({
      id: 'scene-2',
      name: '场景二',
      backgroundColor: '#ffffff',
      layerItems: [textItem('second', 0)],
      interactions: [],
    })
    const before = vi.fn(async () => false)
    const after = vi.fn()
    const host = new SlideSurfaceHost(document, {
      beforeTeacherControllerAction: before,
      onTeacherControllerAction: after,
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))
    ;(host.rootElement!.querySelector('[data-controller-button-id="next"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(before).toHaveBeenCalledWith(
      { type: 'scene.next' },
      expect.objectContaining({ layerItemId: 'controller' }),
    ))
    expect(host.sceneId).toBe('scene-1')
    expect(after).not.toHaveBeenCalled()
  })
})

describe('SlideSurfaceHost scene interactions', () => {
  function interactionHostActions(overrides: Partial<RuntimeHostActions> = {}): RuntimeHostActions {
    return {
      goToScene: vi.fn(() => true),
      nextScene: vi.fn(() => true),
      previousScene: vi.fn(() => true),
      replayScene: vi.fn(() => true),
      restartCourse: vi.fn(() => true),
      ...overrides,
    }
  }

  function interactiveDocument(): SlideSurfaceDocument {
    const document = slide([textItem('click-target', 0), textItem('passive', 1)])
    const scene = document.scenes[0]!
    scene.presentation = {
      initialStateId: 'base',
      states: [
        { id: 'base', name: '基础', layerItemOverrides: {} },
        { id: 'revealed', name: '揭示', layerItemOverrides: { passive: { visible: false } } },
      ],
    }
    scene.interactions = [{
      id: 'reveal-on-click',
      enabled: true,
      trigger: { type: 'node.click', nodeId: 'click-target' },
      conditions: [{ type: 'presentation.in', stateIds: ['base'] }],
      actions: [{
        id: 'reveal-step',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'presentation.set', stateId: 'revealed' },
      }],
    }]
    return document
  }

  function wrapperOf(host: SlideSurfaceHost, layerItemId: string): HTMLElement {
    const wrapper = host.rootElement!.querySelector<HTMLElement>(
      `.slide-layer-item[data-layer-item-id="${layerItemId}"]`,
    )
    if (!wrapper) throw new Error(`missing wrapper for ${layerItemId}`)
    return wrapper
  }

  function pointerUp(element: HTMLElement): void {
    element.dispatchEvent(new Event('pointerup', { bubbles: true }))
  }

  it('executes a conditioned node.click rule on the stable layer item and tears down on destroy', async () => {
    const events = new CourseEventBus()
    const host = new SlideSurfaceHost(interactiveDocument(), {
      interactions: { events, hostActions: interactionHostActions() },
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()

    const target = wrapperOf(host, 'click-target')
    expect(target.style.cursor).toBe('pointer')
    expect(wrapperOf(host, 'passive').style.cursor).toBe('')
    expect(host.stateId).toBe('base')

    pointerUp(target)
    await vi.waitFor(() => expect(host.stateId).toBe('revealed'))
    expect(wrapperOf(host, 'passive').hidden).toBe(true)

    // The presentation.in condition no longer matches, so re-clicking is a no-op.
    pointerUp(target)
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(host.stateId).toBe('revealed')

    await host.destroy()
    expect(events.listenerCount()).toBe(0)
    pointerUp(target)
    expect(host.stateId).toBe('revealed')
  })

  it('rebuilds subscriptions on scene switch and runs the entered scene’s scene.enter rules', async () => {
    const document = interactiveDocument()
    document.scenes.push({
      id: 'scene-2',
      name: '场景二',
      backgroundColor: '#ffffff',
      layerItems: [textItem('scene-2-target', 0)],
      interactions: [{
        id: 'scene-2-entry',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [{
          id: 'mark-entered',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'presentation.set', stateId: 'entered' },
        }],
      }],
      presentation: {
        initialStateId: 'initial',
        states: [
          { id: 'initial', name: '初始', layerItemOverrides: {} },
          { id: 'entered', name: '已进入', layerItemOverrides: {} },
        ],
      },
    })
    const events = new CourseEventBus()
    const host = new SlideSurfaceHost(document, {
      interactions: { events, hostActions: interactionHostActions() },
    })
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()
    const mountedListeners = events.listenerCount()
    expect(mountedListeners).toBeGreaterThan(0)

    await host.setScene('scene-2')
    expect(events.listenerCount()).toBe(mountedListeners)
    await vi.waitFor(() => expect(host.stateId).toBe('entered'))

    // The previous scene's click binding is gone with its records and engine.
    pointerUp(wrapperOf(host, 'scene-2-target'))
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(host.stateId).toBe('entered')

    await host.destroy()
    expect(events.listenerCount()).toBe(0)
  })

  it('stays inert without an interaction session', async () => {
    const events = new CourseEventBus()
    const host = new SlideSurfaceHost(interactiveDocument())
    const container = window.document.createElement('div')
    await host.mount(mountContext(container))
    await host.activate()

    const target = wrapperOf(host, 'click-target')
    expect(target.style.cursor).toBe('')
    pointerUp(target)
    await new Promise((resolve) => { setTimeout(resolve, 10) })
    expect(host.stateId).toBe('base')
    expect(events.listenerCount()).toBe(0)

    await host.destroy()
  })
})
