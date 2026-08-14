import {
  commitCourseHistory,
  type CourseHistoryState,
  updateCourseProject,
} from './courseStudioModel'
import { buildSlideEditorView } from './slideEditorView'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'

/** Stable editor-only identity; it is never persisted in the project or history. */
export interface SlideEditorSelection {
  readonly locationId: string
  readonly stateId: string | null
  readonly selectionId: string | null
}

export interface SelectSlideEditorLayerInput {
  readonly project: CourseProjectDocument
  readonly locationId: string
  /** `undefined` follows the location; `null` deliberately selects the base scene. */
  readonly stateId?: string | null
  readonly selectionId: string | null
}

export interface SlideEditorMoveDelta {
  readonly x: number
  readonly y: number
}

export function selectSlideEditorLayer(
  input: SelectSlideEditorLayerInput,
): SlideEditorSelection {
  const view = buildSlideEditorView({
    project: input.project,
    locationId: input.locationId,
    stateId: input.stateId,
  })

  if (input.selectionId !== null && !view.layers.some((layer) => (
    layer.selectionId === input.selectionId
  ))) {
    throw new Error(`找不到 Slide 编辑图层：${input.selectionId}`)
  }

  return Object.freeze({
    locationId: view.locationId,
    stateId: view.presentation?.activeStateId ?? null,
    selectionId: input.selectionId,
  })
}

function selectedUnlockedSceneText(
  history: CourseHistoryState,
  selection: SlideEditorSelection,
) {
  if (selection.selectionId === null) throw new Error('当前没有选中的 Slide 图层')

  const view = buildSlideEditorView({
    project: history.present,
    locationId: selection.locationId,
    stateId: selection.stateId,
  })
  const layer = view.layers.find((candidate) => candidate.selectionId === selection.selectionId)
  if (!layer) throw new Error(`选中的 Slide 图层已失效：${selection.selectionId}`)
  if (layer.source !== 'scene') throw new Error('当前选择不属于当前 Slide 场景')
  if (layer.item.kind !== 'native' || layer.item.content.nativeType !== 'text') {
    throw new Error('当前选择不是可移动的 Slide 文字')
  }
  if (layer.item.locked) throw new Error('当前 Slide 文字已锁定')

  return { view, layer }
}

/** Moves one unlocked Native text item and commits exactly one V9 history entry. */
export function moveSelectedSlideText(
  history: CourseHistoryState,
  selection: SlideEditorSelection,
  delta: SlideEditorMoveDelta,
  now?: string,
): CourseHistoryState {
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
    throw new Error('Slide 文字移动距离必须是有限数字')
  }
  if (delta.x === 0 && delta.y === 0) return history

  const { view, layer } = selectedUnlockedSceneText(history, selection)
  const x = layer.item.frame.x + delta.x
  const y = layer.item.frame.y + delta.y
  const next = updateCourseProject(history.present, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === view.surfaceId)
    if (!surface || surface.type !== 'slide') throw new Error(`找不到 Slide 表面：${view.surfaceId}`)
    const scene = surface.scenes.find((candidate) => candidate.id === view.sceneId)
    if (!scene) throw new Error(`找不到 Slide 场景：${view.sceneId}`)
    const item = scene.layerItems.find((candidate) => candidate.layerItemId === selection.selectionId)
    if (!item) throw new Error(`选中的 Slide 图层已失效：${selection.selectionId}`)

    if (selection.stateId === null) {
      item.frame.x = x
      item.frame.y = y
      return
    }

    const state = scene.presentation?.states.find((candidate) => candidate.id === selection.stateId)
    if (!state) throw new Error(`找不到 Slide 状态：${selection.stateId}`)
    const override = state.layerItemOverrides[item.layerItemId]
    state.layerItemOverrides[item.layerItemId] = {
      ...override,
      frame: { ...override?.frame, x, y },
    }
  }, now)

  return commitCourseHistory(history, next)
}
