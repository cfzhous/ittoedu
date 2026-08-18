import { isCourseLayerVisibleAtLocation } from '../../shared/courseProjectModel'
import { makeAuthoringAddress, type AuthoringCarrier } from '../../shared/authoringAddress'
import type {
  CourseProjectDocument,
  LayerItem,
  SpatialCameraFrame,
  SpatialCameraPose,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import { compareStableStrings } from '../../shared/stableOrder'
import {
  createStageViewportTransform,
  type StagePoint,
  type StageRect,
  type StageViewportTransform,
} from '../authoring/stageViewportTransform'

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T :
    T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[] :
      T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } :
        T

export type SpatialEditorLayerScope = 'global' | 'surface' | 'world'
export type SpatialCoordinateSpace = 'world' | 'viewport'

/** Temporary editor camera. Never persisted in Course Project revision/history. */
export interface SpatialSessionCamera {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export interface SpatialEditorLayerView {
  readonly source: SpatialEditorLayerScope
  /** G3: global (including non-controller HUD) and teacher-controller are viewport. */
  readonly coordinateSpace: SpatialCoordinateSpace
  readonly scopedVisible: boolean
  readonly effectiveVisible: boolean
  readonly selectionId: string
  readonly item: DeepReadonly<LayerItem>
}

export interface SpatialEditorCameraView {
  readonly home: DeepReadonly<SpatialCameraPose>
  readonly frames: readonly DeepReadonly<SpatialCameraFrame>[]
  readonly activeFrameId: string
}

export interface SpatialEditorView {
  readonly projectId: string
  readonly revision: number
  readonly locationId: string
  readonly surfaceId: string
  readonly surfaceTitle: string
  readonly camera: SpatialEditorCameraView
  readonly worldBounds: DeepReadonly<SpatialSurfaceDocument['world']['bounds']>
  readonly layers: readonly SpatialEditorLayerView[]
}

export interface BuildSpatialEditorViewInput {
  readonly project: CourseProjectDocument
  readonly locationId: string
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as DeepReadonly<T>
  }
  if (!ArrayBuffer.isView(value)) {
    Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry))
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}

export function isSpatialTeacherController(item: DeepReadonly<LayerItem> | LayerItem): boolean {
  return item.kind === 'native' && item.content.nativeType === 'teacher-controller'
}

export function spatialLayerCoordinateSpace(
  source: SpatialEditorLayerScope,
  item: DeepReadonly<LayerItem> | LayerItem,
): SpatialCoordinateSpace {
  if (isSpatialTeacherController(item) || source === 'global') return 'viewport'
  return 'world'
}

export function isSpatialViewportLayer(layer: SpatialEditorLayerView): boolean {
  return layer.coordinateSpace === 'viewport'
}

export function resolveSpatialSurface(
  project: CourseProjectDocument,
  locationId: string,
): {
  location: Extract<CourseProjectDocument['locations'][number], { kind: 'spatial-camera' }>
  surface: SpatialSurfaceDocument
  frame: SpatialCameraFrame
} {
  const location = project.locations.find((candidate) => candidate.id === locationId)
  if (!location) throw new Error(`找不到课程位置：${locationId}`)
  if (location.kind !== 'spatial-camera') {
    throw new Error(`SpatialEditorView 只接受 Spatial 镜头位置：${locationId}`)
  }
  const surface = project.surfaces.find((candidate) => candidate.id === location.surfaceId)
  if (!surface || surface.type !== 'spatial-2d') {
    throw new Error(`找不到 Spatial 表面：${location.surfaceId}`)
  }
  const frame = surface.camera.frames.find((candidate) => candidate.id === location.cameraFrameId)
  if (!frame) throw new Error(`找不到 Spatial 镜头帧：${location.cameraFrameId}`)
  return { location, surface, frame }
}

function layerView(
  item: LayerItem,
  source: SpatialEditorLayerScope,
  scopedVisible: boolean,
): SpatialEditorLayerView {
  const readonlyItem = deepFreeze(item)
  return {
    source,
    coordinateSpace: spatialLayerCoordinateSpace(source, readonlyItem),
    scopedVisible,
    effectiveVisible: scopedVisible && readonlyItem.visible,
    selectionId: readonlyItem.layerItemId,
    item: readonlyItem,
  }
}

/**
 * Read-only Spatial projection. Omits path/relation/semantic-zoom symbols so
 * R5-A snapshots stay valid before R5-C exists.
 */
