import type { LayerFrame, LayerItem } from '../../shared/courseProjectTypes'

export const COURSE_RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const

export type CourseResizeHandle = typeof COURSE_RESIZE_HANDLES[number]

export interface LogicalPoint {
  x: number
  y: number
}

export interface CourseLogicalRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CourseTransformItem {
  layerItemId: string
  frame: LayerFrame
  rotation: number
  locked: boolean
}

export type CourseTransformSourceItem = Pick<
  LayerItem,
  'layerItemId' | 'frame' | 'rotation' | 'locked'
>

export interface CourseSelectionBounds {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  center: LogicalPoint
}

export type CourseTransformKind = 'move' | 'resize' | 'rotate' | 'nudge'

export interface CourseTransformRequest {
  kind: CourseTransformKind
  items: readonly CourseTransformItem[]
  delta: LogicalPoint
  rotationDelta?: number
  resizeHandle?: CourseResizeHandle
  minimumSize: number
  /** A transient gesture modifier; it is never a persisted layer fact. */
  disableSnapping?: boolean
}

export type CourseSnapGuideKind = 'grid' | 'canvas-edge' | 'canvas-center'

export interface CourseSnapGuide {
  axis: 'x' | 'y'
  value: number
  kind: CourseSnapGuideKind
}

export interface CourseSnapOptions {
  canvas: { width: number; height: number }
  gridSize?: number
  threshold?: number
  minimumSize?: number
}

export interface CourseSnapResult {
  items: CourseTransformItem[]
  guides: CourseSnapGuide[]
}

const EPSILON = 1e-9

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180
}

function frameCenter(frame: LayerFrame): LogicalPoint {
  return {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  }
}

export function rotateLogicalPoint(
  point: LogicalPoint,
  center: LogicalPoint,
  degrees: number,
): LogicalPoint {
  const radians = degreesToRadians(degrees)
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const x = point.x - center.x
  const y = point.y - center.y
  return {
    x: center.x + x * cosine - y * sine,
    y: center.y + x * sine + y * cosine,
  }
}

export function rotateLogicalVector(vector: LogicalPoint, degrees: number): LogicalPoint {
  const radians = degreesToRadians(degrees)
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  }
}

export function layerFrameCorners(item: Pick<CourseTransformItem, 'frame' | 'rotation'>): LogicalPoint[] {
  const center = frameCenter(item.frame)
  return [
    { x: item.frame.x, y: item.frame.y },
    { x: item.frame.x + item.frame.width, y: item.frame.y },
    { x: item.frame.x + item.frame.width, y: item.frame.y + item.frame.height },
    { x: item.frame.x, y: item.frame.y + item.frame.height },
  ].map((point) => rotateLogicalPoint(point, center, item.rotation))
}

export function courseLogicalRectFromPoints(
  start: LogicalPoint,
  end: LogicalPoint,
): CourseLogicalRect {
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  return {
    x: left,
    y: top,
    width: Math.max(start.x, end.x) - left,
    height: Math.max(start.y, end.y) - top,
  }
}

function polygonAxes(points: readonly LogicalPoint[]): LogicalPoint[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length]!
    const edge = { x: next.x - point.x, y: next.y - point.y }
    const length = Math.hypot(edge.x, edge.y)
    return length <= EPSILON
      ? { x: 0, y: 0 }
      : { x: -edge.y / length, y: edge.x / length }
  }).filter((axis) => Math.abs(axis.x) > EPSILON || Math.abs(axis.y) > EPSILON)
}

function projectedRange(points: readonly LogicalPoint[], axis: LogicalPoint): [number, number] {
  const values = points.map((point) => point.x * axis.x + point.y * axis.y)
  return [Math.min(...values), Math.max(...values)]
}

function convexPolygonsIntersect(
  left: readonly LogicalPoint[],
  right: readonly LogicalPoint[],
): boolean {
  for (const axis of [...polygonAxes(left), ...polygonAxes(right)]) {
    const [leftMin, leftMax] = projectedRange(left, axis)
    const [rightMin, rightMax] = projectedRange(right, axis)
    if (leftMax < rightMin - EPSILON || rightMax < leftMin - EPSILON) return false
  }
  return true
}

