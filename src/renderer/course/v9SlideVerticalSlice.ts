import type { ComponentPackageData } from '../../shared/componentTypes'
import { nanoid } from 'nanoid'
import type {
  LayerItem,
  LayerItemOverride,
  NativeLayerItem,
} from '../../shared/courseProjectTypes'
import type {
  DeepPartial,
  SceneDocument,
  SceneNode,
  ShapeType,
} from '../../shared/projectTypes'
import {
  materializeNativeLayerItem,
  mergeCourseNativeData,
} from '../../shared/courseProjectSchema'
import { sceneNodeSchema } from '../../shared/projectSchema'
import { sceneNodeToCourseLayerItem } from '../../shared/courseProjectModel'
import {
  isNodeMotionAction,
  isVideoInteractionAction,
  type InteractionRule,
} from '../../shared/interactionTypes'
import {
  addNativeVisualLayer,
  addSlideTextLayer,
  addSlidePresentationState,
  addSlideScene,
  clearSlidePresentationStateOverrides,
  commitCourseHistory,
  createCourseHistory,
  createCourseProject,
  deleteSlideScene,
  deleteSlidePresentationState,
  duplicateSlidePresentationState,
  duplicateSlideScene,
  redoCourseHistory,
  renameSlidePresentationState,
  renameSlideScene,
  reorderSlideScenes,
  reserveTopAuthoringOrder,
  setInitialSlidePresentationState,
  setThumbnailSlidePresentationState,
  type CourseHistoryState,
  undoCourseHistory,
  updateCourseProject,
} from './courseStudioModel'
import { componentPackagesFromArchive } from '../components/componentPackageStore'
import type { CourseProjectArchiveData } from '../project/courseProjectArchive'
import { createTextNode } from '../project/createProject'
import {
  selectSlideEditorLayers,
  transformSelectedSlideNativeLayers,
  type SlideEditorSelection,
  type SlideEditorTransformInput,
} from './slideEditorCommands'
import {
  buildSlideEditorView,
  type DeepReadonly,
  type SlideEditorLayerView,
  type SlideEditorLayerScope,
} from './slideEditorView'

export const V9_EDITOR_BACKEND = 'v9' as const
export const V9_SLIDE_TEST_BACKEND = 'v9-slide-test' as const
export const V9_SLIDE_TEST_QUERY = '?editor-backend=v9-slide-test' as const
export const V9_SLIDE_TEST_TEXT_ID = 'v9-test-text' as const

const FIXTURE_NOW = '2026-08-15T02:00:00.000Z'

export type EditorStartupBackend =
  | typeof V9_EDITOR_BACKEND
  | typeof V9_SLIDE_TEST_BACKEND

export interface V9SlideVerticalSliceState {
  readonly sessionId: string
  readonly history: CourseHistoryState
  readonly selection: SlideEditorSelection
  readonly editingScope: V9SlideEditingScope
  readonly savedSnapshot: CourseProjectArchiveData | null
  readonly projectPath: string | null
  readonly assetFiles: Record<string, Uint8Array>
  readonly componentFiles: Record<string, Record<string, Uint8Array>>
  readonly componentPackages: Record<string, ComponentPackageData>
}

export type V9SlideEditingScope = SlideEditorLayerScope

export interface V9SlideSelectionInput {
  readonly nodeIds: readonly string[]
  readonly additive: boolean
}

export type V9SlideTransformInput = SlideEditorTransformInput

export interface V9SlideLayerPatch {
  readonly label?: string
  readonly visible?: boolean
  readonly locked?: boolean
}

export type V9SlideNativeNodePatch = DeepPartial<SceneNode>

export interface V9SlideLayerTarget {
  readonly sessionId: string
  readonly locationId: string
  readonly stateId: string | null
  readonly editingScope: V9SlideEditingScope
  readonly layerItemId: string
}

export type V9SlideNativeNodeTarget = V9SlideLayerTarget

export interface V9SlideLayerOrderTarget {
  readonly sessionId: string
  readonly locationId: string
  readonly stateId: string | null
  readonly editingScope: V9SlideEditingScope
  readonly layerItemIds: readonly string[]
}

export function v9SlideLayerContextKey(
  target: Pick<
    V9SlideLayerTarget,
    'sessionId' | 'locationId' | 'stateId' | 'editingScope'
  >,
): string {
  return JSON.stringify([
    target.sessionId,
    target.locationId,
    target.stateId,
    target.editingScope,
  ])
}

export interface V9SlideWorkspaceSnapshot {
  /** Scope-local authoring proxy consumed by the existing Phaser overlay. */
  readonly document: SceneDocument
  /** Read-only, unified Native composition consumed only by the Player carrier. */
  readonly previewDocument: SceneDocument
  readonly componentPackages: Record<string, ComponentPackageData>
  readonly selectedNodeIds: readonly string[]
}

/** Production is the default; one exact query keeps the isolated regression fixture. */
export function resolveEditorStartupBackend(search: string): EditorStartupBackend {
  return search === V9_SLIDE_TEST_QUERY
    ? V9_SLIDE_TEST_BACKEND
    : V9_EDITOR_BACKEND
}

