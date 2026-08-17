export const STAGE_VIEWPORT_WIDTH = 1280
export const STAGE_VIEWPORT_HEIGHT = 720
export const STAGE_VIEWPORT_MIN_ZOOM = 0.5
export const STAGE_VIEWPORT_MAX_ZOOM = 2

export interface StagePoint {
  x: number
  y: number
}

export interface StageRect extends StagePoint {
  width: number
  height: number
}

export interface StageViewportTransformOptions {
  /** The available viewport in CSS pixels, including its client-space origin. */
  viewport: StageRect
  /** User zoom relative to the fitted 1280 x 720 stage. Values are clamped to 0.5-2. */
  zoom?: number
  /** User pan relative to the fitted center, expressed in CSS pixels. */
  pan?: StagePoint
}

export interface StageViewportTransform {
  readonly viewport: StageRect
  readonly zoom: number
  readonly pan: StagePoint
  /** Scale that fits 1280 x 720 inside the viewport before user zoom is applied. */
  readonly fitScale: number
  /** Complete world-to-client scale: fitScale * zoom. */
  readonly scale: number
  /** The transformed stage bounds in client-space CSS pixels. */
  readonly stageRect: StageRect
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number`)
  }
}

function copyViewport(viewport: StageRect): StageRect {
  assertFinite(viewport.x, 'viewport.x')
  assertFinite(viewport.y, 'viewport.y')
  assertFinite(viewport.width, 'viewport.width')
  assertFinite(viewport.height, 'viewport.height')

  if (viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError('viewport dimensions must be greater than zero')
  }

  return {
    x: viewport.x,
    y: viewport.y,
    width: viewport.width,
    height: viewport.height,
  }
}

function copyPan(pan: StagePoint | undefined): StagePoint {
  const resolved = pan ?? { x: 0, y: 0 }
  assertFinite(resolved.x, 'pan.x')
  assertFinite(resolved.y, 'pan.y')
  return { x: resolved.x, y: resolved.y }
}

export function clampStageViewportZoom(zoom: number): number {
  assertFinite(zoom, 'zoom')
  return Math.min(STAGE_VIEWPORT_MAX_ZOOM, Math.max(STAGE_VIEWPORT_MIN_ZOOM, zoom))
}

/**
 * Builds the single affine transform shared by the stage image and authoring overlays.
 * World coordinates always remain in the fixed 1280 x 720 Project coordinate space.
 */
export function createStageViewportTransform(
  options: StageViewportTransformOptions,
): StageViewportTransform {
  const viewport = copyViewport(options.viewport)
  const pan = copyPan(options.pan)
  const zoom = clampStageViewportZoom(options.zoom ?? 1)
  const fitScale = Math.min(
    viewport.width / STAGE_VIEWPORT_WIDTH,
    viewport.height / STAGE_VIEWPORT_HEIGHT,
  )
  const scale = fitScale * zoom
  const width = STAGE_VIEWPORT_WIDTH * scale
  const height = STAGE_VIEWPORT_HEIGHT * scale
  const stageRect = {
    x: viewport.x + (viewport.width - width) / 2 + pan.x,
    y: viewport.y + (viewport.height - height) / 2 + pan.y,
    width,
    height,
  }

  return {
    viewport,
    zoom,
    pan,
    fitScale,
    scale,
    stageRect,
  }
}

export function worldToClient(
  transform: StageViewportTransform,
  point: StagePoint,
): StagePoint {
  return {
    x: transform.stageRect.x + point.x * transform.scale,
    y: transform.stageRect.y + point.y * transform.scale,
  }
}

export function clientToWorld(
  transform: StageViewportTransform,
  point: StagePoint,
): StagePoint {
  return {
    x: (point.x - transform.stageRect.x) / transform.scale,
    y: (point.y - transform.stageRect.y) / transform.scale,
  }
}

export function worldRectToClient(
  transform: StageViewportTransform,
  rect: StageRect,
): StageRect {
  const origin = worldToClient(transform, rect)
  return {
    ...origin,
    width: rect.width * transform.scale,
    height: rect.height * transform.scale,
  }
}

export function clientRectToWorld(
  transform: StageViewportTransform,
  rect: StageRect,
): StageRect {
  const origin = clientToWorld(transform, rect)
  return {
    ...origin,
    width: rect.width / transform.scale,
    height: rect.height / transform.scale,
  }
}

export function worldDeltaToClient(
  transform: StageViewportTransform,
  delta: StagePoint,
): StagePoint {
  return {
    x: delta.x * transform.scale,
    y: delta.y * transform.scale,
  }
}

export function clientDeltaToWorld(
  transform: StageViewportTransform,
  delta: StagePoint,
): StagePoint {
  return {
    x: delta.x / transform.scale,
    y: delta.y / transform.scale,
  }
}

/**
 * Tests a rotated logical rectangle against the fixed Project stage without
 * rewriting its bounds. Authoring overlays must keep the component's original
 * center; clipping the unrotated box first would move that center at edges.
 */
export function rotatedRectIntersectsStage(
  rect: StageRect,
  rotationDegrees: number,
): boolean {
  if (
    ![rect.x, rect.y, rect.width, rect.height, rotationDegrees]
      .every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return false
  }
  const radians = rotationDegrees * Math.PI / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const halfWidth = rect.width / 2
  const halfHeight = rect.height / 2
  const centerX = rect.x + halfWidth
  const centerY = rect.y + halfHeight
  const extentX = cosine * halfWidth + sine * halfHeight
  const extentY = sine * halfWidth + cosine * halfHeight

  return centerX + extentX > 0 &&
    centerY + extentY > 0 &&
    centerX - extentX < STAGE_VIEWPORT_WIDTH &&
    centerY - extentY < STAGE_VIEWPORT_HEIGHT
}

export const STAGE_RESIZE_HANDLE_DIRECTIONS = [
  'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w',
] as const

export type StageResizeHandleDirection = (typeof STAGE_RESIZE_HANDLE_DIRECTIONS)[number]

/**
 * CSS transform T10 must apply to both the Player stage and the Phaser
 * overlay so objects, the selection box and eight handles share one matrix.
 */
export function stageOverlayCssTransform(transform: StageViewportTransform): string {
  return `translate(${transform.stageRect.x}px, ${transform.stageRect.y}px) scale(${transform.scale})`
}

export interface StageSelectionOverlayItem {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface StageSelectionOverlayGeometry {
  readonly objects: readonly StageRect[]
  readonly selectionBox: StageRect
  readonly handles: Readonly<Record<StageResizeHandleDirection, StagePoint>>
}

function unionWorldRect(items: readonly StageSelectionOverlayItem[]): StageRect {
  const left = Math.min(...items.map((item) => item.x))
  const top = Math.min(...items.map((item) => item.y))
  const right = Math.max(...items.map((item) => item.x + item.width))
  const bottom = Math.max(...items.map((item) => item.y + item.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function handleWorldPoint(
  box: StageRect,
  direction: StageResizeHandleDirection,
): StagePoint {
  const midX = box.x + box.width / 2
  const midY = box.y + box.height / 2
  const right = box.x + box.width
  const bottom = box.y + box.height
  switch (direction) {
    case 'nw': return { x: box.x, y: box.y }
    case 'n': return { x: midX, y: box.y }
    case 'ne': return { x: right, y: box.y }
    case 'e': return { x: right, y: midY }
    case 'se': return { x: right, y: bottom }
    case 's': return { x: midX, y: bottom }
    case 'sw': return { x: box.x, y: bottom }
    case 'w': return { x: box.x, y: midY }
  }
}

/**
 * Maps authored objects, the selection box and eight handles through the
 * same viewport transform. Visual handle direction stays aligned with data.
 */
export function stageSelectionOverlayGeometry(
  transform: StageViewportTransform,
  items: readonly StageSelectionOverlayItem[],
): StageSelectionOverlayGeometry | null {
  if (items.length === 0) return null
  if (items.some((item) => item.width <= 0 || item.height <= 0)) return null
  const worldBox = items.length === 1
    ? {
        x: items[0]!.x,
        y: items[0]!.y,
        width: items[0]!.width,
        height: items[0]!.height,
      }
    : unionWorldRect(items)
  const handles = Object.fromEntries(
    STAGE_RESIZE_HANDLE_DIRECTIONS.map((direction) => [
      direction,
      worldToClient(transform, handleWorldPoint(worldBox, direction)),
    ]),
  ) as Record<StageResizeHandleDirection, StagePoint>
  return {
    objects: items.map((item) => worldRectToClient(transform, item)),
    selectionBox: worldRectToClient(transform, worldBox),
    handles,
  }
}

/**
 * Applies one handle drag in world space. West/north grow by moving origin
 * opposite the pointer so the visual edge and stored frame stay aligned.
 */
export function resizeWorldFrameFromHandle(
  start: StageRect,
  direction: StageResizeHandleDirection,
  worldPointer: StagePoint,
  minimumSize = 16,
): StageRect {
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (direction.includes('w')) left = Math.min(worldPointer.x, right - minimumSize)
  if (direction.includes('e')) right = Math.max(worldPointer.x, left + minimumSize)
  if (direction.includes('n')) top = Math.min(worldPointer.y, bottom - minimumSize)
  if (direction.includes('s')) bottom = Math.max(worldPointer.y, top + minimumSize)
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}
