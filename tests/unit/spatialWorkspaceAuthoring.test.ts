import { createElement as h } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { createTextNode } from '../../src/renderer/project/createProject'
import { sceneNodeToCourseLayerItem } from '../../src/shared/courseProjectModel'
import type {
  LayerItem,
  SpatialSurfaceDocument,
} from '../../src/shared/courseProjectTypes'
import {
  screenToWorld,
  spatialCameraFromPose,
  worldToScreen,
} from '../../src/player/surfaces/spatial/spatialModel'
import {
  clampZoom,
  fitWorkspaceCamera,
  panCamera,
  resetWorkspaceCamera,
  screenControlRect,
  worldGroupTransform,
  zoomCameraAt,
} from '../../src/renderer/ui/spatialWorkspaceAuthoring'
import { SpatialWorkspace } from '../../src/renderer/ui/SpatialWorkspace'

function createSpatial(items: LayerItem[]): SpatialSurfaceDocument {
  return {
    type: 'spatial-2d',
    id: 'spatial-test',
    title: '测试空间',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'infinite' },
      layerItems: items,
    },
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [],
    },
    semanticZoom: [],
  }
}

function createWorldText(
  id: string,
  name: string,
  x: number,
  y: number,
  width = 200,
  height = 60,
  order = 0,
): LayerItem {
  const item = sceneNodeToCourseLayerItem(createTextNode({
    id,
    name,
    text: `${name}的文字`,
    x,
    y,
    width,
    height,
  }), order)
  return item
}

function expectPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 10)
  expect(actual.y).toBeCloseTo(expected.y, 10)
}

describe('spatialWorkspaceAuthoring camera helpers', () => {
  it('clamps zoom to the teacher-safe session range', () => {
    expect(clampZoom(0.1)).toBe(0.25)
    expect(clampZoom(0.5)).toBe(0.5)
    expect(clampZoom(1)).toBe(1)
    expect(clampZoom(2)).toBe(2)
    expect(clampZoom(8)).toBe(4)
    expect(() => clampZoom(Number.NaN)).toThrow('缩放倍率')
    expect(() => clampZoom(0)).toThrow('缩放倍率')
  })

  it('keeps the anchored world point fixed while zooming at a cursor', () => {
    const camera = spatialCameraFromPose({ x: 120, y: 80, zoom: 1 }, { width: 800, height: 500 })
    const anchor = { x: 312, y: 194 }
    const before = screenToWorld(camera, anchor)
    const next = zoomCameraAt(camera, 2, anchor)
    const after = screenToWorld(next, anchor)
    expectPointClose(after, before)
    expect(next.zoom).toBe(2)
  })

  it('pans the camera in the opposite direction of the screen delta', () => {
    const camera = spatialCameraFromPose({ x: 0, y: 0, zoom: 2 }, { width: 800, height: 500 })
    const next = panCamera(camera, { x: 120, y: -40 })
    expectPointClose(next, { x: -60, y: 20 })
    expect(next.zoom).toBe(2)
  })

  it('matches worldGroupTransform to the SVG affine formula', () => {
    const camera = spatialCameraFromPose({ x: 130, y: 70, zoom: 2 }, { width: 800, height: 500 })
    expect(worldGroupTransform(camera)).toBe(
      'translate(400 250) scale(2) translate(-130 -70)',
    )
  })

  it('converts a world rect into the same screen rect the SVG group produces', () => {
    const frame = { x: 100, y: 60, width: 220, height: 120 }
    for (const zoom of [0.5, 1, 2]) {
      const camera = spatialCameraFromPose({ x: 140, y: 90, zoom }, { width: 800, height: 500 })
      const rect = screenControlRect(camera, frame)
      const topLeft = worldToScreen(camera, { x: frame.x, y: frame.y })
      expectPointClose(rect, topLeft)
      expect(rect.width).toBeCloseTo(frame.width * zoom, 10)
      expect(rect.height).toBeCloseTo(frame.height * zoom, 10)
    }
  })

  it('keeps world point -> screen point -> world point invariant after pan and zoom', () => {
    const camera = spatialCameraFromPose({ x: -35, y: 42, zoom: 1.75 }, { width: 900, height: 560 })
    const world = { x: 78, y: 123 }
    const screen = worldToScreen(camera, world)
    expectPointClose(screenToWorld(camera, screen), world)
  })
})

