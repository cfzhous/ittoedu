import {
  applyPatches,
  current,
  enablePatches,
  isDraft,
  produce,
  produceWithPatches,
} from 'immer'
import { nanoid } from 'nanoid'
import { create } from 'zustand'
import type {
  ComponentManifest,
  ComponentPackageData,
} from '../../shared/componentTypes'
import { componentManifestSchema } from '../../shared/componentSchema'
import { componentSupportsScope } from '../../shared/componentCapabilities'
import {
  isNodeMotionAction,
  isVideoInteractionAction,
  type InteractionRule,
  type MotionDirection,
  type MotionEffect,
  type NodeMotionAction,
} from '../../shared/interactionTypes'
import { resolveComponentPresetProps } from '../../shared/componentProps'
import type {
  AudioChannel,
  AssetMeta,
  DeepPartial,
  EmbeddedComponentPackageMeta,
  GlobalLayerItem,
  GlobalLayerVisibility,
  ProjectDocument,
  ProjectDesignTokens,
  ProjectAudioSettings,
  SceneDocument,
  SceneNode,
  SceneNodeOverride,
  ScenePresentationState,
  ShapeType,
  SoundDefinition,
  TextNode,
  TextRun,
  VideoNode,
} from '../../shared/projectTypes'
import {
  createDefaultScenePresentation,
  deriveSceneNodeOverride,
  ensureScenePresentation,
  findPresentationState,
  isNodeOverriddenInState,
  materializeScene,
  rewritePresentationNodeIds,
} from '../../shared/presentation'
import type {
  EditableTextContent,
  RuntimeDocument,
} from '../../shared/runtimeTypes'
import { UserFacingError } from '../../shared/errors'
import {
  analyzeProjectAssetReferences,
  describeProjectAssetReference,
} from '../../shared/assetReferences'
import {
  collectComponentPackageUsage,
  evaluateComponentPackageDeletion,
  planComponentPackageReplacement,
} from '../../shared/componentPackageLifecycle'
import { componentContentSha256 } from '../../shared/componentContentIntegrity'
import { rotatedRectangleAabb } from '../../shared/geometry'
import {
  restoreTeacherControllerForDelivery,
  synchronizeTeacherControllerControls,
} from '../../shared/teacherControllerConsistency'
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  MAX_PROJECT_SCENES,
  MAX_SCENE_NODES,
  MAX_SCENE_PRESENTATION_STATES,
  MIN_NODE_SIZE,
  MIN_VISIBLE_NODE_EDGE,
} from '../../shared/constants'
import {
  createExternalComponentNode,
  createFormulaNode,
  createImageNode,
  createProject,
  createRectangleNode,
  createShapeNode,
  createScene,
  createTeacherControllerNode,
  createTextNode,
  createVideoNode,
} from '../project/createProject'
import {
  cloneProject,
  emptyHistory,
  pushHistory,
  type AssetFileHistoryChange,
  type ComponentPackageHistoryChange,
  type HistoryState,
} from './history'
import {
  parseComponentPackageFiles,
  validateComponentRuntimeSource,
} from '../components/importComponentPackage'
import type { CourseProjectArchiveData } from '../project/courseProjectArchive'
import {
  activateV9SlidePresentationState,
  activateV9SlideScene,
  addV9SlideFormulaLayer,
  addV9SlidePresentationState,
  addV9SlideScene,
  addV9SlideShapeLayer,
  addV9SlideTextLayer,
  clearV9SlideNativeNodeOverride,
  clearV9SlidePresentationStateOverrides,
  completeV9SlideVerticalSliceSave,
  createV9CourseEditorState,
  createV9SlideVerticalSliceState,
  deleteV9SlideScene,
  deleteV9SlideLayer,
  deleteV9SlidePresentationState,
  duplicateV9SlidePresentationState,
  duplicateV9SlideScene,
  duplicateV9SlideLayer,
  isV9SlideVerticalSliceDirty,
  nudgeV9SlideSelection,
  openV9SlideVerticalSliceState,
  redoV9SlideVerticalSlice,
  renameV9SlidePresentationState,
  renameV9SlideScene,
  renameV9SlideVerticalSlice,
  reorderV9SlideScenes,
  reorderV9SlideLayers,
  selectV9SlideVerticalSlice,
  setInitialV9SlidePresentationState,
  setThumbnailV9SlidePresentationState,
  setV9SlideEditingScope,
  transformV9SlideVerticalSlice,
  undoV9SlideVerticalSlice,
  updateV9SlideLayer,
  updateV9SlideNativeNode,
  type V9SlideLayerPatch,
  type V9SlideEditingScope,
  type V9SlideLayerOrderTarget,
  type V9SlideLayerTarget,
  type V9SlideNativeNodePatch,
  type V9SlideNativeNodeTarget,
  type V9SlideTransformInput,
  type V9SlideSelectionInput,
  type V9SlideVerticalSliceState,
} from '../course/v9SlideVerticalSlice'

enablePatches()

const PROJECT_AUDIO_CHANNELS = [
  'music',
  'narration',
  'sfx',
  'ui',
  'video',
] as const satisfies readonly AudioChannel[]

function clampAudioVolume(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback
}

export type SidebarTab =
  | 'elements'
  | 'components'
  | 'layers'
  | 'properties'
  | 'automation'
  | 'developer'
export type EditorMode = 'simple' | 'professional'
export type EditingScope = 'scene' | 'global'
export type CanvasMode = 'edit' | 'run'
export type AlignmentMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type TextEditSource = 'canvas' | 'properties'

type V9SlideLayerContextTarget = Pick<
  V9SlideLayerTarget,
  'sessionId' | 'locationId' | 'stateId' | 'editingScope'
>

function matchesCourseLayerContext(
  session: V9SlideVerticalSliceState,
  target: V9SlideLayerContextTarget,
): boolean {
  return session.sessionId === target.sessionId &&
    session.selection.locationId === target.locationId &&
    session.selection.stateId === target.stateId &&
    session.editingScope === target.editingScope
}

export interface SimpleEntranceAnimationConfig {
  effect: Exclude<MotionEffect, 'none'>
  direction?: MotionDirection
  durationMs: number
  delayMs: number
}

const EDITOR_MODE_STORAGE_KEY = 'courseware-editor:mode'

function loadEditorMode(): EditorMode {
  try {
    return globalThis.localStorage?.getItem(EDITOR_MODE_STORAGE_KEY) === 'professional'
      ? 'professional'
      : 'simple'
  } catch {
    return 'simple'
  }
}

function persistEditorMode(mode: EditorMode): void {
  try {
    globalThis.localStorage?.setItem(EDITOR_MODE_STORAGE_KEY, mode)
  } catch {
    // UI preference persistence is best-effort and never affects project data.
  }
}

interface TextEditSnapshot {
  text: string
  runs: TextRun[]
  width: number
  height: number
}

export interface TextEditSession {
  scope: EditingScope
  sceneId: string
  presentationStateId: string | null
  nodeId: string
  source: TextEditSource
  original: TextEditSnapshot
  dirtyBefore: boolean
}

export interface ProjectAudioSettingsPatch {
  defaultMuted?: boolean
  masterVolume?: number
  channelVolumes?: Partial<Record<AudioChannel, number>>
  narrationDucking?: Partial<ProjectAudioSettings['narrationDucking']>
}

export interface ImportedAssetBatchItem {
  meta: AssetMeta
  bytes: Uint8Array
}

export interface EditorState {
  /** Canonical Course Project session. `null` means the legacy import backend is active. */
  courseSession: V9SlideVerticalSliceState | null
  project: ProjectDocument
  activeSceneId: string
  /** `null` edits the canonical base scene. */
  activePresentationStateId: string | null
  editingScope: EditingScope
  canvasMode: CanvasMode
  selectedNodeId: string | null
  selectedNodeIds: string[]
  clipboardNodes: SceneNode[]
  clipboardGlobalItems: GlobalLayerItem[]
  clipboardInteractionRules: InteractionRule[]
  projectPath: string | null
  dirty: boolean
  history: HistoryState
  assetFiles: Record<string, Uint8Array>
  componentPackages: Record<string, ComponentPackageData>
  editorMode: EditorMode
  activeTab: SidebarTab
  editingTextNodeId: string | null
  textEditSession: TextEditSession | null
  statusMessage: string | null
  errorMessage: string | null

  activateV9SlideFixture(): void
  createNewCourseProject(): void
  loadCourseProject(
    archive: CourseProjectArchiveData,
    path: string | null,
    options?: { markDirty?: boolean },
  ): void
  clearCourseProjectSession(): void
  selectCourseLayers(input: V9SlideSelectionInput): boolean
  transformCourseLayers(input: V9SlideTransformInput): boolean
  nudgeCourseLayers(dx: number, dy: number): void
  addCourseTextLayer(x?: number, y?: number): void
  addCourseFormulaLayer(x?: number, y?: number): void
  addCourseShapeLayer(shapeType: ShapeType, x?: number, y?: number): void
  updateCourseLayer(target: V9SlideLayerTarget, patch: V9SlideLayerPatch): boolean
  updateCourseNativeNode(
    target: V9SlideNativeNodeTarget,
    patch: V9SlideNativeNodePatch,
  ): boolean
  clearCourseNativeNodeOverride(target: V9SlideNativeNodeTarget): boolean
  deleteCourseLayer(target: V9SlideLayerTarget): boolean
  duplicateCourseLayer(target: V9SlideLayerTarget): boolean
  reorderCourseLayers(target: V9SlideLayerOrderTarget): boolean
  setCourseEditingScope(scope: V9SlideEditingScope): void
  activateCourseScene(sceneId: string): void
  addCourseScene(): void
  renameCourseScene(sceneId: string, name: string): void
  reorderCourseScenes(sceneIds: readonly string[]): void
  duplicateCourseScene(sceneId: string): void
  deleteCourseScene(sceneId: string): void
  activateCoursePresentationState(stateId: string | null): void
  addCoursePresentationState(name?: string): void
  duplicateCoursePresentationState(stateId: string): void
  renameCoursePresentationState(stateId: string, name: string): void
  setInitialCoursePresentationState(stateId: string): void
  setThumbnailCoursePresentationState(stateId: string): void
  clearCoursePresentationStateOverrides(stateId: string): void
  deleteCoursePresentationState(stateId: string): void
  renameCourseProject(title: string): void
  undoCourseProject(): void
  redoCourseProject(): void
  completeCourseProjectSave(
    sessionId: string,
    snapshot: CourseProjectArchiveData,
    path: string,
  ): boolean

  createNewProject(): void
  loadProject(
    project: ProjectDocument,
    path: string | null,
    assetFiles?: Record<string, Uint8Array>,
    componentPackages?: Record<string, ComponentPackageData>,
  ): void
  markSaved(path: string, project?: ProjectDocument): void
  setEditingScope(scope: EditingScope): void
  setCanvasMode(mode: CanvasMode): void
  setEditorMode(mode: EditorMode): void
  setActiveTab(tab: SidebarTab): void
  setStatus(message: string | null): void
  setError(message: string | null): void
  renameProject(title: string): void
  setEditingTextNode(nodeId: string | null): void
  beginTextEdit(nodeId: string, source?: TextEditSource): void
  updateTextEditDraft(
    nodeId: string,
    text: string,
    runs: TextRun[],
    height?: number,
    width?: number,
  ): void
  commitTextEdit(): void
  cancelTextEdit(): void

  addScene(): void
  duplicateScene(sceneId: string): void
  deleteScene(sceneId: string): boolean
  reorderScenes(sceneIds: string[]): void
  updateScene(
    sceneId: string,
    patch: Partial<Pick<SceneDocument, 'name' | 'backgroundColor' | 'backgroundAssetId'>>,
  ): void
  updateSceneRuntime(
    sceneId: string,
    patch: Partial<Pick<RuntimeDocument, 'enabled' | 'renderMode' | 'content' | 'assets' | 'source'>>,
  ): void
  updateGlobalRuntime(
    patch: Partial<Pick<RuntimeDocument, 'enabled' | 'renderMode' | 'content' | 'assets' | 'source'>>,
  ): void
  setSceneRuntime(sceneId: string, runtime: RuntimeDocument | undefined): void
  setGlobalRuntime(runtime: RuntimeDocument | undefined): void
  setActiveScene(sceneId: string): void
  setActivePresentationState(stateId: string | null): void
  addPresentationState(name?: string): void
  duplicatePresentationState(stateId: string): void
  renamePresentationState(stateId: string, name: string): void
  deletePresentationState(stateId: string): boolean
  setInitialPresentationState(stateId: string): void
  setThumbnailPresentationState(stateId: string): void
  updatePresentationState(
    stateId: string,
    patch: Partial<Pick<ScenePresentationState, 'name' | 'description' | 'backgroundColor' | 'backgroundAssetId'>>,
  ): void
  clearNodePresentationOverride(nodeId: string): void
  clearPresentationStateOverrides(stateId: string): void

  addTextNode(x?: number, y?: number): void
  addFormulaNode(x?: number, y?: number): void
  addRectangleNode(x?: number, y?: number): void
  addShapeNode(shapeType: ShapeType, x?: number, y?: number): void
  addImageNode(asset: AssetMeta, bytes: Uint8Array, x?: number, y?: number): void
  addVideoNode(asset: AssetMeta, bytes: Uint8Array, x?: number, y?: number): void
  addImageNodes(
    items: ImportedAssetBatchItem[],
    position?: { x?: number; y?: number },
  ): string[]
  addVideoNodes(
    items: ImportedAssetBatchItem[],
    position?: { x?: number; y?: number },
  ): string[]
  importAsset(asset: AssetMeta, bytes: Uint8Array): void
  importAssets(items: ImportedAssetBatchItem[]): void
  replaceImageAsset(nodeId: string, asset: AssetMeta, bytes: Uint8Array): void
  importSound(asset: AssetMeta, bytes: Uint8Array, sound?: Partial<SoundDefinition>): string
  importSounds(items: ImportedAssetBatchItem[]): string[]
  updateAudioSettings(patch: ProjectAudioSettingsPatch): void
  updateSound(soundId: string, patch: Partial<Omit<SoundDefinition, 'id'>>): void
  deleteSound(soundId: string): boolean
  deleteAsset(assetId: string): boolean
  addInteractionRule(sceneId: string, rule: InteractionRule): void
  updateInteractionRule(sceneId: string, ruleId: string, rule: InteractionRule): void
  deleteInteractionRule(sceneId: string, ruleId: string): void
  duplicateInteractionRule(sceneId: string, ruleId: string): string | null
  moveInteractionRule(
    sceneId: string,
    ruleId: string,
    direction: -1 | 1,
  ): void
  addGlobalInteractionRule(rule: InteractionRule): void
  updateGlobalInteractionRule(ruleId: string, rule: InteractionRule): void
  deleteGlobalInteractionRule(ruleId: string): void
  duplicateGlobalInteractionRule(ruleId: string): string | null
  moveGlobalInteractionRule(ruleId: string, direction: -1 | 1): void
  setSimpleEntranceAnimation(
    nodeId: string,
    config: SimpleEntranceAnimationConfig | null,
  ): void
  updatePlayback(patch: Partial<ProjectDocument['playback']>): void
  updateDesignTokens(tokens: ProjectDesignTokens): void
  ensureTeacherController(): void
  addExternalComponentNode(packageId: string, x?: number, y?: number, presetId?: string): void
  importComponentPackage(packageData: ComponentPackageData): void
  importComponentPackages(packageData: ComponentPackageData[]): void
  deleteComponentPackage(packageId: string): boolean
  replaceComponentPackage(packageId: string, packageData: ComponentPackageData): void
  createEditableComponentCopy(packageId: string, nodeId?: string): string | null
  updateEditableComponentPackage(
    packageId: string,
    patch: Partial<Pick<ComponentPackageData, 'manifest' | 'runtimeSource'>>,
  ): void
  deleteNode(nodeId: string): void
  deleteSelectedNodes(): void
  duplicateNode(nodeId: string): void
  duplicateSelectedNodes(): void
  copySelectedNodes(): void
  pasteNodes(): void
  nudgeSelection(dx: number, dy: number): void
  alignSelection(mode: AlignmentMode): void
  distributeSelection(axis: 'horizontal' | 'vertical'): void
  updateNodes(patches: Array<{ nodeId: string; patch: DeepPartial<SceneNode> }>): void
  updateNode(nodeId: string, patch: DeepPartial<SceneNode>): void
  updateGlobalLayerSettings(
    nodeId: string,
    patch: Partial<Pick<GlobalLayerItem, 'layer' | 'visibility'>>,
  ): void
  reorderNodes(nodeIds: string[]): void
  selectNode(nodeId: string | null, additive?: boolean): void
  selectNodes(nodeIds: string[]): void

  undo(): void
  redo(): void
}

function currentScene(state: Pick<EditorState, 'project' | 'activeSceneId'>) {
  return state.project.scenes.find((scene) => scene.id === state.activeSceneId)
}

function normalizeProjectPresentations(project: ProjectDocument): ProjectDocument {
  return {
    ...project,
    scenes: project.scenes.map((scene) => ({
      ...scene,
      presentation: structuredClone(ensureScenePresentation(scene)),
    })),
  }
}

function validPresentationStateId(
  scene: SceneDocument,
  requested: string | null,
): string | null {
  if (requested === null) return null
  return ensureScenePresentation(scene).states.some((state) => state.id === requested)
    ? requested
    : ensureScenePresentation(scene).initialStateId
}

function mutablePresentation(scene: SceneDocument) {
  scene.presentation ??= createDefaultScenePresentation()
  return scene.presentation
}

function mutablePresentationState(
  scene: SceneDocument,
  stateId: string,
): ScenePresentationState | undefined {
  return mutablePresentation(scene).states.find((state) => state.id === stateId)
}

function setPresentationNodeOverride(
  scene: SceneDocument,
  stateId: string,
  nodeId: string,
  override: SceneNodeOverride | undefined,
): void {
  const state = mutablePresentationState(scene, stateId)
  if (!state) return
  if (override && Object.keys(override).length > 0) {
    state.nodeOverrides[nodeId] = structuredClone(override)
  } else {
    delete state.nodeOverrides[nodeId]
  }
}

function appendNodesToScene(
  scene: SceneDocument,
  nodes: SceneNode[],
  stateId: string | null,
): void {
  if (stateId === null) {
    scene.nodes.push(...nodes.map((node) => structuredClone(node)))
    return
  }
  for (const effectiveNode of nodes) {
    const baseNode = { ...structuredClone(effectiveNode), visible: false }
    scene.nodes.push(baseNode)
    setPresentationNodeOverride(
      scene,
      stateId,
      baseNode.id,
      deriveSceneNodeOverride(baseNode, effectiveNode),
    )
    const state = mutablePresentationState(scene, stateId)
    if (state?.nodeOrder) state.nodeOrder.push(baseNode.id)
  }
}