/** Logical-only marquee hit test; rotated layer geometry never depends on DOM layout. */
export function courseItemIntersectsLogicalRect(
  item: Pick<CourseTransformItem, 'frame' | 'rotation'>,
  rect: CourseLogicalRect,
): boolean {
  if (rect.width < 0 || rect.height < 0) return false
  const rectPoints: LogicalPoint[] = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ]
  return convexPolygonsIntersect(layerFrameCorners(item), rectPoints)
}

export function courseItemContainsLogicalPoint(
  item: Pick<CourseTransformItem, 'frame' | 'rotation'>,
  point: LogicalPoint,
): boolean {
  const center = frameCenter(item.frame)
  const local = rotateLogicalPoint(point, center, -item.rotation)
  return local.x >= item.frame.x - EPSILON &&
    local.x <= item.frame.x + item.frame.width + EPSILON &&
    local.y >= item.frame.y - EPSILON &&
    local.y <= item.frame.y + item.frame.height + EPSILON
}

/**
 * A single item keeps its authored rotation. A multi-selection deliberately
 * uses the axis-aligned union of every rotated item. This keeps group geometry
 * deterministic without inventing a persistent group transform in Project V9.
 */
export function courseSelectionBounds(
  items: readonly Pick<CourseTransformItem, 'frame' | 'rotation'>[],
): CourseSelectionBounds | null {
  if (items.length === 0) return null
  if (items.length === 1) {
    const item = items[0]
    return {
      x: item.frame.x,
      y: item.frame.y,
      width: item.frame.width,
      height: item.frame.height,
      rotation: item.rotation,
      center: frameCenter(item.frame),
    }
  }
  const corners = items.flatMap(layerFrameCorners)
  const left = Math.min(...corners.map((point) => point.x))
  const top = Math.min(...corners.map((point) => point.y))
  const right = Math.max(...corners.map((point) => point.x))
  const bottom = Math.max(...corners.map((point) => point.y))
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    rotation: 0,
    center: { x: (left + right) / 2, y: (top + bottom) / 2 },
  }
}

export function toCourseTransformItem(source: CourseTransformSourceItem): CourseTransformItem {
  return {
    layerItemId: source.layerItemId,
    frame: { ...source.frame },
    rotation: source.rotation,
    locked: source.locked,
  }
}

export function moveCourseTransformItems(
  items: readonly CourseTransformItem[],
  delta: LogicalPoint,
): CourseTransformItem[] {
  return items.map((item) => ({
    ...item,
    frame: {
      ...item.frame,
      x: item.frame.x + delta.x,
      y: item.frame.y + delta.y,
    },
  }))
}

function handleMovesLeft(handle: CourseResizeHandle): boolean {
  return handle === 'nw' || handle === 'w' || handle === 'sw'
}

function handleMovesRight(handle: CourseResizeHandle): boolean {
  return handle === 'ne' || handle === 'e' || handle === 'se'
}

function handleMovesTop(handle: CourseResizeHandle): boolean {
  return handle === 'nw' || handle === 'n' || handle === 'ne'
}

function handleMovesBottom(handle: CourseResizeHandle): boolean {
  return handle === 'sw' || handle === 's' || handle === 'se'
}

interface AxisSnap {
  delta: number
  guide: CourseSnapGuide
}

function closestAxisSnap(
  axis: 'x' | 'y',
  candidates: readonly number[],
  gridAnchor: number,
  canvasSize: number,
  gridSize: number,
  threshold: number,
): AxisSnap {
  const targets: Array<{ value: number; kind: CourseSnapGuideKind }> = [
    { value: 0, kind: 'canvas-edge' },
    { value: canvasSize / 2, kind: 'canvas-center' },
    { value: canvasSize, kind: 'canvas-edge' },
  ]
  let best: AxisSnap | null = null
  for (const candidate of candidates) {
    for (const target of targets) {
      const delta = target.value - candidate
      if (Math.abs(delta) > threshold) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, guide: { axis, value: target.value, kind: target.kind } }
      }
    }
  }
  if (best) return best
  const safeGrid = Math.max(EPSILON, gridSize)
  const snapped = Math.round(gridAnchor / safeGrid) * safeGrid
  return {
    delta: snapped - gridAnchor,
    guide: { axis, value: snapped, kind: 'grid' },
  }
}

