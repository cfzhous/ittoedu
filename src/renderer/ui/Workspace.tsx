import {
  Hand,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  Minus,
  MousePointer2,
  Copy,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ComponentAuthoringAssetTarget,
  ComponentAuthoringTarget,
  ComponentAuthoringTextTarget,
  ComponentPackageData,
  ExportPayload,
} from '../../shared/componentTypes'
import {
  resolveComponentEditorProperties,
  setComponentPropValue,
} from '../../shared/componentProps'
import type {
  ExternalComponentNode,
  FormulaNode,
  SceneDocument,
  SceneNode,
  TextNode,
} from '../../shared/projectTypes'
import type { RuntimeAuthoringTarget } from '../../shared/runtimeTypes'
import {
  PLAYER_AUTHORING_MESSAGE_TYPES,
  PLAYER_AUTHORING_PROTOCOL_VERSION,
  isPlayerAuthoringSnapshotAck,
  parsePlayerAuthoringReadyMessage,
  playerAuthoringSnapshotBarrierForCommand,
  type PlayerAuthoringPatch,
  type PlayerAuthoringPatchCommand,
  type PlayerAuthoringSnapshotBarrier,
  type PlayerComponentAuthoringTargetsMessage,
  type PlayerHostMode,
  type PlayerRuntimeAuthoringTargetsMessage,
} from '../../shared/playerAuthoringProtocol'
import {
  PLAYER_INSPECTION_MESSAGE_TYPES,
  PLAYER_INSPECTION_PROTOCOL_VERSION,
  type PlayerInspectionModeMessage,
} from '../../shared/playerInspectionProtocol'
import { createEditorGame, type EditorGameHandle } from '../phaser/createEditorGame'
import { onElementAnimationPreviewRequested } from '../phaser/elementAnimationPreviewBus'
import {
  selectActiveScene,
  selectEditingNodes,
  selectSelectedNode,
  useEditorStore,
} from '../store/editorStore'
import { TextEditOverlay } from './TextEditOverlay'
import { CanvasPlainTextEditor } from './CanvasPlainTextEditor'
import { FormulaEditDialog } from './FormulaEditDialog'
import {
  createWorkspaceSlidePreviewProject,
  resolveWorkspaceSlideAuthoringInput,
  workspaceAuthoringActionAllowed,
  workspaceCanvasLabel,
  workspaceMoveAllowed,
  workspaceSelectionAllowed,
  workspaceSlidePreviewAssetFiles,
  workspaceSlidePreviewGenerationIdentity,
  workspaceSlidePreviewSceneId,
  workspaceSlidePreviewStateId,
  type WorkspaceSlideAuthoringInput,
} from './workspaceSlideAuthoring'
import { renderTextNodeCanvas } from '../../shared/textLayout'
import {
  ensureScenePresentation,
  findPresentationState,
  materializeScene,
} from '../../shared/presentation'
import { buildStandaloneHtml } from '../export/buildStandaloneHtml'
import { loadPlayerBundle } from '../export/loadPlayerBundle'
import {
  createRuntimePreviewBlobResources,
  type RuntimePreviewBlobResources,
} from '../preview/runtimePreviewDocument'
import {
  createRuntimePreviewPayloadResources,
  type RuntimePreviewAssetTransfer,
  type RuntimePreviewPayloadResources,
} from '../preview/runtimePreviewPayload'
import {
  releaseRuntimePreviewResources,
  stopRuntimePreviewFrame,
  type ActiveRuntimePreviewResources,
} from '../preview/runtimePreviewLifecycle'
import {
  isCurrentRuntimePreviewBootstrapMessage,
  isCurrentRuntimePreviewPlayerMessage,
} from '../preview/runtimePreviewProtocol'
import {
  clientToWorld,
  createStageViewportTransform,
  rotatedRectIntersectsStage,
  STAGE_VIEWPORT_HEIGHT,
  STAGE_VIEWPORT_WIDTH,
} from '../authoring/stageViewportTransform'
import { runtimeTargetMatchesEditingContext } from '../authoring/runtimeAuthoringContext'
import {
  beginComponentTextEditSession,
  componentTextEditSessionMatchesContext,
  componentTextTargetMatchesSession,
  resolveComponentTextEdit,
  type ComponentTextEditContext,
  type ComponentTextEditSession,
} from '../authoring/componentTextEditSession'
import { isAuthoringCanvasInteractive } from '../authoring/authoringReadiness'
import {
  beginRuntimeTargetEditSession,
  runtimeTargetEditSessionMatchesContext,
  runtimeTargetMatchesEditSession,
  validateRuntimeTargetEditSession,
  type RuntimeTargetEditContext,
  type RuntimeTargetEditSession,
} from '../authoring/runtimeTargetEditSession'
import type { ImportedImageAsset } from '../project/assetManager'
import {
  copyableAiSelectionReference,
  type AuthoringCanvasTarget,
} from '../authoring/aiSelectionReference'

interface WorkspaceProps {
  onAddImage(x?: number, y?: number): void
  onAddVideo(x?: number, y?: number): void
  onSelectImageAsset(): Promise<ImportedImageAsset | null>
  slideAuthoring?: WorkspaceSlideAuthoringInput
  interactionDisabled?: boolean
}

interface FormulaEditSession {
  projectId: string
  scope: 'scene' | 'global'
  sceneId: string
  stateId: string | null
  nodeId: string
}

function nodesEqual(
  previous: SceneDocument['nodes'][number],
  next: SceneDocument['nodes'][number],
) {
  return JSON.stringify(previous) === JSON.stringify(next)
}

function withDirectionAwareTextAutoSize(
  node: SceneNode | undefined,
  patch: Partial<Pick<SceneNode, 'x' | 'y' | 'width' | 'height' | 'rotation'>>,
): typeof patch {
  if (node?.type !== 'text' || node.style.overflow !== 'auto-height') {
    return patch
  }
  const candidate = {
    ...node,
    ...patch,
  }
  const rendered = renderTextNodeCanvas(candidate, candidate.width)
  return {
    ...patch,
    width: rendered.width,
    height: rendered.height,
  }
}

function pointInsideRotatedBounds(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
  rotation: number,
): boolean {
  const centerX = bounds.x + bounds.width / 2
  const centerY = bounds.y + bounds.height / 2
  const radians = -rotation * Math.PI / 180
  const dx = point.x - centerX
  const dy = point.y - centerY
  const localX = dx * Math.cos(radians) - dy * Math.sin(radians)
  const localY = dx * Math.sin(radians) + dy * Math.cos(radians)
  return Math.abs(localX) <= bounds.width / 2 &&
    Math.abs(localY) <= bounds.height / 2
}

function pointInsideSceneNode(
  point: { x: number; y: number },
  node: SceneNode,
): boolean {
  return node.visible && pointInsideRotatedBounds(point, node, node.rotation)
}

const RUNTIME_PREVIEW_STARTUP_TIMEOUT_MS = 12_000

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

type RuntimePreviewFeedback = {
  kind: 'loading' | 'error'
  title: string
  message: string
} | null

function sanitizeRuntimeAuthoringTargets(
  update: PlayerRuntimeAuthoringTargetsMessage['update'],
  hostKey: string,
): ReadonlyArray<Readonly<RuntimeAuthoringTarget>> {
  if (
    (update.scope !== 'scene' && update.scope !== 'global') ||
    (update.scope === 'scene' &&
      (typeof update.sceneId !== 'string' || !update.sceneId.trim()))
  ) {
    return []
  }
  const sanitized: RuntimeAuthoringTarget[] = []
  for (const candidate of update.targets) {
    if (
      !candidate ||
      candidate.scope !== update.scope ||
      candidate.sceneId !== update.sceneId ||
      (candidate.kind !== 'text' && candidate.kind !== 'asset') ||
      (candidate.layer !== 'underlay' && candidate.layer !== 'overlay') ||
      (candidate.source !== 'registered' && candidate.source !== 'dom') ||
      typeof candidate.targetId !== 'string' ||
      !candidate.targetId ||
      candidate.targetId.length > 256 ||
      typeof candidate.key !== 'string' ||
      !candidate.key ||
      candidate.key.length > 256
    ) {
      continue
    }
    if (!candidate.bounds || typeof candidate.bounds !== 'object') continue
    const { x, y, width, height } = candidate.bounds
    if (![x, y, width, height].every(Number.isFinite)) continue
    const left = Math.max(0, x)
    const top = Math.max(0, y)
    const right = Math.min(STAGE_VIEWPORT_WIDTH, x + width)
    const bottom = Math.min(STAGE_VIEWPORT_HEIGHT, y + height)
    if (right <= left || bottom <= top) continue
    sanitized.push(Object.freeze({
      ...candidate,
      targetId: `${hostKey}:${candidate.targetId}`,
      ...(typeof candidate.label === 'string'
        ? { label: candidate.label.slice(0, 120) }
        : { label: undefined }),
      bounds: Object.freeze({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      }),
    }))
  }
  return Object.freeze(sanitized)
}

function sanitizeComponentAuthoringTargets(
  update: PlayerComponentAuthoringTargetsMessage['update'],
  hostKey: string,
): ReadonlyArray<Readonly<ComponentAuthoringTarget>> {
  if (
    (update.scope !== 'scene' && update.scope !== 'global') ||
    typeof update.nodeId !== 'string' ||
    !update.nodeId ||
    update.nodeId.length > 256 ||
    (update.scope === 'scene' &&
      (typeof update.sceneId !== 'string' || !update.sceneId.trim()))
  ) {
    return []
  }
  const sanitized: ComponentAuthoringTarget[] = []
  for (const candidate of update.targets) {
    if (
      !candidate ||
      (candidate.kind !== 'component-text' &&
        candidate.kind !== 'component-asset') ||
      candidate.scope !== update.scope ||
      candidate.sceneId !== update.sceneId ||
      candidate.nodeId !== update.nodeId ||
      (candidate.source !== 'registered' && candidate.source !== 'dom') ||
      typeof candidate.targetId !== 'string' ||
      !candidate.targetId ||
      candidate.targetId.length > 256 ||
      typeof candidate.componentId !== 'string' ||
      !candidate.componentId ||
      candidate.componentId.length > 256 ||
      typeof candidate.key !== 'string' ||
      !candidate.key ||
      candidate.key.length > 256 ||
      (candidate.kind === 'component-text' &&
        typeof candidate.multiline !== 'boolean') ||
      !Number.isFinite(candidate.rotation)
    ) {
      continue
    }
    if (!candidate.bounds || typeof candidate.bounds !== 'object') continue
    const { x, y, width, height } = candidate.bounds
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0
    ) {
      continue
    }
    if (!rotatedRectIntersectsStage(candidate.bounds, candidate.rotation)) {
      continue
    }
    const maxLength = candidate.kind === 'component-text'
      ? candidate.maxLength
      : undefined
    sanitized.push(Object.freeze({
      ...candidate,
      targetId: `component:${hostKey}:${candidate.targetId}`,
      label: typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.slice(0, 120)
        : candidate.key.slice(0, 120),
      ...(candidate.kind === 'component-text'
        ? (
            maxLength === undefined ||
            (Number.isSafeInteger(maxLength) && maxLength > 0 && maxLength <= 1_000_000)
              ? { maxLength }
              : { maxLength: undefined }
          )
        : {}),
      bounds: Object.freeze({
        x,
        y,
        width,
        height,
      }),
    }))
  }
  return Object.freeze(sanitized)
}

type CanvasAuthoringHit =
  | { kind: 'runtime'; target: Readonly<RuntimeAuthoringTarget> }
  | { kind: 'component'; target: Readonly<ComponentAuthoringTarget> }

