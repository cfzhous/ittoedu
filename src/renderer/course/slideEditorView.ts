import { isCourseLayerVisibleAtLocation } from '../../shared/courseProjectModel'
import { mergeCourseNativeData } from '../../shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  LayerItem,
  SlidePresentationState,
  SlideSurfaceDocument,
} from '../../shared/courseProjectTypes'
import { compareStableStrings } from '../../shared/stableOrder'

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T :
    T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[] :
      T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } :
        T

export type SlideEditorLayerScope = 'global' | 'surface' | 'scene'

export interface SlideEditorLayerView {
  readonly source: SlideEditorLayerScope
  readonly scopedVisible: boolean
  readonly effectiveVisible: boolean
  readonly selectionId: string
  readonly item: DeepReadonly<LayerItem>
}

export interface SlideEditorPresentationStateView {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly initial: boolean
  readonly thumbnail: boolean
  readonly active: boolean
}

export interface SlideEditorPresentationView {
  readonly activeStateId: string | null
  readonly initialStateId: string
  readonly thumbnailStateId: string | null
  readonly states: readonly SlideEditorPresentationStateView[]
}

export interface SlideEditorView {
  readonly projectId: string
  readonly revision: number
  readonly locationId: string
  readonly surfaceId: string
  readonly surfaceTitle: string
  readonly sceneId: string
  readonly sceneName: string
  readonly canvas: { readonly width: 1280; readonly height: 720 }
  readonly backgroundColor: string
  readonly backgroundAssetId: string | null | undefined
  readonly presentation: SlideEditorPresentationView | null
  readonly layers: readonly SlideEditorLayerView[]
}

function deepMergeComponentProps(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = structuredClone(base)
  for (const [key, value] of Object.entries(patch)) {
    const previous = result[key]
    result[key] = value !== null && previous !== null &&
      typeof value === 'object' && typeof previous === 'object' &&
      !Array.isArray(value) && !Array.isArray(previous)
      ? deepMergeComponentProps(
          previous as Record<string, unknown>,
          value as Record<string, unknown>,
        )
      : structuredClone(value)
  }
  return result
}

export interface BuildSlideEditorViewInput {
  readonly project: CourseProjectDocument
  readonly locationId: string
  /** `undefined` follows the location; `null` deliberately shows the base scene. */
  readonly stateId?: string | null
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as DeepReadonly<T>
  }
  if (!ArrayBuffer.isView(value)) {
    Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry))
    Object.freeze(value)
  }
  return value as DeepReadonly<T>
}

function materializeSceneItem(
  source: LayerItem,
  state: SlidePresentationState | undefined,
): LayerItem {
  const item = structuredClone(source)
  const override = state?.layerItemOverrides[source.layerItemId]
  if (!override) return item
  if (override.label !== undefined) item.label = override.label
  if (override.frame) item.frame = { ...item.frame, ...override.frame }
  if (override.order !== undefined) item.order = override.order
  if (override.visible !== undefined) item.visible = override.visible
  if (override.locked !== undefined) item.locked = override.locked
  if (override.rotation !== undefined) item.rotation = override.rotation
  if (override.opacity !== undefined) item.opacity = override.opacity
  if (override.hitPolicy !== undefined) item.hitPolicy = override.hitPolicy
  if (override.playbackInitialVisibility !== undefined) {
    item.playbackInitialVisibility = override.playbackInitialVisibility
  }
  if (item.kind === 'native' && override.nativeData) {
    item.content.data = mergeCourseNativeData(
      item.content.data as Record<string, unknown>,
      override.nativeData,
    ) as typeof item.content.data
  }
  if (item.kind === 'component' && override.componentProps) {
    item.props = deepMergeComponentProps(item.props, override.componentProps)
  }
  return item
}

