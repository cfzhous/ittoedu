import { nanoid } from 'nanoid'
import type {
  CourseProjectDocument,
  SpatialPathDocument,
  SpatialPathStyle,
  SpatialRelationDocument,
  SpatialRelationKind,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import {
  commitCourseHistory,
  type CourseHistoryState,
  updateCourseProject,
} from './courseStudioModel'

export interface AddSpatialPathInput {
  readonly surfaceId: string
  readonly name: string
  readonly layerItemIds: readonly string[]
  readonly style?: SpatialPathStyle
  readonly id?: string
  readonly now?: string
}

export interface AddSpatialRelationInput {
  readonly surfaceId: string
  readonly sourceLayerItemId: string
  readonly targetLayerItemId: string
  readonly kind: SpatialRelationKind
  readonly label?: string
  readonly id?: string
  readonly now?: string
}

export type SpatialPathUpdate =
  | Partial<Omit<SpatialPathDocument, 'id'>>
  | ((path: SpatialPathDocument) => void)

export type SpatialRelationUpdate =
  | Partial<Omit<SpatialRelationDocument, 'id'>>
  | ((relation: SpatialRelationDocument) => void)

function stableId(prefix: string, preferred?: string): string {
  return preferred ?? `${prefix}-${nanoid(10)}`
}

function spatialSurfaceIn(
  project: CourseProjectDocument,
  surfaceId: string,
): SpatialSurfaceDocument {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface) throw new Error('找不到空间表面，请刷新后重试')
  if (surface.type !== 'spatial-2d') throw new Error('目标不是空间表面，请重新选择')
  return surface
}

function worldPaths(surface: SpatialSurfaceDocument): SpatialPathDocument[] {
  return surface.world.paths ?? []
}

function worldRelations(surface: SpatialSurfaceDocument): SpatialRelationDocument[] {
  return surface.world.relations ?? []
}

function spatialPathIn(
  surface: SpatialSurfaceDocument,
  pathId: string,
): SpatialPathDocument {
  const path = worldPaths(surface).find((candidate) => candidate.id === pathId)
  if (!path) throw new Error('找不到路径，请刷新后重试')
  return path
}

function spatialRelationIn(
  surface: SpatialSurfaceDocument,
  relationId: string,
): SpatialRelationDocument {
  const relation = worldRelations(surface).find((candidate) => candidate.id === relationId)
  if (!relation) throw new Error('找不到关系连线，请刷新后重试')
  return relation
}

function validatePathName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('路径名称不能为空')
  if (trimmed.length > 200) throw new Error('路径名称不能超过 200 字')
  return trimmed
}

function validateRelationLabel(label: string | undefined): string | undefined {
  if (label === undefined) return undefined
  const trimmed = label.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 500) throw new Error('关系标签不能超过 500 字')
  return trimmed
}

function validatePathStyle(style: SpatialPathStyle | undefined): SpatialPathStyle | undefined {
  if (style === undefined) return undefined
  if (style.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(style.color)) {
    throw new Error('路径颜色格式应为 #RRGGBB')
  }
  if (
    style.width !== undefined &&
    (!Number.isFinite(style.width) || style.width <= 0 || style.width > 10_000)
  ) {
    throw new Error('路径线宽必须大于 0 且不超过 10000')
  }
  if (
    style.dash !== undefined &&
    style.dash !== 'solid' &&
    style.dash !== 'dashed' &&
    style.dash !== 'dotted'
  ) {
    throw new Error('路径线型无效，请重新选择')
  }
  return {
    ...(style.color !== undefined ? { color: style.color } : {}),
    ...(style.width !== undefined ? { width: style.width } : {}),
    ...(style.dash !== undefined ? { dash: style.dash } : {}),
  }
}

function validatePathLayerItemIds(
  surface: SpatialSurfaceDocument,
  layerItemIds: readonly string[],
): void {
  if (layerItemIds.length === 0) {
    throw new Error('路径至少需要经过一个世界图层')
  }
  if (new Set(layerItemIds).size !== layerItemIds.length) {
    throw new Error('路径不能重复经过同一图层')
  }
  const worldIds = new Set(surface.world.layerItems.map((item) => item.layerItemId))
  const danglingId = layerItemIds.find((layerItemId) => !worldIds.has(layerItemId))
  if (danglingId !== undefined) {
    throw new Error('路径引用了不存在的世界图层')
  }
}

function validateRelationEndpoints(
  surface: SpatialSurfaceDocument,
  sourceLayerItemId: string,
  targetLayerItemId: string,
): void {
  const worldIds = new Set(surface.world.layerItems.map((item) => item.layerItemId))
  if (!worldIds.has(sourceLayerItemId) || !worldIds.has(targetLayerItemId)) {
    throw new Error('关系连线引用了不存在的世界图层')
  }
  if (sourceLayerItemId === targetLayerItemId) {
    throw new Error('关系连线的起点和终点不能是同一个图层')
  }
}

function validateRelationKind(kind: SpatialRelationKind): void {
  if (kind !== 'line' && kind !== 'arrow' && kind !== 'bidirectional') {
    throw new Error('关系连线类型无效，请重新选择')
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => valuesEqual(value, right[index]))
  }
  if (
    left === null || right === null ||
    typeof left !== 'object' || typeof right !== 'object'
  ) return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  return leftKeys.length === Object.keys(rightRecord).length &&
    leftKeys.every((key) => (
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      valuesEqual(leftRecord[key], rightRecord[key])
    ))
}

/**
 * Adds one Spatial path. World layer ids must already exist in the surface
 * world; exactly one Project revision and one history entry are created.
 */
