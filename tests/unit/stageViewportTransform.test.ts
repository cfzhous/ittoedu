import { describe, expect, it } from 'vitest'
import {
  STAGE_VIEWPORT_HEIGHT,
  STAGE_VIEWPORT_MAX_ZOOM,
  STAGE_VIEWPORT_MIN_ZOOM,
  STAGE_VIEWPORT_WIDTH,
  clampStageViewportZoom,
  clientDeltaToWorld,
  clientRectToWorld,
  clientToWorld,
  createStageViewportTransform,
  rotatedRectIntersectsStage,
  resizeWorldFrameFromHandle,
  stageOverlayCssTransform,
  stageSelectionOverlayGeometry,
  worldDeltaToClient,
  worldRectToClient,
  worldToClient,
} from '../../src/renderer/authoring/stageViewportTransform'

function expectPointClose(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 10)
  expect(actual.y).toBeCloseTo(expected.y, 10)
}

function expectRectClose(
  actual: { x: number; y: number; width: number; height: number },
  expected: { x: number; y: number; width: number; height: number },
): void {
  expectPointClose(actual, expected)
  expect(actual.width).toBeCloseTo(expected.width, 10)
  expect(actual.height).toBeCloseTo(expected.height, 10)
}

describe('stage viewport transform', () => {
  it('uses the fixed Project V8 Slide design size and editor zoom range', () => {
    expect(STAGE_VIEWPORT_WIDTH).toBe(1280)
    expect(STAGE_VIEWPORT_HEIGHT).toBe(720)
    expect(STAGE_VIEWPORT_MIN_ZOOM).toBe(0.5)
    expect(STAGE_VIEWPORT_MAX_ZOOM).toBe(2)
  })

  it('fits by width and centers vertically in client space', () => {
    const transform = createStageViewportTransform({
      viewport: { x: 100, y: 50, width: 1440, height: 900 },
    })

    expect(transform.fitScale).toBe(1.125)
    expect(transform.zoom).toBe(1)
    expect(transform.scale).toBe(1.125)
    expectRectClose(transform.stageRect, {
      x: 100,
      y: 95,
      width: 1440,
      height: 810,
    })
  })

  it('fits by height and centers horizontally in client space', () => {
    const transform = createStageViewportTransform({
      viewport: { x: 20, y: 30, width: 1200, height: 600 },
    })

    expect(transform.fitScale).toBeCloseTo(5 / 6, 10)
    expectRectClose(transform.stageRect, {
      x: 86 + 2 / 3,
      y: 30,
      width: 1066 + 2 / 3,
      height: 600,
    })
  })

  it.each([0.5, 0.75, 1, 1.25, 1.5, 2])(
    'applies user zoom %s around the fitted stage center',
    (zoom) => {
      const viewport = { x: 40, y: 60, width: 1280, height: 720 }
      const transform = createStageViewportTransform({ viewport, zoom })

      expect(transform.fitScale).toBe(1)
      expect(transform.scale).toBe(zoom)
      expect(transform.stageRect.width).toBe(1280 * zoom)
      expect(transform.stageRect.height).toBe(720 * zoom)
      expectPointClose(
        {
          x: transform.stageRect.x + transform.stageRect.width / 2,
          y: transform.stageRect.y + transform.stageRect.height / 2,
        },
        { x: 680, y: 420 },
      )
    },
  )

  it('clamps zoom to the supported 50%-200% range', () => {
    expect(clampStageViewportZoom(0.1)).toBe(0.5)
    expect(clampStageViewportZoom(4)).toBe(2)
    expect(createStageViewportTransform({
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      zoom: 0.1,
    }).zoom).toBe(0.5)
  })

  it('applies pan in CSS pixels without changing scale or Project coordinates', () => {
    const base = createStageViewportTransform({
      viewport: { x: 10, y: 20, width: 1280, height: 720 },
      zoom: 1.5,
    })
    const panned = createStageViewportTransform({
      viewport: { x: 10, y: 20, width: 1280, height: 720 },
      zoom: 1.5,
      pan: { x: 137.25, y: -64.5 },
    })

    expect(panned.scale).toBe(base.scale)
    expect(panned.stageRect.width).toBe(base.stageRect.width)
    expect(panned.stageRect.height).toBe(base.stageRect.height)
    expect(panned.stageRect.x - base.stageRect.x).toBe(137.25)
    expect(panned.stageRect.y - base.stageRect.y).toBe(-64.5)
  })

  it('maps world points to expected client positions and back', () => {
    const transform = createStageViewportTransform({
      viewport: { x: 200, y: 100, width: 1600, height: 900 },
      zoom: 1.25,
      pan: { x: 48, y: -24 },
    })

    expect(transform.fitScale).toBe(1.25)
    expectRectClose(transform.stageRect, {
      x: 48,
      y: -36.5,
      width: 2000,
      height: 1125,
    })
    expectPointClose(worldToClient(transform, { x: 0, y: 0 }), { x: 48, y: -36.5 })
    expectPointClose(worldToClient(transform, { x: 640, y: 360 }), { x: 1048, y: 526 })
    expectPointClose(worldToClient(transform, { x: 1280, y: 720 }), { x: 2048, y: 1088.5 })
    expectPointClose(clientToWorld(transform, { x: 1048, y: 526 }), { x: 640, y: 360 })
  })

  it.each([
    { zoom: 0.5, pan: { x: 0, y: 0 } },
    { zoom: 1, pan: { x: 35.5, y: -72.25 } },
    { zoom: 1.35, pan: { x: -200, y: 140 } },
    { zoom: 2, pan: { x: 420, y: -310 } },
  ])('round-trips client and world points at zoom $zoom with pan $pan', ({ zoom, pan }) => {
    const transform = createStageViewportTransform({
      viewport: { x: 17.25, y: 43.75, width: 987, height: 653 },
      zoom,
      pan,
    })
    const worldPoints = [
      { x: 0, y: 0 },
      { x: 1280, y: 720 },
      { x: 483.125, y: 219.875 },
      { x: -42, y: 801 },
    ]

    for (const world of worldPoints) {
      expectPointClose(clientToWorld(transform, worldToClient(transform, world)), world)
    }

    const clientPoints = [
      { x: transform.stageRect.x, y: transform.stageRect.y },
      { x: 0, y: 0 },
      { x: 1833.25, y: -275.5 },
    ]
    for (const client of clientPoints) {
      expectPointClose(worldToClient(transform, clientToWorld(transform, client)), client)
    }
  })

  it('converts selection rectangles without losing their geometry', () => {
    const transform = createStageViewportTransform({
      viewport: { x: 45, y: 90, width: 1000, height: 760 },
      zoom: 1.6,
      pan: { x: -17, y: 28 },
    })
    const worldRect = { x: 56, y: 126, width: 1168, height: 426 }
    const clientRect = worldRectToClient(transform, worldRect)

    expect(clientRect.width).toBeCloseTo(worldRect.width * transform.scale, 10)
    expect(clientRect.height).toBeCloseTo(worldRect.height * transform.scale, 10)
    expectRectClose(clientRectToWorld(transform, clientRect), worldRect)
  })

  it('converts drag deltas using scale only, independent of viewport origin and pan', () => {
    const transform = createStageViewportTransform({
      viewport: { x: 500, y: 300, width: 1920, height: 1080 },
      zoom: 1.5,
      pan: { x: -250, y: 175 },
    })
    const worldDelta = { x: 24, y: -16 }
    const clientDelta = worldDeltaToClient(transform, worldDelta)

    expectPointClose(clientDelta, { x: 54, y: -36 })
    expectPointClose(clientDeltaToWorld(transform, clientDelta), worldDelta)
  })

  it('copies mutable inputs so later UI state changes cannot alter a transform', () => {
    const viewport = { x: 0, y: 0, width: 1280, height: 720 }
    const pan = { x: 10, y: 20 }
    const transform = createStageViewportTransform({ viewport, pan })

    viewport.width = 300
    pan.x = 900

    expect(transform.viewport.width).toBe(1280)
    expect(transform.pan.x).toBe(10)
    expect(transform.stageRect.x).toBe(10)
  })

  it('keeps edge targets when rotation brings their original bounds onto the stage', () => {
    const bounds = { x: -60, y: 180, width: 40, height: 200 }

    expect(rotatedRectIntersectsStage(bounds, 0)).toBe(false)
    expect(rotatedRectIntersectsStage(bounds, 90)).toBe(true)
    expect(rotatedRectIntersectsStage(
      { x: 1250, y: 680, width: 80, height: 80 },
      45,
    )).toBe(true)
    expect(rotatedRectIntersectsStage(
      { x: -400, y: 180, width: 40, height: 200 },
      90,
    )).toBe(false)
  })

  it.each([
    { viewport: { x: 0, y: 0, width: 0, height: 720 } },
    { viewport: { x: 0, y: 0, width: 1280, height: -1 } },
  ])('rejects non-positive viewport dimensions: $viewport', (options) => {
    expect(() => createStageViewportTransform(options)).toThrow(RangeError)
  })

  it('maps objects, selection box and eight handles through one viewport transform', () => {
    const transform = createStageViewportTransform({
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      zoom: 2,
    })
    const geometry = stageSelectionOverlayGeometry(transform, [
      { x: 100, y: 80, width: 200, height: 120 },
    ])
    expect(stageOverlayCssTransform(transform)).toContain('scale(2)')
    expect(geometry?.selectionBox).toEqual(geometry?.objects[0])
    expect(geometry?.handles.e.x).toBeGreaterThan(geometry!.handles.w.x)
    expect(geometry?.handles.s.y).toBeGreaterThan(geometry!.handles.n.y)
    const west = resizeWorldFrameFromHandle(
      { x: 100, y: 80, width: 200, height: 120 },
      'w',
      { x: 60, y: 140 },
    )
    expect(west).toEqual({ x: 60, y: 80, width: 240, height: 120 })
    const east = resizeWorldFrameFromHandle(
      { x: 100, y: 80, width: 200, height: 120 },
      'e',
      { x: 360, y: 140 },
    )
    expect(east).toEqual({ x: 100, y: 80, width: 260, height: 120 })
  })

  it('rejects non-finite viewport, zoom, and pan values', () => {
    expect(() => createStageViewportTransform({
      viewport: { x: Number.NaN, y: 0, width: 1280, height: 720 },
    })).toThrow(TypeError)
    expect(() => createStageViewportTransform({
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      zoom: Number.POSITIVE_INFINITY,
    })).toThrow(TypeError)
    expect(() => createStageViewportTransform({
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      pan: { x: 0, y: Number.NaN },
    })).toThrow(TypeError)
  })
})
