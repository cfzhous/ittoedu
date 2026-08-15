import type { ComponentPackageData } from '../../shared/componentTypes'
import type {
  CourseProjectDocument,
  NativeLayerItem,
} from '../../shared/courseProjectTypes'
import type { SceneDocument, TextNode } from '../../shared/projectTypes'
import {
  createCourseHistory,
  createCourseProject,
  redoCourseHistory,
  type CourseHistoryState,
  undoCourseHistory,
  updateCourseProject,
} from './courseStudioModel'
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
const EMPTY_COMPONENT_PACKAGES = Object.freeze({}) as Record<string, ComponentPackageData>

export type EditorStartupBackend = 'v8' | typeof V9_SLIDE_TEST_BACKEND

export interface V9SlideVerticalSliceState {
  readonly history: CourseHistoryState
  readonly selection: SlideEditorSelection
  readonly savedProject: CourseProjectDocument
  readonly projectPath: string | null
}

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
  history: CourseHistoryState,
  selection: SlideEditorSelection,
  savedProject: CourseProjectDocument,
  projectPath: string | null,
): V9SlideVerticalSliceState {
  return Object.freeze({ history, selection, savedProject, projectPath })
}

export function createV9SlideVerticalSliceState(): V9SlideVerticalSliceState {
  const project = createFixtureProject()
  return openV9SlideVerticalSliceState(project, null)
}

export function openV9SlideVerticalSliceState(
  project: CourseProjectDocument,
  projectPath: string | null,
): V9SlideVerticalSliceState {
  const history = createCourseHistory(project)
  const selection = selectSlideEditorLayer({
    project,
    locationId: project.startLocationId,
    stateId: null,
    selectionId: null,
  })
  return freezeState(history, selection, project, projectPath)
}

export function isV9SlideVerticalSliceDirty(
  state: V9SlideVerticalSliceState,
): boolean {
  return state.history.present !== state.savedProject
}

export function completeV9SlideVerticalSliceSave(
  state: V9SlideVerticalSliceState,
  savedProject: CourseProjectDocument,
  projectPath: string,
): V9SlideVerticalSliceState {
  const belongsToHistory = state.history.present === savedProject ||
    state.history.past.includes(savedProject) ||
    state.history.future.includes(savedProject)
  if (!belongsToHistory) {
    throw new Error('保存结果不属于当前 V9 Slide 纵切工程')
  }
  if (state.savedProject === savedProject && state.projectPath === projectPath) return state
  return freezeState(state.history, state.selection, savedProject, projectPath)
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
  const nodes = view.layers.flatMap((layer) => {
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
    componentPackages: EMPTY_COMPONENT_PACKAGES,
    selectedNodeIds,
  }
}

export function selectV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
  input: V9SlideSelectionInput,
): V9SlideVerticalSliceState {
  if (input.nodeIds.length === 0) {
    if (input.additive || state.selection.selectionId === null) return state
    return freezeState(state.history, selectSlideEditorLayer({
      project: state.history.present,
      locationId: state.selection.locationId,
      stateId: state.selection.stateId,
      selectionId: null,
    }), state.savedProject, state.projectPath)
  }
  if (input.nodeIds.length !== 1) return state
  const selectionId = input.nodeIds[0]!
  if (!editableTextLayer(state, selectionId)) return state
  const nextSelectionId = input.additive && state.selection.selectionId === selectionId
    ? null
    : selectionId
  if (nextSelectionId === state.selection.selectionId) return state
  return freezeState(state.history, selectSlideEditorLayer({
    project: state.history.present,
    locationId: state.selection.locationId,
    stateId: state.selection.stateId,
    selectionId: nextSelectionId,
  }), state.savedProject, state.projectPath)
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
  return freezeState(history, selection, state.savedProject, state.projectPath)
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
    history,
    selectionForHistory(state, history),
    state.savedProject,
    state.projectPath,
  )
}

export function redoV9SlideVerticalSlice(
  state: V9SlideVerticalSliceState,
): V9SlideVerticalSliceState {
  const history = redoCourseHistory(state.history)
  if (history === state.history) return state
  return freezeState(
    history,
    selectionForHistory(state, history),
    state.savedProject,
    state.projectPath,
  )
}
