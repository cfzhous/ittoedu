import { nanoid } from 'nanoid'
import type {
  CourseProjectDocument,
  SpatialCameraPose,
  SpatialSemanticZoomRule,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import {
  commitCourseHistory,
  type CourseHistoryState,
  updateCourseProject,
} from './courseStudioModel'

export interface SpatialCameraPoseInput {
  x: number
  y: number
  zoom: number
}

export interface AddSpatialEditorCameraFrameOptions {
  id?: string
  name?: string
  now?: string
}

export interface AddSpatialEditorSemanticZoomRuleInput {
  id?: string
  layerItemIds: string[]
  minZoom: number
  maxZoom: number
  visible?: boolean
  now?: string
}

export type SpatialEditorSemanticZoomRuleUpdate =
  | Partial<Omit<SpatialSemanticZoomRule, 'id'>>
  | ((rule: SpatialSemanticZoomRule) => void)

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

function spatialCameraFrameIn(
  surface: SpatialSurfaceDocument,
  frameId: string,
): SpatialSurfaceDocument['camera']['frames'][number] {
  const frame = surface.camera.frames.find((candidate) => candidate.id === frameId)
  if (!frame) throw new Error('找不到镜头画面，请刷新后重试')
  return frame
}

function validateCameraPose(pose: SpatialCameraPoseInput): void {
  if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y)) {
    throw new Error('镜头位置必须是有效数字')
  }
  if (!Number.isFinite(pose.zoom) || pose.zoom <= 0 || pose.zoom > 1_000) {
    throw new Error('镜头缩放必须大于 0 且不超过 1000')
  }
}

function validateCameraFrameName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('镜头名称不能为空')
  if (trimmed.length > 200) throw new Error('镜头名称不能超过 200 字')
  return trimmed
}

function validateSemanticZoomRange(minZoom: number, maxZoom: number): void {
  if (!Number.isFinite(minZoom) || !Number.isFinite(maxZoom)) {
    throw new Error('语义缩放范围必须是有效数字')
  }
  if (minZoom < 0) throw new Error('语义缩放最小值不能小于 0')
  if (maxZoom <= 0) throw new Error('语义缩放最大值必须大于 0')
  if (minZoom >= maxZoom) throw new Error('语义缩放范围无效：最小缩放必须小于最大缩放')
}

function validateWorldLayerItemIds(
  surface: SpatialSurfaceDocument,
  layerItemIds: readonly string[],
): void {
  if (layerItemIds.length === 0) {
    throw new Error('语义缩放规则至少需要引用一个世界图层')
  }
  if (new Set(layerItemIds).size !== layerItemIds.length) {
    throw new Error('语义缩放规则不能包含重复图层')
  }
  const worldIds = new Set(surface.world.layerItems.map((item) => item.layerItemId))
  const danglingId = layerItemIds.find((layerItemId) => !worldIds.has(layerItemId))
  if (danglingId !== undefined) {
    throw new Error('语义缩放规则引用了不存在的世界图层')
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
 * Adds one Spatial camera frame from the session camera pose. The frame and
 * its location are persisted; the session pan/zoom itself is never written.
 * Exactly one Project revision and one history entry are created.
 */
export function addSpatialEditorCameraFrame(
  history: CourseHistoryState,
  surfaceId: string,
  pose: SpatialCameraPoseInput,
  options: AddSpatialEditorCameraFrameOptions = {},
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  validateCameraPose(pose)

  const frameId = stableId('camera', options.id)
  if (surface.camera.frames.some((frame) => frame.id === frameId)) {
    throw new Error('镜头 ID 已存在，请重新生成后重试')
  }
  if (project.locations.some((location) => location.id === frameId)) {
    throw new Error('位置 ID 已存在，请重新生成后重试')
  }

  const name = options.name === undefined
    ? `镜头 ${surface.camera.frames.length + 1}`
    : validateCameraFrameName(options.name)

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    const frame = {
      id: frameId,
      name,
      x: pose.x,
      y: pose.y,
      zoom: pose.zoom,
    }
    draftSurface.camera.frames.push(frame)
    draft.locations.push({
      id: frameId,
      label: `${draftSurface.title} · ${name}`,
      kind: 'spatial-camera',
      surfaceId,
      cameraFrameId: frameId,
    })
    const printEntry = draft.mixedPrintPlan?.entries.find((entry) =>
      entry.kind === 'spatial-frames' && entry.surfaceId === surfaceId,
    )
    if (printEntry?.kind === 'spatial-frames') {
      printEntry.cameraFrameIds.push(frameId)
    }
  }, options.now)

  return commitCourseHistory(history, next)
}