function removeBaseNodes(scene: SceneDocument, nodeIds: ReadonlySet<string>): void {
  scene.nodes = scene.nodes.filter((node) => !nodeIds.has(node.id))
  for (const state of mutablePresentation(scene).states) {
    for (const nodeId of nodeIds) delete state.nodeOverrides[nodeId]
    if (state.nodeOrder) {
      const remainingOrder = state.nodeOrder.filter(
        (nodeId) => !nodeIds.has(nodeId),
      )
      state.nodeOrder = remainingOrder.length > 0 ? remainingOrder : undefined
    }
  }
}

let cachedGlobalLayer: ProjectDocument['globalLayer'] | null = null
let cachedGlobalNodes: SceneNode[] = []
let cachedScene: SceneDocument | null = null
let cachedSceneStateId: string | null = null
let cachedSceneNodes: SceneNode[] = []

function editingNodes(
  state: Pick<EditorState, 'project' | 'activeSceneId' | 'activePresentationStateId' | 'editingScope'>,
): SceneNode[] {
  if (state.editingScope !== 'global') {
    const scene = currentScene(state)
    if (!scene) return []
    if (state.activePresentationStateId === null) return scene.nodes
    if (
      cachedScene !== scene ||
      cachedSceneStateId !== state.activePresentationStateId
    ) {
      cachedScene = scene
      cachedSceneStateId = state.activePresentationStateId
      cachedSceneNodes = materializeScene(scene, state.activePresentationStateId).nodes
    }
    return cachedSceneNodes
  }
  if (cachedGlobalLayer !== state.project.globalLayer) {
    cachedGlobalLayer = state.project.globalLayer
    cachedGlobalNodes = state.project.globalLayer.map((item) => item.node)
  }
  return cachedGlobalNodes
}

function normalizedVisibility(
  validSceneIds: Iterable<string>,
  visibility: GlobalLayerVisibility,
): GlobalLayerVisibility {
  const validIds = [...new Set(validSceneIds)]
  if (visibility.mode === 'all') {
    return { mode: 'all', sceneIds: [] }
  }
  const sceneIds = new Set(validIds)
  const selectedIds = [...new Set(visibility.sceneIds)].filter(
    (id) => sceneIds.has(id),
  )
  if (selectedIds.length > 0) {
    return { mode: visibility.mode, sceneIds: selectedIds }
  }
  if (visibility.mode === 'exclude') {
    return { mode: 'all', sceneIds: [] }
  }
  const fallbackSceneId = validIds[0]
  if (!fallbackSceneId) return { mode: 'all', sceneIds: [] }
  return {
    mode: visibility.mode,
    sceneIds: [fallbackSceneId],
  }
}

function editableRuntimePatch(
  patch: Partial<Pick<RuntimeDocument, 'enabled' | 'renderMode' | 'content' | 'assets' | 'source'>>,
): Partial<Pick<RuntimeDocument, 'enabled' | 'renderMode' | 'content' | 'assets' | 'source'>> {
  const next: Partial<
    Pick<RuntimeDocument, 'enabled' | 'renderMode' | 'content' | 'assets' | 'source'>
  > = {}
  if (patch.enabled !== undefined) next.enabled = patch.enabled
  if (patch.renderMode !== undefined) next.renderMode = patch.renderMode
  if (patch.source !== undefined) next.source = patch.source
  if (patch.content !== undefined) {
    next.content = structuredClone(patch.content) as EditableTextContent
  }
  if (patch.assets !== undefined) {
    next.assets = structuredClone(patch.assets)
  }
  return next
}

function textNodeForSession(
  project: ProjectDocument,
  session: TextEditSession,
): TextNode | undefined {
  const scene = project.scenes.find((item) => item.id === session.sceneId)
  const node = session.scope === 'global'
    ? project.globalLayer.find((item) => item.node.id === session.nodeId)?.node
    : scene
      ? materializeScene(scene, session.presentationStateId).nodes
        .find((item) => item.id === session.nodeId)
      : undefined
  return node?.type === 'text' ? node : undefined
}

function sameTextSnapshot(node: TextNode, snapshot: TextEditSnapshot): boolean {
  return (
    node.text === snapshot.text &&
    node.width === snapshot.width &&
    node.height === snapshot.height &&
    JSON.stringify(node.runs) === JSON.stringify(snapshot.runs)
  )
}

function projectWithTextSnapshot(
  project: ProjectDocument,
  session: TextEditSession,
  snapshot: TextEditSnapshot = session.original,
): ProjectDocument {
  const scene = project.scenes.find((item) => item.id === session.sceneId)
  const baseNode = scene?.nodes.find((item) => item.id === session.nodeId)
  const effectiveNode = scene && session.scope !== 'global'
    ? materializeScene(scene, session.presentationStateId).nodes
      .find((item) => item.id === session.nodeId)
    : undefined
  const nextEffective = effectiveNode?.type === 'text'
    ? {
        ...effectiveNode,
        text: snapshot.text,
        runs: structuredClone(snapshot.runs),
        width: snapshot.width,
        height: snapshot.height,
      }
    : undefined
  const stateOverride =
    session.scope !== 'global' &&
    session.presentationStateId !== null &&
    baseNode?.type === 'text' &&
    nextEffective?.type === 'text'
      ? deriveSceneNodeOverride(baseNode, nextEffective)
      : undefined
  return produce(project, (draft) => {
    if (session.scope === 'global') {
      const node = draft.globalLayer.find(
        (item) => item.node.id === session.nodeId,
      )?.node
      if (node?.type !== 'text') return
      node.text = snapshot.text
      node.runs = structuredClone(snapshot.runs)
      node.width = snapshot.width
      node.height = snapshot.height
      return
    }
    const draftScene = draft.scenes.find((item) => item.id === session.sceneId)
    if (!draftScene) return
    if (session.presentationStateId !== null) {
      setPresentationNodeOverride(
        draftScene as SceneDocument,
        session.presentationStateId,
        session.nodeId,
        stateOverride,
      )
      return
    }
    const node = draftScene.nodes.find((item) => item.id === session.nodeId)
    if (node?.type !== 'text') return
    node.text = snapshot.text
    node.runs = structuredClone(snapshot.runs)
    node.width = snapshot.width
    node.height = snapshot.height
  })
}

/**
 * Finalise a live text draft without losing unrelated edits. The history
 * snapshot is based on the current project with only this session's text
 * restored, so one undo step affects exactly one text-edit transaction.
 */
function commitTextEditSessionState(state: EditorState): EditorState {
  const session = state.textEditSession
  if (!session) return state
  const node = textNodeForSession(state.project, session)
  if (!node) {
    return {
      ...state,
      editingTextNodeId: null,
      textEditSession: null,
    }
  }
  const changed = !sameTextSnapshot(node, session.original)
  const restoredProject = changed
    ? projectWithTextSnapshot(state.project, session)
    : state.project
  const finalSnapshot: TextEditSnapshot = {
    text: node.text,
    runs: structuredClone(node.runs),
    width: node.width,
    height: node.height,
  }
  const [, patches, inversePatches] = changed
      ? produceWithPatches(restoredProject, (draft) => {
        const finalProject = projectWithTextSnapshot(
          restoredProject,
          session,
          finalSnapshot,
        )
        if (session.scope === 'global') {
          const source = finalProject.globalLayer.find(
            (item) => item.node.id === session.nodeId,
          )?.node
          const target = draft.globalLayer.find(
            (item) => item.node.id === session.nodeId,
          )?.node
          if (source?.type !== 'text' || target?.type !== 'text') return
          target.text = source.text
          target.runs = structuredClone(source.runs)
          target.width = source.width
          target.height = source.height
          return
        }
        const sourceScene = finalProject.scenes.find(
          (item) => item.id === session.sceneId,
        )
        const targetScene = draft.scenes.find(
          (item) => item.id === session.sceneId,
        )
        if (!sourceScene || !targetScene) return
        if (session.presentationStateId !== null) {
          const sourceOverride = findPresentationState(
            sourceScene,
            session.presentationStateId,
          )?.nodeOverrides[session.nodeId]
          setPresentationNodeOverride(
            targetScene as SceneDocument,
            session.presentationStateId,
            session.nodeId,
            sourceOverride,
          )
          return
        }
        const source = sourceScene.nodes.find((item) => item.id === session.nodeId)
        const target = targetScene.nodes.find((item) => item.id === session.nodeId)
        if (source?.type !== 'text' || target?.type !== 'text') return
        target.text = source.text
        target.runs = structuredClone(source.runs)
        target.width = source.width
        target.height = source.height
      })
    : [state.project, [], []]
  return {
    ...state,
    history: changed
      ? pushHistory(state.history, patches, inversePatches)
      : state.history,
    dirty: changed ? true : session.dirtyBefore,
    editingTextNodeId: null,
    textEditSession: null,
  }
}

function cancelTextEditSessionState(state: EditorState): EditorState {
  const session = state.textEditSession
  if (!session) return state
  return {
    ...state,
    project: textNodeForSession(state.project, session)
      ? projectWithTextSnapshot(state.project, session)
      : state.project,
    dirty: session.dirtyBefore,
    editingTextNodeId: null,
    textEditSession: null,
    statusMessage: '已取消文字编辑',
  }
}

function sameIds(actual: string[], requested: string[]) {
  return (
    actual.length === requested.length &&
    actual.every((id) => requested.includes(id)) &&
    new Set(requested).size === requested.length
  )
}

function rewriteInteractionRuleForSceneCopy(
  rule: InteractionRule,
  nodeIdMap: ReadonlyMap<string, string>,
  sourceSceneId: string,
  targetSceneId: string,
  actionIdMap: ReadonlyMap<string, string>,
): InteractionRule {
  const copy = structuredClone(rule)
  copy.id = `rule_${nanoid()}`
  if ('nodeId' in copy.trigger) {
    copy.trigger.nodeId = nodeIdMap.get(copy.trigger.nodeId) ?? copy.trigger.nodeId
  }
  if (copy.trigger.type === 'animation.completed') {
    copy.trigger.actionId = actionIdMap.get(copy.trigger.actionId) ?? copy.trigger.actionId
  }
  copy.actions = copy.actions.map((step) => {
    const action = step.action
    const id = actionIdMap.get(step.id) ?? `action_${nanoid()}`
    if (action.type === 'scene.go' && action.sceneId === sourceSceneId) {
      return { ...step, id, action: { ...action, sceneId: targetSceneId } }
    }
    if (isVideoInteractionAction(action) || isNodeMotionAction(action)) {
      return {
        ...step,
        id,
        action: {
          ...action,
          nodeId: nodeIdMap.get(action.nodeId) ?? action.nodeId,
        },
      }
    }
    return { ...step, id }
  })
  return copy
}

function rewriteInteractionRuleForNodeCopy(
  rule: InteractionRule,
  nodeIdMap: ReadonlyMap<string, string>,
): InteractionRule {
  const copy = structuredClone(rule)
  copy.id = `rule_${nanoid()}`
  if ('nodeId' in copy.trigger) {
    copy.trigger.nodeId = nodeIdMap.get(copy.trigger.nodeId) ?? copy.trigger.nodeId
  }
  const actionIdMap = new Map(
    copy.actions.map((step) => [step.id, `action_${nanoid()}`]),
  )
  if (copy.trigger.type === 'animation.completed') {
    copy.trigger.actionId = actionIdMap.get(copy.trigger.actionId) ?? copy.trigger.actionId
  }
  copy.actions = copy.actions.map((step) => {
    const action = step.action
    return {
      ...step,
      id: actionIdMap.get(step.id)!,
      action: isVideoInteractionAction(action) || isNodeMotionAction(action)
        ? { ...action, nodeId: nodeIdMap.get(action.nodeId) ?? action.nodeId }
        : action,
    }
  })
  return copy
}

function duplicateInteractionRuleForAuthoring(
  rule: InteractionRule,
): InteractionRule {
  const copy = structuredClone(rule)
  const actionIdMap = new Map(
    copy.actions.map((step) => [step.id, `action_${nanoid()}`]),
  )
  copy.id = `interaction_${nanoid()}`
  copy.name = `${copy.name || '未命名规则'} · 副本`.slice(0, 80)
  if (
    copy.trigger.type === 'animation.completed' &&
    actionIdMap.has(copy.trigger.actionId)
  ) {
    copy.trigger.actionId = actionIdMap.get(copy.trigger.actionId)!
  }
  copy.actions = copy.actions.map((step) => ({
    ...step,
    id: actionIdMap.get(step.id)!,
  }))
  return copy
}

function moveInteractionRuleWithinKind(
  rules: InteractionRule[],
  ruleId: string,
  direction: -1 | 1,
): boolean {
  const index = rules.findIndex((rule) => rule.id === ruleId)
  if (index < 0) return false
  const clickRule = rules[index]!.trigger.type === 'node.click'
  let target = index + direction
  while (
    target >= 0 &&
    target < rules.length &&
    (rules[target]!.trigger.type === 'node.click') !== clickRule
  ) {
    target += direction
  }
  if (target < 0 || target >= rules.length) return false
  const [rule] = rules.splice(index, 1)
  if (!rule) return false
  rules.splice(target, 0, rule)
  return true
}

/**
 * Completion triggers are references, not free-form event names. Structural
 * edits may remove their source motion action, so prune dependants to a fixed
 * point and never leave an unsaveable chain behind.
 */
function withoutDanglingAnimationCompletionRules(
  rules: readonly InteractionRule[],
): InteractionRule[] {
  let retained = [...rules]
  while (true) {
    const motionActionIds = new Set(retained.flatMap((rule) =>
      rule.actions.flatMap((step) => isNodeMotionAction(step.action)
        ? [step.id]
        : []),
    ))
    const next = retained.filter((rule) =>
      rule.trigger.type !== 'animation.completed' ||
      motionActionIds.has(rule.trigger.actionId),
    )
    if (next.length === retained.length) return next
    retained = next
  }
}

function simpleEntranceRuleMatchesState(
  rule: InteractionRule,
  nodeId: string,
  stateId: string | null,
): boolean {
  if (
    !rule.id.startsWith('simple_entrance_') ||
    rule.trigger.type !== 'node.activated' ||
    rule.trigger.nodeId !== nodeId ||
    rule.actions.length !== 1
  ) {
    return false
  }
  const [step] = rule.actions
  if (
    !step ||
    step.start !== 'after-previous' ||
    !isNodeMotionAction(step.action) ||
    step.action.type !== 'node.enter' ||
    step.action.nodeId !== nodeId
  ) {
    return false
  }
  if (rule.conditions.some((condition) => condition.type !== 'presentation.in')) {
    return false
  }
  const presentationConditions = rule.conditions.filter(
    (condition) => condition.type === 'presentation.in',
  )
  if (stateId === null) return presentationConditions.length === 0
  return presentationConditions.length === 1 &&
    presentationConditions[0]!.stateIds.length === 1 &&
    presentationConditions[0]!.stateIds[0] === stateId
}

export function findSimpleEntranceAnimationRule(
  rules: readonly InteractionRule[],
  nodeId: string,
  stateId: string | null,
): InteractionRule | undefined {
  return rules.find((rule) => simpleEntranceRuleMatchesState(
    rule,
    nodeId,
    stateId,
  ))
}

export function hasAdvancedEntranceAnimation(
  rules: readonly InteractionRule[],
  nodeId: string,
  stateId: string | null,
): boolean {
  return rules.some((rule) => (
    rule.actions.some((step) => (
      isNodeMotionAction(step.action) &&
      step.action.type === 'node.enter' &&
      step.action.nodeId === nodeId
    )) &&
    (
      stateId === null ||
      !rule.conditions.some((condition) => condition.type === 'presentation.in') ||
      rule.conditions.some((condition) => (
        condition.type === 'presentation.in' &&
        condition.stateIds.includes(stateId)
      ))
    ) &&
    !simpleEntranceRuleMatchesState(rule, nodeId, stateId)
  ))
}

function entranceRuleAppliesToState(
  rule: InteractionRule,
  nodeId: string,
  stateId: string | null,
): boolean {
  if (!rule.actions.some((step) => (
    isNodeMotionAction(step.action) &&
    step.action.type === 'node.enter' &&
    step.action.nodeId === nodeId
  ))) {
    return false
  }
  const presentationConditions = rule.conditions.filter(
    (condition) => condition.type === 'presentation.in',
  )
  if (stateId === null) return presentationConditions.length === 0
  return presentationConditions.length === 0 ||
    presentationConditions.some((condition) => condition.stateIds.includes(stateId))
}

function simpleEntranceAction(
  nodeId: string,
  config: SimpleEntranceAnimationConfig,
): NodeMotionAction {
  const common = {
    type: 'node.enter' as const,
    nodeId,
    durationMs: Math.min(10_000, Math.max(0, config.durationMs)),
    easing: 'ease-out' as const,
  }
  return config.effect === 'slide'
    ? {
        ...common,
        effect: 'slide',
        direction: config.direction ?? 'left',
      }
    : {
        ...common,
        effect: config.effect,
      }
}

function setSceneNodePlaybackInitialVisibility(
  scene: SceneDocument,
  stateId: string | null,
  nodeId: string,
  playbackInitialVisibility: SceneNode['playbackInitialVisibility'],
): void {
  const baseNode = scene.nodes.find((node) => node.id === nodeId)
  if (!baseNode) return
  if (stateId === null) {
    baseNode.playbackInitialVisibility = playbackInitialVisibility
    return
  }
  const sceneSnapshot = isDraft(scene) ? current(scene) : scene
  const baseNodeSnapshot = sceneSnapshot.nodes.find((node) => node.id === nodeId)
  const effectiveNode = materializeScene(sceneSnapshot, stateId).nodes.find(
    (node) => node.id === nodeId,
  )
  if (!baseNodeSnapshot || !effectiveNode) return
  const nextNode = {
    ...effectiveNode,
    playbackInitialVisibility,
  } as SceneNode
  setPresentationNodeOverride(
    scene,
    stateId,
    nodeId,
    deriveSceneNodeOverride(baseNodeSnapshot, nextNode),
  )
}

function patchSceneNode(node: SceneNode, patch: DeepPartial<SceneNode>): SceneNode {
  const safePatch = { ...patch } as DeepPartial<SceneNode> & {
    id?: unknown
    type?: unknown
  }
  delete safePatch.id
  delete safePatch.type
  const common = { ...node, ...safePatch }
  if (node.type === 'text') {
    const typedPatch = safePatch as DeepPartial<typeof node>
    return {
      ...common,
      type: 'text',
      style: { ...node.style, ...typedPatch.style },
    } as SceneNode
  }
  if (node.type === 'formula') {
    const typedPatch = safePatch as DeepPartial<typeof node>
    return {
      ...common,
      type: 'formula',
      style: { ...node.style, ...typedPatch.style },
    } as SceneNode
  }
  if (node.type === 'shape') {
    const typedPatch = safePatch as DeepPartial<typeof node>
    return {
      ...common,
      type: 'shape',
      style: { ...node.style, ...typedPatch.style },
    } as SceneNode
  }
  if (node.type === 'external-component') {
    const typedPatch = safePatch as DeepPartial<typeof node>
    return {
      ...common,
      type: 'external-component',
      component: { ...node.component, ...typedPatch.component },
      props: { ...node.props, ...typedPatch.props },
    } as SceneNode
  }
  if (node.type === 'image') {
    const typedPatch = safePatch as DeepPartial<typeof node>
    return {
      ...common,
      type: 'image',
      crop: { ...node.crop, ...typedPatch.crop },
      feather: { ...node.feather, ...typedPatch.feather },
    } as SceneNode
  }
  if (node.type === 'video') {
    const typedPatch = safePatch as DeepPartial<typeof node>
    return {
      ...common,
      type: 'video',
      poster: { ...node.poster, ...typedPatch.poster },
    } as SceneNode
  }
  const typedPatch = safePatch as DeepPartial<Extract<SceneNode, { type: 'teacher-controller' }>>
  return {
    ...common,
    type: 'teacher-controller',
    style: { ...node.style, ...typedPatch.style },
    buttons: typedPatch.buttons
      ? typedPatch.buttons.map((button, index) => ({
          ...node.buttons[index],
          ...button,
        })) as typeof node.buttons
      : node.buttons,
  } as SceneNode
}