export function buildSpatialEditorView(input: BuildSpatialEditorViewInput): SpatialEditorView {
  const { project, locationId } = input
  const { surface, frame } = resolveSpatialSurface(project, locationId)

  const layers = [
    ...project.globalLayerItems.map((entry) => layerView(
      structuredClone(entry.item),
      'global',
      isCourseLayerVisibleAtLocation(entry, locationId),
    )),
    ...surface.surfaceLayerItems.map((entry) => layerView(
      structuredClone(entry.item),
      'surface',
      isCourseLayerVisibleAtLocation(entry, locationId),
    )),
    ...surface.world.layerItems.map((item) => layerView(
      structuredClone(item),
      'world',
      true,
    )),
  ].sort((left, right) => left.item.order - right.item.order ||
    compareStableStrings(left.selectionId, right.selectionId))

  return deepFreeze({
    projectId: project.id,
    revision: project.revision,
    locationId,
    surfaceId: surface.id,
    surfaceTitle: surface.title,
    camera: {
      home: { ...surface.camera.home },
      frames: surface.camera.frames.map((candidate) => ({ ...candidate })),
      activeFrameId: frame.id,
    },
    worldBounds: structuredClone(surface.world.bounds),
    layers,
  })
}

function spatialLayerCarrier(item: DeepReadonly<LayerItem> | LayerItem): AuthoringCarrier {
  if (item.kind === 'runtime') return 'runtime'
  if (item.kind === 'component') return 'component'
  return 'native'
}

function defaultSpatialAuthoringField(item: DeepReadonly<LayerItem> | LayerItem): string {
  if (item.kind === 'native' && item.content.nativeType === 'text') return 'content.data.text'
  if (item.kind === 'native' && item.content.nativeType === 'formula') return 'content.data'
  if (
    item.kind === 'native' &&
    (item.content.nativeType === 'image' || item.content.nativeType === 'video')
  ) {
    return 'content.data.assetId'
  }
  return 'item'
}

/**
 * World items use authoring `surface` scope because `makeAuthoringAddress`
 * has no `world` scope. Coordinate space remains `world`.
 */
export function spatialLayerAuthoringAddress(
  view: SpatialEditorView,
  layer: SpatialEditorLayerView,
  field?: string,
): string {
  return makeAuthoringAddress({
    projectId: view.projectId,
    scope: layer.source === 'global' ? 'global' : 'surface',
    surfaceId: view.surfaceId,
    carrier: spatialLayerCarrier(layer.item),
    layerItemId: layer.selectionId,
    field: field ?? defaultSpatialAuthoringField(layer.item),
  })
}

function copyViewport(viewport: StageRect): StageRect {
  if (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)) {
    throw new TypeError('viewport must be finite')
  }
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

export function copySpatialSessionCamera(camera: SpatialSessionCamera): SpatialSessionCamera {
  if (!Number.isFinite(camera.x) || !Number.isFinite(camera.y)) {
    throw new Error('会话相机位置必须是有效数字')
  }
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0 || camera.zoom > 1_000) {
    throw new Error('会话相机缩放必须大于 0 且不超过 1000')
  }
  return Object.freeze({ x: camera.x, y: camera.y, zoom: camera.zoom })
}

export function spatialSessionCameraFromPose(pose: SpatialCameraPose): SpatialSessionCamera {
  return copySpatialSessionCamera({ x: pose.x, y: pose.y, zoom: pose.zoom })
}

/**
 * Spatial world view: sessionCamera *is* the view. Does not stack a 1280×720
 * page fit on top of the camera. Reuses R2 `worldToClient` by filling the
 * same `StageViewportTransform` shape.
 */
export function createSpatialWorldViewTransform(
  viewport: StageRect,
  sessionCamera: SpatialSessionCamera,
): StageViewportTransform {
  const view = copyViewport(viewport)
  const camera = copySpatialSessionCamera(sessionCamera)
  const scale = camera.zoom
  return {
    viewport: view,
    zoom: camera.zoom,
    pan: { x: 0, y: 0 },
    fitScale: 1,
    scale,
    stageRect: {
      x: view.x + view.width / 2 - camera.x * scale,
      y: view.y + view.height / 2 - camera.y * scale,
      width: view.width,
      height: view.height,
    },
  }
}

/**
 * Viewport/global overlay matrix. Controllers and other HUD items use the R2
 * stage transform (1280×720 canonical stage), never the world session camera.
 */
export function createSpatialViewportOverlayTransform(
  viewport: StageRect,
  options: { zoom?: number; pan?: StagePoint } = {},
): StageViewportTransform {
  return createStageViewportTransform({
    viewport,
    zoom: options.zoom,
    pan: options.pan,
  })
}

export function spatialWorldPointerDeltaToWorld(
  sessionCamera: SpatialSessionCamera,
  cssDelta: StagePoint,
): StagePoint {
  const camera = copySpatialSessionCamera(sessionCamera)
  return {
    x: cssDelta.x / camera.zoom,
    y: cssDelta.y / camera.zoom,
  }
}
