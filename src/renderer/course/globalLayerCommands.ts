import { nanoid } from 'nanoid'
import { makeAuthoringAddress } from '../../shared/authoringAddress'
import { CANVAS_HEIGHT, CANVAS_WIDTH, MIN_NODE_SIZE } from '../../shared/constants'
import {
  isCourseLayerVisibleAtLocation,
  sceneNodeToCourseLayerItem,
} from '../../shared/courseProjectModel'
import type {
  CourseProjectDocument,
  LayerItem,
  NativeLayerItem,
  ScopedLayerItem,
} from '../../shared/courseProjectTypes'
import type { DeepPartial, TeacherControllerNode } from '../../shared/projectTypes'
import {
  restoreCourseTeacherControllerLayer,
} from '../../shared/teacherControllerConsistency'
import {
  applyTeacherControllerResize,
  mapTeacherControllerRect,
  previewTeacherControllerMove,
  type TeacherControllerRect,
  type TeacherControllerResizeHandle,
  type TeacherControllerViewTransform,
  viewDeltaToCanonical,
} from '../../shared/teacherControllerLayout'
import { createTeacherControllerNode } from '../project/createProject'
import {
  deleteLayerItem,
  duplicateLayerItem,
  updateCourseProject,
  updateLayerItem,
} from './courseStudioModel'
import { selectGlobalLayerScope } from './courseLocationCommands'
import { isEditorWriteAction, type EditorActionId } from './editorActionTypes'

export type LayerCommandFailureCode =
  | 'locked'
  | 'missing'
  | 'stale-target'
  | 'cross-owner'
  | 'invalid'

export interface LayerCommandOk {
  readonly ok: true
  readonly project: CourseProjectDocument
  readonly reason: string
  readonly layerItemId?: string
}

export interface LayerCommandFailure {
  readonly ok: false
  readonly reason: string
  readonly code: LayerCommandFailureCode
}

export type LayerCommandResult = LayerCommandOk | LayerCommandFailure

export interface GlobalControllerTarget {
  readonly sessionId: string
  readonly locationId: string
  readonly projectRevision: number
  readonly source: 'global'
  readonly layerItemId: string
  readonly authoringAddress: string
}

export interface GlobalControllerTransform {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}

export interface GlobalDeleteImpact {
  readonly layerItemId: string
  readonly label: string
  readonly isTeacherController: boolean
  readonly affectedLocationIds: readonly string[]
  readonly affectedLocationLabels: readonly string[]
  readonly message: string
}

const LOCKED_WRITE_REASON = '图层已锁定，除解锁外不能修改。'
const MISSING_CONTROLLER_REASON = '全课控制器已失效，请重新选择。'

export function lockedLayerWriteReason(): string {
  return LOCKED_WRITE_REASON
}

export function refuseLockedLayerWrite(
  actionId: EditorActionId,
  locked: boolean,
): LayerCommandFailure | null {
  if (!locked || actionId === 'unlock' || !isEditorWriteAction(actionId)) return null
  return { ok: false, code: 'locked', reason: LOCKED_WRITE_REASON }
}

export function isTeacherControllerLayerItem(
  item: LayerItem | undefined,
): item is NativeLayerItem & {
  content: Extract<NativeLayerItem['content'], { nativeType: 'teacher-controller' }>
} {
  return Boolean(
    item &&
    item.kind === 'native' &&
    item.content.nativeType === 'teacher-controller',
  )
}

export function findGlobalTeacherController(
  project: Pick<CourseProjectDocument, 'globalLayerItems'>,
): ScopedLayerItem | undefined {
  return project.globalLayerItems.find((entry) => isTeacherControllerLayerItem(entry.item))
}

export function selectGlobalAuthoringOwner(
  project: Pick<CourseProjectDocument, 'locations' | 'surfaces'>,
  currentLocationId: string,
) {
  return selectGlobalLayerScope(project, currentLocationId)
}

export function globalLayerAuthoringAddress(
  projectId: string,
  layerItemId: string,
  field = 'item',
): string {
  return makeAuthoringAddress({
    projectId,
    scope: 'global',
    carrier: 'native',
    layerItemId,
    field,
  })
}