function createFixtureProject() {
  const initial = createCourseProject({
    id: 'v9-slide-vertical-slice',
    title: 'V9 Slide 纵切测试',
    now: FIXTURE_NOW,
  })
  return updateCourseProject(initial, (draft) => {
    const location = draft.locations.find((candidate) => candidate.id === draft.startLocationId)
    if (!location || location.kind !== 'slide-scene') {
      throw new Error('测试课件缺少初始场景位置')
    }
    const surface = draft.surfaces.find((candidate) => candidate.id === location.surfaceId)
    if (!surface || surface.type !== 'slide') {
      throw new Error('测试课件缺少初始幻灯片')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
    if (!scene) throw new Error('测试课件缺少初始场景')
    scene.layerItems.push({
      layerItemId: V9_SLIDE_TEST_TEXT_ID,
      label: 'V9 可移动文字',
      frame: {
        mode: 'absolute',
        x: 440,
        y: 320,
        width: 400,
        height: 80,
      },
      order: 2,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      kind: 'native',
      content: {
        nativeType: 'text',
        data: {
          text: 'V9 可移动文字',
          runs: [],
          style: {
            fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
            fontSize: 42,
            color: '#1f2937',
            bold: false,
            italic: false,
            underline: false,
            strike: false,
            emphasis: false,
            highlightColor: null,
            align: 'left',
            verticalAlign: 'top',
            writingMode: 'horizontal',
            lineSpacing: 6,
            letterSpacing: 0,
            padding: 0,
            overflow: 'auto-height',
            backgroundColor: '#ffffff',
            backgroundOpacity: 0,
            cornerRadius: 0,
          },
        },
      },
    })
  }, FIXTURE_NOW)
}

function freezeState(
  sessionId: string,
  history: CourseHistoryState,
  selection: SlideEditorSelection,
  editingScope: V9SlideEditingScope,
  savedSnapshot: CourseProjectArchiveData | null,
  projectPath: string | null,
  assetFiles: Record<string, Uint8Array>,
  componentFiles: Record<string, Record<string, Uint8Array>>,
  componentPackages: Record<string, ComponentPackageData>,
): V9SlideVerticalSliceState {
  return Object.freeze({
    sessionId,
    history,
    selection,
    editingScope,
    savedSnapshot,
    projectPath,
    assetFiles,
    componentFiles,
    componentPackages,
  })
}

export function createV9SlideVerticalSliceState(): V9SlideVerticalSliceState {
  const project = createFixtureProject()
  return openV9SlideVerticalSliceState({
    project,
    assetFiles: {},
    componentFiles: {},
  }, null)
}

export function createV9CourseEditorState(): V9SlideVerticalSliceState {
  const project = createCourseProject({ title: '未命名课件' })
  return openV9SlideVerticalSliceState({
    project,
    assetFiles: {},
    componentFiles: {},
  }, null)
}

function selectCourseEditorLocation(
  project: V9SlideVerticalSliceState['history']['present'],
  locationId: string,
  stateId: string | null,
  selectionIds: readonly string[],
): SlideEditorSelection {
  const location = project.locations.find((candidate) => candidate.id === locationId)
  if (!location) throw new Error('当前课程位置已失效')
  if (location.kind === 'slide-scene') {
    return selectSlideEditorLayers({ project, locationId, stateId, selectionIds })
  }
  if (selectionIds.length > 0) {
    throw new Error('当前内容类型暂不支持画布选择')
  }
  return Object.freeze({
    locationId,
    stateId: null,
    selectionIds: Object.freeze([]),
  })
}

export function openV9SlideVerticalSliceState(
  archive: CourseProjectArchiveData,
  projectPath: string | null,
  options: { markDirty?: boolean } = {},
): V9SlideVerticalSliceState {
  const { project, assetFiles, componentFiles } = archive
  const history = createCourseHistory(project)
  const selection = selectCourseEditorLocation(
    project,
    project.startLocationId,
    null,
    [],
  )
  const componentPackages = componentPackagesFromArchive(project, componentFiles)
  return freezeState(
    crypto.randomUUID(),
    history,
    selection,
    'scene',
    options.markDirty ? null : archive,
    projectPath,
    assetFiles,
    componentFiles,
    componentPackages,
  )
}

export function isV9SlideVerticalSliceDirty(
  state: V9SlideVerticalSliceState,
): boolean {
  return state.savedSnapshot === null ||
    state.history.present !== state.savedSnapshot.project ||
    state.assetFiles !== state.savedSnapshot.assetFiles ||
    state.componentFiles !== state.savedSnapshot.componentFiles
}

export function captureV9SlideVerticalSliceArchive(
  state: V9SlideVerticalSliceState,
): CourseProjectArchiveData {
  return {
    project: state.history.present,
    assetFiles: state.assetFiles,
    componentFiles: state.componentFiles,
  }
}

export function completeV9SlideVerticalSliceSave(
  state: V9SlideVerticalSliceState,
  savedSnapshot: CourseProjectArchiveData,
  projectPath: string,
  expectedSessionId: string = state.sessionId,
): V9SlideVerticalSliceState {
  if (state.sessionId !== expectedSessionId) {
    throw new Error('保存结果不属于当前课件会话')
  }
  if (state.history.present.id !== savedSnapshot.project.id) {
    throw new Error('保存结果不属于当前课件工程')
  }
  if (state.savedSnapshot === savedSnapshot && state.projectPath === projectPath) return state
  return freezeState(
    state.sessionId,
    state.history,
    state.selection,
    state.editingScope,
    savedSnapshot,
    projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

export function renameV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
  title: string,
  now?: string,
): V9SlideVerticalSliceState {
  const normalized = title.trim().slice(0, 80)
  if (!normalized || normalized === state.history.present.title) return state
  const project = updateCourseProject(state.history.present, (draft) => {
    draft.title = normalized
  }, now)
  return freezeState(
    state.sessionId,
    commitCourseHistory(state.history, project),
    state.selection,
    state.editingScope,
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

type ReadonlyNativeLayer = Omit<SlideEditorLayerView, 'item'> & {
  readonly item: DeepReadonly<NativeLayerItem>
}

function nativeNodeFromLayer(
  layer: ReadonlyNativeLayer,
  visibility: 'base' | 'effective' = 'effective',
): SceneNode {
  const node = materializeNativeLayerItem(
    structuredClone(layer.item) as NativeLayerItem,
  )
  // Scoped visibility belongs to the V9 view. The compatibility carrier has
  // no V9 visibility model, so project it into the transient node only.
  const visible = visibility === 'base' ? layer.item.visible : layer.effectiveVisible
  return node.visible === visible
    ? node
    : { ...node, visible }
}

function authoringLayerVisible(
  state: V9SlideVerticalSliceState,
  layer: ReadonlyNativeLayer,
): boolean {
  return state.editingScope === 'scene'
    ? layer.effectiveVisible
    : layer.item.visible
}

function activeSlideView(state: V9SlideVerticalSliceState) {
  return buildSlideEditorView({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
  })
}

function selectableNativeLayers(
  state: V9SlideVerticalSliceState,
): Map<string, ReadonlyNativeLayer> {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (location?.kind !== 'slide-scene') return new Map()
  const source = state.editingScope
  return new Map(activeSlideView(state).layers.flatMap((layer) => {
    if (
      layer.source !== source ||
      layer.item.kind !== 'native' ||
      (source !== 'global' && layer.item.content.nativeType === 'teacher-controller')
    ) return []
    const nativeLayer = layer as ReadonlyNativeLayer
    return [[layer.selectionId, nativeLayer] as const]
  }))
}

function sameSelection(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export function buildV9SlideWorkspaceSnapshot(
  state: V9SlideVerticalSliceState,
): V9SlideWorkspaceSnapshot {
  const view = buildSlideEditorView({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
  })
  const nativeLayers = view.layers.filter(
    (layer): layer is ReadonlyNativeLayer => layer.item.kind === 'native',
  )
  const nodes = nativeLayers
    .filter((layer) =>
      layer.source === state.editingScope &&
      (
        state.editingScope === 'global' ||
        layer.item.content.nativeType !== 'teacher-controller'
      ),
    )
    .map((layer) => nativeNodeFromLayer(
      layer,
      state.editingScope === 'scene' ? 'effective' : 'base',
    ))
  const previewNodes = nativeLayers.map((layer) => nativeNodeFromLayer(layer))
  const nodeIds = new Set(nodes.map((node) => node.id))
  const selectedNodeIds = state.selection.selectionIds.filter((id) => nodeIds.has(id))
  const sceneDocument = (documentNodes: SceneNode[]): SceneDocument => ({
    id: view.sceneId,
    name: view.sceneName,
    backgroundColor: view.backgroundColor,
    ...(view.backgroundAssetId === undefined
      ? {}
      : { backgroundAssetId: view.backgroundAssetId }),
    nodes: documentNodes,
    interactions: [],
  })
  return {
    document: sceneDocument(nodes),
    previewDocument: sceneDocument(previewNodes),
    componentPackages: state.componentPackages,
    selectedNodeIds,
  }
}

export function selectV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
  input: V9SlideSelectionInput,
): V9SlideVerticalSliceState {
  if (new Set(input.nodeIds).size !== input.nodeIds.length) return state
  const selectable = selectableNativeLayers(state)
  if (input.nodeIds.some((nodeId) => !selectable.has(nodeId))) return state
  let nextSelectionIds: string[]
  if (input.additive) {
    nextSelectionIds = [...state.selection.selectionIds]
    for (const nodeId of input.nodeIds) {
      const index = nextSelectionIds.indexOf(nodeId)
      if (index >= 0) nextSelectionIds.splice(index, 1)
      else nextSelectionIds.push(nodeId)
    }
  } else {
    nextSelectionIds = [...input.nodeIds]
  }
  if (sameSelection(nextSelectionIds, state.selection.selectionIds)) return state
  return freezeState(state.sessionId, state.history, selectSlideEditorLayers({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
    selectionIds: nextSelectionIds,
  }), state.editingScope, state.savedSnapshot, state.projectPath, state.assetFiles, state.componentFiles, state.componentPackages)
}

export function transformV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
  input: V9SlideTransformInput,
  now?: string,
): V9SlideVerticalSliceState {
  if (input.nodes.length === 0 || new Set(input.nodes.map((node) => node.nodeId)).size !== input.nodes.length) {
    return state
  }
  const selectable = selectableNativeLayers(state)
  const selectedIds = new Set(state.selection.selectionIds)
  const valid = input.nodes.every((node) => {
    const layer = selectable.get(node.nodeId)
    return Boolean(
      layer &&
      authoringLayerVisible(state, layer) &&
      !layer.item.locked &&
      selectedIds.has(node.nodeId) &&
      Number.isFinite(node.x) &&
      Number.isFinite(node.y) &&
      Number.isFinite(node.width) && node.width > 0 &&
      Number.isFinite(node.height) && node.height > 0 &&
      Number.isFinite(node.rotation) &&
      node.rotation >= -36_000 && node.rotation <= 36_000,
    )
  })
  if (!valid) return state
  const changed = input.nodes.some((node) => {
    const item = selectable.get(node.nodeId)!.item
    return item.frame.x !== node.x ||
      item.frame.y !== node.y ||
      item.frame.width !== node.width ||
      item.frame.height !== node.height ||
      item.rotation !== node.rotation
  })
  if (!changed) return state
  const scopedSurfaceId = state.editingScope === 'surface'
    ? activeSlideSurface(state).id
    : null
  const history = state.editingScope === 'scene'
    ? transformSelectedSlideNativeLayers(state.history, state.selection, input, now)
    : commitCourseHistory(state.history, updateCourseProject(
        state.history.present,
        (draft) => {
          const entries = state.editingScope === 'global'
            ? draft.globalLayerItems
            : draft.surfaces.find((candidate) => candidate.id === scopedSurfaceId)
              ?.surfaceLayerItems
          if (!entries) throw new Error('当前内容共用层已失效')
          const byId = new Map(
            entries.map((entry) => [entry.item.layerItemId, entry.item]),
          )
          for (const transform of input.nodes) {
            const item = byId.get(transform.nodeId)
            if (!item || item.kind !== 'native') {
              throw new Error(
                state.editingScope === 'global'
                  ? '所选全局元素已失效，请重新选择'
                  : '所选共用元素已失效，请重新选择',
              )
            }
            item.frame.x = transform.x
            item.frame.y = transform.y
            item.frame.width = transform.width
            item.frame.height = transform.height
            item.rotation = transform.rotation
          }
        },
        now,
      ))
  if (history === state.history) return state
  return freezeState(
    state.sessionId,
    history,
    state.selection,
    state.editingScope,
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

export function nudgeV9SlideSelection(
  state: V9SlideVerticalSliceState,
  dx: number,
  dy: number,
  now?: string,
): V9SlideVerticalSliceState {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return state
  const selectable = selectableNativeLayers(state)
  const nodes = state.selection.selectionIds.flatMap((nodeId) => {
    const layer = selectable.get(nodeId)
    if (!layer || !authoringLayerVisible(state, layer) || layer.item.locked) return []
    return [{
      nodeId,
      x: layer.item.frame.x + dx,
      y: layer.item.frame.y + dy,
      width: layer.item.frame.width,
      height: layer.item.frame.height,
      rotation: layer.item.rotation,
    }]
  })
  return nodes.length === 0 ? state : transformV9SlideVerticalSlice(state, { nodes }, now)
}

function selectionAfterLayerCommand(
  state: V9SlideVerticalSliceState,
  project: V9SlideVerticalSliceState['history']['present'],
  selectionIds: readonly string[],
): SlideEditorSelection {
  return selectSlideEditorLayers({
    project,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
    selectionIds,
  })
}

function activeScopedNativeLayer(
  state: V9SlideVerticalSliceState,
  layerItemId: string,
): ReadonlyNativeLayer {
  const layer = activeSlideView(state).layers.find(
    (candidate) =>
      candidate.selectionId === layerItemId &&
      candidate.source === state.editingScope,
  )
  if (
    !layer ||
    layer.item.kind !== 'native' ||
    (
      state.editingScope !== 'global' &&
      layer.item.content.nativeType === 'teacher-controller'
    )
  ) {
    throw new Error(
      state.editingScope === 'global'
        ? '找不到全局层中的元素'
        : state.editingScope === 'surface'
          ? '找不到当前内容共用层中的元素'
          : '找不到当前场景中的元素',
    )
  }
  return layer as ReadonlyNativeLayer
}

function activeSceneNativeLayer(
  state: V9SlideVerticalSliceState,
  layerItemId: string,
): ReadonlyNativeLayer {
  if (state.editingScope !== 'scene') throw new Error('请先切换到场景层')
  return activeScopedNativeLayer(state, layerItemId)
}

function deleteEmptyOverride(
  overrides: Record<string, LayerItemOverride>,
  layerItemId: string,
): void {
  if (Object.keys(overrides[layerItemId] ?? {}).length === 0) {
    delete overrides[layerItemId]
  }
}

function removeNodeReferencesFromInteractions(
  interactions: InteractionRule[],
  nodeId: string,
): InteractionRule[] {
  const removedActionIds = new Set<string>()
  let remaining = interactions.flatMap((rule) => {
    if ('nodeId' in rule.trigger && rule.trigger.nodeId === nodeId) {
      rule.actions.forEach((step) => removedActionIds.add(step.id))
      return []
    }
    rule.actions = rule.actions.filter((step) => {
      const action = step.action
      const remove = (isVideoInteractionAction(action) || isNodeMotionAction(action)) &&
        action.nodeId === nodeId
      if (remove) removedActionIds.add(step.id)
      return !remove
    })
    if (rule.actions.length === 0) return []
    rule.actions[0]!.start = 'after-previous'
    return [rule]
  })
  let removedDependent = true
  while (removedDependent) {
    removedDependent = false
    remaining = remaining.flatMap((rule) => {
      if (
        rule.trigger.type !== 'animation.completed' ||
        !removedActionIds.has(rule.trigger.actionId)
      ) return [rule]
      rule.actions.forEach((step) => removedActionIds.add(step.id))
      removedDependent = true
      return []
    })
  }
  return remaining
}

function duplicateNodeInteractionGraph(
  interactions: InteractionRule[],
  sourceNodeId: string,
  duplicateNodeId: string,
): InteractionRule[] {
  const selected: InteractionRule[] = interactions.filter(
    (rule) => 'nodeId' in rule.trigger && rule.trigger.nodeId === sourceNodeId,
  )
  const selectedIds = new Set(selected.map((rule) => rule.id))
  const actionIds = new Set(selected.flatMap((rule) => rule.actions.map((step) => step.id)))
  let changed = true
  while (changed) {
    changed = false
    for (const rule of interactions) {
      if (
        selectedIds.has(rule.id) ||
        rule.trigger.type !== 'animation.completed' ||
        !actionIds.has(rule.trigger.actionId)
      ) continue
      selected.push(rule)
      selectedIds.add(rule.id)
      rule.actions.forEach((step) => actionIds.add(step.id))
      changed = true
    }
  }
  const actionIdMap = new Map(
    selected.flatMap((rule) => rule.actions).map((step) => [
      step.id,
      `action-${nanoid(10)}`,
    ]),
  )
  return selected.map((source) => {
    const rule = structuredClone(source)
    rule.id = `rule-${nanoid(10)}`
    if ('nodeId' in rule.trigger && rule.trigger.nodeId === sourceNodeId) {
      rule.trigger.nodeId = duplicateNodeId
    } else if (rule.trigger.type === 'animation.completed') {
      rule.trigger.actionId = actionIdMap.get(rule.trigger.actionId) ?? rule.trigger.actionId
    }
    rule.actions.forEach((step) => {
      step.id = actionIdMap.get(step.id) ?? `action-${nanoid(10)}`
      const action = step.action
      if (
        (isVideoInteractionAction(action) || isNodeMotionAction(action)) &&
        action.nodeId === sourceNodeId
      ) action.nodeId = duplicateNodeId
    })
    return rule
  })
}

function removeSurfaceLayerReferencesFromProject(
  project: V9SlideVerticalSliceState['history']['present'],
  surfaceId: string,
  layerItemId: string,
): void {
  const currentSurface = project.surfaces.find(
    (surface) => surface.id === surfaceId,
  )
  if (!currentSurface) throw new Error('当前内容共用层已失效')
  if (currentSurface.type === 'slide') {
    currentSurface.scenes.forEach((scene) => {
      scene.interactions = removeNodeReferencesFromInteractions(
        scene.interactions,
        layerItemId,
      )
    })
  }

  const remainingItems: LayerItem[] = project.globalLayerItems.map(
    (entry) => entry.item,
  )
  project.surfaces.forEach((surface) => {
    remainingItems.push(...surface.surfaceLayerItems.map((entry) => entry.item))
    if (surface.type === 'slide') {
      surface.scenes.forEach((scene) => {
        remainingItems.push(...scene.layerItems)
      })
    } else if (surface.type === 'spatial-2d') {
      remainingItems.push(...surface.world.layerItems)
    }
  })
  const layerIdStillExists = remainingItems.some(
    (item) => item.layerItemId === layerItemId,
  )
  if (!layerIdStillExists) {
    project.globalInteractions = removeNodeReferencesFromInteractions(
      project.globalInteractions,
      layerItemId,
    )
    project.surfaces.forEach((surface) => {
      if (surface.id === surfaceId || surface.type !== 'slide') return
      surface.scenes.forEach((scene) => {
        scene.interactions = removeNodeReferencesFromInteractions(
          scene.interactions,
          layerItemId,
        )
      })
    })
  }

  const localRuntimeItems = [
    ...currentSurface.surfaceLayerItems.map((entry) => entry.item),
    ...(currentSurface.type === 'slide'
      ? currentSurface.scenes.flatMap((scene) => scene.layerItems)
      : currentSurface.type === 'spatial-2d'
        ? currentSurface.world.layerItems
        : []),
  ]
  const runtimeItems = layerIdStillExists ? localRuntimeItems : remainingItems
  runtimeItems.forEach((item) => {
    if (item.kind !== 'runtime') return
    const bindings = item.runtime.nodeBindings
    if (!bindings) return
    for (const [binding, targetId] of Object.entries(bindings)) {
      if (targetId === layerItemId) delete bindings[binding]
    }
  })
}

function addV9SlideNativeLayer(
  state: V9SlideVerticalSliceState,
  input: {
    readonly nativeType: 'text' | 'formula' | 'shape'
    readonly shapeType?: ShapeType
    readonly x?: number
    readonly y?: number
  },
  now?: string,
): V9SlideVerticalSliceState {
  if (state.editingScope !== 'scene') throw new Error('请先切换到场景层')
  const { surface, scene } = activeSlideSceneContext(state)
  const id = `${input.nativeType}-${nanoid(10)}`
  const project = input.nativeType === 'text'
    ? (() => {
        const node = createTextNode({
          id,
          name: '文本',
          text: '双击编辑文字',
          x: input.x,
          y: input.y,
        })
        return addSlideTextLayer(
          state.history.present,
          surface.id,
          scene.id,
          node.text,
          {
            id,
            x: node.x,
            y: node.y,
            label: node.name,
            stateId: state.selection.stateId,
            now,
          },
        )
      })()
    : addNativeVisualLayer(state.history.present, {
        surfaceId: surface.id,
        sceneId: scene.id,
        nativeType: input.nativeType,
        shapeType: input.shapeType,
        stateId: state.selection.stateId,
        id,
        x: input.x,
        y: input.y,
        now,
      })
  return commitV9SlideDocument(
    state,
    project,
    selectionAfterLayerCommand(state, project, [id]),
    'scene',
  )
}

export function addV9SlideTextLayer(
  state: V9SlideVerticalSliceState,
  x?: number,
  y?: number,
  now?: string,
): V9SlideVerticalSliceState {
  return addV9SlideNativeLayer(state, { nativeType: 'text', x, y }, now)
}

export function addV9SlideFormulaLayer(
  state: V9SlideVerticalSliceState,
  x?: number,
  y?: number,
  now?: string,
): V9SlideVerticalSliceState {
  return addV9SlideNativeLayer(state, { nativeType: 'formula', x, y }, now)
}

export function addV9SlideShapeLayer(
  state: V9SlideVerticalSliceState,
  shapeType: ShapeType,
  x?: number,
  y?: number,
  now?: string,
): V9SlideVerticalSliceState {
  return addV9SlideNativeLayer(state, { nativeType: 'shape', shapeType, x, y }, now)
}

export function updateV9SlideLayer(
  state: V9SlideVerticalSliceState,
  layerItemId: string,
  patch: V9SlideLayerPatch,
  now?: string,
): V9SlideVerticalSliceState {
  const normalizedLabel = patch.label?.trim().slice(0, 200)
  return updateV9SlideNativeNode(state, layerItemId, {
    ...(normalizedLabel ? { name: normalizedLabel } : {}),
    ...(patch.visible === undefined ? {} : { visible: patch.visible }),
    ...(patch.locked === undefined ? {} : { locked: patch.locked }),
  }, now)
}

function courseValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => courseValuesEqual(value, right[index]))
  }
  if (
    left === null || right === null ||
    typeof left !== 'object' || typeof right !== 'object'
  ) return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(rightRecord, key) &&
    courseValuesEqual(leftRecord[key], rightRecord[key])
  ))
}

