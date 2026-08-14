import { nanoid } from 'nanoid'
import { layerItemSchema } from '../../shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  LayerItem,
  LocationVisibility,
  ScopedLayerItem,
} from '../../shared/courseProjectTypes'
import { updateCourseProject, type CourseLayerSource } from './courseStudioModel'

export const COURSE_LAYER_CLIPBOARD_VERSION = 1 as const
export const COURSE_LAYER_PASTE_OFFSET = 24 as const

export interface CourseLayerClipboardSelection {
  surfaceId: string
  sceneId?: string
  source: CourseLayerSource
  layerItemId: string
}

export interface CourseLayerClipboardEntry {
  item: LayerItem
  source: {
    scope: CourseLayerSource
    surfaceId: string
    sceneId?: string
    /** Present only when the source collection has location-scoped visibility. */
    visibility?: LocationVisibility
  }
}

/**
 * An in-memory, Project V9-only clipboard payload. It deliberately contains
 * LayerItem facts rather than DOM nodes, temporary hit ids or authoring paths.
 */
export interface CourseLayerClipboardSnapshot {
  kind: 'course-layer-items'
  version: typeof COURSE_LAYER_CLIPBOARD_VERSION
  sourceProjectId: string
  entries: CourseLayerClipboardEntry[]
}

/**
 * Scoped source visibility never follows a paste implicitly.
 *
 * - reset-for-target: local Slide/Spatial destinations discard it; a Flow
 *   surface stores `all`.
 * - current-location: a Flow surface stores an explicit include rule.
 * - preserve-source: supported only when every copied entry came from a scoped
 *   collection and every referenced location belongs to the target surface.
 */
export type CourseLayerScopedVisibilityPolicy =
  | { mode: 'reset-for-target' }
  | { mode: 'current-location'; locationId: string }
  | { mode: 'preserve-source' }

export interface CourseLayerPasteTarget {
  surfaceId: string
  /** Required for Slide; rejected for Flow and Spatial to expose stale UI state. */
  sceneId?: string
  scopedVisibility: CourseLayerScopedVisibilityPolicy
}

export interface CourseLayerPasteOptions {
  now?: string
  /** Test/tooling seam. Production callers should let the helper create ids. */
  createLayerItemId?: (input: {
    sourceLayerItemId: string
    kind: LayerItem['kind']
    index: number
  }) => string
}

export interface CourseLayerPasteResult {
  project: CourseProjectDocument
  /** Clipboard order, which is also the new unified back-to-front order. */
  pastedIds: string[]
}

export interface CourseLayerCutResult {
  project: CourseProjectDocument
  clipboard: CourseLayerClipboardSnapshot
  cutIds: string[]
}

export interface CourseLayerDuplicateResult {
  project: CourseProjectDocument
  duplicatedIds: string[]
  /** The exact source scope for each duplicated id, in clipboard order. */
  sources: CourseLayerClipboardEntry['source'][]
}

export class CourseLayerClipboardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CourseLayerClipboardError'
  }
}

interface LocatedLayerItem {
  item: LayerItem
  visibility?: LocationVisibility
}

function findSurface(
  project: CourseProjectDocument,
  surfaceId: string,
): CourseSurfaceDocument {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface) throw new CourseLayerClipboardError(`找不到表面：${surfaceId}`)
  return surface
}

