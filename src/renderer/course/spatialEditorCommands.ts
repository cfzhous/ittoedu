import { nanoid } from 'nanoid'
import {
  addComponentLayer,
  addImageLayer,
  addNativeVisualLayer,
  addSpatialTextLayer,
  commitCourseHistory,
  type CourseHistoryState,
  updateCourseProject,
} from './courseStudioModel'
import {
  addSpatialEditorCameraFrame,
  deleteSpatialCameraFrame,
  renameSpatialCameraFrame,
  reorderSpatialCameraFrames,
} from './spatialCameraCommands'
import {
  addSpatialPath,
  addSpatialRelation,
  deleteSpatialPath,
  deleteSpatialRelation,
} from './spatialPathCommands'
import {
  buildSpatialEditorView,
  spatialLayerAuthoringAddress,
} from './spatialEditorView'
import type { EditorActionAdapter, EditorActionId, EditorSelectionSnapshot } from './editorActionTypes'
import {
  STAGE_VIEWPORT_HEIGHT,
  STAGE_VIEWPORT_WIDTH,
} from '../authoring/stageViewportTransform'
import {
  fitSpatialCamera,
  spatialFiniteBounds,
} from '../../player/surfaces/spatial/spatialModel'
import type {
  CourseProjectDocument,
  CourseRuntimeDefinition,
  LayerItem,
  RuntimeLayerItem,
  SpatialCameraPose,
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

export interface AddSpatialWorldRuntimeLayerInput {
  readonly surfaceId: string
  readonly label: string
  readonly runtime: CourseRuntimeDefinition
  readonly id?: string
  readonly width: number
  readonly height: number
  readonly x?: number
  readonly y?: number
  readonly now?: string
}

export function addSpatialWorldRuntimeLayer(
  history: CourseHistoryState,
  input: AddSpatialWorldRuntimeLayerInput,
): CourseHistoryState {
  spatialSurfaceIn(history.present, input.surfaceId)
  const item: RuntimeLayerItem = {
    layerItemId: input.id ?? `runtime-${nanoid(10)}`,
    label: input.label,
    kind: 'runtime',
    frame: {
      mode: 'absolute',
      x: input.x ?? 80,
      y: input.y ?? 80,
      width: input.width,
      height: input.height,
    },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    runtime: structuredClone(input.runtime),
  }
  const next = updateCourseProject(history.present, (draft) => {
    const surface = spatialSurfaceIn(draft, input.surfaceId)
    if (surface.world.layerItems.some((candidate) => candidate.layerItemId === item.layerItemId)) {
      throw new Error('世界元素 ID 已存在，请重新生成后重试')
    }
    const maxOrder = surface.world.layerItems.reduce(
      (highest, candidate) => Math.max(highest, candidate.order),
      -1,
    )
    item.order = maxOrder + 1
    surface.world.layerItems.push(item)
  }, input.now)
  return commitWorldProject(history, next)
}

function requireWorldSelection(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
): {
  view: ReturnType<typeof buildSpatialEditorView>
  worldIds: string[]
} {
  const view = buildSpatialEditorView({
    project: history.present,
    locationId: selection.locationId,
  })
  if (view.surfaceId !== selection.surfaceId) {
    throw new Error('所选空间表面已失效，请重新选择')
  }
  const layerById = new Map(view.layers.map((layer) => [layer.selectionId, layer]))
  const worldIds: string[] = []
  for (const layerItemId of selection.selectedLayerItemIds) {
    const layer = layerById.get(layerItemId)
    if (!layer) throw new Error('所选元素已失效，请重新选择')
    if (layer.source !== 'world') throw new Error('当前选择不属于当前空间世界')
    worldIds.push(layerItemId)
  }
  return { view, worldIds }
}

function refuseLockedWorldWrites(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
): void {
  const { view, worldIds } = requireWorldSelection(history, selection)
  const layerById = new Map(view.layers.map((layer) => [layer.selectionId, layer]))
  for (const layerItemId of worldIds) {
    if (layerById.get(layerItemId)?.item.locked) {
      throw new Error('当前元素已锁定')
    }
  }
}

function cascadeWorldReferences(
  surface: SpatialSurfaceDocument,
): void {
  const remaining = new Set(surface.world.layerItems.map((item) => item.layerItemId))
  surface.world.paths = (surface.world.paths ?? []).flatMap((path) => {
    const layerItemIds = path.layerItemIds.filter((layerItemId) => remaining.has(layerItemId))
    return layerItemIds.length === 0 ? [] : [{ ...path, layerItemIds }]
  })
  surface.world.relations = (surface.world.relations ?? []).filter((relation) => (
    remaining.has(relation.sourceLayerItemId) && remaining.has(relation.targetLayerItemId)
  ))
  surface.semanticZoom = surface.semanticZoom.flatMap((rule) => {
    const layerItemIds = rule.layerItemIds.filter((layerItemId) => remaining.has(layerItemId))
    return layerItemIds.length === 0 ? [] : [{ ...rule, layerItemIds }]
  })
}

export function deleteSpatialWorldLayers(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  now?: string,
): CourseHistoryState {
  refuseLockedWorldWrites(history, selection)
  const { worldIds } = requireWorldSelection(history, selection)
  if (worldIds.length === 0) return history
  const removedIds = new Set(worldIds)
  const next = updateCourseProject(history.present, (draft) => {
    const location = draft.locations.find((candidate) => candidate.id === selection.locationId)
    if (!location || location.kind !== 'spatial-camera') {
      throw new Error('当前空间镜头位置已失效')
    }
    const surface = draft.surfaces.find((candidate) => candidate.id === location.surfaceId)
    if (!surface || surface.type !== 'spatial-2d') {
      throw new Error('当前空间表面已失效')
    }
    surface.world.layerItems = surface.world.layerItems.filter(
      (item) => !removedIds.has(item.layerItemId),
    )
    cascadeWorldReferences(surface)
  }, now)
  return commitCourseHistory(history, next)
}

export function duplicateSpatialWorldLayers(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  now?: string,
): { history: CourseHistoryState; createdLayerItemIds: readonly string[] } {
  refuseLockedWorldWrites(history, selection)
  const { worldIds } = requireWorldSelection(history, selection)
  if (worldIds.length === 0) {
    return { history, createdLayerItemIds: [] }
  }
    const createdLayerItemIds: string[] = []
    const next = updateCourseProject(history.present, (draft) => {
    const surface = spatialSurfaceIn(draft, selection.surfaceId)
    const layerById = new Map(surface.world.layerItems.map((item) => [item.layerItemId, item]))
    let order = surface.world.layerItems.reduce(
      (highest, item) => Math.max(highest, item.order),
      -1,
    )
    for (const layerItemId of worldIds) {
      const item = layerById.get(layerItemId)
      if (!item) throw new Error('所选元素已失效，请重新选择')
      const duplicate = structuredClone(item)
      duplicate.layerItemId = `${item.kind}-${nanoid(10)}`
      duplicate.label = `${item.label} 副本`
      duplicate.frame.x += 24
      duplicate.frame.y += 24
      order += 1
      duplicate.order = order
      surface.world.layerItems.push(duplicate)
      createdLayerItemIds.push(duplicate.layerItemId)
    }
  }, now)
  return {
    history: commitCourseHistory(history, next),
    createdLayerItemIds: Object.freeze(createdLayerItemIds),
  }
}

export function setSpatialWorldLayerFlags(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  flags: { readonly locked?: boolean; readonly visible?: boolean },
  now?: string,
): CourseHistoryState {
  const { view, worldIds } = requireWorldSelection(history, selection)
  if (worldIds.length === 0) return history
  if (flags.visible !== undefined) {
    refuseLockedWorldWrites(history, selection)
  }
  const layerById = new Map(view.layers.map((layer) => [layer.selectionId, layer]))
  const changed = worldIds.some((layerItemId) => {
    const item = layerById.get(layerItemId)?.item
    if (!item) return false
    return (flags.locked !== undefined && item.locked !== flags.locked) ||
      (flags.visible !== undefined && item.visible !== flags.visible)
  })
  if (!changed) return history

  const next = updateCourseProject(history.present, (draft) => {
    const surface = spatialSurfaceIn(draft, selection.surfaceId)
    const items = new Map(surface.world.layerItems.map((item) => [item.layerItemId, item]))
    for (const layerItemId of worldIds) {
      const item = items.get(layerItemId)
      if (!item) throw new Error('所选元素已失效，请重新选择')
      if (flags.locked !== undefined) item.locked = flags.locked
      if (flags.visible !== undefined) item.visible = flags.visible
    }
  }, now)
  return commitCourseHistory(history, next)
}

export function renameSpatialWorldLayer(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  name: string,
  now?: string,
): CourseHistoryState {
  refuseLockedWorldWrites(history, selection)
  const { worldIds } = requireWorldSelection(history, selection)
  if (worldIds.length !== 1) throw new Error('请一次选择一项后重命名')
  const trimmed = name.trim()
  if (!trimmed) throw new Error('名称不能为空')
  if (trimmed.length > 120) throw new Error('名称不能超过 120 字')
  const next = updateCourseProject(history.present, (draft) => {
    const surface = spatialSurfaceIn(draft, selection.surfaceId)
    const item = surface.world.layerItems.find((candidate) => candidate.layerItemId === worldIds[0])
    if (!item) throw new Error('所选元素已失效，请重新选择')
    item.label = trimmed
  }, now)
  return commitCourseHistory(history, next)
}

export function editSpatialWorldText(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  text: string,
  now?: string,
): CourseHistoryState {
  refuseLockedWorldWrites(history, selection)
  const { view, worldIds } = requireWorldSelection(history, selection)
  if (worldIds.length !== 1) throw new Error('请选择一个文字元素后编辑')
  const layer = view.layers.find((candidate) => candidate.selectionId === worldIds[0])
  if (!layer || layer.item.kind !== 'native' || layer.item.content.nativeType !== 'text') {
    throw new Error('请选择一个文字元素后编辑')
  }
  const next = updateCourseProject(history.present, (draft) => {
    const surface = spatialSurfaceIn(draft, selection.surfaceId)
    const item = surface.world.layerItems.find((candidate) => candidate.layerItemId === worldIds[0])
    if (!item || item.kind !== 'native' || item.content.nativeType !== 'text') {
      throw new Error('请选择一个文字元素后编辑')
    }
    item.content.data.text = text
  }, now)
  return commitCourseHistory(history, next)
}

export function editSpatialWorldFormula(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  accessibleText: string,
  now?: string,
): CourseHistoryState {
  refuseLockedWorldWrites(history, selection)
  const { view, worldIds } = requireWorldSelection(history, selection)
  if (worldIds.length !== 1) throw new Error('请选择一个公式元素后编辑')
  const layer = view.layers.find((candidate) => candidate.selectionId === worldIds[0])
  if (!layer || layer.item.kind !== 'native' || layer.item.content.nativeType !== 'formula') {
    throw new Error('请选择一个公式元素后编辑')
  }
  const next = updateCourseProject(history.present, (draft) => {
    const surface = spatialSurfaceIn(draft, selection.surfaceId)
    const item = surface.world.layerItems.find((candidate) => candidate.layerItemId === worldIds[0])
    if (!item || item.kind !== 'native' || item.content.nativeType !== 'formula') {
      throw new Error('请选择一个公式元素后编辑')
    }
    item.content.data.accessibleText = accessibleText
  }, now)
  return commitCourseHistory(history, next)
}

export function replaceSpatialWorldMedia(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  assetId: string,
  now?: string,
): CourseHistoryState {
  refuseLockedWorldWrites(history, selection)
  const { view, worldIds } = requireWorldSelection(history, selection)
  if (worldIds.length !== 1) throw new Error('请选择一个图片或视频后替换')
  if (!history.present.assets[assetId]) throw new Error(`找不到素材：${assetId}`)
  const layer = view.layers.find((candidate) => candidate.selectionId === worldIds[0])
  if (
    !layer ||
    layer.item.kind !== 'native' ||
    (layer.item.content.nativeType !== 'image' && layer.item.content.nativeType !== 'video')
  ) {
    throw new Error('请选择一个图片或视频后替换')
  }
  const next = updateCourseProject(history.present, (draft) => {
    const surface = spatialSurfaceIn(draft, selection.surfaceId)
    const item = surface.world.layerItems.find((candidate) => candidate.layerItemId === worldIds[0])
    if (
      !item ||
      item.kind !== 'native' ||
      (item.content.nativeType !== 'image' && item.content.nativeType !== 'video')
    ) {
      throw new Error('请选择一个图片或视频后替换')
    }
    item.content.data.assetId = assetId
  }, now)
  return commitCourseHistory(history, next)
}

export type SpatialWorldReorderDirection = 'forward' | 'backward' | 'front' | 'back'

export function reorderSpatialWorldLayers(
  history: CourseHistoryState,
  selection: SpatialEditorSelection,
  direction: SpatialWorldReorderDirection,
  now?: string,
): CourseHistoryState {
  refuseLockedWorldWrites(history, selection)
  const { worldIds } = requireWorldSelection(history, selection)
  if (worldIds.length === 0) return history
  const selected = new Set(worldIds)
  const next = updateCourseProject(history.present, (draft) => {
    const surface = spatialSurfaceIn(draft, selection.surfaceId)
    const sorted = [...surface.world.layerItems].sort((left, right) => (
      left.order - right.order || left.layerItemId.localeCompare(right.layerItemId)
    ))
    const selectedItems = sorted.filter((item) => selected.has(item.layerItemId))
    const others = sorted.filter((item) => !selected.has(item.layerItemId))
    if (selectedItems.length === 0) throw new Error('所选元素已失效，请重新选择')

    let nextItems: LayerItem[]
    if (direction === 'front') {
      nextItems = [...others, ...selectedItems]
    } else if (direction === 'back') {
      nextItems = [...selectedItems, ...others]
    } else {
      const firstIndex = sorted.findIndex((item) => selected.has(item.layerItemId))
      const lastIndex = sorted.reduce(
        (found, item, index) => (selected.has(item.layerItemId) ? index : found),
        -1,
      )
      if (direction === 'forward') {
        if (lastIndex >= sorted.length - 1) {
          throw new Error('已经位于最前，不能再前移')
        }
        const neighbor = sorted[lastIndex + 1]!
        nextItems = [
          ...sorted.slice(0, firstIndex),
          neighbor,
          ...selectedItems,
          ...sorted.slice(lastIndex + 2),
        ]
      } else {
        if (firstIndex <= 0) {
          throw new Error('已经位于最后，不能再后移')
        }
        const neighbor = sorted[firstIndex - 1]!
        nextItems = [
          ...sorted.slice(0, firstIndex - 1),
          ...selectedItems,
          neighbor,
          ...sorted.slice(lastIndex + 1),
        ]
      }
    }

    const unchanged = nextItems.length === sorted.length &&
      nextItems.every((item, index) => item.layerItemId === sorted[index]?.layerItemId)
    if (unchanged) {
      throw new Error(direction === 'front' || direction === 'forward'
        ? '已经位于最前，不能再前移'
        : '已经位于最后，不能再后移')
    }

    const worldOrders = sorted.map((item) => item.order)
    nextItems.forEach((item, index) => {
      item.order = worldOrders[index]!
    })
    surface.world.layerItems = [...nextItems]
  }, now)
  return commitCourseHistory(history, next)
}

export interface SpatialEditorClipboard {
  readonly kind: 'world'
  readonly items: readonly LayerItem[]
}

export interface SpatialEditorActionContext {
  readonly history: CourseHistoryState
  readonly sessionCamera?: SpatialCameraPose
  readonly viewportSize?: { width: number; height: number }
  readonly clipboard?: SpatialEditorClipboard | null
  readonly now?: string
  readonly mediaAssetId?: string
  readonly renameValue?: string
  readonly editText?: string
  readonly editFormulaAccessibleText?: string
  readonly onViewportChange?: (pose: SpatialCameraPose) => void
  readonly onRequestEdit?: (input: {
    kind: 'text' | 'formula'
    layerItemId: string
    authoringAddress: string
  }) => void
}

export interface SpatialEditorActionResult {
  readonly ok: boolean
  readonly reason: string
  readonly history: CourseHistoryState
  readonly clipboard?: SpatialEditorClipboard
  readonly viewport?: SpatialCameraPose
  readonly selectedLayerItemIds?: readonly string[]
}

function worldSelectionFromSnapshot(
  project: CourseProjectDocument,
  snapshot: EditorSelectionSnapshot,
): SpatialEditorSelection {
  return selectSpatialEditorLayers({
    project,
    locationId: snapshot.locationId,
    selectedLayerItemIds: snapshot.targets.map((target) => target.layerItemId),
  })
}

function defaultViewportSize(
  context: SpatialEditorActionContext,
): { width: number; height: number } {
  return context.viewportSize ?? {
    width: STAGE_VIEWPORT_WIDTH,
    height: STAGE_VIEWPORT_HEIGHT,
  }
}

function poseOf(
  x: number,
  y: number,
  zoom: number,
): SpatialCameraPose {
  return { x, y, zoom }
}

/**
 * T10 surface adapter entry. One action is one history step when it writes.
 * Selecting a global layer never creates a camera or world item.
 */
export function executeSpatialEditorAction(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
  context: SpatialEditorActionContext,
): SpatialEditorActionResult {
  const unchanged = (
    reason: string,
    extra: Partial<SpatialEditorActionResult> = {},
  ): SpatialEditorActionResult => ({
    ok: extra.ok ?? false,
    reason,
    history: extra.history ?? context.history,
    clipboard: extra.clipboard,
    viewport: extra.viewport,
    selectedLayerItemIds: extra.selectedLayerItemIds,
  })

  if (snapshot.surfaceKind !== 'spatial-2d') {
    return unchanged('当前页面不是无限画布')
  }

  const writeActions = new Set<EditorActionId>([
    'cut', 'paste', 'duplicate', 'delete', 'rename',
    'move-forward', 'move-backward', 'bring-front', 'send-back',
    'show', 'hide', 'lock', 'unlock',
    'edit-text', 'edit-formula', 'replace-media',
    'insert-before', 'insert-after',
  ])
  if (
    writeActions.has(actionId) &&
    snapshot.projectRevision !== context.history.present.revision
  ) {
    return unchanged('课件已被修改，请重新选择后再试')
  }

  const owners = [...new Set(snapshot.targets.map((target) => target.owner))]
  if (owners.includes('global') && writeActions.has(actionId) && actionId !== 'paste') {
    return unchanged('选择全局层不能创建或改写世界元素；请交给全局层适配器')
  }

  try {
    return dispatchSpatialEditorAction(actionId, snapshot, context)
  } catch (error) {
    return unchanged(
      error instanceof Error && error.message.trim()
        ? error.message
        : '无限画布动作失败',
    )
  }
}

function dispatchSpatialEditorAction(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
  context: SpatialEditorActionContext,
): SpatialEditorActionResult {
  const ok = (
    reason: string,
    extra: Partial<SpatialEditorActionResult> = {},
  ): SpatialEditorActionResult => ({
    ok: true,
    reason,
    history: extra.history ?? context.history,
    clipboard: extra.clipboard,
    viewport: extra.viewport,
    selectedLayerItemIds: extra.selectedLayerItemIds,
  })
  const fail = (reason: string): SpatialEditorActionResult => ({
    ok: false,
    reason,
    history: context.history,
  })

  const owner = snapshot.owner
  const viewportSize = defaultViewportSize(context)
  const view = buildSpatialEditorView({
    project: context.history.present,
    locationId: snapshot.locationId,
  })
  const surface = spatialSurfaceIn(context.history.present, view.surfaceId)
  const sessionZoom = context.sessionCamera?.zoom ?? surface.camera.home.zoom

  if (actionId === 'fit') {
    const camera = fitSpatialCamera(spatialFiniteBounds(surface), viewportSize)
    const viewport = poseOf(camera.x, camera.y, camera.zoom)
    context.onViewportChange?.(viewport)
    return ok('已适配视图', { viewport })
  }
  if (actionId === 'reset-view') {
    const viewport = poseOf(surface.camera.home.x, surface.camera.home.y, surface.camera.home.zoom)
    context.onViewportChange?.(viewport)
    return ok('已重置视图', { viewport })
  }
  if (actionId === 'select-all') {
    const selectedLayerItemIds = Object.freeze(
      view.layers
        .filter((layer) => layer.source === 'world' && layer.effectiveVisible)
        .map((layer) => layer.selectionId),
    )
    return ok('已全选世界元素', { selectedLayerItemIds })
  }

  if (actionId === 'paste') {
    const clipboard = context.clipboard
    if (!clipboard || clipboard.items.length === 0) {
      return fail('剪贴板为空，无法粘贴')
    }
    const createdLayerItemIds: string[] = []
    const next = updateCourseProject(context.history.present, (draft) => {
      const draftSurface = spatialSurfaceIn(draft, view.surfaceId)
      let order = draftSurface.world.layerItems.reduce(
        (highest, item) => Math.max(highest, item.order),
        -1,
      )
      for (const source of clipboard.items) {
        const item = structuredClone(source)
        item.layerItemId = `${source.kind}-${nanoid(10)}`
        item.frame.x += 24
        item.frame.y += 24
        order += 1
        item.order = order
        draftSurface.world.layerItems.push(item)
        createdLayerItemIds.push(item.layerItemId)
      }
    }, context.now)
    return ok('已粘贴到世界', {
      history: commitCourseHistory(context.history, next),
      selectedLayerItemIds: Object.freeze(createdLayerItemIds),
    })
  }

  if (snapshot.targets.length === 0 && actionId !== 'insert-after' && actionId !== 'insert-before') {
    return fail('没有可操作的选择')
  }

  if (owner === 'spatial-camera') {
    return dispatchCameraAction(actionId, snapshot, context, view.surfaceId)
  }
  if (owner === 'spatial-path') {
    return dispatchPathAction(actionId, snapshot, context, view.surfaceId)
  }
  if (owner === 'spatial-relation') {
    return dispatchRelationAction(actionId, snapshot, context, view.surfaceId)
  }
  if (owner !== 'spatial-world') {
    if (actionId === 'focus' || actionId === 'copy' || actionId === 'duplicate' || actionId === 'delete') {
      return fail('选择全局层不能创建镜头或世界元素')
    }
    return fail('当前选择不属于无限画布世界')
  }

  const selection = worldSelectionFromSnapshot(context.history.present, snapshot)
  const first = snapshot.targets[0]

  switch (actionId) {
    case 'copy': {
      const items = selection.selectedLayerItemIds.map((layerItemId) => {
        const item = surface.world.layerItems.find((candidate) => candidate.layerItemId === layerItemId)
        if (!item) throw new Error('所选元素已失效，请重新选择')
        return structuredClone(item)
      })
      return ok('已复制世界元素', {
        clipboard: { kind: 'world', items: Object.freeze(items) },
      })
    }
    case 'cut': {
      const copied = dispatchSpatialEditorAction('copy', snapshot, context)
      if (!copied.ok || !copied.clipboard) return copied
      const deleted = deleteSpatialWorldLayers(context.history, selection, context.now)
      return ok('已剪切世界元素', { history: deleted, clipboard: copied.clipboard })
    }
    case 'duplicate': {
      const duplicated = duplicateSpatialWorldLayers(context.history, selection, context.now)
      return ok('已重复世界元素', {
        history: duplicated.history,
        selectedLayerItemIds: duplicated.createdLayerItemIds,
      })
    }
    case 'delete':
      return ok('已删除世界元素', {
        history: deleteSpatialWorldLayers(context.history, selection, context.now),
        selectedLayerItemIds: [],
      })
    case 'rename':
      if (!context.renameValue?.trim()) return fail('名称不能为空')
      return ok('已重命名', {
        history: renameSpatialWorldLayer(
          context.history,
          selection,
          context.renameValue,
          context.now,
        ),
      })
    case 'lock':
      return ok('已锁定', {
        history: setSpatialWorldLayerFlags(context.history, selection, { locked: true }, context.now),
      })
    case 'unlock':
      return ok('已解锁', {
        history: setSpatialWorldLayerFlags(context.history, selection, { locked: false }, context.now),
      })
    case 'hide':
      return ok('已隐藏', {
        history: setSpatialWorldLayerFlags(context.history, selection, { visible: false }, context.now),
      })
    case 'show':
      return ok('已显示', {
        history: setSpatialWorldLayerFlags(context.history, selection, { visible: true }, context.now),
      })
    case 'move-forward':
      return ok('已前移', {
        history: reorderSpatialWorldLayers(context.history, selection, 'forward', context.now),
      })
    case 'move-backward':
      return ok('已后移', {
        history: reorderSpatialWorldLayers(context.history, selection, 'backward', context.now),
      })
    case 'bring-front':
      return ok('已置顶', {
        history: reorderSpatialWorldLayers(context.history, selection, 'front', context.now),
      })
    case 'send-back':
      return ok('已置底', {
        history: reorderSpatialWorldLayers(context.history, selection, 'back', context.now),
      })
    case 'edit-text': {
      if (context.editText !== undefined) {
        return ok('已更新文字', {
          history: editSpatialWorldText(context.history, selection, context.editText, context.now),
        })
      }
      const layer = view.layers.find((candidate) => candidate.selectionId === first?.layerItemId)
      if (!layer) return fail('请选择一个文字元素后编辑')
      context.onRequestEdit?.({
        kind: 'text',
        layerItemId: layer.selectionId,
        authoringAddress: spatialLayerAuthoringAddress(view, layer),
      })
      return ok('已打开文字编辑')
    }
    case 'edit-formula': {
      if (context.editFormulaAccessibleText !== undefined) {
        return ok('已更新公式', {
          history: editSpatialWorldFormula(
            context.history,
            selection,
            context.editFormulaAccessibleText,
            context.now,
          ),
        })
      }
      const layer = view.layers.find((candidate) => candidate.selectionId === first?.layerItemId)
      if (!layer) return fail('请选择一个公式元素后编辑')
      context.onRequestEdit?.({
        kind: 'formula',
        layerItemId: layer.selectionId,
        authoringAddress: spatialLayerAuthoringAddress(view, layer),
      })
      return ok('已打开公式编辑')
    }
    case 'replace-media':
      if (!context.mediaAssetId) return fail('请选择要替换的媒体资源')
      return ok('已替换媒体', {
        history: replaceSpatialWorldMedia(
          context.history,
          selection,
          context.mediaAssetId,
          context.now,
        ),
      })
    case 'focus': {
      const item = surface.world.layerItems.find((candidate) => candidate.layerItemId === first?.layerItemId)
      if (!item) return fail('所选元素已失效，请重新选择')
      const viewport = poseOf(
        item.frame.x + item.frame.width / 2,
        item.frame.y + item.frame.height / 2,
        sessionZoom,
      )
      context.onViewportChange?.(viewport)
      return ok('已聚焦世界元素', { viewport })
    }
    case 'insert-before':
    case 'insert-after':
      return fail('世界元素不支持在前/后插入；请使用新增世界元素')
    case 'indent':
    case 'outdent':
      return fail('只有 Flow 块支持缩进')
    default:
      return fail(`无限画布不支持该动作：${actionId}`)
  }
}

function dispatchCameraAction(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
  context: SpatialEditorActionContext,
  surfaceId: string,
): SpatialEditorActionResult {
  const frameId = snapshot.targets[0]?.layerItemId
  if (!frameId) {
    return { ok: false, reason: '没有可操作的镜头', history: context.history }
  }
  const surface = spatialSurfaceIn(context.history.present, surfaceId)
  const frame = surface.camera.frames.find((candidate) => candidate.id === frameId)
  if (!frame) {
    return { ok: false, reason: '找不到镜头画面，请刷新后重试', history: context.history }
  }
  if (actionId === 'delete') {
    return {
      ok: true,
      reason: '已删除镜头',
      history: deleteSpatialCameraFrame(context.history, surfaceId, frameId, context.now),
    }
  }
  if (actionId === 'rename') {
    if (!context.renameValue?.trim()) {
      return { ok: false, reason: '镜头名称不能为空', history: context.history }
    }
    return {
      ok: true,
      reason: '已重命名镜头',
      history: renameSpatialCameraFrame(
        context.history,
        surfaceId,
        frameId,
        context.renameValue,
        context.now,
      ),
    }
  }
  if (actionId === 'move-forward' || actionId === 'move-backward') {
    const index = surface.camera.frames.findIndex((candidate) => candidate.id === frameId)
    const toIndex = actionId === 'move-forward' ? index - 1 : index + 1
    return {
      ok: true,
      reason: actionId === 'move-forward' ? '已上移镜头' : '已下移镜头',
      history: reorderSpatialCameraFrames(context.history, surfaceId, frameId, toIndex, context.now),
    }
  }
  if (actionId === 'duplicate') {
    return {
      ok: true,
      reason: '已复制镜头',
      history: addSpatialEditorCameraFrame(
        context.history,
        surfaceId,
        { x: frame.x, y: frame.y, zoom: frame.zoom },
        { name: `${frame.name} 副本`, now: context.now },
      ),
    }
  }
  if (actionId === 'focus') {
    const viewport = poseOf(frame.x, frame.y, frame.zoom)
    context.onViewportChange?.(viewport)
    return { ok: true, reason: '已聚焦镜头', history: context.history, viewport }
  }
  if (actionId === 'copy') {
    return { ok: false, reason: '镜头请使用重复，而不是复制到剪贴板', history: context.history }
  }
  return { ok: false, reason: `镜头不支持该动作：${actionId}`, history: context.history }
}

function dispatchPathAction(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
  context: SpatialEditorActionContext,
  surfaceId: string,
): SpatialEditorActionResult {
  const pathId = snapshot.targets[0]?.layerItemId
  if (!pathId) {
    return { ok: false, reason: '没有可操作的路径', history: context.history }
  }
  const surface = spatialSurfaceIn(context.history.present, surfaceId)
  const path = (surface.world.paths ?? []).find((candidate) => candidate.id === pathId)
  if (!path) {
    return { ok: false, reason: '找不到路径，请刷新后重试', history: context.history }
  }
  if (actionId === 'delete') {
    return {
      ok: true,
      reason: '已删除路径',
      history: deleteSpatialPath(context.history, surfaceId, pathId, context.now),
    }
  }
  if (actionId === 'duplicate') {
    return {
      ok: true,
      reason: '已重复路径',
      history: addSpatialPath(context.history, {
        surfaceId,
        name: `${path.name} 副本`,
        layerItemIds: path.layerItemIds,
        style: path.style,
        now: context.now,
      }),
    }
  }
  if (actionId === 'focus') {
    const items = path.layerItemIds
      .map((layerItemId) => surface.world.layerItems.find((item) => item.layerItemId === layerItemId))
      .filter((item): item is LayerItem => Boolean(item))
    if (items.length === 0) {
      return { ok: false, reason: '路径没有可聚焦的世界图层', history: context.history }
    }
    const minX = Math.min(...items.map((item) => item.frame.x))
    const minY = Math.min(...items.map((item) => item.frame.y))
    const maxX = Math.max(...items.map((item) => item.frame.x + item.frame.width))
    const maxY = Math.max(...items.map((item) => item.frame.y + item.frame.height))
    const viewport = poseOf((minX + maxX) / 2, (minY + maxY) / 2, context.sessionCamera?.zoom ?? 1)
    context.onViewportChange?.(viewport)
    return { ok: true, reason: '已聚焦路径', history: context.history, viewport }
  }
  return { ok: false, reason: `路径不支持该动作：${actionId}`, history: context.history }
}

function dispatchRelationAction(
  actionId: EditorActionId,
  snapshot: EditorSelectionSnapshot,
  context: SpatialEditorActionContext,
  surfaceId: string,
): SpatialEditorActionResult {
  const relationId = snapshot.targets[0]?.layerItemId
  if (!relationId) {
    return { ok: false, reason: '没有可操作的关系', history: context.history }
  }
  const surface = spatialSurfaceIn(context.history.present, surfaceId)
  const relation = (surface.world.relations ?? []).find((candidate) => candidate.id === relationId)
  if (!relation) {
    return { ok: false, reason: '找不到关系连线，请刷新后重试', history: context.history }
  }
  if (actionId === 'delete') {
    return {
      ok: true,
      reason: '已删除关系',
      history: deleteSpatialRelation(context.history, surfaceId, relationId, context.now),
    }
  }
  if (actionId === 'duplicate') {
    return {
      ok: true,
      reason: '已重复关系',
      history: addSpatialRelation(context.history, {
        surfaceId,
        sourceLayerItemId: relation.sourceLayerItemId,
        targetLayerItemId: relation.targetLayerItemId,
        kind: relation.kind,
        label: relation.label,
        now: context.now,
      }),
    }
  }
  if (actionId === 'focus') {
    const source = surface.world.layerItems.find((item) => item.layerItemId === relation.sourceLayerItemId)
    const target = surface.world.layerItems.find((item) => item.layerItemId === relation.targetLayerItemId)
    if (!source || !target) {
      return { ok: false, reason: '关系连线引用了不存在的世界图层', history: context.history }
    }
    const viewport = poseOf(
      (source.frame.x + source.frame.width / 2 + target.frame.x + target.frame.width / 2) / 2,
      (source.frame.y + source.frame.height / 2 + target.frame.y + target.frame.height / 2) / 2,
      context.sessionCamera?.zoom ?? 1,
    )
    context.onViewportChange?.(viewport)
    return { ok: true, reason: '已聚焦关系', history: context.history, viewport }
  }
  return { ok: false, reason: `关系不支持该动作：${actionId}`, history: context.history }
}

export function createSpatialEditorActionAdapter(options: {
  getContext: () => SpatialEditorActionContext
  applyResult?: (result: SpatialEditorActionResult) => void
}): EditorActionAdapter {
  return {
    execute(actionId, snapshot) {
      const result = executeSpatialEditorAction(actionId, snapshot, options.getContext())
      options.applyResult?.(result)
      return { ok: result.ok, reason: result.reason }
    },
  }
}