function sparseCourseRecordDiff(
  base: Record<string, unknown>,
  next: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(next)) {
    const baseValue = base[key]
    if (courseValuesEqual(baseValue, value)) continue
    if (
      !(depth === 0 && key === 'ast') &&
      value !== null && baseValue !== null &&
      typeof value === 'object' && typeof baseValue === 'object' &&
      !Array.isArray(value) && !Array.isArray(baseValue)
    ) {
      const nested = sparseCourseRecordDiff(
        baseValue as Record<string, unknown>,
        value as Record<string, unknown>,
        depth + 1,
      )
      if (Object.keys(nested).length > 0) result[key] = nested
      continue
    }
    result[key] = structuredClone(value)
  }
  return result
}

function patchedNativeNode(
  current: SceneNode,
  patch: V9SlideNativeNodePatch,
): SceneNode {
  if (patch.id !== undefined && patch.id !== current.id) {
    throw new Error('元素标识不能通过属性面板修改')
  }
  if (patch.type !== undefined && patch.type !== current.type) {
    throw new Error('元素类型不能通过属性面板修改')
  }
  const commonKeys = new Set([
    'name',
    'x',
    'y',
    'width',
    'height',
    'rotation',
    'opacity',
    'visible',
    'locked',
    'playbackInitialVisibility',
  ])
  const typeKeys = current.type === 'text'
    ? new Set(['text', 'runs', 'style'])
    : current.type === 'formula'
      ? new Set(['ast', 'accessibleText', 'style'])
      : current.type === 'shape'
        ? new Set(['shapeType', 'style'])
        : new Set<string>()
  const unsupportedKey = Object.keys(patch).find(
    (key) => key !== 'id' && key !== 'type' && !commonKeys.has(key) && !typeKeys.has(key),
  )
  if (unsupportedKey) throw new Error('当前元素暂不支持修改这项属性')
  if (
    current.type === 'text' &&
    Object.prototype.hasOwnProperty.call(patch, 'text') &&
    !Object.prototype.hasOwnProperty.call(patch, 'runs')
  ) {
    throw new Error('修改文字内容时必须同时保留局部格式')
  }
  if (
    current.type === 'formula' &&
    Object.prototype.hasOwnProperty.call(patch, 'ast') &&
    !Object.prototype.hasOwnProperty.call(patch, 'accessibleText')
  ) {
    throw new Error('修改公式时必须同时更新无障碍描述')
  }
  let normalizedPatch = patch as Record<string, unknown>
  if (typeof patch.name === 'string') {
    const name = patch.name.trim()
    if (!name) throw new Error('元素名称不能为空')
    if (name.length > 200) throw new Error('元素名称最多 200 个字符')
    normalizedPatch = { ...normalizedPatch, name }
  }
  const candidate = mergeCourseNativeData(
    current as unknown as Record<string, unknown>,
    normalizedPatch,
  )
  const parsed = sceneNodeSchema.safeParse(candidate)
  if (
    !parsed.success ||
    parsed.data.type === 'teacher-controller' ||
    parsed.data.type === 'external-component' ||
    !courseValuesEqual(candidate, parsed.data)
  ) {
    throw new Error('属性值无效，请检查输入')
  }
  return parsed.data
}