function locateClipboardSource(
  project: CourseProjectDocument,
  selection: CourseLayerClipboardSelection,
): LocatedLayerItem {
  const surface = findSurface(project, selection.surfaceId)
  let items: readonly LayerItem[]
  let scopedEntries: readonly ScopedLayerItem[] | undefined

  if (selection.source === 'global') {
    scopedEntries = project.globalLayerItems
    items = scopedEntries.map((entry) => entry.item)
  } else if (selection.source === 'surface') {
    scopedEntries = surface.surfaceLayerItems
    items = scopedEntries.map((entry) => entry.item)
  } else if (selection.source === 'scene') {
    if (surface.type !== 'slide') {
      throw new CourseLayerClipboardError('当前表面不支持场景图层复制')
    }
    if (!selection.sceneId) throw new CourseLayerClipboardError('复制 Slide 图层时缺少场景 ID')
    const scene = surface.scenes.find((candidate) => candidate.id === selection.sceneId)
    if (!scene) throw new CourseLayerClipboardError(`找不到场景：${selection.sceneId}`)
    items = scene.layerItems
  } else {
    if (surface.type !== 'spatial-2d') {
      throw new CourseLayerClipboardError('当前表面不支持世界图层复制')
    }
    items = surface.world.layerItems
  }

  const index = items.findIndex((candidate) => candidate.layerItemId === selection.layerItemId)
  if (index < 0) throw new CourseLayerClipboardError(`找不到图层：${selection.layerItemId}`)
  return {
    item: items[index]!,
    ...(scopedEntries
      ? { visibility: structuredClone(scopedEntries[index]!.visibility) }
      : {}),
  }
}

function assetIn(
  project: CourseProjectDocument,
  assetId: string,
  expectedKind: 'image' | 'video' | undefined,
  label: string,
): void {
  const asset = project.assets[assetId]
  if (!asset) throw new CourseLayerClipboardError(`${label}引用的素材不存在：${assetId}`)
  if (expectedKind && asset.kind !== expectedKind) {
    throw new CourseLayerClipboardError(`${label}引用了错误类型的素材：${assetId}`)
  }
}

function assertLayerDependencies(
  project: CourseProjectDocument,
  item: LayerItem,
  operation: '复制' | '粘贴',
): void {
  const label = `${operation}图层“${item.label}”时`
  if (item.kind === 'component') {
    const component = project.componentPackages[item.component.packageId]
    if (!component || component.version !== item.component.version) {
      throw new CourseLayerClipboardError(
        `${label}找不到组件包：${item.component.packageId}@${item.component.version}`,
      )
    }
    if (item.staticFallbackAssetId) {
      assetIn(project, item.staticFallbackAssetId, 'image', label)
    }
    return
  }
  if (item.kind === 'runtime') {
    Object.values(item.runtime.assets).forEach(({ assetId }) => {
      assetIn(project, assetId, undefined, label)
    })
    if (item.runtime.staticFallback) {
      assetIn(project, item.runtime.staticFallback.assetId, 'image', label)
    }
    return
  }
  if (item.content.nativeType === 'image') {
    assetIn(project, item.content.data.assetId, 'image', label)
  } else if (item.content.nativeType === 'video') {
    assetIn(project, item.content.data.assetId, 'video', label)
    if (item.content.data.poster.assetId) {
      assetIn(project, item.content.data.poster.assetId, 'image', label)
    }
  }
}

/** Captures one mixed Native/Runtime/Component/controller selection. */
export function copyCourseLayerItems(
  project: CourseProjectDocument,
  selections: readonly CourseLayerClipboardSelection[],
): CourseLayerClipboardSnapshot {
  if (selections.length === 0) throw new CourseLayerClipboardError('请先选择要复制的图层')
  const selectedIds = new Set<string>()
  const entries = selections.map((selection) => {
    if (selectedIds.has(selection.layerItemId)) {
      throw new CourseLayerClipboardError(`选区中包含重复图层：${selection.layerItemId}`)
    }
    selectedIds.add(selection.layerItemId)
    const located = locateClipboardSource(project, selection)
    const parsed = layerItemSchema.safeParse(structuredClone(located.item))
    if (!parsed.success) {
      throw new CourseLayerClipboardError(`图层“${located.item.label}”的数据无效，无法复制`)
    }
    assertLayerDependencies(project, parsed.data, '复制')
    return {
      item: parsed.data,
      source: {
        scope: selection.source,
        surfaceId: selection.surfaceId,
        ...(selection.sceneId ? { sceneId: selection.sceneId } : {}),
        ...(located.visibility ? { visibility: located.visibility } : {}),
      },
    } satisfies CourseLayerClipboardEntry
  })

  entries.sort((left, right) => (
    left.item.order - right.item.order ||
    left.item.layerItemId.localeCompare(right.item.layerItemId)
  ))
  return {
    kind: 'course-layer-items',
    version: COURSE_LAYER_CLIPBOARD_VERSION,
    sourceProjectId: project.id,
    entries,
  }
}

