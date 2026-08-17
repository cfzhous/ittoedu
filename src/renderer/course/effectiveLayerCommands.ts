import { makeAuthoringAddress } from '../../shared/authoringAddress'
import {
  getEffectiveCourseLayerOrder,
} from '../../shared/courseProjectModel'
import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  LayerItem,
  ScopedLayerItem,
  SlideSceneDocument,
} from '../../shared/courseProjectTypes'
import {
  deleteLayerItem,
  duplicateLayerItem,
  sortAllLayerLists,
  updateCourseProject,
  updateLayerItem,
} from './courseStudioModel'
import {
  deleteGlobalLayerItem,
  describeGlobalLayerDeleteImpact,
  duplicateGlobalLayerItem,
  isTeacherControllerLayerItem,
  lockedLayerWriteReason,
  renameGlobalLayerItem,
  reorderGlobalLayerItems,
  setGlobalLayerLocked,
  setGlobalLayerVisible,
  type LayerCommandFailure,
  type LayerCommandResult,
} from './globalLayerCommands'
import type { EditorAuthoringOwner } from './editorActionTypes'

export type EffectiveLayerStorageOwner = 'global' | 'surface' | 'scene' | 'world'

export interface EffectiveLayerCommandItem {
  readonly id: string
  readonly name: string
  readonly sourceKind: 'global' | 'surface' | 'scene' | 'state' | 'world'
  readonly owner: EditorAuthoringOwner
  readonly ownerKey: string
  readonly sourceLabel: string
  readonly authoringAddress: string
  readonly selected: boolean
  readonly locked: boolean
  readonly hidden: boolean
  readonly storage: EffectiveLayerStorageOwner
  readonly surfaceId: string
  readonly sceneId: string | null
  readonly reorderDisabledReason?: string
}

export interface EffectiveLayerCommandContext {
  readonly project: CourseProjectDocument
  readonly locationId: string
  readonly selectedIds?: readonly string[]
  readonly stateId?: string | null
}

/** Structural match for T04 EffectiveLayerReorderEvent; do not import T04. */
export interface EffectiveLayerReorderCommand {
  readonly fromId: string
  readonly toId: string
  readonly fromOwnerKey: string
  readonly toOwnerKey: string
  readonly placement: 'before' | 'after'
  /** Explicit ownership change. Absent or false refuses cross-owner drops. */
  readonly scopeMove?: boolean
}

const SOURCE_LABELS: Record<EffectiveLayerCommandItem['sourceKind'], string> = {
  global: '全课',
  surface: '当前内容',
  scene: '本页',
  state: '当前状态',
  world: '世界',
}

function fail(reason: string, code: LayerCommandFailure['code'] = 'invalid'): LayerCommandFailure {
  return { ok: false, code, reason }
}

function arrayMove<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items]
  const [removed] = next.splice(fromIndex, 1)
  if (removed === undefined) return next
  next.splice(toIndex, 0, removed)
  return next
}

function requireLocation(project: CourseProjectDocument, locationId: string) {
  const location = project.locations.find((candidate) => candidate.id === locationId)
  if (!location) throw new Error(`找不到课程位置：${locationId}`)
  const surface = project.surfaces.find((candidate) => candidate.id === location.surfaceId)
  if (!surface) throw new Error(`找不到表面：${location.surfaceId}`)
  return { location, surface }
}

function ownerKeyFor(
  storage: EffectiveLayerStorageOwner,
  surfaceId: string,
  sceneId: string | null,
): string {
  if (storage === 'global') return 'global'
  if (storage === 'surface') return `surface:${surfaceId}`
  if (storage === 'scene') return `scene:${sceneId ?? surfaceId}`
  return `world:${surfaceId}`
}

function ownerFromStorage(storage: EffectiveLayerStorageOwner): EditorAuthoringOwner {
  if (storage === 'global') return 'global'
  if (storage === 'surface') return 'surface'
  if (storage === 'world') return 'spatial-world'
  return 'scene'
}

