import { courseProjectDocumentSchema } from '../../shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  LayerItem,
  LayerItemOverride,
} from '../../shared/courseProjectTypes'
import { buildSlideEditorView, type SlideEditorLayerScope } from './slideEditorView'

export const SLIDE_REJECT_LOCKED = 'locked'
export const SLIDE_REJECT_STALE_REVISION = 'stale-revision'
export const SLIDE_REJECT_WRONG_OWNER = 'wrong-owner'

/** Stable editor-only identities; they are never persisted in the project or history. */
export interface SlideAuthoringSelection {
  readonly locationId: string
  readonly stateId: string | null
  readonly selectionIds: readonly string[]
}

/** @deprecated Use SlideAuthoringSelection. Kept as the donor command-layer alias. */
export type SlideEditorSelection = SlideAuthoringSelection

export interface SlideAuthoringHistory {
  readonly present: CourseProjectDocument
  readonly past: readonly CourseProjectDocument[]
  readonly future: readonly CourseProjectDocument[]
}

/**
 * Stable authoring token. `authoringAddress` is always `makeAuthoringAddress`.
 * Temporary hit-test ids must not be stored here or written into the project.
 */
export interface SlideAuthoringTarget {
  readonly sessionId: string
  readonly revision: number
  readonly generation: number
  readonly authoringAddress: string
  readonly scope: SlideEditorLayerScope
  readonly layerItemId: string
}

export interface SlideCommandOptions {
  readonly now?: string
  readonly expectedRevision?: number
}

export interface SlideCommandResult {
  readonly ok: boolean
  readonly reason?: string
  readonly nextSession?: SlideAuthoringSessionRef
  readonly historyEntry?: boolean
  readonly selection?: SlideAuthoringSelection
}

/**
 * Session shape owned by the Slide domain slice. Commands accept this token
 * without importing App/store types.
 */
export interface SlideAuthoringSessionRef {
  readonly sessionId: string
  readonly history: SlideAuthoringHistory
  readonly selection: SlideAuthoringSelection
  readonly scope: SlideEditorLayerScope
  readonly generation: number
}

export class SlideCommandError extends Error {
  readonly reason: string

