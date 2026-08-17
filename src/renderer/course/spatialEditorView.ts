import { isCourseLayerVisibleAtLocation } from '../../shared/courseProjectModel'
import {
  isSpatialItemSemanticallyVisible,
  spatialFiniteBounds,
} from '../../player/surfaces/spatial/spatialModel'
import type { SpatialRect } from '../../player/surfaces/spatial/spatialModel'
import { makeAuthoringAddress } from '../../shared/authoringAddress'
import type {
  CourseProjectDocument,
  LayerItem,
  SpatialCameraFrame,
  SpatialCameraPose,
  SpatialSemanticZoomRule,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import { compareStableStrings } from '../../shared/stableOrder'

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T :
    T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[] :
      T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } :
        T

export type SpatialEditorLayerScope = 'global' | 'surface' | 'world'

export interface SpatialEditorLayerView {
  readonly source: SpatialEditorLayerScope
  readonly scopedVisible: boolean
  readonly effectiveVisible: boolean
  readonly selectionId: string
  readonly item: DeepReadonly<LayerItem>
}

export interface SpatialEditorCameraView {
  readonly home: DeepReadonly<SpatialCameraPose>
  readonly frames: readonly DeepReadonly<SpatialCameraFrame>[]
}

export interface SpatialEditorView {
  readonly projectId: string
  readonly revision: number
  readonly locationId: string
  readonly surfaceId: string
  readonly surfaceTitle: string
  readonly activeCameraFrameId: string
  readonly camera: SpatialEditorCameraView
  readonly semanticZoom: readonly DeepReadonly<SpatialSemanticZoomRule>[]
  readonly worldBounds: DeepReadonly<SpatialRect>
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

function resolveSpatial(
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
    scopedVisible,
    effectiveVisible: scopedVisible && readonlyItem.visible,
    selectionId: readonlyItem.layerItemId,
    item: readonlyItem,
  }
}

export function buildSpatialEditorView(input: BuildSpatialEditorViewInput): SpatialEditorView {
  const { project, locationId } = input
  const { surface, frame } = resolveSpatial(project, locationId)

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
    activeCameraFrameId: frame.id,
    camera: {
      home: { ...surface.camera.home },
      frames: surface.camera.frames.map((candidate) => ({ ...candidate })),
    },
    semanticZoom: structuredClone(surface.semanticZoom),
    worldBounds: spatialFiniteBounds(surface),
    layers,
  })
}

export function isSpatialTeacherController(item: DeepReadonly<LayerItem> | LayerItem): boolean {
  return item.kind === 'native' && item.content.nativeType === 'teacher-controller'
}

/** Global/surface teacher controllers belong on the viewport overlay, not the world group. */
export function isSpatialViewportOverlayLayer(layer: SpatialEditorLayerView): boolean {
  return layer.source !== 'world' && isSpatialTeacherController(layer.item)
}

export interface SpatialViewportOverlay {
  readonly source: 'global' | 'surface'
  readonly layerItemId: string
  readonly label: string
  readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly rotation: number
  readonly locked: boolean
  readonly hidden: boolean
}

export function buildSpatialViewportOverlays(
  view: SpatialEditorView,
): readonly SpatialViewportOverlay[] {
  return Object.freeze(
    view.layers
      .filter((layer) => isSpatialViewportOverlayLayer(layer) && layer.effectiveVisible)
      .map((layer) => Object.freeze({
        source: layer.source === 'global' ? 'global' as const : 'surface' as const,
        layerItemId: layer.selectionId,
        label: layer.item.label,
        frame: {
          x: layer.item.frame.x,
          y: layer.item.frame.y,
          width: layer.item.frame.width,
          height: layer.item.frame.height,
        },
        rotation: layer.item.rotation,
        locked: layer.item.locked,
        hidden: !layer.effectiveVisible,
      })),
  )
}

/**
 * Back-to-front paint/hit order for world items at the given session zoom.
 * Semantic-zoom rules that cover an item must all allow visibility; then
 * `order` then stable id decide the sequence. The last id is the top hit.
 */
export function spatialSemanticZoomHitOrder(
  view: SpatialEditorView,
  zoom: number,
): readonly string[] {
  return Object.freeze(
    view.layers
      .filter((layer) => (
        layer.source === 'world' &&
        layer.effectiveVisible &&
        isSpatialItemSemanticallyVisible(
          layer.selectionId,
          zoom,
          view.semanticZoom as readonly SpatialSemanticZoomRule[],
        )
      ))
      .sort((left, right) => (
        left.item.order - right.item.order ||
        compareStableStrings(left.selectionId, right.selectionId)
      ))
      .map((layer) => layer.selectionId),
  )
}

export function spatialLayerAuthoringAddress(
  view: SpatialEditorView,
  layer: SpatialEditorLayerView,
): string {
  const kind = layer.item.kind
  const nativeType = kind === 'native' ? layer.item.content.nativeType : undefined
  const field = nativeType === 'text'
    ? 'content.text'
    : nativeType === 'formula'
      ? 'content.formula'
      : nativeType === 'image' || nativeType === 'video'
        ? 'content.asset'
        : 'item'
  return makeAuthoringAddress({
    projectId: view.projectId,
    scope: layer.source === 'global' ? 'global' : 'surface',
    surfaceId: view.surfaceId,
    carrier: kind === 'runtime' ? 'runtime' : kind === 'component' ? 'component' : 'native',
    layerItemId: layer.selectionId,
    field,
  })
}
