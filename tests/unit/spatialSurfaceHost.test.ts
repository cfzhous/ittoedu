import { describe, expect, it, vi } from 'vitest'
import {
  SpatialSurfaceHost,
  type SpatialSurfaceDocument,
} from '@/player/surfaces'
import type { SlideItemHost } from '@/player/surfaces/slide/SlideSurfaceHost'
import type {
  ComponentLayerItem,
  LayerItem,
  NativeLayerItem,
} from '@/shared/courseProjectTypes'

const services = {
  navigate: vi.fn(),
  getCourseState: vi.fn(),
  setCourseState: vi.fn(),
  resolveAsset: (assetId: string) => `asset://${assetId}`,
  reportDiagnostic: vi.fn(),
}

function baseItem(
  layerItemId: string,
  label: string,
  frame: { x: number; y: number; width: number; height: number },
  order: number,
): LayerItem {
  return {
    layerItemId,
    label,
    frame: { mode: 'absolute', ...frame },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
  } as LayerItem
}

function textItem(
  layerItemId: string,
  label: string,
  frame: { x: number; y: number; width: number; height: number },
  order: number,
): NativeLayerItem {
  return {
    ...baseItem(layerItemId, label, frame, order),
    kind: 'native',
    content: {
      nativeType: 'text',
      data: {
        text: label,
        runs: [],
        style: {
          fontFamily: 'sans-serif',
          fontSize: 18,
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
          lineSpacing: 1.2,
          letterSpacing: 0,
          padding: 0,
          overflow: 'fixed',
          backgroundColor: '#ffffff',
          backgroundOpacity: 0,
          cornerRadius: 0,
        },
      },
    },
  }
}

function teacherControllerItem(
  layerItemId: string,
  frame: { x: number; y: number; width: number; height: number },
  order: number,
): NativeLayerItem {
  return {
    ...baseItem(layerItemId, `教师控制器-${layerItemId}`, frame, order),
    kind: 'native',
    content: {
      nativeType: 'teacher-controller',
      data: {
        title: '课堂导航',
        compact: false,
        showSceneProgress: false,
        collapsible: true,
        defaultCollapsed: false,
        buttons: [
          { id: 'prev', action: { type: 'scene.previous' } as const, label: '上一步', visible: true },
          { id: 'next', action: { type: 'scene.next' } as const, label: '下一步', visible: true },
          { id: 'mute', action: { type: 'audio.toggle-mute' } as const, label: '静音', visible: true },
        ],
        style: {
          backgroundColor: '#0b1720',
          backgroundOpacity: 0.9,
          accentColor: '#d9bf73',
          textColor: '#f3eee0',
          cornerRadius: 8,
        },
        includeInStaticExports: false,
      },
    },
  }
}

function spatialDocument(): SpatialSurfaceDocument {
  return {
    id: 'spatial-map',
    type: 'spatial-2d',
    title: '知识地图',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'infinite' },
      layerItems: [
        textItem('world-text', '世界文本', { x: -60, y: -20, width: 120, height: 40 }, 0),
      ],
    },
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [{ id: 'detail', name: '细节', x: 120, y: 40, zoom: 2 }],
    },
    semanticZoom: [],
  }
}

function mountOptions(container: HTMLElement, signal = new AbortController().signal) {
  return {
    surfaceId: 'spatial-map',
    container,
    services,
    signal,
  }
}