  constructor(reason: string, message?: string) {
    super(message ?? reason)
    this.name = 'SlideCommandError'
    this.reason = reason
  }
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

export function createSlideAuthoringHistory(
  project: CourseProjectDocument,
): SlideAuthoringHistory {
  return Object.freeze({
    present: project,
    past: Object.freeze([] as CourseProjectDocument[]),
    future: Object.freeze([] as CourseProjectDocument[]),
  })
}

export function commitSlideAuthoringHistory(
  history: SlideAuthoringHistory,
  next: CourseProjectDocument,
  limit = 100,
): SlideAuthoringHistory {
  return Object.freeze({
    present: next,
    past: Object.freeze([...history.past, history.present].slice(-limit)),
    future: Object.freeze([] as CourseProjectDocument[]),
  })
}

export function undoSlideAuthoringHistory(
  history: SlideAuthoringHistory,
): SlideAuthoringHistory {
  const previous = history.past.at(-1)
  if (!previous) return history
  return Object.freeze({
    present: previous,
    past: Object.freeze(history.past.slice(0, -1)),
    future: Object.freeze([history.present, ...history.future]),
  })
}

export function redoSlideAuthoringHistory(
  history: SlideAuthoringHistory,
): SlideAuthoringHistory {
  const next = history.future[0]
  if (!next) return history
  return Object.freeze({
    present: next,
    past: Object.freeze([...history.past, history.present]),
    future: Object.freeze(history.future.slice(1)),
  })
}

export function commitSlideProjectMutation(
  project: CourseProjectDocument,
  mutate: (draft: CourseProjectDocument) => void,
  now = new Date().toISOString(),
): CourseProjectDocument {
  const draft = structuredClone(project)
  mutate(draft)
  draft.revision = project.revision + 1
  draft.updatedAt = now
  return courseProjectDocumentSchema.parse(draft)
}

export function selectSlideEditorLayers(
  input: SelectSlideEditorLayersInput,
): SlideAuthoringSelection {
  const view = buildSlideEditorView({
    project: input.project,
    locationId: input.locationId,
    stateId: input.stateId,
  })
  const selectionIds = [...input.selectionIds]
  if (new Set(selectionIds).size !== selectionIds.length) {
    throw new SlideCommandError('invalid-selection', '选择中不能包含重复元素')
  }
  const availableIds = new Set(view.layers.map((layer) => layer.selectionId))
  const missingId = selectionIds.find((selectionId) => !availableIds.has(selectionId))
  if (missingId !== undefined) {
    throw new SlideCommandError('invalid-selection', '所选元素已失效，请重新选择')
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
    throw new SlideCommandError('invalid-target', '元素位置和尺寸必须是有效数字')
  }
  if (transform.width <= 0 || transform.height <= 0) {
    throw new SlideCommandError('invalid-target', '元素宽高必须大于零')
  }
  if (transform.rotation < -36_000 || transform.rotation > 36_000) {
    throw new SlideCommandError('invalid-target', '元素旋转角度超出允许范围')
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

function isSceneFrameTransformableKind(kind: LayerItem['kind']): boolean {
  return kind === 'native' || kind === 'component' || kind === 'runtime'
}

/**
 * Applies one completed Workspace gesture to unlocked scene layers that own a
 * frame (native, component, runtime). Teacher-controller stays on the global
 * path. Preview frames never enter this command, so one invocation creates at
 * most one Project revision and one history entry regardless of selection size.
 */
export function transformSelectedSlideNativeLayers(
  history: SlideAuthoringHistory,
  selection: SlideAuthoringSelection,
  input: SlideEditorTransformInput,
  now?: string,
): SlideAuthoringHistory {
  if (input.nodes.length === 0) return history
  const nodeIds = input.nodes.map((node) => node.nodeId)
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw new SlideCommandError('invalid-selection', '一次变换不能包含重复元素')
  }
  input.nodes.forEach(validateTransform)

  const selectedIds = new Set(selection.selectionIds)
  const unselectedId = nodeIds.find((nodeId) => !selectedIds.has(nodeId))
  if (unselectedId !== undefined) {
    throw new SlideCommandError('invalid-selection', '变换目标不在当前选择中')
  }

  const view = buildSlideEditorView({
    project: history.present,
    locationId: selection.locationId,
    stateId: selection.stateId,
  })
  const layerById = new Map(view.layers.map((layer) => [layer.selectionId, layer]))
  const plans = input.nodes.map((transform) => {
    const layer = layerById.get(transform.nodeId)
    if (!layer) throw new SlideCommandError('invalid-selection', '所选元素已失效，请重新选择')
    if (layer.source !== 'scene') {
      throw new SlideCommandError(SLIDE_REJECT_WRONG_OWNER, '当前选择不属于当前幻灯片场景')
    }
    if (!isSceneFrameTransformableKind(layer.item.kind)) {
      throw new SlideCommandError('invalid-target', '当前选择包含暂不可变换的元素')
    }
    if (!layer.effectiveVisible) {
      throw new SlideCommandError('invalid-target', '当前元素不可见')
    }
    if (layer.item.locked) {
      throw new SlideCommandError(SLIDE_REJECT_LOCKED, '当前元素已锁定')
    }
    const changed =
      layer.item.frame.x !== transform.x ||
      layer.item.frame.y !== transform.y ||
      layer.item.frame.width !== transform.width ||
      layer.item.frame.height !== transform.height ||
      layer.item.rotation !== transform.rotation
    return { transform, changed }
  })
  if (!plans.some((plan) => plan.changed)) return history

  const next = commitSlideProjectMutation(history.present, (draft) => {
    const location = draft.locations.find((candidate) => candidate.id === selection.locationId)
    if (!location || location.kind !== 'slide-scene') {
      throw new SlideCommandError('invalid-target', '当前幻灯片位置已失效')
    }
    const surface = draft.surfaces.find((candidate) => candidate.id === location.surfaceId)
    if (!surface || surface.type !== 'slide') {
      throw new SlideCommandError('invalid-target', '当前幻灯片已失效')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
    if (!scene) throw new SlideCommandError('invalid-target', '当前幻灯片已失效')
    const baseById = new Map(scene.layerItems.map((item) => [item.layerItemId, item]))
    const state = selection.stateId === null
      ? undefined
      : scene.presentation?.states.find((candidate) => candidate.id === selection.stateId)
    if (selection.stateId !== null && !state) {
      throw new SlideCommandError('invalid-target', '当前状态已失效')
    }

    for (const { transform, changed } of plans) {
      if (!changed) continue
      const base = baseById.get(transform.nodeId)
      if (!base || !isSceneFrameTransformableKind(base.kind)) {
        throw new SlideCommandError('invalid-selection', '所选元素已失效，请重新选择')
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

  return commitSlideAuthoringHistory(history, next)
}
