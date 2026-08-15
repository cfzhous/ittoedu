import type { ComponentPackageData } from '../../shared/componentTypes'
import type {
  NativeLayerItem,
} from '../../shared/courseProjectTypes'
import type { SceneDocument, TextNode } from '../../shared/projectTypes'
import {
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
  setInitialSlidePresentationState,
  setThumbnailSlidePresentationState,
  type CourseHistoryState,
  undoCourseHistory,
  updateCourseProject,
} from './courseStudioModel'
import { componentPackagesFromArchive } from '../components/componentPackageStore'
import type { CourseProjectArchiveData } from '../project/courseProjectArchive'
import {
  moveSelectedSlideText,
  selectSlideEditorLayer,
  type SlideEditorSelection,
} from './slideEditorCommands'
import {
  buildSlideEditorView,
  type DeepReadonly,
  type SlideEditorLayerView,
} from './slideEditorView'

export const V9_SLIDE_TEST_BACKEND = 'v9-slide-test' as const
export const V9_SLIDE_TEST_QUERY = '?editor-backend=v9-slide-test' as const
export const V9_SLIDE_TEST_TEXT_ID = 'v9-test-text' as const

const FIXTURE_NOW = '2026-08-15T02:00:00.000Z'

export type EditorStartupBackend = 'v8' | typeof V9_SLIDE_TEST_BACKEND

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

export type V9SlideEditingScope = 'scene' | 'global'

export interface V9SlideSelectionInput {
  readonly nodeIds: readonly string[]
  readonly additive: boolean
}

export interface V9SlideMoveInput {
  readonly nodes: readonly {
    readonly nodeId: string
    readonly x: number
    readonly y: number
  }[]
}

export interface V9SlideWorkspaceSnapshot {
  readonly document: SceneDocument
  readonly componentPackages: Record<string, ComponentPackageData>
  readonly selectedNodeIds: readonly string[]
}