function referencedByInteraction(project: CourseProjectDocument, layerItemId: string): boolean {
  const rules = [
    ...project.globalInteractions,
    ...project.surfaces.flatMap((surface) => (
      surface.type === 'slide' ? surface.scenes.flatMap((scene) => scene.interactions) : []
    )),
  ]
  return rules.some((rule) => (
    ('nodeId' in rule.trigger && rule.trigger.nodeId === layerItemId) ||
    rule.actions.some(({ action }) => 'nodeId' in action && action.nodeId === layerItemId)
  ))
}

function assertCutIsSafe(
  project: CourseProjectDocument,
  clipboard: CourseLayerClipboardSnapshot,
): void {
  const cutIds = new Set(clipboard.entries.map((entry) => entry.item.layerItemId))
  const locked = clipboard.entries.find((entry) => entry.item.locked)
  if (locked) {
    throw new CourseLayerClipboardError(`图层“${locked.item.label}”已锁定，可以复制但不能剪切`)
  }
  const spatialRelation = project.surfaces
    .filter((surface) => surface.type === 'spatial-2d')
    .flatMap((surface) => surface.relations)
    .find((relation) => [
      relation.sourceLayerItemId,
      relation.targetLayerItemId,
      relation.lineLayerItemId,
      relation.labelLayerItemId,
    ].some((layerItemId) => layerItemId !== undefined && cutIds.has(layerItemId)))
  if (spatialRelation) {
    throw new CourseLayerClipboardError(
      `所选图层仍属于空间关系“${spatialRelation.name}”，请先删除该关系再剪切`,
    )
  }
  const interactionTarget = [...cutIds].find((layerItemId) => (
    referencedByInteraction(project, layerItemId)
  ))
  if (interactionTarget) {
    throw new CourseLayerClipboardError(`图层仍被交互引用，无法剪切：${interactionTarget}`)
  }
  const remainingRuntimeReference = allLayerItems(project).find((item) => (
    !cutIds.has(item.layerItemId) &&
    item.kind === 'runtime' &&
    Object.values(item.runtime.nodeBindings ?? {}).some((layerItemId) => cutIds.has(layerItemId))
  ))
  if (remainingRuntimeReference) {
    throw new CourseLayerClipboardError(
      `图层仍被互动内容“${remainingRuntimeReference.label}”使用，无法剪切`,
    )
  }
}

function removeClipboardSelection(
  project: CourseProjectDocument,
  selection: CourseLayerClipboardSelection,
): void {
  const surface = findSurface(project, selection.surfaceId)
  let remove: () => boolean
  if (selection.source === 'global') {
    remove = () => {
      const index = project.globalLayerItems.findIndex(
        (entry) => entry.item.layerItemId === selection.layerItemId,
      )
      if (index < 0) return false
      project.globalLayerItems.splice(index, 1)
      return true
    }
  } else if (selection.source === 'surface') {
    remove = () => {
      const index = surface.surfaceLayerItems.findIndex(
        (entry) => entry.item.layerItemId === selection.layerItemId,
      )
      if (index < 0) return false
      surface.surfaceLayerItems.splice(index, 1)
      return true
    }
  } else if (selection.source === 'scene') {
    if (surface.type !== 'slide' || !selection.sceneId) {
      throw new CourseLayerClipboardError('剪切场景图层时的表面/场景无效')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === selection.sceneId)
    if (!scene) throw new CourseLayerClipboardError(`找不到场景：${selection.sceneId}`)
    remove = () => {
      const index = scene.layerItems.findIndex(
        (item) => item.layerItemId === selection.layerItemId,
      )
      if (index < 0) return false
      scene.layerItems.splice(index, 1)
      return true
    }
  } else {
    if (surface.type !== 'spatial-2d') {
      throw new CourseLayerClipboardError('剪切世界图层时的表面无效')
    }
    remove = () => {
      const index = surface.world.layerItems.findIndex(
        (item) => item.layerItemId === selection.layerItemId,
      )
      if (index < 0) return false
      surface.world.layerItems.splice(index, 1)
      return true
    }
  }
  if (!remove()) throw new CourseLayerClipboardError(`找不到图层：${selection.layerItemId}`)
}