function authoringAddressFor(
  projectId: string,
  storage: EffectiveLayerStorageOwner,
  surfaceId: string,
  sceneId: string | null,
  layerItemId: string,
  kind: LayerItem['kind'],
): string {
  const scope = storage === 'global' ? 'global' : storage === 'scene' ? 'scene' : 'surface'
  return makeAuthoringAddress({
    projectId,
    scope,
    surfaceId: storage === 'global' ? undefined : surfaceId,
    sceneId: storage === 'scene' ? sceneId ?? undefined : undefined,
    carrier: kind === 'component' ? 'component' : kind === 'runtime' ? 'runtime' : 'native',
    layerItemId,
    field: 'item',
  })
}

interface LocatedLayer {
  readonly item: LayerItem
  readonly storage: EffectiveLayerStorageOwner
  readonly ownerKey: string
  readonly surfaceId: string
  readonly sceneId: string | null
  readonly scoped?: ScopedLayerItem
}

function locateLayer(
  project: CourseProjectDocument,
  layerItemId: string,
): LocatedLayer | null {
  const global = project.globalLayerItems.find(
    (entry) => entry.item.layerItemId === layerItemId,
  )
  if (global) {
    return {
      item: global.item,
      storage: 'global',
      ownerKey: 'global',
      surfaceId: project.surfaces[0]?.id ?? '',
      sceneId: null,
      scoped: global,
    }
  }
  for (const surface of project.surfaces) {
    const shared = surface.surfaceLayerItems.find(
      (entry) => entry.item.layerItemId === layerItemId,
    )
    if (shared) {
      return {
        item: shared.item,
        storage: 'surface',
        ownerKey: ownerKeyFor('surface', surface.id, null),
        surfaceId: surface.id,
        sceneId: null,
        scoped: shared,
      }
    }
    if (surface.type === 'slide') {
      for (const scene of surface.scenes) {
        const item = scene.layerItems.find((candidate) => candidate.layerItemId === layerItemId)
        if (item) {
          return {
            item,
            storage: 'scene',
            ownerKey: ownerKeyFor('scene', surface.id, scene.id),
            surfaceId: surface.id,
            sceneId: scene.id,
          }
        }
      }
    }
    if (surface.type === 'spatial-2d') {
      const item = surface.world.layerItems.find(
        (candidate) => candidate.layerItemId === layerItemId,
      )
      if (item) {
        return {
          item,
          storage: 'world',
          ownerKey: ownerKeyFor('world', surface.id, null),
          surfaceId: surface.id,
          sceneId: null,
        }
      }
    }
  }
  return null
}

function activeSlideScene(
  surface: CourseSurfaceDocument,
  location: CourseProjectDocument['locations'][number],
): SlideSceneDocument | null {
  if (surface.type !== 'slide' || location.kind !== 'slide-scene') return null
  return surface.scenes.find((scene) => scene.id === location.sceneId) ?? null
}

export function listEffectiveLayerCommandItems(
  context: EffectiveLayerCommandContext,
): readonly EffectiveLayerCommandItem[] {
  const { project, locationId } = context
  const { location, surface } = requireLocation(project, locationId)
  const selected = new Set(context.selectedIds ?? [])
  const scene = activeSlideScene(surface, location)
  const state = context.stateId
    ? scene?.presentation?.states.find((candidate) => candidate.id === context.stateId)
    : undefined
  const ordered = getEffectiveCourseLayerOrder({
    project,
    surfaceId: surface.id,
    locationId,
  })
  const rows = ordered.map((entry) => {
    const override = state?.layerItemOverrides[entry.item.layerItemId]
    const sourceKind: EffectiveLayerCommandItem['sourceKind'] =
      override !== undefined && entry.source === 'scene' ? 'state' : entry.source
    const hidden = override?.visible !== undefined
      ? !override.visible
      : !entry.item.visible
    const locked = override?.locked ?? entry.item.locked
    const name = override?.label ?? entry.item.label
    return {
      id: entry.item.layerItemId,
      name,
      sourceKind,
      owner: ownerFromStorage(entry.source),
      ownerKey: ownerKeyFor(entry.source, surface.id, scene?.id ?? null),
      sourceLabel: SOURCE_LABELS[sourceKind],
      authoringAddress: authoringAddressFor(
        project.id,
        entry.source,
        surface.id,
        scene?.id ?? null,
        entry.item.layerItemId,
        entry.item.kind,
      ),
      selected: selected.has(entry.item.layerItemId),
      locked,
      hidden,
      storage: entry.source,
      surfaceId: surface.id,
      sceneId: scene?.id ?? null,
    } satisfies EffectiveLayerCommandItem
  })
  return [...rows].reverse()
}