function replaceNativeItemFromNode(
  item: NativeLayerItem,
  node: SceneNode,
): void {
  const converted = sceneNodeToCourseLayerItem(node, item.order)
  if (converted.kind !== 'native') throw new Error('当前元素暂不支持属性编辑')
  const hitPolicy = item.hitPolicy
  Object.assign(item, converted)
  item.hitPolicy = hitPolicy
}

function synchronizeNativeNodeOverride(
  override: LayerItemOverride,
  baseItem: NativeLayerItem,
  nextNode: SceneNode,
): void {
  const baseNode = materializeNativeLayerItem(baseItem)
  const stableFields = [
    ['label', 'name'],
    ['visible', 'visible'],
    ['locked', 'locked'],
    ['rotation', 'rotation'],
    ['opacity', 'opacity'],
    ['playbackInitialVisibility', 'playbackInitialVisibility'],
  ] as const
  for (const [overrideKey, nodeKey] of stableFields) {
    if (courseValuesEqual(baseNode[nodeKey], nextNode[nodeKey])) {
      delete override[overrideKey]
    } else {
      override[overrideKey] = nextNode[nodeKey] as never
    }
  }

  const frame = { ...(override.frame ?? {}) }
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    if (courseValuesEqual(baseNode[key], nextNode[key])) delete frame[key]
    else frame[key] = nextNode[key]
  }
  if (Object.keys(frame).length === 0) delete override.frame
  else override.frame = frame

  const nextItem = sceneNodeToCourseLayerItem(nextNode, baseItem.order)
  if (nextItem.kind !== 'native') throw new Error('当前元素暂不支持属性编辑')
  const nativeData = sparseCourseRecordDiff(
    baseItem.content.data as Record<string, unknown>,
    nextItem.content.data as Record<string, unknown>,
  )
  if (Object.keys(nativeData).length === 0) delete override.nativeData
  else override.nativeData = nativeData
}