function repairCutLayerReferences(
  project: CourseProjectDocument,
  cutIds: ReadonlySet<string>,
): void {
  project.surfaces.forEach((surface) => {
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene) => {
        scene.presentation?.states.forEach((state) => {
          cutIds.forEach((layerItemId) => delete state.layerItemOverrides[layerItemId])
          if (state.layerItemOrder) {
            state.layerItemOrder = state.layerItemOrder.filter((layerItemId) => !cutIds.has(layerItemId))
          }
        })
      })
    } else if (surface.type === 'spatial-2d') {
      surface.semanticZoom = surface.semanticZoom.flatMap((rule) => {
        const layerItemIds = rule.layerItemIds.filter((layerItemId) => !cutIds.has(layerItemId))
        return layerItemIds.length > 0 ? [{ ...rule, layerItemIds }] : []
      })
    }
  })
}

/**
 * Ctrl+X companion: captures first, then removes the exact source collections
 * in one revision. Locked or externally referenced selections fail in Chinese
 * instead of leaving a structurally valid but semantically dangling project.
 */
export function cutCourseLayerItems(
  project: CourseProjectDocument,
  selections: readonly CourseLayerClipboardSelection[],
  now?: string,
): CourseLayerCutResult {
  const clipboard = copyCourseLayerItems(project, selections)
  assertCutIsSafe(project, clipboard)
  const cutIds = new Set(clipboard.entries.map((entry) => entry.item.layerItemId))
  const next = updateCourseProject(project, (draft) => {
    selections.forEach((selection) => removeClipboardSelection(draft, selection))
    repairCutLayerReferences(draft, cutIds)
    sortAllLayerCollections(draft)
  }, now)
  return { project: next, clipboard, cutIds: [...cutIds] }
}

function insertDuplicateAtSource(
  project: CourseProjectDocument,
  entry: CourseLayerClipboardEntry,
  item: LayerItem,
): void {
  const surface = findSurface(project, entry.source.surfaceId)
  if (entry.source.scope === 'global') {
    project.globalLayerItems.push({
      item,
      visibility: structuredClone(entry.source.visibility ?? { mode: 'all', locationIds: [] }),
    })
    return
  }
  if (entry.source.scope === 'surface') {
    surface.surfaceLayerItems.push({
      item,
      visibility: structuredClone(entry.source.visibility ?? { mode: 'all', locationIds: [] }),
    })
    return
  }
  if (entry.source.scope === 'scene') {
    if (surface.type !== 'slide' || !entry.source.sceneId) {
      throw new CourseLayerClipboardError('复制场景图层时的内容或场景已变化')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === entry.source.sceneId)
    if (!scene) throw new CourseLayerClipboardError(`找不到场景：${entry.source.sceneId}`)
    scene.layerItems.push(item)
    return
  }
  if (surface.type !== 'spatial-2d') {
    throw new CourseLayerClipboardError('复制空间图层时的内容已变化')
  }
  surface.world.layerItems.push(item)
}

/**
 * Ctrl+D companion. Unlike an ordinary cross-surface paste, duplication keeps
 * every item in its exact global/surface/scene/world collection while still
 * remapping references inside one mixed selection and committing one revision.
 */