/** T04 EffectiveLayerItem structural projection. */
export function toEffectiveLayerListItems(
  items: readonly EffectiveLayerCommandItem[],
) {
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    sourceKind: item.sourceKind,
    ownerKey: item.ownerKey,
    sourceLabel: item.sourceLabel,
    selected: item.selected,
    locked: item.locked,
    hidden: item.hidden,
    reorderDisabledReason: item.reorderDisabledReason,
  }))
}

function refuseLocked(item: LayerItem, unlocking: boolean): LayerCommandResult | null {
  if (item.locked && !unlocking) {
    return fail(lockedLayerWriteReason(), 'locked')
  }
  return null
}

export function applyEffectiveLayerRename(
  project: CourseProjectDocument,
  locationId: string,
  layerItemId: string,
  name: string,
  now?: string,
): LayerCommandResult {
  const located = locateLayer(project, layerItemId)
  if (!located) return fail(`找不到图层：${layerItemId}`, 'missing')
  if (located.storage === 'global') {
    return renameGlobalLayerItem(project, layerItemId, name, now)
  }
  const locked = refuseLocked(located.item, false)
  if (locked) return locked
  const nextName = name.trim()
  if (!nextName) return fail('名称不能为空')
  return {
    ok: true,
    project: updateLayerItem(project, {
      surfaceId: located.surfaceId,
      sceneId: located.sceneId ?? undefined,
      layerItemId,
      source: located.storage === 'world' ? 'world' : located.storage,
    }, (item) => {
      item.label = nextName.slice(0, 80)
    }, now),
    reason: `已重命名为“${nextName.slice(0, 80)}”`,
    layerItemId,
  }
}

export function applyEffectiveLayerToggleVisibility(
  project: CourseProjectDocument,
  context: { readonly locationId: string; readonly stateId?: string | null },
  layerItemId: string,
  now?: string,
): LayerCommandResult {
  const located = locateLayer(project, layerItemId)
  if (!located) return fail(`找不到图层：${layerItemId}`, 'missing')
  if (located.storage === 'global') {
    return setGlobalLayerVisible(project, layerItemId, !located.item.visible, now)
  }
  const locked = refuseLocked(located.item, false)
  if (locked) return locked
  if (located.storage === 'scene' && context.stateId) {
    try {
      const next = updateCourseProject(project, (draft) => {
        const surface = draft.surfaces.find((candidate) => candidate.id === located.surfaceId)
        if (!surface || surface.type !== 'slide') throw new Error('当前不是幻灯片页面')
        const scene = surface.scenes.find((candidate) => candidate.id === located.sceneId)
        const state = scene?.presentation?.states.find((candidate) => candidate.id === context.stateId)
        if (!scene || !state) throw new Error('当前命名状态已失效')
        const current = state.layerItemOverrides[layerItemId] ?? {}
        const visible = current.visible ?? located.item.visible
        state.layerItemOverrides[layerItemId] = { ...current, visible: !visible }
      }, now)
      return { ok: true, project: next, reason: '已更新当前状态显示', layerItemId }
    } catch (error) {
      return fail(error instanceof Error ? error.message : '无法更新显示')
    }
  }
  return {
    ok: true,
    project: updateLayerItem(project, {
      surfaceId: located.surfaceId,
      sceneId: located.sceneId ?? undefined,
      layerItemId,
      source: located.storage === 'world' ? 'world' : located.storage,
    }, (item) => {
      item.visible = !item.visible
    }, now),
    reason: located.item.visible ? '已隐藏图层' : '已显示图层',
    layerItemId,
  }
}

