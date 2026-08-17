import { AlertCircle, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  AvailableComponentCatalogPackage,
  ComponentCatalogSnapshot,
} from '../shared/componentCatalog'
import type { ComponentPackageData } from '../shared/componentTypes'
import {
  APP_EXECUTABLE_NAME,
  APP_NAME,
  RECOMMENDED_PROJECT_SCENES,
  RECOMMENDED_SCENE_NODES,
} from '../shared/constants'
import { toUserMessage, UserFacingError } from '../shared/errors'
import type {
  BatchFileRejection,
  RecentProjectEntry,
  RecoveryProjectResult,
  SelectedImageBatchFile,
  SelectedMediaBatchFile,
} from '../shared/ipcTypes'
import type { AssetKind, AssetMeta, ProjectDesignTokens } from '../shared/projectTypes'
import type {
  CourseProjectDocument,
  FlowBlock,
  SpatialCameraPose,
} from '../shared/courseProjectTypes'
import { getEffectiveCourseLayerOrder } from '../shared/courseProjectModel'
import { collectProjectHealth, summarizeProjectHealth } from '../shared/projectHealth'
import { bytesToDataUrl } from './export/base64'
import { buildExportPayload } from './export/buildExportPayload'
import { buildStandaloneHtml } from './export/buildStandaloneHtml'
import { buildWebPackageFromProjectAsync } from './export/buildWebPackage'
import { buildPdfPrintHtml, buildPptx } from './export/buildPptx'
import { buildCoursePrintArtifacts } from './export/course/buildCoursePrintArtifacts'
import { buildFlowDocx, uniqueFlowDocxFilename, type FlowDocxLayerEntry } from './export/course/flowDocx'
import {
  buildPublishedCourseStandaloneHtml,
  buildPublishedCourseWebPackageAsync,
} from './export/course/buildCoursePackages'
import { buildCoursePptx } from './export/course/buildCoursePptx'
import {
  SINGLE_HTML_HARD_LIMIT_BYTES,
  SINGLE_HTML_WARNING_BYTES,
  utf8ByteLength,
} from './export/exportSize'
import {
  collectExportPreflight,
  type ExportPreflightItem,
  type ExportPreflightReport,
} from './export/exportPreflight'
import { loadPlayerBundle } from './export/loadPlayerBundle'
import { renderProjectSceneImagesWithRuntime } from './export/renderSceneImages'
import {
  buildV9SlideWorkspaceSnapshot,
  captureV9SlideVerticalSliceArchive,
  courseV9AssetFilesEqual,
  isV9SlideVerticalSliceDirty,
  registeredV9SlideAssetFiles,
  v9SlideLayerContextKey,
  type V9SlideVerticalSliceState,
} from './course/v9SlideVerticalSlice'
import {
  checkCourseProjectHealth,
  type CourseProjectHealthCheckResult,
} from './course/courseProjectHealthCheck'
import { buildSlideEditorView } from './course/slideEditorView'
import { buildFlowEditorView } from './course/flowEditorView'
import {
  buildSpatialEditorView,
  buildSpatialViewportOverlays,
} from './course/spatialEditorView'
import {
  buildCourseStructureViewModel,
  courseWorkspaceShowsSceneStateStrip,
  deriveCourseEditorLayout,
} from './course/courseEditorLayout'
import {
  captureEditorMenuSnapshot,
  isTextLikeEditorFocus,
  type EditorActionId,
  type EditorSelectionSnapshot,
} from './course/editorActionTypes'
import {
  interpretEditorEntry,
  listEditorActions,
  resolveEditorActionAvailability,
} from './course/editorActionRouting'
import {
  createEffectiveLayerListHandlers,
  toEffectiveLayerListItems,
} from './course/effectiveLayerCommands'
import {
  EditorContextMenu,
  toEditorContextMenuActions,
} from './ui/editor-actions/EditorContextMenu'
import type { FlowEditorBlockInput } from './course/flowEditorCommands'
import {
  v9InteractionSceneDocument,
  v9InteractionSounds,
  v9SlideScenes,
} from './course/slideInteractionView'
import {
  componentPackageSha256,
  importComponentPackageAsync,
} from './components/importComponentPackage'
import {
  buildAssetContentHashIndex,
  createImageAssetImport,
  createMediaAssetImport,
  readImageDimensions,
  readMediaMetadata,
  type ImportedImageAsset,
} from './project/assetManager'
import {
  commitMediaBatchImport,
  planMediaBatchImport,
  type MediaBatchLibraryFallback,
} from './project/mediaBatch'
import {
  createCourseProjectArchiveAsync,
  importProjectV8ArchiveAsCourseProjectAsync,
  openCourseProjectArchiveAsync,
  UnsupportedCourseProjectVersionError,
  type CourseProjectArchiveData,
} from './project/courseProjectArchive'
import { saveCourseProjectAsync } from './project/saveProject'
import { inspectCourseProjectHealth } from './project/courseProjectHealthInspect'
import {
  courseProjectRecoveryRevision,
  resolveCloseDirtyState,
  shouldOfferCourseProjectRecovery,
} from './project/courseProjectLifecycle'
import { RecoveryWriteCoordinator } from './project/recoveryWriteCoordinator'
import {
  selectActiveScene,
  selectEditingNodes,
  selectSelectedNode,
  useEditorStore,
  MAX_BATCH_CANVAS_ITEMS,
  type ImportedAssetBatchItem,
} from './store/editorStore'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { CopyableSummaryDialog } from './ui/CopyableSummaryDialog'
import { ExportSizeWarningDialog } from './ui/ExportSizeWarningDialog'
import { ExportPreflightDialog } from './ui/ExportPreflightDialog'
import {
  RightSidebar,
  type RightSidebarDocumentControl,
  type RightSidebarFlowDocumentControl,
  type RightSidebarSpatialDocumentControl,
} from './ui/RightSidebar'
import {
  ScenePanel,
  type ScenePanelCourseLocation,
  type ScenePanelDocumentControl,
  type ScenePanelFlowDocumentControl,
  type ScenePanelSpatialDocumentControl,
} from './ui/ScenePanel'
import {
  buildCourseSceneThumbnailRenderModel,
} from './ui/SceneThumbnail'
import {
  SceneStateStrip,
  type SceneStateStripDocumentControl,
} from './ui/SceneStateStrip'
import { TopToolbar, type ExportFormat } from './ui/TopToolbar'
import { Workspace } from './ui/Workspace'
import type {
  WorkspaceFlowAuthoringInput,
  WorkspaceSpatialAuthoringInput,
} from './ui/Workspace'
import type { WorkspaceSlideAuthoringInput } from './ui/workspaceSlideAuthoring'
import type { SpatialCameraPanelProps } from './ui/SpatialCameraPanel'
import type { SpatialLayerInspectorProps } from './ui/SpatialLayerInspector'
import type { SpatialPathEditorProps } from './ui/SpatialPathEditor'
import { ProjectHealthPanel } from './ui/ProjectHealthPanel'
import { componentCatalogInstallStatus } from './components/componentCatalogStatus'
import { planCatalogBatchJoin } from './components/componentLibraryModel'

const EMPTY_COMPONENT_CATALOG: ComponentCatalogSnapshot = {
  sources: [],
  packages: [],
  issues: [],
}

function desktopApi() {
  if (!window.desktopAPI) {
    throw new UserFacingError(
      '桌面功能不可用',
      '当前页面未运行在课件编辑器桌面环境中。',
      `请双击 ${APP_EXECUTABLE_NAME}.exe 启动软件。`,
    )
  }
  return window.desktopAPI
}

function readableError(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) {
    console.error(error)
    return `${error.title}：${error.message}\n${error.suggestion}`
  }
  if (error instanceof Error && error.message.trim()) {
    console.error(error)
    return error.message
  }
  return toUserMessage(error, fallback)
}

interface BatchImportIssue {
  name: string
  message: string
}

interface PreparedAssetBatch {
  /** One item per successfully decoded selection; duplicates share asset IDs. */
  placements: ImportedAssetBatchItem[]
  /** Unique content that is not already present in the project. */
  additions: ImportedAssetBatchItem[]
  duplicateCount: number
  issues: BatchImportIssue[]
}

function desktopRejections(issues: BatchFileRejection[]): BatchImportIssue[] {
  return issues.map((issue) => ({
    name: issue.name,
    message: `${issue.message} ${issue.suggestion}`,
  }))
}

async function prepareAssetBatch<T extends {
  name: string
  mimeType: string
  bytes: Uint8Array
  sha256: string
}>(
  files: T[],
  kind: AssetKind,
  build: (file: T) => Promise<ImportedAssetBatchItem>,
  scope?: {
    assets: Readonly<Record<string, AssetMeta>>
    assetFiles: Readonly<Record<string, Uint8Array>>
  },
): Promise<PreparedAssetBatch> {
  const state = useEditorStore.getState()
  const assetRegistry = scope ?? {
    assets: state.project.assets,
    assetFiles: state.assetFiles,
  }
  const hashes = await buildAssetContentHashIndex(
    kind,
    assetRegistry.assets,
    assetRegistry.assetFiles,
  )
  const placements: ImportedAssetBatchItem[] = []
  const additions: ImportedAssetBatchItem[] = []
  const issues: BatchImportIssue[] = []
  let duplicateCount = 0

  for (const file of files) {
    const existing = hashes.get(file.sha256)
    if (existing) {
      duplicateCount += 1
      placements.push(existing)
      continue
    }
    try {
      const imported = await build(file)
      hashes.set(file.sha256, imported)
      additions.push(imported)
      placements.push(imported)
    } catch (error) {
      issues.push({
        name: file.name,
        message: readableError(error, '文件无法解码。'),
      })
    }
  }
  return { placements, additions, duplicateCount, issues }
}

function formatBatchIssueSummary(issues: BatchImportIssue[]): string {
  const shown = issues.slice(0, 5).map((issue) => `• ${issue.name}：${issue.message}`)
  if (issues.length > shown.length) {
    shown.push(`• 其他 ${issues.length - shown.length} 个文件未导入`)
  }
  return shown.join('\n')
}

function isEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

function isInteractiveControlTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(
    target.closest('button, [role="button"], [role="menuitem"], [role="option"]'),
  )
}

function isActiveSlideEditorLocation(
  session: V9SlideVerticalSliceState,
): boolean {
  return session.history.present.locations.some((location) =>
    location.id === session.selection.locationId &&
    location.kind === 'slide-scene',
  )
}

interface V9RecoverySnapshot {
  backend: 'v9'
  project: CourseProjectDocument
  assetFiles: Record<string, Uint8Array>
  componentFiles: Record<string, Record<string, Uint8Array>>
  projectPath: string | null
}

interface V9HealthCheckSnapshot {
  readonly sessionId: string
  readonly archive: CourseProjectArchiveData
  readonly componentPackages: Record<string, ComponentPackageData>
  readonly result: CourseProjectHealthCheckResult
}

function createRecoveryWriteCoordinator(): RecoveryWriteCoordinator<
  V9RecoverySnapshot,
  Uint8Array
> {
  return new RecoveryWriteCoordinator({
    delayMs: 1800,
    async build(snapshot, signal) {
      return createCourseProjectArchiveAsync({
        project: snapshot.project,
        assetFiles: snapshot.assetFiles,
        componentFiles: snapshot.componentFiles,
      }, { signal })
    },
    async write(bytes, snapshot) {
      if (!window.desktopAPI) throw new Error('桌面恢复服务不可用。')
      await window.desktopAPI.writeRecoveryProject({
        projectName: snapshot.project.title,
        projectPath: snapshot.projectPath ?? undefined,
        bytes,
      })
    },
    onSuccess() {
      useEditorStore.getState().setStatus('已自动保存本地恢复副本')
    },
    onError(error) {
      console.error('本地恢复副本更新失败', error)
      useEditorStore.getState().setError('自动恢复副本写入失败，请立即手动保存工程。')
    },
  })
}