export function duplicateCourseLayerItems(
  project: CourseProjectDocument,
  selections: readonly CourseLayerClipboardSelection[],
  options: CourseLayerPasteOptions = {},
): CourseLayerDuplicateResult {
  const snapshot = copyCourseLayerItems(project, selections)
  const idMap = createPasteIds(project, snapshot.entries, options.createLayerItemId)
  const duplicatedIds = snapshot.entries.map((entry) => idMap.get(entry.item.layerItemId)!)
  const next = updateCourseProject(project, (draft) => {
    const firstOrder = Math.max(-1, ...allLayerItems(draft).map((item) => item.order)) + 1
    snapshot.entries.forEach((entry, index) => {
      const copy = structuredClone(entry.item)
      copy.layerItemId = duplicatedIds[index]!
      copy.label = `${copy.label} 副本`
      copy.frame.x += COURSE_LAYER_PASTE_OFFSET
      copy.frame.y += COURSE_LAYER_PASTE_OFFSET
      copy.order = firstOrder + index
      remapCopiedLayerReferences(copy, idMap)
      insertDuplicateAtSource(draft, entry, copy)
    })

    // Teacher controllers remain visually and interactively above authored
    // content without renumbering unrelated non-controller layers.
    const controllers = allLayerItems(draft)
      .filter((item) => item.kind === 'native' && item.content.nativeType === 'teacher-controller')
      .sort((left, right) => left.order - right.order || left.layerItemId.localeCompare(right.layerItemId))
    controllers.forEach((item, index) => {
      item.order = firstOrder + snapshot.entries.length + index
    })
    sortAllLayerCollections(draft)
  }, options.now)
  return {
    project: next,
    duplicatedIds,
    sources: snapshot.entries.map((entry) => structuredClone(entry.source)),
  }
}

function allLayerItems(project: CourseProjectDocument): LayerItem[] {
  const items = project.globalLayerItems.map((entry) => entry.item)
  project.surfaces.forEach((surface) => {
    items.push(...surface.surfaceLayerItems.map((entry) => entry.item))
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene) => items.push(...scene.layerItems))
    } else if (surface.type === 'spatial-2d') {
      items.push(...surface.world.layerItems)
    }
  })
  return items
}

function sortAllLayerCollections(project: CourseProjectDocument): void {
  const compare = (left: LayerItem, right: LayerItem) => (
    left.order - right.order || left.layerItemId.localeCompare(right.layerItemId)
  )
  project.globalLayerItems.sort((left, right) => compare(left.item, right.item))
  project.surfaces.forEach((surface) => {
    surface.surfaceLayerItems.sort((left, right) => compare(left.item, right.item))
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene) => scene.layerItems.sort(compare))
    } else if (surface.type === 'spatial-2d') {
      surface.world.layerItems.sort(compare)
    }
  })
}

interface PasteDestination {
  surface: CourseSurfaceDocument
  scoped: boolean
  localItems: LayerItem[]
  insert(item: LayerItem, visibility?: LocationVisibility): void
}

function resolvePasteDestination(
  project: CourseProjectDocument,
  target: CourseLayerPasteTarget,
): PasteDestination {
  const surface = findSurface(project, target.surfaceId)
  if (surface.type === 'slide') {
    if (!target.sceneId) throw new CourseLayerClipboardError('粘贴到 Slide 时必须指定场景')
    if (target.scopedVisibility.mode !== 'reset-for-target') {
      throw new CourseLayerClipboardError('Slide 场景不支持 Scoped visibility 粘贴策略')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === target.sceneId)
    if (!scene) throw new CourseLayerClipboardError(`找不到场景：${target.sceneId}`)
    return {
      surface,
      scoped: false,
      localItems: scene.layerItems,
      insert: (item) => scene.layerItems.push(item),
    }
  }
  if (target.sceneId) {
    throw new CourseLayerClipboardError(`${surface.type === 'flow' ? 'Flow' : 'Spatial'} 粘贴不接受场景 ID`)
  }
  if (surface.type === 'spatial-2d') {
    if (target.scopedVisibility.mode !== 'reset-for-target') {
      throw new CourseLayerClipboardError('Spatial 世界不支持 Scoped visibility 粘贴策略')
    }
    return {
      surface,
      scoped: false,
      localItems: surface.world.layerItems,
      insert: (item) => surface.world.layerItems.push(item),
    }
  }
  return {
    surface,
    scoped: true,
    // Flow's free-positioning container is the surface collection already
    // included in the shared effective layer list; it has no second local list.
    localItems: [],
    insert: (item, visibility) => surface.surfaceLayerItems.push({
      item,
      visibility: visibility ?? { mode: 'all', locationIds: [] },
    }),
  }
}