export function applyEffectiveLayerToggleLock(
  project: CourseProjectDocument,
  layerItemId: string,
  now?: string,
): LayerCommandResult {
  const located = locateLayer(project, layerItemId)
  if (!located) return fail(`找不到图层：${layerItemId}`, 'missing')
  if (located.storage === 'global') {
    return setGlobalLayerLocked(project, layerItemId, !located.item.locked, now)
  }
  const unlocking = located.item.locked
  const locked = refuseLocked(located.item, unlocking)
  if (locked) return locked
  return {
    ok: true,
    project: updateLayerItem(project, {
      surfaceId: located.surfaceId,
      sceneId: located.sceneId ?? undefined,
      layerItemId,
      source: located.storage === 'world' ? 'world' : located.storage,
    }, (item) => {
      item.locked = !item.locked
    }, now),
    reason: unlocking ? '已解锁图层' : '已锁定图层',
    layerItemId,
  }
}

export function applyEffectiveLayerDuplicate(
  project: CourseProjectDocument,
  layerItemId: string,
  now?: string,
): LayerCommandResult {
  const located = locateLayer(project, layerItemId)
  if (!located) return fail(`找不到图层：${layerItemId}`, 'missing')
  if (located.storage === 'global') {
    return duplicateGlobalLayerItem(project, layerItemId, now)
  }
  const locked = refuseLocked(located.item, false)
  if (locked) return locked
  const next = duplicateLayerItem(project, {
    surfaceId: located.surfaceId,
    sceneId: located.sceneId ?? undefined,
    layerItemId,
    source: located.storage === 'world' ? 'world' : located.storage,
  }, now)
  return { ok: true, project: next, reason: `已复制“${located.item.label}”`, layerItemId }
}

export function applyEffectiveLayerDelete(
  project: CourseProjectDocument,
  context: { readonly locationId: string; readonly stateId?: string | null },
  layerItemId: string,
  now?: string,
): LayerCommandResult {
  const located = locateLayer(project, layerItemId)
  if (!located) return fail(`找不到图层：${layerItemId}`, 'missing')
  if (located.storage === 'global') {
    return deleteGlobalLayerItem(project, layerItemId, now)
  }
  const locked = refuseLocked(located.item, false)
  if (locked) return locked
  if (located.storage === 'scene' && context.stateId) {
    try {
      const next = updateCourseProject(project, (draft) => {
        const surface = draft.surfaces.find((candidate) => candidate.id === located.surfaceId)
        if (!surface || surface.type !== 'slide') throw new Error('当前不是幻灯片页面')
        const scene = surface.scenes.find((candidate) => candidate.id === located.sceneId)
        const state = scene?.presentation?.states.find((candidate) => candidate.id === context.stateId)
        if (!scene || !state) throw new Error('当前命名状态已失效')
        const current = state.layerItemOverrides[layerItemId] ?? {}
        if (current.visible === false) {
          throw new Error(`“${located.item.label}”已在当前状态隐藏`)
        }
        state.layerItemOverrides[layerItemId] = { ...current, visible: false }
      }, now)
      return {
        ok: true,
        project: next,
        reason: `已从当前状态隐藏“${located.item.label}”`,
        layerItemId,
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : '无法隐藏图层')
    }
  }
  const next = deleteLayerItem(project, {
    surfaceId: located.surfaceId,
    sceneId: located.sceneId ?? undefined,
    layerItemId,
    source: located.storage === 'world' ? 'world' : located.storage,
  }, now)
  return { ok: true, project: next, reason: `已删除“${located.item.label}”`, layerItemId }
}

function ownerItems(
  project: CourseProjectDocument,
  ownerKey: string,
): LayerItem[] {
  if (ownerKey === 'global') {
    return project.globalLayerItems.map((entry) => entry.item)
  }
  if (ownerKey.startsWith('surface:')) {
    const surfaceId = ownerKey.slice('surface:'.length)
    return project.surfaces.find((surface) => surface.id === surfaceId)?.surfaceLayerItems
      .map((entry) => entry.item) ?? []
  }
  if (ownerKey.startsWith('scene:')) {
    const sceneId = ownerKey.slice('scene:'.length)
    for (const surface of project.surfaces) {
      if (surface.type !== 'slide') continue
      const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
      if (scene) return scene.layerItems
    }
  }
  if (ownerKey.startsWith('world:')) {
    const surfaceId = ownerKey.slice('world:'.length)
    const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
    return surface?.type === 'spatial-2d' ? surface.world.layerItems : []
  }
  return []
}