export function captureGlobalControllerTarget(input: {
  readonly project: CourseProjectDocument
  readonly sessionId: string
  readonly locationId: string
}): GlobalControllerTarget | null {
  const entry = findGlobalTeacherController(input.project)
  if (!entry || !input.sessionId.trim()) return null
  if (!input.project.locations.some((location) => location.id === input.locationId)) {
    return null
  }
  return {
    sessionId: input.sessionId,
    locationId: input.locationId,
    projectRevision: input.project.revision,
    source: 'global',
    layerItemId: entry.item.layerItemId,
    authoringAddress: globalLayerAuthoringAddress(
      input.project.id,
      entry.item.layerItemId,
    ),
  }
}

function currentGlobalControllerItem(
  project: CourseProjectDocument,
  target: GlobalControllerTarget,
): NativeLayerItem | null {
  if (
    target.source !== 'global' ||
    target.projectRevision !== project.revision ||
    !project.locations.some((location) => location.id === target.locationId)
  ) {
    return null
  }
  const item = project.globalLayerItems.find(
    (entry) => entry.item.layerItemId === target.layerItemId,
  )?.item
  return isTeacherControllerLayerItem(item) ? item : null
}

export function describeGlobalLayerDeleteImpact(
  project: CourseProjectDocument,
  layerItemId: string,
): GlobalDeleteImpact | null {
  const entry = project.globalLayerItems.find(
    (candidate) => candidate.item.layerItemId === layerItemId,
  )
  if (!entry) return null
  const locationIds = project.locations
    .filter((location) => isCourseLayerVisibleAtLocation(entry, location.id))
    .map((location) => location.id)
  const labels = project.locations
    .filter((location) => locationIds.includes(location.id))
    .map((location) => location.label)
  const isTeacherController = isTeacherControllerLayerItem(entry.item)
  const scope = locationIds.length === project.locations.length
    ? '全部页面'
    : labels.length > 0
      ? labels.join('、')
      : '当前可见范围'
  const restoreHint = isTeacherController
    ? '删除后可用“恢复教师控制器”重新加入默认控制台。'
    : '该全局内容不会复制到各页，删除后所有适用页面都会失去它。'
  return {
    layerItemId,
    label: entry.item.label,
    isTeacherController,
    affectedLocationIds: locationIds,
    affectedLocationLabels: labels,
    message: `删除全局层“${entry.item.label}”会影响${scope}。${restoreHint}`,
  }
}

function fail(code: LayerCommandFailureCode, reason: string): LayerCommandFailure {
  return { ok: false, code, reason }
}

function ok(
  project: CourseProjectDocument,
  reason: string,
  layerItemId?: string,
): LayerCommandOk {
  return { ok: true, project, reason, layerItemId }
}

function requireGlobalItem(
  project: CourseProjectDocument,
  layerItemId: string,
): LayerCommandFailure | ScopedLayerItem {
  const entry = project.globalLayerItems.find(
    (candidate) => candidate.item.layerItemId === layerItemId,
  )
  return entry ?? fail('missing', `找不到全局图层：${layerItemId}`)
}

function refuseIfLocked(
  item: LayerItem,
  unlocking: boolean,
): LayerCommandFailure | null {
  if (item.locked && !unlocking) {
    return fail('locked', LOCKED_WRITE_REASON)
  }
  return null
}

export function renameGlobalLayerItem(
  project: CourseProjectDocument,
  layerItemId: string,
  name: string,
  now?: string,
): LayerCommandResult {
  const entry = requireGlobalItem(project, layerItemId)
  if (!('item' in entry)) return entry
  const locked = refuseIfLocked(entry.item, false)
  if (locked) return locked
  const nextName = name.trim()
  if (!nextName) return fail('invalid', '名称不能为空')
  return ok(
    updateLayerItem(project, {
      surfaceId: project.surfaces[0]?.id ?? '',
      layerItemId,
      source: 'global',
    }, (item) => {
      item.label = nextName.slice(0, 80)
    }, now),
    `已重命名为“${nextName.slice(0, 80)}”`,
    layerItemId,
  )
}