export default function App() {
  const v9SlideVerticalSlice = useEditorStore((state) => state.courseSession)
  const [busy, setBusy] = useState(false)
  const [spatialSessionCamera, setSpatialSessionCamera] = useState<SpatialCameraPose | null>(null)
  const [editorMenu, setEditorMenu] = useState<{
    snapshot: EditorSelectionSnapshot
    point: { x: number; y: number }
  } | null>(null)
  const editorMenuFocusRef = useRef<HTMLElement | null>(null)
  const [componentPackageRequest, setComponentPackageRequest] = useState<
    | {
      mode: 'replace'
      packageId: string
      packageData: ComponentPackageData
      sourceFileName: string
    }
    | null
  >(null)
  const [componentCatalog, setComponentCatalog] = useState<ComponentCatalogSnapshot>(
    EMPTY_COMPONENT_CATALOG,
  )
  const [batchOperationSummary, setBatchOperationSummary] = useState<{
    title: string
    summary: string
  } | null>(null)
  const [catalogPackageRequest, setCatalogPackageRequest] = useState<{
    mode: 'update'
    entries: AvailableComponentCatalogPackage[]
  } | null>(null)
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  const [recoveryProject, setRecoveryProject] = useState<RecoveryProjectResult | null>(null)
  const [recoveryDecisionComplete, setRecoveryDecisionComplete] = useState(false)
  const [largeHtmlByteLength, setLargeHtmlByteLength] = useState<number | null>(null)
  const [projectHealthOpen, setProjectHealthOpen] = useState(false)
  const [v9HealthCheck, setV9HealthCheck] = useState<V9HealthCheckSnapshot | null>(null)
  const [exportPreflightReport, setExportPreflightReport] =
    useState<ExportPreflightReport | null>(null)
  const saveInFlightRef = useRef(false)
  const lifecycleOperationInFlightRef = useRef(false)
  const pendingLargeHtmlRef = useRef<string | null>(null)
  const previousActiveDirtyRef = useRef(false)
  const recoveryCoordinatorRef = useRef<RecoveryWriteCoordinator<
    V9RecoverySnapshot,
    Uint8Array
  > | null>(null)
  if (recoveryCoordinatorRef.current === null && window.desktopAPI) {
    recoveryCoordinatorRef.current = createRecoveryWriteCoordinator()
  }

  const dirty = useEditorStore((state) => state.dirty)
  const project = useEditorStore((state) => state.project)
  const projectPath = useEditorStore((state) => state.projectPath)
  const assetFiles = useEditorStore((state) => state.assetFiles)
  const componentPackages = useEditorStore(
    (state) => state.componentPackages,
  )
  const selectedNode = useEditorStore(selectSelectedNode)
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds)
  const editingScope = useEditorStore((state) => state.editingScope)
  const editorMode = useEditorStore((state) => state.editorMode)
  const activeTab = useEditorStore((state) => state.activeTab)
  const editingNodes = useEditorStore(selectEditingNodes)
  const activeScene = useEditorStore(selectActiveScene)
  const errorMessage = useEditorStore((state) => state.errorMessage)
  const statusMessage = useEditorStore((state) => state.statusMessage)
  const recoveryCourseProject = v9SlideVerticalSlice?.history.present ?? null
  const recoveryAssetFiles = v9SlideVerticalSlice?.assetFiles ?? null
  const recoveryComponentFiles = v9SlideVerticalSlice?.componentFiles ?? null
  const recoveryProjectPath = v9SlideVerticalSlice?.projectPath ?? null
  const v9BackendActive = v9SlideVerticalSlice !== null
  const activeDocumentDirty = v9SlideVerticalSlice === null
    ? dirty
    : isV9SlideVerticalSliceDirty(v9SlideVerticalSlice)
  const activeDocumentTitle = v9SlideVerticalSlice === null
    ? project.title
    : v9SlideVerticalSlice.history.present.title
  const activeDocumentPath = v9SlideVerticalSlice === null
    ? projectPath
    : v9SlideVerticalSlice.projectPath
  const projectHealthDiagnostics = useMemo(
    () => collectProjectHealth(project, componentPackages),
    [project, componentPackages],
  )
  const projectHealthSummary = useMemo(
    () => summarizeProjectHealth(projectHealthDiagnostics),
    [projectHealthDiagnostics],
  )
  const activeV9HealthCheck = v9SlideVerticalSlice !== null &&
    v9HealthCheck?.sessionId === v9SlideVerticalSlice.sessionId &&
    v9HealthCheck.archive.project === v9SlideVerticalSlice.history.present &&
    courseV9AssetFilesEqual(
      registeredV9SlideAssetFiles(
        v9SlideVerticalSlice.history.present,
        v9SlideVerticalSlice.assetFiles,
      ),
      v9HealthCheck.archive.assetFiles,
    ) &&
    v9HealthCheck.archive.componentFiles === v9SlideVerticalSlice.componentFiles &&
    v9HealthCheck.componentPackages === v9SlideVerticalSlice.componentPackages
    ? v9HealthCheck
    : null
  const activeProjectHealthSummary = v9SlideVerticalSlice === null
    ? projectHealthSummary
    : activeV9HealthCheck === null
      ? { error: 0, warning: 0, info: 0, total: 0, canExport: true }
      : {
          ...activeV9HealthCheck.result.summary,
          total:
            activeV9HealthCheck.result.summary.error +
            activeV9HealthCheck.result.summary.warning +
            activeV9HealthCheck.result.summary.info,
        }
  const v9CourseProject = v9SlideVerticalSlice?.history.present ?? null
  const v9SelectionLocationId = v9SlideVerticalSlice?.selection.locationId ?? null
  const v9ActiveLocation = useMemo(() => {
    if (v9CourseProject === null || v9SelectionLocationId === null) return null
    return v9CourseProject.locations.find(
      (candidate) => candidate.id === v9SelectionLocationId,
    ) ?? null
  }, [v9CourseProject, v9SelectionLocationId])
  const v9ActiveSlideContext = useMemo(() => {
    if (v9CourseProject === null) return null
    const location = v9ActiveLocation
    if (!location || location.kind !== 'slide-scene') return null
    const surface = v9CourseProject.surfaces.find(
      (candidate) => candidate.id === location.surfaceId,
    )
    if (!surface || surface.type !== 'slide') return null
    const scene = surface.scenes.find(
      (candidate) => candidate.id === location.sceneId,
    )
    return scene ? { location, surface, scene } : null
  }, [v9ActiveLocation, v9CourseProject])
  const v9FlowEditorView = useMemo(() => {
    if (v9CourseProject === null) return null
    const location = v9ActiveLocation
    if (!location || location.kind !== 'flow-block') return null
    try {
      return buildFlowEditorView({
        project: v9CourseProject,
        locationId: location.id,
      })
    } catch (error) {
      console.error(error)
      return null
    }
  }, [v9ActiveLocation, v9CourseProject])
  const v9SpatialEditorView = useMemo(() => {
    if (v9CourseProject === null) return null
    const location = v9ActiveLocation
    if (!location || location.kind !== 'spatial-camera') return null
    try {
      return buildSpatialEditorView({
        project: v9CourseProject,
        locationId: location.id,
      })
    } catch (error) {
      console.error(error)
      return null
    }
  }, [v9ActiveLocation, v9CourseProject])
  // Session camera lives in the App shell so the camera panel can offer
  // "add from current view" and "set home" with the real workspace pose.
  useEffect(() => {
    setSpatialSessionCamera(null)
  }, [v9SpatialEditorView?.surfaceId, v9SpatialEditorView?.activeCameraFrameId])
  const activeCourseEditorRoute = v9SlideVerticalSlice === null
    ? 'legacy'
    : v9ActiveSlideContext !== null
      ? 'slide'
      : v9FlowEditorView !== null
        ? 'flow'
        : v9SpatialEditorView !== null
          ? 'spatial'
          : 'unavailable'
  const showSceneStateStrip = courseWorkspaceShowsSceneStateStrip(activeCourseEditorRoute)
  const v9CourseLayout = v9CourseProject
    ? deriveCourseEditorLayout(v9CourseProject)
    : null
  const v9CourseStructure = v9CourseProject
    ? buildCourseStructureViewModel(v9CourseProject)
    : null
  const v9CourseLocationUnavailableReason = v9CourseLayout?.layout === 'unavailable'
    ? v9CourseLayout.unavailable?.message
    : activeCourseEditorRoute === 'unavailable'
      ? '当前位置缺少可编辑表面；工程仍可安全保存，现有内容不会改变。'
      : undefined
  const activeDocumentLocationLabel = v9SlideVerticalSlice === null
    ? `场景 ${project.scenes.findIndex((scene) => scene.id === activeScene.id) + 1} / ${project.scenes.length}`
    : v9ActiveSlideContext
      ? `场景 ${v9ActiveSlideContext.surface.scenes.findIndex(
        (scene) => scene.id === v9ActiveSlideContext.scene.id,
      ) + 1} / ${v9ActiveSlideContext.surface.scenes.length}`
      : v9ActiveLocation?.label ?? '当前位置'
  const v9StatusBarView = useMemo(() => {
    if (v9SlideVerticalSlice === null) return null
    const courseProject = v9SlideVerticalSlice.history.present
    if (v9ActiveSlideContext === null) {
      const surface = v9ActiveLocation
        ? courseProject.surfaces.find(
            (candidate) => candidate.id === v9ActiveLocation.surfaceId,
          )
        : null
      if (v9FlowEditorView !== null) {
        const selectedBlock = v9FlowEditorView.blocks.find(
          (block) => block.blockId === v9FlowEditorView.activeBlockId,
        )
        const itemCount = surface?.type === 'flow' ? surface.blocks.length : 0
        return {
          locationName: v9ActiveLocation?.label ?? v9FlowEditorView.surfaceTitle,
          itemCountLabel: `${itemCount} 个内容块`,
          selectionLabel: selectedBlock
            ? `已选：${selectedBlock.label}`
            : '未选择内容块',
          largeProject: courseProject.locations.length > RECOMMENDED_PROJECT_SCENES ||
            itemCount > RECOMMENDED_SCENE_NODES,
        }
      }
      if (v9SpatialEditorView !== null) {
        const selectedIds = v9SlideVerticalSlice.selection.spatialLayerItemIds ?? []
        const selectedLayer = selectedIds.length === 1
          ? v9SpatialEditorView.layers.find(
              (layer) => layer.selectionId === selectedIds[0],
            )
          : null
        const itemCount = surface?.type === 'spatial-2d'
          ? surface.world.layerItems.length
          : v9SpatialEditorView.layers.length
        return {
          locationName: v9ActiveLocation?.label ?? v9SpatialEditorView.surfaceTitle,
          itemCountLabel: `${itemCount} 个元素`,
          selectionLabel: selectedIds.length > 1
            ? `已选 ${selectedIds.length} 个元素`
            : selectedLayer
              ? `已选：${selectedLayer.item.label}`
              : '未选择空间元素',
          largeProject: courseProject.locations.length > RECOMMENDED_PROJECT_SCENES ||
            itemCount > RECOMMENDED_SCENE_NODES,
        }
      }
      const itemCountLabel = surface?.type === 'flow'
        ? `${surface.blocks.length} 个内容块`
        : surface?.type === 'spatial-2d'
          ? `${surface.world.layerItems.length} 个元素`
          : '内容暂不可编辑'
      const itemCount = surface?.type === 'flow'
        ? surface.blocks.length
        : surface?.type === 'spatial-2d'
          ? surface.world.layerItems.length
          : 0
      return {
        locationName: v9ActiveLocation?.label ?? '当前位置',
        itemCountLabel,
        selectionLabel: '当前内容只读',
        largeProject: courseProject.locations.length > RECOMMENDED_PROJECT_SCENES ||
          itemCount > RECOMMENDED_SCENE_NODES,
      }
    }
    const view = buildSlideEditorView({
      project: courseProject,
      locationId: v9SlideVerticalSlice.selection.locationId,
      stateId: v9SlideVerticalSlice.selection.stateId,
    })
    const sceneLayerCount = view.layers.filter((layer) => layer.source === 'scene').length
    const selectedIds = new Set(v9SlideVerticalSlice.selection.selectionIds)
    const selectedLayers = view.layers.filter((layer) => selectedIds.has(layer.selectionId))
    const editingGlobal = v9SlideVerticalSlice.editingScope === 'global'
    const editingSurface = v9SlideVerticalSlice.editingScope === 'surface'
    const scopeLayerCount = editingGlobal
      ? courseProject.globalLayerItems.length
      : editingSurface
        ? v9ActiveSlideContext.surface.surfaceLayerItems.length
        : sceneLayerCount
    return {
      locationName: editingGlobal
        ? '全局层'
        : editingSurface
          ? '当前内容共用'
          : view.sceneName,
      itemCountLabel: editingGlobal
        ? `${courseProject.globalLayerItems.length} 个全局元素`
        : editingSurface
          ? `${scopeLayerCount} 个共用元素`
        : `${sceneLayerCount} 个节点`,
      selectionLabel: selectedLayers.length > 1
        ? `已选 ${selectedLayers.length} 个图层`
        : selectedLayers[0]
          ? `已选：${selectedLayers[0].item.label}`
          : editingGlobal
            ? '未选择全局元素'
            : editingSurface
              ? '未选择共用元素'
              : '未选择节点',
      largeProject: courseProject.locations.length > RECOMMENDED_PROJECT_SCENES ||
        scopeLayerCount > RECOMMENDED_SCENE_NODES,
    }
  }, [
    v9ActiveLocation,
    v9ActiveSlideContext,
    v9FlowEditorView,
    v9SlideVerticalSlice,
    v9SpatialEditorView,
  ])
  const activeStatusBarView = v9StatusBarView ?? {
    locationName: editingScope === 'global' ? '全局层' : activeScene.name,
    itemCountLabel: editingScope === 'global'
      ? `${editingNodes.length} 个全局元素`
      : `${activeScene.nodes.length} 个节点`,
    selectionLabel: selectedNodeIds.length > 1
      ? `已选 ${selectedNodeIds.length} 个图层`
      : selectedNode
        ? `已选：${selectedNode.name}`
        : editingScope === 'global'
          ? '未选择全局元素'
          : '未选择节点',
    largeProject: project.scenes.length > RECOMMENDED_PROJECT_SCENES ||
      activeScene.nodes.length > RECOMMENDED_SCENE_NODES,
  }
  const v9ScenePanelBase = useMemo(() => {
    if (
      v9CourseProject === null ||
      v9SlideVerticalSlice === null ||
      v9ActiveSlideContext === null
    ) return null
    const surface = v9ActiveSlideContext.surface
    const scenes = surface.scenes.map((scene) => {
      const canonicalLocation = v9CourseProject.locations.find((location) =>
        location.kind === 'slide-scene' &&
        location.surfaceId === surface.id &&
        location.sceneId === scene.id &&
        location.stateId === undefined,
      ) ?? v9CourseProject.locations.find((location) =>
        location.kind === 'slide-scene' &&
        location.surfaceId === surface.id &&
        location.sceneId === scene.id,
      )
      const thumbnailStateId = scene.presentation?.thumbnailStateId ??
        scene.presentation?.initialStateId ?? null
      const thumbnailStateName = thumbnailStateId === null
        ? '基础'
        : scene.presentation?.states.find((state) => state.id === thumbnailStateId)?.name ?? '基础'

      const view = canonicalLocation
        ? buildSlideEditorView({
            project: v9CourseProject,
            locationId: canonicalLocation.id,
            stateId: thumbnailStateId,
          })
        : null
      const layers = view
        ? view.layers
        : [
            ...v9CourseProject.globalLayerItems
              .filter((entry) => entry.visibility.mode === 'all')
              .map((entry) => ({
                effectiveVisible: entry.item.visible,
                item: entry.item,
              })),
            ...surface.surfaceLayerItems
              .filter((entry) => entry.visibility.mode === 'all')
              .map((entry) => ({
                effectiveVisible: entry.item.visible,
                item: entry.item,
              })),
            ...scene.layerItems.map((item) => ({
              effectiveVisible: item.visible,
              item,
            })),
          ].sort((left, right) =>
            left.item.order - right.item.order ||
            left.item.layerItemId.localeCompare(right.item.layerItemId),
          )
      return {
        id: scene.id,
        name: scene.name,
        canonicalLocationId: canonicalLocation?.id ?? null,
        showRuntimeBadge: layers.some(({ effectiveVisible, item }) =>
          effectiveVisible &&
          item.kind === 'runtime' &&
          item.runtime.enabled &&
          !item.runtime.staticFallback,
        ),
        thumbnailStateName,
        thumbnail: buildCourseSceneThumbnailRenderModel({
          backgroundColor: view?.backgroundColor ?? scene.backgroundColor,
          backgroundAssetId: view
            ? view.backgroundAssetId
            : scene.backgroundAssetId,
          layers,
          assets: v9CourseProject.assets,
          assetFiles: v9SlideVerticalSlice.assetFiles,
          componentPackages: v9SlideVerticalSlice.componentPackages,
        }),
      }
    })
    return {
      surfaceId: surface.id,
      globalElementCount: v9CourseProject.globalLayerItems.length,
      globalHasRuntime: v9CourseProject.globalLayerItems.some(
        (entry) => entry.item.kind === 'runtime',
      ),
      surfaceElementCount: surface.surfaceLayerItems.length,
      surfaceHasDynamicContent: surface.surfaceLayerItems.some(
        (entry) => entry.item.kind !== 'native',
      ),
      scenes,
    }
  }, [
    v9ActiveSlideContext,
    v9CourseProject,
    v9SlideVerticalSlice?.assetFiles,
    v9SlideVerticalSlice?.componentPackages,
  ])
  const v9ScenePanelDocumentControl = useMemo<ScenePanelDocumentControl | undefined>(() => {
    if (v9SlideVerticalSlice === null) return undefined
    if (v9CourseLocationUnavailableReason) {
      const unavailable = () => undefined
      return {
        unavailableReason: v9CourseLocationUnavailableReason,
        editingScope: 'scene',
        globalElementCount: v9SlideVerticalSlice.history.present.globalLayerItems.length,
        globalHasRuntime: v9SlideVerticalSlice.history.present.globalLayerItems.some(
          (entry) => entry.item.kind === 'runtime',
        ),
        globalEditingDisabled: true,
        scenes: [],
        onAddScene: unavailable,
        onActivateScene: unavailable,
        onActivateGlobal: unavailable,
        onRenameScene: unavailable,
        onDeleteScene: unavailable,
        onDuplicateScene: unavailable,
        onReorderScenes: unavailable,
      }
    }
    const run = (command: () => void, fallback: string) => {
      if (lifecycleOperationInFlightRef.current) return
      try {
        command()
      } catch (error) {
        useEditorStore.getState().setError(readableError(error, fallback))
      }
    }
    const sceneRows = (v9ScenePanelBase?.scenes ?? []).map((scene) => ({
      id: scene.id,
      name: scene.name,
      active: v9SlideVerticalSlice.editingScope === 'scene' &&
        scene.id === v9ActiveSlideContext?.scene.id,
      showRuntimeBadge: scene.showRuntimeBadge,
      thumbnailStateName: scene.thumbnailStateName,
      thumbnail: scene.thumbnail,
    }))
    return {
      editingScope: v9SlideVerticalSlice.editingScope,
      globalElementCount: v9ScenePanelBase?.globalElementCount ??
        v9SlideVerticalSlice.history.present.globalLayerItems.length,
      globalHasRuntime: v9ScenePanelBase?.globalHasRuntime ??
        v9SlideVerticalSlice.history.present.globalLayerItems.some(
          (entry) => entry.item.kind === 'runtime',
        ),
      globalEditingDisabled: false,
      ...((v9ScenePanelBase?.surfaceElementCount ?? 0) > 0
        ? {
            surfaceLayer: {
              elementCount: v9ScenePanelBase!.surfaceElementCount,
              hasDynamicContent: v9ScenePanelBase!.surfaceHasDynamicContent,
              onActivate: () => run(() => {
                if (v9ScenePanelBase === null) throw new Error('当前位置不是幻灯片')
                useEditorStore.getState().setCourseEditingScope('surface')
              }, '无法切换到当前内容共用层'),
            },
          }
        : {}),
      scenes: sceneRows,
      onAddScene: () => run(() => {
        if (v9ScenePanelBase === null) throw new Error('当前位置不是幻灯片')
        useEditorStore.getState().addCourseScene()
      }, '无法新建场景'),
      onActivateScene: (sceneId) => run(() => {
        const row = v9ScenePanelBase?.scenes.find((scene) => scene.id === sceneId)
        if (!row?.canonicalLocationId) throw new Error('该场景缺少课程位置，暂时无法打开')
        useEditorStore.getState().activateCourseScene(sceneId)
      }, '无法切换场景'),
      onActivateGlobal: () => run(() => {
        useEditorStore.getState().selectGlobalLayerScope()
      }, '无法切换到全局层'),
      onRenameScene: (sceneId, name) => run(() => {
        useEditorStore.getState().renameCourseScene(sceneId, name)
      }, '无法重命名场景'),
      onDeleteScene: (sceneId) => run(() => {
        useEditorStore.getState().deleteCourseScene(sceneId)
      }, '无法删除场景'),
      onDuplicateScene: (sceneId) => run(() => {
        useEditorStore.getState().duplicateCourseScene(sceneId)
      }, '无法复制场景'),
      onReorderScenes: (sceneIds) => run(() => {
        useEditorStore.getState().reorderCourseScenes(sceneIds)
      }, '无法调整场景顺序'),
    }
  }, [
    v9ActiveSlideContext?.scene.id,
    v9CourseLocationUnavailableReason,
    v9ScenePanelBase,
    v9SlideVerticalSlice,
  ])
  const v9SceneStateStripDocumentControl = useMemo<
    SceneStateStripDocumentControl | undefined
  >(() => {
    if (v9SlideVerticalSlice === null) return undefined
    if (activeCourseEditorRoute === 'flow' || activeCourseEditorRoute === 'spatial') {
      return undefined
    }
    if (v9CourseLocationUnavailableReason) {
      const unavailable = () => undefined
      return {
        unavailableReason: v9CourseLocationUnavailableReason,
        editingScope: 'scene',
        editorMode,
        activeStateId: null,
        states: [],
        onSetEditorMode: unavailable,
        onActivateState: unavailable,
        onAddState: unavailable,
        onDuplicateState: unavailable,
        onRenameState: unavailable,
        onSetInitialState: unavailable,
        onSetThumbnailState: unavailable,
        onClearState: unavailable,
        onDeleteState: unavailable,
      }
    }
    const scene = v9ActiveSlideContext?.scene ?? null
    const presentation = scene?.presentation
    const states = (presentation?.states ?? []).map((state) => ({
      id: state.id,
      name: state.name,
      overrideCount: Object.keys(state.layerItemOverrides).length +
        (Object.prototype.hasOwnProperty.call(state, 'backgroundColor') ? 1 : 0) +
        (Object.prototype.hasOwnProperty.call(state, 'backgroundAssetId') ? 1 : 0) +
        (Object.prototype.hasOwnProperty.call(state, 'layerItemOrder') ? 1 : 0),
      incomingCount: scene?.interactions.filter((rule) =>
        rule.actions.some(({ action }) =>
          action.type === 'presentation.set' && action.stateId === state.id,
        ),
      ).length ?? 0,
      scopedCount: scene?.interactions.filter((rule) =>
        rule.conditions.some((condition) =>
          condition.type === 'presentation.in' && condition.stateIds.includes(state.id),
        ),
      ).length ?? 0,
      initial: state.id === presentation?.initialStateId,
      thumbnail: state.id === presentation?.thumbnailStateId,
    }))
    const activeStateId = v9SlideVerticalSlice.selection.stateId !== null &&
      states.some((state) => state.id === v9SlideVerticalSlice.selection.stateId)
      ? v9SlideVerticalSlice.selection.stateId
      : null
    const run = (command: () => void, fallback: string) => {
      if (lifecycleOperationInFlightRef.current) return
      try {
        command()
      } catch (error) {
        useEditorStore.getState().setError(readableError(error, fallback))
      }
    }
    return {
      editingScope: v9SlideVerticalSlice.editingScope,
      editorMode,
      activeStateId,
      states,
      onSetEditorMode: (mode) => run(() => {
        useEditorStore.getState().setEditorMode(mode)
      }, '无法切换编辑模式'),
      onActivateState: (stateId) => run(() => {
        useEditorStore.getState().activateCoursePresentationState(stateId)
      }, '无法切换命名状态'),
      onAddState: () => run(() => {
        useEditorStore.getState().addCoursePresentationState()
      }, '无法新建命名状态'),
      onDuplicateState: (stateId) => run(() => {
        useEditorStore.getState().duplicateCoursePresentationState(stateId)
      }, '无法复制命名状态'),
      onRenameState: (stateId, name) => run(() => {
        useEditorStore.getState().renameCoursePresentationState(stateId, name)
      }, '无法重命名状态'),
      onSetInitialState: (stateId) => run(() => {
        useEditorStore.getState().setInitialCoursePresentationState(stateId)
      }, '无法设置初始状态'),
      onSetThumbnailState: (stateId) => run(() => {
        useEditorStore.getState().setThumbnailCoursePresentationState(stateId)
      }, '无法设置缩略图状态'),
      onClearState: (stateId) => run(() => {
        useEditorStore.getState().clearCoursePresentationStateOverrides(stateId)
      }, '无法清除状态覆盖'),
      onDeleteState: (stateId) => run(() => {
        useEditorStore.getState().deleteCoursePresentationState(stateId)
      }, '无法删除命名状态'),
    }
  }, [
    activeCourseEditorRoute,
    editorMode,
    v9ActiveSlideContext?.scene,
    v9CourseLocationUnavailableReason,
    v9SlideVerticalSlice,
  ])
  const v9WorkspaceSnapshot = useMemo(
    () => v9SlideVerticalSlice === null || v9ActiveSlideContext === null
      ? null
      : buildV9SlideWorkspaceSnapshot(v9SlideVerticalSlice),
    [v9ActiveSlideContext, v9SlideVerticalSlice],
  )
  const setError = useEditorStore((state) => state.setError)
  const setStatus = useEditorStore((state) => state.setStatus)

  const run = useCallback(
    async <T,>(operation: () => Promise<T>, fallback: string): Promise<T | undefined> => {
      if (lifecycleOperationInFlightRef.current) return undefined
      lifecycleOperationInFlightRef.current = true
      setBusy(true)
      setError(null)
      try {
        return await operation()
      } catch (error) {
        setError(readableError(error, fallback))
        return undefined
      } finally {
        lifecycleOperationInFlightRef.current = false
        setBusy(false)
      }
    },
    [setError],
  )

  const runCourseCommand = useCallback((command: () => void, fallback: string) => {
    if (lifecycleOperationInFlightRef.current) return
    try {
      command()
    } catch (error) {
      useEditorStore.getState().setError(readableError(error, fallback))
    }
  }, [])

  const reportBatchOutcome = useCallback((input: {
    label: string
    completedCount: number
    duplicateCount: number
    issues: BatchImportIssue[]
    libraryFallback?: MediaBatchLibraryFallback
  }) => {
    const details = [
      `已完成 ${input.completedCount} 项`,
      input.duplicateCount > 0 ? `内容重复 ${input.duplicateCount} 项（已复用素材）` : '',
      input.issues.length > 0 ? `失败 ${input.issues.length} 项` : '',
      input.libraryFallback === 'batch-size'
        ? '数量过多，已只加入媒体库'
        : '',
      input.libraryFallback === 'scene-capacity'
        ? '当前层容量不足，已改为只加入媒体库'
        : '',
    ].filter(Boolean)
    setStatus(`${input.label}：${details.join('；')}`)
    if (input.issues.length > 0) {
      setError(`${input.label}部分文件未完成：\n${formatBatchIssueSummary(input.issues)}`)
      setBatchOperationSummary({
        title: `${input.label}结果`,
        summary: [
          ...details,
          '',
          '未完成：',
          ...input.issues.map((issue) => `- ${issue.name}：${issue.message}`),
        ].join('\n'),
      })
    }
  }, [setError, setStatus])

  const currentCourseAssetScope = useCallback(() => {
    const session = useEditorStore.getState().courseSession
    if (session === null) return null
    return {
      assets: session.history.present.assets,
      assetFiles: session.assetFiles,
    }
  }, [])

  const selectAndAddCourseMedia = useCallback(async (
    kind: 'image' | 'video',
    mode: 'add' | 'library',
    position?: { x?: number; y?: number },
  ) => {
    await run(async () => {
      const batch = kind === 'image'
        ? await desktopApi().selectImages()
        : await desktopApi().selectVideos()
      if (!batch) return
      const scope = currentCourseAssetScope()
      if (scope === null) return
      const prepared = kind === 'image'
        ? await prepareAssetBatch<SelectedImageBatchFile>(
            batch.accepted,
            'image',
            async (file) => {
              const dimensions = await readImageDimensions(file.bytes, file.mimeType)
              const imported = createImageAssetImport(file, { dimensions })
              return { meta: imported.meta, bytes: imported.bytes }
            },
            scope,
          )
        : await prepareAssetBatch<SelectedMediaBatchFile>(
            batch.accepted,
            'video',
            async (file) => {
              const metadata = await readMediaMetadata(file.bytes, file.mimeType, 'video')
              const imported = createMediaAssetImport(file, 'video', metadata)
              return { meta: imported.meta, bytes: imported.bytes }
            },
            scope,
          )
      const importPlan = planMediaBatchImport(
        mode,
        prepared.placements.length,
        MAX_BATCH_CANVAS_ITEMS,
      )
      const commitResult = commitMediaBatchImport({
        plan: importPlan,
        placements: prepared.placements,
        additions: prepared.additions,
        placeOnCanvas: (items) => useEditorStore.getState().addCourseMediaLayers(
          kind,
          items,
          position?.x,
          position?.y,
        ),
        importIntoLibrary: (items) => useEditorStore.getState().importCourseAssets(items),
      })
      reportBatchOutcome({
        label: kind === 'image'
          ? (mode === 'add' ? '图片添加' : '图片批量入库')
          : (mode === 'add' ? '视频添加' : '视频批量入库'),
        completedCount: commitResult.completedCount,
        duplicateCount: prepared.duplicateCount,
        issues: [...desktopRejections(batch.rejected), ...prepared.issues],
        libraryFallback: commitResult.libraryFallback,
      })
    }, kind === 'image'
      ? '图片读取失败。请重新选择受支持的图片。'
      : '视频读取失败。请重新选择 MP4 或 WebM 文件。')
  }, [currentCourseAssetScope, reportBatchOutcome, run])

  const pickCourseBackgroundImage = useCallback(async () => {
    await run(async () => {
      const scope = currentCourseAssetScope()
      if (scope === null) return
      const file = await desktopApi().selectImage()
      if (!file) return
      const dimensions = await readImageDimensions(file.bytes, file.mimeType)
      const imported = createImageAssetImport(file, { dimensions })
      useEditorStore.getState().setCourseSceneBackgroundWithAsset(
        imported.meta,
        imported.bytes,
      )
    }, '图片读取失败。请重新选择受支持的图片。')
  }, [currentCourseAssetScope, run])

  const v9RightSidebarDocumentControl = useMemo<
    RightSidebarDocumentControl | undefined
  >(() => {
    if (v9SlideVerticalSlice === null) return undefined
    if (v9WorkspaceSnapshot === null || v9CourseLocationUnavailableReason) {
      const reason = v9CourseLocationUnavailableReason ??
        '当前位置暂时无法编辑；工程仍可安全保存，现有内容不会改变。'
      return {
        unavailableReasons: {
          elements: reason,
          components: reason,
          layers: reason,
          properties: reason,
          automation: reason,
          developer: reason,
        },
      }
    }
    const run = (command: () => void, fallback: string) => {
      if (lifecycleOperationInFlightRef.current) return
      try {
        command()
      } catch (error) {
        useEditorStore.getState().setError(readableError(error, fallback))
      }
    }
    const view = buildSlideEditorView({
      project: v9SlideVerticalSlice.history.present,
      locationId: v9SlideVerticalSlice.selection.locationId,
      stateId: v9SlideVerticalSlice.selection.stateId,
    })
    const editingScope = v9SlideVerticalSlice.editingScope
    const scopedLayers = view.layers.filter((layer) => layer.source === editingScope)
    // Native and component layers both enter the unified layer; runtime layers
    // and scene teacher controllers remain outside the Nodes/Properties lists.
    const unsupportedScopedLayerCount = scopedLayers.filter((layer) => (
      layer.item.kind === 'runtime' ||
      (
        layer.item.kind === 'native' &&
        editingScope !== 'global' &&
        layer.item.content.nativeType === 'teacher-controller'
      )
    )).length
    const editingScene = editingScope === 'scene'
    const editingSurface = editingScope === 'surface'
    const editingNativeLayerList = editingScene || editingSurface
    const selectedIds = new Set(v9SlideVerticalSlice.selection.selectionIds)
    const selectedNodes = v9WorkspaceSnapshot.document.nodes.filter(
      (node) => selectedIds.has(node.id),
    )
    const selectedNode = selectedNodes.length === 1 ? selectedNodes[0]! : null
    const activeState = v9SlideVerticalSlice.selection.stateId === null
      ? null
      : v9ActiveSlideContext?.scene.presentation?.states.find(
          (state) => state.id === v9SlideVerticalSlice.selection.stateId,
        ) ?? null
    const layerContext = {
      sessionId: v9SlideVerticalSlice.sessionId,
      locationId: v9SlideVerticalSlice.selection.locationId,
      stateId: v9SlideVerticalSlice.selection.stateId,
      editingScope,
    } as const
    const layerContextKey = v9SlideLayerContextKey(layerContext)
    // Global layers enter the same controlled property editor as scene/surface
    // natives. Runtime layers are never projected into the authoring document,
    // and teacher controllers keep their own type-level capability gate.
    const propertyTarget = selectedNode && (
      editingNativeLayerList || editingScope === 'global'
    )
      ? {
          ...layerContext,
          layerItemId: selectedNode.id,
        }
      : null
    const interactionScenes = v9SlideScenes(v9SlideVerticalSlice.history.present)
    const interactionSounds = v9InteractionSounds(v9SlideVerticalSlice.history.present)
    const activeSceneId = v9ActiveSlideContext?.scene.id ?? view.sceneId
    const interactionRules = editingScope === 'global'
      ? v9SlideVerticalSlice.history.present.globalInteractions
      : v9ActiveSlideContext?.scene.interactions ?? []
    const interactionSceneDocument = v9InteractionSceneDocument(
      activeSceneId,
      v9ActiveSlideContext?.scene.name ?? view.sceneName,
      v9WorkspaceSnapshot.document.nodes,
      interactionRules,
      interactionScenes.find((candidate) => candidate.id === activeSceneId)?.presentation,
    )
    const updateProperty = (
      command: () => boolean,
      fallback: string,
    ): boolean => {
      if (lifecycleOperationInFlightRef.current) return false
      try {
        const accepted = command()
        if (!accepted) useEditorStore.getState().setStatus('所选元素已变化，请重新选择')
        return accepted
      } catch (error) {
        console.error(error)
        useEditorStore.getState().setError(fallback)
        return false
      }
    }
    return {
      ...(editingScene
        ? {
            elements: {
              editingScope: 'scene' as const,
              editorMode,
              mediaUnavailableReason: '',
              controllerUnavailableReason: '',
              onAddText: (x, y) => run(() => {
                useEditorStore.getState().addCourseTextLayer(x, y)
              }, '无法添加文字'),
              onAddFormula: (x, y) => run(() => {
                useEditorStore.getState().addCourseFormulaLayer(x, y)
              }, '无法添加公式'),
              onAddShape: (shapeType, x, y) => run(() => {
                useEditorStore.getState().addCourseShapeLayer(shapeType, x, y)
              }, '无法添加图形'),
              onAddImage: (x, y) => {
                void selectAndAddCourseMedia('image', 'add', { x, y })
              },
              onAddVideo: (x, y) => {
                void selectAndAddCourseMedia('video', 'add', { x, y })
              },
            },
          }
        : {}),
      ...(editingNativeLayerList
        ? {
            layers: {
              editingScope: v9SlideVerticalSlice.editingScope,
              contextKey: layerContextKey,
              scopeLabel: editingSurface
                ? '当前内容共用'
                : v9ActiveSlideContext?.scene.name ?? view.sceneName,
              nodes: v9WorkspaceSnapshot.document.nodes,
              selectedNodeIds: v9WorkspaceSnapshot.selectedNodeIds,
              deletionMode: editingScene && v9SlideVerticalSlice.selection.stateId !== null
                ? 'hide-in-state'
                : 'delete',
              omittedItemsReason: unsupportedScopedLayerCount > 0
                ? editingSurface
                  ? `当前内容共用层还有 ${unsupportedScopedLayerCount} 个动态内容或复用内容暂不能编辑；已显示的元素仍可编辑。`
                  : `当前幻灯片还有 ${unsupportedScopedLayerCount} 个动态元素或控制器暂不在列表中；已显示的元素仍可编辑。`
                : undefined,
              reorderUnavailableReason: unsupportedScopedLayerCount > 0
                ? editingSurface
                  ? '当前列表未包含共用层中的全部元素，暂不能调整整体层级。'
                  : '当前列表未包含幻灯片中的全部元素，暂不能调整整体层级。'
                : undefined,
              onSelectNode: (nodeId, additive) => run(() => {
                const accepted = useEditorStore.getState().selectCourseLayers({
                  nodeIds: nodeId === null ? [] : [nodeId],
                  additive,
                })
                if (!accepted) throw new Error('当前元素无法选择')
              }, '无法选择元素'),
              onDeleteNode: (nodeId) => run(() => {
                const accepted = useEditorStore.getState().deleteCourseLayer({
                  ...layerContext,
                  layerItemId: nodeId,
                })
                if (!accepted) throw new Error('当前元素已变化')
              }, '无法删除元素'),
              onDuplicateNode: (nodeId) => run(() => {
                const accepted = useEditorStore.getState().duplicateCourseLayer({
                  ...layerContext,
                  layerItemId: nodeId,
                })
                if (!accepted) throw new Error('当前元素已变化')
              }, '无法复制元素'),
              onRenameNode: (nodeId, name) => run(() => {
                const accepted = useEditorStore.getState().updateCourseLayer({
                  ...layerContext,
                  layerItemId: nodeId,
                }, { label: name })
                if (!accepted) throw new Error('当前元素已变化')
              }, '无法重命名元素'),
              onSetNodeVisible: (nodeId, visible) => run(() => {
                const accepted = useEditorStore.getState().updateCourseLayer({
                  ...layerContext,
                  layerItemId: nodeId,
                }, { visible })
                if (!accepted) throw new Error('当前元素已变化')
              }, '无法更改元素可见性'),
              onSetNodeLocked: (nodeId, locked) => run(() => {
                const accepted = useEditorStore.getState().updateCourseLayer({
                  ...layerContext,
                  layerItemId: nodeId,
                }, { locked })
                if (!accepted) throw new Error('当前元素已变化')
              }, '无法更改元素锁定状态'),
              onReorderNodes: (nodeIds) => run(() => {
                const accepted = useEditorStore.getState().reorderCourseLayers({
                  ...layerContext,
                  layerItemIds: nodeIds,
                })
                if (!accepted) throw new Error('当前图层上下文已变化')
              }, '无法调整图层顺序'),
            },
          }
        : {}),
      properties: {
        editingScope: v9SlideVerticalSlice.editingScope,
        editorMode,
        selectedNodes,
        target: propertyTarget,
        scopeLabel: editingScope === 'global'
          ? '全局层'
          : editingSurface
            ? '当前内容共用'
          : activeState
            ? `状态：${activeState.name}`
            : '基础场景',
        scopeDescription: editingScope === 'global'
          ? '修改会应用到课件内的所有幻灯片。'
          : editingSurface
            ? '修改会应用到当前内容内的所有场景。'
          : activeState
            ? `属性修改只影响“${activeState.name}”状态。`
            : '修改基础元素会影响继承它的命名状态。',
        overrideActive: Boolean(
          editingScene &&
          activeState &&
          propertyTarget &&
          activeState.layerItemOverrides[propertyTarget.layerItemId],
        ),
        textContentUnavailableReason: '',
        richTextUnavailableReason: '',
        mediaUnavailableReason: '',
        controllerUnavailableReason: '',
        ...(editingScene
          ? {
              background: {
                editingScope: 'scene' as const,
                inNamedState: v9SlideVerticalSlice.selection.stateId !== null,
                backgroundColor: view.backgroundColor,
                backgroundAssetId: view.backgroundAssetId,
                backgroundAssetOptions: Object.values(
                  v9SlideVerticalSlice.history.present.assets,
                )
                  .filter((asset) => asset.kind === 'image')
                  .map((asset) => ({ id: asset.id, label: asset.filename })),
                overrideActive: Boolean(
                  activeState &&
                  (
                    activeState.backgroundColor !== undefined ||
                    activeState.backgroundAssetId !== undefined
                  ),
                ),
                onSetColor: (color) => updateProperty(
                  () => useEditorStore.getState().setCourseSceneBackground({
                    backgroundColor: color,
                  }),
                  '无法更新背景颜色',
                ),
                onSetAsset: (assetId) => updateProperty(
                  () => useEditorStore.getState().setCourseSceneBackground({
                    backgroundAssetId: assetId,
                  }),
                  '无法更新背景素材',
                ),
                onPickImageFile: () => {
                  void pickCourseBackgroundImage()
                },
                onClearOverride: () => updateProperty(
                  () => useEditorStore.getState().clearCourseSceneBackgroundOverride(),
                  '无法恢复基础背景',
                ),
              },
            }
          : {}),
        onUpdateNode: (target, patch) => updateProperty(
          () => useEditorStore.getState().updateCourseNativeNode(target, patch),
          '无法更新元素属性',
        ),
        onClearOverride: (target) => updateProperty(
          () => useEditorStore.getState().clearCourseNativeNodeOverride(target),
          '无法恢复基础属性',
        ),
        interaction: (editingScene || editingScope === 'global') ? {
          scene: interactionSceneDocument,
          sourceScope: editingScope === 'global' ? 'global' : 'scene',
          sourceNodes: v9WorkspaceSnapshot.document.nodes,
          sourceRules: interactionRules,
          activeStateId: v9SlideVerticalSlice.selection.stateId,
          scenes: interactionScenes,
          sounds: interactionSounds,
          onAddRule: (rule) => run(() => {
            useEditorStore.getState().addCourseInteractionRule(rule)
          }, '无法添加互动规则'),
          onUpdateRule: (ruleId, patch) => run(() => {
            useEditorStore.getState().updateCourseInteractionRule(ruleId, patch)
          }, '无法更新互动规则'),
          onDeleteRule: (ruleId) => run(() => {
            useEditorStore.getState().deleteCourseInteractionRule(ruleId)
          }, '无法删除互动规则'),
        } : undefined,
      },
      components: editingNativeLayerList || editingScope === 'global',
      automation: true,
      developer: true,
      unavailableReasons: {
        elements: editingScene
          ? undefined
          : '请先回到场景，再添加文字、公式或图形。',
        layers: !editingScene && !editingSurface && editingScope !== 'global'
          ? '请先选择场景、共用层或全局层，再管理图层。'
          : undefined,
        properties: undefined,
      },
    }
  }, [
    editorMode,
    pickCourseBackgroundImage,
    selectAndAddCourseMedia,
    v9ActiveSlideContext?.scene.name,
    v9CourseLocationUnavailableReason,
    v9SlideVerticalSlice,
    v9WorkspaceSnapshot,
  ])
  const v9SlideAuthoring = useMemo<WorkspaceSlideAuthoringInput | undefined>(() => {
    if (v9SlideVerticalSlice === null || v9WorkspaceSnapshot === null) return undefined
    const snapshot = v9WorkspaceSnapshot
    const stateName = v9SlideVerticalSlice.editingScope === 'global'
      ? '全局层'
      : v9SlideVerticalSlice.editingScope === 'surface'
        ? '当前内容共用'
      : v9SlideVerticalSlice.selection.stateId === null
        ? '基础'
        : v9ActiveSlideContext?.scene.presentation?.states.find(
            (state) => state.id === v9SlideVerticalSlice.selection.stateId,
          )?.name ?? '状态'
    return {
      ...snapshot,
      sessionId: v9SlideVerticalSlice.sessionId,
      previewResources: {
        assets: v9SlideVerticalSlice.history.present.assets,
        assetFiles: v9SlideVerticalSlice.assetFiles,
        componentPackages:
          v9SlideVerticalSlice.history.present.componentPackages,
        designTokens: v9SlideVerticalSlice.history.present.designTokens,
        media: v9SlideVerticalSlice.history.present.media,
      },
      sceneName: v9ActiveSlideContext?.scene.name ?? snapshot.document.name,
      stateName,
      editingScope: v9SlideVerticalSlice.editingScope,
      unsupportedActionReason: '当前版本暂不支持此操作；现有内容不会改变',
      onSelectionChange: (event) => {
        if (lifecycleOperationInFlightRef.current) return false
        return useEditorStore.getState().selectCourseLayers(event)
      },
      onTransformEnd: (event) => {
        if (lifecycleOperationInFlightRef.current) return false
        return useEditorStore.getState().transformCourseLayers(event)
      },
      onTextEditCommit: (event) => {
        if (lifecycleOperationInFlightRef.current) return false
        const session = useEditorStore.getState().courseSession
        if (session === null) return false
        return useEditorStore.getState().commitCourseTextEdit({
          sessionId: session.sessionId,
          locationId: session.selection.locationId,
          stateId: session.selection.stateId,
          editingScope: session.editingScope,
          layerItemId: event.nodeId,
        }, event.text, [...event.runs])
      },
    }
  }, [v9ActiveSlideContext?.scene, v9SlideVerticalSlice, v9WorkspaceSnapshot])

  const v9FlowStructuralCommands = useMemo(() => {
    if (v9FlowEditorView === null) return undefined
    return {
      onDeleteBlock: (blockId: string) => runCourseCommand(() => {
        useEditorStore.getState().deleteCourseFlowBlock(blockId)
      }, '无法删除 Flow 内容块'),
      onDuplicateBlock: (blockId: string) => runCourseCommand(() => {
        useEditorStore.getState().duplicateCourseFlowBlock(blockId)
      }, '无法复制 Flow 内容块'),
      onMoveBlock: (blockId: string, direction: 'up' | 'down' | 'left' | 'right') => runCourseCommand(() => {
        const current = v9FlowEditorView.blocks.find(
          (entry) => entry.blockId === blockId,
        )
        if (!current) throw new Error('所选 Flow 内容块已失效，请重新选择')
        if (direction === 'up' || direction === 'down') {
          const toIndex = direction === 'up'
            ? Math.max(0, current.index - 1)
            : current.index + 1
          useEditorStore.getState().reorderCourseFlowBlock(blockId, toIndex)
          return
        }
        if (direction === 'left') {
          if (current.parentId === null) {
            throw new Error('当前内容块已在最外层')
          }
          const parent = v9FlowEditorView.blocks.find(
            (entry) => entry.blockId === current.parentId,
          )
          if (!parent) throw new Error('所属分节已失效，请刷新后重试')
          useEditorStore.getState().moveCourseFlowBlock(blockId, {
            parentId: parent.parentId,
            index: parent.index + 1,
          })
          return
        }
        const siblings = v9FlowEditorView.blocks
          .filter((entry) => entry.parentId === current.parentId)
          .sort((left, right) => left.index - right.index)
        const previous = siblings[current.index - 1]
        if (!previous || previous.block.type !== 'section') {
          throw new Error('只有紧邻的上一个分节可以收纳内容块')
        }
        useEditorStore.getState().moveCourseFlowBlock(blockId, {
          parentId: previous.blockId,
          index: previous.block.blocks.length,
        })
      }, '无法移动 Flow 内容块'),
    }
  }, [runCourseCommand, v9FlowEditorView])

  const v9FlowDocumentControl = useMemo<RightSidebarFlowDocumentControl | undefined>(() => {
    if (v9SlideVerticalSlice === null || v9FlowEditorView === null) return undefined
    const project = v9SlideVerticalSlice.history.present
    const selectedBlockView = v9FlowEditorView.blocks.find(
      (block) => block.blockId === v9FlowEditorView.activeBlockId,
    )
    const selectedBlock = selectedBlockView?.block ?? null
    const selectedSectionId = selectedBlock?.type === 'section'
      ? selectedBlock.id
      : undefined
    return {
      elements: {
        onInsert: (request) => runCourseCommand(() => {
          useEditorStore.getState().insertCourseFlowBlock(
            request as FlowEditorBlockInput,
          )
        }, '无法插入 Flow 内容块'),
        onInsertNested: (sectionId, request) => runCourseCommand(() => {
          const section = v9FlowEditorView.blocks.find(
            (block) => block.blockId === sectionId,
          )?.block
          if (!section || section.type !== 'section') {
            throw new Error('找不到当前分节，请重新选择')
          }
          useEditorStore.getState().insertCourseFlowBlock(
            request as FlowEditorBlockInput,
            {
              parentId: sectionId,
              index: section.blocks.length,
            },
          )
        }, '无法插入 Flow 内容块'),
        nestedSectionId: selectedSectionId,
        assets: Object.values(project.assets).map((asset) => ({
          id: asset.id,
          label: asset.filename,
          kind: asset.kind,
        })),
        componentPackages: Object.values(project.componentPackages).map(
          (embedded) => ({
            packageId: embedded.packageId,
            version: embedded.version,
          }),
        ),
        unavailableReasons: {
          media: '请先在媒体库导入图片、音频或视频，再插入媒体内容。',
          component: '请先导入组件包，再插入互动组件。',
        },
      },
      properties: {
        block: selectedBlock
          ? (structuredClone(selectedBlock) as FlowBlock)
          : null,
        assets: Object.values(project.assets)
          .filter((asset) => asset.kind === 'image')
          .map((asset) => ({ id: asset.id, label: asset.filename })),
        componentPackages: Object.values(project.componentPackages).map(
          (embedded) => ({
            packageId: embedded.packageId,
            version: embedded.version,
          }),
        ),
        onPatch: (blockId, patch) => runCourseCommand(() => {
          useEditorStore.getState().updateCourseFlowBlock(blockId, patch)
        }, '无法更新 Flow 内容块'),
        onStructuralCommand: (command) => runCourseCommand(() => {
          useEditorStore.getState().applyCourseFlowStructuralCommand(command)
        }, '无法更新 Flow 内容块结构'),
      },
      layers: {
        layers: [
          ...v9FlowEditorView.globalLayerItems,
          ...v9FlowEditorView.surfaceLayerItems,
        ],
        selectedLayerItemId: v9SlideVerticalSlice.selection.flowLayerItemId,
        onSelectLayer: (layerItemId) => runCourseCommand(() => {
          useEditorStore.getState().selectCourseFlowLayer(layerItemId)
        }, '无法选择 Flow 图层'),
      },
    }
  }, [runCourseCommand, v9FlowEditorView, v9SlideVerticalSlice])

  const v9SpatialCameraPanelProps = useMemo<SpatialCameraPanelProps | null>(() => {
    if (v9SlideVerticalSlice === null || v9SpatialEditorView === null) return null
    const project = v9SlideVerticalSlice.history.present
    const surface = project.surfaces.find(
      (candidate) => candidate.id === v9SpatialEditorView.surfaceId,
    )
    if (!surface || surface.type !== 'spatial-2d') return null
    const sessionCamera = spatialSessionCamera ?? surface.camera.home
    const frameLocation = (frameId: string) => project.locations.find(
      (location) =>
        location.kind === 'spatial-camera' &&
        location.surfaceId === surface.id &&
        location.cameraFrameId === frameId,
    )
    return {
      surfaceTitle: surface.title,
      frames: surface.camera.frames,
      home: surface.camera.home,
      sessionCamera,
      activeCameraFrameId: v9SpatialEditorView.activeCameraFrameId,
      worldLayerItems: surface.world.layerItems,
      semanticZoomRules: surface.semanticZoom,
      onAddFrame: () => runCourseCommand(() => {
        useEditorStore.getState().addCourseSpatialCameraFrame(sessionCamera)
      }, '无法添加空间镜头画面'),
      onRenameFrame: (frameId, name) => runCourseCommand(() => {
        useEditorStore.getState().renameCourseSpatialCameraFrame(frameId, name)
      }, '无法重命名镜头画面'),
      onReorderFrame: (frameId, toIndex) => runCourseCommand(() => {
        const currentIds = surface.camera.frames.map((frame) => frame.id)
        const fromIndex = currentIds.indexOf(frameId)
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          toIndex >= currentIds.length ||
          fromIndex === toIndex
        ) {
          if (fromIndex < 0) throw new Error('镜头画面已失效，请刷新后重试')
          if (toIndex < 0 || toIndex >= currentIds.length) {
            throw new Error('镜头位置已变化，请刷新后重试')
          }
          return
        }
        const nextIds = [...currentIds]
        const [movedId] = nextIds.splice(fromIndex, 1)
        if (!movedId) throw new Error('镜头画面已失效，请刷新后重试')
        nextIds.splice(toIndex, 0, movedId)
        useEditorStore.getState().reorderCourseSpatialCameraFrames(nextIds)
      }, '无法调整镜头顺序'),
      onDeleteFrame: (frameId) => runCourseCommand(() => {
        useEditorStore.getState().deleteCourseSpatialCameraFrame(frameId)
      }, '无法删除镜头画面'),
      onSetHome: () => runCourseCommand(() => {
        useEditorStore.getState().setCourseSpatialCameraHome(sessionCamera)
      }, '无法设置首页镜头'),
      onActivateFrame: (frameId) => runCourseCommand(() => {
        const location = frameLocation(frameId)
        if (!location) throw new Error('找不到对应的空间镜头位置')
        useEditorStore.getState().selectCourseLocation(location.id)
      }, '无法切换镜头画面'),
      onAddSemanticZoomRule: (rule) => runCourseCommand(() => {
        useEditorStore.getState().addCourseSpatialSemanticZoomRule(rule)
      }, '无法添加语义缩放规则'),
      onUpdateSemanticZoomRule: (ruleId, patch) => runCourseCommand(() => {
        useEditorStore.getState().updateCourseSpatialSemanticZoomRule(
          ruleId,
          patch,
        )
      }, '无法更新语义缩放规则'),
      onDeleteSemanticZoomRule: (ruleId) => runCourseCommand(() => {
        useEditorStore.getState().deleteCourseSpatialSemanticZoomRule(ruleId)
      }, '无法删除语义缩放规则'),
    }
  }, [runCourseCommand, spatialSessionCamera, v9SlideVerticalSlice, v9SpatialEditorView])

  const v9SpatialLayerInspectorProps = useMemo<SpatialLayerInspectorProps | null>(() => {
    if (v9SlideVerticalSlice === null || v9SpatialEditorView === null) return null
    const selectedId = v9SlideVerticalSlice.selection.spatialLayerItemIds?.[0]
    const selectedLayer = selectedId
      ? v9SpatialEditorView.layers.find(
          (layer) => layer.selectionId === selectedId,
        ) ?? null
      : null
    const item = selectedLayer?.item ?? null
    return {
      layer: item
        ? {
            layerItemId: item.layerItemId,
            label: item.label,
            visible: item.visible,
            locked: item.locked,
            x: item.frame.x,
            y: item.frame.y,
            width: item.frame.width,
            height: item.frame.height,
            rotation: item.rotation,
            opacity: item.opacity,
          }
        : null,
      onPatch: (patch) => runCourseCommand(() => {
        if (!selectedId) throw new Error('请先选择一个空间图层')
        useEditorStore.getState().updateCourseSpatialLayer({
          ...patch,
          layerItemId: selectedId,
        })
      }, '无法更新空间图层'),
    }
  }, [runCourseCommand, v9SlideVerticalSlice, v9SpatialEditorView])

  const v9SpatialPathEditorProps = useMemo<SpatialPathEditorProps | null>(() => {
    if (v9SlideVerticalSlice === null || v9SpatialEditorView === null) return null
    const project = v9SlideVerticalSlice.history.present
    const surface = project.surfaces.find(
      (candidate) => candidate.id === v9SpatialEditorView.surfaceId,
    )
    if (!surface || surface.type !== 'spatial-2d') return null
    return {
      surfaceTitle: surface.title,
      worldLayerItems: surface.world.layerItems,
      paths: surface.world.paths ?? [],
      relations: surface.world.relations ?? [],
      onAddPath: (input) => runCourseCommand(() => {
        useEditorStore.getState().addCourseSpatialPath({
          surfaceId: surface.id,
          name: input.name,
          layerItemIds: input.layerItemIds,
          style: input.style,
        })
      }, '无法添加空间路径'),
      onRenamePath: (pathId, name) => runCourseCommand(() => {
        useEditorStore.getState().updateCourseSpatialPath(pathId, { name })
      }, '无法重命名空间路径'),
      onUpdatePathStyle: (pathId, style) => runCourseCommand(() => {
        useEditorStore.getState().updateCourseSpatialPath(pathId, { style })
      }, '无法更新空间路径样式'),
      onDeletePath: (pathId) => runCourseCommand(() => {
        useEditorStore.getState().deleteCourseSpatialPath(pathId)
      }, '无法删除空间路径'),
      onAddRelation: (input) => runCourseCommand(() => {
        useEditorStore.getState().addCourseSpatialRelation({
          surfaceId: surface.id,
          sourceLayerItemId: input.sourceLayerItemId,
          targetLayerItemId: input.targetLayerItemId,
          kind: input.kind,
          label: input.label,
        })
      }, '无法添加空间关系连线'),
      onUpdateRelationLabel: (relationId, label) => runCourseCommand(() => {
        useEditorStore.getState().updateCourseSpatialRelation(relationId, { label })
      }, '无法更新关系标签'),
      onUpdateRelationKind: (relationId, kind) => runCourseCommand(() => {
        useEditorStore.getState().updateCourseSpatialRelation(relationId, { kind })
      }, '无法更新关系类型'),
      onDeleteRelation: (relationId) => runCourseCommand(() => {
        useEditorStore.getState().deleteCourseSpatialRelation(relationId)
      }, '无法删除空间关系连线'),
    }
  }, [runCourseCommand, v9SlideVerticalSlice, v9SpatialEditorView])

  const v9SpatialDocumentControl = useMemo<RightSidebarSpatialDocumentControl | undefined>(() => {
    if (
      v9SpatialCameraPanelProps === null ||
      v9SpatialLayerInspectorProps === null ||
      v9SpatialPathEditorProps === null
    ) return undefined
    return {
      elements: {
        onAddText: () => runCourseCommand(() => {
          useEditorStore.getState().addCourseSpatialTextLayer()
        }, '无法添加空间文字'),
        onAddShape: () => runCourseCommand(() => {
          useEditorStore.getState().addCourseSpatialShapeLayer()
        }, '无法添加空间图形'),
        onAddFormula: () => runCourseCommand(() => {
          useEditorStore.getState().addCourseSpatialFormulaLayer()
        }, '无法添加空间公式'),
      },
      layers: v9SpatialLayerInspectorProps,
      properties: {
        camera: v9SpatialCameraPanelProps,
        paths: v9SpatialPathEditorProps,
      },
    }
  }, [
    runCourseCommand,
    v9SpatialCameraPanelProps,
    v9SpatialLayerInspectorProps,
    v9SpatialPathEditorProps,
  ])

  const v9ScenePanelFlowDocumentControl = useMemo<ScenePanelFlowDocumentControl | undefined>(() => {
    if (v9FlowEditorView === null) return undefined
    return {
      surfaceTitle: v9FlowEditorView.surfaceTitle,
      flowView: v9FlowEditorView,
      selectedBlockId: v9FlowEditorView.activeBlockId,
      onSelectBlock: (blockId) => runCourseCommand(() => {
        useEditorStore.getState().selectCourseFlowBlock(blockId)
      }, '无法切换 Flow 内容块'),
      ...v9FlowStructuralCommands,
      onAddSurface: () => runCourseCommand(() => {
        useEditorStore.getState().addCourseSurface('flow')
      }, '无法新建 Flow 讲义'),
    }
  }, [runCourseCommand, v9FlowEditorView, v9FlowStructuralCommands])

  const v9ScenePanelSpatialDocumentControl = useMemo<ScenePanelSpatialDocumentControl | undefined>(() => {
    if (v9SpatialCameraPanelProps === null) return undefined
    return {
      ...v9SpatialCameraPanelProps,
      onAddSurface: () => runCourseCommand(() => {
        useEditorStore.getState().addCourseSurface('spatial-2d')
      }, '无法新建 Spatial 空间'),
    }
  }, [runCourseCommand, v9SpatialCameraPanelProps])

  const v9ScenePanelCourseLocations = useMemo<readonly ScenePanelCourseLocation[] | undefined>(() => {
    if (v9SlideVerticalSlice === null) return undefined
    const project = v9SlideVerticalSlice.history.present
    const surfaceById = new Map(
      project.surfaces.map((surface) => [surface.id, surface]),
    )
    return project.locations.map((location) => {
      const surface = surfaceById.get(location.surfaceId)
      const surfaceLabel = surface?.title ?? '课程内容'
      const label = location.kind === 'slide-scene'
        ? surface?.type === 'slide'
          ? surface.scenes.find((scene) => scene.id === location.sceneId)?.name
            ? `${surface.title} · ${surface.scenes.find((scene) => scene.id === location.sceneId)!.name}`
            : location.label
          : location.label
        : location.label
      return {
        locationId: location.id,
        label,
        kind: location.kind,
        surfaceId: location.surfaceId,
        active: location.id === v9SlideVerticalSlice.selection.locationId,
      }
    })
  }, [v9SlideVerticalSlice])

  const v9FlowAuthoring = useMemo<WorkspaceFlowAuthoringInput | undefined>(() => {
    if (v9FlowEditorView === null) return undefined
    return {
      view: v9FlowEditorView,
      selectedBlockId: v9FlowEditorView.activeBlockId,
      onSelectBlock: (blockId) => runCourseCommand(() => {
        useEditorStore.getState().selectCourseFlowBlock(blockId)
      }, '无法切换 Flow 内容块'),
      ...v9FlowStructuralCommands,
      layers: [
        ...v9FlowEditorView.globalLayerItems,
        ...v9FlowEditorView.surfaceLayerItems,
      ],
      selectedLayerItemId: v9SlideVerticalSlice?.selection.flowLayerItemId,
      onSelectLayer: (layerItemId) => runCourseCommand(() => {
        useEditorStore.getState().selectCourseFlowLayer(layerItemId)
      }, '无法选择 Flow 图层'),
      onPatchBlock: (blockId, patch) => runCourseCommand(() => {
        useEditorStore.getState().updateCourseFlowBlock(blockId, patch)
      }, '无法更新 Flow 内容块'),
      onStructuralCommand: (command) => runCourseCommand(() => {
        useEditorStore.getState().applyCourseFlowStructuralCommand(command)
      }, '无法更新 Flow 结构'),
    }
  }, [runCourseCommand, v9FlowEditorView, v9FlowStructuralCommands, v9SlideVerticalSlice])

  const v9SpatialAuthoring = useMemo<WorkspaceSpatialAuthoringInput | undefined>(() => {
    if (v9SlideVerticalSlice === null || v9SpatialEditorView === null) return undefined
    const project = v9SlideVerticalSlice.history.present
    const surface = project.surfaces.find(
      (candidate) => candidate.id === v9SpatialEditorView.surfaceId,
    )
    if (!surface || surface.type !== 'spatial-2d') return undefined
    return {
      spatial: surface,
      viewportSize: { width: 1280, height: 720 },
      selectedLayerItemIds: v9SlideVerticalSlice.selection.spatialLayerItemIds,
      activeCameraFrameId: v9SpatialEditorView.activeCameraFrameId,
      viewportOverlays: buildSpatialViewportOverlays(v9SpatialEditorView),
      selectedViewportLayerId: v9SlideVerticalSlice.editingScope === 'global'
        ? v9SlideVerticalSlice.selection.selectionIds[0] ?? null
        : null,
      onCameraChange: (camera) => {
        setSpatialSessionCamera(camera)
        useEditorStore.getState().setSpatialViewportCamera(camera)
      },
      interactionDisabled: busy,
      onSelect: (ids) => runCourseCommand(() => {
        useEditorStore.getState().selectCourseSpatialLayers(ids)
      }, '无法选择空间图层'),
      onSelectViewportLayer: (input) => runCourseCommand(() => {
        if (input.source === 'global') {
          useEditorStore.getState().selectGlobalLayerScope()
          useEditorStore.getState().selectCourseLayers({
            nodeIds: [input.layerItemId],
            additive: false,
          })
          return
        }
        useEditorStore.getState().setCourseEditingScope('surface')
        useEditorStore.getState().selectCourseLayers({
          nodeIds: [input.layerItemId],
          additive: false,
        })
      }, '无法选择视口图层'),
      onCommitEdit: (input) => runCourseCommand(() => {
        const store = useEditorStore.getState()
        store.selectCourseSpatialLayers([input.layerItemId])
        const snapshot = store.createLiveEditorSelectionSnapshot()
        const result = store.routeEditorAction(
          input.kind === 'formula' ? 'edit-formula' : 'edit-text',
          snapshot ?? undefined,
          input.kind === 'formula'
            ? { editFormulaAccessibleText: input.value }
            : { editText: input.value },
        )
        if (!result.ok) throw new Error(result.reason)
      }, '无法提交空间文字'),
      onTransformEnd: (transforms) => runCourseCommand(() => {
        useEditorStore.getState().transformCourseSpatialLayers({
          nodes: transforms,
        })
      }, '无法变换空间图层'),
    }
  }, [busy, runCourseCommand, v9SlideVerticalSlice, v9SpatialEditorView])

  const invokeEditorAction = useCallback((
    actionId: EditorActionId,
    snapshot?: EditorSelectionSnapshot,
  ) => {
    const result = useEditorStore.getState().routeEditorAction(actionId, snapshot)
    if (!result.ok) {
      useEditorStore.getState().setError(result.reason)
    }
    return result
  }, [])

  const openEditorMenuAt = useCallback((
    point: { x: number; y: number },
    focus?: EventTarget | null,
  ) => {
    const live = useEditorStore.getState().createLiveEditorSelectionSnapshot(focus)
    if (!live) return
    setEditorMenu({
      snapshot: captureEditorMenuSnapshot(live),
      point,
    })
  }, [])

  const v9EffectiveLayers = useMemo(() => {
    if (v9SlideVerticalSlice === null) return undefined
    const session = v9SlideVerticalSlice
    const project = session.history.present
    const locationId = session.selection.locationId
    const selectedIds = session.editingScope === 'global' || session.selection.surfaceKind === 'slide'
      ? session.selection.selectionIds
      : session.selection.surfaceKind === 'flow'
        ? [
            session.selection.flowLayerItemId,
            session.selection.flowBlockId,
          ].filter((id): id is string => Boolean(id))
        : session.selection.spatialLayerItemIds ?? []
    if (v9FlowEditorView) {
      const items = v9FlowEditorView.effectiveLayers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        sourceKind: layer.source === 'flow-block' ? 'flow' : layer.source,
        ownerKey: layer.ownerKey,
        selected: selectedIds.includes(layer.id),
        locked: layer.locked,
        hidden: layer.hidden,
        reorderDisabledReason: layer.canReorder ? undefined : '当前图层不能跨范围排序',
      }))
      return {
        items,
        onSelect: (event: { id: string; additive: boolean }) => {
          const layer = v9FlowEditorView.effectiveLayers.find((candidate) => candidate.id === event.id)
          if (layer?.source === 'global') {
            useEditorStore.getState().selectGlobalLayerScope()
            useEditorStore.getState().selectCourseLayers({
              nodeIds: [event.id],
              additive: event.additive,
            })
            return
          }
          if (layer?.source === 'flow-block') {
            useEditorStore.getState().selectCourseFlowBlock(event.id)
            return
          }
          useEditorStore.getState().selectCourseFlowLayer(event.id)
        },
        onRename: (id: string, name: string) => runCourseCommand(() => {
          const layer = v9FlowEditorView.effectiveLayers.find((candidate) => candidate.id === id)
          if (layer?.source === 'flow-block') {
            useEditorStore.getState().updateCourseFlowBlock(id, { text: name })
            return
          }
          const handlers = createEffectiveLayerListHandlers({
            getProject: () => useEditorStore.getState().courseSession!.history.present,
            locationId,
            stateId: session.selection.stateId,
            selectedIds,
            apply: (result) => useEditorStore.getState().applyCourseLayerCommandResult(result),
            onSelect: () => undefined,
          })
          handlers.onRename(id, name)
        }, '无法重命名图层'),
        onReorder: (event: {
          fromId: string
          toId: string
          fromOwnerKey: string
          toOwnerKey: string
          placement: 'before' | 'after'
        }) => runCourseCommand(() => {
          const handlers = createEffectiveLayerListHandlers({
            getProject: () => useEditorStore.getState().courseSession!.history.present,
            locationId,
            stateId: session.selection.stateId,
            selectedIds,
            apply: (result) => useEditorStore.getState().applyCourseLayerCommandResult(result),
            onSelect: () => undefined,
          })
          handlers.onReorder(event)
        }, '无法调整图层顺序'),
        onToggleVisibility: (id: string) => runCourseCommand(() => {
          const layer = v9FlowEditorView.effectiveLayers.find((candidate) => candidate.id === id)
          if (layer && !layer.canHide) {
            throw new Error('当前 Flow 块不支持隐藏')
          }
          const handlers = createEffectiveLayerListHandlers({
            getProject: () => useEditorStore.getState().courseSession!.history.present,
            locationId,
            stateId: session.selection.stateId,
            selectedIds,
            apply: (result) => useEditorStore.getState().applyCourseLayerCommandResult(result),
            onSelect: () => undefined,
          })
          handlers.onToggleVisibility(id)
        }, '无法切换图层可见性'),
        onToggleLock: (id: string) => runCourseCommand(() => {
          const layer = v9FlowEditorView.effectiveLayers.find((candidate) => candidate.id === id)
          if (layer && !layer.canLock) {
            throw new Error('当前 Flow 块不支持锁定')
          }
          const handlers = createEffectiveLayerListHandlers({
            getProject: () => useEditorStore.getState().courseSession!.history.present,
            locationId,
            stateId: session.selection.stateId,
            selectedIds,
            apply: (result) => useEditorStore.getState().applyCourseLayerCommandResult(result),
            onSelect: () => undefined,
          })
          handlers.onToggleLock(id)
        }, '无法切换图层锁定'),
        onOpenMenu: (event: { clientX: number; clientY: number }) => {
          openEditorMenuAt({ x: event.clientX, y: event.clientY })
        },
      }
    }
    const handlers = createEffectiveLayerListHandlers({
      getProject: () => useEditorStore.getState().courseSession?.history.present ?? project,
      locationId,
      stateId: session.selection.stateId,
      selectedIds,
      apply: (result) => useEditorStore.getState().applyCourseLayerCommandResult(result),
      onSelect: (id, additive) => {
        if (session.editingScope === 'global') {
          useEditorStore.getState().selectCourseLayers({ nodeIds: [id], additive })
          return
        }
        if (session.selection.surfaceKind === 'spatial-2d') {
          useEditorStore.getState().selectCourseSpatialLayers(
            additive
              ? [...(session.selection.spatialLayerItemIds ?? []), id]
              : [id],
          )
          return
        }
        useEditorStore.getState().selectCourseLayers({ nodeIds: [id], additive })
      },
    })
    return {
      items: toEffectiveLayerListItems(handlers.items()),
      onSelect: handlers.onSelect,
      onRename: handlers.onRename,
      onReorder: handlers.onReorder,
      onToggleVisibility: handlers.onToggleVisibility,
      onToggleLock: handlers.onToggleLock,
      onDelete: handlers.onDelete,
      deletionMode: session.selection.surfaceKind === 'slide' &&
        session.editingScope === 'scene' &&
        session.selection.stateId !== null
        ? 'hide-in-state' as const
        : 'delete' as const,
      onOpenMenu: (event: { clientX: number; clientY: number }) => {
        openEditorMenuAt({ x: event.clientX, y: event.clientY })
      },
    }
  }, [openEditorMenuAt, runCourseCommand, v9FlowEditorView, v9SlideVerticalSlice])

  const importPackagesIntoStore = useEditorStore(
    (state) => state.importComponentPackages,
  )
  const replacePackageInStore = useEditorStore(
    (state) => state.replaceComponentPackage,
  )
  const addImageNodes = useEditorStore((state) => state.addImageNodes)
  const replaceImageAsset = useEditorStore(
    (state) => state.replaceImageAsset,
  )
  const addVideoNodes = useEditorStore((state) => state.addVideoNodes)
  const importAssets = useEditorStore((state) => state.importAssets)
  const importSounds = useEditorStore((state) => state.importSounds)

  const undoActiveDocument = useCallback(() => {
    if (lifecycleOperationInFlightRef.current) return
    if (!v9BackendActive) {
      useEditorStore.getState().undo()
      return
    }
    useEditorStore.getState().undoCourseProject()
  }, [v9BackendActive])

  const redoActiveDocument = useCallback(() => {
    if (lifecycleOperationInFlightRef.current) return
    if (!v9BackendActive) {
      useEditorStore.getState().redo()
      return
    }
    useEditorStore.getState().redoCourseProject()
  }, [v9BackendActive])

  const renameActiveDocument = useCallback((title: string) => {
    if (lifecycleOperationInFlightRef.current) return
    if (!v9BackendActive) {
      useEditorStore.getState().renameProject(title)
      return
    }
    useEditorStore.getState().renameCourseProject(title)
  }, [v9BackendActive])

  const handleOpenHealth = useCallback(() => {
    if (!v9BackendActive) {
      setProjectHealthOpen(true)
      return
    }
    void run(async () => {
      const current = useEditorStore.getState().courseSession
      if (current === null) throw new Error('当前课件不可用')
      const archive = captureV9SlideVerticalSliceArchive(current)
      const packages = current.componentPackages
      const result = await checkCourseProjectHealth(archive, packages)
      const inspection = inspectCourseProjectHealth(archive.project)
      const mergedHealth = inspection.items.length === 0
        ? result
        : {
            ...result,
            diagnostics: [
              ...result.diagnostics,
              ...inspection.items.map((item) => ({
                severity: item.severity,
                message: item.message,
              })),
            ],
            summary: {
              ...result.summary,
              error: result.summary.error + inspection.error,
              warning: result.summary.warning + inspection.warning,
              canExport: result.summary.canExport && inspection.error === 0,
            },
          }
      const latest = useEditorStore.getState().courseSession
      if (
        latest === null ||
        latest.sessionId !== current.sessionId ||
        latest.history.present !== archive.project ||
        !courseV9AssetFilesEqual(
          registeredV9SlideAssetFiles(latest.history.present, latest.assetFiles),
          archive.assetFiles,
        ) ||
        latest.componentFiles !== archive.componentFiles ||
        latest.componentPackages !== packages
      ) {
        return
      }
      setV9HealthCheck({
        sessionId: current.sessionId,
        archive,
        componentPackages: packages,
        result: mergedHealth,
      })
      setProjectHealthOpen(true)
    }, '无法完成工程检查')
  }, [run, v9BackendActive])

  useEffect(() => {
    if (v9BackendActive && projectHealthOpen && activeV9HealthCheck === null) {
      setProjectHealthOpen(false)
    }
  }, [activeV9HealthCheck, projectHealthOpen, v9BackendActive])

  const refreshRecentProjects = useCallback(async () => {
    if (!window.desktopAPI) return
    setRecentProjects(await window.desktopAPI.listRecentProjects())
  }, [])

  const clearRecoveryCopy = useCallback(async () => {
    recoveryCoordinatorRef.current?.cancel()
    await desktopApi().clearRecoveryProject()
  }, [])

  const confirmDiscardIfNeeded = useCallback(async () => {
    if (!activeDocumentDirty) {
      return resolveCloseDirtyState({ dirty: false, decision: 'cancel' }).allowClose
    }
    const raw = await desktopApi().confirmDiscardChanges()
    return resolveCloseDirtyState({
      dirty: true,
      decision: raw === 'discard' ? 'abandon' : 'cancel',
    }).allowClose
  }, [activeDocumentDirty])

  const createBlankCourse = useCallback((kind: 'slide' | 'flow' | 'spatial') => {
    void run(async () => {
      if (!(await confirmDiscardIfNeeded())) return
      await clearRecoveryCopy().catch((error) => {
        console.error('清理恢复数据失败', error)
      })
      const store = useEditorStore.getState()
      if (kind === 'flow') store.createBlankFlowCourse()
      else if (kind === 'spatial') store.createBlankSpatialCourse()
      else store.createBlankSlideCourse()
    }, '新建课件失败，请重试。')
  }, [clearRecoveryCopy, confirmDiscardIfNeeded, run])

  const handleNew = useCallback(() => {
    createBlankCourse('slide')
  }, [createBlankCourse])

  const handleOpen = useCallback(() => {
    void run(async () => {
      if (!(await confirmDiscardIfNeeded())) return
      const file = await desktopApi().openProject()
      if (!file) return
      let archive: CourseProjectArchiveData
      try {
        archive = await openCourseProjectArchiveAsync(file.bytes)
      } catch (error) {
        await desktopApi().removeRecentProject({ path: file.path }).catch((removeError) => {
          console.error('移除不兼容的最近工程失败', removeError)
        })
        await refreshRecentProjects().catch((refreshError) => {
          console.error('刷新最近工程列表失败', refreshError)
        })
        throw error
      }
      useEditorStore.getState().loadCourseProject(archive, file.path)
      await desktopApi().confirmProjectOpened({ path: file.path }).catch((error) => {
        console.error('最近工程列表更新失败', error)
        useEditorStore.getState().setError('工程已经打开，但最近工程列表未能更新。')
      })
      await clearRecoveryCopy().catch((error) => {
        console.error('清理恢复数据失败', error)
      })
      await refreshRecentProjects().catch((error) => {
        console.error('刷新最近工程列表失败', error)
        useEditorStore.getState().setError('工程已经打开，但最近工程列表未能刷新。')
      })
    }, '打开工程失败。请检查文件是否损坏后重试。')
  }, [clearRecoveryCopy, confirmDiscardIfNeeded, refreshRecentProjects, run])

  const handleImportLegacy = useCallback(() => {
    void run(async () => {
      if (!(await confirmDiscardIfNeeded())) return
      const file = await desktopApi().selectLegacyProject()
      if (!file) return
      const imported = await importProjectV8ArchiveAsCourseProjectAsync(file.bytes)
      await clearRecoveryCopy().catch((error) => {
        console.error('清理原恢复数据失败', error)
      })
      useEditorStore.getState().loadCourseProject(imported, null, { markDirty: true })
      await desktopApi().removeRecentProject({ path: file.path }).catch((error) => {
        console.error('移除旧版最近工程失败', error)
      })
      const reportNotes = [...imported.report.notes, ...imported.report.warnings]
      useEditorStore.getState().setStatus(
        reportNotes.length > 0
          ? `已导入旧版工程；${reportNotes.slice(0, 3).join('；')}`
          : '已导入旧版工程；原文件未改写，请另存为新工程',
      )
      if (imported.report.warnings.length > 0) {
        useEditorStore.getState().setError(
          `旧版导入提醒：\n${imported.report.warnings.slice(0, 8).join('\n')}`,
        )
      }
      await refreshRecentProjects().catch((error) => {
        console.error('刷新最近工程列表失败', error)
        useEditorStore.getState().setError('旧版工程已经导入，但最近工程列表未能刷新。')
      })
    }, '旧版工程导入失败。请检查文件是否损坏后重试。')
  }, [clearRecoveryCopy, confirmDiscardIfNeeded, refreshRecentProjects, run])

  const handleOpenRecent = useCallback((path: string) => {
    void run(async () => {
      if (!(await confirmDiscardIfNeeded())) return
      const file = await desktopApi().openRecentProject({ path })
      let archive: CourseProjectArchiveData
      try {
        archive = await openCourseProjectArchiveAsync(file.bytes)
      } catch (error) {
        await desktopApi().removeRecentProject({ path: file.path }).catch((removeError) => {
          console.error('移除不兼容的最近工程失败', removeError)
        })
        await refreshRecentProjects().catch((refreshError) => {
          console.error('刷新最近工程列表失败', refreshError)
        })
        throw error
      }
      useEditorStore.getState().loadCourseProject(archive, file.path)
      await desktopApi().confirmProjectOpened({ path: file.path }).catch((error) => {
        console.error('最近工程列表更新失败', error)
        useEditorStore.getState().setError('工程已经打开，但最近工程列表未能更新。')
      })
      await clearRecoveryCopy().catch((error) => {
        console.error('清理恢复数据失败', error)
      })
      await refreshRecentProjects().catch((error) => {
        console.error('刷新最近工程列表失败', error)
        useEditorStore.getState().setError('工程已经打开，但最近工程列表未能刷新。')
      })
    }, '最近工程打开失败。文件可能已被移动，请使用“打开工程”重新选择。')
  }, [clearRecoveryCopy, confirmDiscardIfNeeded, refreshRecentProjects, run])

  const handleSave = useCallback(
    async (saveAs = false) => {
      if (saveInFlightRef.current) return false
      saveInFlightRef.current = true
      let savedCurrentRevision = false
      try {
        await run(async () => {
          const state = useEditorStore.getState()
          const courseSession = state.courseSession
          if (courseSession === null) throw new Error('当前课件状态不可用')
          if (
            !saveAs &&
            courseSession.projectPath &&
            !isV9SlideVerticalSliceDirty(courseSession)
          ) {
            useEditorStore.getState().setStatus('工程已是最新')
            savedCurrentRevision = true
            return
          }
          const sessionId = courseSession.sessionId
          const savedSnapshot = captureV9SlideVerticalSliceArchive(courseSession)
          const saved = await saveCourseProjectAsync(savedSnapshot)
          const bytes = saved.bytes
          const result = await desktopApi().saveProject({
            path: saveAs ? undefined : (courseSession.projectPath ?? undefined),
            suggestedName: `${savedSnapshot.project.title}.h5lesson`,
            bytes,
          })
          if (result) {
            savedCurrentRevision = useEditorStore.getState().completeCourseProjectSave(
              sessionId,
              savedSnapshot,
              result.path,
            )
            if (savedCurrentRevision) {
              await clearRecoveryCopy().catch((error) => {
                console.error('清理恢复数据失败', error)
              })
            }
            await refreshRecentProjects()
          }
        }, '保存失败。请检查磁盘空间或另存为其他位置。')
      } finally {
        saveInFlightRef.current = false
      }
      return savedCurrentRevision
    },
    [clearRecoveryCopy, refreshRecentProjects, run],
  )

  const selectAndImportImage = useCallback(
    async (
      mode: 'add' | 'library' | 'replace',
      position?: { x?: number; y?: number },
    ) => {
      await run(async () => {
        if (mode === 'replace') {
          const file = await desktopApi().selectImage()
          if (!file) return
          const dimensions = await readImageDimensions(file.bytes, file.mimeType)
          const imported = createImageAssetImport(file, { dimensions })
          const node = selectSelectedNode(useEditorStore.getState())
          if (!node || node.type !== 'image') {
            throw new UserFacingError(
              '无法替换图片',
              '当前没有选中图片节点。',
              '请先选择画布中的图片，再点击“替换图片”。',
            )
          }
          replaceImageAsset(node.id, imported.meta, imported.bytes)
          return
        }

        const batch = await desktopApi().selectImages()
        if (!batch) return
        const prepared = await prepareAssetBatch<SelectedImageBatchFile>(
          batch.accepted,
          'image',
          async (file) => {
            const dimensions = await readImageDimensions(file.bytes, file.mimeType)
            const imported = createImageAssetImport(file, { dimensions })
            return { meta: imported.meta, bytes: imported.bytes }
          },
        )
        const issues = [...desktopRejections(batch.rejected), ...prepared.issues]
        const importPlan = planMediaBatchImport(
          mode,
          prepared.placements.length,
          MAX_BATCH_CANVAS_ITEMS,
        )
        const commitResult = commitMediaBatchImport({
          plan: importPlan,
          placements: prepared.placements,
          additions: prepared.additions,
          placeOnCanvas: (items) => addImageNodes(items, position),
          importIntoLibrary: importAssets,
        })
        reportBatchOutcome({
          label: mode === 'library' ? '图片批量入库' : '图片批量添加',
          completedCount: commitResult.completedCount,
          duplicateCount: prepared.duplicateCount,
          issues,
          libraryFallback: commitResult.libraryFallback,
        })
      }, '图片读取失败。请重新选择受支持的图片。')
    },
    [addImageNodes, importAssets, replaceImageAsset, reportBatchOutcome, run],
  )

  const selectImageAsset = useCallback(async (): Promise<ImportedImageAsset | null> => {
    const imported = await run(async () => {
      const file = await desktopApi().selectImage()
      if (!file) return null
      const dimensions = await readImageDimensions(file.bytes, file.mimeType)
      return createImageAssetImport(file, { dimensions })
    }, '图片读取失败。请重新选择受支持的图片。')
    return imported ?? null
  }, [run])

  const selectAndImportAudio = useCallback(async () => {
    await run(async () => {
      const batch = await desktopApi().selectAudios()
      if (!batch) return
      const session = useEditorStore.getState().courseSession
      const prepared = await prepareAssetBatch<SelectedMediaBatchFile>(
        batch.accepted,
        'audio',
        async (file) => {
          const metadata = await readMediaMetadata(file.bytes, file.mimeType, 'audio')
          const imported = createMediaAssetImport(file, 'audio', metadata)
          return { meta: imported.meta, bytes: imported.bytes }
        },
        session
          ? {
              assets: session.history.present.assets,
              assetFiles: session.assetFiles,
            }
          : undefined,
      )
      if (useEditorStore.getState().courseSession !== null) {
        useEditorStore.getState().importCourseSounds(prepared.additions)
      } else {
        importSounds(prepared.additions)
      }
      reportBatchOutcome({
        label: '声音批量入库',
        completedCount: prepared.additions.length,
        duplicateCount: prepared.duplicateCount,
        issues: [...desktopRejections(batch.rejected), ...prepared.issues],
      })
    }, '声音读取失败。请重新选择受支持的声音文件。')
  }, [importSounds, reportBatchOutcome, run])

  const selectAndImportVideo = useCallback(async (
    mode: 'add' | 'library',
    position?: { x?: number; y?: number },
  ) => {
    await run(async () => {
      const batch = await desktopApi().selectVideos()
      if (!batch) return
      const prepared = await prepareAssetBatch<SelectedMediaBatchFile>(
        batch.accepted,
        'video',
        async (file) => {
          const metadata = await readMediaMetadata(file.bytes, file.mimeType, 'video')
          const imported = createMediaAssetImport(file, 'video', metadata)
          return { meta: imported.meta, bytes: imported.bytes }
        },
      )
      const importPlan = planMediaBatchImport(
        mode,
        prepared.placements.length,
        MAX_BATCH_CANVAS_ITEMS,
      )
      const commitResult = commitMediaBatchImport({
        plan: importPlan,
        placements: prepared.placements,
        additions: prepared.additions,
        placeOnCanvas: (items) => addVideoNodes(items, position),
        importIntoLibrary: importAssets,
      })
      reportBatchOutcome({
        label: mode === 'add' ? '视频批量添加' : '视频批量入库',
        completedCount: commitResult.completedCount,
        duplicateCount: prepared.duplicateCount,
        issues: [...desktopRejections(batch.rejected), ...prepared.issues],
        libraryFallback: commitResult.libraryFallback,
      })
    }, '视频读取失败。请重新选择 MP4 或 WebM 文件。')
  }, [addVideoNodes, importAssets, reportBatchOutcome, run])

  const handleImportComponent = useCallback(() => {
    void run(async () => {
      const batch = await desktopApi().selectComponentPackages()
      if (!batch) return
      const issues = batch.rejected.map((item) =>
        `${item.name}：${item.title}；${item.message}；${item.suggestion}`,
      )
      const packagesById = new Map<string, ComponentPackageData>()
      const currentPackages = useEditorStore.getState().componentPackages
      for (const file of batch.accepted) {
        try {
          const imported = await importComponentPackageAsync(file.bytes, {
            provenance: {
              sha256: file.sha256,
              importedAt: new Date().toISOString(),
              sourceLabel: `手动导入：${file.name}`,
            },
          })
          const packageId = imported.manifest.id
          const duplicateInBatch = packagesById.get(packageId)
          if (duplicateInBatch) {
            issues.push(
              `${file.name}：同一批次已包含组件 ${packageId} ` +
              `v${duplicateInBatch.manifest.version}，请每个 ID 只选择一个版本。`,
            )
            continue
          }
          const existing = currentPackages[packageId]
          if (existing) {
            const sameLockedPackage =
              existing.manifest.version === imported.manifest.version &&
              existing.provenance?.sha256 === imported.provenance?.sha256
            issues.push(sameLockedPackage
              ? `${file.name}：工程已经包含完全相同的组件，已跳过。`
              : `${file.name}：工程已包含 ${packageId} v${existing.manifest.version}；请从工程组件菜单审阅更新或替换。`)
            continue
          }
          packagesById.set(packageId, imported)
        } catch (error) {
          issues.push(`${file.name}：${readableError(error, '组件包内容无效。')}`)
        }
      }

      const packages = [...packagesById.values()]
      if (packages.length === 0) {
        useEditorStore.getState().setStatus('外部组件导入未改变工程')
        if (issues.length > 0) {
          setError(`没有可加入工程的组件：\n${issues.slice(0, 8).join('\n')}`)
        }
        return
      }
      if (useEditorStore.getState().courseSession !== null) {
        useEditorStore.getState().importCourseComponentPackages(packages)
      } else {
        importPackagesIntoStore(packages)
      }
      useEditorStore.getState().setStatus(
        issues.length > 0
          ? `已加入 ${packages.length} 个外部组件，${issues.length} 项未加入`
          : `已加入 ${packages.length} 个外部组件`,
      )
      if (issues.length > 0) {
        setError(
          `已加入 ${packages.length} 个组件；另有 ${issues.length} 项未加入：\n` +
          issues.slice(0, 8).join('\n'),
        )
      }
    }, '外部组件读取失败。请重新选择 .h5component 文件。')
  }, [importPackagesIntoStore, run, setError])

  const handleReplaceComponent = useCallback((packageId: string) => {
    void run(async () => {
      const file = await desktopApi().selectComponentPackage()
      if (!file) return
      const sha256 = await componentPackageSha256(file.bytes)
      const imported = await importComponentPackageAsync(file.bytes, {
        provenance: {
          sha256,
          importedAt: new Date().toISOString(),
          sourceLabel: `手动替换：${file.name}`,
        },
      })
      if (imported.manifest.id !== packageId) {
        throw new UserFacingError(
          '组件替换已取消',
          `所选包 ID 为“${imported.manifest.id}”，与工程组件“${packageId}”不一致。`,
          '请选择同一组件 ID 的新版本；需要并存的组件应作为新包导入。',
        )
      }
      if (useEditorStore.getState().courseSession !== null) {
        useEditorStore.getState().replaceCourseComponentPackage(packageId, imported)
        return
      }
      setComponentPackageRequest({
        mode: 'replace',
        packageId,
        packageData: imported,
        sourceFileName: file.name,
      })
    }, '组件替换包读取失败，工程内原版本已保留。')
  }, [run])

  const performComponentReplacement = useCallback(() => {
    const request = componentPackageRequest
    setComponentPackageRequest(null)
    if (!request) return
    void run(async () => {
      replacePackageInStore(request.packageId, request.packageData)
    }, '组件替换失败，工程内原版本已保留。')
  }, [componentPackageRequest, replacePackageInStore, run])

  const performCatalogPackageOperation = useCallback(async (
    entries: AvailableComponentCatalogPackage[],
    mode: 'add' | 'update',
  ): Promise<boolean> => {
    const completed = await run(async () => {
      const stateBefore = useEditorStore.getState()
      const pendingEntries = mode === 'add'
        ? entries.filter((entry) =>
            componentCatalogInstallStatus(
              entry,
              stateBefore.componentPackages[entry.packageId],
            ) === 'available',
          )
        : entries
      if (mode === 'add' && pendingEntries.length === 0) {
        stateBefore.setStatus('所选组件均已加入工程')
        return true
      }
      const updateEntry = pendingEntries[0]
      if (
        mode === 'update' &&
        (!updateEntry || componentCatalogInstallStatus(
          updateEntry,
          stateBefore.componentPackages[updateEntry.packageId],
        ) !== 'update-available')
      ) {
        throw new UserFacingError(
          '组件更新已取消',
          '工程内组件与目录状态已发生变化。',
          '请刷新组件目录，重新审阅版本和哈希后再试。',
        )
      }

      const importedPackages: ComponentPackageData[] = []
      for (const entry of pendingEntries) {
        const file = await desktopApi().readComponentCatalogPackage({
          sourceId: entry.sourceId,
          packageId: entry.packageId,
          version: entry.version,
        })
        if (file.sha256 !== entry.sha256) {
          throw new UserFacingError(
            '组件目录已改变',
            `组件“${entry.name}”读取到的包哈希与当前目录快照不一致。`,
            '请刷新组件库并重新确认该版本。',
          )
        }
        importedPackages.push(await importComponentPackageAsync(file.bytes, {
          expectedId: entry.packageId,
          expectedVersion: entry.version,
          provenance: {
            sha256: file.sha256,
            importedAt: new Date().toISOString(),
            sourceLabel: entry.sourceLabel,
          },
        }))
      }
      if (mode === 'update') {
        if (stateBefore.courseSession !== null) {
          useEditorStore.getState().replaceCourseComponentPackage(
            updateEntry!.packageId,
            importedPackages[0]!,
          )
        } else {
          replacePackageInStore(updateEntry!.packageId, importedPackages[0]!)
        }
        return true
      }
      const latestState = useEditorStore.getState()
      for (const entry of pendingEntries) {
        if (componentCatalogInstallStatus(
          entry,
          latestState.componentPackages[entry.packageId],
        ) !== 'available') {
          throw new UserFacingError(
            '组件加入已取消',
            '工程内组件状态在目录读取期间发生变化。',
            '请返回组件库重新选择，避免覆盖刚刚完成的修改。',
          )
        }
      }
      if (latestState.courseSession !== null) {
        latestState.importCourseComponentPackages(importedPackages)
      } else {
        importPackagesIntoStore(importedPackages)
      }
      useEditorStore.getState().setStatus(`已加入 ${importedPackages.length} 个组件`)
      return true
    }, mode === 'update'
      ? '组件更新失败，工程内原版本已保留。'
      : '目录组件嵌入失败，工程未改变。')
    return completed === true
  }, [importPackagesIntoStore, replacePackageInStore, run])

  const requestCatalogPackageBatch = useCallback(async (
    entries: AvailableComponentCatalogPackage[],
  ): Promise<boolean> => {
    const state = useEditorStore.getState()
    const plan = planCatalogBatchJoin(entries, state.componentPackages)
    const pendingEntries = plan.entries
    if (pendingEntries.length === 0) {
      state.setStatus('所选组件均已加入工程')
      return true
    }
    return performCatalogPackageOperation(pendingEntries, 'add')
  }, [performCatalogPackageOperation])

  const requestCatalogPackageUpdate = useCallback((
    entry: AvailableComponentCatalogPackage,
  ) => {
    setCatalogPackageRequest({ entries: [entry], mode: 'update' })
  }, [])

  const handleRefreshComponentCatalog = useCallback(() => {
    void run(async () => {
      setComponentCatalog(await desktopApi().loadComponentCatalog())
    }, '组件目录刷新失败。')
  }, [run])

  const buildHtml = useCallback(() => {
    const state = useEditorStore.getState()
    const courseSession = state.courseSession
    if (courseSession !== null) {
      return buildPublishedCourseStandaloneHtml({
        project: courseSession.history.present,
        assetFiles: courseSession.assetFiles,
        components: courseSession.componentPackages,
      }, loadPlayerBundle())
    }
    const payload = buildExportPayload({
      project: state.project,
      assetFiles: state.assetFiles,
      components: state.componentPackages,
    })
    return buildStandaloneHtml(payload, loadPlayerBundle())
  }, [])

  const handlePreview = useCallback(() => {
    void run(async () => {
      await desktopApi().openPreview({ html: buildHtml() })
    }, '预览窗口创建失败。请关闭其他预览窗口后重试。')
  }, [buildHtml, run])

  const writeSingleHtml = useCallback(async (html: string) => {
    const state = useEditorStore.getState()
    const title = state.courseSession?.history.present.title ?? state.project.title
    const result = await desktopApi().exportHtml({
      suggestedName: `${title}.html`,
      html,
    })
    if (result) state.setStatus(`单 HTML 已导出到 ${result.path}`)
  }, [])

  const handleExportHtml = useCallback(() => {
    void run(async () => {
      const html = buildHtml()
      const byteLength = utf8ByteLength(html)
      if (byteLength > SINGLE_HTML_WARNING_BYTES) {
        pendingLargeHtmlRef.current = html
        setLargeHtmlByteLength(byteLength)
        return
      }
      await writeSingleHtml(html)
    }, '导出失败。请检查磁盘空间并重试。')
  }, [buildHtml, run, writeSingleHtml])

  const handleExportWebPackage = useCallback(() => {
    void run(async () => {
      const state = useEditorStore.getState()
      state.setStatus('正在生成网页包…')
      const courseSession = state.courseSession
      const bytes = courseSession === null
        ? await buildWebPackageFromProjectAsync({
          project: state.project,
          assetFiles: state.assetFiles,
          components: state.componentPackages,
        }, loadPlayerBundle())
        : await buildPublishedCourseWebPackageAsync({
          project: courseSession.history.present,
          assetFiles: courseSession.assetFiles,
          components: courseSession.componentPackages,
        }, loadPlayerBundle())
      const title = courseSession?.history.present.title ?? state.project.title
      const result = await desktopApi().exportWebPackage({
        suggestedName: `${title}-网页包.zip`,
        bytes,
      })
      if (result) state.setStatus(`网页包已导出到 ${result.path}`)
    }, '网页包导出失败。请检查磁盘空间并重试。')
  }, [run])

  const handleExportPptx = useCallback(() => {
    void run(async () => {
      const state = useEditorStore.getState()
      state.setStatus('正在生成可编辑 PPTX 对象…')
      const courseSession = state.courseSession
      if (courseSession !== null) {
        const built = await buildCoursePptx(
          courseSession.history.present,
          courseSession.assetFiles,
        )
        const result = await desktopApi().exportBinary({
          suggestedName: `${courseSession.history.present.title}.pptx`,
          extension: 'pptx',
          bytes: built.bytes,
        })
        if (result) {
          const warningSummary = built.warnings.length > 0
            ? `；${built.warnings.length} 项内容已按导出说明处理`
            : ''
          state.setStatus(
            `PPTX 已导出 ${built.slideCount} 页到 ${result.path}${warningSummary}`,
          )
        }
        return
      }
      const payload = buildExportPayload({
        project: state.project,
        assetFiles: state.assetFiles,
        components: state.componentPackages,
      })
      const bytes = await buildPptx(payload, state.assetFiles)
      const result = await desktopApi().exportBinary({
        suggestedName: `${state.project.title}.pptx`,
        extension: 'pptx',
        bytes,
      })
      if (result) {
        state.setStatus(
          `PPTX 已导出到 ${result.path}（可编辑对象保持独立；需保真的内容按预检说明静态化）`,
        )
      }
    }, 'PPTX 导出失败。请减少大图片数量后重试。')
  }, [run])

  const handleExportPdf = useCallback(() => {
    void run(async () => {
      const state = useEditorStore.getState()
      state.setStatus('正在渲染 PDF 页面…')
      const courseSession = state.courseSession
      if (courseSession !== null) {
        const project = courseSession.history.present
        const resolveAsset = (assetId: string) => {
          const meta = project.assets[assetId]
          const bytes = courseSession.assetFiles[assetId]
          return meta && bytes ? bytesToDataUrl(bytes, meta.mimeType) : undefined
        }
        const built = await buildCoursePrintArtifacts(project, { resolveAsset })
        if (!built.artifact) {
          const details = built.failures
            .map((failure) => `${failure.sourceId}：${failure.error.message}`)
            .join('\n')
          throw new Error(details || '没有可导出的页面')
        }
        const result = await desktopApi().exportPdf({
          suggestedName: `${project.title}.pdf`,
          html: built.artifact.html,
        })
        if (result) {
          const noteCount = built.artifact.warnings.length + built.failures.length
          const notes = noteCount > 0
            ? `；${noteCount} 项内容已按导出说明处理`
            : ''
          state.setStatus(`PDF 已导出到 ${result.path}${notes}`)
        }
        return
      }
      const payload = buildExportPayload({
        project: state.project,
        assetFiles: state.assetFiles,
        components: state.componentPackages,
      })
      const images = await renderProjectSceneImagesWithRuntime(payload, state.assetFiles)
      const result = await desktopApi().exportPdf({
        suggestedName: `${state.project.title}.pdf`,
        html: buildPdfPrintHtml(state.project.title, images),
      })
      if (result) state.setStatus(`PDF 已导出到 ${result.path}（互动组件已静态化）`)
    }, 'PDF 导出失败。请减少大图片数量后重试。')
  }, [run])

  const handleExportDocx = useCallback(() => {
    void run(async () => {
      const state = useEditorStore.getState()
      const courseSession = state.courseSession
      if (courseSession === null) {
        throw new Error('DOCX 讲义仅适用于 Flow 讲义位置')
      }
      const project = courseSession.history.present
      const location = project.locations.find(
        (candidate) => candidate.id === courseSession.selection.locationId,
      )
      const surface = location
        ? project.surfaces.find(
            (candidate) => candidate.id === location.surfaceId,
          )
        : undefined
      if (
        !location ||
        location.kind !== 'flow-block' ||
        !surface ||
        surface.type !== 'flow'
      ) {
        throw new Error('请先切换到 Flow 讲义位置')
      }
      const effectiveLayerItems = getEffectiveCourseLayerOrder({
        project,
        surfaceId: surface.id,
        locationId: location.id,
      }).filter((entry): entry is FlowDocxLayerEntry => (
        entry.source === 'global' || entry.source === 'surface'
      ))
      const resolveAsset = (assetId: string) => {
        const meta = project.assets[assetId]
        const bytes = courseSession.assetFiles[assetId]
        return meta && bytes
          ? { bytes, mimeType: meta.mimeType, filename: meta.filename }
          : undefined
      }
      const built = buildFlowDocx(surface, {
        locationId: location.id,
        effectiveLayerItems,
        resolveAsset,
      })
      const result = await desktopApi().exportBinary({
        suggestedName: uniqueFlowDocxFilename(surface.title),
        extension: 'docx',
        bytes: built.bytes,
      })
      if (result) {
        const noteSummary = built.warnings.length > 0
          ? `；${built.warnings.length} 项内容已按导出说明处理`
          : ''
        state.setStatus(`DOCX 讲义已导出到 ${result.path}${noteSummary}`)
      }
    }, 'DOCX 导出失败。请切换到 Flow 讲义位置后重试。')
  }, [run])

  const handleExport = useCallback((format: ExportFormat) => {
    const state = useEditorStore.getState()
    if (state.courseSession !== null) {
      if (format === 'single-html') handleExportHtml()
      else if (format === 'web-package') handleExportWebPackage()
      else if (format === 'pptx') handleExportPptx()
      else if (format === 'pdf') handleExportPdf()
      else if (format === 'docx') handleExportDocx()
      else state.setError('当前课件暂不能导出该格式；其他导出格式仍可使用。')
      return
    }
    if (format === 'docx') {
      state.setError('DOCX 讲义仅适用于 Flow 讲义位置')
      return
    }
    setExportPreflightReport(collectExportPreflight(
      state.project,
      format,
      {
        assetFiles: state.assetFiles,
        components: state.componentPackages,
      },
    ))
  }, [
    handleExportDocx,
    handleExportHtml,
    handleExportPdf,
    handleExportPptx,
    handleExportWebPackage,
  ])

  const continuePreflightExport = useCallback(() => {
    const report = exportPreflightReport
    if (!report?.summary.canExport) return
    setExportPreflightReport(null)
    if (report.target === 'single-html') handleExportHtml()
    else if (report.target === 'web-package') handleExportWebPackage()
    else if (report.target === 'pptx') handleExportPptx()
    else handleExportPdf()
  }, [
    exportPreflightReport,
    handleExportHtml,
    handleExportPdf,
    handleExportPptx,
    handleExportWebPackage,
  ])

  const locatePreflightItem = useCallback((item: ExportPreflightItem) => {
    const state = useEditorStore.getState()
    const globalNode = item.nodeId
      ? state.project.globalLayer.some(({ node }) => node.id === item.nodeId)
      : false
    state.setEditingScope(globalNode ? 'global' : 'scene')
    if (item.sceneId) state.setActiveScene(item.sceneId)
    if (!globalNode && item.stateId !== undefined) {
      state.setActivePresentationState(item.stateId)
    }
    if (item.nodeId) state.selectNode(item.nodeId)
    state.setActiveTab('properties')
    state.setStatus(`已定位导出预检问题：${item.message}`)
    setExportPreflightReport(null)
  }, [])

  const saveExportPreflightReport = useCallback(() => {
    const report = exportPreflightReport
    if (!report) return
    void run(async () => {
      const state = useEditorStore.getState()
      const bytes = new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`)
      const result = await desktopApi().exportBinary({
        suggestedName: `${state.project.title}-${report.target}-preflight.json`,
        extension: 'json',
        bytes,
      })
      if (result) state.setStatus(`导出预检报告已保存到 ${result.path}`)
    }, '导出预检报告保存失败。请换一个可写目录后重试。')
  }, [exportPreflightReport, run])

  const handleExportDiagnostics = useCallback(() => {
    void run(async () => {
      const result = await desktopApi().exportDiagnostics()
      if (result) useEditorStore.getState().setStatus(`诊断报告已导出到 ${result.path}`)
    }, '诊断报告导出失败。请换一个可写目录后重试。')
  }, [run])

  const clearLargeHtmlWarning = useCallback(() => {
    pendingLargeHtmlRef.current = null
    setLargeHtmlByteLength(null)
  }, [])

  useLayoutEffect(() => {
    window.__COURSEWARE_EDITOR_DIRTY__ = activeDocumentDirty
    document.title = `${activeDocumentTitle}${activeDocumentDirty ? ' *' : ''} - ${APP_NAME}`
    if (window.desktopAPI) {
      void window.desktopAPI.setDirtyState(activeDocumentDirty).catch((error) => {
        console.error('同步未保存状态失败', error)
      })
    }
  }, [activeDocumentDirty, activeDocumentTitle])

  useEffect(() => {
    if (!window.desktopAPI) {
      setRecoveryDecisionComplete(true)
      return
    }
    let cancelled = false
    void Promise.all([
      window.desktopAPI.listRecentProjects(),
      window.desktopAPI.readRecoveryProject(),
    ]).then(([recent, recovery]) => {
      if (cancelled) return
      setRecentProjects(recent)
      if (recovery) setRecoveryProject(recovery)
      else setRecoveryDecisionComplete(true)
    }).catch((error) => {
      if (cancelled) return
      console.error('读取本地恢复状态失败', error)
      setRecoveryDecisionComplete(true)
      setError('无法读取本地恢复状态；请在编辑后及时手动保存。')
    })
    return () => { cancelled = true }
  }, [setError])

  useEffect(() => {
    if (!window.desktopAPI) return
    let cancelled = false
    void window.desktopAPI.loadComponentCatalog().then((snapshot) => {
      if (!cancelled) setComponentCatalog(snapshot)
    }).catch((error) => {
      if (cancelled) return
      console.error('读取组件目录失败', error)
      setError('本地组件目录读取失败；仍可手动导入 .h5component。')
    })
    return () => { cancelled = true }
  }, [setError])

  useEffect(() => {
    const coordinator = recoveryCoordinatorRef.current
    if (!coordinator) return
    const wasDirty = previousActiveDirtyRef.current
    previousActiveDirtyRef.current = activeDocumentDirty
    if (!recoveryDecisionComplete || !activeDocumentDirty) {
      coordinator.cancel()
      if (recoveryDecisionComplete && wasDirty && window.desktopAPI) {
        void clearRecoveryCopy().catch((error) => {
          console.error('清理已撤销修改的恢复副本失败', error)
          setError('无法清理已过期的恢复副本。')
        })
      }
      return
    }
    if (
      recoveryCourseProject === null ||
      recoveryAssetFiles === null ||
      recoveryComponentFiles === null
    ) {
      coordinator.cancel()
      return
    }
    coordinator.schedule(courseProjectRecoveryRevision(recoveryCourseProject), {
      backend: 'v9',
      project: recoveryCourseProject,
      assetFiles: recoveryAssetFiles,
      componentFiles: recoveryComponentFiles,
      projectPath: recoveryProjectPath,
    })
  }, [
    activeDocumentDirty,
    clearRecoveryCopy,
    recoveryAssetFiles,
    recoveryComponentFiles,
    recoveryDecisionComplete,
    recoveryCourseProject,
    recoveryProjectPath,
    setError,
  ])

  useEffect(() => () => {
    recoveryCoordinatorRef.current?.dispose()
  }, [])

  useEffect(() => {
    if (!window.desktopAPI) return
    return window.desktopAPI.onRequestSave(() => {
      void handleSave(false)
    })
  }, [handleSave])

  useEffect(() => {
    if (!window.desktopAPI) return
    return window.desktopAPI.onRequestSaveAndClose(async (mode) => {
      if (mode === 'discard') {
        try {
          await clearRecoveryCopy()
          return true
        } catch (error) {
          console.error('关闭前清理恢复副本失败', error)
          useEditorStore.getState().setError(
            '暂时无法清理恢复副本，窗口仍保持打开；请稍后重试。',
          )
          const session = useEditorStore.getState().courseSession
          const coordinator = recoveryCoordinatorRef.current
          if (
            session !== null &&
            coordinator !== null &&
            isV9SlideVerticalSliceDirty(session)
          ) {
            coordinator.schedule(courseProjectRecoveryRevision(session.history.present), {
              backend: 'v9',
              project: session.history.present,
              assetFiles: session.assetFiles,
              componentFiles: session.componentFiles,
              projectPath: session.projectPath,
            })
          }
          return false
        }
      }
      return handleSave(false)
    })
  }, [clearRecoveryCopy, handleSave])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const key = event.key.toLowerCase()
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && key === 's') {
        event.preventDefault()
        void handleSave(event.shiftKey)
        return
      }
      if (modifier && key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redoActiveDocument()
        else undoActiveDocument()
        return
      }
      if (modifier && key === 'y') {
        event.preventDefault()
        redoActiveDocument()
        return
      }
      if (modifier && key === 'n') {
        event.preventDefault()
        handleNew()
        return
      }
      if (modifier && key === 'o') {
        event.preventDefault()
        handleOpen()
        return
      }
      const state = useEditorStore.getState()
      if (state.courseSession !== null) {
        const snapshot = state.createLiveEditorSelectionSnapshot(event.target)
        if (!snapshot) return
        if (isTextLikeEditorFocus(snapshot.focus) && modifier && (
          key === 'a' || key === 'c' || key === 'x' || key === 'v' || key === 'd'
        )) {
          return
        }
        const interpretation = interpretEditorEntry({
          source: 'keyboard',
          key: event.key,
          shiftKey: event.shiftKey,
          snapshot,
        })
        if (interpretation.kind === 'close-menu') {
          if (editorMenu) {
            event.preventDefault()
            setEditorMenu(null)
            editorMenuFocusRef.current?.focus()
            return
          }
          return
        }
        if (interpretation.kind === 'open-menu') {
          event.preventDefault()
          editorMenuFocusRef.current = event.target instanceof HTMLElement
            ? event.target
            : null
          openEditorMenuAt({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          }, event.target)
          return
        }
        if (interpretation.kind === 'action') {
          event.preventDefault()
          invokeEditorAction(interpretation.actionId, snapshot)
          return
        }
        if (modifier && (key === 'a' || key === 'c' || key === 'x' || key === 'v' || key === 'd')) {
          const actionId = (
            key === 'a' ? 'select-all' :
            key === 'c' ? 'copy' :
            key === 'x' ? 'cut' :
            key === 'v' ? 'paste' :
            'duplicate'
          ) as EditorActionId
          const availability = resolveEditorActionAvailability(actionId, snapshot)
          event.preventDefault()
          if (!availability.enabled) {
            state.setError(availability.reason)
            return
          }
          invokeEditorAction(actionId, snapshot)
          return
        }
        if (event.key.startsWith('Arrow')) {
          if (isInteractiveControlTarget(event.target) || isTextLikeEditorFocus(snapshot.focus)) {
            return
          }
          const distance = event.shiftKey ? 10 : 1
          const movement = {
            ArrowLeft: [-distance, 0],
            ArrowRight: [distance, 0],
            ArrowUp: [0, -distance],
            ArrowDown: [0, distance],
          }[event.key]
          if (movement && snapshot.surfaceKind === 'slide' && snapshot.targets.length > 0) {
            event.preventDefault()
            state.nudgeCourseLayers(movement[0], movement[1])
          }
          return
        }
        return
      }
      if (isEditingTarget(event.target)) return
      if ((event.ctrlKey || event.metaKey) && key === 'a') {
        event.preventDefault()
        state.selectNodes(selectEditingNodes(state).map((node) => node.id))
      } else if ((event.ctrlKey || event.metaKey) && key === 'c') {
        event.preventDefault()
        state.copySelectedNodes()
      } else if ((event.ctrlKey || event.metaKey) && key === 'v') {
        event.preventDefault()
        state.pasteNodes()
      } else if ((event.ctrlKey || event.metaKey) && key === 'd') {
        event.preventDefault()
        state.duplicateSelectedNodes()
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selectedNodeIds.length > 0 && !state.editingTextNodeId) {
          event.preventDefault()
          state.deleteSelectedNodes()
        }
      } else if (event.key.startsWith('Arrow')) {
        if (isInteractiveControlTarget(event.target)) return
        const distance = event.shiftKey ? 10 : 1
        const movement = {
          ArrowLeft: [-distance, 0],
          ArrowRight: [distance, 0],
          ArrowUp: [0, -distance],
          ArrowDown: [0, distance],
        }[event.key]
        if (movement && state.selectedNodeIds.length > 0) {
          event.preventDefault()
          state.nudgeSelection(movement[0], movement[1])
        }
      } else if (event.key === 'Escape') {
        state.selectNodes([])
      }
    }
    const onContextMenu = (event: MouseEvent) => {
      if (useEditorStore.getState().courseSession === null) return
      const snapshot = useEditorStore.getState().createLiveEditorSelectionSnapshot(event.target)
      if (snapshot && isTextLikeEditorFocus(snapshot.focus)) return
      event.preventDefault()
      editorMenuFocusRef.current = event.target instanceof HTMLElement ? event.target : null
      openEditorMenuAt({ x: event.clientX, y: event.clientY }, event.target)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [
    editorMenu,
    handleNew,
    handleOpen,
    handleSave,
    invokeEditorAction,
    openEditorMenuAt,
    redoActiveDocument,
    undoActiveDocument,
  ])

  return (
    <div className="app-shell">
      <TopToolbar
        busy={busy}
        documentControl={{
          title: activeDocumentTitle,
          dirty: activeDocumentDirty,
          canUndo: v9SlideVerticalSlice === null
            ? useEditorStore.getState().history.past.length > 0
            : v9SlideVerticalSlice.history.past.length > 0,
          canRedo: v9SlideVerticalSlice === null
            ? useEditorStore.getState().history.future.length > 0
            : v9SlideVerticalSlice.history.future.length > 0,
          locationLabel: activeDocumentLocationLabel,
          editorMode,
          healthChecked: !v9BackendActive || activeV9HealthCheck !== null,
          canInspectHealth: true,
          canPreview: true,
          canExport: true,
          unavailableExports: v9BackendActive
            ? activeCourseEditorRoute === 'flow'
              ? undefined
              : { docx: '请先切换到 Flow 讲义位置' }
            : undefined,
          onRename: renameActiveDocument,
          onUndo: undoActiveDocument,
          onRedo: redoActiveDocument,
          onSetEditorMode: (mode) => useEditorStore.getState().setEditorMode(mode),
        }}
        onNew={handleNew}
        onNewBlank={{
          slide: () => createBlankCourse('slide'),
          flow: () => createBlankCourse('flow'),
          spatial: () => createBlankCourse('spatial'),
        }}
        onOpen={handleOpen}
        onImportLegacy={handleImportLegacy}
        recentProjects={recentProjects}
        onOpenRecent={handleOpenRecent}
        onSave={(saveAs) => void handleSave(saveAs)}
        healthSummary={activeProjectHealthSummary}
        onOpenHealth={handleOpenHealth}
        onPreview={handlePreview}
        onExport={handleExport}
      />
      <div
        className={`app-main${
          editorMode === 'professional' && activeTab === 'developer'
            ? ' app-main--developer'
            : ''
        }`}
        aria-busy={busy}
        inert={busy ? true : undefined}
      >
        <ScenePanel
          courseStructure={v9CourseStructure ?? undefined}
          authoringScope={v9SlideVerticalSlice?.editingScope === 'global'
            ? 'global-layer'
            : 'location'}
          activeLocationId={v9SlideVerticalSlice?.selection.locationId}
          documentControl={
            v9CourseStructure?.pageTree.compact
              ? v9ScenePanelDocumentControl
              : undefined
          }
          onActivateLocation={(locationId) => runCourseCommand(() => {
            useEditorStore.getState().selectCourseLocation(locationId)
          }, '无法切换课程内容')}
          onSelectGlobalLayer={() => runCourseCommand(() => {
            useEditorStore.getState().selectGlobalLayerScope()
          }, '无法切换到全局层')}
          onAddSlidePage={() => runCourseCommand(() => {
            useEditorStore.getState().addCoursePage('slide')
          }, '无法新建演示页')}
          onAddFlowPage={() => runCourseCommand(() => {
            useEditorStore.getState().addCoursePage('flow')
          }, '无法新建 Flow 讲义')}
          onAddSpatialPage={() => runCourseCommand(() => {
            useEditorStore.getState().addCoursePage('spatial-2d')
          }, '无法新建 Spatial 空间')}
        />
        <div className="editor-center">
          <Workspace
            slideAuthoring={v9SlideAuthoring}
            flowAuthoring={v9FlowAuthoring}
            spatialAuthoring={v9SpatialAuthoring}
            courseLocationUnavailableReason={v9CourseLocationUnavailableReason}
            locationSessionKey={v9SlideVerticalSlice
              ? `${v9SlideVerticalSlice.sessionId}:${v9SlideVerticalSlice.selection.locationId}`
              : undefined}
            interactionDisabled={busy}
            onTrialRun={handlePreview}
            onAddImage={v9BackendActive
              ? (x, y) => void selectAndAddCourseMedia('image', 'add', { x, y })
              : (x, y) => void selectAndImportImage('add', { x, y })}
            onAddVideo={v9BackendActive
              ? (x, y) => void selectAndAddCourseMedia('video', 'add', { x, y })
              : (x, y) => void selectAndImportVideo('add', { x, y })}
            onSelectImageAsset={v9BackendActive
              ? async () => {
                  const imported = await selectImageAsset()
                  if (!imported) return null
                  useEditorStore.getState().importCourseAssets([imported])
                  return imported
                }
              : selectImageAsset}
          />
          {showSceneStateStrip ? (
            <SceneStateStrip documentControl={v9SceneStateStripDocumentControl} />
          ) : null}
        </div>
        <RightSidebar
          documentControl={v9RightSidebarDocumentControl}
          flowDocumentControl={v9FlowDocumentControl}
          spatialDocumentControl={v9SpatialDocumentControl}
          effectiveLayers={v9EffectiveLayers}
          designTokens={v9SlideVerticalSlice ? {
            value: v9SlideVerticalSlice.history.present.designTokens,
            onChange: (tokens: ProjectDesignTokens) => runCourseCommand(() => {
              useEditorStore.getState().updateCourseDesignTokens(tokens)
            }, '无法更新设计令牌'),
          } : undefined}
          courseAudio={v9SlideVerticalSlice ? {
            sounds: Object.values(v9SlideVerticalSlice.history.present.media.audio.sounds),
            onImportAudio: () => void selectAndImportAudio(),
          } : undefined}
          onRestoreTeacherController={v9SlideVerticalSlice ? () => runCourseCommand(() => {
            useEditorStore.getState().restoreCourseTeacherController()
          }, '无法恢复教师控制器') : undefined}
          onAddImage={(x, y) =>
            void selectAndImportImage('add', { x, y })
          }
          onReplaceImage={() => void selectAndImportImage('replace')}
          onAddVideo={(x, y) => void selectAndImportVideo('add', { x, y })}
          onImportImage={() => void selectAndImportImage('library')}
          onImportAudio={() => void selectAndImportAudio()}
          onImportVideo={() => void selectAndImportVideo('library')}
          onImportExternalComponents={handleImportComponent}
          onReplaceComponent={handleReplaceComponent}
          componentCatalog={componentCatalog}
          onRefreshComponentCatalog={handleRefreshComponentCatalog}
          onAddCatalogComponents={requestCatalogPackageBatch}
          onUpdateCatalogComponent={requestCatalogPackageUpdate}
        />
      </div>
      {editorMenu && (
        <EditorContextMenu
          snapshot={editorMenu.snapshot}
          actions={toEditorContextMenuActions(
            listEditorActions(editorMenu.snapshot).map((item) => ({
              ...item,
              label: {
                'select-all': '全选',
                copy: '复制',
                cut: '剪切',
                paste: '粘贴',
                duplicate: '重复',
                delete: '删除',
                rename: '重命名',
                'move-forward': '上移',
                'move-backward': '下移',
                'bring-front': '置顶',
                'send-back': '置底',
                show: '显示',
                hide: '隐藏',
                lock: '锁定',
                unlock: '解锁',
                'edit-text': '编辑文字',
                'edit-formula': '编辑公式',
                'replace-media': '替换媒体',
                'insert-before': '在前方插入',
                'insert-after': '在后方插入',
                indent: '缩进',
                outdent: '取消缩进',
                focus: '聚焦',
                fit: '适配视图',
                'reset-view': '重置视图',
              }[item.actionId] ?? item.actionId,
            })),
          )}
          open
          anchorPoint={editorMenu.point}
          onOpenChange={(open) => {
            if (!open) {
              setEditorMenu(null)
              editorMenuFocusRef.current?.focus()
            }
          }}
          onInvoke={(actionId, snapshot) => {
            invokeEditorAction(actionId as EditorActionId, snapshot)
            setEditorMenu(null)
          }}
        />
      )}
      <footer className="status-bar" aria-live="polite">
        <span className="status-dot" />
        <span>{busy ? '正在处理…' : (statusMessage ?? '就绪')}</span>
        <span className="status-bar__spacer" />
        <span>{activeStatusBarView.locationName}</span>
        <span>·</span>
        <span>{activeStatusBarView.itemCountLabel}</span>
        {activeStatusBarView.largeProject && (
          <>
            <span>·</span>
            <span className="status-bar__warning" title="大型课件建议使用网页包导出，以减少启动和内存压力">
              大型课件 · 建议网页包
            </span>
          </>
        )}
        <span>·</span>
        <span>{activeStatusBarView.selectionLabel}</span>
        <span>·</span>
        <span>{activeDocumentPath ? '工程已命名' : '尚未保存'}</span>
      </footer>

      {errorMessage && (
        <div className="toast" role="alert">
          <AlertCircle size={19} />
          <div className="toast__content">{errorMessage}</div>
          <button
            type="button"
            className="icon-button"
            title="关闭错误提示"
            aria-label="关闭错误提示"
            onClick={() => setError(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(componentPackageRequest)}
        title="审阅组件包替换"
        message={componentPackageRequest
          ? (() => {
              const current = componentPackages[componentPackageRequest.packageId]
              const next = componentPackageRequest.packageData
              return `组件：${next.manifest.name} (${next.manifest.id})\n当前版本：${current?.manifest.version ?? '未知'}\n新版本：${next.manifest.version}\n文件：${componentPackageRequest.sourceFileName}\nSHA-256：${next.provenance?.sha256 ?? '未登记'}\n\n确认后，场景与全局层中的全部实例会切换到该包并保留当前属性；此操作可以撤销。请只替换为已审阅的可信代码。`
            })()
          : ''}
        confirmLabel="确认替换"
        onCancel={() => setComponentPackageRequest(null)}
        onConfirm={performComponentReplacement}
      />
      <ConfirmDialog
        open={Boolean(catalogPackageRequest)}
        title="审阅目录组件更新"
        message={catalogPackageRequest
          ? (() => {
              const entry = catalogPackageRequest.entries[0]!
              return `组件：${entry.name} v${entry.version}\n来源：${entry.sourceLabel}\nSHA-256：${entry.sha256}\n质量：${entry.quality}\n发布阻断：${entry.releaseBlockers?.join('、') || '无'}\n\n更新会改变工程锁定的组件代码和全部实例，必须明确审阅。读取时仍会重新校验哈希。`
            })()
          : ''}
        confirmLabel="确认更新"
        onCancel={() => setCatalogPackageRequest(null)}
        onConfirm={() => {
          const request = catalogPackageRequest
          setCatalogPackageRequest(null)
          if (!request) return
          void performCatalogPackageOperation(request.entries, request.mode)
        }}
      />
      {v9BackendActive ? (
        activeV9HealthCheck && (
          <ProjectHealthPanel
            open={projectHealthOpen}
            onClose={() => setProjectHealthOpen(false)}
            documentControl={activeV9HealthCheck.result}
          />
        )
      ) : (
        <ProjectHealthPanel
          open={projectHealthOpen}
          onClose={() => setProjectHealthOpen(false)}
          onExportDiagnostics={handleExportDiagnostics}
        />
      )}
      <CopyableSummaryDialog
        open={batchOperationSummary !== null}
        title={batchOperationSummary?.title ?? '批次结果'}
        summary={batchOperationSummary?.summary ?? ''}
        onClose={() => setBatchOperationSummary(null)}
      />
      <ExportPreflightDialog
        report={exportPreflightReport}
        onCancel={() => setExportPreflightReport(null)}
        onContinue={continuePreflightExport}
        onLocate={locatePreflightItem}
        onSaveReport={saveExportPreflightReport}
      />
      <ExportSizeWarningDialog
        open={largeHtmlByteLength !== null}
        byteLength={largeHtmlByteLength ?? 0}
        hardLimitBytes={SINGLE_HTML_HARD_LIMIT_BYTES}
        onCancel={clearLargeHtmlWarning}
        onExportWebPackage={() => {
          clearLargeHtmlWarning()
          handleExportWebPackage()
        }}
        onContinueSingleHtml={() => {
          const html = pendingLargeHtmlRef.current
          clearLargeHtmlWarning()
          if (!html) return
          void run(
            () => writeSingleHtml(html),
            '单 HTML 导出失败。请改用网页包或检查磁盘空间。',
          )
        }}
      />
      <ConfirmDialog
        open={Boolean(recoveryProject)}
        title="发现未完成的本地恢复副本"
        message={recoveryProject ? `课件：${recoveryProject.projectName}\n保存时间：${new Date(recoveryProject.savedAt).toLocaleString('zh-CN')}\n\n恢复后请重新保存工程。如果副本来自旧版，将导入为当前格式并要求另存，不会改写原工程。\n\n如果这些修改已经不需要，可以丢弃副本。` : ''}
        confirmLabel="恢复课件"
        cancelLabel="丢弃副本"
        onCancel={() => {
          void clearRecoveryCopy().catch((error) => {
            setError(readableError(error, '恢复副本清理失败。'))
          }).finally(() => {
            setRecoveryProject(null)
            setRecoveryDecisionComplete(true)
          })
        }}
        onConfirm={() => {
          if (!recoveryProject) return
          void run(async () => {
            let archive: CourseProjectArchiveData
            try {
              archive = await openCourseProjectArchiveAsync(recoveryProject.bytes)
            } catch (error) {
              const cause = error instanceof UserFacingError ? error.cause : undefined
              if (
                cause instanceof UnsupportedCourseProjectVersionError &&
                cause.schemaVersion === 8
              ) {
                throw new UserFacingError(
                  '恢复副本是旧版工程',
                  '系统不会把旧版恢复副本当作默认打开。',
                  '请使用“导入旧版工程”显式转换，再另存为当前格式。',
                )
              }
              throw error
            }
            const offer = shouldOfferCourseProjectRecovery({
              recovery: {
                schemaVersion: archive.project.schemaVersion,
                projectId: archive.project.id,
                revision: archive.project.revision,
                updatedAt: archive.project.updatedAt,
                title: archive.project.title,
              },
              official: null,
            })
            if (offer === 'ignore-legacy-default') {
              throw new UserFacingError(
                '恢复副本不是当前工程格式',
                '系统不会把旧版恢复副本当作默认打开。',
                '请使用“导入旧版工程”显式转换。',
              )
            }
            let recoveryClearFailed = false
            await clearRecoveryCopy().catch((error) => {
              recoveryClearFailed = true
              console.error('恢复前清理旧副本失败', error)
            })
            useEditorStore.getState().loadCourseProject(archive, null, {
              markDirty: true,
            })
            setRecoveryProject(null)
            setRecoveryDecisionComplete(true)
            if (recoveryClearFailed) {
              useEditorStore.getState().setError(
                '课件已经恢复，但旧恢复副本未能清理；系统会重新生成当前恢复副本，请尽快保存工程。',
              )
            }
          }, '恢复课件失败。恢复副本可能已经损坏。')
        }}
      />
    </div>
  )
}
