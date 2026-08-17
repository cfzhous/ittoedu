import {
  buildSpatialMinimap,
  cullSpatialItems,
  fitSpatialCamera,
  panSpatialCamera,
  screenToWorld,
  spatialCameraFromPose,
  spatialFiniteBounds,
  worldToScreen,
  zoomSpatialCameraAt,
  type SpatialCamera,
  type SpatialMinimapModel,
  type SpatialRect,
} from '../../player/surfaces/spatial/spatialModel'
import type { SpatialCameraPose } from '../../shared/courseProjectTypes'
import type {
  LayerItem,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'

/**
 * Session-only viewport limits for the Spatial authoring workspace. Content
 * transforms are persisted through Course Project V9; these camera values are
 * never written back to the project.
 */
export const SPATIAL_WORKSPACE_MIN_ZOOM = 0.25
export const SPATIAL_WORKSPACE_MAX_ZOOM = 4

export interface SpatialWorkspaceZoomLimits {
  readonly min: number
  readonly max: number
}

export const SPATIAL_WORKSPACE_ZOOM_LIMITS: SpatialWorkspaceZoomLimits = {
  min: SPATIAL_WORKSPACE_MIN_ZOOM,
  max: SPATIAL_WORKSPACE_MAX_ZOOM,
}

export const SPATIAL_WORKSPACE_MINIMAP_SIZE = { width: 180, height: 112 } as const

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} 必须是有限数字`)
  }
}

function assertPositive(value: number, label: string): void {
  assertFinite(value, label)
  if (value <= 0) {
    throw new RangeError(`${label} 必须大于 0`)
  }
}

/**
 * Clamps an authoring zoom request to the session limits. The player model
 * also clamps inside `zoomSpatialCameraAt`; this helper exists so callers can
 * preview the same teacher-safe limit before committing a camera state.
 */
export function clampZoom(
  zoom: number,
  limits: SpatialWorkspaceZoomLimits = SPATIAL_WORKSPACE_ZOOM_LIMITS,
): number {
  assertFinite(zoom, '缩放倍率')
  if (zoom <= 0) {
    throw new RangeError('缩放倍率必须大于 0')
  }
  assertPositive(limits.min, '最小缩放')
  assertPositive(limits.max, '最大缩放')
  if (limits.min > limits.max) {
    throw new RangeError('最小缩放不能大于最大缩放')
  }
  return Math.min(limits.max, Math.max(limits.min, zoom))
}

/** Zooms the session camera at a viewport-space anchor without persisting it. */
export function zoomCameraAt(
  camera: SpatialCamera,
  nextZoom: number,
  screenAnchor: { x: number; y: number },
  limits: SpatialWorkspaceZoomLimits = SPATIAL_WORKSPACE_ZOOM_LIMITS,
): SpatialCamera {
  return zoomSpatialCameraAt(camera, clampZoom(nextZoom, limits), screenAnchor, {
    min: limits.min,
    max: limits.max,
  })
}

/** Pans the session camera by a viewport-space pointer delta. */
export function panCamera(
  camera: SpatialCamera,
  screenDelta: { x: number; y: number },
): SpatialCamera {
  return panSpatialCamera(camera, screenDelta)
}

/**
 * Builds the single SVG group transform used by the world layer. Selection
 * chrome, minimap and viewport controls are siblings outside this transform.
 */
export function worldGroupTransform(camera: SpatialCamera): string {
  return `translate(${camera.viewportWidth / 2} ${camera.viewportHeight / 2}) scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`
}

/**
 * Converts a world-space rectangle to the viewport-space rectangle that an
 * outside-transform control should occupy. It intentionally mirrors the SVG
 * transform above so 0.5x/1x/2x camera changes and pans never alter control
 * sizing relative to the world content.
 */
export function screenControlRect(
  camera: SpatialCamera,
  rect: SpatialRect,
): SpatialRect {
  const topLeft = worldToScreen(camera, { x: rect.x, y: rect.y })
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: rect.width * camera.zoom,
    height: rect.height * camera.zoom,
  }
}

/** Converts a viewport-space pointer position back into world coordinates. */
export function screenPointToWorld(
  camera: SpatialCamera,
  point: { x: number; y: number },
): { x: number; y: number } {
  return screenToWorld(camera, point)
}

/** Culls world items against the current session camera. */
export function cullWorkspaceItems(
  spatial: SpatialSurfaceDocument,
  camera: SpatialCamera,
) {
  return cullSpatialItems(spatial.world.layerItems, camera, spatial.semanticZoom)
}

/** Builds the read-only minimap model for the session camera. */
export function buildWorkspaceMinimap(
  spatial: SpatialSurfaceDocument,
  camera: SpatialCamera,
  size = SPATIAL_WORKSPACE_MINIMAP_SIZE,
): SpatialMinimapModel {
  return buildSpatialMinimap(spatial, camera, size)
}

/** Stable authoring frame fields shared by the move/resize/rotate gestures. */
export interface SpatialWorkspaceFrame {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}

export function workspaceFrameFromLayerItem(item: LayerItem): SpatialWorkspaceFrame {
  return {
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
  }
}

export function workspaceFrameChanged(
  item: LayerItem,
  frame: SpatialWorkspaceFrame,
): boolean {
  return item.frame.x !== frame.x ||
    item.frame.y !== frame.y ||
    item.frame.width !== frame.width ||
    item.frame.height !== frame.height ||
    item.rotation !== frame.rotation
}

/** Fits the session camera to authored world bounds. Never writes the project. */
export function fitWorkspaceCamera(
  spatial: SpatialSurfaceDocument,
  viewport: { width: number; height: number },
  paddingPx = 32,
): SpatialCamera {
  return fitSpatialCamera(spatialFiniteBounds(spatial), viewport, paddingPx)
}

/** Resets the session camera to the persisted home pose. */
export function resetWorkspaceCamera(
  spatial: SpatialSurfaceDocument,
  viewport: { width: number; height: number },
): SpatialCamera {
  return spatialCameraFromPose(spatial.camera.home, viewport)
}

export function workspaceCameraPose(camera: SpatialCamera): SpatialCameraPose {
  return { x: camera.x, y: camera.y, zoom: camera.zoom }
}