export function updateV9SlideNativeNode(
  state: V9SlideVerticalSliceState,
  layerItemId: string,
  patch: V9SlideNativeNodePatch,
  now?: string,
): V9SlideVerticalSliceState {
  const layer = activeScopedNativeLayer(state, layerItemId)
  const currentNode = materializeNativeLayerItem(
    structuredClone(layer.item) as NativeLayerItem,
  )
  const nextNode = patchedNativeNode(currentNode, patch)
  if (courseValuesEqual(currentNode, nextNode)) return state
  const { surface, scene } = activeSlideSceneContext(state)
  const project = updateCourseProject(state.history.present, (draft) => {
    if (state.editingScope !== 'scene') {
      const entries = state.editingScope === 'global'
        ? draft.globalLayerItems
        : draft.surfaces.find((candidate) => candidate.id === surface.id)
          ?.surfaceLayerItems
      const base = entries?.find(
        (entry) => entry.item.layerItemId === layerItemId,
      )?.item
      if (!base || base.kind !== 'native') throw new Error('当前元素已失效')
      replaceNativeItemFromNode(base, nextNode)
      return
    }
    const draftSurface = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!draftSurface || draftSurface.type !== 'slide') throw new Error('当前幻灯片已失效')
    const draftScene = draftSurface.scenes.find((candidate) => candidate.id === scene.id)
    const base = draftScene?.layerItems.find((item) => item.layerItemId === layerItemId)
    if (!draftScene || !base || base.kind !== 'native') throw new Error('当前元素已失效')
    const presentationState = state.selection.stateId === null
      ? undefined
      : draftScene.presentation?.states.find(
          (candidate) => candidate.id === state.selection.stateId,
        )
    if (state.selection.stateId !== null && !presentationState) {
      throw new Error('当前命名状态已失效')
    }
    if (!presentationState) {
      replaceNativeItemFromNode(base, nextNode)
      return
    }
    const override = presentationState.layerItemOverrides[layerItemId] ?? {}
    synchronizeNativeNodeOverride(override, base, nextNode)
    presentationState.layerItemOverrides[layerItemId] = override
    deleteEmptyOverride(presentationState.layerItemOverrides, layerItemId)
  }, now)
  return commitV9SlideDocument(state, project)
}

export function clearV9SlideNativeNodeOverride(
  state: V9SlideVerticalSliceState,
  layerItemId: string,
  now?: string,
): V9SlideVerticalSliceState {
  activeSceneNativeLayer(state, layerItemId)
  if (state.selection.stateId === null) return state
  const { surface, scene } = activeSlideSceneContext(state)
  const currentState = scene.presentation?.states.find(
    (candidate) => candidate.id === state.selection.stateId,
  )
  if (!currentState?.layerItemOverrides[layerItemId]) return state
  const project = updateCourseProject(state.history.present, (draft) => {
    const draftSurface = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!draftSurface || draftSurface.type !== 'slide') throw new Error('当前幻灯片已失效')
    const draftScene = draftSurface.scenes.find((candidate) => candidate.id === scene.id)
    const presentationState = draftScene?.presentation?.states.find(
      (candidate) => candidate.id === state.selection.stateId,
    )
    if (!presentationState) throw new Error('当前命名状态已失效')
    delete presentationState.layerItemOverrides[layerItemId]
  }, now)
  return commitV9SlideDocument(state, project)
}

export function deleteV9SlideLayer(
  state: V9SlideVerticalSliceState,
  layerItemId: string,
  now?: string,
): V9SlideVerticalSliceState {
  if (state.editingScope === 'surface') {
    activeScopedNativeLayer(state, layerItemId)
    const remainingSelection = state.selection.selectionIds.filter(
      (id) => id !== layerItemId,
    )
    const activeSurface = activeSlideSurface(state)
    const surfaceId = activeSurface.id
    const deletingLastSurfaceItem = activeSurface.surfaceLayerItems.length === 1
    const project = updateCourseProject(state.history.present, (draft) => {
      const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
      const index = surface?.surfaceLayerItems.findIndex(
        (entry) => entry.item.layerItemId === layerItemId,
      ) ?? -1
      if (!surface || index < 0) throw new Error('当前共用元素已失效')
      surface.surfaceLayerItems.splice(index, 1)
      removeSurfaceLayerReferencesFromProject(draft, surfaceId, layerItemId)
    }, now)
    return commitV9SlideDocument(
      state,
      project,
      selectionAfterLayerCommand(state, project, remainingSelection),
      deletingLastSurfaceItem ? 'scene' : 'surface',
    )
  }
  const layer = activeSceneNativeLayer(state, layerItemId)
  const remainingSelection = state.selection.selectionIds.filter((id) => id !== layerItemId)
  if (state.selection.stateId !== null && !layer.item.visible) {
    if (remainingSelection.length === state.selection.selectionIds.length) return state
    return freezeState(
      state.sessionId,
      state.history,
      selectionAfterLayerCommand(state, state.history.present, remainingSelection),
      state.editingScope,
      state.savedSnapshot,
      state.projectPath,
      state.assetFiles,
      state.componentFiles,
      state.componentPackages,
    )
  }
  const { surface, scene } = activeSlideSceneContext(state)
  const project = updateCourseProject(state.history.present, (draft) => {
    const draftSurface = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!draftSurface || draftSurface.type !== 'slide') throw new Error('当前幻灯片已失效')
    const draftScene = draftSurface.scenes.find((candidate) => candidate.id === scene.id)
    if (!draftScene) throw new Error('当前场景已失效')
    if (state.selection.stateId !== null) {
      const presentationState = draftScene.presentation?.states.find(
        (candidate) => candidate.id === state.selection.stateId,
      )
      if (!presentationState) throw new Error('当前命名状态已失效')
      const base = draftScene.layerItems.find((item) => item.layerItemId === layerItemId)
      if (!base) throw new Error('当前元素已失效')
      const override = {
        ...presentationState.layerItemOverrides[layerItemId],
      }
      if (base.visible) override.visible = false
      else delete override.visible
      presentationState.layerItemOverrides[layerItemId] = override
      deleteEmptyOverride(presentationState.layerItemOverrides, layerItemId)
      return
    }
    const index = draftScene.layerItems.findIndex((item) => item.layerItemId === layerItemId)
    if (index < 0) throw new Error('当前元素已失效')
    draftScene.layerItems.splice(index, 1)
    draftScene.presentation?.states.forEach((presentationState) => {
      delete presentationState.layerItemOverrides[layerItemId]
      if (presentationState.layerItemOrder) {
        presentationState.layerItemOrder = presentationState.layerItemOrder.filter(
          (id) => id !== layerItemId,
        )
        if (presentationState.layerItemOrder.length === 0) {
          delete presentationState.layerItemOrder
        }
      }
    })
    draftScene.interactions = removeNodeReferencesFromInteractions(
      draftScene.interactions,
      layerItemId,
    )
    const remainingItems: LayerItem[] = draft.globalLayerItems.map((entry) => entry.item)
    draft.surfaces.forEach((candidateSurface) => {
      remainingItems.push(
        ...candidateSurface.surfaceLayerItems.map((entry) => entry.item),
        ...(candidateSurface.type === 'slide'
          ? candidateSurface.scenes.flatMap((candidateScene) => candidateScene.layerItems)
          : candidateSurface.type === 'spatial-2d'
            ? candidateSurface.world.layerItems
            : []),
      )
    })
    const layerIdStillExists = remainingItems.some(
      (item) => item.layerItemId === layerItemId,
    )
    if (!layerIdStillExists) {
      draft.globalInteractions = removeNodeReferencesFromInteractions(
        draft.globalInteractions,
        layerItemId,
      )
      draft.surfaces.forEach((candidateSurface) => {
        if (candidateSurface.type !== 'slide') return
        candidateSurface.scenes.forEach((candidateScene) => {
          if (candidateScene === draftScene) return
          candidateScene.interactions = removeNodeReferencesFromInteractions(
            candidateScene.interactions,
            layerItemId,
          )
        })
      })
    }
    const currentSceneRuntimeItems = draftScene.layerItems.filter(
      (item) => item.kind === 'runtime',
    )
    const runtimeItems = layerIdStillExists ? currentSceneRuntimeItems : remainingItems
    runtimeItems.forEach((item) => {
      if (item.kind !== 'runtime') return
      const bindings = item.runtime.nodeBindings
      if (!bindings) return
      for (const [binding, targetId] of Object.entries(bindings)) {
        if (targetId === layerItemId) delete bindings[binding]
      }
    })
  }, now)
  return commitV9SlideDocument(
    state,
    project,
    selectionAfterLayerCommand(state, project, remainingSelection),
  )
}