/** Renames one persisted camera frame and keeps its course location label in sync. */
export function renameSpatialCameraFrame(
  history: CourseHistoryState,
  surfaceId: string,
  frameId: string,
  name: string,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  const frame = spatialCameraFrameIn(surface, frameId)
  const trimmed = validateCameraFrameName(name)
  if (frame.name === trimmed) return history

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    const draftFrame = spatialCameraFrameIn(draftSurface, frameId)
    draftFrame.name = trimmed
    draft.locations.forEach((location) => {
      if (
        location.kind === 'spatial-camera' &&
        location.surfaceId === surfaceId &&
        location.cameraFrameId === frameId
      ) {
        location.label = `${draftSurface.title} · ${trimmed}`
      }
    })
  }, now)

  return commitCourseHistory(history, next)
}

/** Reorders persisted camera frames. The session camera stays untouched. */
export function reorderSpatialCameraFrames(
  history: CourseHistoryState,
  surfaceId: string,
  frameId: string,
  toIndex: number,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  const frames = surface.camera.frames
  const fromIndex = frames.findIndex((frame) => frame.id === frameId)
  if (fromIndex < 0) throw new Error('找不到镜头画面，请刷新后重试')
  if (!Number.isFinite(toIndex)) throw new Error('排序位置必须是有效数字')
  const destination = Math.max(0, Math.min(Math.trunc(toIndex), frames.length - 1))
  if (fromIndex === destination) return history

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    const draftFrames = draftSurface.camera.frames
    const index = draftFrames.findIndex((frame) => frame.id === frameId)
    if (index < 0) throw new Error('找不到镜头画面，请刷新后重试')
    const [frame] = draftFrames.splice(index, 1)
    const target = Math.max(0, Math.min(Math.trunc(toIndex), draftFrames.length))
    draftFrames.splice(target, 0, frame!)
  }, now)

  return commitCourseHistory(history, next)
}

/**
 * Deletes one persisted camera frame while keeping at least one frame. Dangling
 * course locations, the start location and the mixed print plan are repaired in
 * the same single history entry.
 */
export function deleteSpatialCameraFrame(
  history: CourseHistoryState,
  surfaceId: string,
  frameId: string,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  const frameIndex = surface.camera.frames.findIndex((frame) => frame.id === frameId)
  if (frameIndex < 0) throw new Error('找不到镜头画面，请刷新后重试')
  if (surface.camera.frames.length <= 1) {
    throw new Error('空间表面至少需要一个镜头画面')
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    const index = draftSurface.camera.frames.findIndex((frame) => frame.id === frameId)
    if (index < 0) throw new Error('找不到镜头画面，请刷新后重试')
    if (draftSurface.camera.frames.length <= 1) {
      throw new Error('空间表面至少需要一个镜头画面')
    }
    draftSurface.camera.frames.splice(index, 1)
    const remainingFrameIds = new Set(draftSurface.camera.frames.map((frame) => frame.id))

    const removedLocationIds = new Set(
      draft.locations
        .filter((location) =>
          location.kind === 'spatial-camera' &&
          location.surfaceId === surfaceId &&
          location.cameraFrameId === frameId,
        )
        .map((location) => location.id),
    )
    draft.locations = draft.locations.filter((location) => !removedLocationIds.has(location.id))

    if (
      removedLocationIds.has(draft.startLocationId) ||
      !draft.locations.some((location) => location.id === draft.startLocationId)
    ) {
      draft.startLocationId =
        draft.locations.find((location) =>
          location.kind === 'spatial-camera' &&
          location.surfaceId === surfaceId &&
          remainingFrameIds.has(location.cameraFrameId),
        )?.id ??
        draft.locations[0]?.id ??
        ''
    }

    const printEntry = draft.mixedPrintPlan?.entries.find((entry) =>
      entry.kind === 'spatial-frames' && entry.surfaceId === surfaceId,
    )
    if (printEntry?.kind === 'spatial-frames') {
      printEntry.cameraFrameIds = printEntry.cameraFrameIds.filter((id) => id !== frameId)
      if (printEntry.cameraFrameIds.length === 0) {
        printEntry.cameraFrameIds = [draftSurface.camera.frames[0]!.id]
      }
    }
  }, now)

  return commitCourseHistory(history, next)
}