export function setGlobalLayerVisible(
  project: CourseProjectDocument,
  layerItemId: string,
  visible: boolean,
  now?: string,
): LayerCommandResult {
  const entry = requireGlobalItem(project, layerItemId)
  if (!('item' in entry)) return entry
  const locked = refuseIfLocked(entry.item, false)
  if (locked) return locked
  return ok(
    updateLayerItem(project, {
      surfaceId: project.surfaces[0]?.id ?? '',
      layerItemId,
      source: 'global',
    }, (item) => {
      item.visible = visible
    }, now),
    visible ? '已显示图层' : '已隐藏图层',
    layerItemId,
  )
}

export function setGlobalLayerLocked(
  project: CourseProjectDocument,
  layerItemId: string,
  locked: boolean,
  now?: string,
): LayerCommandResult {
  const entry = requireGlobalItem(project, layerItemId)
  if (!('item' in entry)) return entry
  const blocked = refuseIfLocked(entry.item, !locked)
  if (blocked) return blocked
  return ok(
    updateLayerItem(project, {
      surfaceId: project.surfaces[0]?.id ?? '',
      layerItemId,
      source: 'global',
    }, (item) => {
      item.locked = locked
    }, now),
    locked ? '已锁定图层' : '已解锁图层',
    layerItemId,
  )
}

export function reorderGlobalLayerItems(
  project: CourseProjectDocument,
  orderedIds: readonly string[],
  now?: string,
): LayerCommandResult {
  const currentIds = project.globalLayerItems.map((entry) => entry.item.layerItemId)
  if (
    orderedIds.length !== currentIds.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !currentIds.includes(id))
  ) {
    return fail('invalid', '全局层排序必须包含全部全局图层，且不能混入其他来源。')
  }
  const locked = project.globalLayerItems.find((entry) => entry.item.locked)
  if (locked) return fail('locked', LOCKED_WRITE_REASON)
  if (orderedIds.every((id, index) => id === currentIds[index])) {
    return ok(project, '顺序未变化')
  }
  try {
    const next = updateCourseProject(project, (draft) => {
      const slots = draft.globalLayerItems
        .map((entry) => entry.item.order)
        .sort((left, right) => left - right)
      const byId = new Map(
        draft.globalLayerItems.map((entry) => [entry.item.layerItemId, entry.item]),
      )
      orderedIds.forEach((id, index) => {
        const item = byId.get(id)
        if (!item) throw new Error(`找不到全局图层：${id}`)
        item.order = slots[index]!
      })
      draft.globalLayerItems.sort((left, right) =>
        left.item.order - right.item.order ||
        left.item.layerItemId.localeCompare(right.item.layerItemId),
      )
    }, now)
    return ok(next, '已调整全局层顺序')
  } catch (error) {
    return fail('invalid', error instanceof Error ? error.message : '无法调整全局层顺序')
  }
}

export function pasteGlobalLayerItems(
  project: CourseProjectDocument,
  layerItemIds: readonly string[],
  now?: string,
): LayerCommandResult {
  if (layerItemIds.length === 0) {
    return fail('invalid', '剪贴板为空，无法粘贴')
  }
  let current = project
  const created: string[] = []
  for (const layerItemId of layerItemIds) {
    const result = duplicateGlobalLayerItem(current, layerItemId, now)
    if (!result.ok) return result
    current = result.project
    if (result.layerItemId) created.push(result.layerItemId)
  }
  return ok(current, `已粘贴 ${created.length} 项`, created[created.length - 1])
}