export function duplicateV9SlideLayer(
  state: V9SlideVerticalSliceState,
  layerItemId: string,
  now?: string,
): V9SlideVerticalSliceState {
  if (state.editingScope === 'surface') {
    const layer = activeScopedNativeLayer(state, layerItemId)
    const { surface, scene } = activeSlideSceneContext(state)
    const duplicateId = `${layer.item.content.nativeType}-${nanoid(10)}`
    const project = updateCourseProject(state.history.present, (draft) => {
      const draftSurface = draft.surfaces.find((candidate) => candidate.id === surface.id)
      const source = draftSurface?.surfaceLayerItems.find(
        (entry) => entry.item.layerItemId === layerItemId,
      )
      if (
        !draftSurface ||
        draftSurface.type !== 'slide' ||
        !source ||
        source.item.kind !== 'native'
      ) {
        throw new Error('当前共用元素已失效')
      }
      const duplicate = structuredClone(source.item)
      duplicate.layerItemId = duplicateId
      duplicate.label = `${layer.item.label} 副本`.slice(0, 200)
      duplicate.frame.x += 24
      duplicate.frame.y += 24
      duplicate.locked = false
      duplicate.order = reserveTopAuthoringOrder(draft, draftSurface.id, scene.id)
      draftSurface.surfaceLayerItems.push({
        item: duplicate,
        visibility: structuredClone(source.visibility),
      })
      draftSurface.scenes.forEach((draftScene) => {
        draftScene.interactions.push(...duplicateNodeInteractionGraph(
          draftScene.interactions,
          layerItemId,
          duplicateId,
        ))
      })
      draftSurface.surfaceLayerItems.sort((left, right) =>
        left.item.order - right.item.order ||
        left.item.layerItemId.localeCompare(right.item.layerItemId),
      )
    }, now)
    return commitV9SlideDocument(
      state,
      project,
      selectionAfterLayerCommand(state, project, [duplicateId]),
    )
  }
  const layer = activeSceneNativeLayer(state, layerItemId)
  const { surface, scene } = activeSlideSceneContext(state)
  const duplicateId = `${layer.item.content.nativeType}-${nanoid(10)}`
  const project = updateCourseProject(state.history.present, (draft) => {
    const draftSurface = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!draftSurface || draftSurface.type !== 'slide') throw new Error('当前幻灯片已失效')
    const draftScene = draftSurface.scenes.find((candidate) => candidate.id === scene.id)
    const source = draftScene?.layerItems.find((item) => item.layerItemId === layerItemId)
    if (!draftScene || !source || source.kind !== 'native') throw new Error('当前元素已失效')
    const duplicate = structuredClone(
      state.selection.stateId === null ? source : layer.item,
    ) as NativeLayerItem
    duplicate.layerItemId = duplicateId
    duplicate.label = `${layer.item.label} 副本`.slice(0, 200)
    duplicate.frame.x += 24
    duplicate.frame.y += 24
    duplicate.locked = false
    duplicate.order = reserveTopAuthoringOrder(draft, draftSurface.id, draftScene.id)
    if (state.selection.stateId !== null) duplicate.visible = false
    draftScene.layerItems.push(duplicate)
    draftScene.layerItems.sort((left, right) => left.order - right.order)
    if (state.selection.stateId === null) {
      draftScene.presentation?.states.forEach((presentationState) => {
        const sourceOverride = presentationState.layerItemOverrides[layerItemId]
        if (sourceOverride) {
          const duplicateOverride = structuredClone(sourceOverride)
          if (duplicateOverride.frame?.x !== undefined) duplicateOverride.frame.x += 24
          if (duplicateOverride.frame?.y !== undefined) duplicateOverride.frame.y += 24
          if (duplicateOverride.label !== undefined) {
            duplicateOverride.label = `${duplicateOverride.label} 副本`.slice(0, 200)
          }
          delete duplicateOverride.locked
          delete duplicateOverride.order
          if (Object.keys(duplicateOverride.frame ?? {}).length === 0) {
            delete duplicateOverride.frame
          }
          if (Object.keys(duplicateOverride).length > 0) {
            presentationState.layerItemOverrides[duplicateId] = duplicateOverride
          }
        }
        if (presentationState.layerItemOrder?.includes(layerItemId)) {
          const order = [...presentationState.layerItemOrder]
          order.splice(order.indexOf(layerItemId) + 1, 0, duplicateId)
          presentationState.layerItemOrder = order
        }
      })
    } else {
      const presentationState = draftScene.presentation?.states.find(
        (candidate) => candidate.id === state.selection.stateId,
      )
      if (!presentationState) throw new Error('当前命名状态已失效')
      if (layer.item.visible) {
        presentationState.layerItemOverrides[duplicateId] = { visible: true }
      }
    }
    draftScene.interactions.push(...duplicateNodeInteractionGraph(
      draftScene.interactions,
      layerItemId,
      duplicateId,
    ))
  }, now)
  return commitV9SlideDocument(
    state,
    project,
    selectionAfterLayerCommand(state, project, [duplicateId]),
  )
}

