import {
  commitCourseHistory,
  type CourseHistoryState,
  updateCourseProject,
} from './courseStudioModel'
import { buildSlideEditorView } from './slideEditorView'
import type {
  CourseProjectDocument,
  LayerItemOverride,
} from '../../shared/courseProjectTypes'

/** Stable editor-only identities; they are never persisted in the project or history. */
export interface SlideEditorSelection {
  readonly locationId: string
  readonly stateId: string | null
  readonly selectionIds: readonly string[]
}

export interface SelectSlideEditorLayersInput {
  readonly project: CourseProjectDocument
  readonly locationId: string
  /** `undefined` follows the location; `null` deliberately selects the base scene. */
  readonly stateId?: string | null
  readonly selectionIds: readonly string[]
}

export interface SlideEditorNodeTransform {
  readonly nodeId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}

export interface SlideEditorTransformInput {
  readonly nodes: readonly SlideEditorNodeTransform[]
}

export function selectSlideEditorLayers(
  input: SelectSlideEditorLayersInput,
): SlideEditorSelection {
  const view = buildSlideEditorView({
    project: input.project,
    locationId: input.locationId,
    stateId: input.stateId,
  })
  const selectionIds = [...input.selectionIds]
  if (new Set(selectionIds).size !== selectionIds.length) {
    throw new Error('选择中不能包含重复元素')
  }
  const availableIds = new Set(view.layers.map((layer) => layer.selectionId))
  const missingId = selectionIds.find((selectionId) => !availableIds.has(selectionId))
  if (missingId !== undefined) {
    throw new Error('所选元素已失效，请重新选择')
  }

  return Object.freeze({
    locationId: view.locationId,
    stateId: view.presentation?.activeStateId ?? null,
    selectionIds: Object.freeze(selectionIds),
  })
}

function validateTransform(transform: SlideEditorNodeTransform): void {
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

function deleteEmptyFrameOverride(override: LayerItemOverride): void {
  if (override.frame && Object.keys(override.frame).length === 0) {
    delete override.frame
  }
}

function deleteEmptyLayerOverride(
  overrides: Record<string, LayerItemOverride>,
  layerItemId: string,
): void {
  const override = overrides[layerItemId]
  if (override && Object.keys(override).length === 0) {
    delete overrides[layerItemId]
  }
}

/**
 * Applies one completed Workspace gesture to unlocked scene Native layers.
 * Preview frames never enter this command, so one invocation creates at most
 * one Project revision and one history entry regardless of selection size.
 */
export function transformSelectedSlideNativeLayers(
  history: CourseHistoryState,
  selection: SlideEditorSelection,
  input: SlideEditorTransformInput,
  now?: string,
): CourseHistoryState {
  if (input.nodes.length === 0) return history
  const nodeIds = input.nodes.map((node) => node.nodeId)
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw new Error('一次变换不能包含重复元素')
  }
  input.nodes.forEach(validateTransform)

  const selectedIds = new Set(selection.selectionIds)
  const unselectedId = nodeIds.find((nodeId) => !selectedIds.has(nodeId))
  if (unselectedId !== undefined) {
    throw new Error('变换目标不在当前选择中')
  }

  const view = buildSlideEditorView({
    project: history.present,
    locationId: selection.locationId,
    stateId: selection.stateId,
  })
  const layerById = new Map(view.layers.map((layer) => [layer.selectionId, layer]))
  const plans = input.nodes.map((transform) => {
    const layer = layerById.get(transform.nodeId)
    if (!layer) throw new Error('所选元素已失效，请重新选择')
    if (layer.source !== 'scene') throw new Error('当前选择不属于当前幻灯片')
    if (layer.item.kind !== 'native') throw new Error('当前选择包含暂不可变换的元素')
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
    if (!location || location.kind !== 'slide-scene') {
      throw new Error('当前幻灯片位置已失效')
    }
    const surface = draft.surfaces.find((candidate) => candidate.id === location.surfaceId)
    if (!surface || surface.type !== 'slide') {
      throw new Error('当前幻灯片已失效')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
    if (!scene) throw new Error('当前幻灯片已失效')
    const baseById = new Map(scene.layerItems.map((item) => [item.layerItemId, item]))
    const state = selection.stateId === null
      ? undefined
      : scene.presentation?.states.find((candidate) => candidate.id === selection.stateId)
    if (selection.stateId !== null && !state) {
      throw new Error('当前状态已失效')
    }

    for (const { transform, changed } of plans) {
      if (!changed) continue
      const base = baseById.get(transform.nodeId)
      if (!base || base.kind !== 'native') {
        throw new Error('所选元素已失效，请重新选择')
      }
      if (!state) {
        base.frame.x = transform.x
        base.frame.y = transform.y
        base.frame.width = transform.width
        base.frame.height = transform.height
        base.rotation = transform.rotation
        continue
      }

      const override = state.layerItemOverrides[base.layerItemId] ?? {}
      const frame = { ...override.frame }
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        if (transform[key] === base.frame[key]) delete frame[key]
        else frame[key] = transform[key]
      }
      override.frame = frame
      if (transform.rotation === base.rotation) delete override.rotation
      else override.rotation = transform.rotation
      deleteEmptyFrameOverride(override)
      state.layerItemOverrides[base.layerItemId] = override
      deleteEmptyLayerOverride(state.layerItemOverrides, base.layerItemId)
    }
  }, now)

  return commitCourseHistory(history, next)
}