export function duplicateGlobalLayerItem(
  project: CourseProjectDocument,
  layerItemId: string,
  now?: string,
): LayerCommandResult {
  const entry = requireGlobalItem(project, layerItemId)
  if (!('item' in entry)) return entry
  if (isTeacherControllerLayerItem(entry.item)) {
    return ok(project, '教师控制器不能重复，全课只需一个。', layerItemId)
  }
  const locked = refuseIfLocked(entry.item, false)
  if (locked) return locked
  const surfaceId = project.surfaces[0]?.id ?? ''
  const next = duplicateLayerItem(project, {
    surfaceId,
    layerItemId,
    source: 'global',
  }, now)
  const created = next.globalLayerItems.find(
    (candidate) => !project.globalLayerItems.some(
      (previous) => previous.item.layerItemId === candidate.item.layerItemId,
    ),
  )
  return ok(next, `已复制“${entry.item.label}”`, created?.item.layerItemId)
}

export function deleteGlobalLayerItem(
  project: CourseProjectDocument,
  layerItemId: string,
  now?: string,
): LayerCommandResult {
  const entry = requireGlobalItem(project, layerItemId)
  if (!('item' in entry)) return entry
  const locked = refuseIfLocked(entry.item, false)
  if (locked) return locked
  const impact = describeGlobalLayerDeleteImpact(project, layerItemId)
  const surfaceId = project.surfaces[0]?.id ?? ''
  const next = deleteLayerItem(project, {
    surfaceId,
    layerItemId,
    source: 'global',
  }, now)
  return ok(next, impact?.message ?? `已删除“${entry.item.label}”`, layerItemId)
}

function nextGlobalOrder(project: CourseProjectDocument): number {
  return Math.max(-1, ...project.globalLayerItems.map((entry) => entry.item.order)) + 1
}

export function restoreDefaultTeacherController(
  project: CourseProjectDocument,
  now?: string,
): LayerCommandResult {
  const existing = findGlobalTeacherController(project)
  try {
    if (existing) {
      const next = updateCourseProject(project, (draft) => {
        const entry = draft.globalLayerItems.find(
          (candidate) => candidate.item.layerItemId === existing.item.layerItemId,
        )
        if (!entry || !isTeacherControllerLayerItem(entry.item)) {
          throw new Error(MISSING_CONTROLLER_REASON)
        }
        restoreCourseTeacherControllerLayer(entry)
        draft.playback.controls = 'canvas'
      }, now)
      return ok(next, '已恢复教师控制器', existing.item.layerItemId)
    }
    const node = createTeacherControllerNode({
      id: `teacher-controller-${nanoid(8)}`,
    })
    const item = sceneNodeToCourseLayerItem(node, nextGlobalOrder(project))
    const next = updateCourseProject(project, (draft) => {
      draft.globalLayerItems.push({
        item,
        visibility: { mode: 'all', locationIds: [] },
      })
      draft.playback.controls = 'canvas'
    }, now)
    return ok(next, '已恢复教师控制器', item.layerItemId)
  } catch (error) {
    return fail('invalid', error instanceof Error ? error.message : '无法恢复教师控制器')
  }
}

export function previewGlobalControllerTransform(
  start: TeacherControllerRect,
  pointer: {
    readonly kind: 'move' | 'resize'
    readonly handle?: TeacherControllerResizeHandle
    readonly viewDelta: { readonly x: number; readonly y: number }
    readonly transform: TeacherControllerViewTransform
  },
): TeacherControllerRect {
  const canonicalDelta = viewDeltaToCanonical(pointer.viewDelta, pointer.transform)
  if (pointer.kind === 'resize' && pointer.handle) {
    return applyTeacherControllerResize(start, pointer.handle, canonicalDelta)
  }
  return previewTeacherControllerMove(start, canonicalDelta)
}

export function mapGlobalControllerChrome(
  content: TeacherControllerRect,
  transform: TeacherControllerViewTransform,
): { readonly content: TeacherControllerRect; readonly chrome: TeacherControllerRect } {
  const mapped = mapTeacherControllerRect(content, transform)
  return { content: mapped, chrome: mapped }
}

