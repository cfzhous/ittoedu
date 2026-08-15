import {
  addComponentLayer,
  addImageLayer,
  addNativeVisualLayer,
  addSpatialTextLayer,
  commitCourseHistory,
  type CourseHistoryState,
  updateCourseProject,
} from './courseStudioModel'
import { buildSpatialEditorView } from './spatialEditorView'
import type {
  CourseProjectDocument,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import type { ShapeType } from '../../shared/projectTypes'

export interface SpatialEditorSelection {
  readonly locationId: string
  readonly surfaceId: string
  readonly selectedLayerItemIds: readonly string[]
}

export interface SelectSpatialEditorLayersInput {
  readonly project: CourseProjectDocument
  readonly locationId: string
  readonly selectedLayerItemIds: readonly string[]
}

export interface SpatialEditorWorldTransform {
  readonly layerItemId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}

export interface SpatialEditorTransformInput {
  /** Sliding in with the existing gesture vocabulary keeps one call = one gesture. */
  readonly nodes?: readonly SpatialEditorWorldTransform[]
  /** Alias accepted so world-layer callers can use the surface-appropriate name. */
  readonly layers?: readonly SpatialEditorWorldTransform[]
}

export interface SpatialEditorWorldLayerOptions {
  readonly id?: string
  readonly x?: number
  readonly y?: number
  readonly now?: string
}

export interface SpatialEditorWorldShapeLayerOptions extends SpatialEditorWorldLayerOptions {
  readonly shapeType?: ShapeType
}

export interface SpatialEditorWorldImageLayerOptions extends SpatialEditorWorldLayerOptions {
  readonly width?: number
  readonly height?: number
}

export interface AddSpatialWorldComponentLayerInput {
  readonly surfaceId: string
  readonly packageId: string
  readonly version: string
  readonly label: string
  readonly props: Record<string, unknown>
  readonly id?: string
  readonly width: number
  readonly height: number
  readonly x?: number
  readonly y?: number
  readonly now?: string
}

export function selectSpatialEditorLayers(
  input: SelectSpatialEditorLayersInput,
): SpatialEditorSelection {
  const view = buildSpatialEditorView({
    project: input.project,
    locationId: input.locationId,
  })
  const selectedLayerItemIds = [...input.selectedLayerItemIds]
  if (new Set(selectedLayerItemIds).size !== selectedLayerItemIds.length) {
    throw new Error('选择中不能包含重复元素')
  }
  const availableIds = new Set(view.layers.map((layer) => layer.selectionId))
  const missingId = selectedLayerItemIds.find((selectionId) => !availableIds.has(selectionId))
  if (missingId !== undefined) {
    throw new Error('所选元素已失效，请重新选择')
  }

  return Object.freeze({
    locationId: view.locationId,
    surfaceId: view.surfaceId,
    selectedLayerItemIds: Object.freeze(selectedLayerItemIds),
  })
}

function spatialSurfaceIn(
  project: CourseProjectDocument,
  surfaceId: string,
): SpatialSurfaceDocument {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'spatial-2d') throw new Error('目标不是 Spatial 表面')
  return surface
}

function commitWorldProject(
  history: CourseHistoryState,
  project: CourseProjectDocument,
): CourseHistoryState {
  return commitCourseHistory(history, project)
}

export function addSpatialWorldTextLayer(
  history: CourseHistoryState,
  surfaceId: string,
  text = '双击编辑文字',
  options: SpatialEditorWorldLayerOptions = {},
): CourseHistoryState {
  spatialSurfaceIn(history.present, surfaceId)
  const next = addSpatialTextLayer(history.present, surfaceId, text, {
    id: options.id,
    x: options.x,
    y: options.y,
    now: options.now,
  })
  return commitWorldProject(history, next)
}

export function addSpatialWorldShapeLayer(
  history: CourseHistoryState,
  surfaceId: string,
  optionsOrShapeType: SpatialEditorWorldShapeLayerOptions | ShapeType = {},
  maybeOptions: SpatialEditorWorldLayerOptions = {},
): CourseHistoryState {
  const options: SpatialEditorWorldShapeLayerOptions =
    typeof optionsOrShapeType === 'string'
      ? { ...maybeOptions, shapeType: optionsOrShapeType }
      : optionsOrShapeType
  spatialSurfaceIn(history.present, surfaceId)
  const next = addNativeVisualLayer(history.present, {
    surfaceId,
    nativeType: 'shape',
    shapeType: options.shapeType ?? 'rounded-rectangle',
    id: options.id,
    x: options.x,
    y: options.y,
    now: options.now,
  })
  return commitWorldProject(history, next)
}

export function addSpatialWorldFormulaLayer(
  history: CourseHistoryState,
  surfaceId: string,
  options: SpatialEditorWorldLayerOptions = {},
): CourseHistoryState {
  spatialSurfaceIn(history.present, surfaceId)
  const next = addNativeVisualLayer(history.present, {
    surfaceId,
    nativeType: 'formula',
    id: options.id,
    x: options.x,
    y: options.y,
    now: options.now,
  })
  return commitWorldProject(history, next)
}