/**
 * Persists the given pose as the Spatial surface home camera. This is the only
 * camera command that writes to `camera.home`; session pan/zoom is never
 * persisted by any command in this module.
 */
export function setSpatialCameraHome(
  history: CourseHistoryState,
  surfaceId: string,
  pose: SpatialCameraPoseInput,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  validateCameraPose(pose)
  const home = surface.camera.home
  if (home.x === pose.x && home.y === pose.y && home.zoom === pose.zoom) return history

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    draftSurface.camera.home = { x: pose.x, y: pose.y, zoom: pose.zoom }
  }, now)

  return commitCourseHistory(history, next)
}

/** Adds one semantic zoom rule. Dangling world layer ids are rejected. */
export function addSpatialEditorSemanticZoomRule(
  history: CourseHistoryState,
  surfaceId: string,
  input: AddSpatialEditorSemanticZoomRuleInput,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  validateSemanticZoomRange(input.minZoom, input.maxZoom)
  validateWorldLayerItemIds(surface, input.layerItemIds)

  const ruleId = stableId('semantic-zoom', input.id)
  if (surface.semanticZoom.some((rule) => rule.id === ruleId)) {
    throw new Error('语义缩放规则 ID 已存在，请重新生成后重试')
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    draftSurface.semanticZoom.push({
      id: ruleId,
      layerItemIds: [...input.layerItemIds],
      minZoom: input.minZoom,
      maxZoom: input.maxZoom,
      visible: input.visible ?? true,
    })
  }, input.now)

  return commitCourseHistory(history, next)
}

/**
 * Updates one semantic zoom rule immutably. The rule id is never replaced; the
 * merged result is validated before one history entry is committed.
 */
export function updateSpatialEditorSemanticZoomRule(
  history: CourseHistoryState,
  surfaceId: string,
  ruleId: string,
  update: SpatialEditorSemanticZoomRuleUpdate,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  const current = surface.semanticZoom.find((rule) => rule.id === ruleId)
  if (!current) throw new Error('找不到语义缩放规则，请刷新后重试')

  const nextRule = structuredClone(current)
  if (typeof update === 'function') {
    update(nextRule)
  } else if (update !== null && typeof update === 'object') {
    Object.assign(nextRule, structuredClone(update))
  } else {
    throw new Error('语义缩放更新数据无效')
  }
  nextRule.id = current.id

  validateSemanticZoomRange(nextRule.minZoom, nextRule.maxZoom)
  validateWorldLayerItemIds(surface, nextRule.layerItemIds)
  if (!valuesEqual(current, nextRule)) {
    const next = updateCourseProject(project, (draft) => {
      const draftSurface = spatialSurfaceIn(draft, surfaceId)
      const index = draftSurface.semanticZoom.findIndex((rule) => rule.id === ruleId)
      if (index < 0) throw new Error('找不到语义缩放规则，请刷新后重试')
      draftSurface.semanticZoom[index] = nextRule
    }, now)
    return commitCourseHistory(history, next)
  }

  return history
}

/** Deletes one semantic zoom rule in a single history entry. */
export function deleteSpatialEditorSemanticZoomRule(
  history: CourseHistoryState,
  surfaceId: string,
  ruleId: string,
  now?: string,
): CourseHistoryState {
  const project = history.present
  const surface = spatialSurfaceIn(project, surfaceId)
  if (!surface.semanticZoom.some((rule) => rule.id === ruleId)) {
    throw new Error('找不到语义缩放规则，请刷新后重试')
  }

  const next = updateCourseProject(project, (draft) => {
    const draftSurface = spatialSurfaceIn(draft, surfaceId)
    const index = draftSurface.semanticZoom.findIndex((rule) => rule.id === ruleId)
    if (index < 0) throw new Error('找不到语义缩放规则，请刷新后重试')
    draftSurface.semanticZoom.splice(index, 1)
  }, now)

  return commitCourseHistory(history, next)
}