export function reorderV9SlideLayers(
  state: V9SlideVerticalSliceState,
  layerItemIds: readonly string[],
  now?: string,
): V9SlideVerticalSliceState {
  if (state.editingScope === 'global') throw new Error('全局层暂不能调整顺序')
  const viewIds = activeSlideView(state).layers
    .filter((layer) => layer.source === state.editingScope)
    .map((layer) => layer.selectionId)
  if (
    layerItemIds.length !== viewIds.length ||
    new Set(layerItemIds).size !== layerItemIds.length ||
    layerItemIds.some((id) => !viewIds.includes(id))
  ) throw new Error('图层顺序必须包含当前场景的全部元素')
  if (sameSelection(layerItemIds, viewIds)) return state
  const { surface, scene } = activeSlideSceneContext(state)
  const project = updateCourseProject(state.history.present, (draft) => {
    const draftSurface = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!draftSurface || draftSurface.type !== 'slide') throw new Error('当前幻灯片已失效')
    if (state.editingScope === 'surface') {
      const orderSlots = draftSurface.surfaceLayerItems
        .map((entry) => entry.item.order)
        .sort((a, b) => a - b)
      const byId = new Map(draftSurface.surfaceLayerItems.map(
        (entry) => [entry.item.layerItemId, entry.item],
      ))
      layerItemIds.forEach((id, index) => {
        const item = byId.get(id)
        if (!item) throw new Error('当前共用元素已失效')
        item.order = orderSlots[index]!
      })
      draftSurface.surfaceLayerItems.sort((left, right) =>
        left.item.order - right.item.order ||
        left.item.layerItemId.localeCompare(right.item.layerItemId),
      )
      return
    }
    const draftScene = draftSurface.scenes.find((candidate) => candidate.id === scene.id)
    if (!draftScene) throw new Error('当前场景已失效')
    if (state.selection.stateId !== null) {
      const presentationState = draftScene.presentation?.states.find(
        (candidate) => candidate.id === state.selection.stateId,
      )
      if (!presentationState) throw new Error('当前命名状态已失效')
      for (const [id, override] of Object.entries(presentationState.layerItemOverrides)) {
        delete override.order
        deleteEmptyOverride(presentationState.layerItemOverrides, id)
      }
      const baseIds = [...draftScene.layerItems]
        .sort((left, right) => left.order - right.order)
        .map((item) => item.layerItemId)
      if (sameSelection(layerItemIds, baseIds)) delete presentationState.layerItemOrder
      else presentationState.layerItemOrder = [...layerItemIds]
      return
    }
    const orderSlots = draftScene.layerItems.map((item) => item.order).sort((a, b) => a - b)
    const byId = new Map(draftScene.layerItems.map((item) => [item.layerItemId, item]))
    layerItemIds.forEach((id, index) => {
      const item = byId.get(id)
      if (!item) throw new Error('当前元素已失效')
      item.order = orderSlots[index]!
    })
    draftScene.layerItems.sort((left, right) => left.order - right.order)
  }, now)
  return commitV9SlideDocument(state, project)
}

function slideSurfaceForScene(
  project: V9SlideVerticalSliceState['history']['present'],
  sceneId: string,
) {
  const surface = project.surfaces.find((candidate) =>
    candidate.type === 'slide' && candidate.scenes.some((scene) => scene.id === sceneId),
  )
  if (!surface || surface.type !== 'slide') throw new Error('找不到对应的幻灯片')
  return surface
}

function activeSlideSurface(state: V9SlideVerticalSliceState) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') {
    throw new Error('当前位置不是幻灯片')
  }
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('当前幻灯片已失效')
  return surface
}

function baseSelectionForScene(
  project: V9SlideVerticalSliceState['history']['present'],
  sceneId: string,
): SlideEditorSelection {
  const surface = slideSurfaceForScene(project, sceneId)
  const location = project.locations.find((candidate) =>
    candidate.kind === 'slide-scene' &&
    candidate.surfaceId === surface.id &&
    candidate.sceneId === sceneId &&
    candidate.stateId === undefined,
  ) ?? project.locations.find((candidate) =>
    candidate.kind === 'slide-scene' &&
    candidate.surfaceId === surface.id &&
    candidate.sceneId === sceneId,
  )
  if (!location) throw new Error('当前幻灯片缺少课程位置')
  return selectSlideEditorLayers({
    project,
    locationId: location.id,
    stateId: null,
    selectionIds: [],
  })
}