function reorderOwnerVisual(
  items: LayerItem[],
  fromId: string,
  toId: string,
  placement: 'before' | 'after',
): boolean {
  const visual = [...items].sort((left, right) =>
    right.order - left.order || right.layerItemId.localeCompare(left.layerItemId),
  )
  const fromIndex = visual.findIndex((item) => item.layerItemId === fromId)
  const toIndex = visual.findIndex((item) => item.layerItemId === toId)
  if (fromIndex < 0 || toIndex < 0) return false
  let dest = placement === 'before' ? toIndex : toIndex + 1
  if (fromIndex < dest) dest -= 1
  const nextVisual = arrayMove(visual, fromIndex, dest)
  const slots = items.map((item) => item.order).sort((left, right) => left - right)
  const backToFront = [...nextVisual].reverse()
  backToFront.forEach((item, index) => {
    item.order = slots[index]!
  })
  return true
}

function parseOwnerKey(ownerKey: string): {
  storage: EffectiveLayerStorageOwner
  surfaceId?: string
  sceneId?: string
} | null {
  if (ownerKey === 'global') return { storage: 'global' }
  if (ownerKey.startsWith('surface:')) {
    return { storage: 'surface', surfaceId: ownerKey.slice('surface:'.length) }
  }
  if (ownerKey.startsWith('scene:')) {
    return { storage: 'scene', sceneId: ownerKey.slice('scene:'.length) }
  }
  if (ownerKey.startsWith('world:')) {
    return { storage: 'world', surfaceId: ownerKey.slice('world:'.length) }
  }
  return null
}

function removeLocatedItem(project: CourseProjectDocument, located: LocatedLayer): LayerItem | null {
  if (located.storage === 'global') {
    const index = project.globalLayerItems.findIndex(
      (entry) => entry.item.layerItemId === located.item.layerItemId,
    )
    if (index < 0) return null
    return project.globalLayerItems.splice(index, 1)[0]!.item
  }
  const surface = project.surfaces.find((candidate) => candidate.id === located.surfaceId)
  if (!surface) return null
  if (located.storage === 'surface') {
    const index = surface.surfaceLayerItems.findIndex(
      (entry) => entry.item.layerItemId === located.item.layerItemId,
    )
    if (index < 0) return null
    return surface.surfaceLayerItems.splice(index, 1)[0]!.item
  }
  if (located.storage === 'scene' && surface.type === 'slide') {
    const scene = surface.scenes.find((candidate) => candidate.id === located.sceneId)
    if (!scene) return null
    const index = scene.layerItems.findIndex((item) => item.layerItemId === located.item.layerItemId)
    if (index < 0) return null
    return scene.layerItems.splice(index, 1)[0] ?? null
  }
  if (located.storage === 'world' && surface.type === 'spatial-2d') {
    const index = surface.world.layerItems.findIndex(
      (item) => item.layerItemId === located.item.layerItemId,
    )
    if (index < 0) return null
    return surface.world.layerItems.splice(index, 1)[0] ?? null
  }
  return null
}

