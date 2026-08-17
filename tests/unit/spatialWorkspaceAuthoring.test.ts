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
  panCamera,
  screenControlRect,
  worldGroupTransform,
  zoomCameraAt,
} from '../../src/renderer/ui/spatialWorkspaceAuthoring'
import {
  SpatialWorkspace,
  type SpatialWorkspaceScreenController,
} from '../../src/renderer/ui/SpatialWorkspace'

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

function createScreenController(): SpatialWorkspaceScreenController {
  return {
    source: 'global',
    layerItemId: 'global-controller',
    label: '教师控制器',
    title: '课堂导航',
    compact: false,
    locked: false,
    opacity: 1,
    frame: { x: 120, y: 42, width: 300, height: 72, rotation: 0 },
  }
}

function createSpatialWithCameraFrames(items: LayerItem[]): SpatialSurfaceDocument {
  const spatial = createSpatial(items)
  return {
    ...spatial,
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [
        { id: 'half', name: '缩小', x: 10, y: 20, zoom: 0.5 },
        { id: 'one', name: '正常', x: 80, y: 20, zoom: 1 },
        { id: 'double', name: '放大', x: 200, y: 50, zoom: 2 },
      ],
    },
  }
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

  it('keeps the global controller as a fixed screen layer across 0.5/1/2 cameras and pan', () => {
    const spatial = createSpatialWithCameraFrames([
      createWorldText('world-title', '世界文字', 100, 80),
    ])
    const screenController = createScreenController()
    const screenRects: Array<Record<string, string>> = []
    const worldRects: Array<Record<string, string>> = []

    for (const frameId of ['half', 'one', 'double']) {
      const { container, unmount } = render(h(SpatialWorkspace, {
        spatial,
        viewportSize: { width: 800, height: 500 },
        activeCameraFrameId: frameId,
        selectedLayerItemIds: ['world-title'],
        screenController,
        selectedScreenControllerTarget: {
          source: 'global',
          layerItemId: screenController.layerItemId,
        },
        onSelect: vi.fn(),
        onTransformEnd: vi.fn(),
      }))
      const controller = container.querySelector('[data-testid="spatial-screen-controller"]')
      const screenSelection = container.querySelector('[data-testid="spatial-screen-selection"]')
      const worldSelection = container.querySelector(
        '[data-testid="spatial-selection"][data-layer-item-id="world-title"]',
      )
      const world = container.querySelector('[data-spatial-world]')
      const minimap = container.querySelector('[data-testid="spatial-minimap"]')

      expect(controller).not.toBeNull()
      expect(screenSelection).not.toBeNull()
      expect(worldSelection).not.toBeNull()
      expect(world).not.toBeNull()
      expect(minimap).not.toBeNull()
      expect(world!.querySelector('[data-layer-item-id="global-controller"]')).toBeNull()
      expect(minimap!.querySelector('[data-layer-item-id="global-controller"]')).toBeNull()
      expect(world!.contains(controller!)).toBe(false)
      expect(controller).toHaveAttribute('data-layer-source', 'global')
      expect(controller).toHaveAttribute('data-layer-item-id', 'global-controller')

      screenRects.push({
        left: (controller as HTMLElement).style.left,
        top: (controller as HTMLElement).style.top,
        width: (controller as HTMLElement).style.width,
        height: (controller as HTMLElement).style.height,
      })
      worldRects.push({
        left: (worldSelection as HTMLElement).style.left,
        top: (worldSelection as HTMLElement).style.top,
        width: (worldSelection as HTMLElement).style.width,
        height: (worldSelection as HTMLElement).style.height,
      })
      unmount()
    }

    expect(screenRects).toEqual([
      { left: '120px', top: '42px', width: '300px', height: '72px' },
      { left: '120px', top: '42px', width: '300px', height: '72px' },
      { left: '120px', top: '42px', width: '300px', height: '72px' },
    ])
    expect(new Set(worldRects.map((rect) => JSON.stringify(rect))).size).toBe(3)
  })

  it('focuses the fixed screen controller for a locate request without moving the camera', () => {
    const spatial = createSpatialWithCameraFrames([])
    const screenController = createScreenController()
    const { container } = render(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      activeCameraFrameId: 'double',
      screenController,
      selectedScreenControllerTarget: {
        source: 'global',
        layerItemId: screenController.layerItemId,
      },
      controllerLocateRequest: {
        layerItemId: screenController.layerItemId,
        requestId: 1,
      },
      onSelect: vi.fn(),
      onTransformEnd: vi.fn(),
    }))

    const root = container.querySelector('[data-testid="spatial-workspace"]')!
    const controller = container.querySelector('[data-testid="spatial-screen-controller"]')!
    expect(document.activeElement).toBe(controller)
    expect(root).toHaveAttribute('data-camera-x', '200')
    expect(root).toHaveAttribute('data-camera-y', '50')
    expect(root).toHaveAttribute('data-camera-zoom', '2')
  })

  it('writes one global screen-controller transform on pointer up without writing a world item', () => {
    const spatial = createSpatialWithCameraFrames([
      createWorldText('world-title', '世界文字', 100, 80),
    ])
    const onSelect = vi.fn()
    const onTransformEnd = vi.fn()
    const onSelectScreenController = vi.fn()
    const onScreenControllerTransformEnd = vi.fn()
    const screenController = createScreenController()
    const { container } = render(h(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 800, height: 500 },
      activeCameraFrameId: 'double',
      screenController,
      onSelect,
      onTransformEnd,
      onSelectScreenController,
      onScreenControllerTransformEnd,
    }))
    const root = container.querySelector('[data-testid="spatial-workspace"]')!
    const controller = container.querySelector('[data-testid="spatial-screen-controller"]')!

    fireEvent.pointerDown(controller, {
      pointerId: 13,
      button: 0,
      buttons: 1,
      clientX: 250,
      clientY: 90,
    })
    fireEvent.pointerMove(root, {
      pointerId: 13,
      button: 0,
      buttons: 1,
      clientX: 290,
      clientY: 115,
    })
    fireEvent.pointerUp(root, { pointerId: 13, button: 0 })

    expect(onSelectScreenController).toHaveBeenCalledTimes(1)
    expect(onSelectScreenController).toHaveBeenCalledWith({
      source: 'global',
      layerItemId: 'global-controller',
    })
    expect(onScreenControllerTransformEnd).toHaveBeenCalledTimes(1)
    expect(onScreenControllerTransformEnd).toHaveBeenCalledWith({
      source: 'global',
      layerItemId: 'global-controller',
      x: 160,
      y: 67,
      width: 300,
      height: 72,
      rotation: 0,
    })
    expect(onTransformEnd).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })
})