function hasPatchKey(
  patch: DeepPartial<SceneNode>,
  key: 'width' | 'height',
): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key)
}

function normalizeNodeGeometry(
  previous: SceneNode,
  next: SceneNode,
  patch: DeepPartial<SceneNode>,
  components: Readonly<Record<string, ComponentPackageData>>,
): SceneNode {
  const changedWidth = hasPatchKey(patch, 'width')
  const changedHeight = hasPatchKey(patch, 'height')
  let minimumWidth = MIN_NODE_SIZE
  let minimumHeight = MIN_NODE_SIZE
  let preserveAspectRatio = false

  if (previous.type === 'image') {
    preserveAspectRatio = previous.preserveAspectRatio
  } else if (previous.type === 'video') {
    preserveAspectRatio = true
  } else if (previous.type === 'external-component') {
    const manifest = components[previous.component.packageId]?.manifest
    preserveAspectRatio = manifest?.preserveAspectRatio ?? true
    minimumWidth = manifest?.minSize.width ?? MIN_NODE_SIZE
    minimumHeight = manifest?.minSize.height ?? MIN_NODE_SIZE
  }

  let width = Math.max(minimumWidth, next.width)
  let height = Math.max(minimumHeight, next.height)
  if (preserveAspectRatio && changedWidth !== changedHeight) {
    const ratio = previous.width / previous.height
    if (changedWidth) {
      height = width / ratio
      if (height < minimumHeight) {
        height = minimumHeight
        width = height * ratio
      }
    } else {
      width = height * ratio
      if (width < minimumWidth) {
        width = minimumWidth
        height = width / ratio
      }
    }
  }

  const x = Math.min(
    CANVAS_WIDTH - MIN_VISIBLE_NODE_EDGE,
    Math.max(-width + MIN_VISIBLE_NODE_EDGE, next.x),
  )
  const y = Math.min(
    CANVAS_HEIGHT - MIN_VISIBLE_NODE_EDGE,
    Math.max(-height + MIN_VISIBLE_NODE_EDGE, next.y),
  )
  return { ...next, x, y, width, height }
}

function normalizeNewNodeGeometry(
  node: SceneNode,
  components: Readonly<Record<string, ComponentPackageData>>,
): SceneNode {
  return normalizeNodeGeometry(
    node,
    node,
    {
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
    },
    components,
  )
}

const DEFAULT_INSERTION_COLUMNS = 6
const DEFAULT_INSERTION_OFFSET = 20
export const MAX_BATCH_CANVAS_ITEMS = 12

function offsetDefaultInsertion(
  node: SceneNode,
  existingNodeCount: number,
  hasExplicitPosition: boolean,
): SceneNode {
  if (hasExplicitPosition) return node
  const slot = existingNodeCount % (DEFAULT_INSERTION_COLUMNS * 4)
  return {
    ...node,
    x: node.x + (slot % DEFAULT_INSERTION_COLUMNS) * DEFAULT_INSERTION_OFFSET,
    y: node.y + Math.floor(slot / DEFAULT_INSERTION_COLUMNS) * DEFAULT_INSERTION_OFFSET,
  }
}

/**
 * Produces a deterministic, non-overlapping layout for a small import batch.
 * Every returned node is fully inside the fixed Project V8 canvas.
 */
export function layoutMediaBatchNodes(nodes: SceneNode[]): SceneNode[] {
  if (nodes.length <= 1) return nodes
  const margin = 24
  const gap = 20
  const columns = Math.min(
    4,
    Math.max(1, Math.ceil(Math.sqrt(nodes.length * (CANVAS_WIDTH / CANVAS_HEIGHT)))),
  )
  const rows = Math.ceil(nodes.length / columns)
  const availableWidth = CANVAS_WIDTH - margin * 2 - gap * (columns - 1)
  const availableHeight = CANVAS_HEIGHT - margin * 2 - gap * (rows - 1)
  const cellWidth = availableWidth / columns
  const cellHeight = availableHeight / rows

  return nodes.map((node, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const scale = Math.min(1, cellWidth / node.width, cellHeight / node.height)
    const width = Math.max(MIN_NODE_SIZE, node.width * scale)
    const height = Math.max(MIN_NODE_SIZE, node.height * scale)
    return {
      ...node,
      x: margin + column * (cellWidth + gap) + (cellWidth - width) / 2,
      y: margin + row * (cellHeight + gap) + (cellHeight - height) / 2,
      width,
      height,
    }
  })
}

function componentMeta(
  data: ComponentPackageData,
  authoring?: Pick<
    EmbeddedComponentPackageMeta,
    'editableCopy' | 'sourcePackageId'
  >,
): EmbeddedComponentPackageMeta {
  const base = `components/${data.manifest.id}@${data.manifest.version}`
  return {
    packageId: data.manifest.id,
    version: data.manifest.version,
    name: data.manifest.name,
    manifestPath: `${base}/manifest.json`,
    runtimePath: `${base}/${data.manifest.entry}`,
    contentSha256: data.contentSha256 ?? componentContentSha256(data.files),
    thumbnailPath: data.manifest.thumbnail
      ? `${base}/${data.manifest.thumbnail}`
      : undefined,
    ...(data.provenance === undefined ? {} : data.provenance),
    ...(authoring?.editableCopy ? { editableCopy: true } : {}),
    ...(authoring?.sourcePackageId
      ? { sourcePackageId: authoring.sourcePackageId }
      : {}),
  }
}

export function editableComponentPackageId(
  sourceId: string,
  suffix: string,
): string {
  return `${sourceId}.editable.${suffix.toLowerCase().replace(/[^a-z0-9]/g, 'x')}`
}

function rewriteComponentDefinitionId(
  source: string,
  previousId: string,
  nextId: string,
): string {
  const rewritten = source.replaceAll(previousId, nextId)
  if (rewritten === source) {
    throw new UserFacingError(
      '无法创建可编辑副本',
      '组件运行时中没有找到可安全替换的组件 ID。',
      '该组件可能使用了动态 ID；请由组件作者提供允许编辑的源码版本。',
    )
  }
  return rewritten
}

function componentFilesWithAuthoredCode(
  packageData: ComponentPackageData,
  manifest: ComponentManifest,
  runtimeSource: string,
): Record<string, Uint8Array> {
  const files = Object.fromEntries(
    Object.entries(packageData.files).map(([path, bytes]) => [
      path,
      Uint8Array.from(bytes),
    ]),
  )
  const encoder = new TextEncoder()
  files['manifest.json'] = encoder.encode(JSON.stringify(manifest, null, 2))
  files[manifest.entry] = encoder.encode(runtimeSource)
  return files
}

function assertEditableComponentPackage(
  packageId: string,
  packageData: ComponentPackageData | undefined,
  packageMeta: EmbeddedComponentPackageMeta | undefined,
): asserts packageData is ComponentPackageData {
  if (!packageData || packageMeta?.editableCopy !== true) {
    throw new UserFacingError(
      '组件代码不可修改',
      '第三方组件包默认只读。',
      '请先创建工程内可编辑副本，再修改其 Manifest 或 Runtime。',
    )
  }
}

function validateEditableComponentPackage(
  packageData: ComponentPackageData,
  project: ProjectDocument,
  additionalScopes: ReadonlyArray<'scene' | 'global'> = [],
): void {
  const parsed = componentManifestSchema.safeParse(packageData.manifest)
  if (!parsed.success) {
    throw new UserFacingError(
      '组件 Manifest 校验失败',
      parsed.error.issues[0]?.message ?? 'Manifest 无效。',
      '请修正字段后重试，当前工程未发生变化。',
    )
  }
  validateComponentRuntimeSource(packageData.runtimeSource)
  const id = packageData.manifest.id
  if (
    !packageData.runtimeSource.includes(JSON.stringify(id)) &&
    !packageData.runtimeSource.includes(`'${id}'`) &&
    !packageData.runtimeSource.includes(`\`${id}\``)
  ) {
    throw new UserFacingError(
      '组件 Runtime 校验失败',
      `运行时源码没有登记可编辑副本 ID“${id}”。`,
      '请确保 CoursewareComponent.define 的 id 与 Manifest 完全一致。',
    )
  }
  if (
    !new RegExp(
      `["']?runtimeApiVersion["']?\\s*:\\s*${packageData.manifest.runtimeApiVersion}\\b`,
    ).test(packageData.runtimeSource)
  ) {
    throw new UserFacingError(
      '组件 Runtime 校验失败',
      `运行时源码没有静态登记 API ${packageData.manifest.runtimeApiVersion}。`,
      '请确保 CoursewareComponent.define 的 runtimeApiVersion 与 Manifest 完全一致。',
    )
  }

  // Reuse the same archive/path/entry/thumbnail/asset validation as import.
  const reparsed = parseComponentPackageFiles(packageData.files, {
    expectedId: id,
    expectedVersion: packageData.manifest.version,
  })
  if (reparsed.runtimeSource !== packageData.runtimeSource) {
    throw new UserFacingError(
      '组件 Runtime 校验失败',
      '组件入口文件与当前代码框内容不一致。',
      '请重新应用 Runtime 后再修改 Manifest。',
    )
  }

  const requiredScopes = new Set<'scene' | 'global'>(additionalScopes)
  for (const scene of project.scenes) {
    if (
      scene.nodes.some(
        (node) =>
          node.type === 'external-component' &&
          node.component.packageId === id,
      )
    ) {
      requiredScopes.add('scene')
    }
  }
  if (
    project.globalLayer.some(
      (item) =>
        item.node.type === 'external-component' &&
        item.node.component.packageId === id,
    )
  ) {
    requiredScopes.add('global')
  }
  for (const scope of requiredScopes) {
    if (!componentSupportsScope(packageData.manifest, scope)) {
      throw new UserFacingError(
        '组件作用域校验失败',
        `当前组件仍有${scope === 'scene' ? '场景' : '全局'}实例，但 Manifest 已不支持该作用域。`,
        '请保留现有实例所需作用域，或先删除/替换这些实例。',
      )
    }
  }
}

interface ComponentPackageMutation {
  packageId: string
  next?: ComponentPackageData
}

function applyComponentPackageValue(
  packages: Readonly<Record<string, ComponentPackageData>>,
  packageId: string,
  value: ComponentPackageData | undefined,
): Record<string, ComponentPackageData> {
  const nextPackages = { ...packages }
  if (value) nextPackages[packageId] = value
  else delete nextPackages[packageId]
  return nextPackages
}

function applyComponentPackageHistoryChanges(
  packages: Readonly<Record<string, ComponentPackageData>>,
  changes: ComponentPackageHistoryChange[] | undefined,
  direction: 'undo' | 'redo',
): Record<string, ComponentPackageData> {
  if (!changes?.length) return packages as Record<string, ComponentPackageData>
  return changes.reduce(
    (nextPackages, change) => applyComponentPackageValue(
      nextPackages,
      change.packageId,
      direction === 'undo' ? change.before : change.after,
    ),
    packages as Record<string, ComponentPackageData>,
  )
}

function applyAssetFileHistoryChanges(
  files: Readonly<Record<string, Uint8Array>>,
  changes: AssetFileHistoryChange[] | undefined,
  direction: 'undo' | 'redo',
): Record<string, Uint8Array> {
  if (!changes?.length) return files as Record<string, Uint8Array>
  const nextFiles = { ...files }
  for (const change of changes) {
    const value = direction === 'undo' ? change.before : change.after
    if (value === undefined) delete nextFiles[change.assetId]
    else nextFiles[change.assetId] = value.slice()
  }
  return nextFiles
}