function insertItem(
  project: CourseProjectDocument,
  dest: NonNullable<ReturnType<typeof parseOwnerKey>>,
  item: LayerItem,
  visibility: ScopedLayerItem['visibility'] | undefined,
  beforeId: string | null,
  placement: 'before' | 'after',
): void {
  const insertInto = (list: LayerItem[]) => {
    const index = beforeId
      ? list.findIndex((candidate) => candidate.layerItemId === beforeId)
      : list.length
    const destIndex = index < 0
      ? list.length
      : placement === 'before' ? index : index + 1
    list.splice(destIndex, 0, item)
  }
  const insertScoped = (list: ScopedLayerItem[]) => {
    const index = beforeId
      ? list.findIndex((candidate) => candidate.item.layerItemId === beforeId)
      : list.length
    const destIndex = index < 0
      ? list.length
      : placement === 'before' ? index : index + 1
    list.splice(destIndex, 0, {
      item,
      visibility: visibility ?? { mode: 'all', locationIds: [] },
    })
  }
  const destinationItems = (): LayerItem[] => {
    if (dest.storage === 'global') return project.globalLayerItems.map((entry) => entry.item)
    if (dest.storage === 'surface' && dest.surfaceId) {
      return project.surfaces.find((surface) => surface.id === dest.surfaceId)
        ?.surfaceLayerItems.map((entry) => entry.item) ?? []
    }
    if (dest.storage === 'scene' && dest.sceneId) {
      for (const surface of project.surfaces) {
        if (surface.type !== 'slide') continue
        const scene = surface.scenes.find((candidate) => candidate.id === dest.sceneId)
        if (scene) return scene.layerItems
      }
    }
    if (dest.storage === 'world' && dest.surfaceId) {
      const surface = project.surfaces.find((candidate) => candidate.id === dest.surfaceId)
      if (surface?.type === 'spatial-2d') return surface.world.layerItems
    }
    return []
  }
  item.order = Math.max(-1, ...destinationItems().map((candidate) => candidate.order)) + 1
  if (dest.storage === 'global') {
    insertScoped(project.globalLayerItems)
    return
  }
  if (dest.storage === 'surface' && dest.surfaceId) {
    const surface = project.surfaces.find((candidate) => candidate.id === dest.surfaceId)
    if (surface) insertScoped(surface.surfaceLayerItems)
    return
  }
  if (dest.storage === 'scene' && dest.sceneId) {
    for (const surface of project.surfaces) {
      if (surface.type !== 'slide') continue
      const scene = surface.scenes.find((candidate) => candidate.id === dest.sceneId)
      if (scene) insertInto(scene.layerItems)
    }
    return
  }
  if (dest.storage === 'world' && dest.surfaceId) {
    const surface = project.surfaces.find((candidate) => candidate.id === dest.surfaceId)
    if (surface?.type === 'spatial-2d') insertInto(surface.world.layerItems)
  }
}

function moveLayerScope(
  project: CourseProjectDocument,
  event: EffectiveLayerReorderCommand,
  now?: string,
): LayerCommandResult {
  const located = locateLayer(project, event.fromId)
  const dest = parseOwnerKey(event.toOwnerKey)
  if (!located || !dest) return fail('找不到要移动的图层', 'missing')
  if (isTeacherControllerLayerItem(located.item) && dest.storage !== 'global') {
    return fail('教师控制器必须留在全局层，不能移动到页面或世界层。', 'cross-owner')
  }
  const locked = refuseLocked(located.item, false)
  if (locked) return locked
  try {
    const next = updateCourseProject(project, (draft) => {
      const current = locateLayer(draft, event.fromId)
      if (!current) throw new Error('找不到要移动的图层')
      const visibility = current.scoped?.visibility
      const item = removeLocatedItem(draft, current)
      if (!item) throw new Error('找不到要移动的图层')
      insertItem(draft, dest, item, visibility, event.toId, event.placement)
      sortAllLayerLists(draft)
    }, now)
    return {
      ok: true,
      project: next,
      reason: `已将“${located.item.label}”移动到目标范围`,
      layerItemId: event.fromId,
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : '无法移动图层')
  }
}

