import { describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import {
  SpatialSurfaceHost,
  type SpatialSurfaceDocument,
} from '@/player/surfaces'
import type { LayerItem, NativeLayerItem } from '@/shared/courseProjectTypes'

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

function teacherControllerItem(
  layerItemId: string,
  frame: { x: number; y: number; width: number; height: number },
  order: number,
  overrides: {
    showSceneProgress?: boolean
    compact?: boolean
    collapsible?: boolean
    defaultCollapsed?: boolean
  } = {},
): NativeLayerItem {
  const {
    showSceneProgress = false,
    compact = false,
    collapsible = true,
    defaultCollapsed = false,
  } = overrides
  return {
    ...baseItem(layerItemId, `教师控制器-${layerItemId}`, frame, order),
    kind: 'native',
    content: {
      nativeType: 'teacher-controller',
      data: {
        title: '课堂导航',
        compact,
        showSceneProgress,
        collapsible,
        defaultCollapsed,
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
      layerItems: [],
    },
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [],
    },
    semanticZoom: [],
  }
}

function mountOptions(container: HTMLElement) {
  return {
    surfaceId: 'spatial-map',
    container,
    services,
    signal: new AbortController().signal,
  }
}

async function mountedHost(
  spatial: SpatialSurfaceDocument,
  options: ConstructorParameters<typeof SpatialSurfaceHost>[2],
) {
  const container = document.createElement('div')
  const host = new SpatialSurfaceHost(spatial, { width: 400, height: 240 }, options)
  await host.mount(mountOptions(container))
  await host.activate()
  return { container, host }
}

describe('SpatialSurfaceHost teacher-controller session controls', () => {
  it('subscribes to course audio:change and refreshes the mute label', async () => {
    const events = new CourseEventBus()
    const spatial = spatialDocument()
    const controller = teacherControllerItem(
      'surface-controller',
      { x: 24, y: 24, width: 180, height: 48 },
      5,
    )
    spatial.surfaceLayerItems = [
      { item: controller, visibility: { mode: 'all', locationIds: [] } },
    ]

    const { container, host } = await mountedHost(spatial, {
      initialMuted: false,
      audioChangeSource: events,
    })

    const muteButton = container.querySelector<HTMLButtonElement>(
      '.spatial-screen-layer [data-controller-button-id="mute"]',
    )!
    expect(muteButton.textContent).toContain('开')
    expect(events.listenerCount('audio:change')).toBe(1)

    events.emit('audio:change', { muted: true })

    const refreshedMuteButton = container.querySelector<HTMLButtonElement>(
      '.spatial-screen-layer [data-controller-button-id="mute"]',
    )!
    expect(refreshedMuteButton.textContent).toContain('关')
    expect(events.listenerCount('audio:change')).toBe(1)

    await host.destroy()
    expect(events.listenerCount('audio:change')).toBe(0)
  })

  it('renders teacher-controller progress from the course progress source', async () => {
    const spatial = spatialDocument()
    const controller = teacherControllerItem(
      'surface-controller',
      { x: 24, y: 24, width: 200, height: 56 },
      5,
      { showSceneProgress: true },
    )
    spatial.surfaceLayerItems = [
      { item: controller, visibility: { mode: 'all', locationIds: [] } },
    ]

    const locations = [
      { id: 'intro', name: '导入' },
      { id: 'explore', name: '探究' },
    ]
    let currentLocationId = 'intro'
    let stateLabel = '热身'

    const { container, host } = await mountedHost(spatial, {
      initialLocationId: 'intro',
      courseProgressSource: {
        getLocations: () => locations,
        getCurrentLocationId: () => currentLocationId,
        getStateLabel: () => stateLabel,
      },
    })

    const progress = container.querySelector<HTMLElement>(
      '.spatial-screen-layer .slide-teacher-controller-progress',
    )!
    expect(progress.textContent).toBe('1 / 2 · 导入 · 热身')

    currentLocationId = 'explore'
    stateLabel = '练习'
    await host.setLocationId('explore')

    const refreshedProgress = container.querySelector<HTMLElement>(
      '.spatial-screen-layer .slide-teacher-controller-progress',
    )!
    expect(refreshedProgress.textContent).toBe('2 / 2 · 探究 · 练习')

    await host.destroy()
  })

  it('rehydrates controller DOM from canonical session state after replay and restart', async () => {
    const spatial = spatialDocument()
    const controller = teacherControllerItem(
      'surface-controller',
      { x: 24, y: 24, width: 180, height: 48 },
      5,
      { collapsible: true, defaultCollapsed: false },
    )
    spatial.surfaceLayerItems = [
      { item: controller, visibility: { mode: 'all', locationIds: [] } },
    ]

    const { container, host } = await mountedHost(spatial, {
      initialLocationId: 'intro',
    })

    const wrapper = container.querySelector<HTMLElement>(
      '.spatial-screen-layer [data-layer-item-id="surface-controller"]',
    )!
    expect(wrapper.style.top).toBe('24px')
    expect(wrapper.style.left).toBe('24px')

    const nav = wrapper.querySelector<HTMLElement>('.slide-native-teacher-controller')!
    const collapseBefore = wrapper.querySelector<HTMLButtonElement>(
      '[data-teacher-controller-collapse]',
    )!
    expect(collapseBefore.textContent).toBe('收')

    // Move the controller through its own Alt+Arrow keyboard session gesture,
    // which persists to the canonical host-side session map.
    nav.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      altKey: true,
      bubbles: true,
      cancelable: true,
    }))
    expect(wrapper.style.top).toBe('32px')

    // Collapse the controller; the DOM collapses and the host map follows.
    collapseBefore.click()
    expect(wrapper.querySelector('[data-teacher-controller-collapse]')?.textContent).toBe('展')

    // Replay (`surface` reset) must rehydrate the DOM from the canonical
    // session, not from the stale creation-time seed.
    await host.reset('surface')
    expect(wrapper.querySelector('[data-teacher-controller-collapse]')?.textContent).toBe('展')
    expect(wrapper.style.top).toBe('32px')

    // Restart (`course` reset) clears session state and rehydrates defaults.
    await host.reset('course')
    expect(wrapper.querySelector('[data-teacher-controller-collapse]')?.textContent).toBe('收')
    expect(wrapper.style.top).toBe('24px')
    expect(wrapper.style.left).toBe('24px')

    await host.destroy()
  })
})