function visibilityForFlowPaste(
  project: CourseProjectDocument,
  target: CourseLayerPasteTarget,
  entry: CourseLayerClipboardEntry,
): LocationVisibility {
  const policy = target.scopedVisibility
  if (policy.mode === 'reset-for-target') return { mode: 'all', locationIds: [] }
  if (policy.mode === 'current-location') {
    const location = project.locations.find((candidate) => candidate.id === policy.locationId)
    if (!location || location.surfaceId !== target.surfaceId) {
      throw new CourseLayerClipboardError(`可见性位置不属于当前 Flow：${policy.locationId}`)
    }
    return { mode: 'include', locationIds: [policy.locationId] }
  }
  const visibility = entry.source.visibility
  if (!visibility) {
    throw new CourseLayerClipboardError('未分层的场景/世界图层无法保留 Scoped visibility')
  }
  const invalidLocationId = visibility.locationIds.find((locationId) => {
    const location = project.locations.find((candidate) => candidate.id === locationId)
    return !location || location.surfaceId !== target.surfaceId
  })
  if (invalidLocationId) {
    throw new CourseLayerClipboardError(
      `原可见性位置不属于目标 Flow：${invalidLocationId}`,
    )
  }
  return structuredClone(visibility)
}

const safeScalarLayerReferenceKeys = new Set([
  'layerItemId',
  'nodeId',
  'sourceLayerItemId',
  'targetLayerItemId',
])
const safeArrayLayerReferenceKeys = new Set(['layerItemIds', 'nodeIds'])

/**
 * Current teacher actions do not expose layer targets. Keeping this narrow
 * whitelist makes a future layer-targeting button copy-safe without ever
 * rewriting scene ids, state ids, labels or arbitrary props.
 */
function remapSafeTeacherButtonLayerReferences(
  value: unknown,
  idMap: ReadonlyMap<string, string>,
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const record = value as Record<string, unknown>
  Object.entries(record).forEach(([key, field]) => {
    if (safeScalarLayerReferenceKeys.has(key) && typeof field === 'string') {
      record[key] = idMap.get(field) ?? field
    } else if (safeArrayLayerReferenceKeys.has(key) && Array.isArray(field)) {
      record[key] = field.map((candidate) => (
        typeof candidate === 'string' ? idMap.get(candidate) ?? candidate : candidate
      ))
    } else if (field && typeof field === 'object') {
      remapSafeTeacherButtonLayerReferences(field, idMap)
    }
  })
}

function remapCopiedLayerReferences(
  item: LayerItem,
  idMap: ReadonlyMap<string, string>,
): void {
  if (item.kind === 'runtime' && item.runtime.nodeBindings) {
    item.runtime.nodeBindings = Object.fromEntries(
      Object.entries(item.runtime.nodeBindings).map(([key, layerItemId]) => [
        key,
        idMap.get(layerItemId) ?? layerItemId,
      ]),
    )
  }
  if (item.kind === 'native' && item.content.nativeType === 'teacher-controller') {
    item.content.data.buttons.forEach((button) => {
      remapSafeTeacherButtonLayerReferences(button.action, idMap)
    })
  }
}