/**
 * Applies transient authoring snap to an already transformed selection.
 * Canvas alignments win inside the threshold; otherwise the moving top/left
 * edge snaps to the logical grid. The returned guide is display-only.
 */
export function snapCourseTransformItems(
  items: readonly CourseTransformItem[],
  kind: CourseTransformKind,
  resizeHandle: CourseResizeHandle | undefined,
  options: CourseSnapOptions,
): CourseSnapResult {
  const cloned = items.map((item) => ({ ...item, frame: { ...item.frame } }))
  const bounds = courseSelectionBounds(cloned)
  if (!bounds || (kind !== 'move' && kind !== 'resize')) return { items: cloned, guides: [] }
  const gridSize = options.gridSize ?? 8
  const threshold = options.threshold ?? 6
  const horizontalCandidates = [bounds.x, bounds.center.x, bounds.x + bounds.width]
  const verticalCandidates = [bounds.y, bounds.center.y, bounds.y + bounds.height]

  if (kind === 'move') {
    const xSnap = closestAxisSnap('x', horizontalCandidates, bounds.x, options.canvas.width, gridSize, threshold)
    const ySnap = closestAxisSnap('y', verticalCandidates, bounds.y, options.canvas.height, gridSize, threshold)
    return {
      items: moveCourseTransformItems(cloned, { x: xSnap.delta, y: ySnap.delta }),
      guides: [xSnap.guide, ySnap.guide],
    }
  }

  if (!resizeHandle) return { items: cloned, guides: [] }
  const movesX = handleMovesLeft(resizeHandle) || handleMovesRight(resizeHandle)
  const movesY = handleMovesTop(resizeHandle) || handleMovesBottom(resizeHandle)
  const xCandidate = handleMovesLeft(resizeHandle) ? bounds.x : bounds.x + bounds.width
  const yCandidate = handleMovesTop(resizeHandle) ? bounds.y : bounds.y + bounds.height
  const xSnap = movesX
    ? closestAxisSnap('x', [xCandidate], xCandidate, options.canvas.width, gridSize, threshold)
    : null
  const ySnap = movesY
    ? closestAxisSnap('y', [yCandidate], yCandidate, options.canvas.height, gridSize, threshold)
    : null
  return {
    items: resizeCourseTransformItems(
      cloned,
      resizeHandle,
      { x: xSnap?.delta ?? 0, y: ySnap?.delta ?? 0 },
      options.minimumSize ?? 1,
    ),
    guides: [xSnap?.guide, ySnap?.guide].filter((guide): guide is CourseSnapGuide => Boolean(guide)),
  }
}

function resizeSingleCourseItem(
  item: CourseTransformItem,
  handle: CourseResizeHandle,
  delta: LogicalPoint,
  minimumSize: number,
): CourseTransformItem {
  const localDelta = rotateLogicalVector(delta, -item.rotation)
  let left = -item.frame.width / 2
  let right = item.frame.width / 2
  let top = -item.frame.height / 2
  let bottom = item.frame.height / 2

  if (handleMovesLeft(handle)) left = Math.min(left + localDelta.x, right - minimumSize)
  if (handleMovesRight(handle)) right = Math.max(right + localDelta.x, left + minimumSize)
  if (handleMovesTop(handle)) top = Math.min(top + localDelta.y, bottom - minimumSize)
  if (handleMovesBottom(handle)) bottom = Math.max(bottom + localDelta.y, top + minimumSize)

  const localCenter = { x: (left + right) / 2, y: (top + bottom) / 2 }
  const centerShift = rotateLogicalVector(localCenter, item.rotation)
  const initialCenter = frameCenter(item.frame)
  const width = right - left
  const height = bottom - top
  const center = {
    x: initialCenter.x + centerShift.x,
    y: initialCenter.y + centerShift.y,
  }
  return {
    ...item,
    frame: {
      ...item.frame,
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
    },
  }
}

interface ResizedGroupBounds {
  x: number
  y: number
  width: number
  height: number
  scaleX: number
  scaleY: number
  anchor: LogicalPoint
}

