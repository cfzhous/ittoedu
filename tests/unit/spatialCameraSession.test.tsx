import { act, fireEvent, render } from '@testing-library/react'
import { createElement as h } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  SpatialSurfaceDocument,
} from '../../src/shared/courseProjectTypes'
import { SpatialWorkspace } from '../../src/renderer/ui/SpatialWorkspace'

function createSpatial(): SpatialSurfaceDocument {
  return {
    type: 'spatial-2d',
    id: 'spatial-camera-session',
    title: '测试空间',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'infinite' },
      layerItems: [],
    },
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [
        { id: 'frame-1', name: '近景', x: 100, y: 200, zoom: 2 },
        { id: 'frame-2', name: '全景', x: 300, y: 400, zoom: 1.5 },
      ],
    },
    semanticZoom: [],
  }
}

function renderWorkspace(overrides: Partial<Parameters<typeof SpatialWorkspace>[0]> = {}) {
  const spatial = createSpatial()
  const onCameraChange = vi.fn()
  const onSelect = vi.fn()
  const onTransformEnd = vi.fn()
  const view = render(h(SpatialWorkspace, {
    spatial,
    viewportSize: { width: 800, height: 500 },
    onSelect,
    onTransformEnd,
    onCameraChange,
    ...overrides,
  }))
  const root = view.container.querySelector('[data-testid="spatial-workspace"]')!
  return { ...view, root, spatial, onCameraChange, onSelect, onTransformEnd }
}

function mockRequestAnimationFrame() {
  let callback: FrameRequestCallback | null = null
  const raf = vi.fn((next: FrameRequestCallback): number => {
    callback = next
    return 1
  })
  const caf = vi.fn()
  vi.stubGlobal('requestAnimationFrame', raf)
  vi.stubGlobal('cancelAnimationFrame', caf)
  return {
    raf,
    caf,
    flush: (time = 0): void => {
      const next = callback
      callback = null
      if (next) next(time)
    },
  }
}

function cameraPose(x: number, y: number, zoom: number) {
  return { x, y, zoom }
}

describe('SpatialWorkspace session camera', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('moves the session camera from one persisted frame to another exactly once', () => {
    const onCameraChange = vi.fn()
    const onSelect = vi.fn()
    const onTransformEnd = vi.fn()
    const spatial = createSpatial()
    const { container, rerender } = render(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      activeCameraFrameId: 'frame-1',
      onSelect,
      onTransformEnd,
      onCameraChange,
    }))

    const root = container.querySelector('[data-testid="spatial-workspace"]')!
    expect(root.getAttribute('data-camera-x')).toBe('100')
    expect(root.getAttribute('data-camera-y')).toBe('200')
    expect(root.getAttribute('data-camera-zoom')).toBe('2')

    rerender(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      activeCameraFrameId: 'frame-2',
      onSelect,
      onTransformEnd,
      onCameraChange,
    }))

    expect(root.getAttribute('data-camera-x')).toBe('300')
    expect(root.getAttribute('data-camera-y')).toBe('400')
    expect(root.getAttribute('data-camera-zoom')).toBe('1.5')
    expect(onCameraChange).toHaveBeenCalledTimes(1)
    expect(onCameraChange).toHaveBeenCalledWith(cameraPose(300, 400, 1.5))
    expect(onTransformEnd).not.toHaveBeenCalled()
  })

  it('emits a debounced onCameraChange after wheel zoom but not before the frame flush', async () => {
    const raf = mockRequestAnimationFrame()
    const { root, onCameraChange, onSelect, onTransformEnd } = renderWorkspace()

    root.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 500,
      right: 800,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }) as DOMRect

    fireEvent.wheel(root, { deltaY: -100, clientX: 400, clientY: 250 })

    expect(Number(root.getAttribute('data-camera-zoom'))).toBeCloseTo(Math.exp(0.15), 10)
    expect(onCameraChange).not.toHaveBeenCalled()

    await act(async () => {
      raf.flush()
    })

    expect(onCameraChange).toHaveBeenCalledTimes(1)
    expect(onCameraChange.mock.calls[0]?.[0].zoom).toBeCloseTo(Math.exp(0.15), 10)
    expect(onCameraChange.mock.calls[0]?.[0].x).toBeCloseTo(0, 10)
    expect(onCameraChange.mock.calls[0]?.[0].y).toBeCloseTo(0, 10)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onTransformEnd).not.toHaveBeenCalled()
  })

  it('emits onCameraChange for zoom buttons and reset/home without touching project callbacks', () => {
    const { container, onCameraChange, onTransformEnd } = renderWorkspace()
    const root = container.querySelector('[data-testid="spatial-workspace"]')!
    const zoomIn = container.querySelector('button[aria-label="放大视图"]')!
    const reset = container.querySelector('button[aria-label="回到总览"]')!

    fireEvent.click(zoomIn)
    expect(root.getAttribute('data-camera-zoom')).toBe('1.25')
    expect(onCameraChange).toHaveBeenCalledTimes(1)
    expect(onCameraChange).toHaveBeenCalledWith(cameraPose(0, 0, 1.25))

    fireEvent.click(reset)
    expect(root.getAttribute('data-camera-zoom')).toBe('1')
    expect(onCameraChange).toHaveBeenCalledTimes(2)
    expect(onCameraChange).toHaveBeenLastCalledWith(cameraPose(0, 0, 1))
    expect(onTransformEnd).not.toHaveBeenCalled()
  })

  it('emits onCameraChange only at pointer pan end, not during transient moves', () => {
    const { container, onCameraChange, onTransformEnd } = renderWorkspace()
    const root = container.querySelector('[data-testid="spatial-workspace"]')!

    fireEvent.pointerDown(root, { pointerId: 1, button: 0, buttons: 1, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(root, { pointerId: 1, button: 0, buttons: 1, clientX: 200, clientY: 150 })

    expect(root.getAttribute('data-camera-x')).toBe('-100')
    expect(root.getAttribute('data-camera-y')).toBe('-50')
    expect(onCameraChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(root, { pointerId: 1, button: 0, clientX: 200, clientY: 150 })

    expect(onCameraChange).toHaveBeenCalledTimes(1)
    expect(onCameraChange).toHaveBeenCalledWith(cameraPose(-100, -50, 1))
    expect(onTransformEnd).not.toHaveBeenCalled()
  })

  it('does not emit onCameraChange from prop-only rerenders', () => {
    const onCameraChange = vi.fn()
    const onSelect = vi.fn()
    const onTransformEnd = vi.fn()
    const spatial = createSpatial()
    const props = {
      spatial,
      viewportSize: { width: 800, height: 500 },
      activeCameraFrameId: 'frame-1',
      onSelect,
      onTransformEnd,
      onCameraChange,
    }

    const { rerender } = render(h(SpatialWorkspace, props))

    rerender(h(SpatialWorkspace, {
      ...props,
      spatial: {
        ...spatial,
        camera: {
          home: { ...spatial.camera.home },
          frames: spatial.camera.frames.map((frame) => ({ ...frame })),
        },
      },
    }))
    rerender(h(SpatialWorkspace, {
      ...props,
      viewportSize: { width: 900, height: 600 },
    }))

    expect(onCameraChange).not.toHaveBeenCalled()
  })
})