function createPasteIds(
  project: CourseProjectDocument,
  entries: readonly CourseLayerClipboardEntry[],
  factory: CourseLayerPasteOptions['createLayerItemId'],
): Map<string, string> {
  const occupiedIds = new Set(allLayerItems(project).map((item) => item.layerItemId))
  const idMap = new Map<string, string>()
  entries.forEach((entry, index) => {
    let newId = factory?.({
      sourceLayerItemId: entry.item.layerItemId,
      kind: entry.item.kind,
      index,
    })
    if (newId === undefined) {
      do newId = `${entry.item.kind}-${nanoid(10)}`
      while (occupiedIds.has(newId))
    }
    if (!newId.trim() || newId !== newId.trim() || newId.length > 240) {
      throw new CourseLayerClipboardError('新图层 ID 无效')
    }
    if (occupiedIds.has(newId)) {
      throw new CourseLayerClipboardError(`新图层 ID 已存在：${newId}`)
    }
    occupiedIds.add(newId)
    idMap.set(entry.item.layerItemId, newId)
  })
  return idMap
}

function assertClipboardSnapshot(snapshot: CourseLayerClipboardSnapshot): void {
  if (
    snapshot.kind !== 'course-layer-items' ||
    snapshot.version !== COURSE_LAYER_CLIPBOARD_VERSION ||
    snapshot.entries.length === 0
  ) {
    throw new CourseLayerClipboardError('剪贴板中没有可粘贴的课件图层')
  }
  const ids = snapshot.entries.map((entry) => entry.item.layerItemId)
  if (new Set(ids).size !== ids.length) {
    throw new CourseLayerClipboardError('剪贴板包含重复的图层 ID')
  }
}

/**
 * Pastes every copied item into the target's current free-positioning
 * container: Slide scene, Spatial world, or Flow surface. Global/surface
 * sources are intentionally flattened into that target instead of silently
 * creating another course-wide layer.
 */
export function pasteCourseLayerItems(
  project: CourseProjectDocument,
  snapshot: CourseLayerClipboardSnapshot,
  target: CourseLayerPasteTarget,
  options: CourseLayerPasteOptions = {},
): CourseLayerPasteResult {
  assertClipboardSnapshot(snapshot)
  snapshot.entries.forEach((entry) => {
    const parsed = layerItemSchema.safeParse(entry.item)
    if (!parsed.success) {
      throw new CourseLayerClipboardError(`剪贴板图层“${entry.item.label}”的数据无效`)
    }
    assertLayerDependencies(project, parsed.data, '粘贴')
  })
  const idMap = createPasteIds(project, snapshot.entries, options.createLayerItemId)
  const pastedIds = snapshot.entries.map((entry) => idMap.get(entry.item.layerItemId)!)
  const next = updateCourseProject(project, (draft) => {
    const destination = resolvePasteDestination(draft, target)
    const effectiveItems = [
      ...draft.globalLayerItems.map((entry) => entry.item),
      ...destination.surface.surfaceLayerItems.map((entry) => entry.item),
      ...destination.localItems,
    ]
    // Put pasted content at the current project top, then lift only the
    // controllers visible in this compositor above it. Moving a shared
    // controller to a globally unused high order preserves its visual role on
    // every surface without renumbering unrelated local content.
    const firstOrder = Math.max(-1, ...allLayerItems(draft).map((item) => item.order)) + 1
    const controllers = [...new Set(effectiveItems.filter((item) => (
      item.kind === 'native' && item.content.nativeType === 'teacher-controller'
    )))].sort((left, right) => (
      left.order - right.order || left.layerItemId.localeCompare(right.layerItemId)
    ))
    controllers.forEach((item, index) => {
      item.order = firstOrder + snapshot.entries.length + index
    })

    snapshot.entries.forEach((entry, index) => {
      const copy = structuredClone(entry.item)
      copy.layerItemId = pastedIds[index]!
      copy.frame.x += COURSE_LAYER_PASTE_OFFSET
      copy.frame.y += COURSE_LAYER_PASTE_OFFSET
      copy.order = firstOrder + index
      remapCopiedLayerReferences(copy, idMap)
      const visibility = destination.scoped
        ? visibilityForFlowPaste(draft, target, entry)
        : undefined
      destination.insert(copy, visibility)
    })
    sortAllLayerCollections(draft)
  }, options.now)
  return { project: next, pastedIds }
}