export function applyEffectiveLayerReorder(
  project: CourseProjectDocument,
  locationId: string,
  event: EffectiveLayerReorderCommand,
  now?: string,
): LayerCommandResult {
  if (event.fromId === event.toId) {
    return { ok: true, project, reason: '顺序未变化' }
  }
  if (event.fromOwnerKey !== event.toOwnerKey) {
    if (!event.scopeMove) {
      return fail(
        '不能跨来源假排序。请在同一来源内调整层级，或使用明确的“移动到该范围”。',
        'cross-owner',
      )
    }
    return moveLayerScope(project, event, now)
  }
  if (event.fromOwnerKey === 'global') {
    const visual = listEffectiveLayerCommandItems({ project, locationId })
      .filter((item) => item.ownerKey === 'global')
    const fromIndex = visual.findIndex((item) => item.id === event.fromId)
    const toIndex = visual.findIndex((item) => item.id === event.toId)
    if (fromIndex < 0 || toIndex < 0) return fail('找不到全局图层', 'missing')
    let dest = event.placement === 'before' ? toIndex : toIndex + 1
    if (fromIndex < dest) dest -= 1
    const nextVisual = arrayMove(visual, fromIndex, dest)
    return reorderGlobalLayerItems(
      project,
      [...nextVisual.map((item) => item.id)].reverse(),
      now,
    )
  }
  const located = locateLayer(project, event.fromId)
  if (!located) return fail(`找不到图层：${event.fromId}`, 'missing')
  const locked = ownerItems(project, event.fromOwnerKey).find((item) => item.locked)
  if (locked) return fail(lockedLayerWriteReason(), 'locked')
  try {
    const next = updateCourseProject(project, (draft) => {
      const items = ownerItems(draft, event.fromOwnerKey)
      if (!reorderOwnerVisual(items, event.fromId, event.toId, event.placement)) {
        throw new Error('找不到要排序的图层')
      }
      sortAllLayerLists(draft)
    }, now)
    return { ok: true, project: next, reason: '已调整图层顺序', layerItemId: event.fromId }
  } catch (error) {
    return fail(error instanceof Error ? error.message : '无法调整图层顺序')
  }
}

export function describeEffectiveLayerDelete(
  project: CourseProjectDocument,
  layerItemId: string,
): { readonly message: string; readonly hideInState: boolean } | null {
  const located = locateLayer(project, layerItemId)
  if (!located) return null
  if (located.storage === 'global') {
    return {
      message: describeGlobalLayerDeleteImpact(project, layerItemId)?.message
        ?? `删除全局层“${located.item.label}”`,
      hideInState: false,
    }
  }
  return {
    message: `删除“${located.item.label}”`,
    hideInState: false,
  }
}

/**
 * Event binders for T10 to spread onto EffectiveLayerList.
 * The list itself stays a T04 primitive; this file never imports it.
 */
export function createEffectiveLayerListHandlers(input: {
  readonly getProject: () => CourseProjectDocument
  readonly locationId: string
  readonly stateId?: string | null
  readonly selectedIds?: readonly string[]
  readonly apply: (result: LayerCommandResult) => void
  readonly onSelect: (id: string, additive: boolean) => void
  readonly now?: string
}) {
  const context = (): EffectiveLayerCommandContext => ({
    project: input.getProject(),
    locationId: input.locationId,
    stateId: input.stateId,
    selectedIds: input.selectedIds,
  })
  return {
    items: () => listEffectiveLayerCommandItems(context()),
    listItems: () => toEffectiveLayerListItems(listEffectiveLayerCommandItems(context())),
    onSelect: (event: { readonly id: string; readonly additive: boolean }) => {
      input.onSelect(event.id, event.additive)
    },
    onRename: (id: string, name: string) => {
      input.apply(applyEffectiveLayerRename(input.getProject(), input.locationId, id, name, input.now))
    },
    onReorder: (event: EffectiveLayerReorderCommand) => {
      input.apply(applyEffectiveLayerReorder(input.getProject(), input.locationId, event, input.now))
    },
    onToggleVisibility: (id: string) => {
      input.apply(applyEffectiveLayerToggleVisibility(
        input.getProject(),
        { locationId: input.locationId, stateId: input.stateId },
        id,
        input.now,
      ))
    },
    onToggleLock: (id: string) => {
      input.apply(applyEffectiveLayerToggleLock(input.getProject(), id, input.now))
    },
    onDuplicate: (id: string) => {
      input.apply(applyEffectiveLayerDuplicate(input.getProject(), id, input.now))
    },
    onDelete: (id: string) => {
      input.apply(applyEffectiveLayerDelete(
        input.getProject(),
        { locationId: input.locationId, stateId: input.stateId },
        id,
        input.now,
      ))
    },
  }
}

export { describeGlobalLayerDeleteImpact, lockedLayerWriteReason }