function resizeAxisAlignedGroupBounds(
  bounds: CourseSelectionBounds,
  handle: CourseResizeHandle,
  delta: LogicalPoint,
  minimumSize: number,
): ResizedGroupBounds {
  let left = bounds.x
  let right = bounds.x + bounds.width
  let top = bounds.y
  let bottom = bounds.y + bounds.height
  if (handleMovesLeft(handle)) left = Math.min(left + delta.x, right - minimumSize)
  if (handleMovesRight(handle)) right = Math.max(right + delta.x, left + minimumSize)
  if (handleMovesTop(handle)) top = Math.min(top + delta.y, bottom - minimumSize)
  if (handleMovesBottom(handle)) bottom = Math.max(bottom + delta.y, top + minimumSize)

  const anchor = {
    x: handleMovesLeft(handle) ? bounds.x + bounds.width : bounds.x,
    y: handleMovesTop(handle) ? bounds.y + bounds.height : bounds.y,
  }
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    scaleX: handle === 'n' || handle === 's'
      ? 1
      : (right - left) / Math.max(EPSILON, bounds.width),
    scaleY: handle === 'e' || handle === 'w'
      ? 1
      : (bottom - top) / Math.max(EPSILON, bounds.height),
    anchor,
  }
}

export function resizeCourseTransformItems(
  items: readonly CourseTransformItem[],
  handle: CourseResizeHandle,
  delta: LogicalPoint,
  minimumSize = 1,
): CourseTransformItem[] {
  if (items.length === 0) return []
  const safeMinimum = Math.max(EPSILON, minimumSize)
  if (items.length === 1) return [resizeSingleCourseItem(items[0], handle, delta, safeMinimum)]
  const bounds = courseSelectionBounds(items)
  if (!bounds) return []
  const resized = resizeAxisAlignedGroupBounds(bounds, handle, delta, safeMinimum)
  return items.map((item) => {
    const center = frameCenter(item.frame)
    const nextCenter = {
      x: resized.anchor.x + (center.x - resized.anchor.x) * resized.scaleX,
      y: resized.anchor.y + (center.y - resized.anchor.y) * resized.scaleY,
    }
    const width = item.frame.width * resized.scaleX
    const height = item.frame.height * resized.scaleY
    return {
      ...item,
      frame: {
        ...item.frame,
        x: nextCenter.x - width / 2,
        y: nextCenter.y - height / 2,
        width,
        height,
      },
    }
  })
}

export function rotateCourseTransformItems(
  items: readonly CourseTransformItem[],
  rotationDelta: number,
): CourseTransformItem[] {
  const bounds = courseSelectionBounds(items)
  if (!bounds) return []
  return items.map((item) => {
    const center = rotateLogicalPoint(frameCenter(item.frame), bounds.center, rotationDelta)
    return {
      ...item,
      frame: {
        ...item.frame,
        x: center.x - item.frame.width / 2,
        y: center.y - item.frame.height / 2,
      },
      rotation: item.rotation + rotationDelta,
    }
  })
}

export function normalizeAngleDelta(degrees: number): number {
  const normalized = (degrees + 180) % 360
  return (normalized < 0 ? normalized + 360 : normalized) - 180
}

export function angleFromCenter(center: LogicalPoint, point: LogicalPoint): number {
  return Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI
}

export function rotationDeltaBetween(
  center: LogicalPoint,
  start: LogicalPoint,
  current: LogicalPoint,
): number {
  return normalizeAngleDelta(angleFromCenter(center, current) - angleFromCenter(center, start))
}

export function selectionRotationHandlePoint(
  bounds: CourseSelectionBounds,
  offset: number,
): LogicalPoint {
  return rotateLogicalPoint(
    { x: bounds.center.x, y: bounds.y - offset },
    bounds.center,
    bounds.rotation,
  )
}

export function applyCourseTransformRequest(request: CourseTransformRequest): CourseTransformItem[] {
  switch (request.kind) {
    case 'move':
    case 'nudge':
      return moveCourseTransformItems(request.items, request.delta)
    case 'resize':
      return request.resizeHandle
        ? resizeCourseTransformItems(
          request.items,
          request.resizeHandle,
          request.delta,
          request.minimumSize,
        )
        : request.items.map((item) => ({ ...item, frame: { ...item.frame } }))
    case 'rotate':
      return rotateCourseTransformItems(request.items, request.rotationDelta ?? 0)
  }
}