function commitV9SlideDocument(
  state: V9SlideVerticalSliceState,
  project: V9SlideVerticalSliceState['history']['present'],
  selection: SlideEditorSelection = state.selection,
  editingScope: V9SlideEditingScope = state.editingScope,
): V9SlideVerticalSliceState {
  return freezeState(
    state.sessionId,
    commitCourseHistory(state.history, project),
    selection,
    editingScope,
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

export function setV9SlideEditingScope(
  state: V9SlideVerticalSliceState,
  editingScope: V9SlideEditingScope,
): V9SlideVerticalSliceState {
  if (state.editingScope === editingScope && state.selection.selectionIds.length === 0) return state
  const selection = selectSlideEditorLayers({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
    selectionIds: [],
  })
  return freezeState(
    state.sessionId,
    state.history,
    selection,
    editingScope,
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

export function activateV9SlideScene(
  state: V9SlideVerticalSliceState,
  sceneId: string,
): V9SlideVerticalSliceState {
  const selection = baseSelectionForScene(state.history.present, sceneId)
  if (
    state.editingScope === 'scene' &&
    state.selection.locationId === selection.locationId &&
    state.selection.stateId === null &&
    state.selection.selectionIds.length === 0
  ) {
    return state
  }
  return freezeState(
    state.sessionId,
    state.history,
    selection,
    'scene',
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

export function addV9SlideScene(
  state: V9SlideVerticalSliceState,
  now?: string,
): V9SlideVerticalSliceState {
  const surface = activeSlideSurface(state)
  const priorIds = new Set(surface.scenes.map((scene) => scene.id))
  const project = addSlideScene(state.history.present, surface.id, { now })
  const nextSurface = project.surfaces.find((candidate) => candidate.id === surface.id)
  if (!nextSurface || nextSurface.type !== 'slide') throw new Error('新建后当前幻灯片集已失效')
  const added = nextSurface.scenes.find((scene) => !priorIds.has(scene.id))
  if (!added) throw new Error('新建幻灯片失败')
  return commitV9SlideDocument(state, project, baseSelectionForScene(project, added.id), 'scene')
}

export function renameV9SlideScene(
  state: V9SlideVerticalSliceState,
  sceneId: string,
  name: string,
  now?: string,
): V9SlideVerticalSliceState {
  const surface = slideSurfaceForScene(state.history.present, sceneId)
  const scene = surface.scenes.find((candidate) => candidate.id === sceneId)!
  const normalized = name.trim().slice(0, 200)
  if (!normalized || normalized === scene.name) return state
  const project = renameSlideScene(state.history.present, surface.id, sceneId, normalized, now)
  return commitV9SlideDocument(state, project)
}

export function reorderV9SlideScenes(
  state: V9SlideVerticalSliceState,
  sceneIds: readonly string[],
  now?: string,
): V9SlideVerticalSliceState {
  const firstId = sceneIds[0]
  if (!firstId) return state
  const surface = slideSurfaceForScene(state.history.present, firstId)
  if (surface.scenes.map((scene) => scene.id).every((id, index) => id === sceneIds[index])) {
    return state
  }
  const project = reorderSlideScenes(state.history.present, surface.id, sceneIds, now)
  return commitV9SlideDocument(state, project)
}

export function duplicateV9SlideScene(
  state: V9SlideVerticalSliceState,
  sceneId: string,
  now?: string,
): V9SlideVerticalSliceState {
  const surface = slideSurfaceForScene(state.history.present, sceneId)
  const priorIds = new Set(surface.scenes.map((scene) => scene.id))
  const project = duplicateSlideScene(state.history.present, surface.id, sceneId, { now })
  const nextSurface = project.surfaces.find((candidate) => candidate.id === surface.id)
  if (!nextSurface || nextSurface.type !== 'slide') throw new Error('复制后当前幻灯片集已失效')
  const duplicate = nextSurface.scenes.find((scene) => !priorIds.has(scene.id))
  if (!duplicate) throw new Error('复制幻灯片失败')
  return commitV9SlideDocument(state, project, baseSelectionForScene(project, duplicate.id), 'scene')
}

export function deleteV9SlideScene(
  state: V9SlideVerticalSliceState,
  sceneId: string,
  now?: string,
): V9SlideVerticalSliceState {
  const surface = slideSurfaceForScene(state.history.present, sceneId)
  const index = surface.scenes.findIndex((scene) => scene.id === sceneId)
  const fallback = surface.scenes[index - 1] ?? surface.scenes[index + 1]
  if (!fallback) throw new Error('课件至少需要一张幻灯片')
  const activeLocation = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  const deletingActiveScene = activeLocation?.kind === 'slide-scene' &&
    activeLocation.sceneId === sceneId
  const project = deleteSlideScene(state.history.present, surface.id, sceneId, now)
  if (deletingActiveScene) {
    return commitV9SlideDocument(state, project, baseSelectionForScene(project, fallback.id), 'scene')
  }
  let selection: SlideEditorSelection
  try {
    selection = selectSlideEditorLayers({
      project,
      locationId: state.selection.locationId,
      stateId: state.selection.stateId,
      selectionIds: state.selection.selectionIds,
    })
  } catch {
    selection = selectSlideEditorLayers({
      project,
      locationId: state.selection.locationId,
      stateId: state.selection.stateId,
      selectionIds: [],
    })
  }
  return commitV9SlideDocument(state, project, selection, state.editingScope)
}

function activeSlideSceneContext(state: V9SlideVerticalSliceState) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') {
    throw new Error('当前位置不是幻灯片')
  }
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('当前幻灯片已失效')
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  if (!scene) throw new Error('当前幻灯片已失效')
  return { location, surface, scene }
}

function presentationSelection(
  state: V9SlideVerticalSliceState,
  project: V9SlideVerticalSliceState['history']['present'],
  stateId: string | null,
): SlideEditorSelection {
  return selectSlideEditorLayers({
    project,
    locationId: state.selection.locationId,
    stateId,
    selectionIds: [],
  })
}

export function activateV9SlidePresentationState(
  state: V9SlideVerticalSliceState,
  stateId: string | null,
): V9SlideVerticalSliceState {
  const { scene } = activeSlideSceneContext(state)
  if (stateId !== null && !scene.presentation?.states.some((candidate) => candidate.id === stateId)) {
    throw new Error('当前命名状态已失效')
  }
  const selection = presentationSelection(state, state.history.present, stateId)
  if (
    state.editingScope === 'scene' &&
    state.selection.stateId === selection.stateId &&
    state.selection.selectionIds.length === 0
  ) {
    return state
  }
  return freezeState(
    state.sessionId,
    state.history,
    selection,
    'scene',
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

export function addV9SlidePresentationState(
  state: V9SlideVerticalSliceState,
  name?: string,
  now?: string,
): V9SlideVerticalSliceState {
  const { surface, scene } = activeSlideSceneContext(state)
  const priorIds = new Set(scene.presentation?.states.map((candidate) => candidate.id) ?? [])
  const project = addSlidePresentationState(
    state.history.present,
    surface.id,
    scene.id,
    name,
    { now },
  )
  const nextSurface = project.surfaces.find((candidate) => candidate.id === surface.id)
  const nextScene = nextSurface?.type === 'slide'
    ? nextSurface.scenes.find((candidate) => candidate.id === scene.id)
    : undefined
  const added = nextScene?.presentation?.states.find((candidate) => !priorIds.has(candidate.id))
  if (!added) throw new Error('新建命名状态失败')
  return commitV9SlideDocument(
    state,
    project,
    presentationSelection(state, project, added.id),
    'scene',
  )
}

export function duplicateV9SlidePresentationState(
  state: V9SlideVerticalSliceState,
  stateId: string,
  now?: string,
): V9SlideVerticalSliceState {
  const { surface, scene } = activeSlideSceneContext(state)
  const priorIds = new Set(scene.presentation?.states.map((candidate) => candidate.id) ?? [])
  const project = duplicateSlidePresentationState(
    state.history.present,
    surface.id,
    scene.id,
    stateId,
    { now },
  )
  const nextSurface = project.surfaces.find((candidate) => candidate.id === surface.id)
  const nextScene = nextSurface?.type === 'slide'
    ? nextSurface.scenes.find((candidate) => candidate.id === scene.id)
    : undefined
  const duplicate = nextScene?.presentation?.states.find((candidate) => !priorIds.has(candidate.id))
  if (!duplicate) throw new Error('复制命名状态失败')
  return commitV9SlideDocument(
    state,
    project,
    presentationSelection(state, project, duplicate.id),
    'scene',
  )
}

export function renameV9SlidePresentationState(
  state: V9SlideVerticalSliceState,
  stateId: string,
  name: string,
  now?: string,
): V9SlideVerticalSliceState {
  const { surface, scene } = activeSlideSceneContext(state)
  const current = scene.presentation?.states.find((candidate) => candidate.id === stateId)
  if (!current) throw new Error('当前命名状态已失效')
  const normalized = name.trim().slice(0, 120)
  if (!normalized || normalized === current.name) return state
  const project = renameSlidePresentationState(
    state.history.present, surface.id, scene.id, stateId, normalized, now,
  )
  return commitV9SlideDocument(state, project)
}

export function setInitialV9SlidePresentationState(
  state: V9SlideVerticalSliceState,
  stateId: string,
  now?: string,
): V9SlideVerticalSliceState {
  const { surface, scene } = activeSlideSceneContext(state)
  if (scene.presentation?.initialStateId === stateId) return state
  const project = setInitialSlidePresentationState(
    state.history.present, surface.id, scene.id, stateId, now,
  )
  return commitV9SlideDocument(state, project)
}

export function setThumbnailV9SlidePresentationState(
  state: V9SlideVerticalSliceState,
  stateId: string,
  now?: string,
): V9SlideVerticalSliceState {
  const { surface, scene } = activeSlideSceneContext(state)
  if (scene.presentation?.thumbnailStateId === stateId) return state
  const project = setThumbnailSlidePresentationState(
    state.history.present, surface.id, scene.id, stateId, now,
  )
  return commitV9SlideDocument(state, project)
}

export function clearV9SlidePresentationStateOverrides(
  state: V9SlideVerticalSliceState,
  stateId: string,
  now?: string,
): V9SlideVerticalSliceState {
  const { surface, scene } = activeSlideSceneContext(state)
  const current = scene.presentation?.states.find((candidate) => candidate.id === stateId)
  if (!current) throw new Error('当前命名状态已失效')
  if (
    Object.keys(current.layerItemOverrides).length === 0 &&
    current.layerItemOrder === undefined &&
    current.backgroundColor === undefined &&
    current.backgroundAssetId === undefined
  ) {
    return state
  }
  const project = clearSlidePresentationStateOverrides(
    state.history.present, surface.id, scene.id, stateId, now,
  )
  return commitV9SlideDocument(state, project)
}

export function deleteV9SlidePresentationState(
  state: V9SlideVerticalSliceState,
  stateId: string,
  now?: string,
): V9SlideVerticalSliceState {
  const { surface, scene } = activeSlideSceneContext(state)
  if (!scene.presentation?.states.some((candidate) => candidate.id === stateId)) {
    throw new Error('当前命名状态已失效')
  }
  if (scene.presentation.states.length <= 1) {
    throw new Error('幻灯片至少需要一个命名状态')
  }
  const project = deleteSlidePresentationState(
    state.history.present, surface.id, scene.id, stateId, now,
  )
  const nextSurface = project.surfaces.find((candidate) => candidate.id === surface.id)
  const nextScene = nextSurface?.type === 'slide'
    ? nextSurface.scenes.find((candidate) => candidate.id === scene.id)
    : undefined
  if (!nextScene?.presentation) throw new Error('删除后当前幻灯片状态已失效')
  const selection = state.selection.stateId === stateId
    ? presentationSelection(state, project, nextScene.presentation.initialStateId)
    : selectSlideEditorLayers({
        project,
        locationId: state.selection.locationId,
        stateId: state.selection.stateId,
        selectionIds: state.selection.selectionIds,
      })
  return commitV9SlideDocument(
    state,
    project,
    selection,
    'scene',
  )
}

function selectionForHistory(
  state: V9SlideVerticalSliceState,
  history: CourseHistoryState,
): SlideEditorSelection {
  try {
    return selectCourseEditorLocation(
      history.present,
      state.selection.locationId,
      state.selection.stateId,
      state.selection.selectionIds,
    )
  } catch {
    try {
      return selectCourseEditorLocation(
        history.present,
        state.selection.locationId,
        state.selection.stateId,
        [],
      )
    } catch {
      try {
        return selectCourseEditorLocation(
          history.present,
          state.selection.locationId,
          null,
          [],
        )
      } catch {
        return selectCourseEditorLocation(
          history.present,
          history.present.startLocationId,
          null,
          [],
        )
      }
    }
  }
}

export function undoV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
): V9SlideVerticalSliceState {
  const history = undoCourseHistory(state.history)
  if (history === state.history) return state
  return freezeState(
    state.sessionId,
    history,
    selectionForHistory(state, history),
    state.editingScope,
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

export function redoV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
): V9SlideVerticalSliceState {
  const history = redoCourseHistory(state.history)
  if (history === state.history) return state
  return freezeState(
    state.sessionId,
    history,
    selectionForHistory(state, history),
    state.editingScope,
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}
