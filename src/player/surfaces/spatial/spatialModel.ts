import {
  SPATIAL_MAX_ZOOM,
  SPATIAL_MIN_ZOOM,
  SPATIAL_CANONICAL_VIEWPORT,
  type LayerItem,
  type SpatialCameraFrame,
  type SpatialCameraPose,
  type SpatialSemanticZoomRule,
  type SpatialSurfaceDocument,
} from '../../../shared/courseProjectTypes'

export { SPATIAL_CANONICAL_VIEWPORT }

export type {
  SpatialCameraFrame,
  SpatialCameraPose,
  SpatialSemanticZoomRule,
  SpatialSurfaceDocument,
} from '../../../shared/courseProjectTypes'

export interface SpatialRect {
  x: number
  y: number
  width: number
  height: number
}

/** Runtime camera adds viewport dimensions to the persisted authoring pose. */
export interface SpatialCamera extends SpatialCameraPose {
  viewportWidth: number
  viewportHeight: number
}

export interface SpatialRenderableItem {
  item: LayerItem
  semanticVisible: boolean
}

export interface SpatialMinimapModel {
  width: number
  height: number
  viewport: SpatialRect
  nodes: Array<SpatialRect & { id: string }>
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`)
  return value
}

function positive(value: number, label: string): number {
  finite(value, label)
  if (value <= 0) throw new Error(`${label} must be greater than zero`)
  return value
}

export function validateSpatialCamera(camera: SpatialCamera): SpatialCamera {
  finite(camera.x, 'camera.x')
  finite(camera.y, 'camera.y')
  positive(camera.zoom, 'camera.zoom')
  if (camera.zoom < SPATIAL_MIN_ZOOM || camera.zoom > SPATIAL_MAX_ZOOM) {
    throw new Error(`camera.zoom must be between ${SPATIAL_MIN_ZOOM} and ${SPATIAL_MAX_ZOOM}`)
  }
  positive(camera.viewportWidth, 'camera.viewportWidth')
  positive(camera.viewportHeight, 'camera.viewportHeight')
  return { ...camera }
}

export function spatialCameraFromPose(
  pose: SpatialCameraPose,
  viewport: { width: number; height: number },
): SpatialCamera {
  return validateSpatialCamera({
    ...pose,
    zoom: Math.min(SPATIAL_MAX_ZOOM, Math.max(SPATIAL_MIN_ZOOM, positive(pose.zoom, 'camera.zoom'))),
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  })
}

export function worldToScreen(
  camera: SpatialCamera,
  point: { x: number; y: number },
): { x: number; y: number } {
  validateSpatialCamera(camera)
  return {
    x: (point.x - camera.x) * camera.zoom + camera.viewportWidth / 2,
    y: (point.y - camera.y) * camera.zoom + camera.viewportHeight / 2,
  }
}

export function screenToWorld(
  camera: SpatialCamera,
  point: { x: number; y: number },
): { x: number; y: number } {
  validateSpatialCamera(camera)
  return {
    x: (point.x - camera.viewportWidth / 2) / camera.zoom + camera.x,
    y: (point.y - camera.viewportHeight / 2) / camera.zoom + camera.y,
  }
}

export function panSpatialCamera(
  camera: SpatialCamera,
  screenDelta: { x: number; y: number },
): SpatialCamera {
  return validateSpatialCamera({
    ...camera,
    x: camera.x - finite(screenDelta.x, 'pan.x') / camera.zoom,
    y: camera.y - finite(screenDelta.y, 'pan.y') / camera.zoom,
  })
}

export function zoomSpatialCameraAt(
  camera: SpatialCamera,
  nextZoom: number,
  screenAnchor: { x: number; y: number },
  limits: { min: number; max: number } = { min: SPATIAL_MIN_ZOOM, max: SPATIAL_MAX_ZOOM },
): SpatialCamera {
  positive(limits.min, 'minZoom')
  positive(limits.max, 'maxZoom')
  if (limits.min > limits.max) throw new Error('minZoom cannot exceed maxZoom')
  if (limits.min < SPATIAL_MIN_ZOOM || limits.max > SPATIAL_MAX_ZOOM) {
    throw new Error(`zoom limits must stay between ${SPATIAL_MIN_ZOOM} and ${SPATIAL_MAX_ZOOM}`)
  }
  const before = screenToWorld(camera, screenAnchor)
  const zoom = Math.min(limits.max, Math.max(limits.min, positive(nextZoom, 'zoom')))
  const provisional = { ...camera, zoom }
  const after = screenToWorld(provisional, screenAnchor)
  return validateSpatialCamera({
    ...provisional,
    x: provisional.x + before.x - after.x,
    y: provisional.y + before.y - after.y,
  })
}

export function cameraWorldViewport(camera: SpatialCamera): SpatialRect {
  validateSpatialCamera(camera)
  const width = camera.viewportWidth / camera.zoom
  const height = camera.viewportHeight / camera.zoom
  return { x: camera.x - width / 2, y: camera.y - height / 2, width, height }
}

export function fitSpatialCamera(
  bounds: SpatialRect,
  viewport: { width: number; height: number },
  paddingPx = 32,
): SpatialCamera {
  positive(bounds.width, 'bounds.width')
  positive(bounds.height, 'bounds.height')
  positive(viewport.width, 'viewport.width')
  positive(viewport.height, 'viewport.height')
  const availableWidth = Math.max(1, viewport.width - paddingPx * 2)
  const availableHeight = Math.max(1, viewport.height - paddingPx * 2)
  return validateSpatialCamera({
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
    zoom: Math.min(
      SPATIAL_MAX_ZOOM,
      Math.max(
        SPATIAL_MIN_ZOOM,
        Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
      ),
    ),
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  })
}

/** Fit the declared Spatial world and return a persistable camera pose. */
export function fitSpatialSurfaceCamera(
  spatial: SpatialSurfaceDocument,
  paddingPx = 36,
  effectiveLayerItems: readonly LayerItem[] = spatial.world.layerItems,
): SpatialCameraPose {
  const baseBounds = spatialFiniteBounds(spatial)
  const visibleItems = effectiveLayerItems.filter((item) => item.visible)
  const itemBounds = visibleItems.length === 0 ? undefined : {
    x: Math.min(...visibleItems.map((item) => item.frame.x)),
    y: Math.min(...visibleItems.map((item) => item.frame.y)),
    width: Math.max(...visibleItems.map((item) => item.frame.x + item.frame.width)) -
      Math.min(...visibleItems.map((item) => item.frame.x)),
    height: Math.max(...visibleItems.map((item) => item.frame.y + item.frame.height)) -
      Math.min(...visibleItems.map((item) => item.frame.y)),
  }
  const bounds = itemBounds ? {
    x: Math.min(baseBounds.x, itemBounds.x),
    y: Math.min(baseBounds.y, itemBounds.y),
    width: Math.max(baseBounds.x + baseBounds.width, itemBounds.x + itemBounds.width) -
      Math.min(baseBounds.x, itemBounds.x),
    height: Math.max(baseBounds.y + baseBounds.height, itemBounds.y + itemBounds.height) -
      Math.min(baseBounds.y, itemBounds.y),
  } : baseBounds
  const camera = fitSpatialCamera(
    bounds,
    SPATIAL_CANONICAL_VIEWPORT,
    paddingPx,
  )
  return { x: camera.x, y: camera.y, zoom: camera.zoom }
}

function intersects(a: SpatialRect, b: SpatialRect): boolean {
  return a.x + a.width >= b.x && b.x + b.width >= a.x &&
    a.y + a.height >= b.y && b.y + b.height >= a.y
}

export function isSpatialItemSemanticallyVisible(
  itemId: string,
  zoom: number,
  rules: readonly SpatialSemanticZoomRule[],
): boolean {
  const applicable = rules.filter((rule) =>
    rule.layerItemIds.includes(itemId) && zoom >= rule.minZoom && zoom < rule.maxZoom,
  )
  if (applicable.length === 0) return true
  return applicable.every((rule) => rule.visible)
}

export function cullSpatialItems(
  items: readonly LayerItem[],
  camera: SpatialCamera,
  rules: readonly SpatialSemanticZoomRule[] = [],
  overscanPx = 100,
): SpatialRenderableItem[] {
  const viewport = cameraWorldViewport(camera)
  const overscan = Math.max(0, overscanPx) / camera.zoom
  const expanded: SpatialRect = {
    x: viewport.x - overscan,
    y: viewport.y - overscan,
    width: viewport.width + overscan * 2,
    height: viewport.height + overscan * 2,
  }
  return items
    .filter((item) => item.visible && intersects(item.frame, expanded))
    .map((item) => ({
      item,
      semanticVisible: isSpatialItemSemanticallyVisible(item.layerItemId, camera.zoom, rules),
    }))
    .filter((entry) => entry.semanticVisible)
    .sort((left, right) =>
      left.item.order - right.item.order || left.item.layerItemId.localeCompare(right.item.layerItemId),
    )
}

export function spatialFiniteBounds(spatial: SpatialSurfaceDocument): SpatialRect {
  if (spatial.world.bounds.mode === 'finite') return { ...spatial.world.bounds }
  if (spatial.world.layerItems.length === 0) {
    return { x: spatial.camera.home.x - 1, y: spatial.camera.home.y - 1, width: 2, height: 2 }
  }
  const minX = Math.min(...spatial.world.layerItems.map((item) => item.frame.x))
  const minY = Math.min(...spatial.world.layerItems.map((item) => item.frame.y))
  const maxX = Math.max(...spatial.world.layerItems.map((item) => item.frame.x + item.frame.width))
  const maxY = Math.max(...spatial.world.layerItems.map((item) => item.frame.y + item.frame.height))
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

export function buildSpatialMinimap(
  spatial: SpatialSurfaceDocument,
  camera: SpatialCamera,
  size: { width: number; height: number },
): SpatialMinimapModel {
  positive(size.width, 'minimap.width')
  positive(size.height, 'minimap.height')
  const world = spatialFiniteBounds(spatial)
  const scale = Math.min(size.width / world.width, size.height / world.height)
  const offsetX = (size.width - world.width * scale) / 2
  const offsetY = (size.height - world.height * scale) / 2
  const mapRect = (rect: SpatialRect): SpatialRect => ({
    x: offsetX + (rect.x - world.x) * scale,
    y: offsetY + (rect.y - world.y) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  })
  return {
    width: size.width,
    height: size.height,
    viewport: mapRect(cameraWorldViewport(camera)),
    nodes: spatial.world.layerItems.map((item) => ({
      id: item.layerItemId,
      ...mapRect(item.frame),
    })),
  }
}

export function cloneSpatialDocument(spatial: SpatialSurfaceDocument): SpatialSurfaceDocument {
  return structuredClone(spatial)
}