export const useEditorStore = create<EditorState>((set, get) => {
  const initialProject = createProject()

  const commit = (
    recipe: (draft: ProjectDocument) => void,
    selection?: string | null,
    componentPackageMutation?: ComponentPackageMutation | ComponentPackageMutation[],
  ) => {
    set((state) => {
      const prepared = commitTextEditSessionState(state)
      const componentPackageMutations = componentPackageMutation
        ? Array.isArray(componentPackageMutation)
          ? componentPackageMutation
          : [componentPackageMutation]
        : []
      const [nextProject, patches, inversePatches] = produceWithPatches(
        prepared.project,
        (draft) => {
          recipe(draft)
          synchronizeTeacherControllerControls(draft)
        },
      )
      if (nextProject === prepared.project && componentPackageMutations.length === 0) return prepared
      const componentPackageChanges = componentPackageMutations.map((mutation) => ({
        packageId: mutation.packageId,
        before: prepared.componentPackages[mutation.packageId],
        after: mutation.next,
      }))
      return {
        ...prepared,
        project: nextProject,
        componentPackages: componentPackageMutations.reduce(
          (packages, mutation) => applyComponentPackageValue(
            packages,
            mutation.packageId,
            mutation.next,
          ),
          prepared.componentPackages,
        ),
        history: pushHistory(
          prepared.history,
          patches,
          inversePatches,
          componentPackageChanges.length > 0
            ? { componentPackageChanges }
            : {},
        ),
        dirty: true,
        selectedNodeId:
          selection === undefined ? prepared.selectedNodeId : selection,
        selectedNodeIds:
          selection === undefined
            ? prepared.selectedNodeIds
            : selection === null
              ? []
              : [selection],
      }
    })
  }

  const canAddNodes = (count = 1): boolean => {
    const state = get()
    const nodes = editingNodes(state)
    if (count > 0 && nodes.length + count <= MAX_SCENE_NODES) return true
    set({
      errorMessage: state.editingScope === 'global'
        ? `全局层已达到或将超过 ${MAX_SCENE_NODES} 个元素上限。请删除不需要的全局元素后继续。`
        : `当前场景已达到或将超过 ${MAX_SCENE_NODES} 个节点上限。请删除不需要的节点，或新建场景后继续。`,
      statusMessage: null,
    })
    return false
  }

  const canAddNode = (): boolean => canAddNodes(1)

  const appendNodeToEditingScope = (node: SceneNode): void => {
    const state = get()
    const sceneId = state.activeSceneId
    commit((draft) => {
      if (state.editingScope === 'global') {
        draft.globalLayer.push({
          node,
          layer: 'overlay',
          visibility: { mode: 'all', sceneIds: [] },
        })
      } else {
        const scene = draft.scenes.find((scene) => scene.id === sceneId)
        if (scene) {
          appendNodesToScene(
            scene as SceneDocument,
            [node],
            state.activePresentationStateId,
          )
        }
      }
    }, node.id)
  }

  const sameBytes = (left: Uint8Array, right: Uint8Array): boolean => {
    if (left.byteLength !== right.byteLength) return false
    return left.every((value, index) => value === right[index])
  }

  interface AssetFileMutation {
    assetId: string
    after?: Uint8Array
    /** Import rejects an existing different payload; replacement opts in. */
    allowReplace?: boolean
  }

  const commitAssetTransaction = (
    fileMutations: AssetFileMutation[],
    recipe: (draft: ProjectDocument) => void,
    selectedNodeIds: string[] | undefined,
    statusMessage: string,
  ): void => {
    set((state) => {
      const prepared = commitTextEditSessionState(state)
      const nextFiles = { ...prepared.assetFiles }
      const assetFileChanges: AssetFileHistoryChange[] = []
      for (const mutation of fileMutations) {
        const before = prepared.assetFiles[mutation.assetId]
        const after = mutation.after?.slice()
        if (
          before &&
          after &&
          !mutation.allowReplace &&
          !sameBytes(before, after)
        ) {
          throw new UserFacingError(
            '素材导入失败',
            `素材 ID“${mutation.assetId}”已被另一个文件使用。`,
            '请重新选择文件；如问题持续，请重新启动编辑器。',
          )
        }
        const unchanged = before === undefined
          ? after === undefined
          : after !== undefined && sameBytes(before, after)
        if (unchanged) continue
        if (after === undefined) delete nextFiles[mutation.assetId]
        else nextFiles[mutation.assetId] = after
        assetFileChanges.push({
          assetId: mutation.assetId,
          ...(before === undefined ? {} : { before }),
          ...(after === undefined ? {} : { after }),
        })
      }
      const [nextProject, patches, inversePatches] = produceWithPatches(
        prepared.project,
        (draft) => {
          recipe(draft)
          synchronizeTeacherControllerControls(draft)
        },
      )
      if (nextProject === prepared.project && assetFileChanges.length === 0) {
        return prepared
      }
      return {
        ...prepared,
        project: nextProject,
        assetFiles: nextFiles,
        history: pushHistory(prepared.history, patches, inversePatches, {
          assetFileChanges,
        }),
        dirty: true,
        ...(selectedNodeIds === undefined ? {} : {
          selectedNodeIds,
          selectedNodeId: selectedNodeIds.at(-1) ?? null,
        }),
        statusMessage,
      }
    })
  }

  const commitAssetBatch = (
    items: ImportedAssetBatchItem[],
    recipe: (draft: ProjectDocument) => void,
    selectedNodeIds: string[] | undefined,
    statusMessage: string,
  ): void => {
    if (items.length === 0) return
    const uniqueItems = new Map<string, ImportedAssetBatchItem>()
    for (const item of items) {
      const duplicate = uniqueItems.get(item.meta.id)
      if (duplicate && !sameBytes(duplicate.bytes, item.bytes)) {
        throw new UserFacingError(
          '素材导入失败',
          `批次中出现了相同 ID 但内容不同的素材“${item.meta.filename}”。`,
          '请取消导入并重新选择文件。',
        )
      }
      uniqueItems.set(item.meta.id, {
        meta: structuredClone(item.meta),
        bytes: item.bytes.slice(),
      })
    }

    commitAssetTransaction(
      [...uniqueItems.values()].map((item) => ({
        assetId: item.meta.id,
        after: item.bytes,
      })),
      (draft) => {
        for (const item of uniqueItems.values()) {
          if (!draft.assets[item.meta.id]) {
            draft.assets[item.meta.id] = structuredClone(item.meta)
          }
        }
        recipe(draft)
      },
      selectedNodeIds,
      statusMessage,
    )
  }

  return {
    courseSession: null,
    project: initialProject,
    activeSceneId: initialProject.scenes[0].id,
    activePresentationStateId: null,
    editingScope: 'scene',
    canvasMode: 'edit',
    selectedNodeId: null,
    selectedNodeIds: [],
    clipboardNodes: [],
    clipboardGlobalItems: [],
    clipboardInteractionRules: [],
    projectPath: null,
    dirty: false,
    history: emptyHistory(),
    assetFiles: {},
    componentPackages: {},
    editorMode: loadEditorMode(),
    activeTab: 'elements',
    editingTextNodeId: null,
    textEditSession: null,
    statusMessage: '已创建新课件',
    errorMessage: null,

    activateV9SlideFixture() {
      set({
        courseSession: createV9SlideVerticalSliceState(),
        statusMessage: '已启动幻灯片纵切验证',
        errorMessage: null,
      })
    },

    createNewCourseProject() {
      set({
        courseSession: createV9CourseEditorState(),
        statusMessage: '已创建新课件',
        errorMessage: null,
      })
    },

    loadCourseProject(archive, path, options = {}) {
      set({
        courseSession: openV9SlideVerticalSliceState(archive, path, options),
        statusMessage: options.markDirty
          ? '已恢复未保存的课件，请尽快另存为工程文件'
          : `已打开“${archive.project.title}”`,
        errorMessage: null,
      })
    },

    clearCourseProjectSession() {
      set({ courseSession: null })
    },

    selectCourseLayers(input) {
      let accepted = false
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = selectV9SlideVerticalSlice(state.courseSession, input)
        accepted = courseSession !== state.courseSession || (
          !input.additive &&
          input.nodeIds.length === state.courseSession.selection.selectionIds.length &&
          input.nodeIds.every(
            (id, index) => id === state.courseSession!.selection.selectionIds[index],
          )
        ) || (input.additive && input.nodeIds.length === 0)
        return courseSession === state.courseSession ? state : { ...state, courseSession }
      })
      return accepted
    },

    transformCourseLayers(input) {
      let accepted = false
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = transformV9SlideVerticalSlice(state.courseSession, input)
        accepted = courseSession !== state.courseSession
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '已变换图层' }
      })
      return accepted
    },

    nudgeCourseLayers(dx, dy) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = nudgeV9SlideSelection(state.courseSession, dx, dy)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '已微移图层' }
      })
    },

    addCourseTextLayer(x, y) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = addV9SlideTextLayer(state.courseSession, x, y)
        return {
          ...state,
          courseSession,
          activeTab: 'layers',
          statusMessage: '已添加文字',
        }
      })
    },

    addCourseFormulaLayer(x, y) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = addV9SlideFormulaLayer(state.courseSession, x, y)
        return {
          ...state,
          courseSession,
          activeTab: 'layers',
          statusMessage: '已添加公式',
        }
      })
    },

    addCourseShapeLayer(shapeType, x, y) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = addV9SlideShapeLayer(
          state.courseSession,
          shapeType,
          x,
          y,
        )
        return {
          ...state,
          courseSession,
          activeTab: 'layers',
          statusMessage: '已添加图形',
        }
      })
    },

    updateCourseLayer(target, patch) {
      let accepted = false
      set((state) => {
        if (
          state.courseSession === null ||
          !matchesCourseLayerContext(state.courseSession, target)
        ) return state
        accepted = true
        const courseSession = updateV9SlideLayer(
          state.courseSession,
          target.layerItemId,
          patch,
        )
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '元素已更新' }
      })
      return accepted
    },

    updateCourseNativeNode(target, patch) {
      let accepted = false
      set((state) => {
        if (
          state.courseSession === null ||
          !matchesCourseLayerContext(state.courseSession, target) ||
          state.courseSession.selection.selectionIds.length !== 1 ||
          state.courseSession.selection.selectionIds[0] !== target.layerItemId
        ) return state
        accepted = true
        const courseSession = updateV9SlideNativeNode(
          state.courseSession,
          target.layerItemId,
          patch,
        )
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '属性已更新' }
      })
      return accepted
    },

    clearCourseNativeNodeOverride(target) {
      let accepted = false
      set((state) => {
        if (
          state.courseSession === null ||
          !matchesCourseLayerContext(state.courseSession, target) ||
          state.courseSession.selection.selectionIds.length !== 1 ||
          state.courseSession.selection.selectionIds[0] !== target.layerItemId
        ) return state
        accepted = true
        const courseSession = clearV9SlideNativeNodeOverride(
          state.courseSession,
          target.layerItemId,
        )
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '已恢复基础属性' }
      })
      return accepted
    },

    deleteCourseLayer(target) {
      let accepted = false
      set((state) => {
        if (
          state.courseSession === null ||
          !matchesCourseLayerContext(state.courseSession, target)
        ) return state
        accepted = true
        const deletingFromNamedState = state.courseSession.editingScope === 'scene' &&
          state.courseSession.selection.stateId !== null
        const courseSession = deleteV9SlideLayer(
          state.courseSession,
          target.layerItemId,
        )
        return courseSession === state.courseSession
          ? state
          : {
              ...state,
              courseSession,
              statusMessage: deletingFromNamedState
                ? '已在当前状态隐藏，基础元素仍保留'
                : '元素已删除',
            }
      })
      return accepted
    },

    duplicateCourseLayer(target) {
      let accepted = false
      set((state) => {
        if (
          state.courseSession === null ||
          !matchesCourseLayerContext(state.courseSession, target)
        ) return state
        accepted = true
        const courseSession = duplicateV9SlideLayer(
          state.courseSession,
          target.layerItemId,
        )
        return {
          ...state,
          courseSession,
          activeTab: 'layers',
          statusMessage: '元素已复制',
        }
      })
      return accepted
    },

    reorderCourseLayers(target) {
      let accepted = false
      set((state) => {
        if (
          state.courseSession === null ||
          !matchesCourseLayerContext(state.courseSession, target)
        ) return state
        accepted = true
        const courseSession = reorderV9SlideLayers(
          state.courseSession,
          target.layerItemIds,
        )
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '图层顺序已更新' }
      })
      return accepted
    },

    setCourseEditingScope(scope) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = setV9SlideEditingScope(state.courseSession, scope)
        return courseSession === state.courseSession
          ? state
          : {
              ...state,
              courseSession,
              statusMessage: scope === 'global'
                ? '正在编辑全局层'
                : scope === 'surface'
                  ? '正在编辑当前内容共用层'
                  : '正在编辑当前场景',
            }
      })
    },

    activateCourseScene(sceneId) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = activateV9SlideScene(state.courseSession, sceneId)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '已切换场景' }
      })
    },

    addCourseScene() {
      set((state) => {
        if (state.courseSession === null) return state
        return {
          ...state,
          courseSession: addV9SlideScene(state.courseSession),
          statusMessage: '已新建场景',
        }
      })
    },

    renameCourseScene(sceneId, name) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = renameV9SlideScene(state.courseSession, sceneId, name)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '场景已重命名' }
      })
    },

    reorderCourseScenes(sceneIds) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = reorderV9SlideScenes(state.courseSession, sceneIds)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '场景顺序已更新' }
      })
    },

    duplicateCourseScene(sceneId) {
      set((state) => {
        if (state.courseSession === null) return state
        return {
          ...state,
          courseSession: duplicateV9SlideScene(state.courseSession, sceneId),
          statusMessage: '场景已复制',
        }
      })
    },

    deleteCourseScene(sceneId) {
      set((state) => {
        if (state.courseSession === null) return state
        return {
          ...state,
          courseSession: deleteV9SlideScene(state.courseSession, sceneId),
          statusMessage: '场景已删除',
        }
      })
    },

    activateCoursePresentationState(stateId) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = activateV9SlidePresentationState(state.courseSession, stateId)
        return courseSession === state.courseSession
          ? state
          : {
              ...state,
              courseSession,
              statusMessage: stateId === null
                ? '正在编辑场景基础'
                : '已切换命名状态',
            }
      })
    },

    addCoursePresentationState(name) {
      set((state) => {
        if (state.courseSession === null) return state
        return {
          ...state,
          courseSession: addV9SlidePresentationState(state.courseSession, name),
          statusMessage: '已新建命名状态',
        }
      })
    },

    duplicateCoursePresentationState(stateId) {
      set((state) => {
        if (state.courseSession === null) return state
        return {
          ...state,
          courseSession: duplicateV9SlidePresentationState(state.courseSession, stateId),
          statusMessage: '命名状态已复制',
        }
      })
    },

    renameCoursePresentationState(stateId, name) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = renameV9SlidePresentationState(state.courseSession, stateId, name)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '命名状态已重命名' }
      })
    },

    setInitialCoursePresentationState(stateId) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = setInitialV9SlidePresentationState(state.courseSession, stateId)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '已设为运行时初始状态' }
      })
    },

    setThumbnailCoursePresentationState(stateId) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = setThumbnailV9SlidePresentationState(state.courseSession, stateId)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '已设为场景缩略图状态' }
      })
    },

    clearCoursePresentationStateOverrides(stateId) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = clearV9SlidePresentationStateOverrides(state.courseSession, stateId)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '当前状态已恢复为基础场景' }
      })
    },

    deleteCoursePresentationState(stateId) {
      set((state) => {
        if (state.courseSession === null) return state
        return {
          ...state,
          courseSession: deleteV9SlidePresentationState(state.courseSession, stateId),
          statusMessage: '命名状态已删除',
        }
      })
    },

    renameCourseProject(title) {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = renameV9SlideVerticalSlice(state.courseSession, title)
        return courseSession === state.courseSession ? state : { ...state, courseSession }
      })
    },

    undoCourseProject() {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = undoV9SlideVerticalSlice(state.courseSession)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '已撤销' }
      })
    },

    redoCourseProject() {
      set((state) => {
        if (state.courseSession === null) return state
        const courseSession = redoV9SlideVerticalSlice(state.courseSession)
        return courseSession === state.courseSession
          ? state
          : { ...state, courseSession, statusMessage: '已重做' }
      })
    },

    completeCourseProjectSave(sessionId, snapshot, path) {
      let savedCurrentRevision = false
      set((state) => {
        if (state.courseSession === null) {
          throw new Error('当前课件会话已关闭')
        }
        const courseSession = completeV9SlideVerticalSliceSave(
          state.courseSession,
          snapshot,
          path,
          sessionId,
        )
        savedCurrentRevision = !isV9SlideVerticalSliceDirty(courseSession)
        return {
          ...state,
          courseSession,
          statusMessage: savedCurrentRevision
            ? `已保存到 ${path}`
            : '已保存启动保存时的版本；之后的修改尚未保存',
        }
      })
      return savedCurrentRevision
    },

    createNewProject() {
      const project = createProject()
      set({
        courseSession: null,
        project,
        activeSceneId: project.scenes[0].id,
        activePresentationStateId: null,
        editingScope: 'scene',
        canvasMode: 'edit',
        selectedNodeId: null,
        selectedNodeIds: [],
        clipboardNodes: [],
        clipboardGlobalItems: [],
        clipboardInteractionRules: [],
        projectPath: null,
        dirty: false,
        history: emptyHistory(),
        assetFiles: {},
        componentPackages: {},
        editingTextNodeId: null,
        textEditSession: null,
        statusMessage: '已创建新课件',
        errorMessage: null,
      })
    },

    loadProject(project, path, assetFiles = {}, componentPackages = {}) {
      const copy = normalizeProjectPresentations(cloneProject(project))
      set({
        courseSession: null,
        project: copy,
        activeSceneId: copy.scenes[0].id,
        activePresentationStateId: null,
        editingScope: 'scene',
        canvasMode: 'edit',
        selectedNodeId: null,
        selectedNodeIds: [],
        clipboardNodes: [],
        clipboardGlobalItems: [],
        clipboardInteractionRules: [],
        projectPath: path,
        dirty: false,
        history: emptyHistory(),
        assetFiles: Object.fromEntries(
          Object.entries(assetFiles).map(([id, bytes]) => [id, bytes.slice()]),
        ),
        componentPackages,
        editingTextNodeId: null,
        textEditSession: null,
        statusMessage: `已打开“${copy.title}”`,
        errorMessage: null,
      })
    },

    markSaved(path, project) {
      set((state) => ({
        ...commitTextEditSessionState(state),
        ...(project
          ? { project: normalizeProjectPresentations(cloneProject(project)) }
          : {}),
        projectPath: path,
        dirty: false,
        statusMessage: `已保存到 ${path}`,
      }))
    },

    setEditingScope(editingScope) {
      set((state) => {
        if (state.editingScope === editingScope) return state
        return {
          ...commitTextEditSessionState(state),
          editingScope,
          selectedNodeId: null,
          selectedNodeIds: [],
          editingTextNodeId: null,
          textEditSession: null,
          activeTab: 'properties',
          statusMessage: editingScope === 'global'
            ? '正在编辑全局层'
            : `正在编辑“${currentScene(state)?.name ?? '当前场景'}”`,
        }
      })
    },

    setCanvasMode(canvasMode) {
      set((state) => {
        const prepared = commitTextEditSessionState(state)
        const scene = currentScene(prepared)
        const activePresentationStateId =
          canvasMode === 'run' && prepared.activePresentationStateId === null && scene
            ? ensureScenePresentation(scene).initialStateId
            : prepared.activePresentationStateId
        return {
          ...prepared,
          activePresentationStateId,
          canvasMode,
          selectedNodeId: canvasMode === 'run' ? null : prepared.selectedNodeId,
          selectedNodeIds: canvasMode === 'run' ? [] : prepared.selectedNodeIds,
          editingTextNodeId: null,
          textEditSession: null,
          statusMessage: canvasMode === 'run'
            ? '正在运行当前课件；切回编辑可直接修改元素'
            : '已返回状态编辑画布',
        }
      })
    },

    setEditorMode(editorMode) {
      persistEditorMode(editorMode)
      set((state) => {
        const prepared = state.courseSession === null
          ? commitTextEditSessionState(state)
          : state
        return {
          ...prepared,
          editorMode,
          activeTab: editorMode === 'simple' &&
            (state.activeTab === 'components' || state.activeTab === 'automation' || state.activeTab === 'developer')
            ? 'properties'
            : state.activeTab,
          statusMessage: editorMode === 'simple'
            ? '已切换到简洁模式'
            : '已切换到专业模式',
        }
      })
    },

    setActiveTab(activeTab) {
      set((state) => {
        const prepared = state.courseSession === null
          ? commitTextEditSessionState(state)
          : state
        return { ...prepared, activeTab }
      })
    },
    setStatus(statusMessage) {
      set({ statusMessage })
    },
    setError(errorMessage) {
      set({ errorMessage })
    },

    renameProject(title) {
      const normalized = title.trim().slice(0, 80)
      if (!normalized) {
        set({ errorMessage: '课件名称不能为空。' })
        return
      }
      if (normalized === get().project.title) return
      commit((draft) => {
        draft.title = normalized
      })
      set({ statusMessage: `课件已重命名为“${normalized}”` })
    },
    setEditingTextNode(editingTextNodeId) {
      if (editingTextNodeId) get().beginTextEdit(editingTextNodeId, 'canvas')
      else get().commitTextEdit()
    },
    beginTextEdit(nodeId, source = 'canvas') {
      set((state) => {
        if (
          state.textEditSession?.nodeId === nodeId &&
          state.textEditSession.source === source
        ) {
          return state
        }
        const prepared = commitTextEditSessionState(state)
        const scene = currentScene(prepared)
        const node = editingNodes(prepared).find((item) => item.id === nodeId)
        if (!scene || node?.type !== 'text') return prepared
        return {
          ...prepared,
          editingTextNodeId: source === 'canvas' ? nodeId : null,
          textEditSession: {
            scope: prepared.editingScope,
            sceneId: scene.id,
            presentationStateId: prepared.editingScope === 'scene'
              ? prepared.activePresentationStateId
              : null,
            nodeId,
            source,
            original: {
              text: node.text,
              runs: structuredClone(node.runs),
              width: node.width,
              height: node.height,
            },
            dirtyBefore: prepared.dirty,
          },
        }
      })
    },
    updateTextEditDraft(nodeId, text, runs, height, width) {
      set((state) => {
        const session = state.textEditSession
        if (!session || session.nodeId !== nodeId) return state
        const current = textNodeForSession(state.project, session)
        if (!current) return state
        const nextHeight = height === undefined
          ? current.height
          : Math.max(MIN_NODE_SIZE, height)
        const nextWidth = width === undefined
          ? current.width
          : Math.max(MIN_NODE_SIZE, width)
        if (
          current.text === text &&
          current.width === nextWidth &&
          current.height === nextHeight &&
          JSON.stringify(current.runs) === JSON.stringify(runs)
        ) {
          return state
        }
        const project = projectWithTextSnapshot(state.project, session, {
          text,
          runs,
          width: nextWidth,
          height: nextHeight,
        })
        if (project === state.project) return state
        return { ...state, project, dirty: true }
      })
    },
    commitTextEdit() {
      set((state) => commitTextEditSessionState(state))
    },
    cancelTextEdit() {
      set((state) => cancelTextEditSessionState(state))
    },

    addScene() {
      if (get().project.scenes.length >= MAX_PROJECT_SCENES) {
        set({
          errorMessage: `工程已达到 ${MAX_PROJECT_SCENES} 个场景上限。请删除不需要的场景后再试。`,
          statusMessage: null,
        })
        return
      }
      const name = `场景 ${get().project.scenes.length + 1}`
      const scene = createScene(name)
      commit((draft) => {
        draft.scenes.push(scene)
      })
      set({
        activeSceneId: scene.id,
        activePresentationStateId: null,
        editingScope: 'scene',
        selectedNodeId: null,
        selectedNodeIds: [],
        activeTab: 'properties',
        statusMessage: `已新增“${name}”`,
      })
    },

    duplicateScene(sceneId) {
      if (get().project.scenes.length >= MAX_PROJECT_SCENES) {
        set({ errorMessage: `工程已达到 ${MAX_PROJECT_SCENES} 个场景上限。`, statusMessage: null })
        return
      }
      const sourceIndex = get().project.scenes.findIndex((scene) => scene.id === sceneId)
      if (sourceIndex < 0) return
      const source = get().project.scenes[sourceIndex]
      const nodeIdMap = new Map(
        source.nodes.map((node) => [node.id, `${node.type}_${nanoid()}`]),
      )
      const runtime = source.runtime
        ? structuredClone(source.runtime)
        : undefined
      if (runtime?.nodeBindings) {
        runtime.nodeBindings = Object.fromEntries(
          Object.entries(runtime.nodeBindings).map(([key, nodeId]) => [
            key,
            nodeIdMap.get(nodeId) ?? nodeId,
          ]),
        )
      }
      const copySceneId = `scene_${nanoid()}`
      const actionIdMap = new Map(
        source.interactions.flatMap((rule) => rule.actions).map((step) => [
          step.id,
          `action_${nanoid()}`,
        ]),
      )
      const copy: SceneDocument = {
        ...structuredClone(source),
        id: copySceneId,
        name: `${source.name} 副本`,
        ...(runtime ? { runtime } : {}),
        nodes: source.nodes.map((node) => ({
          ...structuredClone(node),
          id: nodeIdMap.get(node.id)!,
        })),
        presentation: rewritePresentationNodeIds(
          ensureScenePresentation(source),
          nodeIdMap,
        ),
        interactions: source.interactions.map((rule) =>
          rewriteInteractionRuleForSceneCopy(
            rule,
            nodeIdMap,
            source.id,
            copySceneId,
            actionIdMap,
          ),
        ),
      }
      commit((draft) => {
        draft.scenes.splice(sourceIndex + 1, 0, copy)
        for (const rule of draft.globalInteractions) {
          for (const condition of rule.conditions) {
            if (
              condition.type === 'scene.in' &&
              condition.sceneIds.includes(source.id) &&
              !condition.sceneIds.includes(copySceneId)
            ) {
              condition.sceneIds.push(copySceneId)
            }
          }
        }
      }, null)
      set({
        activeSceneId: copy.id,
        activePresentationStateId: null,
        editingScope: 'scene',
        statusMessage: `已复制“${source.name}”`,
      })
    },

    deleteScene(sceneId) {
      const state = get()
      if (state.project.scenes.length <= 1) return false
      const index = state.project.scenes.findIndex((scene) => scene.id === sceneId)
      if (index < 0) return false
      const fallback =
        state.project.scenes[index - 1] ?? state.project.scenes[index + 1]
      commit((draft) => {
        draft.scenes = draft.scenes.filter((scene) => scene.id !== sceneId)
        const remainingSceneIds = draft.scenes.map((scene) => scene.id)
        for (const item of draft.globalLayer) {
          item.visibility = normalizedVisibility(
            remainingSceneIds,
            {
              ...item.visibility,
              sceneIds: item.visibility.sceneIds.filter((id) => id !== sceneId),
            },
          )
        }
        for (const remainingScene of draft.scenes) {
          remainingScene.interactions = remainingScene.interactions.filter((rule) =>
            !rule.actions.some(({ action }) =>
              action.type === 'scene.go' && action.sceneId === sceneId,
            ),
          )
          remainingScene.interactions = withoutDanglingAnimationCompletionRules(
            remainingScene.interactions,
          )
        }
        draft.globalInteractions = draft.globalInteractions.filter((rule) => {
          if (rule.actions.some(({ action }) => (
            action.type === 'scene.go' && action.sceneId === sceneId
          ))) return false
          for (const condition of rule.conditions) {
            if (condition.type !== 'scene.in') continue
            condition.sceneIds = condition.sceneIds.filter((id) => id !== sceneId)
            if (condition.sceneIds.length === 0) return false
          }
          return true
        })
        draft.globalInteractions = withoutDanglingAnimationCompletionRules(
          draft.globalInteractions,
        )
        for (const item of draft.globalLayer) {
          if (item.node.type !== 'teacher-controller') continue
          item.node.buttons = item.node.buttons.filter((button) => !(
            button.action.type === 'scene.go' && button.action.sceneId === sceneId
          ))
          if (item.node.buttons.length === 0) {
            item.node.buttons.push({
              id: `teacher_button_${nanoid()}`,
              label: '下一场景',
              visible: true,
              action: { type: 'scene.next' },
            })
          }
        }
      }, null)
      if (state.activeSceneId === sceneId) {
        set({
          activeSceneId: fallback.id,
          activePresentationStateId: null,
        })
      }
      set({ statusMessage: '场景已删除' })
      return true
    },

    reorderScenes(sceneIds) {
      const scenes = get().project.scenes
      if (!sameIds(scenes.map((scene) => scene.id), sceneIds)) return
      const byId = new Map(scenes.map((scene) => [scene.id, scene]))
      const reordered = sceneIds.map((id) => structuredClone(byId.get(id)!))
      commit((draft) => {
        draft.scenes = reordered
      })
    },

    updateScene(sceneId, patch) {
      const activeStateId = get().activeSceneId === sceneId && get().editingScope === 'scene'
        ? get().activePresentationStateId
        : null
      commit((draft) => {
        const scene = draft.scenes.find((item) => item.id === sceneId)
        if (!scene) return
        if (patch.name !== undefined && patch.name.trim()) {
          scene.name = patch.name.trim()
        }
        if (patch.backgroundColor !== undefined) {
          if (activeStateId === null) {
            scene.backgroundColor = patch.backgroundColor
          } else {
            const state = mutablePresentationState(
              scene as SceneDocument,
              activeStateId,
            )
            if (state) {
              state.backgroundColor = patch.backgroundColor === scene.backgroundColor
                ? undefined
                : patch.backgroundColor
            }
          }
        }
        if (patch.backgroundAssetId !== undefined) {
          if (activeStateId === null) {
            scene.backgroundAssetId = patch.backgroundAssetId
          } else {
            const state = mutablePresentationState(
              scene as SceneDocument,
              activeStateId,
            )
            if (state) {
              state.backgroundAssetId = patch.backgroundAssetId === scene.backgroundAssetId
                ? undefined
                : patch.backgroundAssetId
            }
          }
        }
      })
    },

    updateSceneRuntime(sceneId, patch) {
      const safePatch = editableRuntimePatch(patch)
      commit((draft) => {
        const runtime = draft.scenes.find((scene) => scene.id === sceneId)?.runtime
        if (!runtime) return
        Object.assign(runtime, safePatch)
      })
    },

    updateGlobalRuntime(patch) {
      const safePatch = editableRuntimePatch(patch)
      commit((draft) => {
        if (!draft.globalRuntime) return
        Object.assign(draft.globalRuntime, safePatch)
      })
    },

    setSceneRuntime(sceneId, runtime) {
      commit((draft) => {
        const scene = draft.scenes.find((item) => item.id === sceneId)
        if (!scene) return
        if (runtime) scene.runtime = structuredClone(runtime)
        else delete scene.runtime
      })
      set({
        statusMessage: runtime ? '已创建场景运行时模板' : '已移除场景运行时',
      })
    },

    setGlobalRuntime(runtime) {
      commit((draft) => {
        if (runtime) draft.globalRuntime = structuredClone(runtime)
        else delete draft.globalRuntime
      })
      set({
        statusMessage: runtime ? '已创建全局运行时模板' : '已移除全局运行时',
      })
    },

    setActiveScene(activeSceneId) {
      const target = get().project.scenes.find((scene) => scene.id === activeSceneId)
      if (!target) return
      set((state) => ({
        ...commitTextEditSessionState(state),
        activeSceneId,
        activePresentationStateId: null,
        editingScope: 'scene',
        selectedNodeId: null,
        selectedNodeIds: [],
        editingTextNodeId: null,
        textEditSession: null,
        statusMessage: null,
      }))
    },

    setActivePresentationState(activePresentationStateId) {
      const scene = currentScene(get())
      if (!scene || (
        activePresentationStateId !== null &&
        !ensureScenePresentation(scene).states.some(
          (state) => state.id === activePresentationStateId,
        )
      )) return
      set((state) => ({
        ...commitTextEditSessionState(state),
        activePresentationStateId,
        editingScope: 'scene',
        canvasMode: activePresentationStateId === null ? 'edit' : state.canvasMode,
        selectedNodeId: null,
        selectedNodeIds: [],
        editingTextNodeId: null,
        textEditSession: null,
        statusMessage: activePresentationStateId === null
          ? '正在编辑场景基础（会影响所有状态）'
          : `正在编辑状态“${findPresentationState(scene, activePresentationStateId)?.name ?? activePresentationStateId}”`,
      }))
    },

    addPresentationState(name) {
      const state = get()
      const scene = currentScene(state)
      if (!scene) return
      if (ensureScenePresentation(scene).states.length >= MAX_SCENE_PRESENTATION_STATES) {
        set({ errorMessage: `当前场景已达到 ${MAX_SCENE_PRESENTATION_STATES} 个状态上限。` })
        return
      }
      const stateId = `state_${nanoid()}`
      const nextName = name?.trim() || `状态 ${ensureScenePresentation(scene).states.length + 1}`
      commit((draft) => {
        const draftScene = draft.scenes.find((item) => item.id === scene.id)
        if (!draftScene) return
        mutablePresentation(draftScene as SceneDocument).states.push({
          id: stateId,
          name: nextName,
          nodeOverrides: {},
        })
      }, null)
      set({
        activePresentationStateId: stateId,
        editingScope: 'scene',
        canvasMode: 'edit',
        statusMessage: `已新增状态“${nextName}”`,
      })
    },

    duplicatePresentationState(stateId) {
      const scene = currentScene(get())
      const source = scene && findPresentationState(scene, stateId)
      if (!scene || !source) return
      if (ensureScenePresentation(scene).states.length >= MAX_SCENE_PRESENTATION_STATES) {
        set({ errorMessage: `当前场景已达到 ${MAX_SCENE_PRESENTATION_STATES} 个状态上限。` })
        return
      }
      const copyId = `state_${nanoid()}`
      const copyName = `${source.name} 副本`
      commit((draft) => {
        const draftScene = draft.scenes.find((item) => item.id === scene.id)
        if (!draftScene) return
        const presentation = mutablePresentation(draftScene as SceneDocument)
        const index = presentation.states.findIndex((item) => item.id === stateId)
        presentation.states.splice(index + 1, 0, {
          ...structuredClone(source),
          id: copyId,
          name: copyName,
        })
      }, null)
      set({
        activePresentationStateId: copyId,
        editingScope: 'scene',
        canvasMode: 'edit',
        statusMessage: `已复制状态“${source.name}”`,
      })
    },

    renamePresentationState(stateId, name) {
      const nextName = name.trim()
      if (!nextName) return
      get().updatePresentationState(stateId, { name: nextName })
    },

    deletePresentationState(stateId) {
      const scene = currentScene(get())
      const presentation = scene && ensureScenePresentation(scene)
      if (!scene || !presentation || presentation.states.length <= 1) return false
      if (!presentation.states.some((state) => state.id === stateId)) return false
      const fallback = presentation.states.find((state) => state.id !== stateId)!
      const fallbackId = presentation.initialStateId === stateId
        ? fallback.id
        : presentation.initialStateId
      commit((draft) => {
        const draftScene = draft.scenes.find((item) => item.id === scene.id)
        if (!draftScene) return
        const draftPresentation = mutablePresentation(draftScene as SceneDocument)
        draftPresentation.states = draftPresentation.states.filter(
          (state) => state.id !== stateId,
        )
        if (draftPresentation.initialStateId === stateId) {
          draftPresentation.initialStateId = fallback.id
        }
        if (draftPresentation.thumbnailStateId === stateId) {
          draftPresentation.thumbnailStateId = draftPresentation.initialStateId
        }
        draftScene.interactions = draftScene.interactions.filter((rule) => {
          if (rule.trigger.type === 'presentation.enter' && rule.trigger.stateId === stateId) return false
          if (rule.conditions.some((condition) =>
            condition.type === 'presentation.in' && condition.stateIds.includes(stateId),
          )) return false
          return !rule.actions.some(({ action }) =>
            action.type === 'presentation.set' && action.stateId === stateId,
          )
        })
        draftScene.interactions = withoutDanglingAnimationCompletionRules(
          draftScene.interactions,
        )
        // Cross-scene entry rules remain useful after the state is removed.
        // Drop only the stale optional state target so they safely enter the
        // destination scene's (possibly newly selected) initial state.
        for (const projectScene of draft.scenes) {
          for (const rule of projectScene.interactions) {
            for (const step of rule.actions) {
              const action = step.action
              if (
                action.type === 'scene.go' &&
                action.sceneId === scene.id &&
                action.targetStateId === stateId
              ) {
                delete action.targetStateId
              }
            }
          }
        }
        for (const rule of draft.globalInteractions) {
          for (const step of rule.actions) {
            const action = step.action
            if (
              action.type === 'scene.go' &&
              action.sceneId === scene.id &&
              action.targetStateId === stateId
            ) {
              delete action.targetStateId
            }
          }
        }
        for (const item of draft.globalLayer) {
          if (item.node.type !== 'teacher-controller') continue
          item.node.buttons = item.node.buttons.map((button) => {
            if (
              button.action.type !== 'scene.go' ||
              button.action.sceneId !== scene.id ||
              button.action.targetStateId !== stateId
            ) return button
            const { targetStateId: _removed, ...action } = button.action
            return { ...button, action }
          })
        }
      }, null)
      if (get().activePresentationStateId === stateId) {
        set({ activePresentationStateId: fallbackId })
      }
      set({ statusMessage: '状态已删除' })
      return true
    },

    setInitialPresentationState(stateId) {
      const scene = currentScene(get())
      if (!scene || !findPresentationState(scene, stateId)) return
      commit((draft) => {
        const target = draft.scenes.find((item) => item.id === scene.id)
        if (target) mutablePresentation(target as SceneDocument).initialStateId = stateId
      })
      set({ statusMessage: '已设为运行时初始状态' })
    },

    setThumbnailPresentationState(stateId) {
      const scene = currentScene(get())
      if (!scene || !findPresentationState(scene, stateId)) return
      commit((draft) => {
        const target = draft.scenes.find((item) => item.id === scene.id)
        if (target) mutablePresentation(target as SceneDocument).thumbnailStateId = stateId
      })
      set({ statusMessage: '已设为场景缩略图状态' })
    },

    updatePresentationState(stateId, patch) {
      const scene = currentScene(get())
      if (!scene || !findPresentationState(scene, stateId)) return
      commit((draft) => {
        const target = draft.scenes.find((item) => item.id === scene.id)
        const state = target && mutablePresentationState(
          target as SceneDocument,
          stateId,
        )
        if (!state) return
        if (patch.name !== undefined && patch.name.trim()) state.name = patch.name.trim()
        if (patch.description !== undefined) {
          state.description = patch.description.trim() || undefined
        }
        if (patch.backgroundColor !== undefined) {
          state.backgroundColor = patch.backgroundColor === target.backgroundColor
            ? undefined
            : patch.backgroundColor
        }
        if (patch.backgroundAssetId !== undefined) {
          state.backgroundAssetId = patch.backgroundAssetId === target.backgroundAssetId
            ? undefined
            : patch.backgroundAssetId
        }
      })
    },

    clearNodePresentationOverride(nodeId) {
      const state = get()
      const scene = currentScene(state)
      const stateId = state.activePresentationStateId
      if (!scene || stateId === null || !isNodeOverriddenInState(scene, stateId, nodeId)) return
      commit((draft) => {
        const target = draft.scenes.find((item) => item.id === scene.id)
        if (target) setPresentationNodeOverride(target as SceneDocument, stateId, nodeId, undefined)
      })
      set({ statusMessage: '已恢复此元素在当前状态中的基础值' })
    },

    clearPresentationStateOverrides(stateId) {
      const scene = currentScene(get())
      if (!scene || !findPresentationState(scene, stateId)) return
      commit((draft) => {
        const target = draft.scenes.find((item) => item.id === scene.id)
        const state = target && mutablePresentationState(target as SceneDocument, stateId)
        if (!state) return
        state.nodeOverrides = {}
        state.nodeOrder = undefined
        state.backgroundColor = undefined
        state.backgroundAssetId = undefined
      }, null)
      set({ statusMessage: '当前状态已恢复为基础场景' })
    },

    addTextNode(x, y) {
      if (!canAddNode()) return
      const state = get()
      const node = normalizeNewNodeGeometry(
        offsetDefaultInsertion(
          createTextNode(x, y),
          editingNodes(state).length,
          x !== undefined || y !== undefined,
        ),
        state.componentPackages,
      )
      appendNodeToEditingScope(node)
      set({
        statusMessage: get().editingScope === 'global'
          ? '已添加全局文本'
          : '已添加文本',
      })
    },

    addFormulaNode(x, y) {
      if (!canAddNode()) return
      const state = get()
      const node = normalizeNewNodeGeometry(
        offsetDefaultInsertion(
          createFormulaNode(x, y),
          editingNodes(state).length,
          x !== undefined || y !== undefined,
        ),
        state.componentPackages,
      )
      appendNodeToEditingScope(node)
      set({
        statusMessage: get().editingScope === 'global'
          ? '已添加全局公式'
          : '已添加公式',
      })
    },

    addRectangleNode(x, y) {
      if (!canAddNode()) return
      const state = get()
      const node = normalizeNewNodeGeometry(
        offsetDefaultInsertion(
          createRectangleNode(x, y),
          editingNodes(state).length,
          x !== undefined || y !== undefined,
        ),
        state.componentPackages,
      )
      appendNodeToEditingScope(node)
      set({
        statusMessage: get().editingScope === 'global'
          ? '已添加全局矩形'
          : '已添加矩形',
      })
    },

    addShapeNode(shapeType, x, y) {
      if (!canAddNode()) return
      const state = get()
      const node = normalizeNewNodeGeometry(
        offsetDefaultInsertion(
          createShapeNode(shapeType, { x, y }),
          editingNodes(state).length,
          x !== undefined || y !== undefined,
        ),
        state.componentPackages,
      )
      appendNodeToEditingScope(node)
      set({
        statusMessage: get().editingScope === 'global'
          ? `已添加全局“${node.name}”`
          : `已添加“${node.name}”`,
      })
    },

    addImageNode(asset, bytes, x, y) {
      if (!canAddNode()) return
      const initialState = get()
      const node = normalizeNewNodeGeometry(
        offsetDefaultInsertion(
          createImageNode(asset.id, asset.width, asset.height, x, y),
          editingNodes(initialState).length,
          x !== undefined || y !== undefined,
        ),
        initialState.componentPackages,
      )
      const sceneId = initialState.activeSceneId
      commitAssetBatch([{ meta: asset, bytes }], (draft) => {
        if (initialState.editingScope === 'global') {
          draft.globalLayer.push({
            node,
            layer: 'overlay',
            visibility: { mode: 'all', sceneIds: [] },
          })
        } else {
          const scene = draft.scenes.find((item) => item.id === sceneId)
          if (scene) appendNodesToScene(
            scene as SceneDocument,
            [node],
            initialState.activePresentationStateId,
          )
        }
      }, [node.id], initialState.editingScope === 'global'
        ? '图片已添加到全局层'
        : '图片已添加到画布')
    },

    addVideoNode(asset, bytes, x, y) {
      if (!canAddNode()) return
      const initialState = get()
      const node = normalizeNewNodeGeometry(
        offsetDefaultInsertion(
          createVideoNode({
            assetId: asset.id,
            width: asset.width ?? 640,
            height: asset.height ?? 360,
            x,
            y,
          }),
          editingNodes(initialState).length,
          x !== undefined || y !== undefined,
        ),
        initialState.componentPackages,
      )
      const sceneId = initialState.activeSceneId
      commitAssetBatch([{ meta: asset, bytes }], (draft) => {
        if (initialState.editingScope === 'global') {
          draft.globalLayer.push({
            node,
            layer: 'overlay',
            visibility: { mode: 'all', sceneIds: [] },
          })
        } else {
          const scene = draft.scenes.find((item) => item.id === sceneId)
          if (scene) appendNodesToScene(
            scene as SceneDocument,
            [node],
            initialState.activePresentationStateId,
          )
        }
      }, [node.id], initialState.editingScope === 'global'
        ? '视频已添加到全局层'
        : '视频已添加到画布')
    },

    addImageNodes(items, position) {
      if (items.length === 0 || !canAddNodes(items.length)) return []
      if (items.length > MAX_BATCH_CANVAS_ITEMS) {
        set({
          errorMessage: `一次最多在画布排放 ${MAX_BATCH_CANVAS_ITEMS} 张图片。请先批量加入媒体库，再按需放置。`,
          statusMessage: null,
        })
        return []
      }
      const state = get()
      let nodes = items.map(({ meta }) => createImageNode(
        meta.id,
        meta.width,
        meta.height,
        items.length === 1 ? position?.x : undefined,
        items.length === 1 ? position?.y : undefined,
      ))
      nodes = layoutMediaBatchNodes(nodes).map((node) =>
        normalizeNewNodeGeometry(node, state.componentPackages),
      ) as typeof nodes
      const sceneId = state.activeSceneId
      commitAssetBatch(items, (draft) => {
        if (state.editingScope === 'global') {
          draft.globalLayer.push(...nodes.map((node) => ({
            node,
            layer: 'overlay' as const,
            visibility: { mode: 'all' as const, sceneIds: [] },
          })))
        } else {
          const scene = draft.scenes.find((item) => item.id === sceneId)
          if (scene) {
            appendNodesToScene(
              scene as SceneDocument,
              nodes,
              state.activePresentationStateId,
            )
          }
        }
      }, nodes.map((node) => node.id), `已批量添加 ${nodes.length} 张图片`)
      return nodes.map((node) => node.id)
    },

    addVideoNodes(items, position) {
      if (items.length === 0 || !canAddNodes(items.length)) return []
      if (items.length > MAX_BATCH_CANVAS_ITEMS) {
        set({
          errorMessage: `一次最多在画布排放 ${MAX_BATCH_CANVAS_ITEMS} 个视频。请先批量加入媒体库，再按需放置。`,
          statusMessage: null,
        })
        return []
      }
      const state = get()
      let nodes = items.map(({ meta }) => createVideoNode({
        assetId: meta.id,
        width: meta.width ?? 640,
        height: meta.height ?? 360,
        x: items.length === 1 ? position?.x : undefined,
        y: items.length === 1 ? position?.y : undefined,
      }))
      nodes = layoutMediaBatchNodes(nodes).map((node) =>
        normalizeNewNodeGeometry(node, state.componentPackages),
      ) as typeof nodes
      const sceneId = state.activeSceneId
      commitAssetBatch(items, (draft) => {
        if (state.editingScope === 'global') {
          draft.globalLayer.push(...nodes.map((node) => ({
            node,
            layer: 'overlay' as const,
            visibility: { mode: 'all' as const, sceneIds: [] },
          })))
        } else {
          const scene = draft.scenes.find((item) => item.id === sceneId)
          if (scene) {
            appendNodesToScene(
              scene as SceneDocument,
              nodes,
              state.activePresentationStateId,
            )
          }
        }
      }, nodes.map((node) => node.id), `已批量添加 ${nodes.length} 个视频`)
      return nodes.map((node) => node.id)
    },

    importAsset(asset, bytes) {
      commitAssetBatch(
        [{ meta: asset, bytes }],
        () => undefined,
        undefined,
        `已导入素材“${asset.filename}”`,
      )
      set({ activeTab: 'elements' })
    },

    importAssets(items) {
      if (items.length === 0) return
      commitAssetBatch(items, () => undefined, [], `已批量导入 ${items.length} 个媒体素材`)
    },

    replaceImageAsset(nodeId, asset, bytes) {
      const state = get()
      const effective = editingNodes(state).find(
        (node) => node.id === nodeId && node.type === 'image',
      )
      if (!effective || effective.type !== 'image') return
      const sceneId = state.activeSceneId
      const nextNode = { ...effective, assetId: asset.id }
      commitAssetTransaction(
        [{ assetId: asset.id, after: bytes, allowReplace: true }],
        (draft) => {
          draft.assets[asset.id] = structuredClone(asset)
          if (state.editingScope === 'global') {
            const item = draft.globalLayer.find(({ node }) => node.id === nodeId)
            if (item?.node.type === 'image') item.node.assetId = asset.id
            return
          }
          const scene = draft.scenes.find((item) => item.id === sceneId)
          if (!scene) return
          if (state.activePresentationStateId === null) {
            const node = scene.nodes.find((item) => item.id === nodeId)
            if (node?.type === 'image') node.assetId = asset.id
            return
          }
          const baseNode = scene.nodes.find((item) => item.id === nodeId)
          if (!baseNode) return
          setPresentationNodeOverride(
            scene as SceneDocument,
            state.activePresentationStateId,
            nodeId,
            deriveSceneNodeOverride(baseNode, nextNode),
          )
        },
        undefined,
        '图片已替换',
      )
    },

    importSound(asset, bytes, sound = {}) {
      const soundId = `sound_${nanoid()}`
      const definition: SoundDefinition = {
        id: soundId,
        name: sound.name?.trim() || asset.filename.replace(/\.[^.]+$/, ''),
        assetId: asset.id,
        channel: sound.channel ?? 'sfx',
        defaultVolume: sound.defaultVolume ?? 1,
        defaultLoop: sound.defaultLoop ?? false,
      }
      commitAssetBatch([{ meta: asset, bytes }], (draft) => {
        draft.media.audio.sounds[soundId] = definition
      }, undefined, `已导入声音“${definition.name}”`)
      set({ activeTab: 'elements' })
      return soundId
    },

    importSounds(items) {
      if (items.length === 0) return []
      const definitions = items.map(({ meta }) => ({
        id: `sound_${nanoid()}`,
        name: meta.filename.replace(/\.[^.]+$/, ''),
        assetId: meta.id,
        channel: 'sfx' as const,
        defaultVolume: 1,
        defaultLoop: false,
      }))
      commitAssetBatch(items, (draft) => {
        for (const definition of definitions) {
          draft.media.audio.sounds[definition.id] = definition
        }
      }, [], `已批量导入 ${definitions.length} 个声音`)
      return definitions.map((definition) => definition.id)
    },

    updateAudioSettings(patch) {
      commit((draft) => {
        const audio = draft.media.audio
        if (patch.defaultMuted !== undefined) {
          audio.defaultMuted = patch.defaultMuted
        }
        if (patch.masterVolume !== undefined) {
          audio.masterVolume = clampAudioVolume(
            patch.masterVolume,
            audio.masterVolume,
          )
        }
        if (patch.channelVolumes) {
          for (const channel of PROJECT_AUDIO_CHANNELS) {
            const value = patch.channelVolumes[channel]
            if (value !== undefined) {
              audio.channelVolumes[channel] = clampAudioVolume(
                value,
                audio.channelVolumes[channel],
              )
            }
          }
        }
        if (patch.narrationDucking?.enabled !== undefined) {
          audio.narrationDucking.enabled = patch.narrationDucking.enabled
        }
        if (patch.narrationDucking?.musicVolume !== undefined) {
          audio.narrationDucking.musicVolume = clampAudioVolume(
            patch.narrationDucking.musicVolume,
            audio.narrationDucking.musicVolume,
          )
        }
        if (
          patch.narrationDucking?.fadeMs !== undefined &&
          Number.isFinite(patch.narrationDucking.fadeMs)
        ) {
          audio.narrationDucking.fadeMs = Math.max(
            0,
            Math.round(patch.narrationDucking.fadeMs),
          )
        }
      })
      set({ statusMessage: '全局声音设置已更新' })
    },

    updateSound(soundId, patch) {
      commit((draft) => {
        const sound = draft.media.audio.sounds[soundId]
        if (!sound) return
        if (patch.name !== undefined && patch.name.trim()) sound.name = patch.name.trim()
        if (patch.assetId !== undefined) sound.assetId = patch.assetId
        if (patch.channel !== undefined) sound.channel = patch.channel
        if (patch.defaultVolume !== undefined) {
          sound.defaultVolume = Math.max(0, Math.min(1, patch.defaultVolume))
        }
        if (patch.defaultLoop !== undefined) sound.defaultLoop = patch.defaultLoop
      })
      set({ statusMessage: '声音设置已更新' })
    },

    deleteSound(soundId) {
      const state = get()
      const referenced = state.project.scenes.some((scene) =>
        scene.interactions.some((rule) =>
          rule.trigger.type === 'audio.ended' && rule.trigger.soundId === soundId ||
          rule.actions.some(({ action }) =>
            action.type === 'audio.play' && action.soundId === soundId ||
            ('target' in action && action.type.startsWith('audio.') &&
              action.target.kind === 'sound' && action.target.soundId === soundId),
          ),
        ),
      )
      if (referenced) {
        set({
          errorMessage: '该声音仍被交互规则引用。请先删除或改写相关声音动作。',
          statusMessage: null,
        })
        return false
      }
      const sound = state.project.media.audio.sounds[soundId]
      if (!sound) return false
      commit((draft) => {
        delete draft.media.audio.sounds[soundId]
      })
      set({ statusMessage: `已删除声音“${sound.name}”` })
      return true
    },

    deleteAsset(assetId) {
      const state = get()
      const references = analyzeProjectAssetReferences(state.project, {
        componentPackages: state.componentPackages,
      }).graph.get(assetId) ?? []
      if (references.length > 0) {
        const locations = references
          .slice(0, 3)
          .map(describeProjectAssetReference)
          .join('；')
        set({
          errorMessage: `该素材仍被引用，不能删除：${locations}${references.length > 3 ? `；另有 ${references.length - 3} 处` : ''}。`,
          statusMessage: null,
        })
        return false
      }
      if (!state.project.assets[assetId]) return false
      commitAssetTransaction(
        [{ assetId }],
        (draft) => { delete draft.assets[assetId] },
        undefined,
        '未使用素材已删除',
      )
      return true
    },

    addInteractionRule(sceneId, rule) {
      commit((draft) => {
        const scene = draft.scenes.find((item) => item.id === sceneId)
        if (!scene || scene.interactions.some((item) => item.id === rule.id)) return
        scene.interactions.push(structuredClone(rule))
      })
      set({ statusMessage: '交互映射已添加' })
    },

    updateInteractionRule(sceneId, ruleId, rule) {
      commit((draft) => {
        const scene = draft.scenes.find((item) => item.id === sceneId)
        const index = scene?.interactions.findIndex((item) => item.id === ruleId) ?? -1
        if (!scene || index < 0) return
        scene.interactions[index] = structuredClone({ ...rule, id: ruleId })
        scene.interactions = withoutDanglingAnimationCompletionRules(scene.interactions)
      })
      set({ statusMessage: '交互映射已更新' })
    },

    deleteInteractionRule(sceneId, ruleId) {
      commit((draft) => {
        const scene = draft.scenes.find((item) => item.id === sceneId)
        if (scene) {
          scene.interactions = withoutDanglingAnimationCompletionRules(
            scene.interactions.filter((item) => item.id !== ruleId),
          )
        }
      })
      set({ statusMessage: '交互映射已删除' })
    },

    duplicateInteractionRule(sceneId, ruleId) {
      const source = get().project.scenes
        .find((scene) => scene.id === sceneId)
        ?.interactions.find((rule) => rule.id === ruleId)
      if (!source) return null
      const copy = duplicateInteractionRuleForAuthoring(source)
      commit((draft) => {
        const scene = draft.scenes.find((item) => item.id === sceneId)
        const index = scene?.interactions.findIndex((rule) => rule.id === ruleId) ?? -1
        if (!scene || index < 0) return
        scene.interactions.splice(index + 1, 0, structuredClone(copy))
      })
      set({ statusMessage: '规则副本已创建' })
      return copy.id
    },

    moveInteractionRule(sceneId, ruleId, direction) {
      commit((draft) => {
        const rules = draft.scenes.find((scene) => scene.id === sceneId)
          ?.interactions
        if (rules) moveInteractionRuleWithinKind(rules, ruleId, direction)
      })
      set({ statusMessage: direction < 0 ? '规则已上移' : '规则已下移' })
    },

    addGlobalInteractionRule(rule) {
      commit((draft) => {
        if (draft.globalInteractions.some((item) => item.id === rule.id)) return
        draft.globalInteractions.push(structuredClone(rule))
      })
      set({ statusMessage: '全局交互映射已添加' })
    },

    updateGlobalInteractionRule(ruleId, rule) {
      commit((draft) => {
        const index = draft.globalInteractions.findIndex((item) => item.id === ruleId)
        if (index < 0) return
        draft.globalInteractions[index] = structuredClone({ ...rule, id: ruleId })
        draft.globalInteractions = withoutDanglingAnimationCompletionRules(
          draft.globalInteractions,
        )
      })
      set({ statusMessage: '全局交互映射已更新' })
    },

    deleteGlobalInteractionRule(ruleId) {
      commit((draft) => {
        draft.globalInteractions = withoutDanglingAnimationCompletionRules(
          draft.globalInteractions.filter((item) => item.id !== ruleId),
        )
      })
      set({ statusMessage: '全局交互映射已删除' })
    },

    duplicateGlobalInteractionRule(ruleId) {
      const source = get().project.globalInteractions.find(
        (rule) => rule.id === ruleId,
      )
      if (!source) return null
      const copy = duplicateInteractionRuleForAuthoring(source)
      commit((draft) => {
        const index = draft.globalInteractions.findIndex(
          (rule) => rule.id === ruleId,
        )
        if (index >= 0) {
          draft.globalInteractions.splice(index + 1, 0, structuredClone(copy))
        }
      })
      set({ statusMessage: '全局规则副本已创建' })
      return copy.id
    },

    moveGlobalInteractionRule(ruleId, direction) {
      commit((draft) => {
        moveInteractionRuleWithinKind(
          draft.globalInteractions,
          ruleId,
          direction,
        )
      })
      set({ statusMessage: direction < 0 ? '全局规则已上移' : '全局规则已下移' })
    },

    setSimpleEntranceAnimation(nodeId, config) {
      const state = get()
      if (state.editingScope !== 'scene') {
        set({
          errorMessage: '全局元素的动画作用域较复杂，请在专业模式的规则面板中配置。',
          statusMessage: null,
        })
        return
      }
      const scene = currentScene(state)
      if (!scene) return
      const stateId = state.activePresentationStateId
      const existingRule = findSimpleEntranceAnimationRule(
        scene.interactions,
        nodeId,
        stateId,
      )
      if (
        config &&
        hasAdvancedEntranceAnimation(scene.interactions, nodeId, stateId)
      ) {
        set({
          errorMessage: '该元素已有专业动画规则。请切换到专业模式编辑，避免重复播放。',
          statusMessage: null,
        })
        return
      }
      const effectiveNode = editingNodes(state).find((node) => node.id === nodeId)
      if (!effectiveNode || (!config && !existingRule)) return

      commit((draft) => {
        const draftScene = draft.scenes.find((item) => item.id === scene.id)
        if (!draftScene) return
        const rules = draftScene.interactions
        const ruleIndex = existingRule
          ? rules.findIndex((rule) => rule.id === existingRule.id)
          : -1

        if (config) {
          const action = simpleEntranceAction(nodeId, config)
          if (ruleIndex >= 0) {
            const current = rules[ruleIndex]!
            rules[ruleIndex] = {
              ...current,
              name: `${effectiveNode.name} · 出现动画`.slice(0, 80),
              enabled: true,
              actions: [{
                ...current.actions[0]!,
                delayMs: Math.min(60_000, Math.max(0, config.delayMs)),
                action,
              }],
            }
          } else {
            rules.push({
              id: `simple_entrance_${nanoid()}`,
              name: `${effectiveNode.name} · 出现动画`.slice(0, 80),
              enabled: true,
              trigger: { type: 'node.activated', nodeId },
              conditions: stateId === null
                ? []
                : [{ type: 'presentation.in', stateIds: [stateId] }],
              actions: [{
                id: `action_${nanoid()}`,
                start: 'after-previous',
                delayMs: Math.min(60_000, Math.max(0, config.delayMs)),
                action,
              }],
            })
          }
          setSceneNodePlaybackInitialVisibility(
            draftScene as SceneDocument,
            stateId,
            nodeId,
            'hidden',
          )
          return
        }

        draftScene.interactions = withoutDanglingAnimationCompletionRules(
          rules.filter((_, index) => index !== ruleIndex),
        )
        const stillHasEntrance = draftScene.interactions.some((rule) =>
          entranceRuleAppliesToState(rule, nodeId, stateId),
        )
        if (!stillHasEntrance) {
          setSceneNodePlaybackInitialVisibility(
            draftScene as SceneDocument,
            stateId,
            nodeId,
            'inherit',
          )
        }
      }, nodeId)
      set({
        statusMessage: config
          ? `已为“${effectiveNode.name}”设置出现动画`
          : `已移除“${effectiveNode.name}”的出现动画`,
      })
    },

    updatePlayback(patch) {
      const requestedControls = patch.controls
      commit((draft) => {
        draft.playback = { ...draft.playback, ...patch }
        if (requestedControls === 'none') {
          for (const item of draft.globalLayer) {
            if (item.node.type === 'teacher-controller') {
              item.node.playbackInitialVisibility = 'hidden'
            }
          }
        } else if (requestedControls === 'canvas') {
          let controller = draft.globalLayer.find(
            (item) => item.node.type === 'teacher-controller',
          )
          if (!controller) {
            controller = {
              node: createTeacherControllerNode(),
              layer: 'overlay',
              visibility: { mode: 'all', sceneIds: [] },
            }
            draft.globalLayer.push(controller)
          }
          restoreTeacherControllerForDelivery(controller)
        }
      })
      set({ statusMessage: '成品控制设置已更新' })
    },

    updateDesignTokens(tokens) {
      commit((draft) => {
        draft.designTokens = structuredClone(tokens)
      })
      set({ statusMessage: '项目字体与色板 Token 已更新' })
    },

    ensureTeacherController() {
      const existing = get().project.globalLayer.find(
        (item) => item.node.type === 'teacher-controller',
      )
      if (existing) {
        commit((draft) => {
          const controller = draft.globalLayer.find(
            (item) => item.node.id === existing.node.id,
          )
          if (!controller || controller.node.type !== 'teacher-controller') return
          restoreTeacherControllerForDelivery(controller)
        }, existing.node.id)
        set({
          editingScope: 'global',
          selectedNodeId: existing.node.id,
          selectedNodeIds: [existing.node.id],
          activeTab: 'properties',
          statusMessage: '已定位画布内教师控制器',
        })
        return
      }
      const node = createTeacherControllerNode()
      commit((draft) => {
        draft.globalLayer.push({
          node,
          layer: 'overlay',
          visibility: { mode: 'all', sceneIds: [] },
        })
      }, node.id)
      set({
        editingScope: 'global',
        statusMessage: '已添加画布内教师控制器',
      })
    },

    addExternalComponentNode(packageId, x, y, presetId) {
      const data = get().componentPackages[packageId]
      if (!data) return
      const scope = get().editingScope
      if (!componentSupportsScope(data.manifest, scope)) {
        set({
          errorMessage: scope === 'global'
            ? `组件“${data.manifest.name}”未声明支持全局层。`
            : `组件“${data.manifest.name}”未声明支持场景层。`,
          statusMessage: null,
        })
        return
      }
      if (!canAddNode()) return
      const state = get()
      const node = normalizeNewNodeGeometry(
        offsetDefaultInsertion(
          createExternalComponentNode(data.manifest, x, y),
          editingNodes(state).length,
          x !== undefined || y !== undefined,
        ),
        state.componentPackages,
      )
      if (node.type !== 'external-component') return
      let presetLabel: string | undefined
      if (presetId) {
        const preset = data.manifest.presets?.find((item) => item.id === presetId)
        if (preset && node.type === 'external-component') {
          node.name = `${data.manifest.name} · ${preset.label}`
          node.props = resolveComponentPresetProps(data.manifest, preset)
          presetLabel = preset.label
        }
      }
      appendNodeToEditingScope(node)
      set({
        statusMessage: scope === 'global'
          ? `已将“${presetLabel ?? data.manifest.name}”添加到全局层`
          : `已添加“${presetLabel ?? data.manifest.name}”`,
      })
    },

    importComponentPackage(packageData) {
      get().importComponentPackages([packageData])
    },

    importComponentPackages(packageData) {
      if (packageData.length === 0) return
      const existingPackages = get().componentPackages
      const pendingIds = new Set<string>()
      for (const data of packageData) {
        const id = data.manifest.id
        if (pendingIds.has(id)) {
          throw new UserFacingError(
            '组件批量导入失败',
            `所选文件中包含多个 ID 为“${id}”的组件包。`,
            '每个组件 ID 每批只能加入一个版本；请取消重复选择后重试。',
          )
        }
        pendingIds.add(id)
        const existing = existingPackages[id]
        if (!existing) continue
        const sameVersion = existing.manifest.version === data.manifest.version
        throw new UserFacingError(
          '组件导入失败',
          sameVersion
            ? `组件“${existing.manifest.name}” ${existing.manifest.version} 已经加入工程。`
            : `工程已包含组件“${existing.manifest.name}” ${existing.manifest.version}，不能再加入同 ID 的 ${data.manifest.version}。`,
          sameVersion
            ? '请直接从“工程组件”插入实例；若要更新代码，请使用该组件的管理菜单。'
            : '请从“工程组件”的管理菜单审阅更新或替换，实例会统一升级。',
        )
      }

      commit((draft) => {
        packageData.forEach((data) => {
          draft.componentPackages[data.manifest.id] = componentMeta(data)
        })
      }, undefined, packageData.map((data) => ({
        packageId: data.manifest.id,
        next: data,
      })))
      set({
        activeTab: get().editorMode === 'professional' ? 'components' : get().activeTab,
        errorMessage: null,
        statusMessage: packageData.length === 1
          ? `已将组件“${packageData[0]!.manifest.name}”加入工程`
          : `已将 ${packageData.length} 个组件加入工程`,
      })
    },

    deleteComponentPackage(packageId) {
      const state = get()
      const decision = evaluateComponentPackageDeletion(state.project, packageId)
      if (!decision.packageExists) {
        set({
          errorMessage: `工程中不存在组件包“${packageId}”。`,
          statusMessage: null,
        })
        return false
      }
      if (!decision.canDelete) {
        const { sceneInstanceCount, globalInstanceCount } = decision.usage
        set({
          errorMessage: `组件包仍被 ${sceneInstanceCount} 个场景实例和 ${globalInstanceCount} 个全局实例引用。请先删除这些实例，再删除组件包。`,
          statusMessage: null,
        })
        return false
      }

      const packageName = state.componentPackages[packageId]?.manifest.name ?? packageId
      commit((draft) => {
        for (const [key, meta] of Object.entries(draft.componentPackages)) {
          if (meta.packageId === packageId) delete draft.componentPackages[key]
        }
      }, undefined, { packageId })
      set({
        errorMessage: null,
        statusMessage: `未使用组件包“${packageName}”已删除`,
      })
      return true
    },

    replaceComponentPackage(packageId, packageData) {
      const replacementId = packageData.manifest.id
      if (replacementId !== packageId) {
        throw new UserFacingError(
          '组件替换失败',
          `所选组件包 ID 为“${replacementId}”，与待替换的“${packageId}”不一致。`,
          '请选择同一组件 ID 的新版本；替换不会自动把实例迁移到另一种组件。',
        )
      }

      const state = get()
      const currentPackage = state.componentPackages[packageId]
      const currentHash = currentPackage?.provenance?.sha256
      const replacementHash = packageData.provenance?.sha256
      if (
        currentPackage?.manifest.version === packageData.manifest.version &&
        currentHash !== undefined &&
        replacementHash !== undefined &&
        currentHash !== replacementHash
      ) {
        throw new UserFacingError(
          '组件替换失败',
          `组件“${packageId}”的 ${packageData.manifest.version} 版本与工程内同版本哈希不一致。`,
          '同一 ID 与版本必须锁定到完全相同的包；请让组件维护者提升版本号后再更新。',
        )
      }
      const usage = collectComponentPackageUsage(state.project, packageId)
      const manifest = packageData.manifest
      const supportsScene = componentSupportsScope(manifest, 'scene')
      const supportsGlobal = componentSupportsScope(manifest, 'global')
      const unsupportedScopes = [
        usage.sceneInstanceCount > 0 && !supportsScene ? '场景层' : null,
        usage.globalInstanceCount > 0 && !supportsGlobal ? '全局层' : null,
      ].filter((scope): scope is string => Boolean(scope))
      if (unsupportedScopes.length > 0) {
        throw new UserFacingError(
          '组件替换失败',
          `新包未声明支持现有实例所在的${unsupportedScopes.join('和')}。`,
          '请使用 supportedScopes 覆盖现有实例范围的同 ID 组件包，或先删除不兼容范围内的实例。',
        )
      }

      let plan
      try {
        plan = planComponentPackageReplacement(
          state.project,
          componentMeta(packageData),
        )
      } catch (error) {
        throw new UserFacingError(
          '组件替换失败',
          error instanceof Error ? error.message : `无法替换组件包“${packageId}”。`,
          '当前工程未发生变化，请检查组件 ID 与工程中的组件包记录。',
          { cause: error },
        )
      }

      commit((draft) => {
        draft.componentPackages = structuredClone(plan.nextProject.componentPackages)
        for (const scene of draft.scenes) {
          for (const node of scene.nodes) {
            if (
              node.type === 'external-component' &&
              node.component.packageId === packageId
            ) {
              node.component.version = plan.replacementVersion
            }
          }
        }
        for (const item of draft.globalLayer) {
          const node = item.node
          if (
            node.type === 'external-component' &&
            node.component.packageId === packageId
          ) {
            node.component.version = plan.replacementVersion
          }
        }
      }, undefined, { packageId, next: packageData })
      set({
        activeTab: 'components',
        errorMessage: null,
        statusMessage: `组件“${packageData.manifest.name}”已替换为 ${plan.replacementVersion}，${plan.affectedInstances.length} 个实例已同步`,
      })
    },

    createEditableComponentCopy(packageId, nodeId) {
      const state = get()
      const source = state.componentPackages[packageId]
      if (!source) {
        set({
          errorMessage: `工程中不存在组件包“${packageId}”。`,
          statusMessage: null,
        })
        return null
      }
      if (
        nodeId &&
        state.editingScope === 'scene' &&
        state.activePresentationStateId !== null
      ) {
        set({
          errorMessage:
            '命名状态只能覆盖组件公开属性，不能改变组件包身份。请切换到“基础”后再创建可编辑副本。',
          statusMessage: null,
        })
        return null
      }
      const selected = nodeId
        ? editingNodes(state).find((node) => node.id === nodeId)
        : undefined
      if (
        nodeId &&
        (
          selected?.type !== 'external-component' ||
          selected.component.packageId !== packageId
        )
      ) {
        throw new UserFacingError(
          '无法切换组件副本',
          '所选实例与待复制组件不一致。',
          '请重新选择组件实例后再试。',
        )
      }
      const suffix = nanoid(6)
      const safeSuffix = suffix.toLowerCase().replace(/[^a-z0-9]/g, 'x')
      const nextId = editableComponentPackageId(packageId, suffix)
      const nextVersion = `0.1.0-edit.${safeSuffix}`
      const manifest = {
        ...structuredClone(source.manifest),
        id: nextId,
        name: `${source.manifest.name}（可编辑副本）`,
        version: nextVersion,
        description: `由工程内“${source.manifest.name}”创建的可编辑副本。`,
      } as ComponentManifest
      const runtimeSource = rewriteComponentDefinitionId(
        source.runtimeSource,
        source.manifest.id,
        nextId,
      )
      const sourceWithoutProvenance = { ...source }
      delete sourceWithoutProvenance.provenance
      const authoredFiles = componentFilesWithAuthoredCode(
        source,
        manifest,
        runtimeSource,
      )
      const packageData: ComponentPackageData = {
        ...sourceWithoutProvenance,
        manifest,
        runtimeSource,
        files: authoredFiles,
        contentSha256: componentContentSha256(authoredFiles),
      }
      validateEditableComponentPackage(
        packageData,
        state.project,
        selected
          ? [state.editingScope === 'global' ? 'global' : 'scene']
          : [],
      )
      const sourceMeta = Object.values(state.project.componentPackages).find(
        (meta) =>
          meta.packageId === packageId &&
          meta.version === source.manifest.version,
      )

      commit((draft) => {
        draft.componentPackages[nextId] = componentMeta(packageData, {
          editableCopy: true,
          sourcePackageId: sourceMeta?.sourcePackageId ?? packageId,
        })
        if (!selected || selected.type !== 'external-component') return
        if (state.editingScope === 'global') {
          const item = draft.globalLayer.find(
            (entry) => entry.node.id === selected.id,
          )
          if (item?.node.type === 'external-component') {
            item.node.component = { packageId: nextId, version: nextVersion }
          }
          return
        }
        const scene = draft.scenes.find(
          (item) => item.id === state.activeSceneId,
        )
        if (!scene) return
        const node = scene.nodes.find((item) => item.id === selected.id)
        if (node?.type === 'external-component') {
          node.component = { packageId: nextId, version: nextVersion }
        }
      }, nodeId, { packageId: nextId, next: packageData })
      set({
        activeTab: 'developer',
        errorMessage: null,
        statusMessage: `已创建“${manifest.name}”，原组件包保持不变`,
      })
      return nextId
    },

    updateEditableComponentPackage(packageId, patch) {
      const state = get()
      const currentPackage = state.componentPackages[packageId]
      const currentMeta = Object.values(state.project.componentPackages).find(
        (meta) =>
          meta.packageId === packageId &&
          meta.version === currentPackage?.manifest.version,
      )
      assertEditableComponentPackage(packageId, currentPackage, currentMeta)
      const manifest = patch.manifest
        ? structuredClone(patch.manifest)
        : structuredClone(currentPackage.manifest)
      if (
        manifest.id !== currentPackage.manifest.id ||
        manifest.version !== currentPackage.manifest.version
      ) {
        throw new UserFacingError(
          '组件代码不可修改',
          '可编辑副本的 ID 和版本不能在代码框内改写。',
          '如需新的身份，请从当前组件再次创建副本。',
        )
      }
      const runtimeSource = patch.runtimeSource ?? currentPackage.runtimeSource
      const authoredFiles = componentFilesWithAuthoredCode(
        currentPackage,
        manifest,
        runtimeSource,
      )
      const nextPackage: ComponentPackageData = {
        ...currentPackage,
        manifest,
        runtimeSource,
        files: authoredFiles,
        contentSha256: componentContentSha256(authoredFiles),
      }
      validateEditableComponentPackage(nextPackage, state.project)
      commit((draft) => {
        for (const [key, meta] of Object.entries(draft.componentPackages)) {
          if (meta.packageId === packageId) delete draft.componentPackages[key]
        }
        draft.componentPackages[packageId] = componentMeta(nextPackage, {
          editableCopy: true,
          sourcePackageId: currentMeta?.sourcePackageId,
        })
      }, undefined, { packageId, next: nextPackage })
      set({
        activeTab: 'developer',
        errorMessage: null,
        statusMessage: `组件“${nextPackage.manifest.name}”代码已更新`,
      })
    },

    deleteNode(nodeId) {
      const state = get()
      const sceneId = state.activeSceneId
      if (!editingNodes(state).some((node) => node.id === nodeId)) return
      if (state.editingScope === 'scene' && state.activePresentationStateId !== null) {
        get().updateNode(nodeId, { visible: false })
        set({
          selectedNodeId: null,
          selectedNodeIds: [],
          statusMessage: '元素已在当前状态中隐藏；基础元素仍保留',
        })
        return
      }
      commit((draft) => {
        if (state.editingScope === 'global') {
          draft.globalLayer = draft.globalLayer.filter(
            (instance) => instance.node.id !== nodeId,
          )
          draft.globalInteractions = draft.globalInteractions.filter((rule) =>
            !('nodeId' in rule.trigger && rule.trigger.nodeId === nodeId) &&
            !rule.actions.some(({ action }) =>
              (isVideoInteractionAction(action) || isNodeMotionAction(action)) &&
              action.nodeId === nodeId,
            ),
          )
          draft.globalInteractions = withoutDanglingAnimationCompletionRules(
            draft.globalInteractions,
          )
        } else {
          const draftScene = draft.scenes.find((item) => item.id === sceneId)
          if (draftScene) {
            removeBaseNodes(draftScene as SceneDocument, new Set([nodeId]))
            draftScene.interactions = draftScene.interactions.filter((rule) =>
              !('nodeId' in rule.trigger && rule.trigger.nodeId === nodeId) &&
              !rule.actions.some(({ action }) =>
                (isVideoInteractionAction(action) || isNodeMotionAction(action)) &&
                action.nodeId === nodeId,
              ),
            )
            draftScene.interactions = withoutDanglingAnimationCompletionRules(
              draftScene.interactions,
            )
          }
        }
      }, null)
      set({ statusMessage: state.editingScope === 'global' ? '全局元素已删除' : '节点已删除' })
    },

    deleteSelectedNodes() {
      const state = get()
      const ids = new Set(state.selectedNodeIds)
      if (ids.size === 0) return
      const sceneId = state.activeSceneId
      if (state.editingScope === 'scene' && state.activePresentationStateId !== null) {
        get().updateNodes([...ids].map((nodeId) => ({
          nodeId,
          patch: { visible: false },
        })))
        set({
          selectedNodeId: null,
          selectedNodeIds: [],
          statusMessage: `已在当前状态中隐藏 ${ids.size} 个图层`,
        })
        return
      }
      commit((draft) => {
        if (state.editingScope === 'global') {
          draft.globalLayer = draft.globalLayer.filter(
            (instance) => !ids.has(instance.node.id),
          )
          draft.globalInteractions = draft.globalInteractions.filter((rule) =>
            !('nodeId' in rule.trigger && ids.has(rule.trigger.nodeId)) &&
            !rule.actions.some(({ action }) =>
              (isVideoInteractionAction(action) || isNodeMotionAction(action)) &&
              ids.has(action.nodeId),
            ),
          )
          draft.globalInteractions = withoutDanglingAnimationCompletionRules(
            draft.globalInteractions,
          )
        } else {
          const scene = draft.scenes.find((item) => item.id === sceneId)
          if (scene) {
            removeBaseNodes(scene as SceneDocument, ids)
            scene.interactions = scene.interactions.filter((rule) =>
              !('nodeId' in rule.trigger && ids.has(rule.trigger.nodeId)) &&
              !rule.actions.some(({ action }) =>
                (isVideoInteractionAction(action) || isNodeMotionAction(action)) &&
                ids.has(action.nodeId),
              ),
            )
            scene.interactions = withoutDanglingAnimationCompletionRules(
              scene.interactions,
            )
          }
        }
      }, null)
      set({
        statusMessage: state.editingScope === 'global'
          ? `已删除 ${ids.size} 个全局元素`
          : `已删除 ${ids.size} 个图层`,
      })
    },

    duplicateNode(nodeId) {
      if (!canAddNode()) return
      const state = get()
      const sceneId = state.activeSceneId
      const source = editingNodes(state).find((node) => node.id === nodeId)
      if (!source) return
      const copy = normalizeNewNodeGeometry(
        {
          ...structuredClone(source),
          id: `${source.type}_${nanoid()}`,
          name: `${source.name} 副本`,
          x: source.x + 20,
          y: source.y + 20,
          locked: false,
        },
        state.componentPackages,
      )
      const copiedClickRules = state.editingScope === 'scene'
        ? (currentScene(state)?.interactions ?? [])
            .filter((rule) => (
              rule.trigger.type === 'node.click' && rule.trigger.nodeId === nodeId
            ))
            .map((rule) => ({
              ...structuredClone(rule),
              id: `rule_${nanoid()}`,
              trigger: { type: 'node.click' as const, nodeId: copy.id },
            }))
        : state.project.globalInteractions
            .filter((rule) => (
              rule.trigger.type === 'node.click' && rule.trigger.nodeId === nodeId
            ))
            .map((rule) => ({
              ...structuredClone(rule),
              id: `rule_${nanoid()}`,
              trigger: { type: 'node.click' as const, nodeId: copy.id },
            }))
      if (state.editingScope === 'global') {
        const placement = state.project.globalLayer.find(
          (instance) => instance.node.id === nodeId,
        )
        if (!placement) return
        commit((draft) => {
          draft.globalLayer.push({
            ...structuredClone(placement),
            node: copy as typeof placement.node,
          })
          draft.globalInteractions.push(...copiedClickRules)
        }, copy.id)
      } else {
        commit((draft) => {
          const scene = draft.scenes.find((scene) => scene.id === sceneId)
          if (scene) {
            appendNodesToScene(
              scene as SceneDocument,
              [copy],
              state.activePresentationStateId,
            )
            scene.interactions.push(...copiedClickRules)
          }
        }, copy.id)
      }
      set({
        activeTab: 'properties',
        statusMessage: state.editingScope === 'global'
          ? `已复制全局元素“${source.name}”`
          : `已复制“${source.name}”`,
      })
    },

    duplicateSelectedNodes() {
      const state = get()
      const selected = editingNodes(state).filter((node) => state.selectedNodeIds.includes(node.id))
      if (selected.length === 0) return
      if (editingNodes(state).length + selected.length > MAX_SCENE_NODES) {
        set({
          errorMessage: state.editingScope === 'global'
            ? `复制后将超过全局层 ${MAX_SCENE_NODES} 个元素的上限。`
            : `复制后将超过每场景 ${MAX_SCENE_NODES} 个图层的上限。`,
        })
        return
      }
      const copies = selected.map((source) => normalizeNewNodeGeometry({
        ...structuredClone(source),
        id: `${source.type}_${nanoid()}`,
        name: `${source.name} 副本`,
        x: source.x + 20,
        y: source.y + 20,
        locked: false,
      }, state.componentPackages))
      const copiedNodeIds = new Map(
        selected.map((source, index) => [source.id, copies[index]!.id]),
      )
      const copiedClickRules = state.editingScope === 'scene'
        ? (currentScene(state)?.interactions ?? []).flatMap((rule) => {
            if (rule.trigger.type !== 'node.click') return []
            const copiedNodeId = copiedNodeIds.get(rule.trigger.nodeId)
            if (!copiedNodeId) return []
            return [{
              ...structuredClone(rule),
              id: `rule_${nanoid()}`,
              trigger: {
                type: 'node.click' as const,
                nodeId: copiedNodeId,
              },
            }]
          })
        : state.project.globalInteractions.flatMap((rule) => {
            if (rule.trigger.type !== 'node.click') return []
            const copiedNodeId = copiedNodeIds.get(rule.trigger.nodeId)
            if (!copiedNodeId) return []
            return [{
              ...structuredClone(rule),
              id: `rule_${nanoid()}`,
              trigger: {
                type: 'node.click' as const,
                nodeId: copiedNodeId,
              },
            }]
          })
      const sceneId = state.activeSceneId
      if (state.editingScope === 'global') {
        const placements = new Map(
          state.project.globalLayer.map((item) => [item.node.id, item]),
        )
        commit((draft) => {
          copies.forEach((node, index) => {
            const sourcePlacement = placements.get(selected[index]!.id)
            if (!sourcePlacement) return
            draft.globalLayer.push({
              ...structuredClone(sourcePlacement),
              node,
            })
          })
          draft.globalInteractions.push(...copiedClickRules)
        })
      } else {
        commit((draft) => {
          const scene = draft.scenes.find((scene) => scene.id === sceneId)
          if (scene) {
            appendNodesToScene(
              scene as SceneDocument,
              copies,
              state.activePresentationStateId,
            )
            scene.interactions.push(...copiedClickRules)
          }
        })
      }
      set({
        selectedNodeIds: copies.map((node) => node.id),
        selectedNodeId: copies.at(-1)?.id ?? null,
        activeTab: 'properties',
        statusMessage: state.editingScope === 'global'
          ? `已复制 ${copies.length} 个全局元素`
          : `已复制 ${copies.length} 个图层`,
      })
    },

    copySelectedNodes() {
      const state = get()
      const selected = editingNodes(state).filter((node) => state.selectedNodeIds.includes(node.id))
      if (selected.length === 0) return
      if (state.editingScope === 'global') {
        const ids = new Set(selected.map((node) => node.id))
        const placements = state.project.globalLayer.filter((item) => ids.has(item.node.id))
        set({
          clipboardNodes: [],
          clipboardGlobalItems: structuredClone(placements),
          clipboardInteractionRules: structuredClone(
            state.project.globalInteractions.filter((rule) => (
              'nodeId' in rule.trigger && ids.has(rule.trigger.nodeId)
            )),
          ),
          statusMessage: `已复制 ${placements.length} 个全局元素到剪贴板`,
        })
      } else {
        const ids = new Set(selected.map((node) => node.id))
        set({
          clipboardNodes: structuredClone(selected),
          clipboardGlobalItems: [],
          clipboardInteractionRules: structuredClone(
            (currentScene(state)?.interactions ?? []).filter((rule) => (
              'nodeId' in rule.trigger && ids.has(rule.trigger.nodeId)
            )),
          ),
          statusMessage: `已复制 ${selected.length} 个图层到剪贴板`,
        })
      }
    },

    pasteNodes() {
      const state = get()
      if (state.editingScope === 'global') {
        if (state.clipboardGlobalItems.length === 0) return
        if (state.project.globalLayer.length + state.clipboardGlobalItems.length > MAX_SCENE_NODES) {
          set({ errorMessage: `粘贴后将超过全局层 ${MAX_SCENE_NODES} 个元素的上限。` })
          return
        }
        const copies = state.clipboardGlobalItems.map((source) => ({
          ...structuredClone(source),
          node: normalizeNewNodeGeometry({
            ...structuredClone(source.node),
            id: `${source.node.type}_${nanoid()}`,
            name: `${source.node.name} 副本`,
            x: source.node.x + 20,
            y: source.node.y + 20,
            locked: false,
          }, state.componentPackages),
        }))
        const nodeIdMap = new Map(
          state.clipboardGlobalItems.map((source, index) => [
            source.node.id,
            copies[index]!.node.id,
          ]),
        )
        const copiedRules = state.clipboardInteractionRules.map((rule) =>
          rewriteInteractionRuleForNodeCopy(rule, nodeIdMap),
        )
        commit((draft) => {
          draft.globalLayer.push(...copies as GlobalLayerItem[])
          draft.globalInteractions.push(...copiedRules)
        })
        set({
          selectedNodeIds: copies.map((instance) => instance.node.id),
          selectedNodeId: copies.at(-1)?.node.id ?? null,
          activeTab: 'properties',
          statusMessage: `已粘贴 ${copies.length} 个全局元素`,
        })
        return
      }
      if (state.clipboardNodes.length === 0) return
      if ((currentScene(state)?.nodes.length ?? 0) + state.clipboardNodes.length > MAX_SCENE_NODES) {
        set({ errorMessage: `粘贴后将超过每场景 ${MAX_SCENE_NODES} 个图层的上限。` })
        return
      }
      const copies = state.clipboardNodes.map((source) => normalizeNewNodeGeometry({
        ...structuredClone(source),
        id: `${source.type}_${nanoid()}`,
        name: `${source.name} 副本`,
        x: source.x + 20,
        y: source.y + 20,
        locked: false,
      }, state.componentPackages))
      const nodeIdMap = new Map(
        state.clipboardNodes.map((source, index) => [source.id, copies[index]!.id]),
      )
      const copiedRules = state.clipboardInteractionRules.map((rule) =>
        rewriteInteractionRuleForNodeCopy(rule, nodeIdMap),
      )
      const sceneId = state.activeSceneId
      commit((draft) => {
        const scene = draft.scenes.find((scene) => scene.id === sceneId)
        if (scene) {
          appendNodesToScene(
            scene as SceneDocument,
            copies,
            state.activePresentationStateId,
          )
          scene.interactions.push(...copiedRules)
        }
      })
      set({ selectedNodeIds: copies.map((node) => node.id), selectedNodeId: copies.at(-1)?.id ?? null, activeTab: 'properties', statusMessage: `已粘贴 ${copies.length} 个图层` })
    },

    nudgeSelection(dx, dy) {
      const state = get()
      const nodes = editingNodes(state).filter(
        (node) => state.selectedNodeIds.includes(node.id) && !node.locked,
      )
      get().updateNodes(nodes.map((node) => ({
        nodeId: node.id,
        patch: { x: node.x + dx, y: node.y + dy },
      })))
    },

    alignSelection(mode) {
      const state = get()
      const nodes = editingNodes(state).filter((node) => state.selectedNodeIds.includes(node.id) && !node.locked)
      if (nodes.length < 2) return
      const boundsById = new Map(
        nodes.map((node) => [node.id, rotatedRectangleAabb(node)]),
      )
      const bounds = [...boundsById.values()]
      const left = Math.min(...bounds.map((item) => item.left))
      const right = Math.max(...bounds.map((item) => item.right))
      const top = Math.min(...bounds.map((item) => item.top))
      const bottom = Math.max(...bounds.map((item) => item.bottom))
      const translations = new Map<string, { dx: number; dy: number }>()
      for (const node of nodes) {
        const visual = boundsById.get(node.id)!
        let dx = 0
        let dy = 0
        if (mode === 'left') dx = left - visual.left
        else if (mode === 'center') dx = (left + right) / 2 - visual.centerX
        else if (mode === 'right') dx = right - visual.right
        else if (mode === 'top') dy = top - visual.top
        else if (mode === 'middle') dy = (top + bottom) / 2 - visual.centerY
        else dy = bottom - visual.bottom
        translations.set(node.id, { dx, dy })
      }
      get().updateNodes(nodes.map((node) => {
        const translation = translations.get(node.id)!
        return {
          nodeId: node.id,
          patch: {
            x: node.x + translation.dx,
            y: node.y + translation.dy,
          },
        }
      }))
      set({ statusMessage: `已对齐 ${nodes.length} 个图层` })
    },

    distributeSelection(axis) {
      const state = get()
      const nodes = editingNodes(state).filter((node) => state.selectedNodeIds.includes(node.id) && !node.locked)
      if (nodes.length < 3) return
      const boundsById = new Map(
        nodes.map((node) => [node.id, rotatedRectangleAabb(node)]),
      )
      const sorted = [...nodes].sort((a, b) => {
        const aBounds = boundsById.get(a.id)!
        const bBounds = boundsById.get(b.id)!
        return axis === 'horizontal'
          ? aBounds.left - bBounds.left
          : aBounds.top - bBounds.top
      })
      const firstBounds = boundsById.get(sorted[0]!.id)!
      const lastBounds = boundsById.get(sorted.at(-1)!.id)!
      const span = axis === 'horizontal'
        ? lastBounds.right - firstBounds.left
        : lastBounds.bottom - firstBounds.top
      const totalSize = sorted.reduce((sum, node) => {
        const visual = boundsById.get(node.id)!
        return sum + (axis === 'horizontal' ? visual.width : visual.height)
      }, 0)
      const gap = (span - totalSize) / (sorted.length - 1)
      const translations = new Map<string, number>()
      let cursor = axis === 'horizontal' ? firstBounds.left : firstBounds.top
      for (const node of sorted) {
        const visual = boundsById.get(node.id)!
        const current = axis === 'horizontal' ? visual.left : visual.top
        translations.set(node.id, cursor - current)
        cursor += (axis === 'horizontal' ? visual.width : visual.height) + gap
      }
      get().updateNodes(nodes.map((node) => {
        const delta = translations.get(node.id) ?? 0
        return {
          nodeId: node.id,
          patch: axis === 'horizontal'
            ? { x: node.x + delta }
            : { y: node.y + delta },
        }
      }))
      set({ statusMessage: `已等距分布 ${nodes.length} 个图层` })
    },

    updateNodes(patches) {
      if (patches.length === 0) return
      const state = get()
      const sceneId = state.activeSceneId
      const byId = new Map(patches.map((item) => [item.nodeId, item.patch]))
      const effectiveById = new Map(
        editingNodes(state).map((node) => [node.id, node]),
      )
      const scene = currentScene(state)
      const stateOverrides = new Map<string, SceneNodeOverride | undefined>()
      if (
        state.editingScope === 'scene' &&
        state.activePresentationStateId !== null &&
        scene
      ) {
        const baseById = new Map(scene.nodes.map((node) => [node.id, node]))
        for (const [nodeId, patch] of byId) {
          const previous = effectiveById.get(nodeId)
          const baseNode = baseById.get(nodeId)
          if (!previous || !baseNode) continue
          const next = normalizeNodeGeometry(
            previous,
            patchSceneNode(previous, patch),
            patch,
            state.componentPackages,
          )
          stateOverrides.set(nodeId, deriveSceneNodeOverride(baseNode, next))
        }
      }
      commit((draft) => {
        if (state.editingScope === 'global') {
          for (const instance of draft.globalLayer) {
            const patch = byId.get(instance.node.id)
            if (!patch) continue
            instance.node = normalizeNodeGeometry(
              instance.node,
              patchSceneNode(instance.node, patch),
              patch,
              state.componentPackages,
            ) as typeof instance.node
          }
        } else {
          const draftScene = draft.scenes.find((item) => item.id === sceneId)
          if (!draftScene) return
          if (state.activePresentationStateId !== null) {
            for (const [nodeId, override] of stateOverrides) {
              setPresentationNodeOverride(
                draftScene as SceneDocument,
                state.activePresentationStateId,
                nodeId,
                override,
              )
            }
            return
          }
          draftScene.nodes = draftScene.nodes.map((node) => {
            const patch = byId.get(node.id)
            return patch
              ? normalizeNodeGeometry(node, patchSceneNode(node, patch), patch, state.componentPackages)
              : node
          })
        }
      })
    },

    updateNode(nodeId, patch) {
      get().updateNodes([{ nodeId, patch }])
    },

    updateGlobalLayerSettings(nodeId, patch) {
      commit((draft) => {
        const instance = draft.globalLayer.find(
          (item) => item.node.id === nodeId,
        )
        if (!instance) return
        if (patch.layer !== undefined) instance.layer = patch.layer
        if (patch.visibility !== undefined) {
          instance.visibility = normalizedVisibility(
            draft.scenes.map((scene) => scene.id),
            patch.visibility,
          )
        }
      })
    },

    reorderNodes(nodeIds) {
      const state = get()
      const nodes = editingNodes(state)
      if (!sameIds(nodes.map((node) => node.id), nodeIds)) return
      const sceneId = state.activeSceneId
      commit((draft) => {
        if (state.editingScope === 'global') {
          const byId = new Map(
            draft.globalLayer.map((item) => [item.node.id, item]),
          )
          draft.globalLayer = nodeIds.map((id) => byId.get(id)!)
        } else {
          const target = draft.scenes.find((item) => item.id === sceneId)
          if (target) {
            if (state.activePresentationStateId !== null) {
              const presentationState = mutablePresentationState(
                target as SceneDocument,
                state.activePresentationStateId,
              )
              if (presentationState) {
                const baseOrder = target.nodes.map((node) => node.id)
                presentationState.nodeOrder = baseOrder.every(
                  (nodeId, index) => nodeIds[index] === nodeId,
                )
                  ? undefined
                  : [...nodeIds]
              }
            } else {
              const byId = new Map(target.nodes.map((node) => [node.id, node]))
              target.nodes = nodeIds.map((id) => byId.get(id)!)
            }
          }
        }
      })
    },

    selectNode(selectedNodeId, additive = false) {
      const nodes = editingNodes(get())
      if (
        selectedNodeId !== null &&
        !nodes.some((node) => node.id === selectedNodeId)
      ) {
        return
      }
      const previous = get().selectedNodeIds
      const selectedNodeIds = selectedNodeId === null
        ? []
        : additive
          ? previous.includes(selectedNodeId)
            ? previous.filter((id) => id !== selectedNodeId)
            : [...previous, selectedNodeId]
          : [selectedNodeId]
      set((state) => ({
        ...commitTextEditSessionState(state),
        selectedNodeId: selectedNodeIds.at(-1) ?? null,
        selectedNodeIds,
        editingTextNodeId: null,
        textEditSession: null,
        activeTab: selectedNodeIds.length > 0 ? 'properties' : state.activeTab,
      }))
    },

    selectNodes(nodeIds) {
      const available = new Set(editingNodes(get()).map((node) => node.id))
      const selectedNodeIds = [...new Set(nodeIds)].filter((id) => available.has(id))
      set((state) => ({
        ...commitTextEditSessionState(state),
        selectedNodeIds,
        selectedNodeId: selectedNodeIds.at(-1) ?? null,
        editingTextNodeId: null,
        textEditSession: null,
        activeTab: selectedNodeIds.length > 0 ? 'properties' : state.activeTab,
      }))
    },

    undo() {
      set((state) => {
        const prepared = commitTextEditSessionState(state)
        const previous = prepared.history.past.at(-1)
        if (!previous) return prepared
        const project = applyPatches(prepared.project, previous.inversePatches)
        const activeScene = project.scenes.some(
          (scene) => scene.id === prepared.activeSceneId,
        )
          ? prepared.activeSceneId
          : project.scenes[0].id
        const active = project.scenes.find((scene) => scene.id === activeScene)!
        const activePresentationStateId = validPresentationStateId(
          active,
          prepared.activePresentationStateId,
        )
        const availableNodes = prepared.editingScope === 'global'
          ? project.globalLayer.map((item) => item.node)
          : materializeScene(active, activePresentationStateId).nodes
        return {
          ...prepared,
          project,
          componentPackages: applyComponentPackageHistoryChanges(
            prepared.componentPackages,
            previous.componentPackageChanges,
            'undo',
          ),
          assetFiles: applyAssetFileHistoryChanges(
            prepared.assetFiles,
            previous.assetFileChanges,
            'undo',
          ),
          activeSceneId: activeScene,
          activePresentationStateId,
          selectedNodeId: availableNodes.some(
            (node) => node.id === prepared.selectedNodeId,
          )
            ? prepared.selectedNodeId
            : null,
          selectedNodeIds: prepared.selectedNodeIds.filter((id) => availableNodes.some((node) => node.id === id)),
          history: {
            past: prepared.history.past.slice(0, -1),
            future: [previous, ...prepared.history.future].slice(
              0,
              50,
            ),
          },
          dirty: true,
          editingTextNodeId: null,
          textEditSession: null,
          statusMessage: '已撤销',
        }
      })
    },

    redo() {
      set((state) => {
        const prepared = commitTextEditSessionState(state)
        const next = prepared.history.future[0]
        if (!next) return prepared
        const project = applyPatches(prepared.project, next.patches)
        const activeScene = project.scenes.some(
          (scene) => scene.id === prepared.activeSceneId,
        )
          ? prepared.activeSceneId
          : project.scenes[0].id
        const active = project.scenes.find((scene) => scene.id === activeScene)!
        const activePresentationStateId = validPresentationStateId(
          active,
          prepared.activePresentationStateId,
        )
        const availableNodes = prepared.editingScope === 'global'
          ? project.globalLayer.map((item) => item.node)
          : materializeScene(active, activePresentationStateId).nodes
        return {
          ...prepared,
          project,
          componentPackages: applyComponentPackageHistoryChanges(
            prepared.componentPackages,
            next.componentPackageChanges,
            'redo',
          ),
          assetFiles: applyAssetFileHistoryChanges(
            prepared.assetFiles,
            next.assetFileChanges,
            'redo',
          ),
          activeSceneId: activeScene,
          activePresentationStateId,
          selectedNodeId: availableNodes.some(
            (node) => node.id === prepared.selectedNodeId,
          )
            ? prepared.selectedNodeId
            : null,
          selectedNodeIds: prepared.selectedNodeIds.filter((id) => availableNodes.some((node) => node.id === id)),
          history: {
            past: [...prepared.history.past, next].slice(-50),
            future: prepared.history.future.slice(1),
          },
          dirty: true,
          editingTextNodeId: null,
          textEditSession: null,
          statusMessage: '已重做',
        }
      })
    },
  }
})

export const selectActiveScene = (state: EditorState) =>
  state.project.scenes.find((scene) => scene.id === state.activeSceneId) ??
  state.project.scenes[0]

export const selectEditingNodes = (state: EditorState) => editingNodes(state)

export const selectSelectedNode = (state: EditorState) =>
  selectEditingNodes(state).find(
    (node) => node.id === state.selectedNodeId,
  ) ?? null

export const selectSelectedNodes = (state: EditorState) => {
  const selected = new Set(state.selectedNodeIds)
  return selectEditingNodes(state).filter((node) => selected.has(node.id))
}