describe('SpatialWorkspace one-gesture callbacks', () => {
  it('click select calls onSelect once and never onTransformEnd', () => {
    const spatial = createSpatial([createWorldText('t1', '标题', 100, 80)])
    const onSelect = vi.fn()
    const onTransformEnd = vi.fn()
    const { container } = render(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      onSelect,
      onTransformEnd,
    }))
    const item = container.querySelector('[data-layer-item-id="t1"]')
    expect(item).not.toBeNull()
    fireEvent.pointerDown(item!, { pointerId: 1, button: 0, buttons: 1, clientX: 200, clientY: 110 })
    fireEvent.pointerUp(container.querySelector('[data-testid="spatial-workspace"]')!, { pointerId: 1, button: 0 })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(['t1'])
    expect(onTransformEnd).not.toHaveBeenCalled()
  })

  it('drag move selects once and commits transforms once per completed gesture', () => {
    const spatial = createSpatial([createWorldText('t1', '标题', 100, 80)])
    const onSelect = vi.fn()
    const onTransformEnd = vi.fn()
    const { container } = render(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      onSelect,
      onTransformEnd,
    }))
    const root = container.querySelector('[data-testid="spatial-workspace"]')!
    const item = container.querySelector('[data-layer-item-id="t1"]')!
    fireEvent.pointerDown(item, { pointerId: 7, button: 0, buttons: 1, clientX: 200, clientY: 110 })
    fireEvent.pointerMove(root, { pointerId: 7, button: 0, buttons: 1, clientX: 240, clientY: 130 })
    fireEvent.pointerUp(root, { pointerId: 7, button: 0 })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(['t1'])
    expect(onTransformEnd).toHaveBeenCalledTimes(1)
    expect(onTransformEnd).toHaveBeenCalledWith([
      expect.objectContaining({
        layerItemId: 't1',
        x: 140,
        y: 100,
        width: 200,
        height: 60,
        rotation: 0,
      }),
    ])
  })

  it('shift toggles a second item into the selection in one callback', () => {
    const spatial = createSpatial([
      createWorldText('t1', '第一项', 100, 80, 200, 60, 0),
      createWorldText('t2', '第二项', 300, 80, 200, 60, 1),
    ])
    const onSelect = vi.fn()
    const onTransformEnd = vi.fn()
    const { container } = render(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      selectedLayerItemIds: ['t1'],
      onSelect,
      onTransformEnd,
    }))
    const root = container.querySelector('[data-testid="spatial-workspace"]')!
    const item2 = container.querySelector('[data-layer-item-id="t2"]')!
    fireEvent.pointerDown(item2, { pointerId: 3, button: 0, buttons: 1, clientX: 400, clientY: 110, shiftKey: true })
    fireEvent.pointerUp(root, { pointerId: 3, button: 0 })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(['t1', 't2'])
    expect(onTransformEnd).not.toHaveBeenCalled()
  })

  it('keeps selection handles at a constant viewport size after zoom', () => {
    const spatial = createSpatial([createWorldText('t1', '标题', 100, 80)])
    const { container, rerender } = render(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      selectedLayerItemIds: ['t1'],
      onSelect: vi.fn(),
      onTransformEnd: vi.fn(),
    }))
    const handle = () => container.querySelector<HTMLButtonElement>('[data-spatial-handle="resize-se"]')!
    expect(handle().style.width).toBe('9px')
    expect(handle().style.height).toBe('9px')

    fireEvent.click(container.querySelector('button[aria-label="放大视图"]')!)
    expect(handle().style.width).toBe('9px')
    expect(handle().style.height).toBe('9px')
    void rerender
  })

  it('renders viewport overlays outside the world group and does not create world items on select', () => {
    const spatial = createSpatial([createWorldText('t1', '标题', 100, 80)])
    const onSelect = vi.fn()
    const onSelectViewportLayer = vi.fn()
    const { container } = render(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      viewportOverlays: [{
        source: 'global',
        layerItemId: 'global-controller',
        label: '教师控制器',
        frame: { x: 24, y: 24, width: 180, height: 48 },
        rotation: 0,
        locked: false,
        hidden: false,
      }],
      onSelect,
      onSelectViewportLayer,
      onTransformEnd: vi.fn(),
    }))
    const overlay = container.querySelector('[data-testid="spatial-viewport-overlay"]')!
    const world = container.querySelector('[data-spatial-world]')!
    expect(world.contains(overlay)).toBe(false)
    fireEvent.pointerDown(overlay, { pointerId: 2, button: 0, buttons: 1, clientX: 40, clientY: 40 })
    expect(onSelectViewportLayer).toHaveBeenCalledWith({
      layerItemId: 'global-controller',
      source: 'global',
    })
    expect(onSelect).not.toHaveBeenCalled()
    expect(spatial.world.layerItems.map((item) => item.layerItemId)).toEqual(['t1'])
    expect(spatial.camera.frames).toEqual([])
  })

  it('does not reset a switched camera frame back to home on a home-stable rerender', () => {
    const spatial = createSpatial([createWorldText('t1', '标题', 100, 80)])
    spatial.camera.frames = [
      { id: 'frame-1', name: '近景', x: 80, y: 90, zoom: 2 },
    ]
    const onCameraChange = vi.fn()
    const props = {
      spatial,
      viewportSize: { width: 800, height: 500 },
      onSelect: vi.fn(),
      onTransformEnd: vi.fn(),
      onCameraChange,
    }
    const { container, rerender } = render(h(SpatialWorkspace, {
      ...props,
      activeCameraFrameId: null,
    }))
    rerender(h(SpatialWorkspace, {
      ...props,
      activeCameraFrameId: 'frame-1',
    }))
    const root = container.querySelector('[data-testid="spatial-workspace"]')!
    expect(root.getAttribute('data-camera-x')).toBe('80')
    expect(root.getAttribute('data-camera-y')).toBe('90')
    expect(root.getAttribute('data-camera-zoom')).toBe('2')

    rerender(h(SpatialWorkspace, {
      ...props,
      activeCameraFrameId: 'frame-1',
      spatial: {
        ...spatial,
        camera: {
          home: { ...spatial.camera.home },
          frames: spatial.camera.frames.map((frame) => ({ ...frame })),
        },
      },
    }))
    expect(root.getAttribute('data-camera-x')).toBe('80')
    expect(root.getAttribute('data-camera-y')).toBe('90')
    expect(root.getAttribute('data-camera-zoom')).toBe('2')
  })

  it('fits and resets the session camera without writing world items', () => {
    const spatial = createSpatial([createWorldText('t1', '标题', 100, 80)])
    const fitted = fitWorkspaceCamera(spatial, { width: 800, height: 500 })
    expect(fitted.x).toBe(200)
    expect(fitted.y).toBe(110)
    expect(fitted.zoom).toBeGreaterThan(0)
    const reset = resetWorkspaceCamera(spatial, { width: 800, height: 500 })
    expect(reset).toMatchObject({ x: 0, y: 0, zoom: 1 })
  })
})