function materializeSceneItems(
  items: readonly LayerItem[],
  state: SlidePresentationState | undefined,
): LayerItem[] {
  const materialized = items.map((item) => materializeSceneItem(item, state))
  if (!state?.layerItemOrder) return materialized

  const byId = new Map(materialized.map((item) => [item.layerItemId, item]))
  const seen = new Set<string>()
  const ordered: LayerItem[] = []
  for (const id of state.layerItemOrder) {
    const item = byId.get(id)
    if (!item || seen.has(id)) continue
    seen.add(id)
    ordered.push(item)
  }
  ordered.push(...materialized
    .filter((item) => !seen.has(item.layerItemId))
    .sort((left, right) => left.order - right.order ||
      compareStableStrings(left.layerItemId, right.layerItemId)))

  const orderSlots = materialized.map((item) => item.order).sort((left, right) => left - right)
  ordered.forEach((item, index) => { item.order = orderSlots[index]! })
  return materialized
}

function resolveSlide(
  project: CourseProjectDocument,
  locationId: string,
): {
    location: Extract<CourseProjectDocument['locations'][number], { kind: 'slide-scene' }>
    surface: SlideSurfaceDocument
    scene: SlideSurfaceDocument['scenes'][number]
  } {
  const location = project.locations.find((candidate) => candidate.id === locationId)
  if (!location) throw new Error(`找不到课程位置：${locationId}`)
  if (location.kind !== 'slide-scene') {
    throw new Error(`SlideEditorView 只接受 Slide 场景位置：${locationId}`)
  }
  const surface = project.surfaces.find((candidate) => candidate.id === location.surfaceId)
  if (!surface || surface.type !== 'slide') {
    throw new Error(`找不到 Slide 表面：${location.surfaceId}`)
  }
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  if (!scene) throw new Error(`找不到 Slide 场景：${location.sceneId}`)
  return { location, surface, scene }
}

function layerView(
  item: LayerItem,
  source: SlideEditorLayerScope,
  scopedVisible: boolean,
): SlideEditorLayerView {
  const readonlyItem = deepFreeze(item)
  return {
    source,
    scopedVisible,
    effectiveVisible: scopedVisible && readonlyItem.visible,
    selectionId: readonlyItem.layerItemId,
    item: readonlyItem,
  }
}

export function buildSlideEditorView(input: BuildSlideEditorViewInput): SlideEditorView {
  const { project, locationId } = input
  const { location, surface, scene } = resolveSlide(project, locationId)
  const stateId = input.stateId === undefined ? (location.stateId ?? null) : input.stateId
  const state = stateId === null
    ? undefined
    : scene.presentation?.states.find((candidate) => candidate.id === stateId)
  if (stateId !== null && !state) throw new Error(`找不到 Slide 状态：${stateId}`)

  const layers = [
    ...project.globalLayerItems.map((entry) => layerView(
      structuredClone(entry.item),
      'global',
      isCourseLayerVisibleAtLocation(entry, locationId),
    )),
    ...surface.surfaceLayerItems.map((entry) => layerView(
      structuredClone(entry.item),
      'surface',
      isCourseLayerVisibleAtLocation(entry, locationId),
    )),
    ...materializeSceneItems(scene.layerItems, state).map((item) => layerView(item, 'scene', true)),
  ].sort((left, right) => left.item.order - right.item.order ||
    compareStableStrings(left.selectionId, right.selectionId))

  const presentation = scene.presentation
    ? {
        activeStateId: stateId,
        initialStateId: scene.presentation.initialStateId,
        thumbnailStateId: scene.presentation.thumbnailStateId ?? null,
        states: scene.presentation.states.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          ...(candidate.description === undefined ? {} : { description: candidate.description }),
          initial: candidate.id === scene.presentation!.initialStateId,
          thumbnail: candidate.id === scene.presentation!.thumbnailStateId,
          active: candidate.id === stateId,
        })),
      }
    : null

  return deepFreeze({
    projectId: project.id,
    revision: project.revision,
    locationId,
    surfaceId: surface.id,
    surfaceTitle: surface.title,
    sceneId: scene.id,
    sceneName: scene.name,
    canvas: { ...surface.canvas },
    backgroundColor: state?.backgroundColor ?? scene.backgroundColor,
    backgroundAssetId: state?.backgroundAssetId === undefined
      ? scene.backgroundAssetId
      : state.backgroundAssetId,
    presentation,
    layers,
  })
}