export function addSpatialWorldImageLayer(
  history: CourseHistoryState,
  surfaceId: string,
  assetId: string,
  options: SpatialEditorWorldImageLayerOptions = {},
): CourseHistoryState {
  spatialSurfaceIn(history.present, surfaceId)
  const next = addImageLayer(history.present, {
    surfaceId,
    assetId,
    id: options.id,
    width: options.width,
    height: options.height,
    x: options.x,
    y: options.y,
    now: options.now,
  })
  return commitWorldProject(history, next)
}

export function addSpatialWorldComponentLayer(
  history: CourseHistoryState,
  input: AddSpatialWorldComponentLayerInput,
): CourseHistoryState {
  spatialSurfaceIn(history.present, input.surfaceId)
  const next = addComponentLayer(history.present, {
    surfaceId: input.surfaceId,
    packageId: input.packageId,
    version: input.version,
    label: input.label,
    props: input.props,
    id: input.id,
    width: input.width,
    height: input.height,
    x: input.x,
    y: input.y,
    now: input.now,
  })
  return commitWorldProject(history, next)
}

function validateWorldTransform(transform: SpatialEditorWorldTransform): void {
  if (
    !Number.isFinite(transform.x) ||
    !Number.isFinite(transform.y) ||
    !Number.isFinite(transform.width) ||
    !Number.isFinite(transform.height) ||
    !Number.isFinite(transform.rotation)
  ) {
    throw new Error('元素位置和尺寸必须是有效数字')
  }
  if (transform.width <= 0 || transform.height <= 0) {
    throw new Error('元素宽高必须大于零')
  }
  if (transform.rotation < -36_000 || transform.rotation > 36_000) {
    throw new Error('元素旋转角度超出允许范围')
  }
}

/**
 * Applies one completed world-space gesture to unlocked world layers.
 * Session camera state is intentionally absent: only persistent layer
 * geometry enters the project and history.
 */
export function transformSpatialWorldLayers(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  input: SpatialEditorTransformInput,
  now?: string,
): CourseHistoryState {
  const transforms = [...(input.nodes ?? input.layers ?? [])]
  if (transforms.length === 0) return history
  const layerItemIds = transforms.map((transform) => transform.layerItemId)
  if (new Set(layerItemIds).size !== layerItemIds.length) {
    throw new Error('一次变换不能包含重复元素')
  }
  transforms.forEach(validateWorldTransform)

  const selectedIds = new Set(selection.selectedLayerItemIds)
  const unselectedId = layerItemIds.find((layerItemId) => !selectedIds.has(layerItemId))
  if (unselectedId !== undefined) {
    throw new Error('变换目标不在当前选择中')
  }

  const view = buildSpatialEditorView({
    project: history.present,
    locationId: selection.locationId,
  })
  if (view.surfaceId !== selection.surfaceId) {
    throw new Error('所选空间表面已失效，请重新选择')
  }

  const layerById = new Map(view.layers.map((layer) => [layer.selectionId, layer]))
  const plans = transforms.map((transform) => {
    const layer = layerById.get(transform.layerItemId)
    if (!layer) throw new Error('所选元素已失效，请重新选择')
    if (layer.source !== 'world') throw new Error('当前选择不属于当前空间世界')
    if (!layer.effectiveVisible) throw new Error('当前元素不可见')
    if (layer.item.locked) throw new Error('当前元素已锁定')
    const changed =
      layer.item.frame.x !== transform.x ||
      layer.item.frame.y !== transform.y ||
      layer.item.frame.width !== transform.width ||
      layer.item.frame.height !== transform.height ||
      layer.item.rotation !== transform.rotation
    return { transform, changed }
  })
  if (!plans.some((plan) => plan.changed)) return history

  const next = updateCourseProject(history.present, (draft) => {
    const location = draft.locations.find((candidate) => candidate.id === selection.locationId)
    if (!location || location.kind !== 'spatial-camera') {
      throw new Error('当前空间镜头位置已失效')
    }
    const surface = draft.surfaces.find((candidate) => candidate.id === location.surfaceId)
    if (!surface || surface.type !== 'spatial-2d') {
      throw new Error('当前空间表面已失效')
    }
    const worldById = new Map(surface.world.layerItems.map((item) => [item.layerItemId, item]))
    for (const { transform, changed } of plans) {
      if (!changed) continue
      const item = worldById.get(transform.layerItemId)
      if (!item) throw new Error('所选元素已失效，请重新选择')
      item.frame.x = transform.x
      item.frame.y = transform.y
      item.frame.width = transform.width
      item.frame.height = transform.height
      item.rotation = transform.rotation
    }
  }, now)

  return commitCourseHistory(history, next)
}