/** The temporary backend is deliberately available through one exact test URL only. */
export function resolveEditorStartupBackend(search: string): EditorStartupBackend {
  return search === V9_SLIDE_TEST_QUERY ? V9_SLIDE_TEST_BACKEND : 'v8'
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
      throw new Error('V9 Slide 纵切 fixture 缺少初始场景位置')
    }
    const surface = draft.surfaces.find((candidate) => candidate.id === location.surfaceId)
    if (!surface || surface.type !== 'slide') {
      throw new Error('V9 Slide 纵切 fixture 缺少初始 Slide 表面')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
    if (!scene) throw new Error('V9 Slide 纵切 fixture 缺少初始场景')
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

export function openV9SlideVerticalSliceState(
  archive: CourseProjectArchiveData,
  projectPath: string | null,
  options: { markDirty?: boolean } = {},
): V9SlideVerticalSliceState {
  const { project, assetFiles, componentFiles } = archive
  const history = createCourseHistory(project)
  const selection = selectSlideEditorLayer({
    project,
    locationId: project.startLocationId,
    stateId: null,
    selectionId: null,
  })
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

type ReadonlyNativeTextContent = Extract<
  DeepReadonly<NativeLayerItem>['content'],
  { readonly nativeType: 'text' }
>

type ReadonlyTextLayer = Omit<SlideEditorLayerView, 'item'> & {
  readonly item: Omit<DeepReadonly<NativeLayerItem>, 'content'> & {
    readonly content: ReadonlyNativeTextContent
  }
}

function editableTextLayer(
  state: V9SlideVerticalSliceState,
  selectionId: string,
): ReadonlyTextLayer | undefined {
  if (state.editingScope !== 'scene') return undefined
  const view = buildSlideEditorView({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
  })
  const layer = view.layers.find((candidate) => candidate.selectionId === selectionId)
  if (
    !layer ||
    layer.source !== 'scene' ||
    !layer.effectiveVisible ||
    layer.item.locked ||
    layer.item.kind !== 'native' ||
    layer.item.content.nativeType !== 'text'
  ) {
    return undefined
  }
  return layer as ReadonlyTextLayer
}

function textNodeFromLayer(layer: ReadonlyTextLayer): TextNode {
  const { item } = layer
  const { data } = item.content
  return {
    id: item.layerItemId,
    name: item.label,
    type: 'text',
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
    opacity: item.opacity,
    visible: layer.effectiveVisible,
    locked: item.locked,
    playbackInitialVisibility: item.playbackInitialVisibility,
    text: data.text,
    runs: data.runs.map((run) => ({ ...run, style: { ...run.style } })),
    style: { ...data.style },
  }
}

export function buildV9SlideWorkspaceSnapshot(
  state: V9SlideVerticalSliceState,
): V9SlideWorkspaceSnapshot {
  const view = buildSlideEditorView({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
  })
  const nodes = state.editingScope === 'global' ? [] : view.layers.flatMap((layer) => {
    if (
      layer.source !== 'scene' ||
      layer.item.kind !== 'native' ||
      layer.item.content.nativeType !== 'text'
    ) {
      return []
    }
    return [textNodeFromLayer(layer as ReadonlyTextLayer)]
  })
  const selectedNodeIds = state.selection.selectionId !== null &&
    nodes.some((node) => node.id === state.selection.selectionId)
    ? [state.selection.selectionId]
    : []
  return {
    document: {
      id: view.sceneId,
      name: view.sceneName,
      backgroundColor: view.backgroundColor,
      ...(view.backgroundAssetId === undefined
        ? {}
        : { backgroundAssetId: view.backgroundAssetId }),
      nodes,
      interactions: [],
    },
    componentPackages: state.componentPackages,
    selectedNodeIds,
  }
}

export function selectV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
  input: V9SlideSelectionInput,
): V9SlideVerticalSliceState {
  if (input.nodeIds.length === 0) {
    if (input.additive || state.selection.selectionId === null) return state
    return freezeState(state.sessionId, state.history, selectSlideEditorLayer({
      project: state.history.present,
      locationId: state.selection.locationId,
      stateId: state.selection.stateId,
      selectionId: null,
    }), state.editingScope, state.savedSnapshot, state.projectPath, state.assetFiles, state.componentFiles, state.componentPackages)
  }
  if (input.nodeIds.length !== 1) return state
  const selectionId = input.nodeIds[0]!
  if (!editableTextLayer(state, selectionId)) return state
  const nextSelectionId = input.additive && state.selection.selectionId === selectionId
    ? null
    : selectionId
  if (nextSelectionId === state.selection.selectionId) return state
  return freezeState(state.sessionId, state.history, selectSlideEditorLayer({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
    selectionId: nextSelectionId,
  }), state.editingScope, state.savedSnapshot, state.projectPath, state.assetFiles, state.componentFiles, state.componentPackages)
}

export function moveV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
  input: V9SlideMoveInput,
  now?: string,
): V9SlideVerticalSliceState {
  if (input.nodes.length !== 1) return state
  const [{ nodeId, x, y }] = input.nodes
  if (!Number.isFinite(x) || !Number.isFinite(y)) return state
  const layer = editableTextLayer(state, nodeId)
  if (!layer) return state
  const selection = state.selection.selectionId === nodeId
    ? state.selection
    : selectSlideEditorLayer({
        project: state.history.present,
        locationId: state.selection.locationId,
        stateId: state.selection.stateId,
        selectionId: nodeId,
      })
  const history = moveSelectedSlideText(state.history, selection, {
    x: x - layer.item.frame.x,
    y: y - layer.item.frame.y,
  }, now)
  if (history === state.history && selection === state.selection) return state
  return freezeState(
    state.sessionId,
    history,
    selection,
    state.editingScope,
    state.savedSnapshot,
    state.projectPath,
    state.assetFiles,
    state.componentFiles,
    state.componentPackages,
  )
}

function slideSurfaceForScene(
  project: V9SlideVerticalSliceState['history']['present'],
  sceneId: string,
) {
  const surface = project.surfaces.find((candidate) =>
    candidate.type === 'slide' && candidate.scenes.some((scene) => scene.id === sceneId),
  )
  if (!surface || surface.type !== 'slide') throw new Error(`找不到 Slide 场景：${sceneId}`)
  return surface
}