export function addSpatialPath(
  history: CourseHistoryState,
  input: AddSpatialPathInput,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, input.surfaceId)
  const name = validatePathName(input.name)
  const layerItemIds = [...input.layerItemIds]
  validatePathLayerItemIds(surface, layerItemIds)
  const style = validatePathStyle(input.style)

  const pathId = stableId('path', input.id)
  if (worldPaths(surface).some((path) => path.id === pathId)) {
    throw new Error('路径 ID 已存在，请重新生成后重试')
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, input.surfaceId)
    const paths = draftSurface.world.paths ?? []
    paths.push({
      id: pathId,
      name,
      layerItemIds,
      ...(style !== undefined ? { style } : {}),
    })
    draftSurface.world.paths = paths
  }, input.now)

  return commitCourseHistory(history, next)
}

/**
 * Updates one Spatial path immutably. The id never changes and the merged
 * result is validated against the current world layers before committing.
 */
export function updateSpatialPath(
  history: CourseHistoryState,
  surfaceId: string,
  pathId: string,
  update: SpatialPathUpdate,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  const current = spatialPathIn(surface, pathId)

  const nextPath = structuredClone(current)
  if (typeof update === 'function') {
    update(nextPath)
  } else if (update !== null && typeof update === 'object') {
    Object.assign(nextPath, structuredClone(update))
  } else {
    throw new Error('路径更新数据无效')
  }
  nextPath.id = current.id

  nextPath.name = validatePathName(nextPath.name)
  validatePathLayerItemIds(surface, nextPath.layerItemIds)
  nextPath.style = validatePathStyle(nextPath.style)

  if (!valuesEqual(current, nextPath)) {
    const next = updateCourseProject(project, (draft) => {
      const draftSurface = spatialSurfaceIn(draft, surfaceId)
      const paths = draftSurface.world.paths ?? []
      const index = paths.findIndex((path) => path.id === pathId)
      if (index < 0) throw new Error('找不到路径，请刷新后重试')
      paths[index] = nextPath
      draftSurface.world.paths = paths
    }, now)
    return commitCourseHistory(history, next)
  }

  return history
}

/** Deletes one Spatial path in a single history entry. */
export function deleteSpatialPath(
  history: CourseHistoryState,
  surfaceId: string,
  pathId: string,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  if (!worldPaths(surface).some((path) => path.id === pathId)) {
    throw new Error('找不到路径，请刷新后重试')
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    const paths = draftSurface.world.paths ?? []
    const index = paths.findIndex((path) => path.id === pathId)
    if (index < 0) throw new Error('找不到路径，请刷新后重试')
    paths.splice(index, 1)
    draftSurface.world.paths = paths
  }, now)

  return commitCourseHistory(history, next)
}

/**
 * Adds one Spatial relation. Source and target must exist in the current world
 * and must differ; exactly one Project revision and one history entry are made.
 */
export function addSpatialRelation(
  history: CourseHistoryState,
  input: AddSpatialRelationInput,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, input.surfaceId)
  validateRelationEndpoints(surface, input.sourceLayerItemId, input.targetLayerItemId)
  validateRelationKind(input.kind)
  const label = validateRelationLabel(input.label)

  const relationId = stableId('relation', input.id)
  if (worldRelations(surface).some((relation) => relation.id === relationId)) {
    throw new Error('关系连线 ID 已存在，请重新生成后重试')
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, input.surfaceId)
    const relations = draftSurface.world.relations ?? []
    relations.push({
      id: relationId,
      sourceLayerItemId: input.sourceLayerItemId,
      targetLayerItemId: input.targetLayerItemId,
      kind: input.kind,
      ...(label !== undefined ? { label } : {}),
    })
    draftSurface.world.relations = relations
  }, input.now)

  return commitCourseHistory(history, next)
}

/**
 * Updates one Spatial relation immutably. The id never changes and the merged
 * result is validated against the current world layers before committing.
 */
export function updateSpatialRelation(
  history: CourseHistoryState,
  surfaceId: string,
  relationId: string,
  update: SpatialRelationUpdate,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  const current = spatialRelationIn(surface, relationId)

  const nextRelation = structuredClone(current)
  if (typeof update === 'function') {
    update(nextRelation)
  } else if (update !== null && typeof update === 'object') {
    Object.assign(nextRelation, structuredClone(update))
  } else {
    throw new Error('关系连线更新数据无效')
  }
  nextRelation.id = current.id

  validateRelationEndpoints(
    surface,
    nextRelation.sourceLayerItemId,
    nextRelation.targetLayerItemId,
  )
  validateRelationKind(nextRelation.kind)
  nextRelation.label = validateRelationLabel(nextRelation.label)

  if (!valuesEqual(current, nextRelation)) {
    const next = updateCourseProject(project, (draft) => {
      const draftSurface = spatialSurfaceIn(draft, surfaceId)
      const relations = draftSurface.world.relations ?? []
      const index = relations.findIndex((relation) => relation.id === relationId)
      if (index < 0) throw new Error('找不到关系连线，请刷新后重试')
      relations[index] = nextRelation
      draftSurface.world.relations = relations
    }, now)
    return commitCourseHistory(history, next)
  }

  return history
}

/** Deletes one Spatial relation in a single history entry. */
export function deleteSpatialRelation(
  history: CourseHistoryState,
  surfaceId: string,
  relationId: string,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  if (!worldRelations(surface).some((relation) => relation.id === relationId)) {
    throw new Error('找不到关系连线，请刷新后重试')
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    const relations = draftSurface.world.relations ?? []
    const index = relations.findIndex((relation) => relation.id === relationId)
    if (index < 0) throw new Error('找不到关系连线，请刷新后重试')
    relations.splice(index, 1)
    draftSurface.world.relations = relations
  }, now)

  return commitCourseHistory(history, next)
}