describe('SpatialSurfaceHost screen-space and teacher-controller contract', () => {
  it('keeps global/surface teacher controllers and session chrome outside the camera-transformed world group', async () => {
    const spatial = spatialDocument()
    const surfaceController = teacherControllerItem(
      'surface-controller',
      { x: 24, y: 24, width: 180, height: 48 },
      5,
    )
    const globalController = teacherControllerItem(
      'global-controller',
      { x: 24, y: 180, width: 180, height: 48 },
      6,
    )
    spatial.surfaceLayerItems = [
      { item: surfaceController, visibility: { mode: 'all', locationIds: [] } },
    ]

    const container = document.createElement('div')
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      globalLayerItems: [
        { item: globalController, visibility: { mode: 'all', locationIds: [] } },
      ],
    })
    await host.mount(mountOptions(container))
    await host.activate()

    const root = container.querySelector<HTMLElement>('.spatial-surface')!
    const world = root.querySelector<SVGGElement>('[data-spatial-world]')!
    const screenLayer = root.querySelector<HTMLElement>('.spatial-screen-layer')!
    const surfaceWrapper = screenLayer.querySelector<HTMLElement>('[data-layer-item-id="surface-controller"]')!
    const globalWrapper = screenLayer.querySelector<HTMLElement>('[data-layer-item-id="global-controller"]')!
    const worldWrapper = world.querySelector<SVGGElement>('[data-layer-item-id="world-text"]')!

    expect(worldWrapper).not.toBeNull()
    expect(surfaceWrapper.parentElement).toBe(screenLayer)
    expect(globalWrapper.parentElement).toBe(screenLayer)
    expect(world.contains(surfaceWrapper)).toBe(false)
    expect(world.contains(globalWrapper)).toBe(false)
    expect(world.contains(worldWrapper)).toBe(true)

    const surfaceBefore = {
      left: surfaceWrapper.style.left,
      top: surfaceWrapper.style.top,
      width: surfaceWrapper.style.width,
      height: surfaceWrapper.style.height,
    }
    const globalBefore = {
      left: globalWrapper.style.left,
      top: globalWrapper.style.top,
      width: globalWrapper.style.width,
      height: globalWrapper.style.height,
    }

    for (const zoom of [0.5, 1, 2]) {
      await host.setCamera({ ...host.camera, zoom })
      expect(surfaceWrapper.style.left).toBe(surfaceBefore.left)
      expect(surfaceWrapper.style.top).toBe(surfaceBefore.top)
      expect(surfaceWrapper.style.width).toBe(surfaceBefore.width)
      expect(surfaceWrapper.style.height).toBe(surfaceBefore.height)
      expect(globalWrapper.style.left).toBe(globalBefore.left)
      expect(globalWrapper.style.top).toBe(globalBefore.top)
      expect(globalWrapper.style.width).toBe(globalBefore.width)
      expect(globalWrapper.style.height).toBe(globalBefore.height)
      expect(world.getAttribute('transform')).toContain(`scale(${zoom})`)
    }

    await host.setCamera({ ...host.camera, zoom: 1, x: 130, y: -70 })
    expect(surfaceWrapper.style.left).toBe(surfaceBefore.left)
    expect(surfaceWrapper.style.top).toBe(surfaceBefore.top)
    expect(globalWrapper.style.left).toBe(globalBefore.left)
    expect(globalWrapper.style.top).toBe(globalBefore.top)
    expect(world.getAttribute('transform')).toContain('translate(-130 70)')

    await host.destroy()
  })

  it('hides authored controllers in playback when playbackControls is none and restores them in inspect', async () => {
    const spatial = spatialDocument()
    const controller = teacherControllerItem(
      'surface-controller',
      { x: 24, y: 24, width: 180, height: 48 },
      5,
    )
    spatial.surfaceLayerItems = [
      { item: controller, visibility: { mode: 'all', locationIds: [] } },
    ]

    const container = document.createElement('div')
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      playbackControls: 'none',
    })
    await host.mount(mountOptions(container))
    await host.activate()

    const wrapper = container.querySelector<HTMLElement>('.spatial-screen-layer [data-layer-item-id="surface-controller"]')!
    expect(wrapper.hidden).toBe(true)

    await host.setInspectionMode('inspect')
    expect(wrapper.hidden).toBe(false)

    await host.destroy()
  })

  it('seeds muted teacher-controller status from initialMuted', async () => {
    const spatial = spatialDocument()
    const controller = teacherControllerItem(
      'surface-controller',
      { x: 24, y: 24, width: 180, height: 48 },
      5,
    )
    spatial.surfaceLayerItems = [
      { item: controller, visibility: { mode: 'all', locationIds: [] } },
    ]

    const container = document.createElement('div')
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      initialMuted: true,
    })
    await host.mount(mountOptions(container))
    await host.activate()

    const muteButton = container.querySelector<HTMLButtonElement>('.spatial-screen-layer [data-controller-button-id="mute"]')!
    expect(muteButton.textContent).toContain('关')

    await host.destroy()
  })

  it('routes teacher-controller clicks through the single-owner executor and dispatches the courseware custom event', async () => {
    const spatial = spatialDocument()
    const controller = teacherControllerItem(
      'surface-controller',
      { x: 24, y: 24, width: 180, height: 48 },
      5,
    )
    spatial.surfaceLayerItems = [
      { item: controller, visibility: { mode: 'all', locationIds: [] } },
    ]

    const execute = vi.fn().mockResolvedValue(undefined)
    const before = vi.fn()
    const onAction = vi.fn()
    const container = document.createElement('div')
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      executeTeacherControllerAction: execute,
      beforeTeacherControllerAction: before,
      onTeacherControllerAction: onAction,
    })
    await host.mount(mountOptions(container))
    await host.activate()
    const root = container.querySelector<HTMLElement>('.spatial-surface')!
    const event = vi.fn()
    root.addEventListener('courseware:teacher-controller-action', event)

    const button = root.querySelector<HTMLButtonElement>('.spatial-screen-layer [data-controller-button-id="prev"]')!
    button.click()
    await Promise.resolve()
    await Promise.resolve()

    expect(execute).toHaveBeenCalledOnce()
    expect(execute).toHaveBeenCalledWith({ type: 'scene.previous' }, expect.objectContaining({
      layerItemId: 'surface-controller',
      kind: 'native',
    }))
    expect(before).not.toHaveBeenCalled()
    expect(onAction).not.toHaveBeenCalled()
    expect(event).toHaveBeenCalledOnce()
    expect((event.mock.calls[0]![0] as CustomEvent).detail).toEqual({ type: 'scene.previous' })

    await host.destroy()
  })

  it('captures mounted dynamic hosts through host.capture instead of the static placeholder', async () => {
    const spatial = spatialDocument()
    const component: ComponentLayerItem = {
      ...baseItem('live-component', '实时组件', { x: -60, y: -40, width: 120, height: 80 }, 1),
      kind: 'component',
      component: { packageId: 'component.test', version: '1.0.0' },
      props: {},
    }
    spatial.world.layerItems.push(component)

    const probe: SlideItemHost<ComponentLayerItem> = {
      mount: vi.fn(),
      activate: vi.fn(),
      destroy: vi.fn(),
      capture: vi.fn().mockReturnValue({
        format: 'html',
        content: '<button data-captured="1">captured-button</button>',
        warnings: ['probe capture warning'],
      }),
    }

    const container = document.createElement('div')
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      showControls: false,
      showMinimap: false,
      componentHostFactory: () => probe,
    })
    await host.mount(mountOptions(container))
    await host.activate()

    const captured = await host.capture({ purpose: 'thumbnail' })
    expect(captured.format).toBe('svg')
    expect(captured.content).toContain('foreignObject')
    expect(captured.content).toContain('data-captured="1"')
    expect(captured.content).toContain('captured-button')
    expect(captured.content).not.toContain('互动组件：component.test')
    expect(captured.warnings).toContain('probe capture warning')

    const parsed = new DOMParser().parseFromString(captured.content, 'image/svg+xml')
    expect(parsed.querySelector('foreignObject [data-captured="1"]')).not.toBeNull()
    expect(parsed.querySelector('[data-layer-item-id="live-component"]')).not.toBeNull()

    await host.destroy()
  })

  it('ignores document pointermove after suspend so Mixed leave cannot pan the camera', async () => {
    const spatial = spatialDocument()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, {
      showControls: false,
      showMinimap: false,
    })
    await host.mount(mountOptions(container))
    await host.activate()

    const root = container.querySelector<HTMLElement>('.spatial-surface')!
    const before = { ...host.camera }
    root.dispatchEvent(new PointerEvent('pointerdown', {
      button: 0,
      pointerId: 11,
      clientX: 40,
      clientY: 40,
      bubbles: true,
    }))
    document.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 11,
      clientX: 120,
      clientY: 40,
      bubbles: true,
    }))
    await Promise.resolve()
    await Promise.resolve()
    expect(host.camera.x).not.toBe(before.x)

    const suspended = { ...host.camera }
    await host.suspend()
    document.dispatchEvent(new PointerEvent('pointermove', {
      pointerId: 11,
      clientX: 220,
      clientY: 80,
      bubbles: true,
    }))
    await Promise.resolve()
    await Promise.resolve()
    expect(host.camera).toEqual(suspended)

    await host.destroy()
    container.remove()
  })
})