function activeSlideSurface(state: V9SlideVerticalSliceState) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') {
    throw new Error('当前位置不是 Slide 场景')
  }
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('当前 Slide 表面已失效')
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
  if (!location) throw new Error(`Slide 场景缺少位置：${sceneId}`)
  return selectSlideEditorLayer({
    project,
    locationId: location.id,
    stateId: null,
    selectionId: null,
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
  if (state.editingScope === editingScope && state.selection.selectionId === null) return state
  const selection = selectSlideEditorLayer({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
    selectionId: null,
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
    state.selection.selectionId === null
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
  if (!nextSurface || nextSurface.type !== 'slide') throw new Error('新建场景后 Slide 表面已失效')
  const added = nextSurface.scenes.find((scene) => !priorIds.has(scene.id))
  if (!added) throw new Error('新建 Slide 场景失败')
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
  if (!nextSurface || nextSurface.type !== 'slide') throw new Error('复制场景后 Slide 表面已失效')
  const duplicate = nextSurface.scenes.find((scene) => !priorIds.has(scene.id))
  if (!duplicate) throw new Error('复制 Slide 场景失败')
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
  if (!fallback) throw new Error('Slide 表面至少需要一个场景')
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
    selection = selectSlideEditorLayer({
      project,
      locationId: state.selection.locationId,
      stateId: state.selection.stateId,
      selectionId: state.selection.selectionId,
    })
  } catch {
    selection = selectSlideEditorLayer({
      project,
      locationId: state.selection.locationId,
      stateId: state.selection.stateId,
      selectionId: null,
    })
  }
  return commitV9SlideDocument(state, project, selection, state.editingScope)
}

function activeSlideSceneContext(state: V9SlideVerticalSliceState) {
  const location = state.history.present.locations.find(
    (candidate) => candidate.id === state.selection.locationId,
  )
  if (!location || location.kind !== 'slide-scene') {
    throw new Error('当前位置不是 Slide 场景')
  }
  const surface = state.history.present.surfaces.find(
    (candidate) => candidate.id === location.surfaceId,
  )
  if (!surface || surface.type !== 'slide') throw new Error('当前 Slide 表面已失效')
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  if (!scene) throw new Error('当前 Slide 场景已失效')
  return { location, surface, scene }
}

function presentationSelection(
  state: V9SlideVerticalSliceState,
  project: V9SlideVerticalSliceState['history']['present'],
  stateId: string | null,
): SlideEditorSelection {
  return selectSlideEditorLayer({
    project,
    locationId: state.selection.locationId,
    stateId,
    selectionId: null,
  })
}

export function activateV9SlidePresentationState(
  state: V9SlideVerticalSliceState,
  stateId: string | null,
): V9SlideVerticalSliceState {
  const { scene } = activeSlideSceneContext(state)
  if (stateId !== null && !scene.presentation?.states.some((candidate) => candidate.id === stateId)) {
    throw new Error(`找不到命名状态：${stateId}`)
  }
  const selection = presentationSelection(state, state.history.present, stateId)
  if (
    state.editingScope === 'scene' &&
    state.selection.stateId === selection.stateId &&
    state.selection.selectionId === null
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
  if (!added) throw new Error('新建 Slide 命名状态失败')
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
  if (!duplicate) throw new Error('复制 Slide 命名状态失败')
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
  if (!current) throw new Error(`找不到命名状态：${stateId}`)
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
  if (!current) throw new Error(`找不到命名状态：${stateId}`)
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
    throw new Error(`找不到命名状态：${stateId}`)
  }
  if (scene.presentation.states.length <= 1) {
    throw new Error('Slide 场景至少需要一个命名状态')
  }
  const project = deleteSlidePresentationState(
    state.history.present, surface.id, scene.id, stateId, now,
  )
  const nextSurface = project.surfaces.find((candidate) => candidate.id === surface.id)
  const nextScene = nextSurface?.type === 'slide'
    ? nextSurface.scenes.find((candidate) => candidate.id === scene.id)
    : undefined
  if (!nextScene?.presentation) throw new Error('删除状态后 Slide presentation 已失效')
  const selection = state.selection.stateId === stateId
    ? presentationSelection(state, project, nextScene.presentation.initialStateId)
    : selectSlideEditorLayer({
        project,
        locationId: state.selection.locationId,
        stateId: state.selection.stateId,
        selectionId: state.selection.selectionId,
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
    return selectSlideEditorLayer({
      project: history.present,
      locationId: state.selection.locationId,
      stateId: state.selection.stateId,
      selectionId: state.selection.selectionId,
    })
  } catch {
    return selectSlideEditorLayer({
      project: history.present,
      locationId: history.present.startLocationId,
      stateId: null,
      selectionId: null,
    })
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