export function commitGlobalControllerTransform(
  project: CourseProjectDocument,
  target: GlobalControllerTarget,
  transform: GlobalControllerTransform,
  now?: string,
): LayerCommandResult {
  const current = currentGlobalControllerItem(project, target)
  if (!current) return fail('stale-target', MISSING_CONTROLLER_REASON)
  const locked = refuseIfLocked(current, false)
  if (locked) return locked
  if (
    !Number.isFinite(transform.x) ||
    !Number.isFinite(transform.y) ||
    !Number.isFinite(transform.width) || transform.width < MIN_NODE_SIZE ||
    !Number.isFinite(transform.height) || transform.height < MIN_NODE_SIZE ||
    !Number.isFinite(transform.rotation) ||
    transform.rotation < -36_000 || transform.rotation > 36_000
  ) {
    return fail('invalid', '控制器尺寸或旋转不合法。')
  }
  const frame = current.frame
  if (
    Math.abs(frame.x - transform.x) < 0.01 &&
    Math.abs(frame.y - transform.y) < 0.01 &&
    Math.abs(frame.width - transform.width) < 0.01 &&
    Math.abs(frame.height - transform.height) < 0.01 &&
    Math.abs(current.rotation - transform.rotation) < 0.01
  ) {
    return ok(project, '控制器位置未变化', target.layerItemId)
  }
  const next = updateLayerItem(project, {
    surfaceId: project.surfaces[0]?.id ?? '',
    layerItemId: target.layerItemId,
    source: 'global',
  }, (item) => {
    item.frame = {
      mode: 'absolute',
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
    }
    item.rotation = transform.rotation
  }, now)
  return ok(next, '已更新教师控制器位置', target.layerItemId)
}

export function updateGlobalControllerContent(
  project: CourseProjectDocument,
  target: GlobalControllerTarget,
  patch: DeepPartial<TeacherControllerNode> & { readonly locked?: boolean },
  now?: string,
): LayerCommandResult {
  const current = currentGlobalControllerItem(project, target)
  if (!current) return fail('stale-target', MISSING_CONTROLLER_REASON)
  if (patch.locked !== undefined && Object.keys(patch).length === 1) {
    return setGlobalLayerLocked(project, target.layerItemId, patch.locked, now)
  }
  const locked = refuseIfLocked(current, false)
  if (locked) return locked
  try {
    const next = updateLayerItem(project, {
      surfaceId: project.surfaces[0]?.id ?? '',
      layerItemId: target.layerItemId,
      source: 'global',
    }, (item) => {
      if (!isTeacherControllerLayerItem(item)) {
        throw new Error(MISSING_CONTROLLER_REASON)
      }
      if (patch.name?.trim()) item.label = patch.name.trim()
      if (patch.visible !== undefined) item.visible = patch.visible
      if (typeof patch.opacity === 'number') item.opacity = patch.opacity
      if (typeof patch.x === 'number') item.frame.x = patch.x
      if (typeof patch.y === 'number') item.frame.y = patch.y
      if (typeof patch.width === 'number') item.frame.width = patch.width
      if (typeof patch.height === 'number') item.frame.height = patch.height
      if (typeof patch.rotation === 'number') item.rotation = patch.rotation
      const data = item.content.data
      if (patch.title !== undefined) data.title = patch.title
      if (patch.showSceneProgress !== undefined) data.showSceneProgress = patch.showSceneProgress
      if (patch.compact !== undefined) data.compact = patch.compact
      if (patch.collapsible !== undefined) data.collapsible = patch.collapsible
      if (patch.defaultCollapsed !== undefined) data.defaultCollapsed = patch.defaultCollapsed
      if (patch.includeInStaticExports !== undefined) {
        data.includeInStaticExports = patch.includeInStaticExports
      }
      if (patch.buttons) data.buttons = structuredClone(patch.buttons) as TeacherControllerNode['buttons']
      if (patch.style) data.style = { ...data.style, ...patch.style }
    }, now)
    return ok(next, '已更新教师控制器', target.layerItemId)
  } catch (error) {
    return fail('invalid', error instanceof Error ? error.message : '无法更新教师控制器')
  }
}

export function globalControllerContentRect(item: LayerItem): TeacherControllerRect {
  return {
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
  }
}

export { CANVAS_WIDTH, CANVAS_HEIGHT }