export function Workspace({
  onAddImage,
  onAddVideo,
  onSelectImageAsset,
  slideAuthoring,
  interactionDisabled = false,
}: WorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null)
  const stageViewportRef = useRef<HTMLDivElement>(null)
  const gameHostRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<EditorGameHandle | null>(null)
  const runtimeFrameRef = useRef<HTMLIFrameElement>(null)
  const slideAuthoringInputRef = useRef(slideAuthoring)
  slideAuthoringInputRef.current = slideAuthoring
  const interactionDisabledRef = useRef(interactionDisabled)
  interactionDisabledRef.current = interactionDisabled
  const lastParentFocusRef = useRef<HTMLElement | null>(null)
  const authoringFocusRecoveryTimerRef = useRef<number | null>(null)
  const retiredPreviewResourcesRef = useRef(new Set<{
    document: RuntimePreviewBlobResources | null
    payload: RuntimePreviewPayloadResources | null
    timer: number
  }>())
  const activePreviewResourcesRef =
    useRef<ActiveRuntimePreviewResources | null>(null)
  const previousSceneRef = useRef<SceneDocument | null>(null)
  const previousComponentPackagesRef = useRef<
    Record<string, ComponentPackageData> | null
  >(null)
  const previewInitRef = useRef<{
    token: string
    payload: ExportPayload
    assetTransfers: RuntimePreviewAssetTransfer[]
    playerBundle: string
    initialSceneId: string
    initialStateId: string | null
    editingScope: 'scene' | 'global'
    hostMode: PlayerHostMode
    bootstrapSent: boolean
  } | null>(null)
  const authoringReadyRef = useRef(false)
  const authoringRevisionRef = useRef(0)
  const authoringSnapshotBarrierRef =
    useRef<PlayerAuthoringSnapshotBarrier | null>(null)
  const lastRuntimeTargetsRevisionRef = useRef(-1)
  const lastComponentTargetsRevisionRef = useRef(-1)
  const pendingAuthoringNodesRef = useRef(new Map<string, {
    scope: 'scene' | 'global'
    node: SceneNode
  }>())
  const authoringFrameRef = useRef<number | null>(null)
  const runtimeTargetsByHostRef = useRef(new Map<
    string,
    ReadonlyArray<Readonly<RuntimeAuthoringTarget>>
  >())
  const componentTargetsByHostRef = useRef(new Map<
    string,
    ReadonlyArray<Readonly<ComponentAuthoringTarget>>
  >())
  const previewStartupTimerRef = useRef<number | null>(null)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewFeedback, setPreviewFeedback] = useState<RuntimePreviewFeedback>(null)
  const [previewRetryRevision, setPreviewRetryRevision] = useState(0)
  const [acknowledgedPreviewGeneration, setAcknowledgedPreviewGeneration] =
    useState<object | null>(null)
  const [runtimeTargets, setRuntimeTargets] =
    useState<ReadonlyArray<Readonly<RuntimeAuthoringTarget>>>([])
  const [componentTargets, setComponentTargets] =
    useState<ReadonlyArray<Readonly<ComponentAuthoringTarget>>>([])
  const [activeRuntimeTextSession, setActiveRuntimeTextSession] =
    useState<Readonly<RuntimeTargetEditSession> | null>(null)
  const [activeComponentTextSession, setActiveComponentTextSession] =
    useState<Readonly<ComponentTextEditSession> | null>(null)
  const [activeFormulaEditSession, setActiveFormulaEditSession] =
    useState<Readonly<FormulaEditSession> | null>(null)
  const [replacingRuntimeAssetTargetId, setReplacingRuntimeAssetTargetId] =
    useState<string | null>(null)
  const [replacingComponentAssetTargetId, setReplacingComponentAssetTargetId] =
    useState<string | null>(null)
  const [hoveredAuthoringTargetId, setHoveredAuthoringTargetId] =
    useState<string | null>(null)
  const [lastAuthoringSelection, setLastAuthoringSelection] =
    useState<AuthoringCanvasTarget | null>(null)
  const projectRevisionRef = useRef(0)
  const layoutRevisionRef = useRef(0)
  const projectIdentityRef = useRef<string | null>(null)
  const [stageViewportSize, setStageViewportSize] = useState({
    width: STAGE_VIEWPORT_WIDTH,
    height: STAGE_VIEWPORT_HEIGHT,
  })
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const spacePressedRef = useRef(false)
  const panRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    originX: number
    originY: number
  } | null>(null)

  const scene = useEditorStore(selectActiveScene)
  const editingScope = useEditorStore((state) => state.editingScope)
  const storedCanvasMode = useEditorStore((state) => state.canvasMode)
  const hasInjectedSlideAuthoring = slideAuthoring !== undefined
  const canvasMode = hasInjectedSlideAuthoring ? 'edit' : storedCanvasMode
  const activePresentationStateId = useEditorStore(
    (state) => state.activePresentationStateId,
  )
  const editingNodes = useEditorStore(selectEditingNodes)
  const globalLayer = useEditorStore(
    (state) => state.project.globalLayer,
  )
  const selectedNode = useEditorStore(selectSelectedNode)
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds)
  const editingTextNodeId = useEditorStore(
    (state) => state.editingTextNodeId,
  )
  const project = useEditorStore((state) => state.project)
  const assetFiles = useEditorStore((state) => state.assetFiles)
  const componentPackages = useEditorStore(
    (state) => state.componentPackages,
  )
  const setCanvasMode = useEditorStore((state) => state.setCanvasMode)

  const reportUnsupportedInjectedAction = useCallback((label: string) => {
    const injected = slideAuthoringInputRef.current
    if (!injected) return false
    useEditorStore.getState().setStatus(
      `${label}：${injected.unsupportedActionReason}`,
    )
    return true
  }, [])

  useEffect(() => setLastAuthoringSelection(null), [
    editingScope,
    interactionDisabled,
    project.id,
    scene.id,
    slideAuthoring?.sessionId,
  ])

  const stageTransform = useMemo(() => createStageViewportTransform({
    viewport: {
      x: 0,
      y: 0,
      width: stageViewportSize.width,
      height: stageViewportSize.height,
    },
    zoom: view.zoom,
    pan: { x: view.x, y: view.y },
  }), [stageViewportSize.height, stageViewportSize.width, view.x, view.y, view.zoom])

  useEffect(() => {
    if (projectIdentityRef.current !== project.id) {
      projectIdentityRef.current = project.id
      projectRevisionRef.current = 0
      layoutRevisionRef.current = 0
      return
    }
    projectRevisionRef.current += 1
  }, [project])

  useEffect(() => {
    layoutRevisionRef.current += 1
  }, [stageViewportSize.height, stageViewportSize.width, view.x, view.y, view.zoom])
  const injectedPreviewGenerationIdentity = useMemo(
    () => slideAuthoring
      ? workspaceSlidePreviewGenerationIdentity(slideAuthoring)
      : null,
    [
      slideAuthoring?.componentPackages,
      slideAuthoring?.document,
      slideAuthoring?.previewResources,
      slideAuthoring?.sessionId,
    ],
  )
  const injectedPreviewStructuralKey =
    injectedPreviewGenerationIdentity?.structuralKey ?? null
  const activePreviewComponentPackages =
    injectedPreviewGenerationIdentity?.componentPackages ?? componentPackages
  const injectedPreviewAssetFiles =
    injectedPreviewGenerationIdentity?.assetFiles ?? null
  const previewRebuildKey = useMemo(() => {
    if (injectedPreviewStructuralKey !== null) {
      return injectedPreviewStructuralKey
    }
    const nodeIdentity = (node: SceneNode) => ({
      id: node.id,
      type: node.type,
      ...(node.type === 'external-component'
        ? {
            componentId: node.component.packageId,
            componentVersion: node.component.version,
          }
        : {}),
    })
    const runtimeIdentity = (runtime: typeof project.globalRuntime) => runtime
      ? {
          enabled: runtime.enabled,
          runtimeApiVersion: runtime.runtimeApiVersion,
          renderMode: runtime.renderMode,
          source: runtime.source,
          nodeBindings: runtime.nodeBindings ?? null,
          staticFallback: runtime.staticFallback ?? null,
          contentKeys: Object.keys(runtime.content.values).sort(),
          assetKeys: Object.keys(runtime.assets).sort(),
        }
      : null
    // One structural key serves both playback and inspection. Mode, current
    // scene and current presentation state are intentionally absent: changing
    // any of them must preserve the same live Player instance and its last
    // interaction frame. Complete native-node values are synchronized by the
    // authoring patch channel instead of rebuilding the iframe.
    return JSON.stringify({
      scenes: project.scenes.map((item) => ({
        id: item.id,
        nodes: item.nodes.map(nodeIdentity),
        stateIds: ensureScenePresentation(item).states.map((state) => state.id),
        runtime: runtimeIdentity(item.runtime),
        interactions: item.interactions,
      })),
      globalStructure: project.globalLayer.map((item) => ({
        ...nodeIdentity(item.node),
        layer: item.layer,
        visibility: item.visibility,
      })),
      globalRuntime: runtimeIdentity(project.globalRuntime),
      globalInteractions: project.globalInteractions,
      playback: project.playback,
    })
  }, [injectedPreviewStructuralKey, project])
  const previewGeneration = useMemo<object>(() => ({}), [
    activePreviewComponentPackages,
    injectedPreviewAssetFiles,
    injectedPreviewGenerationIdentity?.resourceKey ?? null,
    previewRebuildKey,
    previewRetryRevision,
    injectedPreviewGenerationIdentity?.sessionId ?? null,
  ])
  const authoringCanvasInteractive = !interactionDisabled &&
    isAuthoringCanvasInteractive({
      canvasMode,
      playerReady: authoringReadyRef.current,
      snapshotPending: authoringSnapshotBarrierRef.current !== null,
      hasPreviewFeedback: previewFeedback !== null,
      generationCurrent: acknowledgedPreviewGeneration === previewGeneration,
    })

  useEffect(() => {
    const rememberParentFocus = (event: FocusEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target !== runtimeFrameRef.current
      ) {
        lastParentFocusRef.current = target
      }
    }
    const recoverFromAuthoringFrameFocus = () => {
      if (authoringFocusRecoveryTimerRef.current !== null) {
        window.clearTimeout(authoringFocusRecoveryTimerRef.current)
      }
      authoringFocusRecoveryTimerRef.current = window.setTimeout(() => {
        authoringFocusRecoveryTimerRef.current = null
        const frame = runtimeFrameRef.current
        const previous = lastParentFocusRef.current
        if (
          useEditorStore.getState().canvasMode === 'edit' &&
          frame &&
          window.document.activeElement === frame &&
          previous?.isConnected
        ) {
          previous.focus({ preventScroll: true })
        }
      }, 0)
    }
    window.document.addEventListener('focusin', rememberParentFocus, true)
    window.addEventListener('blur', recoverFromAuthoringFrameFocus)
    return () => {
      window.document.removeEventListener('focusin', rememberParentFocus, true)
      window.removeEventListener('blur', recoverFromAuthoringFrameFocus)
      if (authoringFocusRecoveryTimerRef.current !== null) {
        window.clearTimeout(authoringFocusRecoveryTimerRef.current)
        authoringFocusRecoveryTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isEditableKeyboardTarget(event.target)) {
        spacePressedRef.current = true
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') spacePressedRef.current = false
    }
    const onBlur = () => {
      spacePressedRef.current = false
      panRef.current = null
      setPanning(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  const setZoom = useCallback((zoom: number) => {
    setView((current) => ({
      ...current,
      zoom: Math.max(0.5, Math.min(2, Math.round(zoom * 20) / 20)),
    }))
  }, [])

  const resetView = useCallback(() => {
    setView({ zoom: 1, x: 0, y: 0 })
  }, [])

  useLayoutEffect(() => {
    const viewport = stageViewportRef.current
    if (!viewport) return
    const update = () => {
      const rect = viewport.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      setStageViewportSize((current) => (
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      ))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  const clearRuntimePreviewStartupTimer = useCallback(() => {
    if (previewStartupTimerRef.current === null) return
    window.clearTimeout(previewStartupTimerRef.current)
    previewStartupTimerRef.current = null
  }, [])

  const revokeRetiredPreviewResources = useCallback(() => {
    for (const resources of retiredPreviewResourcesRef.current) {
      window.clearTimeout(resources.timer)
      resources.document?.revoke()
      resources.payload?.revoke()
    }
    retiredPreviewResourcesRef.current.clear()
  }, [])

  const retirePreviewResources = useCallback((
    documentResources: RuntimePreviewBlobResources | null,
    payloadResources: RuntimePreviewPayloadResources | null,
  ) => {
    if (!documentResources && !payloadResources) return
    const resources = {
      document: documentResources,
      payload: payloadResources,
      timer: 0,
    }
    resources.timer = window.setTimeout(() => {
      resources.document?.revoke()
      resources.payload?.revoke()
      retiredPreviewResourcesRef.current.delete(resources)
    }, 10_000)
    retiredPreviewResourcesRef.current.add(resources)
  }, [])

  const failRuntimePreview = useCallback((token: string, message: string) => {
    if (previewInitRef.current?.token !== token) return
    previewInitRef.current = null
    authoringReadyRef.current = false
    authoringSnapshotBarrierRef.current = null
    setAcknowledgedPreviewGeneration(null)
    clearRuntimePreviewStartupTimer()
    if (authoringFrameRef.current !== null) {
      window.cancelAnimationFrame(authoringFrameRef.current)
      authoringFrameRef.current = null
    }
    pendingAuthoringNodesRef.current.clear()
    runtimeTargetsByHostRef.current.clear()
    componentTargetsByHostRef.current.clear()
    lastRuntimeTargetsRevisionRef.current = -1
    lastComponentTargetsRevisionRef.current = -1
    setRuntimeTargets([])
    setComponentTargets([])
    setActiveRuntimeTextSession(null)
    setActiveComponentTextSession(null)
    setHoveredAuthoringTargetId(null)
    setReplacingRuntimeAssetTargetId(null)
    stopRuntimePreviewFrame(runtimeFrameRef.current)
    setPreviewUrl(null)
    activePreviewResourcesRef.current = releaseRuntimePreviewResources(
      activePreviewResourcesRef.current,
      token,
    )
    setPreviewFeedback({
      kind: 'error',
      title: '统一画布启动失败',
      message,
    })
  }, [clearRuntimePreviewStartupTimer])

  const retryRuntimePreview = useCallback(() => {
    setPreviewFeedback({
      kind: 'loading',
      title: '正在重新准备画布',
      message: '正在重新创建隔离播放器…',
    })
    setPreviewRetryRevision((revision) => revision + 1)
  }, [])

  const syncRuntimePreview = useCallback(() => {
    const target = runtimeFrameRef.current?.contentWindow
    if (!target) return
    target.postMessage({
      type: 'courseware-editor:set-scene',
      sceneId: scene.id,
    }, '*')
    if (activePresentationStateId !== null) {
      target.postMessage({
        type: 'courseware-editor:set-presentation-state',
        sceneId: scene.id,
        stateId: activePresentationStateId,
      }, '*')
    }
  }, [activePresentationStateId, scene.id])

  const setPlayerInspectionMode = useCallback((enabled: boolean) => {
    const init = previewInitRef.current
    const target = runtimeFrameRef.current?.contentWindow
    if (!init || !target) return false
    authoringReadyRef.current = false
    authoringSnapshotBarrierRef.current = null
    if (enabled) {
      setAcknowledgedPreviewGeneration(null)
      setPreviewFeedback({
        kind: 'loading',
        title: '正在冻结当前交互画面',
        message: '保留最后一帧，并重新测量可编辑文字与图片…',
      })
    }
    target.postMessage({
      type: PLAYER_INSPECTION_MESSAGE_TYPES.set,
      protocolVersion: PLAYER_INSPECTION_PROTOCOL_VERSION,
      sessionId: init.token,
      enabled,
    }, '*')
    return true
  }, [])

  const installAuthoringAssetInPlayer = useCallback((
    imported: ImportedImageAsset,
  ) => {
    const init = previewInitRef.current
    const target = runtimeFrameRef.current?.contentWindow
    if (!init || !target || canvasMode !== 'edit') return false
    const bytes = imported.bytes.slice().buffer
    target.postMessage({
      type: PLAYER_INSPECTION_MESSAGE_TYPES.installAsset,
      protocolVersion: PLAYER_INSPECTION_PROTOCOL_VERSION,
      sessionId: init.token,
      asset: imported.meta,
      bytes,
    }, '*', [bytes])
    return true
  }, [canvasMode])

  const postAuthoringPatch = useCallback((patch: PlayerAuthoringPatch) => {
    const init = previewInitRef.current
    const target = runtimeFrameRef.current?.contentWindow
    // Playback hosts become authorable after the inspection handshake; the
    // ready signal, not their startup mode, is the capability boundary.
    if (
      !target ||
      !init ||
      !authoringReadyRef.current
    ) {
      if (init && authoringSnapshotBarrierRef.current) {
        failRuntimePreview(
          init.token,
          '编辑画布在初始同步期间失去连接。请重新载入画布。',
        )
      }
      return null
    }
    const editorState = useEditorStore.getState()
    const currentScene = selectActiveScene(editorState)
    const injectedSlideAuthoring = slideAuthoringInputRef.current
    authoringRevisionRef.current += 1
    const command: PlayerAuthoringPatchCommand = {
      type: PLAYER_AUTHORING_MESSAGE_TYPES.patch,
      protocolVersion: PLAYER_AUTHORING_PROTOCOL_VERSION,
      sessionId: init.token,
      requestId: crypto.randomUUID(),
      revision: authoringRevisionRef.current,
      context: {
        sceneId: workspaceSlidePreviewSceneId(
          injectedSlideAuthoring,
          currentScene.id,
        ),
        stateId: workspaceSlidePreviewStateId(
          injectedSlideAuthoring,
          editorState.activePresentationStateId,
        ),
      },
      patch,
    }
    try {
      target.postMessage(command, '*')
    } catch {
      if (authoringSnapshotBarrierRef.current) {
        failRuntimePreview(
          init.token,
          '编辑画布在初始同步期间无法继续发送更新。请重新载入画布。',
        )
      }
      return null
    }
    // Property-panel edits may arrive while the initial snapshot is still
    // applying. Move the gate forward so an older snapshot ACK cannot expose
    // a canvas that is still catching up with the editor store.
    if (authoringSnapshotBarrierRef.current) {
      authoringSnapshotBarrierRef.current =
        playerAuthoringSnapshotBarrierForCommand(command)
    }
    return command
  }, [failRuntimePreview])

  useEffect(() => onElementAnimationPreviewRequested(({ action, delayMs }) => {
    if (interactionDisabledRef.current) return
    if (!workspaceAuthoringActionAllowed(
      slideAuthoringInputRef.current,
      'animation-preview',
    )) {
      reportUnsupportedInjectedAction('动画预览暂不可用')
      return
    }
    const store = useEditorStore.getState()
    const currentNode = selectEditingNodes(store).find(
      (node) => node.id === action.nodeId,
    )
    if (!currentNode) {
      store.setStatus('动画预览目标已失效，请重新选择')
      return
    }
    const posted = postAuthoringPatch({
      kind: 'preview-node-motion',
      target: {
        kind: 'native-node',
        scope: store.editingScope,
        nodeId: currentNode.id,
      },
      action,
      delayMs,
    })
    if (!posted) {
      store.setStatus('编辑画布尚未就绪，请稍后重试动画预览')
    }
  }), [postAuthoringPatch, reportUnsupportedInjectedAction])

  const flushAuthoringNodePatches = useCallback(() => {
    authoringFrameRef.current = null
    const pending = [...pendingAuthoringNodesRef.current.values()]
    pendingAuthoringNodesRef.current.clear()
    for (const { scope, node } of pending) {
      postAuthoringPatch({
        kind: 'native-node',
        target: {
          kind: 'native-node',
          scope,
          nodeId: node.id,
        },
        node,
      })
    }
  }, [postAuthoringPatch])

  const queueAuthoringNodePatch = useCallback((
    scope: 'scene' | 'global',
    node: SceneNode,
  ) => {
    pendingAuthoringNodesRef.current.set(
      `${scope}:${node.id}`,
      { scope, node: structuredClone(node) },
    )
    if (authoringFrameRef.current !== null) return
    authoringFrameRef.current = window.requestAnimationFrame(
      flushAuthoringNodePatches,
    )
  }, [flushAuthoringNodePatches])

  const syncCompleteAuthoringSnapshot = useCallback(() => {
    const editorState = useEditorStore.getState()
    const currentScene = selectActiveScene(editorState)
    const injectedSlideAuthoring = slideAuthoringInputRef.current
    const materialized = injectedSlideAuthoring?.document ?? materializeScene(
      currentScene,
      editorState.activePresentationStateId,
    )
    const globalNodes = injectedSlideAuthoring
      ? []
      : editorState.project.globalLayer
    if (authoringFrameRef.current !== null) {
      window.cancelAnimationFrame(authoringFrameRef.current)
      authoringFrameRef.current = null
    }
    pendingAuthoringNodesRef.current.clear()
    const patches: PlayerAuthoringPatch[] = [
      ...materialized.nodes.map((node): PlayerAuthoringPatch => ({
        kind: 'native-node',
        target: { kind: 'native-node', scope: 'scene', nodeId: node.id },
        node,
      })),
      ...globalNodes.map((item): PlayerAuthoringPatch => ({
        kind: 'native-node',
        target: {
          kind: 'native-node',
          scope: 'global',
          nodeId: item.node.id,
        },
        node: item.node,
      })),
      {
        kind: 'scene-background',
        target: { kind: 'scene-background', scope: 'scene' },
        backgroundColor: materialized.backgroundColor,
        backgroundAssetId: materialized.backgroundAssetId ?? null,
      },
      {
        kind: 'scene-order',
        target: { kind: 'scene-order', scope: 'scene' },
        nodeIds: materialized.nodes.map((node) => node.id),
      },
    ]
    let lastCommand: PlayerAuthoringPatchCommand | null = null
    for (const patch of patches) {
      lastCommand = postAuthoringPatch(patch)
      if (!lastCommand) return null
    }
    return lastCommand
  }, [postAuthoringPatch])

  useEffect(() => () => {
    if (authoringFrameRef.current !== null) {
      window.cancelAnimationFrame(authoringFrameRef.current)
      authoringFrameRef.current = null
    }
    pendingAuthoringNodesRef.current.clear()
  }, [])

  useEffect(() => {
    clearRuntimePreviewStartupTimer()
    authoringReadyRef.current = false
    authoringRevisionRef.current = 0
    authoringSnapshotBarrierRef.current = null
    setAcknowledgedPreviewGeneration(null)
    lastRuntimeTargetsRevisionRef.current = -1
    lastComponentTargetsRevisionRef.current = -1
    if (authoringFrameRef.current !== null) {
      window.cancelAnimationFrame(authoringFrameRef.current)
      authoringFrameRef.current = null
    }
    pendingAuthoringNodesRef.current.clear()
    runtimeTargetsByHostRef.current.clear()
    componentTargetsByHostRef.current.clear()
    setRuntimeTargets([])
    setComponentTargets([])
    setActiveRuntimeTextSession(null)
    setActiveComponentTextSession(null)

    let blobResources: RuntimePreviewBlobResources | null = null
    let payloadResources: RuntimePreviewPayloadResources | null = null
    let token: string | null = null
    try {
      const editorState = useEditorStore.getState()
      const initialScene = selectActiveScene(editorState)
      const injectedSlideAuthoring = slideAuthoringInputRef.current
      const previewProject = createWorkspaceSlidePreviewProject(
        project,
        initialScene.id,
        injectedSlideAuthoring,
      )
      const hostMode: PlayerHostMode = 'playback'
      const initialStateId = workspaceSlidePreviewStateId(
        injectedSlideAuthoring,
        editorState.activePresentationStateId ??
          ensureScenePresentation(initialScene).initialStateId,
      )
      const initialSceneId = workspaceSlidePreviewSceneId(
        injectedSlideAuthoring,
        initialScene.id,
      )
      payloadResources = createRuntimePreviewPayloadResources({
        project: previewProject,
        assetFiles: workspaceSlidePreviewAssetFiles(
          injectedSlideAuthoring,
          assetFiles,
        ),
        components: injectedSlideAuthoring?.componentPackages ?? componentPackages,
      })
      const payload = payloadResources.payload
      const playerBundle = loadPlayerBundle()
      const currentToken = crypto.randomUUID()
      token = currentToken
      previewInitRef.current = {
        token: currentToken,
        payload,
        assetTransfers: payloadResources.assetTransfers,
        playerBundle,
        initialSceneId,
        initialStateId,
        editingScope: injectedSlideAuthoring?.editingScope ?? editorState.editingScope,
        hostMode,
        bootstrapSent: false,
      }
      blobResources = createRuntimePreviewBlobResources(
        buildStandaloneHtml(payload, playerBundle),
        currentToken,
      )
      activePreviewResourcesRef.current = {
        token: currentToken,
        document: blobResources,
        payload: payloadResources,
      }
      setPreviewUrl(blobResources.documentUrl)
      setPreviewFeedback({
        kind: 'loading',
        title: injectedSlideAuthoring ||
          useEditorStore.getState().canvasMode === 'edit'
          ? '正在准备编辑画布'
          : '正在准备当前位置试运行',
        message: '正在载入隔离 Player…',
      })
      previewStartupTimerRef.current = window.setTimeout(() => {
        failRuntimePreview(
          currentToken,
          injectedSlideAuthoring
            ? '播放器在 12 秒内没有完成启动与初始画面同步。请重试；若仍失败，请检查当前课件的动态内容或复用内容。'
            : '播放器在 12 秒内没有完成启动与初始画面同步。请重试；若仍失败，请检查当前工程的运行时或组件。',
        )
      }, RUNTIME_PREVIEW_STARTUP_TIMEOUT_MS)
    } catch (error) {
      if (token) {
        activePreviewResourcesRef.current = releaseRuntimePreviewResources(
          activePreviewResourcesRef.current,
          token,
        )
      }
      blobResources?.revoke()
      blobResources = null
      payloadResources?.revoke()
      payloadResources = null
      previewInitRef.current = null
      setAcknowledgedPreviewGeneration(null)
      const message = error instanceof Error ? error.message : String(error)
      setPreviewUrl(null)
      setPreviewFeedback({
        kind: 'error',
        title: '统一画布创建失败',
        message,
      })
    }

    return () => {
      clearRuntimePreviewStartupTimer()
      if (token && previewInitRef.current?.token === token) {
        previewInitRef.current = null
      }
      const activeResources = activePreviewResourcesRef.current
      if (token && activeResources?.token === token) {
        activePreviewResourcesRef.current = null
        retirePreviewResources(
          activeResources.document,
          activeResources.payload,
        )
      }
      blobResources = null
      payloadResources = null
    }
  }, [
    clearRuntimePreviewStartupTimer,
    failRuntimePreview,
    previewGeneration,
    retirePreviewResources,
  ])

  useEffect(() => () => revokeRetiredPreviewResources(), [
    revokeRetiredPreviewResources,
  ])

  useEffect(() => {
    if (canvasMode === 'run') {
      authoringReadyRef.current = false
      authoringSnapshotBarrierRef.current = null
      setAcknowledgedPreviewGeneration(null)
      setPreviewFeedback(null)
      setPlayerInspectionMode(false)
      syncRuntimePreview()
    } else {
      setPlayerInspectionMode(true)
    }
  }, [canvasMode, setPlayerInspectionMode, syncRuntimePreview])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== runtimeFrameRef.current?.contentWindow) return
      const message = event.data as {
        type?: unknown
        token?: unknown
        protocolVersion?: unknown
        sessionId?: unknown
        revision?: unknown
        message?: unknown
        code?: unknown
        enabled?: unknown
        accepted?: unknown
        sceneId?: unknown
        stateId?: unknown
        update?: PlayerRuntimeAuthoringTargetsMessage['update'] |
          PlayerComponentAuthoringTargetsMessage['update']
        detail?: {
          sceneId?: unknown
          stateId?: unknown
          presentationStateId?: unknown
        }
      } | null
      if (!message || typeof message.type !== 'string') return
      if (
        isCurrentRuntimePreviewBootstrapMessage(
          message,
          previewInitRef.current?.token,
          'courseware-preview-bootstrap:ready',
        )
      ) {
        const init = previewInitRef.current
        if (!init || init.bootstrapSent) return
        setPreviewFeedback({
          kind: 'loading',
          title: init.hostMode === 'authoring'
            ? '正在启动编辑画布'
            : '正在启动当前位置试运行',
          message: '隔离页面已连接，正在启动 Player…',
        })
        const target = runtimeFrameRef.current?.contentWindow
        if (!target) return
        init.bootstrapSent = true
        try {
          target.postMessage({
            type: 'courseware-preview-bootstrap:init',
            ...init,
          }, '*', init.assetTransfers.map((asset) => asset.bytes))
        } catch (error) {
          init.bootstrapSent = false
          failRuntimePreview(
            init.token,
            error instanceof Error
              ? `素材传输失败：${error.message}`
              : '素材传输失败。',
          )
        }
        return
      }
      if (
        isCurrentRuntimePreviewBootstrapMessage(
          message,
          previewInitRef.current?.token,
          'courseware-preview-bootstrap:error',
        )
      ) {
        const token = previewInitRef.current?.token
        if (!token) return
        failRuntimePreview(
          token,
          typeof message.message === 'string' && message.message.trim()
            ? message.message
            : '播放器脚本执行失败。',
        )
        return
      }
      if (
        message.type.startsWith('courseware-player:') &&
        !isCurrentRuntimePreviewPlayerMessage(
          message,
          previewInitRef.current?.token,
        )
      ) {
        return
      }
      if (message.type === 'courseware-player:ready') {
        if (canvasMode === 'run') {
          clearRuntimePreviewStartupTimer()
          setPreviewFeedback(null)
          setPlayerInspectionMode(false)
          syncRuntimePreview()
        } else {
          setPlayerInspectionMode(true)
        }
        return
      }
      if (message.type === PLAYER_INSPECTION_MESSAGE_TYPES.changed) {
        const inspection = message as PlayerInspectionModeMessage & {
          token?: unknown
        }
        if (
          inspection.protocolVersion !== PLAYER_INSPECTION_PROTOCOL_VERSION ||
          inspection.sessionId !== previewInitRef.current?.token
        ) return
        if (!inspection.accepted) {
          const token = previewInitRef.current?.token
          if (token && canvasMode === 'edit') {
            failRuntimePreview(
              token,
              '当前 Player 无法进入原地检查模式。请重新载入画布。',
            )
          }
          return
        }
        if (!inspection.enabled) {
          authoringReadyRef.current = false
          authoringSnapshotBarrierRef.current = null
          clearRuntimePreviewStartupTimer()
          setPreviewFeedback(null)
        }
        return
      }
      if (message.type === PLAYER_AUTHORING_MESSAGE_TYPES.ready) {
        const init = previewInitRef.current
        if (!init || canvasMode !== 'edit') return
        if (authoringReadyRef.current) return
        const parsed = parsePlayerAuthoringReadyMessage(event.data)
        if (!parsed.ok) {
          failRuntimePreview(
            init.token,
            `编辑画布握手无效：${parsed.message}。请重新载入画布。`,
          )
          return
        }
        const editorState = useEditorStore.getState()
        const active = selectActiveScene(editorState)
        const injectedSlideAuthoring = slideAuthoringInputRef.current
        const expectedStateId = workspaceSlidePreviewStateId(
          injectedSlideAuthoring,
          editorState.activePresentationStateId ??
            ensureScenePresentation(active).initialStateId,
        )
        const expectedSceneId = workspaceSlidePreviewSceneId(
          injectedSlideAuthoring,
          active.id,
        )
        if (
          parsed.ready.sessionId !== init.token ||
          parsed.ready.context.sceneId !== expectedSceneId ||
          parsed.ready.context.stateId !== expectedStateId
        ) {
          failRuntimePreview(
            init.token,
            '编辑画布返回了不一致的场景或状态。请重新载入画布。',
          )
          return
        }
        authoringReadyRef.current = true
        authoringSnapshotBarrierRef.current = null
        setAcknowledgedPreviewGeneration(previewGeneration)
        clearRuntimePreviewStartupTimer()
        setPreviewFeedback(null)
        useEditorStore.getState().setStatus(
          '已冻结当前位置，可直接点选并修改当前交互画面',
        )
        return
      }
      if (message.type === PLAYER_AUTHORING_MESSAGE_TYPES.ack) {
        const barrier = authoringSnapshotBarrierRef.current
        if (!barrier) return
        if (!isPlayerAuthoringSnapshotAck(event.data, barrier)) return
        if (pendingAuthoringNodesRef.current.size > 0) {
          if (authoringFrameRef.current !== null) {
            window.cancelAnimationFrame(authoringFrameRef.current)
          }
          flushAuthoringNodePatches()
          return
        }
        authoringSnapshotBarrierRef.current = null
        clearRuntimePreviewStartupTimer()
        setAcknowledgedPreviewGeneration(previewGeneration)
        setPreviewFeedback(null)
        return
      }
      if (
        message.type === PLAYER_AUTHORING_MESSAGE_TYPES.runtimeTargets &&
        message.protocolVersion === PLAYER_AUTHORING_PROTOCOL_VERSION &&
        message.sessionId === previewInitRef.current?.token &&
        typeof message.revision === 'number' &&
        Number.isSafeInteger(message.revision) &&
        message.revision > lastRuntimeTargetsRevisionRef.current &&
        message.update &&
        typeof message.update.scope === 'string' &&
        Array.isArray(message.update.targets)
      ) {
        lastRuntimeTargetsRevisionRef.current = message.revision
        const hostKey = `${message.update.scope}:${message.update.sceneId ?? ''}`
        runtimeTargetsByHostRef.current.set(
          hostKey,
          sanitizeRuntimeAuthoringTargets(
            message.update as PlayerRuntimeAuthoringTargetsMessage['update'],
            hostKey,
          ),
        )
        setRuntimeTargets(
          [...runtimeTargetsByHostRef.current.values()].flat(),
        )
        return
      }
      if (
        message.type === PLAYER_AUTHORING_MESSAGE_TYPES.componentTargets &&
        message.protocolVersion === PLAYER_AUTHORING_PROTOCOL_VERSION &&
        message.sessionId === previewInitRef.current?.token &&
        typeof message.revision === 'number' &&
        Number.isSafeInteger(message.revision) &&
        message.revision > lastComponentTargetsRevisionRef.current &&
        message.update &&
        typeof message.update.scope === 'string' &&
        'nodeId' in message.update &&
        typeof message.update.nodeId === 'string' &&
        Array.isArray(message.update.targets)
      ) {
        lastComponentTargetsRevisionRef.current = message.revision
        const hostKey = [
          message.update.scope,
          message.update.sceneId ?? '',
          message.update.nodeId,
        ].join(':')
        componentTargetsByHostRef.current.set(
          hostKey,
          sanitizeComponentAuthoringTargets(
            message.update as PlayerComponentAuthoringTargetsMessage['update'],
            hostKey,
          ),
        )
        setComponentTargets(
          [...componentTargetsByHostRef.current.values()].flat(),
        )
        return
      }
      if (
        message.type === PLAYER_AUTHORING_MESSAGE_TYPES.error &&
        message.protocolVersion === PLAYER_AUTHORING_PROTOCOL_VERSION &&
        message.sessionId === previewInitRef.current?.token
      ) {
        const token = previewInitRef.current?.token
        if (token && authoringSnapshotBarrierRef.current) {
          failRuntimePreview(
            token,
            typeof message.message === 'string'
              ? `初始画面同步失败：${message.message}。请重新载入画布。`
              : '初始画面同步失败。请重新载入画布。',
          )
          return
        }
        useEditorStore.getState().setStatus(
          typeof message.message === 'string'
            ? `画布同步未应用：${message.message}`
            : '画布同步未应用，请重试。',
        )
        return
      }
      if (
        canvasMode === 'run' &&
        message.type === 'courseware-player:scene-change' &&
        typeof message.detail?.sceneId === 'string'
      ) {
        const nextScene = useEditorStore.getState().project.scenes.find(
          (item) => item.id === message.detail?.sceneId,
        )
        if (!nextScene) return
        const reportedStateId = typeof message.detail?.presentationStateId === 'string' &&
          findPresentationState(nextScene, message.detail.presentationStateId)
          ? message.detail.presentationStateId
          : ensureScenePresentation(nextScene).initialStateId
        useEditorStore.setState((state) => ({
          ...state,
          activeSceneId: nextScene.id,
          activePresentationStateId: reportedStateId,
          editingScope: 'scene',
          selectedNodeId: null,
          selectedNodeIds: [],
          editingTextNodeId: null,
          textEditSession: null,
          statusMessage: `当前位置试运行：${nextScene.name}`,
        }))
      } else if (
        canvasMode === 'run' &&
        message.type === 'courseware-player:presentation-change' &&
        typeof message.detail?.stateId === 'string'
      ) {
        const stateId = message.detail.stateId
        const current = selectActiveScene(useEditorStore.getState())
        if (
          typeof message.detail.sceneId === 'string' &&
          message.detail.sceneId !== current.id
        ) {
          return
        }
        if (!findPresentationState(current, stateId)) return
        useEditorStore.setState({
          activePresentationStateId: stateId,
          statusMessage: `试运行状态：${findPresentationState(current, stateId)?.name ?? stateId}`,
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [
    canvasMode,
    clearRuntimePreviewStartupTimer,
    failRuntimePreview,
    flushAuthoringNodePatches,
    previewGeneration,
    setPlayerInspectionMode,
    syncCompleteAuthoringSnapshot,
    syncRuntimePreview,
  ])

  const fallbackDocument = useMemo<SceneDocument>(() => {
    if (editingScope === 'scene') {
      return materializeScene(scene, activePresentationStateId)
    }
    const layerOrder = { underlay: 0, overlay: 1 } as const
    return {
      id: '__editor_global_layer__',
      name: '全局层',
      backgroundColor: scene.backgroundColor,
      backgroundAssetId: scene.backgroundAssetId,
      interactions: [],
      nodes: [...globalLayer]
        .sort((left, right) => layerOrder[left.layer] - layerOrder[right.layer])
        .map((item) => item.node),
    }
  }, [activePresentationStateId, editingScope, globalLayer, scene])
  const fallbackSlideAuthoring = useMemo<WorkspaceSlideAuthoringInput>(() => ({
    sessionId: `legacy-${project.id}`,
    document: fallbackDocument,
    componentPackages,
    previewResources: {
      assets: project.assets,
      assetFiles,
      componentPackages: project.componentPackages,
      designTokens: project.designTokens,
      media: project.media,
    },
    selectedNodeIds,
    sceneName: scene.name,
    stateName: editingScope === 'global'
      ? '全局层'
      : activePresentationStateId === null
        ? '基础'
        : ensureScenePresentation(scene).states.find(
            (state) => state.id === activePresentationStateId,
          )?.name ?? '状态',
    editingScope,
    unsupportedActionReason: '',
    onSelectionChange: ({ nodeIds, additive }) => {
      const store = useEditorStore.getState()
      if (!additive) {
        store.selectNodes(nodeIds)
        return true
      }
      const merged = new Set(store.selectedNodeIds)
      for (const nodeId of nodeIds) {
        if (merged.has(nodeId)) merged.delete(nodeId)
        else merged.add(nodeId)
      }
      store.selectNodes([...merged])
      return true
    },
    onMoveEnd: ({ nodes }) => {
      const store = useEditorStore.getState()
      if (nodes.length === 1) {
        const [{ nodeId, x, y }] = nodes
        store.updateNode(nodeId, { x, y })
        return true
      }
      store.updateNodes(
        nodes.map(({ nodeId, x, y }) => ({ nodeId, patch: { x, y } })),
      )
      return true
    },
  }), [
    activePresentationStateId,
    assetFiles,
    componentPackages,
    editingScope,
    fallbackDocument,
    scene,
    project,
    selectedNodeIds,
  ])
  const activeSlideAuthoring = resolveWorkspaceSlideAuthoringInput(
    fallbackSlideAuthoring,
    slideAuthoring,
  )
  const activeSlideAuthoringRef = useRef(activeSlideAuthoring)
  activeSlideAuthoringRef.current = activeSlideAuthoring
  const document = activeSlideAuthoring.document
  const authoringComponentPackages = activeSlideAuthoring.componentPackages
  const authoringSelectedNodeIds = activeSlideAuthoring.selectedNodeIds
  const authoringEditingScope = activeSlideAuthoring.editingScope

  const editingNode = useMemo(
    () =>
      !hasInjectedSlideAuthoring && editingTextNodeId
        ? (document.nodes.find(
            (node) => node.id === editingTextNodeId && node.type === 'text',
          ) as TextNode | undefined)
        : undefined,
    [document.nodes, editingTextNodeId, hasInjectedSlideAuthoring],
  )
  const editingFormulaNode = useMemo<FormulaNode | undefined>(() => {
    const session = activeFormulaEditSession
    if (
      hasInjectedSlideAuthoring ||
      !session ||
      canvasMode !== 'edit' ||
      session.projectId !== project.id ||
      session.scope !== editingScope ||
      session.sceneId !== scene.id ||
      session.stateId !== activePresentationStateId
    ) {
      return undefined
    }
    return document.nodes.find((node): node is FormulaNode => (
      node.id === session.nodeId && node.type === 'formula'
    ))
  }, [
    activeFormulaEditSession,
    activePresentationStateId,
    canvasMode,
    document.nodes,
    editingScope,
    hasInjectedSlideAuthoring,
    project.id,
    scene.id,
  ])

  useEffect(() => {
    if (activeFormulaEditSession && !editingFormulaNode) {
      setActiveFormulaEditSession(null)
    }
  }, [activeFormulaEditSession, editingFormulaNode])
  const visibleRuntimeTargets = useMemo(
    () => hasInjectedSlideAuthoring
      ? []
      : runtimeTargets.filter((target) => (
          (target.kind === 'text' || target.kind === 'asset') &&
          runtimeTargetMatchesEditingContext(target, editingScope, scene.id)
        )),
    [editingScope, hasInjectedSlideAuthoring, runtimeTargets, scene.id],
  )
  const visibleComponentTargets = useMemo(
    () => hasInjectedSlideAuthoring
      ? []
      : componentTargets.filter((target) => {
          if (target.scope !== editingScope) return false
          if (target.scope === 'scene' && target.sceneId !== scene.id) return false
          return document.nodes.some((node) => (
            node.id === target.nodeId &&
            node.type === 'external-component' &&
            node.visible
          ))
        }),
    [
      componentTargets,
      document.nodes,
      editingScope,
      hasInjectedSlideAuthoring,
      scene.id,
    ],
  )
  const activeComponentTextTarget = useMemo(() => {
    if (
      !activeComponentTextSession ||
      !componentTextEditSessionMatchesContext(activeComponentTextSession, {
        projectId: project.id,
        scope: editingScope,
        sceneId: scene.id,
        stateId: activePresentationStateId,
      })
    ) {
      return undefined
    }
    return visibleComponentTargets.find((target): target is ComponentAuthoringTextTarget => (
      target.kind === 'component-text' &&
      componentTextTargetMatchesSession(target, activeComponentTextSession)
    ))
  }, [
    activeComponentTextSession,
    activePresentationStateId,
    editingScope,
    project.id,
    scene.id,
    visibleComponentTargets,
  ])
  const componentEditingNode = useMemo(
    () => activeComponentTextSession && activeComponentTextTarget
      ? document.nodes.find(
          (node): node is ExternalComponentNode => (
            node.id === activeComponentTextSession.nodeId &&
            node.type === 'external-component' &&
            node.component.packageId === activeComponentTextSession.componentId &&
            node.component.version === activeComponentTextSession.componentVersion
          ),
        )
      : undefined,
    [activeComponentTextSession, activeComponentTextTarget, document.nodes],
  )
  const componentEditingValue = activeComponentTextSession?.initialValue ?? ''
  const activeRuntimeTextTarget = useMemo(() => {
    if (
      !activeRuntimeTextSession ||
      activeRuntimeTextSession.kind !== 'text' ||
      !runtimeTargetEditSessionMatchesContext(activeRuntimeTextSession, {
        projectId: project.id,
        scope: editingScope,
        sceneId: scene.id,
      })
    ) {
      return undefined
    }
    return visibleRuntimeTargets.find((target) => (
      runtimeTargetMatchesEditSession(target, activeRuntimeTextSession)
    ))
  }, [
    activeRuntimeTextSession,
    editingScope,
    project.id,
    scene.id,
    visibleRuntimeTargets,
  ])
  const activeRuntimeTextValue = activeRuntimeTextTarget?.kind === 'text'
    ? (activeRuntimeTextTarget.scope === 'global'
        ? project.globalRuntime
        : scene.runtime
      )?.content.values[activeRuntimeTextTarget.key] ?? ''
    : ''

  useEffect(() => {
    if (
      canvasMode !== 'edit' ||
      !activeRuntimeTextSession ||
      !activeRuntimeTextTarget
    ) {
      setActiveRuntimeTextSession(null)
    }
  }, [activeRuntimeTextSession, activeRuntimeTextTarget, canvasMode])

  useEffect(() => {
    if (
      canvasMode !== 'edit' ||
      !activeComponentTextSession ||
      !activeComponentTextTarget
    ) {
      setActiveComponentTextSession(null)
    }
  }, [activeComponentTextSession, activeComponentTextTarget, canvasMode])

  const currentComponentTextEditContext = useCallback(
    (): ComponentTextEditContext => {
      const store = useEditorStore.getState()
      const nodes = selectEditingNodes(store)
      const visibleComponentNodeIds = new Set(nodes.flatMap((node) => (
        node.type === 'external-component' && node.visible ? [node.id] : []
      )))
      return {
        projectId: store.project.id,
        scope: store.editingScope,
        sceneId: store.activeSceneId,
        stateId: store.activePresentationStateId,
        nodes,
        componentPackages: store.componentPackages,
        // Read the synchronous host registry rather than React render state so
        // a blur racing with target cleanup can never commit a retired target.
        targets: [...componentTargetsByHostRef.current.values()]
          .flat()
          .filter((target): target is Readonly<ComponentAuthoringTextTarget> => (
            target.kind === 'component-text' &&
            target.scope === store.editingScope &&
            (target.scope === 'global' ||
              target.sceneId === store.activeSceneId) &&
            visibleComponentNodeIds.has(target.nodeId)
          )),
      }
    },
    [],
  )

  const currentRuntimeTargetEditContext = useCallback(
    (): RuntimeTargetEditContext => {
      const store = useEditorStore.getState()
      return {
        projectId: store.project.id,
        scope: store.editingScope,
        sceneId: store.activeSceneId,
        stateId: store.activePresentationStateId,
        // Read the synchronous host registry so a commit racing with target
        // cleanup cannot write into a replacement Runtime that happens to use
        // the same content or asset key.
        targets: [...runtimeTargetsByHostRef.current.values()]
          .flat()
          .filter((target) => (
            (target.kind === 'text' || target.kind === 'asset') &&
            runtimeTargetMatchesEditingContext(
              target,
              store.editingScope,
              store.activeSceneId,
            )
          )),
      }
    },
    [],
  )

  const beginComponentTextEdit = useCallback((
    target: Readonly<ComponentAuthoringTextTarget>,
  ) => {
    if (interactionDisabledRef.current) return
    if (!workspaceAuthoringActionAllowed(
      slideAuthoringInputRef.current,
      'component-edit',
    )) {
      reportUnsupportedInjectedAction('复用内容编辑暂不可用')
      return
    }
    useEditorStore.getState().commitTextEdit()
    const store = useEditorStore.getState()
    const result = beginComponentTextEditSession(
      target,
      currentComponentTextEditContext(),
    )
    if (!result.ok) {
      store.setStatus(
        result.reason === 'context-changed'
          ? '组件文字编辑上下文已切换，请重新选择'
          : '组件文字目标已失效，请重新选择',
      )
      setActiveComponentTextSession(null)
      return
    }
    store.selectNode(result.session.nodeId)
    setActiveRuntimeTextSession(null)
    setActiveComponentTextSession(result.session)
  }, [currentComponentTextEditContext, reportUnsupportedInjectedAction])

  const commitComponentText = useCallback((
    session: Readonly<ComponentTextEditSession>,
    value: string,
  ) => {
    if (interactionDisabledRef.current) {
      setActiveComponentTextSession(null)
      return
    }
    if (!workspaceAuthoringActionAllowed(
      slideAuthoringInputRef.current,
      'component-edit',
    )) {
      reportUnsupportedInjectedAction('复用内容编辑暂不可用')
      setActiveComponentTextSession(null)
      return
    }
    const store = useEditorStore.getState()
    const result = resolveComponentTextEdit(
      session,
      value,
      currentComponentTextEditContext(),
    )
    if (!result.ok) {
      store.setStatus(
        result.reason === 'context-changed'
          ? '组件文字编辑上下文已切换，未写入修改'
          : '组件文字目标已失效，未写入修改',
      )
      setActiveComponentTextSession(null)
      return
    }
    store.updateNode(result.nodeId, {
      props: result.props,
    })
    store.setStatus(
      session.stateId === null || session.scope === 'global'
        ? '已更新组件文字'
        : '已更新当前演示状态中的组件文字',
    )
    setActiveComponentTextSession(null)
  }, [currentComponentTextEditContext, reportUnsupportedInjectedAction])

  const beginRuntimeTextEdit = useCallback((
    target: Readonly<RuntimeAuthoringTarget>,
  ) => {
    if (target.kind !== 'text') return
    if (interactionDisabledRef.current) return
    if (!workspaceAuthoringActionAllowed(
      slideAuthoringInputRef.current,
      'runtime-edit',
    )) {
      reportUnsupportedInjectedAction('动态内容编辑暂不可用')
      return
    }
    const store = useEditorStore.getState()
    store.commitTextEdit()
    const result = beginRuntimeTargetEditSession(
      target,
      currentRuntimeTargetEditContext(),
    )
    if (!result.ok) {
      store.setStatus(
        result.reason === 'context-changed'
          ? '运行时文字编辑上下文已切换，请重新选择'
          : '运行时文字目标已失效，请重新选择',
      )
      setActiveRuntimeTextSession(null)
      return
    }
    setActiveComponentTextSession(null)
    setActiveRuntimeTextSession(result.session)
  }, [currentRuntimeTargetEditContext, reportUnsupportedInjectedAction])

  const commitRuntimeText = useCallback((
    session: Readonly<RuntimeTargetEditSession>,
    value: string,
  ) => {
    if (interactionDisabledRef.current) {
      setActiveRuntimeTextSession(null)
      return
    }
    if (!workspaceAuthoringActionAllowed(
      slideAuthoringInputRef.current,
      'runtime-edit',
    )) {
      reportUnsupportedInjectedAction('动态内容编辑暂不可用')
      setActiveRuntimeTextSession(null)
      return
    }
    const store = useEditorStore.getState()
    const result = validateRuntimeTargetEditSession(
      session,
      currentRuntimeTargetEditContext(),
    )
    if (!result.ok) {
      store.setStatus(
        result.reason === 'context-changed'
          ? '运行时文字编辑上下文已切换，未写入修改'
          : '运行时文字目标已失效，未写入修改',
      )
      setActiveRuntimeTextSession(null)
      return
    }
    const target = result.target
    const runtime = target.scope === 'global'
      ? store.project.globalRuntime
      : store.project.scenes.find((item) => item.id === target.sceneId)?.runtime
    if (
      !runtime ||
      target.kind !== 'text' ||
      !Object.prototype.hasOwnProperty.call(runtime.content.values, target.key)
    ) {
      store.setStatus('运行时文字目标已失效，请重新选择')
      setActiveRuntimeTextSession(null)
      return
    }
    const patch = {
      content: {
        ...runtime.content,
        values: {
          ...runtime.content.values,
          [target.key]: value,
        },
      },
    }
    if (target.scope === 'global') {
      store.updateGlobalRuntime(patch)
      store.setStatus('已更新全局运行时文字；此内容由整课共享')
    } else if (target.sceneId) {
      store.updateSceneRuntime(target.sceneId, patch)
      store.setStatus('已更新运行时文字；此内容由当前场景的所有状态共享')
    }
    setActiveRuntimeTextSession(null)
  }, [currentRuntimeTargetEditContext, reportUnsupportedInjectedAction])

  const replaceRuntimeAsset = useCallback(async (
    target: Readonly<RuntimeAuthoringTarget>,
  ) => {
    if (target.kind !== 'asset' || replacingRuntimeAssetTargetId) return
    if (interactionDisabledRef.current) return
    if (!workspaceAuthoringActionAllowed(
      slideAuthoringInputRef.current,
      'runtime-edit',
    )) {
      reportUnsupportedInjectedAction('动态内容素材替换暂不可用')
      return
    }
    const store = useEditorStore.getState()
    const started = beginRuntimeTargetEditSession(
      target,
      currentRuntimeTargetEditContext(),
    )
    if (!started.ok) {
      store.setStatus(
        started.reason === 'context-changed'
          ? '运行时图片编辑上下文已切换，请重新选择'
          : '运行时图片目标已失效，请重新选择',
      )
      return
    }
    const session = started.session
    setReplacingRuntimeAssetTargetId(session.targetId)
    try {
      const imported = await onSelectImageAsset()
      if (!imported) return
      if (interactionDisabledRef.current || slideAuthoringInputRef.current) {
        if (slideAuthoringInputRef.current) {
          reportUnsupportedInjectedAction('动态内容素材替换暂不可用')
        }
        return
      }
      installAuthoringAssetInPlayer(imported)
      const latestState = useEditorStore.getState()
      const result = validateRuntimeTargetEditSession(
        session,
        currentRuntimeTargetEditContext(),
      )
      if (!result.ok) {
        latestState.setStatus(
          result.reason === 'context-changed'
            ? '运行时图片编辑上下文已切换，未写入修改'
            : '运行时图片目标已失效，未写入修改',
        )
        return
      }
      const liveTarget = result.target
      const runtime = liveTarget.scope === 'global'
        ? latestState.project.globalRuntime
        : latestState.project.scenes.find(
            (item) => item.id === liveTarget.sceneId,
          )?.runtime
      if (
        liveTarget.kind !== 'asset' ||
        !runtime ||
        !Object.prototype.hasOwnProperty.call(runtime.assets, liveTarget.key)
      ) {
        latestState.setStatus('运行时图片目标已失效，请重新选择')
        return
      }
      const patch = {
        assets: {
          ...runtime.assets,
          [liveTarget.key]: { assetId: imported.meta.id },
        },
      }
      const activeTabBeforeImport = latestState.activeTab
      latestState.importAsset(imported.meta, imported.bytes)
      useEditorStore.setState({ activeTab: activeTabBeforeImport })
      if (liveTarget.scope === 'global') {
        latestState.updateGlobalRuntime(patch)
        latestState.setStatus('已替换全局运行时图片；此素材由整课共享')
      } else if (liveTarget.sceneId) {
        latestState.updateSceneRuntime(liveTarget.sceneId, patch)
        latestState.setStatus('已替换运行时图片；此素材由当前场景的所有状态共享')
      }
    } finally {
      setReplacingRuntimeAssetTargetId(null)
    }
  }, [
    currentRuntimeTargetEditContext,
    installAuthoringAssetInPlayer,
    onSelectImageAsset,
    reportUnsupportedInjectedAction,
    replacingRuntimeAssetTargetId,
  ])

  const replaceComponentAsset = useCallback(async (
    target: Readonly<ComponentAuthoringAssetTarget>,
  ) => {
    if (replacingComponentAssetTargetId) return
    if (interactionDisabledRef.current) return
    if (!workspaceAuthoringActionAllowed(
      slideAuthoringInputRef.current,
      'component-edit',
    )) {
      reportUnsupportedInjectedAction('复用内容素材替换暂不可用')
      return
    }
    const startedState = useEditorStore.getState()
    const startedNode = selectEditingNodes(startedState).find(
      (node): node is ExternalComponentNode => (
        node.id === target.nodeId &&
        node.type === 'external-component' &&
        node.component.packageId === target.componentId &&
        node.visible
      ),
    )
    const registered = [...componentTargetsByHostRef.current.values()]
      .flat()
      .some((candidate) => (
        candidate.kind === 'component-asset' &&
        candidate.targetId === target.targetId &&
        candidate.scope === startedState.editingScope &&
        (candidate.scope === 'global' ||
          candidate.sceneId === startedState.activeSceneId) &&
        candidate.nodeId === target.nodeId &&
        candidate.componentId === target.componentId &&
        candidate.key === target.key
      ))
    if (!startedNode || !registered) {
      startedState.setStatus('组件图片目标已失效，请重新选择')
      return
    }
    const packageData = Object.values(startedState.componentPackages).find(
      (candidate) => (
        candidate.manifest.id === startedNode.component.packageId &&
        candidate.manifest.version === startedNode.component.version
      ),
    )
    const imageField = packageData && resolveComponentEditorProperties(
      packageData.manifest,
      startedNode.props,
    ).some((property) => property.key === target.key && property.type === 'image')
    if (!imageField) {
      startedState.setStatus('组件图片属性已失效，请重新选择')
      return
    }
    const identity = {
      projectId: startedState.project.id,
      scope: startedState.editingScope,
      sceneId: startedState.activeSceneId,
      stateId: startedState.activePresentationStateId,
      nodeId: startedNode.id,
      componentId: startedNode.component.packageId,
      componentVersion: startedNode.component.version,
      key: target.key,
      targetId: target.targetId,
    } as const
    startedState.selectNode(startedNode.id)
    setReplacingComponentAssetTargetId(target.targetId)
    try {
      const imported = await onSelectImageAsset()
      if (!imported) return
      if (interactionDisabledRef.current || slideAuthoringInputRef.current) {
        if (slideAuthoringInputRef.current) {
          reportUnsupportedInjectedAction('复用内容素材替换暂不可用')
        }
        return
      }
      installAuthoringAssetInPlayer(imported)
      const latest = useEditorStore.getState()
      if (
        latest.project.id !== identity.projectId ||
        latest.editingScope !== identity.scope ||
        latest.activeSceneId !== identity.sceneId ||
        latest.activePresentationStateId !== identity.stateId
      ) {
        latest.setStatus('组件图片编辑上下文已切换，未写入修改')
        return
      }
      const liveTarget = [...componentTargetsByHostRef.current.values()]
        .flat()
        .find((candidate): candidate is ComponentAuthoringAssetTarget => (
          candidate.kind === 'component-asset' &&
          candidate.targetId === identity.targetId &&
          candidate.nodeId === identity.nodeId &&
          candidate.componentId === identity.componentId &&
          candidate.key === identity.key
        ))
      const liveNode = selectEditingNodes(latest).find(
        (node): node is ExternalComponentNode => (
          node.id === identity.nodeId &&
          node.type === 'external-component' &&
          node.component.packageId === identity.componentId &&
          node.component.version === identity.componentVersion
        ),
      )
      if (!liveTarget || !liveNode) {
        latest.setStatus('组件图片目标已失效，未写入修改')
        return
      }
      const previousTab = latest.activeTab
      latest.importAsset(imported.meta, imported.bytes)
      useEditorStore.setState({ activeTab: previousTab })
      latest.updateNode(liveNode.id, {
        props: setComponentPropValue(
          liveNode.props,
          identity.key,
          imported.meta.id,
        ),
      })
      latest.setStatus(
        identity.stateId === null || identity.scope === 'global'
          ? '已替换组件图片'
          : '已替换当前演示状态中的组件图片',
      )
    } finally {
      setReplacingComponentAssetTargetId(null)
    }
  }, [
    installAuthoringAssetInPlayer,
    onSelectImageAsset,
    reportUnsupportedInjectedAction,
    replacingComponentAssetTargetId,
  ])

  const canvasAuthoringHitAtClientPoint = useCallback((
    clientX: number,
    clientY: number,
  ): CanvasAuthoringHit | null => {
    const viewport = stageViewportRef.current
    if (!viewport || !authoringCanvasInteractive) return null
    const rect = viewport.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    const transform = createStageViewportTransform({
      viewport: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
      zoom: view.zoom,
      pan: { x: view.x, y: view.y },
    })
    const point = clientToWorld(transform, { x: clientX, y: clientY })
    const ordered = [...visibleRuntimeTargets].sort((left, right) => (
      (left.layer === 'overlay' ? 1 : 0) -
      (right.layer === 'overlay' ? 1 : 0)
    ))
    const runtimeTarget = ordered.reverse().find((candidate) => (
      point.x >= candidate.bounds.x &&
      point.x <= candidate.bounds.x + candidate.bounds.width &&
      point.y >= candidate.bounds.y &&
      point.y <= candidate.bounds.y + candidate.bounds.height
    )) ?? null
    if (runtimeTarget?.layer === 'overlay') {
      return { kind: 'runtime', target: runtimeTarget }
    }
    const componentTarget = [...visibleComponentTargets].reverse().find(
      (candidate) => pointInsideRotatedBounds(
        point,
        candidate.bounds,
        candidate.rotation,
      ),
    )
    if (componentTarget) {
      return { kind: 'component', target: componentTarget }
    }
    if (
      runtimeTarget?.layer === 'underlay' &&
      document.nodes.some((node) => pointInsideSceneNode(point, node))
    ) {
      return null
    }
    return runtimeTarget ? { kind: 'runtime', target: runtimeTarget } : null
  }, [
    authoringCanvasInteractive,
    document.nodes,
    visibleRuntimeTargets,
    view.x,
    view.y,
    view.zoom,
    visibleComponentTargets,
  ])

  const copyAiReferenceFor = useCallback(async (
    selection: AuthoringCanvasTarget,
  ) => {
    if (interactionDisabledRef.current) return
    if (!workspaceAuthoringActionAllowed(
      slideAuthoringInputRef.current,
      'ai-reference',
    )) {
      reportUnsupportedInjectedAction('AI 修改引用暂不可用')
      return
    }
    const store = useEditorStore.getState()
    const reference = copyableAiSelectionReference({
      project: store.project,
      projectRevision: projectRevisionRef.current,
      layoutRevision: layoutRevisionRef.current,
      surfaceId: 'slide:main',
      activeSceneId: store.activeSceneId,
      selection,
    })
    try {
      await navigator.clipboard.writeText(reference)
      store.setStatus('已复制稳定 AI 修改引用；可直接粘贴给 Codex')
    } catch {
      store.setStatus('复制 AI 修改引用失败，请检查系统剪贴板权限')
    }
  }, [reportUnsupportedInjectedAction])

  useLayoutEffect(() => {
    const host = gameHostRef.current
    if (!host) return
    const handle = createEditorGame(host, {
      fixedLogicalSize: true,
    })
    gameRef.current = handle
    const findCanvas = () => {
      const element = host.querySelector('canvas')
      if (element) setCanvas(element)
    }
    findCanvas()
    const observer = new MutationObserver(findCanvas)
    observer.observe(host, { childList: true })
    // Scale.NONE leaves bounds tracking to the host. Hidden Electron windows
    // may throttle Phaser's polling while ancestor layout still moves.
    const refreshPointerBounds = () => {
      const rect = handle.game.canvas.getBoundingClientRect()
      const bounds = handle.game.scale.canvasBounds
      if (
        Math.abs(rect.left - bounds.left) > 0.25 ||
        Math.abs(rect.top - bounds.top) > 0.25 ||
        Math.abs(rect.width - bounds.width) > 0.25 ||
        Math.abs(rect.height - bounds.height) > 0.25
      ) {
        handle.game.scale.refresh()
      }
    }
    host.addEventListener('mousemove', refreshPointerBounds, true)
    host.addEventListener('mousedown', refreshPointerBounds, true)
    host.addEventListener('touchstart', refreshPointerBounds, {
      capture: true,
      passive: true,
    })

    const restoreInjectedNodes = (nodeIds: readonly string[]) => {
      const injected = slideAuthoringInputRef.current
      if (!injected) return
      for (const nodeId of nodeIds) {
        const node = injected.document.nodes.find((item) => item.id === nodeId)
        if (!node) continue
        handle.bridge.applyNode(node)
        if (authoringReadyRef.current) {
          queueAuthoringNodePatch(injected.editingScope, node)
        }
      }
      handle.bridge.selectNodes([...injected.selectedNodeIds])
    }

    const unsubscribers = [
      handle.bridge.onNodeSelected((event) => {
        if (interactionDisabledRef.current) {
          restoreInjectedNodes(event.nodeIds)
          return
        }
        const injected = slideAuthoringInputRef.current
        if (!workspaceSelectionAllowed(injected, event)) {
          restoreInjectedNodes(event.nodeIds)
          reportUnsupportedInjectedAction('多选暂不可用')
          return
        }
        if (!activeSlideAuthoringRef.current.onSelectionChange(event)) {
          restoreInjectedNodes(event.nodeIds)
        }
      }),
      handle.bridge.onNodesTransformPreview(({ nodes }) => {
        if (interactionDisabledRef.current) {
          restoreInjectedNodes(nodes.map((node) => node.nodeId))
          return
        }
        const injected = slideAuthoringInputRef.current
        if (injected) {
          if (!workspaceMoveAllowed(injected, { nodes })) return
          const [{ nodeId, x, y, width, height, rotation }] = nodes
          const current = injected.document.nodes.find(
            (node) => node.id === nodeId && node.type === 'text',
          )
          if (
            !current ||
            width !== current.width ||
            height !== current.height ||
            rotation !== current.rotation
          ) return
          queueAuthoringNodePatch(
            injected.editingScope,
            { ...current, x, y },
          )
          return
        }
        const store = useEditorStore.getState()
        if (store.canvasMode !== 'edit') return
        const currentById = new Map(
          selectEditingNodes(store).map((node) => [node.id, node]),
        )
        for (const { nodeId, ...patch } of nodes) {
          const current = currentById.get(nodeId)
          if (!current) continue
          const normalizedPatch = withDirectionAwareTextAutoSize(
            current,
            patch,
          )
          queueAuthoringNodePatch(
            store.editingScope,
            { ...current, ...normalizedPatch } as SceneNode,
          )
        }
      }),
      handle.bridge.onNodeMoveEnd((event) => {
        if (interactionDisabledRef.current) {
          restoreInjectedNodes([event.nodeId])
          return
        }
        const injected = slideAuthoringInputRef.current
        const moveEvent = { nodes: [event] }
        if (!workspaceMoveAllowed(injected, moveEvent)) {
          restoreInjectedNodes([event.nodeId])
          reportUnsupportedInjectedAction('当前元素移动暂不可用')
          return
        }
        if (!activeSlideAuthoringRef.current.onMoveEnd(moveEvent)) {
          restoreInjectedNodes([event.nodeId])
        }
      }),
      handle.bridge.onNodesMoveEnd((event) => {
        if (interactionDisabledRef.current) {
          restoreInjectedNodes(event.nodes.map((node) => node.nodeId))
          return
        }
        const injected = slideAuthoringInputRef.current
        if (!workspaceMoveAllowed(injected, event)) {
          restoreInjectedNodes(event.nodes.map((node) => node.nodeId))
          reportUnsupportedInjectedAction('多元素移动暂不可用')
          return
        }
        if (!activeSlideAuthoringRef.current.onMoveEnd(event)) {
          restoreInjectedNodes(event.nodes.map((node) => node.nodeId))
        }
      }),
      handle.bridge.onNodeResizeEnd(({ nodeId, x, y, width, height }) => {
        if (interactionDisabledRef.current) {
          restoreInjectedNodes([nodeId])
          return
        }
        if (!workspaceAuthoringActionAllowed(
          slideAuthoringInputRef.current,
          'resize',
        )) {
          restoreInjectedNodes([nodeId])
          reportUnsupportedInjectedAction('缩放元素暂不可用')
          return
        }
        const store = useEditorStore.getState()
        const node = selectEditingNodes(store).find(
          (item) => item.id === nodeId,
        )
        store.updateNode(
          nodeId,
          withDirectionAwareTextAutoSize(
            node,
            { x, y, width, height },
          ),
        )
      }),
      handle.bridge.onNodeRotateEnd(({ nodeId, rotation }) => {
        if (interactionDisabledRef.current) {
          restoreInjectedNodes([nodeId])
          return
        }
        if (!workspaceAuthoringActionAllowed(
          slideAuthoringInputRef.current,
          'rotate',
        )) {
          restoreInjectedNodes([nodeId])
          reportUnsupportedInjectedAction('旋转元素暂不可用')
          return
        }
        useEditorStore.getState().updateNode(nodeId, { rotation })
      }),
      handle.bridge.onNodesTransformEnd(({ nodes }) => {
        if (interactionDisabledRef.current) {
          restoreInjectedNodes(nodes.map((node) => node.nodeId))
          return
        }
        if (!workspaceAuthoringActionAllowed(
          slideAuthoringInputRef.current,
          'multi-transform',
        )) {
          restoreInjectedNodes(nodes.map((node) => node.nodeId))
          reportUnsupportedInjectedAction('多元素变换暂不可用')
          return
        }
        const store = useEditorStore.getState()
        const currentById = new Map(
          selectEditingNodes(store).map((node) => [node.id, node]),
        )
        store.updateNodes(
          nodes.map(({ nodeId, ...patch }) => ({
            nodeId,
            patch: withDirectionAwareTextAutoSize(
              currentById.get(nodeId),
              patch,
            ),
          })),
        )
      }),
      handle.bridge.onTextDoubleClick((nodeId) => {
        if (interactionDisabledRef.current) return
        if (!workspaceAuthoringActionAllowed(
          slideAuthoringInputRef.current,
          'text-edit',
        )) {
          reportUnsupportedInjectedAction('文字编辑暂不可用')
          return
        }
        setActiveFormulaEditSession(null)
        setActiveComponentTextSession(null)
        setActiveRuntimeTextSession(null)
        useEditorStore.getState().selectNode(nodeId)
        useEditorStore.getState().beginTextEdit(nodeId, 'canvas')
      }),
      handle.bridge.onFormulaDoubleClick((nodeId) => {
        if (interactionDisabledRef.current) return
        if (!workspaceAuthoringActionAllowed(
          slideAuthoringInputRef.current,
          'formula-edit',
        )) {
          reportUnsupportedInjectedAction('公式编辑暂不可用')
          return
        }
        const store = useEditorStore.getState()
        const node = selectEditingNodes(store).find((item) => item.id === nodeId)
        if (node?.type !== 'formula' || store.canvasMode !== 'edit') return
        if (store.editingTextNodeId) {
          store.cancelTextEdit()
          handle.bridge.setTextEditing(null)
        }
        setActiveComponentTextSession(null)
        setActiveRuntimeTextSession(null)
        store.selectNode(nodeId)
        setActiveFormulaEditSession({
          projectId: store.project.id,
          scope: store.editingScope,
          sceneId: store.activeSceneId,
          stateId: store.activePresentationStateId,
          nodeId,
        })
      }),
    ]

    return () => {
      observer.disconnect()
      host.removeEventListener('mousemove', refreshPointerBounds, true)
      host.removeEventListener('mousedown', refreshPointerBounds, true)
      host.removeEventListener('touchstart', refreshPointerBounds, true)
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      handle.destroy()
      gameRef.current = null
      setCanvas(null)
    }
  }, [queueAuthoringNodePatch, reportUnsupportedInjectedAction])

  useLayoutEffect(() => {
    // Scale.NONE deliberately leaves sizing to the unified stage, but Phaser
    // then does not observe ancestor CSS transforms. Refresh its cached canvas
    // bounds after every zoom/pan commit so pointer coordinates stay in the
    // same 1280×720 space as the Player and authoring targets.
    gameRef.current?.game.scale.refresh()
  }, [
    stageTransform.scale,
    stageTransform.stageRect.x,
    stageTransform.stageRect.y,
  ])

  useEffect(() => {
    const handle = gameRef.current
    if (!handle) return
    const previous = previousSceneRef.current
    const componentsChanged =
      previousComponentPackagesRef.current !== authoringComponentPackages

    if (
      !previous ||
      previous.id !== document.id ||
      componentsChanged
    ) {
      handle.bridge.loadScene(document, authoringComponentPackages)
    } else {
      const previousById = new Map(previous.nodes.map((node) => [node.id, node]))
      const nextById = new Map(document.nodes.map((node) => [node.id, node]))
      previous.nodes.forEach((node) => {
        if (!nextById.has(node.id)) handle.bridge.removeNode(node.id)
      })
      document.nodes.forEach((node) => {
        const before = previousById.get(node.id)
        if (!before) handle.bridge.addNode(node)
        else if (!nodesEqual(before, node)) handle.bridge.applyNode(node)
      })
      const previousIds = previous.nodes.map((node) => node.id).join('|')
      const nextIds = document.nodes.map((node) => node.id).join('|')
      if (previousIds !== nextIds) {
        handle.bridge.reorderNodes(document.nodes.map((node) => node.id))
      }
    }
    if (canvasMode === 'edit' && authoringReadyRef.current) {
      const previousById = new Map(
        previous?.nodes.map((node) => [node.id, node]) ?? [],
      )
      for (const node of document.nodes) {
        const before = previousById.get(node.id)
        if (!before || !nodesEqual(before, node)) {
          queueAuthoringNodePatch(authoringEditingScope, node)
        }
      }
      if (authoringEditingScope === 'scene') {
        if (
          !previous ||
          previous.backgroundColor !== document.backgroundColor ||
          previous.backgroundAssetId !== document.backgroundAssetId
        ) {
          postAuthoringPatch({
            kind: 'scene-background',
            target: { kind: 'scene-background', scope: 'scene' },
            backgroundColor: document.backgroundColor,
            backgroundAssetId: document.backgroundAssetId ?? null,
          })
        }
        const previousOrder = previous?.nodes.map((node) => node.id).join('|')
        const nextOrder = document.nodes.map((node) => node.id).join('|')
        if (previousOrder !== nextOrder) {
          postAuthoringPatch({
            kind: 'scene-order',
            target: { kind: 'scene-order', scope: 'scene' },
            nodeIds: document.nodes.map((node) => node.id),
          })
        }
      }
    }
    previousSceneRef.current = structuredClone(document)
    previousComponentPackagesRef.current = authoringComponentPackages
  }, [
    authoringComponentPackages,
    authoringEditingScope,
    canvasMode,
    document,
    postAuthoringPatch,
    queueAuthoringNodePatch,
  ])

  useEffect(() => {
    gameRef.current?.bridge.selectNodes([...authoringSelectedNodeIds])
  }, [authoringSelectedNodeIds])

  useLayoutEffect(() => {
    if (!interactionDisabled || !slideAuthoring) return
    if (authoringFrameRef.current !== null) {
      window.cancelAnimationFrame(authoringFrameRef.current)
      authoringFrameRef.current = null
    }
    pendingAuthoringNodesRef.current.clear()
    const bridge = gameRef.current?.bridge
    bridge?.loadScene(
      slideAuthoring.document,
      slideAuthoring.componentPackages,
    )
    if (authoringReadyRef.current) {
      for (const node of slideAuthoring.document.nodes) {
        queueAuthoringNodePatch(slideAuthoring.editingScope, node)
      }
    }
    bridge?.selectNodes([...slideAuthoring.selectedNodeIds])
    bridge?.setTextEditing(null)
  }, [interactionDisabled, queueAuthoringNodePatch, slideAuthoring])

  useEffect(() => {
    if (hasInjectedSlideAuthoring) {
      gameRef.current?.bridge.setTextEditing(null)
      return
    }
    gameRef.current?.bridge.setTextEditing(editingTextNodeId)
    if (!editingTextNodeId && selectedNode?.type === 'text') {
      gameRef.current?.bridge.applyNode(selectedNode)
    }
  }, [editingTextNodeId, hasInjectedSlideAuthoring, selectedNode])

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault()
    if (interactionDisabled || canvasMode !== 'edit') return
    if (!workspaceAuthoringActionAllowed(slideAuthoring, 'drop')) {
      reportUnsupportedInjectedAction('画布拖入暂不可用')
      return
    }
    const value = event.dataTransfer.getData(
      'application/x-courseware-element',
    )
    const viewport = stageViewportRef.current
    if (!value || !viewport) return
    const viewportRect = viewport.getBoundingClientRect()
    if (viewportRect.width <= 0 || viewportRect.height <= 0) return
    const transform = createStageViewportTransform({
      viewport: {
        x: viewportRect.left,
        y: viewportRect.top,
        width: viewportRect.width,
        height: viewportRect.height,
      },
      zoom: view.zoom,
      pan: { x: view.x, y: view.y },
    })
    const rect = transform.stageRect
    if (
      event.clientX < rect.x ||
      event.clientX > rect.x + rect.width ||
      event.clientY < rect.y ||
      event.clientY > rect.y + rect.height
    ) {
      return
    }
    const { x, y } = clientToWorld(transform, {
      x: event.clientX,
      y: event.clientY,
    })
    const store = useEditorStore.getState()
    if (value === 'text') store.addTextNode(x, y)
    else if (value === 'formula') store.addFormulaNode(x, y)
    else if (value === 'rectangle') store.addRectangleNode(x, y)
    else if (value.startsWith('shape:')) {
      store.addShapeNode(value.slice('shape:'.length) as Parameters<typeof store.addShapeNode>[0], x, y)
    }
    else if (value === 'image') onAddImage(x, y)
    else if (value === 'video') onAddVideo(x, y)
    else if (value.startsWith('component-preset:')) {
      const [encodedPackageId, encodedPresetId] = value
        .slice('component-preset:'.length)
        .split(':', 2)
      if (encodedPackageId && encodedPresetId) {
        store.addExternalComponentNode(
          decodeURIComponent(encodedPackageId),
          x,
          y,
          decodeURIComponent(encodedPresetId),
        )
      }
    }
    else if (value.startsWith('component:')) {
      store.addExternalComponentNode(value.slice('component:'.length), x, y)
    }
  }

  return (
    <main
      ref={workspaceRef}
      className={`workspace workspace--${canvasMode}`}
      aria-label="课件画布"
      onDragOver={(event) => {
        if (interactionDisabled || canvasMode !== 'edit') return
        if (!workspaceAuthoringActionAllowed(slideAuthoring, 'drop')) return
        if (
          event.dataTransfer.types.includes(
            'application/x-courseware-element',
          )
        ) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={onDrop}
      onWheel={(event) => {
        if (canvasMode !== 'edit' || (!event.ctrlKey && !event.metaKey)) return
        event.preventDefault()
        setZoom(view.zoom + (event.deltaY < 0 ? 0.1 : -0.1))
      }}
      onPointerDownCapture={(event) => {
        if (
          canvasMode !== 'edit' ||
          (event.button !== 1 && !(event.button === 0 && spacePressedRef.current))
        ) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        panRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          originX: view.x,
          originY: view.y,
        }
        setPanning(true)
      }}
      onPointerMoveCapture={(event) => {
        const pan = panRef.current
        if (!pan || pan.pointerId !== event.pointerId) {
          const hit = canvasAuthoringHitAtClientPoint(event.clientX, event.clientY)
          setHoveredAuthoringTargetId((current) => (
            current === hit?.target.targetId
              ? current
              : hit?.target.targetId ?? null
          ))
          return
        }
        event.preventDefault()
        event.stopPropagation()
        setView((current) => ({
          ...current,
          x: pan.originX + event.clientX - pan.clientX,
          y: pan.originY + event.clientY - pan.clientY,
        }))
      }}
      onPointerUpCapture={(event) => {
        if (panRef.current?.pointerId !== event.pointerId) return
        event.preventDefault()
        event.stopPropagation()
        panRef.current = null
        setPanning(false)
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerLeave={() => setHoveredAuthoringTargetId(null)}
      onDoubleClickCapture={(event) => {
        if (
          interactionDisabled ||
          !authoringCanvasInteractive ||
          (event.target instanceof HTMLElement &&
            event.target.closest(
              '.canvas-plain-text-editor, .text-edit-overlay, .text-edit-toolbar, .formula-edit-dialog',
            ))
        ) {
          return
        }
        const hit = canvasAuthoringHitAtClientPoint(event.clientX, event.clientY)
        if (!hit) return
        event.preventDefault()
        event.stopPropagation()
        if (hit.kind === 'component') {
          setLastAuthoringSelection({ carrier: 'component', target: hit.target })
          if (hit.target.kind === 'component-text') {
            beginComponentTextEdit(hit.target)
          } else {
            setActiveComponentTextSession(null)
            void replaceComponentAsset(hit.target)
          }
        } else if (hit.target.kind === 'text') {
          setLastAuthoringSelection({ carrier: 'runtime', target: hit.target })
          beginRuntimeTextEdit(hit.target)
        } else {
          setLastAuthoringSelection({ carrier: 'runtime', target: hit.target })
          void replaceRuntimeAsset(hit.target)
        }
      }}
    >
      <div className="canvas-mode-switch" role="group" aria-label="画布模式">
        <button
          type="button"
          className={canvasMode === 'edit' ? 'canvas-mode-switch__active' : ''}
          aria-pressed={canvasMode === 'edit'}
          disabled={interactionDisabled}
          onClick={() => {
            if (!slideAuthoring) setCanvasMode('edit')
          }}
        >
          <MousePointer2 size={13} />编辑状态
        </button>
        <button
          type="button"
          className={canvasMode === 'run' ? 'canvas-mode-switch__active' : ''}
          aria-pressed={canvasMode === 'run'}
          disabled={
            interactionDisabled ||
            Boolean(slideAuthoring)
          }
          title={slideAuthoring
            ? activeSlideAuthoring.unsupportedActionReason
            : undefined}
          onClick={() => {
            if (slideAuthoring) {
              reportUnsupportedInjectedAction('当前位置试运行暂不可用')
              return
            }
            setCanvasMode('run')
          }}
        >
          <Play size={13} />当前位置试运行
        </button>
      </div>
      {canvasMode === 'edit' && (
        <div className="canvas-view-controls" role="group" aria-label="画布视图">
          <button type="button" aria-label="缩小画布" onClick={() => setZoom(view.zoom - 0.1)}>
            <Minus size={14} />
          </button>
          <output aria-label="画布缩放比例">{Math.round(view.zoom * 100)}%</output>
          <button type="button" aria-label="放大画布" onClick={() => setZoom(view.zoom + 0.1)}>
            <Plus size={14} />
          </button>
          <button type="button" aria-label="适合窗口" title="重置缩放与平移" onClick={resetView}>
            <Maximize2 size={14} />
          </button>
          <span title="Ctrl+滚轮缩放；按住空格或鼠标中键拖动画布">
            <Hand size={13} />
          </span>
          {!slideAuthoring && (
            <button
              type="button"
              aria-label="复制当前画布目标的 AI 修改引用"
              title={lastAuthoringSelection
                ? '复制稳定作者地址、当前 revision 和当前值'
                : '请先点选一个 Runtime 或 Component 文字/图片'}
              disabled={interactionDisabled || !lastAuthoringSelection}
              onClick={() => {
                if (lastAuthoringSelection) {
                  void copyAiReferenceFor(lastAuthoringSelection)
                }
              }}
            >
              <Copy size={13} />AI 引用
            </button>
          )}
        </div>
      )}
      <div className={`canvas-label${authoringEditingScope === 'global' ? ' canvas-label--global' : ''}`}>
        1280 × 720 · {workspaceCanvasLabel(activeSlideAuthoring)}
      </div>
      <div ref={stageViewportRef} className="canvas-viewport">
        <div
          className="canvas-stage-stack"
          data-panning={panning || undefined}
          style={{
            left: stageTransform.stageRect.x,
            top: stageTransform.stageRect.y,
            width: STAGE_VIEWPORT_WIDTH,
            height: STAGE_VIEWPORT_HEIGHT,
            transform: `scale(${stageTransform.scale})`,
            // Geometry must change atomically: the Player, Phaser hit proxies and
            // authoring targets all consume this transform in the same frame.
            transition: 'none',
          }}
        >
          {previewUrl && (
            <iframe
              ref={runtimeFrameRef}
              className="runtime-preview-frame"
              title={canvasMode === 'edit' ? '统一编辑画布' : '当前位置试运行'}
              sandbox="allow-scripts"
              inert={canvasMode === 'edit'}
              tabIndex={canvasMode === 'edit' ? -1 : undefined}
              aria-hidden={canvasMode === 'edit' ? true : undefined}
              onFocus={() => {
                if (canvasMode !== 'edit') return
                if (authoringFocusRecoveryTimerRef.current !== null) {
                  window.clearTimeout(authoringFocusRecoveryTimerRef.current)
                }
                authoringFocusRecoveryTimerRef.current = window.setTimeout(() => {
                  authoringFocusRecoveryTimerRef.current = null
                  const previous = lastParentFocusRef.current
                  if (
                    window.document.activeElement === runtimeFrameRef.current &&
                    previous?.isConnected
                  ) {
                    previous.focus({ preventScroll: true })
                  }
                }, 0)
              }}
              src={previewUrl}
              onError={() => {
                const token = previewInitRef.current?.token
                if (token) failRuntimePreview(token, '隔离预览页面无法载入。')
              }}
            />
          )}
          <div
            ref={gameHostRef}
            className="canvas-stage canvas-stage--authoring"
            data-testid="canvas-stage"
            aria-hidden={canvasMode === 'run'}
          />
          {authoringCanvasInteractive && (
            visibleRuntimeTargets.length > 0 ||
            visibleComponentTargets.length > 0 ||
            activeRuntimeTextTarget ||
            activeComponentTextTarget
          ) && (
            <div
              className="canvas-authoring-targets"
              data-testid="runtime-authoring-targets"
              aria-label="画布可编辑内容"
            >
              {visibleRuntimeTargets.map((target) => (
                <button
                  key={target.targetId}
                  type="button"
                  className={`canvas-authoring-target canvas-authoring-target--${target.kind}${
                    hoveredAuthoringTargetId === target.targetId
                      ? ' canvas-authoring-target--hovered'
                      : ''
                  }`}
                  aria-label={`${target.label ?? target.key}，双击${target.kind === 'text' ? '编辑文字' : '替换图片'}`}
                  title={`双击${target.kind === 'text' ? '编辑文字' : '替换图片'}：${target.label ?? target.key}`}
                  disabled={replacingRuntimeAssetTargetId === target.targetId}
                  style={{
                    left: target.bounds.x,
                    top: target.bounds.y,
                    width: target.bounds.width,
                    height: target.bounds.height,
                    zIndex: target.layer === 'overlay' ? 2 : 1,
                  }}
                  onFocus={() => setHoveredAuthoringTargetId(target.targetId)}
                  onBlur={() => setHoveredAuthoringTargetId(null)}
                  onClick={() => {
                    setLastAuthoringSelection({ carrier: 'runtime', target })
                    if (target.kind === 'text') {
                      beginRuntimeTextEdit(target)
                    } else {
                      setActiveComponentTextSession(null)
                      void replaceRuntimeAsset(target)
                    }
                  }}
                >
                  <span className="canvas-authoring-target__badge" aria-hidden="true">
                    {target.kind === 'asset'
                      ? <ImagePlus size={14} />
                      : 'T'}
                    <span>{target.label ?? target.key}</span>
                  </span>
                </button>
              ))}
              {activeRuntimeTextSession && activeRuntimeTextTarget?.kind === 'text' && (
                <CanvasPlainTextEditor
                  key={activeRuntimeTextTarget.targetId}
                  bounds={activeRuntimeTextTarget.bounds}
                  label={activeRuntimeTextTarget.label ?? activeRuntimeTextTarget.key}
                  value={activeRuntimeTextValue}
                  multiline={activeRuntimeTextTarget.multiline}
                  maxLength={activeRuntimeTextTarget.maxLength}
                  onCommit={(value) => commitRuntimeText(activeRuntimeTextSession, value)}
                  onCancel={() => setActiveRuntimeTextSession(null)}
                />
              )}
              {visibleComponentTargets.map((target) => (
                <button
                  key={target.targetId}
                  type="button"
                  className={`canvas-authoring-target canvas-authoring-target--${target.kind}${
                    hoveredAuthoringTargetId === target.targetId
                      ? ' canvas-authoring-target--hovered'
                      : ''
                  }`}
                  aria-label={`${target.label}，双击${target.kind === 'component-text' ? '编辑组件文字' : '替换组件图片'}`}
                  title={`双击${target.kind === 'component-text' ? '编辑组件文字' : '替换组件图片'}：${target.label}`}
                  disabled={replacingComponentAssetTargetId === target.targetId}
                  style={{
                    left: target.bounds.x,
                    top: target.bounds.y,
                    width: target.bounds.width,
                    height: target.bounds.height,
                    zIndex: 3,
                    transform: `rotate(${target.rotation}deg)`,
                  }}
                  onFocus={() => setHoveredAuthoringTargetId(target.targetId)}
                  onBlur={() => setHoveredAuthoringTargetId(null)}
                  onClick={() => {
                    setLastAuthoringSelection({ carrier: 'component', target })
                    if (target.kind === 'component-text') {
                      beginComponentTextEdit(target)
                    } else {
                      setActiveComponentTextSession(null)
                      void replaceComponentAsset(target)
                    }
                  }}
                >
                  <span className="canvas-authoring-target__badge" aria-hidden="true">
                    {target.kind === 'component-asset'
                      ? <ImagePlus size={14} />
                      : 'T'}
                    <span>{target.label}</span>
                  </span>
                </button>
              ))}
              {activeComponentTextSession && activeComponentTextTarget && componentEditingNode && (
                <CanvasPlainTextEditor
                  key={activeComponentTextTarget.targetId}
                  bounds={activeComponentTextTarget.bounds}
                  label={activeComponentTextTarget.label}
                  value={componentEditingValue}
                  multiline={activeComponentTextTarget.multiline}
                  maxLength={activeComponentTextTarget.maxLength}
                  rotation={activeComponentTextTarget.rotation}
                  onCommit={(value) => commitComponentText(
                    activeComponentTextSession,
                    value,
                  )}
                  onCancel={() => setActiveComponentTextSession(null)}
                />
              )}
            </div>
          )}
          {previewFeedback && (
            <div
              className={`runtime-preview-loading runtime-preview-loading--${previewFeedback.kind}`}
              role={previewFeedback.kind === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              <div className="runtime-preview-loading__panel">
                {previewFeedback.kind === 'loading' && (
                  <LoaderCircle
                    className="runtime-preview-loading__spinner"
                    size={24}
                    aria-hidden="true"
                  />
                )}
                <strong>{previewFeedback.title}</strong>
                <span>{previewFeedback.message}</span>
                {previewFeedback.kind === 'error' && (
                  <button type="button" onClick={retryRuntimePreview}>
                    <RotateCcw size={14} aria-hidden="true" />重新载入画布
                  </button>
                )}
              </div>
            </div>
          )}
          {!previewUrl && !previewFeedback && (
            <div className="runtime-preview-loading" role="status" aria-live="polite">
              <div className="runtime-preview-loading__panel">
                <LoaderCircle
                  className="runtime-preview-loading__spinner"
                  size={24}
                  aria-hidden="true"
                />
                <strong>正在准备统一画布</strong>
              </div>
            </div>
          )}
        </div>
      </div>
      {!interactionDisabled && canvasMode === 'edit' && editingFormulaNode && (
        <FormulaEditDialog
          key={`${editingFormulaNode.id}:${activePresentationStateId ?? 'base'}`}
          node={editingFormulaNode}
          onCancel={() => setActiveFormulaEditSession(null)}
          onCommit={(ast, accessibleText) => {
            if (interactionDisabledRef.current) {
              setActiveFormulaEditSession(null)
              return
            }
            if (!workspaceAuthoringActionAllowed(
              slideAuthoringInputRef.current,
              'formula-edit',
            )) {
              reportUnsupportedInjectedAction('公式编辑暂不可用')
              setActiveFormulaEditSession(null)
              return
            }
            useEditorStore.getState().updateNode(editingFormulaNode.id, {
              ast,
              accessibleText,
            })
            setActiveFormulaEditSession(null)
          }}
        />
      )}
      {!interactionDisabled && canvasMode === 'edit' && editingNode && canvas && workspaceRef.current && (
        <TextEditOverlay
          key={editingNode.id}
          node={editingNode}
          workspace={workspaceRef.current}
          canvas={canvas}
          onPreview={(text, runs) => {
            if (interactionDisabledRef.current) return
            if (!workspaceAuthoringActionAllowed(
              slideAuthoringInputRef.current,
              'text-edit',
            )) return
            const draftNode = { ...editingNode, text, runs }
            const rendered = editingNode.style.overflow === 'auto-height'
              ? renderTextNodeCanvas(draftNode)
              : null
            useEditorStore
              .getState()
              .updateTextEditDraft(
                editingNode.id,
                text,
                runs,
                rendered?.height ?? editingNode.height,
                rendered?.width ?? editingNode.width,
              )
          }}
          onCommit={(text, runs) => {
            if (interactionDisabledRef.current) {
              gameRef.current?.bridge.setTextEditing(null)
              return
            }
            if (!workspaceAuthoringActionAllowed(
              slideAuthoringInputRef.current,
              'text-edit',
            )) {
              reportUnsupportedInjectedAction('文字编辑暂不可用')
              gameRef.current?.bridge.setTextEditing(null)
              return
            }
            const store = useEditorStore.getState()
            const draftNode = { ...editingNode, text, runs }
            const rendered = editingNode.style.overflow === 'auto-height'
              ? renderTextNodeCanvas(draftNode)
              : null
            store.updateTextEditDraft(
              editingNode.id,
              text,
              runs,
              rendered?.height ?? editingNode.height,
              rendered?.width ?? editingNode.width,
            )
            store.commitTextEdit()

            // Synchronize the committed Store node into Phaser before making
            // the interaction target draggable again. This closes the small
            // window in which the adapter could still hold its old text.
            const committedNode = selectEditingNodes(
              useEditorStore.getState(),
            ).find((node) => node.id === editingNode.id)
            if (committedNode?.type === 'text') {
              gameRef.current?.bridge.applyNode(committedNode)
            }
            gameRef.current?.bridge.setTextEditing(null)
          }}
          onCancel={() => {
            if (interactionDisabledRef.current) {
              gameRef.current?.bridge.setTextEditing(null)
              return
            }
            if (!workspaceAuthoringActionAllowed(
              slideAuthoringInputRef.current,
              'text-edit',
            )) {
              gameRef.current?.bridge.setTextEditing(null)
              return
            }
            const store = useEditorStore.getState()
            store.cancelTextEdit()
            const restoredNode = selectEditingNodes(
              useEditorStore.getState(),
            ).find((node) => node.id === editingNode.id)
            if (restoredNode?.type === 'text') {
              gameRef.current?.bridge.applyNode(restoredNode)
            }
            gameRef.current?.bridge.setTextEditing(null)
          }}
        />
      )}
    </main>
  )
}
