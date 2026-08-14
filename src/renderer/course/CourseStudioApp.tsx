import { nanoid } from 'nanoid'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileCode2,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  Home,
  Maximize2,
  PencilLine,
  Play,
  Presentation,
  Redo2,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  WandSparkles,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ComponentPackageData } from '../../shared/componentTypes'
import { APP_NAME } from '../../shared/constants'
import { AudioManager } from '../../player/AudioManager'
import { CourseGlobalInteractionController } from '../../player/CourseGlobalInteractionController'
import { CourseEventBus } from '../../player/CourseEventBus'
import { DeclarativeCourseState } from '../../player/DeclarativeCourseState'
import { ScenePickerOverlay } from '../../player/ScenePickerOverlay'
import {
  deriveCourseProjectAuthoringInventorySnapshot,
  getEffectiveCourseLayerOrder,
  type AuthoringInventoryValueKind,
} from '../../shared/courseProjectModel'
import type {
  CourseLocation,
  CourseProjectDocument,
  CourseSurfaceDocument,
  FlowBlock,
  FlowSurfaceDocument,
  LayerItem,
  LayerItemOverride,
  SlidePresentationState,
  SlideSceneDocument,
  SlideSurfaceDocument,
  SpatialCameraPose,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import { UserFacingError } from '../../shared/errors'
import type { AiSelectionReference } from '../../shared/authoringAddress'
import type { TeacherControllerAction } from '../../shared/projectTypes'
import type { AssetMeta } from '../../shared/projectTypes'
import { SlideSurfaceHost } from '../../player/surfaces/slide/SlideSurfaceHost'
import { FlowSurfaceHost } from '../../player/surfaces/flow/FlowSurfaceHost'
import { fitSpatialSurfaceCamera } from '../../player/surfaces/spatial/spatialModel'
import { buildPublishedCourseStandaloneHtml } from '../export/course/buildCoursePackages'
import { buildPublishedCourseWebPackageAsync } from '../export/course/buildCoursePackages'
import {
  buildCoursePrintArtifacts,
  buildFlowStaticExportLayerPlan,
} from '../export/course/buildCoursePrintArtifacts'
import {
  buildCoursePptx,
} from '../export/course/buildCoursePptx'
import {
  buildFlowDocx,
} from '../export/course/flowDocx'
import {
  buildCourseExportDifferenceReport,
  type CourseExportDifference,
} from '../export/course/printArtifacts'
import { loadPlayerBundle } from '../export/loadPlayerBundle'
import { componentPackagesFromArchive } from '../components/componentPackageStore'
import { importComponentPackageAsync } from '../components/importComponentPackage'
import {
  createImageAssetImport,
  createMediaAssetImport,
  readImageDimensions,
  readMediaMetadata,
} from '../project/assetManager'
import {
  createCourseProjectArchiveAsync,
  openCourseProjectArchiveAsync,
} from '../project/courseProjectArchive'
import {
  addCourseSurface,
  addComponentLayer,
  addTeacherController,
  addFlowBlock,
  addImageLayer,
  addNativeVisualLayer,
  addSlideScene,
  addSlideTextLayer,
  addSpatialCameraFrame,
  addSpatialRelation,
  addSpatialSemanticZoomRule,
  addSpatialTextLayer,
  addVideoLayer,
  applyCourseAuthoringPatch,
  commitCourseHistory,
  createCourseHistory,
  createCourseProject,
  deleteCourseSurface,
  deleteFlowBlock,
  deleteNestedFlowBlock,
  deleteLayerItem,
  deleteSlideScene,
  deleteSpatialCameraFrame,
  deleteSpatialRelation,
  deleteSpatialSemanticZoomRule,
  duplicateSlideScene,
  duplicateFlowBlock,
  duplicateNestedFlowBlock,
  duplicateLayerItem,
  moveFlowBlock,
  redoCourseHistory,
  renameCourseSurface,
  renameSlidePresentationState,
  renameSpatialCameraFrame,
  reorderFlowBlock,
  reorderNestedFlowBlock,
  reorderLayerItem,
  reorderSlideScenes,
  reorderSpatialCameraFrames,
  saveSlidePresentationState,
  replaceFlowComponentBlock,
  replaceFlowComponentFallback,
  replaceFlowMediaAsset,
  setSpatialHomeCamera,
  setInitialSlidePresentationState,
  deleteSlidePresentationState,
  undoCourseHistory,
  updateCourseProject,
  updateNestedFlowBlock,
  updateLayerItem,
  updateSpatialRelation,
  updateSpatialSemanticZoomRule,
  type CourseHistoryState,
  type CourseAuthoringPatch,
} from './courseStudioModel'
import {
  CourseEditorDynamicHostRegistry,
} from './courseEditorDynamicHosts'
import { currentPptxDynamicCapture } from './coursePptxCurrentCapture'
import {
  AuthoringValueEditor,
  DynamicLayerContentEditor,
  NativeLayerContentEditor,
} from './CourseAuthoringControls'
import { CourseStudioPlaybackSession } from './courseStudioSession'
import {
  LAYER_KIND_LABELS,
  surfaceTeacherLabel,
} from './courseTeacherLabels'
import {
  CourseElementPalette,
  type CourseElementPaletteAction,
} from './CourseElementPalette'
import {
  CourseLayerPanel,
  type CourseLayerPanelEntry,
  type CourseLayerReorderRequest,
} from './CourseLayerPanel'
import type { CourseTransformChange } from './CourseTransformOverlay'
import { commitCourseTransform } from './courseTransformCommand'
import { FlowBlockEditor, type FlowComponentChoice } from './flow/FlowBlockEditor'
import { applyFlowBlockEditorChange } from './flow/applyFlowBlockEditorChange'
import type { FlowBlockMoveRequest } from './flow/flowBlockMove'
import { V9InteractionEditor } from './V9InteractionEditor'
import { V9CourseLogicEditor } from './V9CourseLogicEditor'
import { replaceSlideSceneInteractions } from './v9InteractionModel'
import { CourseSoundLibrary } from './CourseSoundLibrary'
import {
  addCourseSound,
  courseSoundReferences,
  deleteCourseSound,
  updateCourseSound,
  type CourseSoundPatch,
} from './courseSoundModel'
import { CourseSceneThumbnail } from './CourseSceneThumbnail'
import {
  SpatialRelationsEditor,
  SpatialTeachingPathPanel,
  type SpatialRelationUpdate,
} from './SpatialAuthoringPanels'
import {
  copyCourseLayerItems,
  cutCourseLayerItems,
  duplicateCourseLayerItems,
  pasteCourseLayerItems,
  type CourseLayerClipboardSelection,
  type CourseLayerClipboardSnapshot,
} from './courseLayerClipboard'
import {
  FlowCourseCanvas,
  SlideCourseCanvas,
  SpatialCourseCanvas,
  flattenFlowBlocks,
  selectedLayer,
  type CourseCanvasLayerSelection,
  type StudioMode,
} from './CourseSurfaceCanvas'
import {
  V9EditorShell,
  type V9EditorMode,
  type V9EditorToolbarGroups,
  type V9InspectorTabId,
} from './editor-shell/V9EditorShell'
import './course-studio.css'

type Selection =
  | {
      kind: 'layer'
      id: string
      carrier: LayerItem['kind']
      source: 'scene' | 'world' | 'surface' | 'global'
      surfaceId: string
      sceneId?: string
      field?: string
      hitId?: string
      targetKind?: 'text' | 'asset'
    }
  | { kind: 'flow-block'; id: string; surfaceId: string; field?: string; hitId?: string; targetKind?: 'text' | 'asset' }
  | null

function readableError(error: unknown, fallback = '操作失败。'): string {
  if (error instanceof UserFacingError) return `${error.title}：${error.message}\n${error.suggestion}`
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function finiteStyleNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function styleRotationDegrees(value: string, fallback: number): number {
  const match = /^rotate\((-?(?:\d+\.?\d*|\.\d+))deg\)$/u.exec(value.trim())
  return match ? Number(match[1]) : fallback
}

function differs(left: number, right: number): boolean {
  return Math.abs(left - right) > 0.0001
}

interface SlideReviewFrameSnapshot {
  layerItemOverrides: Record<string, LayerItemOverride>
  layerItemOrder: string[]
}

function captureSlideReviewFrame(
  scene: SlideSceneDocument,
  liveRoot: HTMLElement | null,
  sourceState: SlidePresentationState | undefined,
): SlideReviewFrameSnapshot {
  const layerItemOverrides: Record<string, LayerItemOverride> = structuredClone(
    sourceState?.layerItemOverrides ?? {},
  )
  const wrappers = [...(liveRoot?.querySelectorAll<HTMLElement>('.slide-layer-item') ?? [])]
  for (const item of scene.layerItems) {
    const wrapper = wrappers.find((candidate) => candidate.dataset.layerItemId === item.layerItemId)
    if (!wrapper) continue
    const visible = !wrapper.hidden && wrapper.style.display !== 'none' && wrapper.style.visibility !== 'hidden'
    const expected = item.visible && item.playbackInitialVisibility !== 'hidden'
    const override: LayerItemOverride = structuredClone(layerItemOverrides[item.layerItemId] ?? {})
    if (visible === expected) {
      delete override.visible
      delete override.playbackInitialVisibility
    } else {
      override.visible = visible
      if (visible && item.playbackInitialVisibility === 'hidden') {
        override.playbackInitialVisibility = 'inherit'
      }
    }
    const liveFrame = {
      x: finiteStyleNumber(wrapper.style.left, item.frame.x),
      y: finiteStyleNumber(wrapper.style.top, item.frame.y),
      width: finiteStyleNumber(wrapper.style.width, item.frame.width),
      height: finiteStyleNumber(wrapper.style.height, item.frame.height),
    }
    const frame: NonNullable<LayerItemOverride['frame']> = {
      ...(sourceState?.layerItemOverrides[item.layerItemId]?.frame?.mode
        ? { mode: sourceState.layerItemOverrides[item.layerItemId]!.frame!.mode }
        : {}),
      ...(differs(liveFrame.x, item.frame.x) ? { x: liveFrame.x } : {}),
      ...(differs(liveFrame.y, item.frame.y) ? { y: liveFrame.y } : {}),
      ...(differs(liveFrame.width, item.frame.width) ? { width: liveFrame.width } : {}),
      ...(differs(liveFrame.height, item.frame.height) ? { height: liveFrame.height } : {}),
    }
    if (Object.keys(frame).length > 0) override.frame = frame
    else delete override.frame
    const rotation = styleRotationDegrees(wrapper.style.transform, item.rotation)
    if (differs(rotation, item.rotation)) override.rotation = rotation
    else delete override.rotation
    const opacity = finiteStyleNumber(wrapper.style.opacity, item.opacity)
    if (differs(opacity, item.opacity)) override.opacity = opacity
    else delete override.opacity
    const order = finiteStyleNumber(wrapper.dataset.layerOrder ?? '', item.order)
    if (Number.isInteger(order) && order >= 0 && order !== item.order) override.order = order
    else if (order === item.order) delete override.order
    if (Object.keys(override).length === 0) delete layerItemOverrides[item.layerItemId]
    else layerItemOverrides[item.layerItemId] = override
  }
  const sceneItemIds = new Set(scene.layerItems.map((item) => item.layerItemId))
  const layerItemOrder = [...(liveRoot?.children ?? [])]
    .map((element) => (element as HTMLElement).dataset.layerItemId)
    .filter((id): id is string => typeof id === 'string' && sceneItemIds.has(id))
  for (const item of scene.layerItems
    .slice()
    .sort((left, right) => left.order - right.order || left.layerItemId.localeCompare(right.layerItemId))) {
    if (!layerItemOrder.includes(item.layerItemId)) layerItemOrder.push(item.layerItemId)
  }
  return { layerItemOverrides, layerItemOrder }
}

function defaultSceneId(surface: CourseSurfaceDocument | undefined): string | undefined {
  return surface?.type === 'slide' ? surface.scenes[0]?.id : undefined
}

function authoredSlideLocation(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  preferredStateId?: string,
) {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  const scene = surface?.type === 'slide'
    ? surface.scenes.find((candidate) => candidate.id === sceneId)
    : undefined
  const stateId = preferredStateId ?? scene?.presentation?.initialStateId
  const locations = project.locations.filter((location): location is Extract<
    CourseProjectDocument['locations'][number],
    { kind: 'slide-scene' }
  > => (
    location.kind === 'slide-scene' &&
    location.surfaceId === surfaceId &&
    location.sceneId === sceneId
  ))
  return locations.find((location) => location.stateId === stateId) ??
    locations.find((location) => location.stateId === undefined) ??
    locations[0]
}

function reconciledCourseLocation(
  project: CourseProjectDocument,
  options: {
    resetToStart?: boolean
    preferredLocationId?: string
    preferredSurfaceId?: string
    preferredSceneId?: string
    preferredSelection?: Selection
  } = {},
): CourseLocation {
  const start = project.locations.find((location) => location.id === project.startLocationId)
    ?? project.locations[0]!
  if (options.resetToStart) return start

  const preferred = options.preferredLocationId
    ? project.locations.find((location) => location.id === options.preferredLocationId)
    : undefined
  if (preferred) return preferred

  const selected = options.preferredSelection
  if (selected?.kind === 'flow-block') {
    const selectedLocation = project.locations.find((location) => (
      location.kind === 'flow-block' &&
      location.surfaceId === selected.surfaceId &&
      location.blockId === selected.id
    ))
    if (selectedLocation) return selectedLocation
  }

  if (options.preferredSurfaceId && options.preferredSceneId) {
    const sceneLocation = authoredSlideLocation(
      project,
      options.preferredSurfaceId,
      options.preferredSceneId,
    )
    if (sceneLocation) return sceneLocation
  }

  return project.locations.find((location) => location.surfaceId === options.preferredSurfaceId)
    ?? start
}

function surfaceLabel(type: CourseSurfaceDocument['type']): string {
  return surfaceTeacherLabel(type)
}

function newFlowBlock(type: FlowBlock['type'], id = `block-${nanoid(10)}`): FlowBlock {
  switch (type) {
    case 'heading': return { id, type, level: 2, text: '新标题' }
    case 'paragraph': return { id, type, text: '在这里编辑正文……' }
    case 'quote': return { id, type, text: '引用内容', citation: '出处' }
    case 'list': return { id, type, ordered: false, items: [{ id: `item-${nanoid(8)}`, text: '列表项', level: 0 }] }
    case 'divider': return { id, type }
    case 'table': return {
      id,
      type,
      caption: '表格',
      columns: [{ id: 'column-a', header: '项目' }, { id: 'column-b', header: '内容' }],
      rows: [{ id: `row-${nanoid(8)}`, cells: { 'column-a': '示例', 'column-b': '可编辑' } }],
    }
    case 'formula': return {
      id,
      type,
      formulaId: `formula-${nanoid(8)}`,
      accessibleText: 'x 的平方',
      ast: { type: 'script', base: { type: 'token', value: 'x' }, superscript: { type: 'token', value: '2' } },
    }
    case 'code': return { id, type, language: 'text', code: '在这里编辑代码' }
    case 'callout': return { id, type, tone: 'note', title: '提示', body: '在这里编辑提示内容。' }
    case 'section': return { id, type, title: '可折叠分节', collapsedByDefault: false, blocks: [] }
    case 'media': throw new Error('请通过“导入图片”创建媒体块')
    case 'component': throw new Error('请先导入组件包')
  }
}

function componentFallbackAsset(pkg: ComponentPackageData): { meta: AssetMeta; bytes: Uint8Array } {
  const thumbnailPath = pkg.manifest.thumbnail
  let bytes = thumbnailPath ? pkg.files[thumbnailPath] : undefined
  let mimeType: AssetMeta['mimeType'] = 'image/svg+xml'
  let extension = 'svg'
  if (thumbnailPath && bytes) {
    extension = thumbnailPath.split('.').at(-1)?.toLocaleLowerCase('en-US') ?? 'png'
    mimeType = extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'svg'
        ? 'image/svg+xml'
        : `image/${extension}`
  } else {
    const safeName = pkg.manifest.name.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]!)
    bytes = new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pkg.manifest.defaultSize.width}" height="${pkg.manifest.defaultSize.height}" viewBox="0 0 ${pkg.manifest.defaultSize.width} ${pkg.manifest.defaultSize.height}"><rect width="100%" height="100%" rx="16" fill="#eff6ff"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="24" fill="#1e3a8a">${safeName}</text></svg>`,
    )
  }
  const id = `asset_component_fallback_${nanoid(10)}`
  return {
    bytes: Uint8Array.from(bytes),
    meta: {
      id,
      kind: 'image',
      filename: thumbnailPath?.split('/').at(-1) ?? `${pkg.manifest.id}-fallback.svg`,
      mimeType,
      path: `assets/${id}.${extension}`,
      byteLength: bytes.byteLength,
      width: pkg.manifest.defaultSize.width,
      height: pkg.manifest.defaultSize.height,
    },
  }
}

function blockMatchesHeading(block: FlowBlock): block is Extract<FlowBlock, { type: 'heading' }> {
  return block.type === 'heading'
}

function locateFlowBlock(
  blocks: readonly FlowBlock[],
  blockId: string,
  parentSectionId: string | null = null,
): { block: FlowBlock; siblings: readonly FlowBlock[]; parentSectionId: string | null } | null {
  for (const block of blocks) {
    if (block.id === blockId) return { block, siblings: blocks, parentSectionId }
    if (block.type === 'section') {
      const nested = locateFlowBlock(block.blocks, blockId, block.id)
      if (nested) return nested
    }
  }
  return null
}

function jsonPointerValue(root: unknown, pointer: string): unknown {
  if (pointer === '') return root
  if (!pointer.startsWith('/')) return undefined
  return pointer.slice(1).split('/').reduce<unknown>((current, encoded) => {
    const segment = encoded.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(current)) {
      const index = Number(segment)
      return Number.isInteger(index) && index >= 0 ? current[index] : undefined
    }
    if (typeof current !== 'object' || current === null) return undefined
    return Object.prototype.hasOwnProperty.call(current, segment)
      ? (current as Record<string, unknown>)[segment]
      : undefined
  }, root)
}

interface SelectedAuthoringField {
  field: string
  address: string
  label: string
  currentValue: unknown
  valueKind: AuthoringInventoryValueKind
}

function inventoryFieldsForSelection(
  project: CourseProjectDocument,
  selection: Exclude<Selection, null>,
): SelectedAuthoringField[] {
  const snapshot = deriveCourseProjectAuthoringInventorySnapshot(project)
  return Object.entries(snapshot.entries).flatMap(([address, entry]) => {
    try {
      const url = new URL(address)
      const path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent)
      const [projectId, scope, surfaceId, sceneId, carrier, layerItemId] = path
      if (projectId !== project.id || layerItemId !== selection.id) return []
      if (selection.kind === 'layer') {
        const addressScope = selection.source === 'world' ? 'surface' : selection.source
        if (scope !== addressScope || carrier !== selection.carrier) return []
        if (surfaceId !== (selection.source === 'global' ? '-' : selection.surfaceId)) return []
        if (sceneId !== (selection.source === 'scene' ? selection.sceneId : '-')) return []
      } else if (scope !== 'surface' || surfaceId !== selection.surfaceId || sceneId !== '-') {
        return []
      }
      const field = url.searchParams.get('field')
      return field ? [{
        field,
        address,
        label: entry.label,
        currentValue: jsonPointerValue(project, entry.jsonPointer),
        valueKind: entry.valueKind,
      }] : []
    } catch {
      return []
    }
  })
}

function parseCourseAuthoringPatch(bytes: Uint8Array): CourseAuthoringPatch {
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown
  } catch (cause) {
    throw new Error(`AI 修改文件无法读取：${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('AI 修改文件的整体格式不正确')
  }
  const record = value as Record<string, unknown>
  if (record.op !== 'replace') throw new Error('AI 修改文件包含不支持的操作')
  if (!Number.isSafeInteger(record.expectedRevision) || (record.expectedRevision as number) < 0) {
    throw new Error('AI 修改文件中的工程版本无效')
  }
  if (typeof record.authoringAddress !== 'string' || !record.authoringAddress.startsWith('courseware://authoring/')) {
    throw new Error('AI 修改文件中的目标地址无效')
  }
  if (!Object.prototype.hasOwnProperty.call(record, 'value')) throw new Error('AI 修改文件缺少要写入的新内容')
  return {
    op: 'replace',
    expectedRevision: record.expectedRevision as number,
    authoringAddress: record.authoringAddress,
    value: structuredClone(record.value),
    ...(Object.prototype.hasOwnProperty.call(record, 'expectedValue')
      ? { expectedValue: structuredClone(record.expectedValue) }
      : {}),
  }
}

function useAssetUrls(
  project: CourseProjectDocument,
  assetFiles: Readonly<Record<string, Uint8Array>>,
): Readonly<Record<string, string>> {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const next: Record<string, string> = {}
    const owned: string[] = []
    for (const [assetId, meta] of Object.entries(project.assets)) {
      const bytes = assetFiles[assetId]
      if (!bytes) continue
      if (typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: meta.mimeType }))
        next[assetId] = url
        owned.push(url)
      }
    }
    setUrls(next)
    return () => owned.forEach((url) => URL.revokeObjectURL(url))
  }, [assetFiles, project.assets])
  return urls
}

function CommitInput({
  label,
  value,
  type = 'text',
  disabled,
  onCommit,
}: {
  label: string
  value: string | number
  type?: 'text' | 'number'
  disabled?: boolean
  onCommit(value: string): void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  return (
    <label className="course-field">
      <span>{label}</span>
      <input
        type={type}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!disabled && draft !== String(value)) onCommit(draft)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function StudioButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      className={['course-studio-button', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </button>
  )
}

export default function CourseStudioApp() {
  const [history, setHistory] = useState<CourseHistoryState>(() => createCourseHistory(createCourseProject()))
  const [assetFiles, setAssetFiles] = useState<Record<string, Uint8Array>>({})
  const [componentFiles, setComponentFiles] = useState<Record<string, Record<string, Uint8Array>>>({})
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('课件已就绪')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<StudioMode>('inspect')
  const [editorMode, setEditorMode] = useState<V9EditorMode>('simple')
  const [inspectorTab, setInspectorTab] = useState<V9InspectorTabId>('elements')
  const [activeSurfaceId, setActiveSurfaceId] = useState(() => history.present.surfaces[0]!.id)
  const [activeSceneIds, setActiveSceneIds] = useState<Record<string, string>>(() => {
    const surface = history.present.surfaces[0]
    const sceneId = defaultSceneId(surface)
    return sceneId ? { [surface!.id]: sceneId } : {}
  })
  const [reviewStateIds, setReviewStateIds] = useState<Record<string, string>>({})
  const [cameraBySurface, setCameraBySurface] = useState<Record<string, SpatialCameraPose>>({})
  const [selection, setSelection] = useState<Selection>(null)
  const [selectedLayerItemIds, setSelectedLayerItemIds] = useState<string[]>([])
  const [layerClipboard, setLayerClipboard] = useState<CourseLayerClipboardSnapshot | null>(null)
  const [flowSearch, setFlowSearch] = useState('')
  const [differencesOpen, setDifferencesOpen] = useState(false)
  const [lastExportNotes, setLastExportNotes] = useState<string[]>([])
  const [developerDiagnostics, setDeveloperDiagnostics] = useState<string[]>([])
  const project = history.present
  const activeSurface = project.surfaces.find((surface) => surface.id === activeSurfaceId) ?? project.surfaces[0]!
  const activeSceneId = activeSurface.type === 'slide'
    ? activeSceneIds[activeSurface.id] ?? activeSurface.scenes[0]!.id
    : undefined
  const activeScene = activeSurface.type === 'slide'
    ? activeSurface.scenes.find((scene) => scene.id === activeSceneId) ?? activeSurface.scenes[0]!
    : undefined
  const activeReviewStateId = activeScene
    ? reviewStateIds[activeScene.id] ?? activeScene.presentation?.initialStateId
    : undefined
  const camera = activeSurface.type === 'spatial-2d'
    ? cameraBySurface[activeSurface.id] ?? activeSurface.camera.home
    : undefined
  const assetUrls = useAssetUrls(project, assetFiles)
  const resolveAsset = useCallback((assetId: string) => assetUrls[assetId], [assetUrls])
  const selectedItem = selection?.kind === 'layer'
    ? selectedLayer(activeSurface, activeSceneId, selection.id, selection.source, project.globalLayerItems)
    : null
  const selectedBlockLocation = selection?.kind === 'flow-block' && activeSurface.type === 'flow'
    ? locateFlowBlock(activeSurface.blocks, selection.id)
    : null
  const selectedBlock = selectedBlockLocation?.block ?? null
  const differences = useMemo(() => buildCourseExportDifferenceReport(
    project.surfaces.map((surface) => ({ id: surface.id, kind: surface.type })),
  ), [project.surfaces])
  const selectedAuthoringFields = useMemo(
    () => selection ? inventoryFieldsForSelection(project, selection) : [],
    [project, selection],
  )
  const selectedAuthoringField = selectedAuthoringFields.find(
    (entry) => entry.field === selection?.field,
  )
  const currentAiReference = useMemo<AiSelectionReference | null>(() => {
    if (!selection?.field) return null
    const target = selectedAuthoringFields.find((entry) => entry.field === selection.field)
    if (!target) return null
    const entry = deriveCourseProjectAuthoringInventorySnapshot(project).entries[target.address]
    if (!entry) return null
    return {
      protocolVersion: 1,
      projectId: project.id,
      projectRevision: project.revision,
      layoutRevision: project.revision,
      authoringAddress: target.address,
      hitId: selection.hitId ?? '',
      kind: selection.targetKind === 'asset' || entry.valueKind === 'asset'
        ? 'asset'
        : selection.targetKind === 'text' || entry.valueKind === 'string'
          ? 'text'
          : 'property',
      label: entry.label,
      currentValue: target.currentValue,
    }
  }, [project, selectedAuthoringFields, selection])

  const selectAuthoringField = useCallback((field: string) => {
    setSelection((current) => {
      if (!current) return current
      const { targetKind: _previousTargetKind, ...stableSelection } = current
      const valueKind = selectedAuthoringFields.find((entry) => entry.field === field)?.valueKind
      return {
        ...stableSelection,
        field,
        ...(valueKind === 'asset' ? { targetKind: 'asset' as const } : {}),
      }
    })
  }, [selectedAuthoringFields])

  useEffect(() => {
    if (mode !== 'inspect' || !selection?.field) return
    const field = selection.field
    queueMicrotask(() => {
      const target = document.querySelector<HTMLElement>(
        `.course-inspector [data-field="${CSS.escape(field)}"] input:not([type="checkbox"]), ` +
        `.course-inspector [data-field="${CSS.escape(field)}"] textarea`,
      )
      target?.focus()
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) target.select()
    })
  }, [mode, selection?.field, selection?.id])
  const historyRef = useRef(history)
  historyRef.current = history
  const projectRef = useRef(project)
  const activeSurfaceIdRef = useRef(activeSurfaceId)
  const activeSceneIdsRef = useRef(activeSceneIds)
  const reviewStateIdsRef = useRef(reviewStateIds)
  const cameraBySurfaceRef = useRef(cameraBySurface)
  const selectionRef = useRef(selection)
  const selectedLayerItemIdsRef = useRef(selectedLayerItemIds)
  const assetUrlsRef = useRef(assetUrls)
  const modeRef = useRef(mode)
  const resetPlaybackSessionRef = useRef(false)
  const courseCanvasRootRef = useRef<HTMLDivElement>(null)
  const courseEventsRef = useRef<CourseEventBus | null>(null)
  const globalInteractionControllerRef = useRef<CourseGlobalInteractionController | null>(null)
  const interactionSceneRef = useRef<{ surfaceId: string; sceneId: string } | null>(null)
  const slideHostRef = useRef<SlideSurfaceHost | null>(null)
  const locationPickerRef = useRef<ScenePickerOverlay | null>(null)
  const pendingReviewFrameRef = useRef<{
    sceneId: string
    sourceState?: SlidePresentationState
    snapshot: SlideReviewFrameSnapshot
  } | null>(null)
  const pendingSlideLocationRef = useRef<Extract<CourseLocation, { kind: 'slide-scene' }> | null>(null)
  const playbackSessionRef = useRef<CourseStudioPlaybackSession | null>(null)
  projectRef.current = project
  activeSurfaceIdRef.current = activeSurfaceId
  activeSceneIdsRef.current = activeSceneIds
  reviewStateIdsRef.current = reviewStateIds
  cameraBySurfaceRef.current = cameraBySurface
  selectionRef.current = selection
  selectedLayerItemIdsRef.current = selectedLayerItemIds
  assetUrlsRef.current = assetUrls
  modeRef.current = mode

  useEffect(() => {
    void window.desktopAPI?.updateCurrentCourseSelection?.({
      projectPath,
      dirty,
      reference: currentAiReference,
    }).catch(() => undefined)
  }, [currentAiReference, dirty, projectPath])

  useEffect(() => () => {
    void window.desktopAPI?.updateCurrentCourseSelection?.({
      projectPath: null,
      dirty: false,
      reference: null,
    }).catch(() => undefined)
  }, [])

  const sessionSignature = JSON.stringify({
    id: project.id,
    courseState: project.courseState,
    navigationGuards: project.navigationGuards,
    locations: project.locations,
    startLocationId: project.startLocationId,
    slideInitialStates: project.surfaces.flatMap((surface) => (
      surface.type === 'slide'
        ? surface.scenes.map((scene) => ({
            surfaceId: surface.id,
            sceneId: scene.id,
            initialStateId: scene.presentation?.initialStateId,
          }))
        : []
    )),
  })

  const applyLocationToEditor = useCallback((location: CourseLocation) => {
    const currentProject = projectRef.current
    const surface = currentProject.surfaces.find((candidate) => candidate.id === location.surfaceId)
    if (!surface) return

    activeSurfaceIdRef.current = location.surfaceId
    setActiveSurfaceId(location.surfaceId)
    setSelectedLayerItemIds([])
    setFlowSearch('')
    if (location.kind !== 'slide-scene') pendingSlideLocationRef.current = null

    if (location.kind === 'slide-scene' && surface.type === 'slide') {
      const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
      if (!scene) return
      const nextSceneIds = { ...activeSceneIdsRef.current, [surface.id]: scene.id }
      activeSceneIdsRef.current = nextSceneIds
      setActiveSceneIds(nextSceneIds)
      const requestedStateId = location.stateId ?? scene.presentation?.initialStateId
      const stateId = requestedStateId && scene.presentation?.states.some((state) => state.id === requestedStateId)
        ? requestedStateId
        : scene.presentation?.initialStateId
      const nextReviewStateIds = { ...reviewStateIdsRef.current }
      if (stateId) nextReviewStateIds[scene.id] = stateId
      else delete nextReviewStateIds[scene.id]
      reviewStateIdsRef.current = nextReviewStateIds
      setReviewStateIds(nextReviewStateIds)
      pendingSlideLocationRef.current = location.stateId ? location : null
      selectionRef.current = null
      setSelection(null)
      void slideHostRef.current?.setScene(scene.id, stateId)
      return
    }

    if (location.kind === 'flow-block' && surface.type === 'flow') {
      if (!locateFlowBlock(surface.blocks, location.blockId)) return
      const nextSelection: Selection = {
        kind: 'flow-block',
        id: location.blockId,
        surfaceId: surface.id,
      }
      selectionRef.current = nextSelection
      setSelection(nextSelection)
      queueMicrotask(() => document.querySelector(
        `[data-flow-block-id="${CSS.escape(location.blockId)}"]`,
      )?.scrollIntoView?.({ block: 'center' }))
      return
    }

    if (location.kind === 'spatial-camera' && surface.type === 'spatial-2d') {
      const frame = surface.camera.frames.find((candidate) => candidate.id === location.cameraFrameId)
      if (!frame) return
      const nextCameras = { ...cameraBySurfaceRef.current, [surface.id]: frame }
      cameraBySurfaceRef.current = nextCameras
      setCameraBySurface(nextCameras)
      selectionRef.current = null
      setSelection(null)
    }
  }, [])

  const playbackSession = useMemo(() => {
    const previous = resetPlaybackSessionRef.current ? null : playbackSessionRef.current
    resetPlaybackSessionRef.current = false
    const next = new CourseStudioPlaybackSession(project, {
    getActiveSurfaceId: () => activeSurfaceIdRef.current,
    getActiveSceneId: (surfaceId) => activeSceneIdsRef.current[surfaceId],
    activateLocation: applyLocationToEditor,
    setPresentationState: (surfaceId, stateId) => {
      if (surfaceId !== activeSurfaceIdRef.current || !slideHostRef.current) return false
      const sceneId = activeSceneIdsRef.current[surfaceId]
      if (sceneId) {
        const nextReviewStateIds = { ...reviewStateIdsRef.current, [sceneId]: stateId }
        reviewStateIdsRef.current = nextReviewStateIds
        setReviewStateIds(nextReviewStateIds)
      }
      void slideHostRef.current.setPresentationState(stateId)
      return true
    },
    presentationState: (surfaceId) => {
      const surface = projectRef.current.surfaces.find((candidate) => candidate.id === surfaceId)
      if (!surface || surface.type !== 'slide') return { current: null, states: [] }
      const sceneId = activeSceneIdsRef.current[surfaceId] ?? surface.scenes[0]?.id
      const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
      return {
        current: surfaceId === activeSurfaceIdRef.current ? slideHostRef.current?.stateId ?? null : null,
        states: scene?.presentation?.states.map(({ id, name, description }) => ({ id, name, ...(description ? { description } : {}) })) ?? [],
      }
    },
    resetPlayback: (scope, target) => {
      if (scope === 'course') {
        courseEventsRef.current?.emit('course:restart', {})
        globalInteractionControllerRef.current?.resetCourseState()
      }
      const host = slideHostRef.current
      if (!host) return
      const reentersCurrentScene = target.kind === 'slide-scene' &&
        target.surfaceId === host.id && target.sceneId === host.sceneId
      void (async () => {
        await host.reset(scope)
        globalInteractionControllerRef.current?.refreshBindings()
        if (reentersCurrentScene && modeRef.current === 'playback') {
          await host.announceInteractionEntry()
        }
      })().catch((cause: unknown) => setError(readableError(cause, '无法重置试运行。')))
    },
      onBlocked: (message) => setError(`导航已被教学条件阻止：${message}`),
    }, {
      locationId: previous?.currentLocationId,
      stateValues: previous?.state.snapshot(),
    })
    playbackSessionRef.current = next
    return next
  // Project content edits keep one session. Only declarations/guards/locations replace it.
  }, [applyLocationToEditor, sessionSignature])

  const reconcileStudioToProject = useCallback((
    nextProject: CourseProjectDocument,
    options: {
      resetToStart?: boolean
      preferredLocationId?: string
      preferredSurfaceId?: string
      preferredSceneId?: string
      syncSession?: boolean
      preserveLayerSelection?: boolean
    } = {},
  ) => {
    const previousLayerSelection = options.preserveLayerSelection && selectionRef.current?.kind === 'layer'
      ? selectionRef.current
      : null
    const previousLayerItemIds = options.preserveLayerSelection
      ? selectedLayerItemIdsRef.current
      : []
    projectRef.current = nextProject
    const nextSceneIds: Record<string, string> = {}
    for (const surface of nextProject.surfaces) {
      if (surface.type !== 'slide') continue
      const retained = activeSceneIdsRef.current[surface.id]
      nextSceneIds[surface.id] = surface.scenes.some((scene) => scene.id === retained)
        ? retained
        : surface.scenes[0]!.id
    }
    activeSceneIdsRef.current = nextSceneIds
    setActiveSceneIds(nextSceneIds)

    const validStates = new Map(nextProject.surfaces
      .filter((surface): surface is SlideSurfaceDocument => surface.type === 'slide')
      .flatMap((surface) => surface.scenes.map((scene) => [
        scene.id,
        new Set(scene.presentation?.states.map((state) => state.id) ?? []),
      ] as const)))
    const nextReviewStateIds = Object.fromEntries(Object.entries(reviewStateIdsRef.current)
      .filter(([sceneId, stateId]) => validStates.get(sceneId)?.has(stateId)))
    reviewStateIdsRef.current = nextReviewStateIds
    setReviewStateIds(nextReviewStateIds)

    const nextCameras = Object.fromEntries(Object.entries(cameraBySurfaceRef.current)
      .filter(([surfaceId]) => nextProject.surfaces.some((surface) => (
        surface.id === surfaceId && surface.type === 'spatial-2d'
      ))))
    cameraBySurfaceRef.current = nextCameras
    setCameraBySurface(nextCameras)

    const preferredSurfaceId = options.preferredSurfaceId ?? activeSurfaceIdRef.current
    const location = reconciledCourseLocation(nextProject, {
      resetToStart: options.resetToStart,
      preferredLocationId: options.preferredLocationId,
      preferredSurfaceId,
      preferredSceneId: options.preferredSceneId ?? activeSceneIdsRef.current[preferredSurfaceId],
      preferredSelection: selectionRef.current,
    })
    if (options.syncSession === false || !playbackSessionRef.current) {
      applyLocationToEditor(location)
    } else {
      playbackSessionRef.current.authorActivate(location)
    }
    if (!previousLayerSelection || previousLayerSelection.surfaceId !== location.surfaceId) return
    if (
      previousLayerSelection.source === 'scene' &&
      (location.kind !== 'slide-scene' || location.sceneId !== previousLayerSelection.sceneId)
    ) return
    const effective = getEffectiveCourseLayerOrder({
      project: nextProject,
      surfaceId: location.surfaceId,
      locationId: location.id,
    })
    if (!effective.some(({ item, source }) => (
      item.layerItemId === previousLayerSelection.id && source === previousLayerSelection.source
    ))) return
    const effectiveIds = new Set(effective.map(({ item }) => item.layerItemId))
    const restoredIds = previousLayerItemIds.filter((id) => effectiveIds.has(id))
    if (!restoredIds.includes(previousLayerSelection.id)) restoredIds.push(previousLayerSelection.id)
    selectionRef.current = previousLayerSelection
    selectedLayerItemIdsRef.current = restoredIds
    setSelection(previousLayerSelection)
    setSelectedLayerItemIds(restoredIds)
  }, [applyLocationToEditor])

  useEffect(() => playbackSession.setInspectionMode(mode === 'inspect'), [mode, playbackSession])

  const locationPickerSignature = JSON.stringify(project.locations.map((location) => ({
    id: location.id,
    label: location.label,
  })))
  useEffect(() => {
    const stage = courseCanvasRootRef.current
    if (!stage) return
    const picker = new ScenePickerOverlay({
      stage,
      scenes: project.locations.map((location) => ({ id: location.id, name: location.label })),
      onSelect: (locationId) => {
        const location = projectRef.current.locations.find((candidate) => candidate.id === locationId)
        if (location) playbackSessionRef.current?.navigate(location, 'teacher-controller')
      },
    })
    locationPickerRef.current = picker
    return () => {
      if (locationPickerRef.current === picker) locationPickerRef.current = null
      picker.destroy()
    }
  // Location labels and order are the complete directory identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationPickerSignature])

  const parsedComponentPackages = useMemo(
    () => componentPackagesFromArchive(project, componentFiles),
    [componentFiles, project.componentPackages],
  )
  const parsedComponentPackagesRef = useRef(parsedComponentPackages)
  parsedComponentPackagesRef.current = parsedComponentPackages
  const courseEvents = useMemo(() => new CourseEventBus(), [sessionSignature])
  courseEventsRef.current = courseEvents
  useEffect(() => () => courseEvents.dispose(), [courseEvents])
  useEffect(() => courseEvents.on<{
    surfaceId: string
    sceneId: string
    stateId: string
  }>('presentation:change', ({ surfaceId, sceneId, stateId }) => {
    const pending = pendingSlideLocationRef.current
    if (
      pending?.surfaceId === surfaceId &&
      pending.sceneId === sceneId &&
      pending.stateId !== stateId
    ) return
    if (pending?.surfaceId === surfaceId && pending.sceneId === sceneId) {
      pendingSlideLocationRef.current = null
    }
    playbackSession.syncPresentationLocation(surfaceId, sceneId, stateId)
    if (surfaceId === activeSurfaceIdRef.current) {
      const nextReviewStateIds = { ...reviewStateIdsRef.current, [sceneId]: stateId }
      reviewStateIdsRef.current = nextReviewStateIds
      setReviewStateIds(nextReviewStateIds)
    }
  }), [courseEvents, playbackSession])
  const audioSettingsSignature = JSON.stringify(project.media.audio)
  const courseAudio = useMemo(() => new AudioManager(
    projectRef.current,
    (assetId) => assetUrlsRef.current[assetId] ?? '',
    courseEvents,
    typeof document === 'undefined'
      ? {}
      : {
          unlockTarget: document,
          mediaRoot: document,
          mediaSelector: '.course-canvas-shell audio, .course-canvas-shell video',
        },
  ), [audioSettingsSignature, courseEvents])
  useEffect(() => () => courseAudio.destroy(), [courseAudio])
  const executeAudioAction = useCallback((action: Parameters<AudioManager['execute']>[0]) => {
    const executed = courseAudio.execute(action)
    if (!executed && action.type === 'audio.play') {
      throw new Error(`声音“${action.soundId}”无法播放；请检查素材与浏览器媒体权限。`)
    }
    return executed
  }, [courseAudio])
  const dynamicHosts = useMemo(() => new CourseEditorDynamicHostRegistry({
    courseState: playbackSession.state,
    events: courseEvents,
    navigation: {
      goToScene: (sceneId, stateId, entryPoint) => playbackSession.goToScene(sceneId, stateId, entryPoint),
      next: (entryPoint) => playbackSession.next(entryPoint),
      previous: (entryPoint) => playbackSession.previous(entryPoint),
      replay: () => playbackSession.replay(),
      restart: () => playbackSession.restart(),
      setPresentationState: (surfaceId, stateId) => playbackSession.setPresentationState(surfaceId, stateId),
      presentationState: (surfaceId) => playbackSession.presentationState(surfaceId),
    },
    resolveProjectAsset: (assetId) => assetUrlsRef.current[assetId],
    resolveComponent: (packageId, version) => Object.values(parsedComponentPackagesRef.current).find((pkg) => pkg.manifest.id === packageId && pkg.manifest.version === version),
    reportDiagnostic: (_surfaceId, _itemId, cause) => {
      setDeveloperDiagnostics((current) => [cause.message, ...current].slice(0, 20))
      setError('互动内容更新失败，请在专业模式的“开发”面板查看详情。')
    },
  }), [courseEvents, playbackSession])
  useEffect(() => () => dynamicHosts.dispose(), [dynamicHosts])

  const createStaticCaptureHosts = useCallback((surfaceId: string, sceneId?: string) => {
    const captureState = new DeclarativeCourseState(projectRef.current)
    const captureEvents = new CourseEventBus()
    const captureHosts = new CourseEditorDynamicHostRegistry({
      courseState: captureState,
      events: captureEvents,
      navigation: {
        goToScene: () => false,
        next: () => false,
        previous: () => false,
        replay: () => false,
        restart: () => false,
        setPresentationState: () => false,
        presentationState: (requestedSurfaceId) => {
          const surface = projectRef.current.surfaces.find((candidate) => (
            candidate.id === requestedSurfaceId && candidate.type === 'slide'
          ))
          if (!surface || surface.type !== 'slide') return { current: null, states: [] }
          const scene = surface.scenes.find((candidate) => (
            surface.id === surfaceId && candidate.id === sceneId
          )) ?? surface.scenes[0]
          return {
            current: scene?.presentation?.initialStateId ?? null,
            states: scene?.presentation?.states.map(({ id, name, description }) => ({
              id,
              name,
              ...(description ? { description } : {}),
            })) ?? [],
          }
        },
      },
      resolveProjectAsset: (assetId) => assetUrlsRef.current[assetId],
      resolveComponent: (packageId, version) => Object.values(parsedComponentPackagesRef.current)
        .find((pkg) => pkg.manifest.id === packageId && pkg.manifest.version === version),
    })
    return { captureState, captureEvents, captureHosts }
  }, [])

  useEffect(() => {
    const root = courseCanvasRootRef.current
    if (!root) return
    const controller = new CourseGlobalInteractionController({
      root,
      rules: project.globalInteractions,
      events: courseEvents,
      enabled: modeRef.current === 'playback',
      currentSurfaceId: () => activeSurfaceIdRef.current,
      currentSceneId: () => {
        const surface = projectRef.current.surfaces.find((candidate) => (
          candidate.id === activeSurfaceIdRef.current
        ))
        return surface?.type === 'slide'
          ? activeSceneIdsRef.current[surface.id] ?? surface.scenes[0]?.id ?? null
          : null
      },
      presentation: {
        current: () => slideHostRef.current?.stateId ?? null,
        states: () => {
          const surface = projectRef.current.surfaces.find((candidate) => (
            candidate.id === activeSurfaceIdRef.current
          ))
          if (!surface || surface.type !== 'slide') return []
          const sceneId = activeSceneIdsRef.current[surface.id] ?? surface.scenes[0]?.id
          return surface.scenes.find((scene) => scene.id === sceneId)
            ?.presentation?.states.map(({ id, name, description }) => ({
              id,
              name,
              ...(description ? { description } : {}),
            })) ?? []
        },
        setState: async (stateId) => {
          return playbackSession.setPresentationState(activeSurfaceIdRef.current, stateId)
        },
        transitionTo: async (stateId) => {
          return playbackSession.setPresentationState(activeSurfaceIdRef.current, stateId)
        },
      },
      hostActions: {
        goToScene: (sceneId, stateId) => playbackSession.goToScene(sceneId, stateId, 'runtime'),
        nextScene: () => playbackSession.next('runtime'),
        previousScene: () => playbackSession.previous('runtime'),
        replayScene: () => playbackSession.replay(),
        restartCourse: () => playbackSession.restart(),
      },
      executeAudioAction,
      onError: (cause, context) => setError(
        `全局互动“${context.rule?.name ?? context.rule?.id ?? '未命名'}”执行失败：${readableError(cause)}`,
      ),
    })
    globalInteractionControllerRef.current = controller
    return () => {
      if (globalInteractionControllerRef.current === controller) {
        globalInteractionControllerRef.current = null
      }
      controller.destroy()
    }
  }, [courseEvents, executeAudioAction, playbackSession, project.globalInteractions])

  useEffect(() => {
    const playback = mode === 'playback'
    globalInteractionControllerRef.current?.setEnabled(playback)
    if (playback) courseAudio.resumeSuspended()
    else courseAudio.suspend()
  }, [courseAudio, mode])

  useEffect(() => {
    if (activeSurface.type === 'slide') return
    const previous = interactionSceneRef.current
    if (previous) {
      courseEvents.emit('scene:leave', previous)
      interactionSceneRef.current = null
    }
    globalInteractionControllerRef.current?.refreshBindings()
  }, [activeSurface.id, activeSurface.type, courseEvents])
  const renderFlowComponent = useCallback((
    block: Extract<FlowBlock, { type: 'component' }>,
    dom: Document,
    currentMode: StudioMode,
    reportHit: (detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }) => void,
  ) => dynamicHosts.renderFlowComponent(
    activeSurfaceIdRef.current,
    block,
    dom,
    currentMode,
    reportHit,
  ), [dynamicHosts])

  const commit = useCallback((operation: (current: CourseProjectDocument) => CourseProjectDocument): boolean => {
    try {
      const current = historyRef.current
      const next = commitCourseHistory(current, operation(current.present))
      historyRef.current = next
      projectRef.current = next.present
      setHistory(next)
      setDirty(true)
      return true
    } catch (cause) {
      setError(readableError(cause))
      return false
    }
  }, [])

  const activateFlowBlockSelection = useCallback((surfaceId: string, blockId: string) => {
    const location = projectRef.current.locations.find((candidate) => (
      candidate.kind === 'flow-block' &&
      candidate.surfaceId === surfaceId &&
      candidate.blockId === blockId
    ))
    if (location) playbackSession.authorActivate(location)
    else setSelection({ kind: 'flow-block', id: blockId, surfaceId })
    setSelectedLayerItemIds([])
  }, [playbackSession])

  const run = useCallback(async (work: () => Promise<void>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      await work()
    } catch (cause) {
      setError(readableError(cause, fallback))
    } finally {
      setBusy(false)
    }
  }, [])

  const selectSurface = useCallback((surface: CourseSurfaceDocument) => {
    setActiveSurfaceId(surface.id)
    setSelection(null)
    setSelectedLayerItemIds([])
    setInspectorTab('elements')
    setFlowSearch('')
    if (surface.type === 'slide') {
      const sceneId = activeSceneIdsRef.current[surface.id] ?? surface.scenes[0]!.id
      setActiveSceneIds((current) => ({ ...current, [surface.id]: sceneId }))
      const location = authoredSlideLocation(projectRef.current, surface.id, sceneId)
      if (location) playbackSession.authorActivate(location)
    } else if (surface.type === 'spatial-2d') {
      setCameraBySurface((current) => ({ ...current, [surface.id]: current[surface.id] ?? surface.camera.home }))
      const location = projectRef.current.locations.find((candidate) => candidate.surfaceId === surface.id)
      if (location) playbackSession.authorActivate(location)
    } else {
      const location = projectRef.current.locations.find((candidate) => candidate.surfaceId === surface.id)
      if (location) playbackSession.authorActivate(location)
    }
  }, [playbackSession])

  useEffect(() => {
    if (!project.surfaces.some((surface) => surface.id === activeSurfaceId)) {
      selectSurface(project.surfaces[0]!)
    }
  }, [activeSurfaceId, project.surfaces, selectSurface])

  useEffect(() => {
    document.title = `${project.title}${dirty ? ' *' : ''} - ${APP_NAME}`
    window.__COURSEWARE_EDITOR_DIRTY__ = dirty
    void window.desktopAPI?.setDirtyState(dirty).catch(() => undefined)
  }, [dirty, project.title])

  const loadArchive = useCallback((archive: {
    project: CourseProjectDocument
    assetFiles: Record<string, Uint8Array>
    componentFiles: Record<string, Record<string, Uint8Array>>
  }, path: string | null) => {
    const nextHistory = createCourseHistory(archive.project)
    resetPlaybackSessionRef.current = true
    slideHostRef.current = null
    interactionSceneRef.current = null
    pendingSlideLocationRef.current = null
    historyRef.current = nextHistory
    projectRef.current = archive.project
    setHistory(nextHistory)
    setAssetFiles(archive.assetFiles)
    setComponentFiles(archive.componentFiles)
    setProjectPath(path)
    setDirty(false)
    activeSceneIdsRef.current = {}
    reviewStateIdsRef.current = {}
    cameraBySurfaceRef.current = {}
    selectionRef.current = null
    reconcileStudioToProject(archive.project, {
      resetToStart: true,
      syncSession: false,
    })
    setInspectorTab('elements')
    setStatus(`已打开 ${archive.project.title}`)
  }, [reconcileStudioToProject])

  const handleOpen = useCallback(() => {
    if (dirty && !window.confirm('当前修改尚未保存，仍要打开其他课件吗？')) return
    void run(async () => {
      if (!window.desktopAPI) throw new Error('请在桌面编辑器中打开工程')
      const selected = await window.desktopAPI.openProject()
      if (!selected) return
      loadArchive(await openCourseProjectArchiveAsync(selected.bytes), selected.path)
    }, '工程打开失败。')
  }, [dirty, loadArchive, run])

  const handleNew = useCallback(() => {
    if (dirty && !window.confirm('当前修改尚未保存，仍要新建吗？')) return
    const next = createCourseProject()
    loadArchive({ project: next, assetFiles: {}, componentFiles: {} }, null)
    setStatus('已新建课件')
  }, [dirty, loadArchive])

  const save = useCallback(async (saveAs = false): Promise<boolean> => {
    if (!window.desktopAPI) throw new Error('请在桌面编辑器中保存工程')
    const bytes = await createCourseProjectArchiveAsync({
      project: historyRef.current.present,
      assetFiles,
      componentFiles,
    })
    const result = await window.desktopAPI.saveProject({
      ...(saveAs ? {} : projectPath ? { path: projectPath } : {}),
      suggestedName: `${historyRef.current.present.title}.h5lesson`,
      bytes,
    })
    if (!result) return false
    setProjectPath(result.path)
    setDirty(false)
    setStatus(`已保存到 ${result.path}`)
    return true
  }, [assetFiles, componentFiles, projectPath])

  const handleUndo = useCallback(() => {
    if (modeRef.current === 'playback') return
    const current = historyRef.current
    const next = undoCourseHistory(current)
    if (next === current) return
    historyRef.current = next
    projectRef.current = next.present
    reconcileStudioToProject(next.present, {
      preferredLocationId: playbackSessionRef.current?.currentLocationId,
      preferredSurfaceId: activeSurfaceIdRef.current,
      preferredSceneId: activeSceneIdsRef.current[activeSurfaceIdRef.current],
      preserveLayerSelection: true,
    })
    setHistory(next)
    setDirty(true)
    setStatus('已撤销上一步')
  }, [reconcileStudioToProject])

  const handleRedo = useCallback(() => {
    if (modeRef.current === 'playback') return
    const current = historyRef.current
    const next = redoCourseHistory(current)
    if (next === current) return
    historyRef.current = next
    projectRef.current = next.present
    reconcileStudioToProject(next.present, {
      preferredLocationId: playbackSessionRef.current?.currentLocationId,
      preferredSurfaceId: activeSurfaceIdRef.current,
      preferredSceneId: activeSceneIdsRef.current[activeSurfaceIdRef.current],
      preserveLayerSelection: true,
    })
    setHistory(next)
    setDirty(true)
    setStatus('已重做上一步')
  }, [reconcileStudioToProject])

  useEffect(() => {
    if (!window.desktopAPI) return
    const offSave = window.desktopAPI.onRequestSave(() => { void run(() => save(false).then(() => undefined), '保存失败。') })
    const offClose = window.desktopAPI.onRequestSaveAndClose(() => save(false))
    return () => { offSave(); offClose() }
  }, [run, save])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Element && target.matches('input,textarea,select,[contenteditable="true"]')) return
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLocaleLowerCase('en-US')
      if (key === 's') {
        event.preventDefault()
        void run(() => save(event.shiftKey).then(() => undefined), '保存失败。')
      } else if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) handleRedo()
        else handleUndo()
      } else if (key === 'y') {
        event.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleRedo, handleUndo, run, save])

  const parsedComponents = useCallback((): Record<string, ComponentPackageData> => (
    parsedComponentPackages
  ), [parsedComponentPackages])

  const publishSources = useCallback(() => ({
    project,
    assetFiles,
    components: parsedComponents(),
  }), [assetFiles, parsedComponents, project])

  const handlePreview = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('预览需要桌面编辑器')
      const html = buildPublishedCourseStandaloneHtml(publishSources(), loadPlayerBundle())
      await window.desktopAPI.openPreview({ html })
      setStatus('已打开课件预览')
    }, '预览失败。')
  }, [publishSources, run])

  const handleExportHtml = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导出需要桌面编辑器')
      const html = buildPublishedCourseStandaloneHtml(publishSources(), loadPlayerBundle())
      const result = await window.desktopAPI.exportHtml({ suggestedName: `${project.title}.html`, html })
      if (result) setStatus(`HTML 已导出到 ${result.path}`)
    }, 'HTML 导出失败。')
  }, [project.title, publishSources, run])

  const handleExportWeb = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导出需要桌面编辑器')
      const bytes = await buildPublishedCourseWebPackageAsync(publishSources(), loadPlayerBundle())
      const result = await window.desktopAPI.exportWebPackage({ suggestedName: `${project.title}-网页包.zip`, bytes })
      if (result) setStatus(`网页包已导出到 ${result.path}`)
    }, '网页包导出失败。')
  }, [project.title, publishSources, run])

  const captureSlide = useCallback(async ({ surface, scene, locationId }: {
    surface: SlideSurfaceDocument
    scene: SlideSurfaceDocument['scenes'][number]
    locationId: string
  }): Promise<string> => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-100000px'
    container.style.top = '0'
    document.body.appendChild(container)
    const abort = new AbortController()
    const capture = createStaticCaptureHosts(surface.id, scene.id)
    const host = new SlideSurfaceHost(surface, {
      initialSceneId: scene.id,
      globalLayerItems: project.globalLayerItems,
      componentHostFactory: capture.captureHosts.componentHost,
      runtimeHostFactory: capture.captureHosts.runtimeHost,
      resolveLocationId: () => locationId,
    })
    try {
      await host.mount({
        surfaceId: surface.id,
        container,
        signal: abort.signal,
        services: {
          navigate: () => undefined,
          getCourseState: (key) => capture.captureState.get(key),
          setCourseState: (key, value) => capture.captureState.set(key, value as never),
          resolveAsset,
        },
      })
      await host.activate()
      await host.setScene(scene.id)
      const result = await host.capture({ purpose: 'export' })
      return result.content
    } finally {
      abort.abort()
      await host.destroy()
      capture.captureHosts.dispose()
      capture.captureEvents.dispose()
      container.remove()
    }
  }, [createStaticCaptureHosts, project.globalLayerItems, resolveAsset])

  const captureFlow = useCallback(async ({ surface, locationId }: {
    surface: FlowSurfaceDocument
    locationId: string
  }) => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-100000px'
    container.style.top = '0'
    document.body.appendChild(container)
    const abort = new AbortController()
    const capture = createStaticCaptureHosts(surface.id)
    const host = new FlowSurfaceHost(surface, {
      globalLayerItems: project.globalLayerItems,
      componentHostFactory: capture.captureHosts.componentHost,
      runtimeHostFactory: capture.captureHosts.runtimeHost,
      resolveComponentName: (packageId, version) => {
        const component = project.componentPackages[packageId]
        return component?.version === version ? component.name : undefined
      },
      locationId,
    })
    try {
      await host.mount({
        surfaceId: surface.id,
        container,
        signal: abort.signal,
        services: {
          navigate: () => undefined,
          getCourseState: (key) => capture.captureState.get(key),
          setCourseState: (key, value) => capture.captureState.set(key, value as never),
          resolveAsset,
        },
      })
      await host.activate()
      await host.setLocationId(locationId)
      return await host.capture({ purpose: 'export' })
    } finally {
      abort.abort()
      await host.destroy()
      capture.captureHosts.dispose()
      capture.captureEvents.dispose()
      container.remove()
    }
  }, [createStaticCaptureHosts, project.componentPackages, project.globalLayerItems, resolveAsset])

  const capturePptxDynamicItem = useMemo(() => currentPptxDynamicCapture(
    () => slideHostRef.current,
    () => activeSurfaceIdRef.current,
  ), [])

  const handleExportPdf = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导出需要桌面编辑器')
      const built = await buildCoursePrintArtifacts(project, { resolveAsset, captureSlide, captureFlow })
      if (!built.artifact) throw new Error(built.failures.map((failure) => failure.error.message).join('\n') || '没有可导出页')
      const notes = [
        ...built.artifact.warnings,
        ...built.failures.map((failure) => failure.error.message),
      ]
      setLastExportNotes(notes)
      const result = await window.desktopAPI.exportPdf({ suggestedName: `${project.title}.pdf`, html: built.artifact.html })
      if (result) setStatus(`PDF 已导出到 ${result.path}；幻灯片和空间画布按静态画面保留`)
    }, 'PDF 导出失败。')
  }, [captureFlow, captureSlide, project, resolveAsset, run])

  const handleExportDocx = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导出需要桌面编辑器')
      if (activeSurface.type !== 'flow') throw new Error('DOCX 仅支持当前流式讲义；其他内容不会被伪造成 Word 页面。')
      const layerPlan = buildFlowStaticExportLayerPlan(project, activeSurface)
      const built = buildFlowDocx(activeSurface, {
        locationId: layerPlan.primaryLocationId,
        effectiveLayerItems: layerPlan.effectiveLayerItems,
        resolveComponentName: (packageId, version) => {
          const component = project.componentPackages[packageId]
          return component?.version === version ? component.name : undefined
        },
        resolveAsset: (assetId) => {
          const meta = project.assets[assetId]
          const bytes = assetFiles[assetId]
          return meta && bytes ? { bytes, mimeType: meta.mimeType, filename: meta.filename } : undefined
        },
      })
      setLastExportNotes([...new Set([...layerPlan.warnings, ...built.warnings])])
      const result = await window.desktopAPI.exportBinary({
        suggestedName: `${activeSurface.title}.docx`,
        extension: 'docx',
        bytes: built.bytes,
      })
      if (result) setStatus(`DOCX 已导出到 ${result.path}`)
    }, 'DOCX 导出失败。')
  }, [activeSurface, assetFiles, project, run])

  const handleExportPptx = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导出需要桌面编辑器')
      const built = await buildCoursePptx(project, assetFiles, {
        captureDynamicItem: capturePptxDynamicItem,
      })
      setLastExportNotes(built.warnings)
      const result = await window.desktopAPI.exportBinary({
        suggestedName: `${project.title}.pptx`,
        extension: 'pptx',
        bytes: built.bytes,
      })
      if (result) setStatus(`PPTX 已导出 ${built.slideCount} 页到 ${result.path}；讲义与空间画布差异已记录`)
    }, 'PPTX 导出失败。')
  }, [assetFiles, capturePptxDynamicItem, project, run])

  const addSurface = (type: CourseSurfaceDocument['type']) => {
    if (modeRef.current === 'playback') return
    const id = `surface-${nanoid(10)}`
    try {
      const currentHistory = historyRef.current
      const nextProject = addCourseSurface(currentHistory.present, type, { id })
      const nextHistory = commitCourseHistory(currentHistory, nextProject)
      historyRef.current = nextHistory
      projectRef.current = nextProject
      setHistory(nextHistory)
      setDirty(true)
      const nextSurface = nextProject.surfaces.find((surface) => surface.id === id)
      if (nextSurface) selectSurface(nextSurface)
    } catch (cause) {
      setError(readableError(cause))
    }
  }

  const addVisualLayer = (nativeType: 'formula' | 'shape') => {
    if (activeSurface.type === 'flow') return
    const id = `${nativeType}-${nanoid(10)}`
    commit((current) => addNativeVisualLayer(current, {
      surfaceId: activeSurface.id,
      ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
      nativeType,
      id,
      ...(activeSurface.type === 'spatial-2d'
        ? { x: camera?.x ?? 0, y: camera?.y ?? 0 }
        : {}),
    }))
    setSelection({
      kind: 'layer',
      id,
      carrier: 'native',
      source: activeSurface.type === 'slide' ? 'scene' : 'world',
      surfaceId: activeSurface.id,
      ...(activeSurface.type === 'slide' && activeSceneId ? { sceneId: activeSceneId } : {}),
    })
    setSelectedLayerItemIds([id])
    setInspectorTab('properties')
  }

  const editFlow = (blockId: string, value: string) => {
    if (activeSurface.type !== 'flow') return
    commit((current) => updateNestedFlowBlock(current, activeSurface.id, blockId, (block) => {
      switch (block.type) {
        case 'heading':
        case 'paragraph':
        case 'quote': block.text = value; break
        case 'list': block.items = value.split('\n').map((text, index) => ({
          id: block.items[index]?.id ?? `item-${nanoid(8)}`,
          text,
          level: block.items[index]?.level ?? 0,
        })); break
        case 'code': block.code = value; break
        case 'callout': block.body = value; break
        case 'section': block.title = value; break
        case 'table': block.caption = value; break
        case 'formula': block.accessibleText = value; break
        case 'media': block.caption = value; break
        case 'component':
        case 'divider': break
      }
    }))
  }

  const importMedia = (kind: 'image' | 'audio' | 'video') => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导入需要桌面编辑器')
      if (kind === 'audio' && activeSurface.type !== 'flow') {
        throw new Error('声音目前仅支持插入流式讲义。')
      }
      const selected = kind === 'image'
        ? await window.desktopAPI.selectImage()
        : kind === 'video'
          ? await window.desktopAPI.selectVideo()
          : await window.desktopAPI.selectAudio()
      if (!selected) return
      const dimensions = kind === 'image'
        ? await readImageDimensions(selected.bytes, selected.mimeType)
        : undefined
      const metadata = kind === 'image'
        ? undefined
        : await readMediaMetadata(selected.bytes, selected.mimeType, kind)
      const imported = kind === 'image'
        ? createImageAssetImport(selected, { dimensions })
        : createMediaAssetImport(selected, kind, metadata!)
      const insertedId = `${kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'block'}-${nanoid(10)}`
      let next = updateCourseProject(historyRef.current.present, (draft) => {
        draft.assets[imported.meta.id] = imported.meta
      })
      if (activeSurface.type === 'flow') {
        next = addFlowBlock(next, activeSurface.id, {
          id: insertedId,
          type: 'media',
          assetId: imported.meta.id,
          mediaKind: kind,
          ...(kind === 'image' ? { altText: imported.meta.filename } : {}),
          caption: imported.meta.filename,
          layout: 'content-width',
        })
      } else if (kind === 'image') {
        next = addImageLayer(next, {
          surfaceId: activeSurface.id,
          ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
          assetId: imported.meta.id,
          id: insertedId,
          width: Math.min(dimensions!.width, activeSurface.type === 'slide' ? 640 : dimensions!.width),
          height: Math.min(dimensions!.height, activeSurface.type === 'slide' ? 480 : dimensions!.height),
          x: activeSurface.type === 'spatial-2d' ? camera?.x ?? 0 : 200,
          y: activeSurface.type === 'spatial-2d' ? camera?.y ?? 0 : 140,
        })
      } else {
        next = addVideoLayer(next, {
          surfaceId: activeSurface.id,
          ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
          assetId: imported.meta.id,
          id: insertedId,
          width: Math.min(imported.meta.width ?? 640, activeSurface.type === 'slide' ? 640 : imported.meta.width ?? 640),
          height: Math.min(imported.meta.height ?? 360, activeSurface.type === 'slide' ? 480 : imported.meta.height ?? 360),
          x: activeSurface.type === 'spatial-2d' ? camera?.x ?? 0 : 200,
          y: activeSurface.type === 'spatial-2d' ? camera?.y ?? 0 : 140,
          showControls: true,
          clickToToggle: true,
        })
      }
      setAssetFiles((files) => ({ ...files, [imported.meta.id]: imported.bytes }))
      const nextHistory = commitCourseHistory(historyRef.current, next)
      historyRef.current = nextHistory
      projectRef.current = next
      setHistory(nextHistory)
      setDirty(true)
      if (activeSurface.type === 'flow') {
        activateFlowBlockSelection(activeSurface.id, insertedId)
      } else {
        setSelection({
          kind: 'layer',
          id: insertedId,
          carrier: 'native',
          source: activeSurface.type === 'slide' ? 'scene' : 'world',
          surfaceId: activeSurface.id,
          ...(activeSurface.type === 'slide' && activeSceneId ? { sceneId: activeSceneId } : {}),
        })
        setSelectedLayerItemIds([insertedId])
      }
      setInspectorTab('properties')
      setStatus(`已导入${kind === 'image' ? '图片' : kind === 'video' ? '视频' : '声音'} ${imported.meta.filename}`)
    }, `${kind === 'image' ? '图片' : kind === 'video' ? '视频' : '声音'}导入失败。`)
  }

  const importCourseSound = () => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导入需要桌面编辑器')
      const selected = await window.desktopAPI.selectAudio()
      if (!selected) return
      const metadata = await readMediaMetadata(selected.bytes, selected.mimeType, 'audio')
      const imported = createMediaAssetImport(selected, 'audio', metadata)
      const soundId = `sound-${nanoid(10)}`
      const next = addCourseSound(historyRef.current.present, {
        soundId,
        asset: imported.meta,
      })
      const nextHistory = commitCourseHistory(historyRef.current, next)
      setAssetFiles((files) => ({ ...files, [imported.meta.id]: imported.bytes }))
      historyRef.current = nextHistory
      projectRef.current = next
      setHistory(nextHistory)
      setDirty(true)
      setStatus(`已导入课程声音“${next.media.audio.sounds[soundId]!.name}”`)
    }, '课程声音导入失败。')
  }

  const changeCourseSound = (soundId: string, patch: CourseSoundPatch) => {
    if (commit((current) => updateCourseSound(current, soundId, patch))) {
      setStatus('课程声音设置已更新')
    }
  }

  const removeCourseSound = (soundId: string) => {
    const sound = projectRef.current.media.audio.sounds[soundId]
    if (!sound || !window.confirm(`从课程中删除声音“${sound.name}”？`)) return
    if (!commit((current) => deleteCourseSound(current, soundId))) return
    // Keep the in-memory bytes until the history branch is discarded so Undo
    // can restore the sound without losing its file. Archive export only writes
    // assets still referenced by the current project.
    setStatus(`已删除课程声音“${sound.name}”`)
  }

  const importComponent = () => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导入需要桌面编辑器')
      const selected = await window.desktopAPI.selectComponentPackage()
      if (!selected) return
      const imported = await importComponentPackageAsync(selected.bytes)
      if (historyRef.current.present.componentPackages[imported.manifest.id]) {
        throw new Error(`工程已包含组件 ${imported.manifest.name}；为避免覆盖，当前不会自动替换。`)
      }
      let next = updateCourseProject(historyRef.current.present, (draft) => {
        draft.componentPackages[imported.manifest.id] = imported.metadata
      })
      let inserted = false
      let insertedSelection: Exclude<Selection, null> | null = null
      let fallback: ReturnType<typeof componentFallbackAsset> | undefined
      if (imported.manifest.supportedScopes.includes('scene')) {
        fallback = componentFallbackAsset(imported)
        next = updateCourseProject(next, (draft) => {
          draft.assets[fallback!.meta.id] = fallback!.meta
        })
      }
      if (fallback && activeSurface.type === 'flow') {
        const blockId = `block-${nanoid(10)}`
        next = addFlowBlock(next, activeSurface.id, {
          id: blockId,
          type: 'component',
          component: { packageId: imported.manifest.id, version: imported.manifest.version },
          props: structuredClone(imported.manifest.defaultProps),
          staticFallbackAssetId: fallback.meta.id,
        })
        inserted = true
        insertedSelection = { kind: 'flow-block', id: blockId, surfaceId: activeSurface.id }
      } else if (imported.manifest.supportedScopes.includes('scene')) {
        const layerItemId = `component-${nanoid(10)}`
        next = addComponentLayer(next, {
          surfaceId: activeSurface.id,
          ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
          packageId: imported.manifest.id,
          version: imported.manifest.version,
          id: layerItemId,
          label: imported.manifest.name,
          props: structuredClone(imported.manifest.defaultProps),
          staticFallbackAssetId: fallback?.meta.id,
          width: imported.manifest.defaultSize.width,
          height: imported.manifest.defaultSize.height,
          x: activeSurface.type === 'spatial-2d' ? camera?.x ?? 0 : 160,
          y: activeSurface.type === 'spatial-2d' ? camera?.y ?? 0 : 120,
        })
        inserted = true
        insertedSelection = {
          kind: 'layer',
          id: layerItemId,
          carrier: 'component',
          source: activeSurface.type === 'slide' ? 'scene' : 'world',
          surfaceId: activeSurface.id,
          ...(activeSurface.type === 'slide' && activeSceneId ? { sceneId: activeSceneId } : {}),
        }
      }
      setComponentFiles((files) => ({ ...files, [imported.key]: imported.files }))
      if (fallback) setAssetFiles((files) => ({ ...files, [fallback!.meta.id]: fallback!.bytes }))
      const nextHistory = commitCourseHistory(historyRef.current, next)
      historyRef.current = nextHistory
      projectRef.current = next
      setHistory(nextHistory)
      setDirty(true)
      if (insertedSelection) {
        if (insertedSelection.kind === 'flow-block') {
          activateFlowBlockSelection(insertedSelection.surfaceId, insertedSelection.id)
        } else {
          setSelection(insertedSelection)
          setSelectedLayerItemIds([insertedSelection.id])
        }
        setInspectorTab('properties')
      }
      setStatus(inserted
        ? `已导入并插入组件 ${imported.manifest.name}`
        : `已导入组件 ${imported.manifest.name}；该组件不能直接插入当前内容，已保留在组件库中`)
    }, '组件导入失败。')
  }

  const insertEmbeddedComponent = (pkg: ComponentPackageData) => {
    if (!pkg.manifest.supportedScopes.includes('scene')) {
      setError(`组件 ${pkg.manifest.name} 不能插入当前内容类型。`)
      return
    }
    const fallback = componentFallbackAsset(pkg)
    if (activeSurface.type === 'flow') {
      const blockId = `block-${nanoid(10)}`
      commit((current) => {
        const withFallback = updateCourseProject(current, (draft) => {
          draft.assets[fallback.meta.id] = fallback.meta
        })
        return addFlowBlock(withFallback, activeSurface.id, {
          id: blockId,
          type: 'component',
          component: { packageId: pkg.manifest.id, version: pkg.manifest.version },
          props: structuredClone(pkg.manifest.defaultProps),
          staticFallbackAssetId: fallback.meta.id,
        })
      })
      setAssetFiles((files) => ({ ...files, [fallback.meta.id]: fallback.bytes }))
      activateFlowBlockSelection(activeSurface.id, blockId)
      setInspectorTab('properties')
      setStatus(`已将组件 ${pkg.manifest.name} 插入当前流式讲义`)
      return
    }
    if (activeSurface.type === 'slide' && !activeSceneId) return
    const layerItemId = `component-${nanoid(10)}`
    commit((current) => {
      const withFallback = updateCourseProject(current, (draft) => {
        draft.assets[fallback.meta.id] = fallback.meta
      })
      return addComponentLayer(withFallback, {
        surfaceId: activeSurface.id,
        ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
        packageId: pkg.manifest.id,
        version: pkg.manifest.version,
        id: layerItemId,
        label: pkg.manifest.name,
        props: structuredClone(pkg.manifest.defaultProps),
        staticFallbackAssetId: fallback.meta.id,
        width: pkg.manifest.defaultSize.width,
        height: pkg.manifest.defaultSize.height,
        x: activeSurface.type === 'spatial-2d' ? camera?.x ?? 0 : 160,
        y: activeSurface.type === 'spatial-2d' ? camera?.y ?? 0 : 120,
      })
    })
    setAssetFiles((files) => ({ ...files, [fallback.meta.id]: fallback.bytes }))
    setSelection({
      kind: 'layer',
      id: layerItemId,
      carrier: 'component',
      source: activeSurface.type === 'slide' ? 'scene' : 'world',
      surfaceId: activeSurface.id,
      ...(activeSurface.type === 'slide' && activeSceneId ? { sceneId: activeSceneId } : {}),
    })
    setSelectedLayerItemIds([layerItemId])
    setInspectorTab('properties')
    setStatus(`已将“${pkg.manifest.name}”插入当前${surfaceLabel(activeSurface.type)}内容`)
  }

  const replaceSelectedFlowComponent = (
    block: Extract<FlowBlock, { type: 'component' }>,
    packageId: string,
    version: string,
  ) => {
    if (activeSurface.type !== 'flow') return
    const pkg = Object.values(parsedComponentPackages).find((candidate) => (
      candidate.manifest.id === packageId && candidate.manifest.version === version
    ))
    if (!pkg) {
      setError('替换用的互动组件已经不可用，请重新从“元素”面板选择。')
      return
    }
    const fallback = componentFallbackAsset(pkg)
    if (!commit((current) => replaceFlowComponentBlock(current, activeSurface.id, block.id, {
      packageId: pkg.manifest.id,
      version: pkg.manifest.version,
      props: structuredClone(pkg.manifest.defaultProps),
      staticFallbackAsset: fallback.meta,
    }))) return
    setAssetFiles((files) => ({ ...files, [fallback.meta.id]: fallback.bytes }))
    setStatus(`已替换为“${pkg.manifest.name}”`)
  }

  const layerItems = activeSurface.type === 'slide'
    ? activeScene?.layerItems ?? []
    : activeSurface.type === 'spatial-2d'
      ? activeSurface.world.layerItems
      : []

  const effectiveLayerEntries = [
    ...project.globalLayerItems.map((entry) => ({ item: entry.item, source: 'global' as const })),
    ...activeSurface.surfaceLayerItems.map((entry) => ({ item: entry.item, source: 'surface' as const })),
    ...layerItems.map((item) => ({ item, source: activeSurface.type === 'slide' ? 'scene' as const : 'world' as const })),
  ].sort((left, right) => left.item.order - right.item.order || left.item.layerItemId.localeCompare(right.item.layerItemId))

  const activeSurfaceLocationId = project.locations.find((location) => (
    location.id === playbackSession.currentLocationId && location.surfaceId === activeSurface.id
  ))?.id ?? project.locations.find((location) => location.surfaceId === activeSurface.id)?.id

  const effectiveLayerIdSignature = effectiveLayerEntries
    .map(({ item }) => item.layerItemId)
    .join('\u0000')
  useEffect(() => {
    const available = new Set(effectiveLayerIdSignature ? effectiveLayerIdSignature.split('\u0000') : [])
    setSelectedLayerItemIds((current) => {
      const next = current.filter((id) => available.has(id))
      return next.length === current.length ? current : next
    })
    setSelection((current) => (
      current?.kind === 'layer' && !available.has(current.id) ? null : current
    ))
  }, [effectiveLayerIdSignature])

  const selectedLayerItems = effectiveLayerEntries
    .filter(({ item }) => selectedLayerItemIds.includes(item.layerItemId))
    .map(({ item, source }): CourseCanvasLayerSelection => ({ item, source }))

  const layerLocation = (entry: CourseLayerPanelEntry) => ({
    surfaceId: activeSurface.id,
    ...(activeSurface.type === 'slide' && activeSceneId ? { sceneId: activeSceneId } : {}),
    layerItemId: entry.item.layerItemId,
    source: entry.source,
  })

  const selectLayerIds = (ids: string[]) => {
    const available = new Set(effectiveLayerEntries.map(({ item }) => item.layerItemId))
    const nextIds = [...new Set(ids)].filter((id) => available.has(id))
    setSelectedLayerItemIds(nextIds)
    const primary = effectiveLayerEntries.find(({ item }) => item.layerItemId === nextIds.at(-1))
    if (!primary) {
      if (selection?.kind === 'layer') setSelection(null)
      return
    }
    setSelection({
      kind: 'layer',
      id: primary.item.layerItemId,
      carrier: primary.item.kind,
      source: primary.source,
      surfaceId: activeSurface.id,
      ...(primary.source === 'scene' && activeSceneId ? { sceneId: activeSceneId } : {}),
    })
    setInspectorTab('properties')
  }

  const selectCanvasLayer = (hit: {
    layerItemId: string
    kind: LayerItem['kind']
    source: 'scene' | 'world' | 'surface' | 'global'
    surfaceId: string
    sceneId?: string
    field?: string
    hitId?: string
    targetKind?: 'text' | 'asset'
  }) => {
    if (mode !== 'inspect') return
    setSelectedLayerItemIds([hit.layerItemId])
    setSelection({
      kind: 'layer',
      id: hit.layerItemId,
      carrier: hit.kind,
      source: hit.source,
      surfaceId: hit.surfaceId,
      ...(hit.sceneId ? { sceneId: hit.sceneId } : {}),
      ...(hit.field ? { field: hit.field } : {}),
      ...(hit.hitId ? { hitId: hit.hitId } : {}),
      ...(hit.targetKind ? { targetKind: hit.targetKind } : {}),
    })
    setInspectorTab('properties')
  }

  const selectCanvasLayers = (
    selections: CourseCanvasLayerSelection[],
    primaryId?: string,
  ) => {
    if (mode !== 'inspect') return
    const available = new Set(effectiveLayerEntries.map(({ item }) => item.layerItemId))
    const nextSelections = selections.filter(({ item }) => available.has(item.layerItemId))
    const nextIds = [...new Set(nextSelections.map(({ item }) => item.layerItemId))]
    setSelectedLayerItemIds(nextIds)

    const primary = nextSelections.find(({ item }) => item.layerItemId === primaryId)
      ?? nextSelections.at(-1)
    if (!primary) {
      setSelection((current) => current?.kind === 'layer' ? null : current)
      return
    }

    setSelection((current) => {
      if (current?.kind === 'layer' && current.id === primary.item.layerItemId) {
        return current
      }
      return {
        kind: 'layer',
        id: primary.item.layerItemId,
        carrier: primary.item.kind,
        source: primary.source,
        surfaceId: activeSurface.id,
        ...(primary.source === 'scene' && activeSceneId ? { sceneId: activeSceneId } : {}),
      }
    })
    setInspectorTab('properties')
  }

  const handleLayerTransformCommit = (change: CourseTransformChange) => {
    const targets = effectiveLayerEntries
      .filter(({ item }) => change.selectedLayerItemIds.includes(item.layerItemId))
      .map((entry) => layerLocation(entry))
    if (targets.length !== change.selectedLayerItemIds.length) {
      setError('选择已变化，请重新选择图层后再调整。')
      return
    }
    if (commit((current) => commitCourseTransform(current, targets, change.items))) {
      setStatus(`已调整 ${targets.length} 个图层`)
    }
  }

  const handleNativeTextCommit = (entry: CourseCanvasLayerSelection, text: string) => {
    const target = layerLocation(entry)
    if (commit((current) => updateLayerItem(current, target, (item) => {
      if (item.locked) throw new Error(`图层“${item.label}”已锁定，不能编辑。`)
      if (item.kind !== 'native' || item.content.nativeType !== 'text') {
        throw new Error('当前图层不是可直接编辑的文字。')
      }
      item.content.data.text = text
    }))) {
      setStatus('文字已更新')
    }
  }

  const addTextElement = () => {
    if (activeSurface.type === 'flow' || (activeSurface.type === 'slide' && !activeSceneId)) return
    const id = `text-${nanoid(10)}`
    const added = activeSurface.type === 'slide'
      ? commit((current) => addSlideTextLayer(current, activeSurface.id, activeSceneId!, '双击编辑文字', { id }))
      : commit((current) => addSpatialTextLayer(current, activeSurface.id, '双击编辑文字', {
          id,
          x: camera?.x,
          y: camera?.y,
        }))
    if (!added) return
    setSelection({
      kind: 'layer',
      id,
      carrier: 'native',
      source: activeSurface.type === 'slide' ? 'scene' : 'world',
      surfaceId: activeSurface.id,
      ...(activeSurface.type === 'slide' && activeSceneId ? { sceneId: activeSceneId } : {}),
    })
    setSelectedLayerItemIds([id])
    setInspectorTab('properties')
  }

  const addFlowElement = (type: Exclude<FlowBlock['type'], 'media'>) => {
    if (activeSurface.type !== 'flow') return
    if (type === 'component') {
      setError('请先导入互动组件，再从组件列表插入。')
      return
    }
    try {
      const block = newFlowBlock(type)
      if (!commit((current) => addFlowBlock(current, activeSurface.id, block))) return
      activateFlowBlockSelection(activeSurface.id, block.id)
      setInspectorTab('properties')
    } catch (cause) {
      setError(readableError(cause))
    }
  }

  const handleElementAction = (action: CourseElementPaletteAction) => {
    if (mode === 'playback') return
    if (action.kind === 'native') {
      if (action.element === 'text') addTextElement()
      else addVisualLayer(action.element)
      return
    }
    if (action.kind === 'media') {
      importMedia(action.mediaKind)
      return
    }
    if (action.kind === 'flow-block') {
      if (action.blockType === 'media') importMedia(action.mediaKind)
      else addFlowElement(action.blockType)
      return
    }
    if (action.kind === 'component-import') {
      importComponent()
      return
    }
    if (action.kind === 'teacher-controller') {
      const id = `teacher-controller-${nanoid(10)}`
      if (!commit((current) => addTeacherController(current, { id }))) return
      setSelection({
        kind: 'layer',
        id,
        carrier: 'native',
        source: 'global',
        surfaceId: activeSurface.id,
      })
      setSelectedLayerItemIds([id])
      setInspectorTab('properties')
      setStatus('已添加全课程教师控制器')
      return
    }
    if (action.kind !== 'component') return
    const component = Object.values(parsedComponentPackages).find((pkg) => (
      pkg.manifest.id === action.packageId && pkg.manifest.version === action.version
    ))
    if (component) insertEmbeddedComponent(component)
    else setError('组件已变化，请刷新组件列表后重试。')
  }

  const activateScene = (surfaceId: string, sceneId: string) => {
    const location = authoredSlideLocation(projectRef.current, surfaceId, sceneId)
    if (location) playbackSession.authorActivate(location)
    else setActiveSceneIds((current) => ({ ...current, [surfaceId]: sceneId }))
    setSelection(null)
    setSelectedLayerItemIds([])
  }

  const addScene = (surface: SlideSurfaceDocument) => {
    if (modeRef.current === 'playback') return
    const id = `scene-${nanoid(10)}`
    if (!commit((current) => addSlideScene(current, surface.id, { id }))) return
    activateScene(surface.id, id)
    setStatus('已新建场景')
  }

  const duplicateScene = (surface: SlideSurfaceDocument, sceneId: string) => {
    if (modeRef.current === 'playback') return
    const id = `scene-${nanoid(10)}`
    if (!commit((current) => duplicateSlideScene(current, surface.id, sceneId, { id }))) return
    activateScene(surface.id, id)
    setStatus('已复制场景')
  }

  const moveScene = (surface: SlideSurfaceDocument, sceneId: string, delta: -1 | 1) => {
    if (modeRef.current === 'playback') return
    const fromIndex = surface.scenes.findIndex((scene) => scene.id === sceneId)
    const toIndex = fromIndex + delta
    if (fromIndex < 0 || toIndex < 0 || toIndex >= surface.scenes.length) return
    const ids = surface.scenes.map((scene) => scene.id)
    const [moved] = ids.splice(fromIndex, 1)
    ids.splice(toIndex, 0, moved!)
    if (commit((current) => reorderSlideScenes(current, surface.id, ids))) {
      setStatus(delta < 0 ? '场景已上移' : '场景已下移')
    }
  }

  const removeScene = (surface: SlideSurfaceDocument, sceneId: string) => {
    if (modeRef.current === 'playback') return
    const index = surface.scenes.findIndex((scene) => scene.id === sceneId)
    const scene = surface.scenes[index]
    if (!scene || !window.confirm(`删除场景“${scene.name}”？`)) return
    const fallback = surface.scenes[index + 1] ?? surface.scenes[index - 1]
    if (!commit((current) => deleteSlideScene(current, surface.id, sceneId))) return
    if (fallback) {
      reconcileStudioToProject(projectRef.current, {
        preferredSurfaceId: surface.id,
        preferredSceneId: fallback.id,
      })
    }
    setStatus(`已删除场景“${scene.name}”`)
  }

  const layerContext = selectedItem ? {
    surfaceId: activeSurface.id,
    ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
    layerItemId: selectedItem.layerItemId,
    ...(selection?.kind === 'layer' ? { source: selection.source } : {}),
  } : null

  const handleSlideHostReady = useCallback((host: SlideSurfaceHost | null) => {
    slideHostRef.current = host
  }, [])

  useEffect(() => {
    if (
      mode !== 'inspect' ||
      activeSurface.type !== 'slide' ||
      !activeSceneId
    ) return
    const host = slideHostRef.current
    if (!host) return
    void host.setScene(activeSceneId, activeReviewStateId).then(() => {
      const pending = pendingSlideLocationRef.current
      if (
        pending?.surfaceId === activeSurface.id &&
        pending.sceneId === activeSceneId &&
        pending.stateId === host.stateId
      ) pendingSlideLocationRef.current = null
    }).catch((cause: unknown) => setError(readableError(cause, '无法恢复当前复核画面。')))
  }, [activeReviewStateId, activeSceneId, activeSurface.id, activeSurface.type, mode])

  const handleInteractionReady = useCallback(async (host: SlideSurfaceHost) => {
    if (modeRef.current !== 'playback') {
      const sceneId = activeSceneIdsRef.current[host.id]
      const pending = pendingSlideLocationRef.current
      const desiredStateId = pending?.surfaceId === host.id && pending.sceneId === sceneId
        ? pending.stateId
        : sceneId
          ? reviewStateIdsRef.current[sceneId]
          : undefined
      if (sceneId === host.sceneId && desiredStateId && host.stateId !== desiredStateId) {
        await host.setPresentationState(desiredStateId)
      }
      return
    }
    globalInteractionControllerRef.current?.setEnabled(true)
    const previous = interactionSceneRef.current
    if (
      previous &&
      (previous.surfaceId !== host.id || previous.sceneId !== host.sceneId)
    ) {
      courseEvents.emit('scene:leave', previous)
    }
    interactionSceneRef.current = { surfaceId: host.id, sceneId: host.sceneId }
    globalInteractionControllerRef.current?.refreshBindings()
    await host.announceInteractionEntry()
  }, [courseEvents])

  const enterCurrentFrameInspection = useCallback(() => {
    void (async () => {
      const host = slideHostRef.current
      if (
        activeSurface.type === 'slide' &&
        activeSceneId &&
        host?.sceneId === activeSceneId
      ) {
        // Queue behind any Runtime-triggered presentation.set before React
        // derives presentationStateId. Otherwise entering inspection could
        // immediately reset the live frame to stale UI state.
        await host.setInspectionMode('inspect')
        const liveStateId = host.stateId
        setReviewStateIds((current) => {
          if (liveStateId) return { ...current, [activeSceneId]: liveStateId }
          const next = { ...current }
          delete next[activeSceneId]
          return next
        })
      }
      setMode('inspect')
    })().catch((cause: unknown) => setError(readableError(cause, '无法冻结当前画面。')))
  }, [activeSceneId, activeSurface])

  const captureActiveReviewFrame = useCallback(() => {
    if (activeSurface.type !== 'slide' || !activeSceneId || !activeScene) return null
    const host = slideHostRef.current
    const visibleRoot = document.querySelector<HTMLElement>(
      '[data-testid="course-slide-canvas"] .course-slide-mount > .slide-surface',
    )
    const hostRoot = host?.rootElement
    const liveRoot = hostRoot?.isConnected ? hostRoot : visibleRoot
    const liveStateId = host?.sceneId === activeSceneId ? host.stateId : activeReviewStateId
    const sourceState = activeScene.presentation?.states.find((state) => state.id === liveStateId)
    return {
      sceneId: activeSceneId,
      sourceState,
      snapshot: captureSlideReviewFrame(activeScene, liveRoot, sourceState),
    }
  }, [activeReviewStateId, activeScene, activeSceneId, activeSurface])

  const stageNamedReviewFrame = useCallback(() => {
    // Pointer focus/blur may cause React to reconcile the authored document
    // before click. Sample the live frame on pointer-down while the teacher's
    // exact Runtime/Component-mutated DOM is still authoritative.
    pendingReviewFrameRef.current = captureActiveReviewFrame()
  }, [captureActiveReviewFrame])

  const saveNamedReviewState = useCallback(() => {
    if (activeSurface.type !== 'slide' || !activeSceneId || !activeScene) return
    const captured = pendingReviewFrameRef.current?.sceneId === activeSceneId
      ? pendingReviewFrameRef.current
      : captureActiveReviewFrame()
    pendingReviewFrameRef.current = null
    if (!captured) return
    const name = window.prompt('命名这个可编辑复核画面：', `复核态 ${(activeScene.presentation?.states.length ?? 0) + 1}`)?.trim()
    if (!name) return
    const stateId = `state-${nanoid(10)}`
    const { sourceState, snapshot } = captured
    commit((current) => saveSlidePresentationState(current, activeSurface.id, activeSceneId, {
      id: stateId,
      name,
      description: '教师从当前检查画面显式保存；仅持久化可编辑的背景、图层顺序、几何、透明度与显隐，不把互动内容的临时状态伪装成已保存结果。',
      backgroundColor: sourceState?.backgroundColor ?? activeScene.backgroundColor,
      backgroundAssetId: sourceState?.backgroundAssetId === undefined
        ? activeScene.backgroundAssetId
        : sourceState.backgroundAssetId,
      layerItemOverrides: snapshot.layerItemOverrides,
      layerItemOrder: snapshot.layerItemOrder,
    }))
    setReviewStateIds((current) => ({ ...current, [activeSceneId]: stateId }))
    setStatus(`已保存复核画面“${name}”；互动内容的临时状态仍保留在当前会话中`)
  }, [activeScene, activeSceneId, activeSurface, captureActiveReviewFrame, commit])

  const renameActiveReviewState = useCallback(() => {
    if (activeSurface.type !== 'slide' || !activeSceneId || !activeScene?.presentation || !activeReviewStateId) return
    const state = activeScene.presentation.states.find((candidate) => candidate.id === activeReviewStateId)
    if (!state) return
    const name = window.prompt('重命名复核态：', state.name)?.trim()
    if (!name || name === state.name) return
    commit((current) => renameSlidePresentationState(
      current, activeSurface.id, activeSceneId, state.id, name,
    ))
    setStatus(`已重命名复核态为“${name}”`)
  }, [activeReviewStateId, activeScene, activeSceneId, activeSurface, commit])

  const makeActiveReviewStateInitial = useCallback(() => {
    if (activeSurface.type !== 'slide' || !activeSceneId || !activeReviewStateId) return
    commit((current) => setInitialSlidePresentationState(
      current, activeSurface.id, activeSceneId, activeReviewStateId,
    ))
    setStatus('已将当前复核态设为该场景的试运行初始画面')
  }, [activeReviewStateId, activeSceneId, activeSurface, commit])

  const removeActiveReviewState = useCallback(() => {
    if (activeSurface.type !== 'slide' || !activeSceneId || !activeScene?.presentation || !activeReviewStateId) return
    const state = activeScene.presentation.states.find((candidate) => candidate.id === activeReviewStateId)
    if (!state || !window.confirm(`删除命名复核态“${state.name}”？`)) return
    const fallback = activeScene.presentation.states.find((candidate) => candidate.id !== state.id)?.id
    commit((current) => deleteSlidePresentationState(
      current, activeSurface.id, activeSceneId, state.id,
    ))
    setReviewStateIds((current) => {
      const next = { ...current }
      if (fallback) next[activeSceneId] = fallback
      else delete next[activeSceneId]
      return next
    })
    setStatus(`已删除命名复核态“${state.name}”`)
  }, [activeReviewStateId, activeScene, activeSceneId, activeSurface, commit])

  const handleTeacherAction = useCallback((action: TeacherControllerAction): boolean => {
    if (mode === 'inspect') return false
    if (
      action.type === 'scene.go' || action.type === 'scene.next' ||
      action.type === 'scene.previous' || action.type === 'scene.replay' ||
      action.type === 'course.restart'
    ) {
      playbackSession.beforeTeacherAction(action)
      return false
    }
    return true
  }, [mode, playbackSession])
  const teacherControllerProgressText = useCallback((): string => {
    const currentLocationId = playbackSessionRef.current?.currentLocationId
    const index = projectRef.current.locations.findIndex((location) => location.id === currentLocationId)
    const current = index >= 0 ? projectRef.current.locations[index] : undefined
    return current
      ? `${index + 1} / ${projectRef.current.locations.length} · ${current.label}`
      : `1 / ${projectRef.current.locations.length}`
  }, [])
  const handleTeacherSideEffect = useCallback((action: TeacherControllerAction): void => {
    if (action.type === 'scene.open-picker') {
      locationPickerRef.current?.open(playbackSessionRef.current?.currentLocationId ?? null)
    } else if (action.type === 'audio.toggle-mute') {
      const media = document.querySelectorAll<HTMLMediaElement>('.course-canvas-shell audio, .course-canvas-shell video')
      const muted = courseAudio.toggleMuted()
      courseAudio.applyCourseMuteToMedia(media, muted)
    } else if (action.type === 'player.fullscreen.toggle') {
      const canvas = document.querySelector<HTMLElement>('.course-canvas-shell')
      if (document.fullscreenElement) void document.exitFullscreen?.()
      else void canvas?.requestFullscreen?.()
    }
  }, [courseAudio])
  const handleSpatialTeacherAction = useCallback((action: TeacherControllerAction): void => {
    if (handleTeacherAction(action)) handleTeacherSideEffect(action)
  }, [handleTeacherAction, handleTeacherSideEffect])

  const changeLayer = (update: (item: LayerItem) => void) => {
    if (!layerContext || mode !== 'inspect') return
    commit((current) => updateLayerItem(current, layerContext, update))
  }

  const commitAuthoringValue = useCallback((entry: SelectedAuthoringField, value: unknown) => {
    commit((current) => {
      const currentEntry = deriveCourseProjectAuthoringInventorySnapshot(current).entries[entry.address]
      if (!currentEntry) throw new Error('当前作者字段已失效，请重新点选画布内容。')
      return applyCourseAuthoringPatch(current, {
        op: 'replace',
        expectedRevision: current.revision,
        authoringAddress: entry.address,
        expectedValue: jsonPointerValue(current, currentEntry.jsonPointer),
        value,
      })
    })
  }, [commit])

  const replaceSelectedAsset = useCallback((field: string) => {
    void run(async () => {
      const entry = selectedAuthoringFields.find((candidate) => candidate.field === field)
      if (!entry) throw new Error('当前素材地址已失效，请重新点选画布中的图片。')
      if (!window.desktopAPI) throw new Error('替换素材需要桌面编辑器。')
      const kind: 'image' | 'audio' | 'video' = selectedBlock?.type === 'media'
        ? selectedBlock.mediaKind
        : selectedItem?.kind === 'native' && selectedItem.content.nativeType === 'video' && field === 'content.data.assetId'
          ? 'video'
          : 'image'
      const selected = kind === 'image'
        ? await window.desktopAPI.selectImage()
        : kind === 'video'
          ? await window.desktopAPI.selectVideo()
          : await window.desktopAPI.selectAudio()
      if (!selected) return
      const imported = kind === 'image'
        ? createImageAssetImport(selected, {
            dimensions: await readImageDimensions(selected.bytes, selected.mimeType),
          })
        : createMediaAssetImport(
            selected,
            kind,
            await readMediaMetadata(selected.bytes, selected.mimeType, kind),
          )
      const current = historyRef.current
      let next: CourseProjectDocument
      if (activeSurface.type === 'flow' && selectedBlock?.type === 'media' && field === 'assetId') {
        next = replaceFlowMediaAsset(
          current.present,
          activeSurface.id,
          selectedBlock.id,
          imported.meta,
        )
      } else if (
        activeSurface.type === 'flow' &&
        selectedBlock?.type === 'component' &&
        field === 'staticFallbackAssetId'
      ) {
        next = replaceFlowComponentFallback(
          current.present,
          activeSurface.id,
          selectedBlock.id,
          imported.meta,
        )
      } else {
        next = updateCourseProject(current.present, (draft) => {
          draft.assets[imported.meta.id] = imported.meta
        })
        const currentEntry = deriveCourseProjectAuthoringInventorySnapshot(next).entries[entry.address]
        if (!currentEntry) throw new Error('当前素材地址已失效，请重新点选画布中的图片。')
        next = applyCourseAuthoringPatch(next, {
          op: 'replace',
          expectedRevision: next.revision,
          authoringAddress: entry.address,
          expectedValue: jsonPointerValue(next, currentEntry.jsonPointer),
          value: imported.meta.id,
        })
      }
      const nextHistory = commitCourseHistory(current, next)
      historyRef.current = nextHistory
      projectRef.current = next
      setHistory(nextHistory)
      setAssetFiles((files) => ({ ...files, [imported.meta.id]: imported.bytes }))
      setDirty(true)
      setStatus(`已替换${kind === 'image' ? '图片' : kind === 'video' ? '视频' : '声音'}素材：${imported.meta.filename}`)
    }, '素材替换失败。')
  }, [activeSurface, run, selectedAuthoringFields, selectedBlock, selectedItem])

  const replaceFlowBlockMedia = useCallback((
    block: Extract<FlowBlock, { type: 'media' }>,
  ) => {
    void run(async () => {
      if (activeSurface.type !== 'flow') throw new Error('当前内容不是流式讲义。')
      if (!window.desktopAPI) throw new Error('替换素材需要桌面编辑器。')
      const selected = block.mediaKind === 'image'
        ? await window.desktopAPI.selectImage()
        : block.mediaKind === 'video'
          ? await window.desktopAPI.selectVideo()
          : await window.desktopAPI.selectAudio()
      if (!selected) return
      const imported = block.mediaKind === 'image'
        ? createImageAssetImport(selected, {
            dimensions: await readImageDimensions(selected.bytes, selected.mimeType),
          })
        : createMediaAssetImport(
            selected,
            block.mediaKind,
            await readMediaMetadata(selected.bytes, selected.mimeType, block.mediaKind),
          )
      const current = historyRef.current
      const next = replaceFlowMediaAsset(
        current.present,
        activeSurface.id,
        block.id,
        imported.meta,
      )
      const nextHistory = commitCourseHistory(current, next)
      historyRef.current = nextHistory
      projectRef.current = next
      setHistory(nextHistory)
      setAssetFiles((files) => ({ ...files, [imported.meta.id]: imported.bytes }))
      setDirty(true)
      setStatus(`已替换${block.mediaKind === 'image' ? '图片' : block.mediaKind === 'video' ? '视频' : '声音'}素材：${imported.meta.filename}`)
    }, '媒体替换失败。')
  }, [activeSurface, run])

  const replaceFlowComponentPreview = useCallback((
    block: Extract<FlowBlock, { type: 'component' }>,
  ) => {
    void run(async () => {
      if (activeSurface.type !== 'flow') throw new Error('当前内容不是流式讲义。')
      if (!window.desktopAPI) throw new Error('替换静态预览需要桌面编辑器。')
      const selected = await window.desktopAPI.selectImage()
      if (!selected) return
      const imported = createImageAssetImport(selected, {
        dimensions: await readImageDimensions(selected.bytes, selected.mimeType),
      })
      const current = historyRef.current
      const next = replaceFlowComponentFallback(
        current.present,
        activeSurface.id,
        block.id,
        imported.meta,
      )
      const nextHistory = commitCourseHistory(current, next)
      historyRef.current = nextHistory
      projectRef.current = next
      setHistory(nextHistory)
      setAssetFiles((files) => ({ ...files, [imported.meta.id]: imported.bytes }))
      setDirty(true)
      setStatus(`已替换静态预览：${imported.meta.filename}`)
    }, '静态预览替换失败。')
  }, [activeSurface, run])

  const copyAiReference = async () => {
    if (!selection) return
    if (!selection.field) {
      setError('请先选择要修改的具体属性；普通图层点选不会替你猜测修改目标。')
      return
    }
    if (!currentAiReference) {
      setError('所选修改目标已失效，请重新点选画布内容。')
      return
    }
    await navigator.clipboard.writeText(JSON.stringify({
      projectPath,
      dirty,
      reference: currentAiReference,
    }, null, 2))
    setStatus('已复制 AI 稳定引用')
  }

  const handleApplyAiPatch = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI?.selectCourseAuthoringPatch) throw new Error('当前桌面环境不支持选择 AI 修改文件')
      const selected = await window.desktopAPI.selectCourseAuthoringPatch()
      if (!selected) return
      const patch = parseCourseAuthoringPatch(selected.bytes)
      const current = historyRef.current
      const next = applyCourseAuthoringPatch(current.present, patch)
      const nextHistory = commitCourseHistory(current, next)
      historyRef.current = nextHistory
      projectRef.current = next
      setHistory(nextHistory)
      setDirty(true)
      setStatus(`已应用 AI 修改：${selected.name}；可使用撤销恢复`)
    }, 'AI 修改应用失败，工程未发生变化。')
  }, [run])

  const updateLayerFlag = (
    entry: CourseLayerPanelEntry,
    field: 'visible' | 'locked',
    value: boolean,
  ) => {
    commit((current) => updateLayerItem(current, layerLocation(entry), (item) => {
      item[field] = value
    }))
  }

  const reorderLayer = (request: CourseLayerReorderRequest) => {
    const entry = effectiveLayerEntries.find(({ item }) => item.layerItemId === request.layerItemId)
    if (!entry) {
      setError('图层已变化，请重新选择后再排序。')
      return
    }
    if (commit((current) => reorderLayerItem(current, {
      ...layerLocation(entry),
      toIndex: request.toIndex,
    }))) {
      setStatus('图层顺序已更新')
    }
  }

  const duplicateLayers = (ids: string[]) => {
    const entries = ids
      .map((id) => effectiveLayerEntries.find(({ item }) => item.layerItemId === id))
      .filter((entry): entry is CourseLayerPanelEntry => Boolean(entry))
    if (entries.length === 0) return
    if (commit((current) => entries.reduce(
      (next, entry) => duplicateLayerItem(next, layerLocation(entry)),
      current,
    ))) {
      setStatus(`已复制 ${entries.length} 个图层`)
    }
  }

  const deleteLayers = (ids: string[]) => {
    const entries = ids
      .map((id) => effectiveLayerEntries.find(({ item }) => item.layerItemId === id))
      .filter((entry): entry is CourseLayerPanelEntry => Boolean(entry))
    if (entries.length === 0 || !window.confirm(`删除所选 ${entries.length} 个图层？`)) return
    if (commit((current) => entries.reduce(
      (next, entry) => deleteLayerItem(next, layerLocation(entry)),
      current,
    ))) {
      setSelectedLayerItemIds([])
      if (selection?.kind === 'layer' && ids.includes(selection.id)) setSelection(null)
      setStatus(`已删除 ${entries.length} 个图层`)
    }
  }

  const clipboardSelectionsFor = (ids: readonly string[]): CourseLayerClipboardSelection[] => (
    ids
      .map((id) => effectiveLayerEntries.find(({ item }) => item.layerItemId === id))
      .filter((entry): entry is CourseLayerPanelEntry => Boolean(entry))
      .map((entry) => ({
        surfaceId: activeSurface.id,
        ...(entry.source === 'scene' && activeSceneId ? { sceneId: activeSceneId } : {}),
        source: entry.source,
        layerItemId: entry.item.layerItemId,
      }))
  )

  const copyLayersToClipboard = (ids = selectedLayerItemIds): CourseLayerClipboardSnapshot | null => {
    try {
      const snapshot = copyCourseLayerItems(projectRef.current, clipboardSelectionsFor(ids))
      setLayerClipboard(snapshot)
      setStatus(`已复制 ${snapshot.entries.length} 个图层，可粘贴到当前画布`)
      return snapshot
    } catch (cause) {
      setError(readableError(cause, '复制图层失败。'))
      return null
    }
  }

  const cutSelectedLayers = () => {
    const locations = clipboardSelectionsFor(selectedLayerItemIds)
    if (locations.length === 0) return
    const holder: { value?: ReturnType<typeof cutCourseLayerItems> } = {}
    if (!commit((current) => {
      holder.value = cutCourseLayerItems(current, locations)
      return holder.value.project
    }) || !holder.value) return
    const result = holder.value
    setLayerClipboard(result.clipboard)
    setSelectedLayerItemIds([])
    setSelection((current) => current?.kind === 'layer' ? null : current)
    setStatus(`已剪切 ${result.cutIds.length} 个图层`)
  }

  const duplicateSelectedLayersInPlace = () => {
    const locations = clipboardSelectionsFor(selectedLayerItemIds)
    if (locations.length === 0) return
    let result: ReturnType<typeof duplicateCourseLayerItems> | undefined
    if (!commit((current) => {
      result = duplicateCourseLayerItems(current, locations)
      return result.project
    }) || !result) return
    const primaryIndex = result.duplicatedIds.length - 1
    const primaryId = result.duplicatedIds[primaryIndex]!
    const primarySource = result.sources[primaryIndex]!
    const primaryItem = effectiveLayerEntries.find(({ item }) => (
      item.layerItemId === selectedLayerItemIds.at(-1)
    ))?.item
    setSelectedLayerItemIds(result.duplicatedIds)
    setSelection({
      kind: 'layer',
      id: primaryId,
      carrier: primaryItem?.kind ?? 'native',
      source: primarySource.scope,
      surfaceId: primarySource.surfaceId,
      ...(primarySource.scope === 'scene' && primarySource.sceneId
        ? { sceneId: primarySource.sceneId }
        : {}),
    })
    setInspectorTab('properties')
    setStatus(`已复制 ${result.duplicatedIds.length} 个图层`)
  }

  const pasteLayersFromClipboard = (
    snapshot: CourseLayerClipboardSnapshot | null = layerClipboard,
    statusText = '已粘贴',
  ) => {
    if (!snapshot) {
      setError('图层剪贴板为空，请先选择图层并复制。')
      return
    }
    if (activeSurface.type === 'slide' && !activeSceneId) {
      setError('当前幻灯片没有可粘贴的场景。')
      return
    }
    let pastedIds: string[] = []
    if (!commit((current) => {
      const result = pasteCourseLayerItems(current, snapshot, {
        surfaceId: activeSurface.id,
        ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
        scopedVisibility: { mode: 'reset-for-target' },
      })
      pastedIds = result.pastedIds
      return result.project
    }) || pastedIds.length === 0) return

    const source = activeSurface.type === 'slide'
      ? 'scene' as const
      : activeSurface.type === 'spatial-2d'
        ? 'world' as const
        : 'surface' as const
    const primaryId = pastedIds.at(-1)!
    const primaryEntry = snapshot.entries.at(-1)!
    setSelectedLayerItemIds(pastedIds)
    setSelection({
      kind: 'layer',
      id: primaryId,
      carrier: primaryEntry.item.kind,
      source,
      surfaceId: activeSurface.id,
      ...(source === 'scene' && activeSceneId ? { sceneId: activeSceneId } : {}),
    })
    setInspectorTab('properties')
    setStatus(`${statusText} ${pastedIds.length} 个图层`)
  }

  const handleFlowBlockMove = (request: FlowBlockMoveRequest) => {
    if (activeSurface.type !== 'flow') return
    if (commit((current) => moveFlowBlock(current, activeSurface.id, request))) {
      activateFlowBlockSelection(activeSurface.id, request.blockId)
      setStatus('讲义内容顺序已更新')
    }
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"]')) return
      if (mode !== 'inspect') return
      if (event.key === 'Delete' && !(event.ctrlKey || event.metaKey || event.altKey)) {
        if (selectedLayerItemIds.length === 0) return
        event.preventDefault()
        deleteLayers(selectedLayerItemIds)
        return
      }
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLocaleLowerCase('en-US')
      if (key === 'c' && selectedLayerItemIds.length > 0) {
        event.preventDefault()
        copyLayersToClipboard()
      } else if (key === 'x' && selectedLayerItemIds.length > 0) {
        event.preventDefault()
        cutSelectedLayers()
      } else if (key === 'v') {
        event.preventDefault()
        pasteLayersFromClipboard()
      } else if (key === 'd' && selectedLayerItemIds.length > 0) {
        event.preventDefault()
        duplicateSelectedLayersInPlace()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const toolbar: V9EditorToolbarGroups = {
    file: [
      { id: 'new', label: '新建', icon: <FilePlus2 size={16} />, onSelect: handleNew },
      { id: 'open', label: '打开', title: '打开课件', icon: <FolderOpen size={16} />, onSelect: handleOpen },
      {
        id: 'save',
        label: '保存',
        shortcut: 'Ctrl+S',
        icon: <Save size={16} />,
        onSelect: () => void run(() => save(false).then(() => undefined), '保存失败。'),
      },
    ],
    history: [
      { id: 'undo', label: '撤销', shortcut: 'Ctrl+Z', icon: <Undo2 size={16} />, disabled: mode === 'playback' || history.past.length === 0, onSelect: handleUndo },
      { id: 'redo', label: '重做', shortcut: 'Ctrl+Y', icon: <Redo2 size={16} />, disabled: mode === 'playback' || history.future.length === 0, onSelect: handleRedo },
    ],
    session: [
      { id: 'inspect', label: '编辑当前帧', icon: <PencilLine size={16} />, active: mode === 'inspect', onSelect: enterCurrentFrameInspection },
      { id: 'playback', label: '试运行', icon: <Play size={16} />, active: mode === 'playback', onSelect: () => setMode('playback') },
      { id: 'restart', label: '重启', title: '重启试运行', icon: <RotateCcw size={16} />, disabled: mode !== 'playback', onSelect: () => playbackSession.restart() },
    ],
    output: [
      { id: 'preview', label: '预览', icon: <Eye size={16} />, onSelect: handlePreview },
      { id: 'html', label: 'HTML', title: '导出 HTML', icon: <FileCode2 size={16} />, onSelect: handleExportHtml },
    ],
    more: [
      { id: 'save-as', label: '另存课件', icon: <Save size={16} />, onSelect: () => void run(() => save(true).then(() => undefined), '另存失败。') },
      { id: 'ai-patch', label: '应用 AI 修改', icon: <WandSparkles size={16} />, disabled: mode === 'playback', onSelect: handleApplyAiPatch },
      { id: 'web', label: '导出网页包', icon: <FileArchive size={16} />, onSelect: handleExportWeb },
      { id: 'pdf', label: '导出 PDF', icon: <FileDown size={16} />, onSelect: handleExportPdf },
      {
        id: 'pptx',
        label: '导出 PPTX',
        icon: <Presentation size={16} />,
        disabled: !project.surfaces.some((surface) => surface.type === 'slide'),
        onSelect: handleExportPptx,
      },
      { id: 'docx', label: '导出 DOCX', icon: <FileText size={16} />, disabled: activeSurface.type !== 'flow', onSelect: handleExportDocx },
      { id: 'differences', label: '查看导出差异', icon: <Download size={16} />, onSelect: () => setDifferencesOpen((open) => !open) },
    ],
  }

  const structurePanel = (
    <div className="course-outline">
      <CommitInput
        label="课程标题"
        value={project.title}
        disabled={mode === 'playback'}
        onCommit={(title) => commit((current) => updateCourseProject(current, (draft) => {
          draft.title = title.trim() || '未命名课程'
        }))}
      />
      <div className="course-outline__add" aria-label="添加课程内容">
        <StudioButton disabled={mode === 'playback'} onClick={() => addSurface('slide')}>+ 幻灯片</StudioButton>
        <StudioButton disabled={mode === 'playback'} onClick={() => addSurface('flow')}>+ 讲义</StudioButton>
        <StudioButton disabled={mode === 'playback'} onClick={() => addSurface('spatial-2d')}>+ 空间</StudioButton>
      </div>
      <nav aria-label="课件内容结构">
        {project.surfaces.map((surface) => (
          <section key={surface.id} className={surface.id === activeSurface.id ? 'is-active' : ''}>
            <button type="button" className="course-surface-row" onClick={() => selectSurface(surface)}>
              <span className={`course-surface-badge is-${surface.type}`}>{surfaceLabel(surface.type)}</span>
              <span>{surface.title}</span>
            </button>

            {surface.id === activeSurface.id && surface.type === 'slide' && (
              <div className="course-outline__children">
                {surface.scenes.map((scene, index) => (
                  <div className="course-scene-row" key={scene.id}>
                    <button
                      type="button"
                      className={`course-scene-row__select${scene.id === activeSceneId ? ' is-current' : ''}`}
                      onClick={() => activateScene(surface.id, scene.id)}
                    >
                      <CourseSceneThumbnail
                        scene={scene}
                        sharedLayerItems={[...project.globalLayerItems, ...surface.surfaceLayerItems]}
                        locationId={authoredSlideLocation(
                          project,
                          surface.id,
                          scene.id,
                          scene.presentation?.thumbnailStateId ?? scene.presentation?.initialStateId,
                        )?.id}
                        resolveAsset={resolveAsset}
                        width={72}
                      />
                      <span>{scene.name}</span>
                    </button>
                    <div className="course-scene-row__actions">
                      <StudioButton aria-label={`复制场景“${scene.name}”`} title="复制场景" disabled={mode === 'playback'} onClick={() => duplicateScene(surface, scene.id)}>
                        <Copy size={13} aria-hidden="true" />
                      </StudioButton>
                      <StudioButton aria-label={`上移场景“${scene.name}”`} title="上移场景" disabled={mode === 'playback' || index === 0} onClick={() => moveScene(surface, scene.id, -1)}>
                        <ArrowUp size={13} aria-hidden="true" />
                      </StudioButton>
                      <StudioButton aria-label={`下移场景“${scene.name}”`} title="下移场景" disabled={mode === 'playback' || index === surface.scenes.length - 1} onClick={() => moveScene(surface, scene.id, 1)}>
                        <ArrowDown size={13} aria-hidden="true" />
                      </StudioButton>
                      <StudioButton aria-label={`删除场景“${scene.name}”`} title="删除场景" disabled={mode === 'playback' || surface.scenes.length <= 1} className="is-danger" onClick={() => removeScene(surface, scene.id)}>
                        <Trash2 size={13} aria-hidden="true" />
                      </StudioButton>
                    </div>
                  </div>
                ))}
                <StudioButton className="course-outline__add-scene" disabled={mode === 'playback'} onClick={() => addScene(surface)}>+ 新建场景</StudioButton>
              </div>
            )}

            {surface.id === activeSurface.id && surface.type === 'flow' && (
              <div className="course-outline__children course-flow-toc">
                {flattenFlowBlocks(surface.blocks).filter(blockMatchesHeading).map((block) => (
                  <button
                    type="button"
                    key={block.id}
                    onClick={() => {
                      const location = project.locations.find((candidate) => (
                        candidate.kind === 'flow-block' &&
                        candidate.surfaceId === surface.id &&
                        candidate.blockId === block.id
                      ))
                      if (location) playbackSession.authorActivate(location)
                      else {
                        setSelection({ kind: 'flow-block', id: block.id, surfaceId: surface.id })
                        setSelectedLayerItemIds([])
                      }
                    }}
                  >
                    {'·'.repeat(block.level)} {block.text}
                  </button>
                ))}
                {flattenFlowBlocks(surface.blocks).filter(blockMatchesHeading).length === 0 && (
                  <p className="course-outline__empty">添加标题后会在这里形成目录。</p>
                )}
              </div>
            )}

            {surface.id === activeSurface.id && surface.type === 'spatial-2d' && (
              <div className="course-outline__children">
                <SpatialTeachingPathPanel
                  surface={surface}
                  camera={camera ?? surface.camera.home}
                  disabled={mode === 'playback'}
                  onGoHome={() => setCameraBySurface((current) => ({
                    ...current,
                    [surface.id]: surface.camera.home,
                  }))}
                  onSetHome={() => {
                    if (!camera) return
                    if (commit((current) => setSpatialHomeCamera(current, surface.id, camera))) {
                      setStatus('已将当前画面设为首页')
                    }
                  }}
                  onSaveFrame={(name) => {
                    if (!camera) return
                    if (commit((current) => addSpatialCameraFrame(current, surface.id, camera, {
                      ...(name ? { name } : {}),
                    }))) setStatus('已将当前画面加入教学路径')
                  }}
                  onRenameFrame={(frameId, name) => {
                    if (commit((current) => renameSpatialCameraFrame(current, surface.id, frameId, name))) {
                      setStatus(`镜头已重命名为“${name}”`)
                    }
                  }}
                  onMoveFrame={(frameId, toIndex) => {
                    const ids = surface.camera.frames.map((frame) => frame.id)
                    const fromIndex = ids.indexOf(frameId)
                    if (fromIndex < 0 || toIndex < 0 || toIndex >= ids.length || fromIndex === toIndex) return
                    ids.splice(toIndex, 0, ids.splice(fromIndex, 1)[0]!)
                    if (commit((current) => reorderSpatialCameraFrames(current, surface.id, ids))) {
                      setStatus('教学路径顺序已更新')
                    }
                  }}
                  onDeleteFrame={(frameId) => {
                    const frame = surface.camera.frames.find((candidate) => candidate.id === frameId)
                    if (!frame || !window.confirm(`从教学路径中删除镜头“${frame.name}”？`)) return
                    if (commit((current) => deleteSpatialCameraFrame(current, surface.id, frameId))) {
                      reconcileStudioToProject(projectRef.current, {
                        preferredSurfaceId: surface.id,
                      })
                      setStatus(`已删除镜头“${frame.name}”`)
                    }
                  }}
                  onLocateFrame={(frame) => {
                    const location = project.locations.find((candidate) => (
                      candidate.kind === 'spatial-camera' &&
                      candidate.surfaceId === surface.id &&
                      candidate.cameraFrameId === frame.id
                    ))
                    if (location) playbackSession.authorActivate(location)
                    setCameraBySurface((current) => ({ ...current, [surface.id]: frame }))
                    setStatus(`已定位到“${frame.name}”`)
                  }}
                />
              </div>
            )}
          </section>
        ))}
      </nav>
    </div>
  )

  const workspaceTools = (
    <div className="course-center__tools">
      <span className="course-center__surface-name">
        {surfaceLabel(activeSurface.type)}
        {activeScene ? ` · ${activeScene.name}` : ''}
      </span>
      {activeSurface.type === 'flow' && (
        <input
          className="course-center__search"
          aria-label="搜索讲义内容"
          placeholder="搜索讲义内容……"
          value={flowSearch}
          onChange={(event) => setFlowSearch(event.target.value)}
        />
      )}
      {activeSurface.type === 'spatial-2d' && (
        <>
          <span>{Math.round((camera?.zoom ?? 1) * 100)}%</span>
          <StudioButton onClick={() => setCameraBySurface((current) => ({
            ...current,
            [activeSurface.id]: activeSurface.camera.home,
          }))}>
            <Home size={14} aria-hidden="true" /> 回到首页镜头
          </StudioButton>
          <StudioButton
            title="让全部空间内容进入当前画面"
            onClick={() => {
              const fittedItems = activeSurfaceLocationId
                ? getEffectiveCourseLayerOrder({
                    project,
                    surfaceId: activeSurface.id,
                    locationId: activeSurfaceLocationId,
                  }).map((entry) => entry.item)
                : effectiveLayerEntries.map((entry) => entry.item)
              const fitted = fitSpatialSurfaceCamera(activeSurface, 36, fittedItems)
              setCameraBySurface((current) => ({
                ...current,
                [activeSurface.id]: fitted,
              }))
              setStatus('已适配全部空间内容')
            }}
          >
            <Maximize2 size={14} aria-hidden="true" /> 适配全部内容
          </StudioButton>
        </>
      )}
      <span className="course-center__mode-note">
        {mode === 'inspect'
          ? '当前画面已冻结，可直接选择和编辑'
          : '正在试运行；返回编辑时保留当前画面'}
      </span>
    </div>
  )

  const workspace = (
    <div className="course-canvas-shell" ref={courseCanvasRootRef}>
      {activeSurface.type === 'slide' && activeSceneId && (
        <SlideCourseCanvas
          surface={activeSurface}
          sceneId={activeSceneId}
          locationId={activeSurfaceLocationId}
          presentationStateId={activeReviewStateId}
          mode={mode}
          selectedLayerItemId={selection?.kind === 'layer' ? selection.id : null}
          selectedLayerItems={selectedLayerItems}
          resolveAsset={resolveAsset}
          componentHostFactory={dynamicHosts.componentHost}
          runtimeHostFactory={dynamicHosts.runtimeHost}
          globalLayerItems={project.globalLayerItems}
          interactionEvents={courseEvents}
          executeAudioAction={executeAudioAction}
          interactionActions={{
            goToScene: (sceneId, stateId) => playbackSession.goToScene(sceneId, stateId, 'runtime'),
            nextScene: () => playbackSession.next('runtime'),
            previousScene: () => playbackSession.previous('runtime'),
            replayScene: () => playbackSession.replay(),
            restartCourse: () => playbackSession.restart(),
          }}
          onHostReady={handleSlideHostReady}
          onInteractionReady={handleInteractionReady}
          beforeTeacherControllerAction={handleTeacherAction}
          teacherControllerProgressText={teacherControllerProgressText}
          onTeacherControllerAction={handleTeacherSideEffect}
          onLayerHit={selectCanvasLayer}
          onLayerSelectionChange={selectCanvasLayers}
          onLayerTransformCommit={handleLayerTransformCommit}
          onNativeTextCommit={handleNativeTextCommit}
          onError={setError}
        />
      )}

      {activeSurface.type === 'flow' && (
        <FlowCourseCanvas
          surface={activeSurface}
          mode={mode}
          selectedBlockId={selection?.kind === 'flow-block' ? selection.id : null}
          selectedLayerItemId={selection?.kind === 'layer' ? selection.id : null}
          selectedLayerItems={selectedLayerItems}
          search={flowSearch}
          resolveAsset={resolveAsset}
          renderComponent={renderFlowComponent}
          componentHostFactory={dynamicHosts.componentHost}
          runtimeHostFactory={dynamicHosts.runtimeHost}
          globalLayerItems={project.globalLayerItems}
          locationId={playbackSession.currentLocationId}
          beforeTeacherControllerAction={handleTeacherAction}
          teacherControllerProgressText={teacherControllerProgressText}
          onTeacherControllerAction={handleTeacherSideEffect}
          onLayerHit={selectCanvasLayer}
          onLayerSelectionChange={selectCanvasLayers}
          onLayerTransformCommit={handleLayerTransformCommit}
          onNativeTextCommit={handleNativeTextCommit}
          onBlockMove={handleFlowBlockMove}
          onComponentHit={(id, detail) => {
            if (mode !== 'inspect') return
            activateFlowBlockSelection(activeSurface.id, id)
            setSelection({
              kind: 'flow-block',
              id,
              surfaceId: activeSurface.id,
              ...(detail?.field ? { field: detail.field } : {}),
              ...(detail?.hitId ? { hitId: detail.hitId } : {}),
              ...(detail?.targetKind ? { targetKind: detail.targetKind } : {}),
            })
            setInspectorTab('properties')
          }}
          onSelect={(id) => {
            if (mode !== 'inspect') return
            activateFlowBlockSelection(activeSurface.id, id)
            setInspectorTab('properties')
          }}
          onEdit={editFlow}
          onError={setError}
        />
      )}

      {activeSurface.type === 'spatial-2d' && camera && (
        <SpatialCourseCanvas
          surface={activeSurface}
          mode={mode}
          camera={camera}
          selectedLayerItemId={selection?.kind === 'layer' ? selection.id : null}
          selectedLayerItems={selectedLayerItems}
          resolveAsset={resolveAsset}
          componentHostFactory={dynamicHosts.componentHost}
          runtimeHostFactory={dynamicHosts.runtimeHost}
          globalLayerItems={project.globalLayerItems}
          teacherControllerProgressText={teacherControllerProgressText}
          onTeacherControllerAction={handleSpatialTeacherAction}
          locationId={activeSurfaceLocationId}
          onCameraChange={(next) => setCameraBySurface((current) => ({
            ...current,
            [activeSurface.id]: next,
          }))}
          onSelect={(id) => {
            if (mode !== 'inspect') return
            if (!id) {
              setSelectedLayerItemIds([])
              if (selection?.kind === 'layer') setSelection(null)
              return
            }
            selectLayerIds([id])
          }}
          onLayerHit={selectCanvasLayer}
          onLayerSelectionChange={selectCanvasLayers}
          onLayerTransformCommit={handleLayerTransformCommit}
          onNativeTextCommit={handleNativeTextCommit}
          onMove={(id, dx, dy, source) => commit((current) => updateLayerItem(current, {
            surfaceId: activeSurface.id,
            layerItemId: id,
            source,
          }, (item) => {
            if (item.locked) throw new Error(`图层“${item.label}”已锁定，不能移动。`)
            item.frame.x += dx
            item.frame.y += dy
          }))}
          onError={setError}
        />
      )}
    </div>
  )

  const elementsPanel = (
    <CourseElementPalette
      surfaceType={activeSurface.type}
      disabled={mode === 'playback'}
      teacherControllerPresent={project.globalLayerItems.some(({ item }) => (
        item.kind === 'native' && item.content.nativeType === 'teacher-controller'
      ))}
      onAction={handleElementAction}
      components={Object.values(parsedComponentPackages).map((pkg) => ({
        packageId: pkg.manifest.id,
        version: pkg.manifest.version,
        name: pkg.manifest.name,
        description: pkg.manifest.description,
        disabled: !pkg.manifest.supportedScopes.includes('scene'),
        disabledReason: !pkg.manifest.supportedScopes.includes('scene')
          ? '该组件没有声明可插入课程内容'
          : undefined,
      }))}
    />
  )

  const layersPanel = (
    <CourseLayerPanel
      entries={effectiveLayerEntries}
      selectedIds={selectedLayerItemIds}
      disabled={mode === 'playback'}
      onSelectionChange={selectLayerIds}
      onToggleVisible={(entry, visible) => updateLayerFlag(entry, 'visible', visible)}
      onToggleLocked={(entry, locked) => updateLayerFlag(entry, 'locked', locked)}
      onReorder={reorderLayer}
      onDuplicate={duplicateLayers}
      onDelete={deleteLayers}
    />
  )

  const propertiesPanel = (
    <div className="course-inspector" aria-label="属性">
      <h2>{activeSurface.title}</h2>
      <CommitInput
        label="内容名称"
        value={activeSurface.title}
        disabled={mode === 'playback'}
        onCommit={(title) => commit((current) => renameCourseSurface(
          current,
          activeSurface.id,
          title.trim() || surfaceLabel(activeSurface.type),
        ))}
      />
      {project.surfaces.length > 1 && (
        <StudioButton
          className="is-danger"
          disabled={mode === 'playback'}
          onClick={() => {
            if (!window.confirm(`删除“${activeSurface.title}”及其中全部内容？`)) return
            if (commit((current) => deleteCourseSurface(current, activeSurface.id))) {
              reconcileStudioToProject(projectRef.current, {
                preferredLocationId: projectRef.current.startLocationId,
              })
            }
          }}
        >
          删除当前内容
        </StudioButton>
      )}

      {activeSurface.type === 'spatial-2d' && (
        <SpatialRelationsEditor
          surface={activeSurface}
          selectedLayerItemIds={selectedLayerItemIds}
          disabled={mode === 'playback'}
          onCreate={({ sourceLayerItemId, targetLayerItemId, name }) => {
            const suffix = nanoid(10)
            const lineLayerItemId = `relation-line-${suffix}`
            const labelLayerItemId = `relation-label-${suffix}`
            if (!commit((current) => addSpatialRelation(current, activeSurface.id, {
              id: `relation-${suffix}`,
              sourceLayerItemId,
              targetLayerItemId,
              name,
              lineLayerItemId,
              labelLayerItemId,
            }))) return
            setSelectedLayerItemIds([lineLayerItemId])
            setSelection({
              kind: 'layer',
              id: lineLayerItemId,
              carrier: 'native',
              source: 'world',
              surfaceId: activeSurface.id,
            })
            setStatus(`已添加关系“${name}”，连线可继续按普通图层调整`)
          }}
          onUpdate={(relationId, update: SpatialRelationUpdate) => {
            if (commit((current) => updateSpatialRelation(
              current,
              activeSurface.id,
              relationId,
              (relation) => {
                if (update.name !== undefined) relation.name = update.name
                if (update.sourceLayerItemId !== undefined) relation.sourceLayerItemId = update.sourceLayerItemId
                if (update.targetLayerItemId !== undefined) relation.targetLayerItemId = update.targetLayerItemId
              },
            ))) setStatus('关系与连线已更新')
          }}
          onSelectVisual={(layerItemId) => selectLayerIds([layerItemId])}
          onDelete={(relationId) => {
            const relation = activeSurface.relations.find((candidate) => candidate.id === relationId)
            if (!relation || !window.confirm(`删除关系“${relation.name}”及其连线和文字？`)) return
            if (commit((current) => deleteSpatialRelation(current, activeSurface.id, relationId))) {
              setSelectedLayerItemIds((current) => current.filter((id) => (
                id !== relation.lineLayerItemId && id !== relation.labelLayerItemId
              )))
              setSelection((current) => current?.kind === 'layer' && (
                current.id === relation.lineLayerItemId || current.id === relation.labelLayerItemId
              ) ? null : current)
              setStatus(`已删除关系“${relation.name}”`)
            }
          }}
        />
      )}

      {activeSurface.type === 'flow' && selectedBlock && (
        <FlowBlockInspector
          block={selectedBlock}
          index={selectedBlockLocation?.siblings.indexOf(selectedBlock) ?? -1}
          count={selectedBlockLocation?.siblings.length ?? 0}
          disabled={mode === 'playback'}
          onChange={(nextBlock) => commit((current) => applyFlowBlockEditorChange(
            current,
            activeSurface.id,
            selectedBlock,
            nextBlock,
          ))}
          onMove={(toIndex) => commit((current) => selectedBlockLocation?.parentSectionId
            ? reorderNestedFlowBlock(current, activeSurface.id, selectedBlock.id, toIndex)
            : reorderFlowBlock(current, activeSurface.id, selectedBlock.id, toIndex))}
          onDuplicate={() => commit((current) => selectedBlockLocation?.parentSectionId
            ? duplicateNestedFlowBlock(current, activeSurface.id, selectedBlock.id)
            : duplicateFlowBlock(current, activeSurface.id, selectedBlock.id))}
          onDelete={() => {
            if (!window.confirm('删除所选内容块？')) return
            if (commit((current) => selectedBlockLocation?.parentSectionId
              ? deleteNestedFlowBlock(current, activeSurface.id, selectedBlock.id)
              : deleteFlowBlock(current, activeSurface.id, selectedBlock.id))) {
              reconcileStudioToProject(projectRef.current, {
                preferredSurfaceId: activeSurface.id,
              })
            }
          }}
          resolveAsset={resolveAsset}
          onReplaceMedia={replaceFlowBlockMedia}
          componentName={selectedBlock.type === 'component'
            ? project.componentPackages[selectedBlock.component.packageId]?.name
            : undefined}
          componentChoices={Object.values(parsedComponentPackages)
            .filter((pkg) => pkg.manifest.supportedScopes.includes('scene'))
            .map((pkg) => ({
              packageId: pkg.manifest.id,
              version: pkg.manifest.version,
              name: pkg.manifest.name,
            }))}
          onReplaceComponent={(block, choice) => replaceSelectedFlowComponent(
            block,
            choice.packageId,
            choice.version,
          )}
          onReplaceComponentFallback={replaceFlowComponentPreview}
          authoringFields={selectedAuthoringFields}
        />
      )}

      {selectedItem && layerContext && (
        <LayerInspector
          item={selectedItem}
          disabled={mode === 'playback'}
          onChange={changeLayer}
          onMove={(toIndex) => commit((current) => reorderLayerItem(current, {
            ...layerContext,
            toIndex,
          }))}
          index={effectiveLayerEntries.findIndex(({ item }) => item.layerItemId === selectedItem.layerItemId)}
          count={effectiveLayerEntries.length}
          onDuplicate={() => commit((current) => duplicateLayerItem(current, layerContext))}
          onDelete={() => {
            if (!window.confirm(`删除图层“${selectedItem.label}”？`)) return
            if (commit((current) => deleteLayerItem(current, layerContext))) {
              setSelection(null)
              setSelectedLayerItemIds((current) => current.filter((id) => id !== selectedItem.layerItemId))
            }
          }}
          selectedAuthoringField={selectedAuthoringField}
          selectedField={selection?.field}
          selectedTargetKind={selection?.targetKind}
          onReplaceAsset={replaceSelectedAsset}
        />
      )}

      {!selectedItem && !selectedBlock && (
        <p className="course-empty">在画布或“图层”中选择内容后，可在这里调整属性。</p>
      )}
    </div>
  )

  const interactionPanel = (
    <div className="course-inspector course-interaction-panel" aria-label="互动">
      <section className="course-interaction-state">
        <h3>当前状态</h3>
        <strong>{mode === 'inspect' ? '编辑当前帧' : '试运行中'}</strong>
        <p>
          {mode === 'inspect'
            ? '互动已经暂停，画布保留试运行后的画面。可选中并调整当前可编辑内容。'
            : '课件互动正在真实运行。返回编辑时会冻结并保留当前画面。'}
        </p>
      </section>

      <CourseSoundLibrary
        audio={project.media.audio}
        disabled={mode === 'playback'}
        resolveAsset={resolveAsset}
        references={(soundId) => courseSoundReferences(project, soundId)}
        onImport={importCourseSound}
        onUpdate={changeCourseSound}
        onDelete={removeCourseSound}
      />

      {activeSurface.type === 'slide' && activeScene && activeSceneId && (
        <V9InteractionEditor
          project={project}
          surface={activeSurface}
          scene={activeScene}
          layerEntries={effectiveLayerEntries}
          selectedLayerItemId={selection?.kind === 'layer' ? selection.id : null}
          disabled={mode === 'playback'}
          onCommit={(rules, message) => {
            if (commit((current) => replaceSlideSceneInteractions(
              current,
              activeSurface.id,
              activeSceneId,
              rules,
            ))) setStatus(message)
          }}
        />
      )}

      <V9CourseLogicEditor
        project={project}
        activeSurface={activeSurface}
        activeScene={activeScene}
        layerEntries={effectiveLayerEntries}
        selectedLayerItemId={selection?.kind === 'layer' ? selection.id : null}
        disabled={mode === 'playback'}
        onCommit={(operation, message) => {
          if (commit(operation)) setStatus(message)
        }}
      />

      {activeSurface.type === 'slide' && activeScene && activeSceneId && (
        <section className="course-properties">
          <h3>命名复核画面</h3>
          <p className="course-empty">保存一个可再次切换的画面，用于复核互动后的布局与显隐。</p>
          <div className="course-review-states" role="group" aria-label="命名复核画面">
            {activeScene.presentation?.states.map((state) => (
              <button
                type="button"
                key={state.id}
                className={state.id === activeReviewStateId ? 'is-current' : ''}
                aria-pressed={state.id === activeReviewStateId}
                onClick={() => {
                  if (playbackSession.setPresentationState(activeSurface.id, state.id)) {
                    setStatus(`已切换到复核画面“${state.name}”`)
                  }
                }}
              >
                {state.name}{state.id === activeScene.presentation?.initialStateId ? ' · 初始' : ''}
              </button>
            ))}
            {(activeScene.presentation?.states.length ?? 0) === 0 && <span>尚未保存复核画面。</span>}
          </div>
          <div className="course-property-actions">
            <StudioButton
              disabled={mode === 'playback'}
              onPointerDownCapture={stageNamedReviewFrame}
              onClick={saveNamedReviewState}
            >
              保存当前画面
            </StudioButton>
            <StudioButton disabled={mode === 'playback' || !activeReviewStateId} onClick={renameActiveReviewState}>重命名</StudioButton>
            <StudioButton
              disabled={mode === 'playback' || !activeReviewStateId || activeScene.presentation?.initialStateId === activeReviewStateId}
              onClick={makeActiveReviewStateInitial}
            >
              设为初始
            </StudioButton>
            <StudioButton className="is-danger" disabled={mode === 'playback' || !activeReviewStateId} onClick={removeActiveReviewState}>删除</StudioButton>
          </div>
        </section>
      )}

      {activeSurface.type === 'spatial-2d' && (
        <SemanticZoomInspector
          surface={activeSurface}
          selectedLayerItemId={selection?.kind === 'layer' ? selection.id : null}
          disabled={mode === 'playback'}
          onAdd={(layerItemId) => commit((current) => addSpatialSemanticZoomRule(current, activeSurface.id, {
            layerItemIds: [layerItemId],
            minZoom: 0,
            maxZoom: Math.max(1.01, (camera?.zoom ?? 1) * 1.5),
          }))}
          onUpdate={(ruleId, field, value) => commit((current) => updateSpatialSemanticZoomRule(
            current,
            activeSurface.id,
            ruleId,
            (rule) => {
              if (field === 'visible') rule.visible = Boolean(value)
              else rule[field] = Number(value)
            },
          ))}
          onDelete={(ruleId) => commit((current) => deleteSpatialSemanticZoomRule(current, activeSurface.id, ruleId))}
        />
      )}

    </div>
  )

  const developerPanel = (
    <div className="course-inspector course-developer-panel" aria-label="开发与 AI 精确修改">
      <h2>AI 精确修改</h2>
      <p className="course-empty">选择画布目标后，再选择精确字段。复制的稳定引用可跨保存定位；临时命中编号不参与定位。</p>
      {selection ? (
        <>
          <AuthoringFieldPicker
            fields={selectedAuthoringFields}
            value={selection.field}
            onChange={selectAuthoringField}
          />
          {selectedAuthoringField && (
            <AuthoringValueEditor
              entry={{
                ...selectedAuthoringField,
                valueKind: selection.targetKind === 'asset' ? 'asset' : selectedAuthoringField.valueKind,
                disabled: mode === 'playback',
              }}
              onCommit={(next) => commitAuthoringValue(selectedAuthoringField, next)}
              onReplaceAsset={replaceSelectedAsset}
            />
          )}
          <StudioButton disabled={!currentAiReference} onClick={() => void copyAiReference()}>
            复制 AI 稳定引用
          </StudioButton>
          {currentAiReference && (
            <div className="course-developer-address">
              <span>稳定地址</span>
              <code>{currentAiReference.authoringAddress}</code>
            </div>
          )}
        </>
      ) : (
        <p className="course-empty">请先在画布或图层中选择内容。</p>
      )}
      <details className="course-developer-facts">
        <summary>工程字段</summary>
        <dl>
          <div><dt>工程 ID</dt><dd><code>{project.id}</code></dd></div>
          <div><dt>修订</dt><dd>{project.revision}</dd></div>
          <div><dt>当前文件</dt><dd><code>{projectPath ?? '尚未保存'}</code></dd></div>
          {selection && <div><dt>当前目标</dt><dd><code>{selection.id}</code></dd></div>}
        </dl>
      </details>
      {developerDiagnostics.length > 0 && (
        <details className="course-developer-facts">
          <summary>运行诊断</summary>
          <ol>
            {developerDiagnostics.map((message, index) => (
              <li key={`${index}:${message}`}><code>{message}</code></li>
            ))}
          </ol>
        </details>
      )}
    </div>
  )

  return (
    <div
      className="course-studio-root"
      data-testid="course-studio-v9"
      data-active-surface-id={activeSurface.id}
      data-active-scene-id={activeSceneId}
      data-current-location-id={playbackSession.currentLocationId}
    >
      <V9EditorShell
        mode={editorMode}
        onModeChange={(nextMode) => {
          setEditorMode(nextMode)
          if (nextMode === 'simple' && inspectorTab === 'developer') setInspectorTab('properties')
        }}
        projectTitle={project.title}
        projectMeta={`${surfaceLabel(activeSurface.type)}${activeScene ? ` · ${activeScene.name}` : ''}`}
        dirty={dirty}
        busy={busy}
        toolbar={toolbar}
        structureTitle="课程结构"
        structure={structurePanel}
        workspaceTools={workspaceTools}
        workspace={workspace}
        activeInspectorTab={inspectorTab}
        onInspectorTabChange={setInspectorTab}
        inspectorPanels={{
          elements: elementsPanel,
          layers: layersPanel,
          properties: propertiesPanel,
          interaction: interactionPanel,
          developer: developerPanel,
        }}
        status={(
          <span className="course-status" aria-live="polite">
            {busy ? '正在处理……' : status}
            <span className="course-status__path"> · {projectPath ?? '尚未保存'}</span>
          </span>
        )}
        selectionStatus={selection?.kind === 'layer'
          ? `${selectedLayerItemIds.length || 1} 个图层`
          : selection?.kind === 'flow-block' && selectedBlock
            ? `已选：${selectedBlock.type === 'media' ? '媒体' : selectedBlock.type === 'component' ? '互动组件' : '内容块'}`
            : '未选择内容'}
        viewportStatus={activeSurface.type === 'spatial-2d'
          ? `${Math.round((camera?.zoom ?? 1) * 100)}%`
          : surfaceLabel(activeSurface.type)}
        professionalStatus={`修订 ${project.revision}`}
      />

      {differencesOpen && (
        <ExportDifferencePanel
          differences={differences}
          notes={lastExportNotes}
          onClose={() => setDifferencesOpen(false)}
        />
      )}
      {error && (
        <div className="course-toast" role="alert">
          <pre>{error}</pre>
          <button type="button" aria-label="关闭错误" onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  )
}

function SemanticZoomInspector({
  surface,
  selectedLayerItemId,
  disabled,
  onAdd,
  onUpdate,
  onDelete,
}: {
  surface: SpatialSurfaceDocument
  selectedLayerItemId: string | null
  disabled: boolean
  onAdd(layerItemId: string): void
  onUpdate(ruleId: string, field: 'minZoom' | 'maxZoom' | 'visible', value: number | boolean): void
  onDelete(ruleId: string): void
}) {
  return (
    <section className="course-properties">
      <h3>语义缩放</h3>
      <p className="course-empty">按镜头缩放范围决定节点是否可见，运行与导出共用同一规则。</p>
      <StudioButton disabled={disabled || !selectedLayerItemId} onClick={() => selectedLayerItemId && onAdd(selectedLayerItemId)}>
        + 为所选图层添加规则
      </StudioButton>
      {surface.semanticZoom.map((rule) => (
        <div className="course-semantic-rule" key={rule.id}>
          <strong>{rule.layerItemIds.length} 个图层</strong>
          <div className="course-field-grid">
            <CommitInput label="最小缩放" type="number" value={rule.minZoom} disabled={disabled} onCommit={(value) => onUpdate(rule.id, 'minZoom', Number(value))} />
            <CommitInput label="最大缩放" type="number" value={rule.maxZoom} disabled={disabled} onCommit={(value) => onUpdate(rule.id, 'maxZoom', Number(value))} />
          </div>
          <label className="course-check"><input type="checkbox" checked={rule.visible} disabled={disabled} onChange={(event) => onUpdate(rule.id, 'visible', event.target.checked)} />范围内可见</label>
          <StudioButton className="is-danger" disabled={disabled} onClick={() => onDelete(rule.id)}>删除规则</StudioButton>
        </div>
      ))}
    </section>
  )
}

function FlowBlockInspector({
  block,
  index,
  count,
  disabled,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  resolveAsset,
  onReplaceMedia,
  componentName,
  componentChoices,
  onReplaceComponent,
  onReplaceComponentFallback,
  authoringFields,
}: {
  block: FlowBlock
  index: number
  count: number
  disabled: boolean
  onChange(next: FlowBlock): void
  onMove(index: number): void
  onDuplicate(): void
  onDelete(): void
  resolveAsset(assetId: string): string | undefined
  onReplaceMedia(block: Extract<FlowBlock, { type: 'media' }>): void
  componentName?: string
  componentChoices: readonly FlowComponentChoice[]
  onReplaceComponent(
    block: Extract<FlowBlock, { type: 'component' }>,
    choice: FlowComponentChoice,
  ): void
  onReplaceComponentFallback(block: Extract<FlowBlock, { type: 'component' }>): void
  authoringFields: SelectedAuthoringField[]
}) {
  const componentPropLabels = Object.fromEntries(authoringFields.flatMap((entry) => {
    if (!entry.field.startsWith('props/')) return []
    const path = entry.field
      .slice('props/'.length)
      .split('/')
      .map((segment) => segment.replace(/~1/gu, '/').replace(/~0/gu, '~'))
      .join('.')
    return [[path, entry.label]]
  }))
  return (
    <section className="course-properties">
      <FlowBlockEditor
        block={block}
        disabled={disabled}
        onChange={onChange}
        resolveAssetUrl={resolveAsset}
        onRequestReplaceMedia={onReplaceMedia}
        componentName={componentName}
        resolveComponentName={(componentBlock) => componentChoices.find((choice) => (
          choice.packageId === componentBlock.component.packageId &&
          choice.version === componentBlock.component.version
        ))?.name}
        componentChoices={componentChoices}
        onRequestReplaceComponent={onReplaceComponent}
        onRequestReplaceComponentFallback={onReplaceComponentFallback}
        componentPropLabels={componentPropLabels}
      />
      <div className="course-property-actions">
        <StudioButton disabled={disabled || index <= 0} onClick={() => onMove(index - 1)}>上移</StudioButton>
        <StudioButton disabled={disabled || index >= count - 1} onClick={() => onMove(index + 1)}>下移</StudioButton>
        <StudioButton disabled={disabled} onClick={onDuplicate}>复制</StudioButton>
        <StudioButton disabled={disabled} className="is-danger" onClick={onDelete}>删除</StudioButton>
      </div>
    </section>
  )
}

function LayerInspector({
  item,
  disabled,
  index,
  count,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  selectedAuthoringField,
  selectedField,
  selectedTargetKind,
  onReplaceAsset,
}: {
  item: LayerItem
  disabled: boolean
  index: number
  count: number
  onChange(update: (item: LayerItem) => void): void
  onMove(index: number): void
  onDuplicate(): void
  onDelete(): void
  selectedAuthoringField?: SelectedAuthoringField
  selectedField?: string
  selectedTargetKind?: 'text' | 'asset'
  onReplaceAsset(field: string): void
}) {
  return (
    <section className="course-properties">
      <h3>{LAYER_KIND_LABELS[item.kind]}属性</h3>
      <CommitInput label="图层名称" value={item.label} disabled={disabled} onCommit={(value) => onChange((draft) => { draft.label = value })} />
      <div className="course-field-grid">
        {(['x', 'y', 'width', 'height'] as const).map((field) => (
          <CommitInput key={field} label={{ x: '水平位置', y: '垂直位置', width: '宽度', height: '高度' }[field]} type="number" value={Math.round(item.frame[field] * 100) / 100} disabled={disabled} onCommit={(value) => onChange((draft) => {
            const number = Number(value)
            if (Number.isFinite(number)) draft.frame[field] = field === 'width' || field === 'height' ? Math.max(1, number) : number
          })} />
        ))}
        <CommitInput label="旋转" type="number" value={item.rotation} disabled={disabled} onCommit={(value) => onChange((draft) => { const number = Number(value); if (Number.isFinite(number)) draft.rotation = number })} />
        <CommitInput label="不透明度" type="number" value={item.opacity} disabled={disabled} onCommit={(value) => onChange((draft) => { const number = Number(value); if (Number.isFinite(number)) draft.opacity = Math.max(0, Math.min(1, number)) })} />
      </div>
      {item.kind === 'native'
        ? <NativeLayerContentEditor item={item} disabled={disabled} onChange={onChange} onReplaceAsset={onReplaceAsset} />
        : <DynamicLayerContentEditor
            item={item}
            disabled={disabled}
            selectedField={selectedField}
            selectedLabel={selectedAuthoringField?.label}
            selectedTargetKind={selectedTargetKind}
            onChange={onChange}
            onReplaceAsset={onReplaceAsset}
          />}
      <label className="course-check"><input type="checkbox" checked={item.visible} disabled={disabled} onChange={(event) => onChange((draft) => { draft.visible = event.target.checked })} />可见</label>
      <label className="course-check"><input type="checkbox" checked={item.locked} disabled={disabled} onChange={(event) => onChange((draft) => { draft.locked = event.target.checked })} />锁定</label>
      <div className="course-property-actions">
        <StudioButton disabled={disabled || index >= count - 1} onClick={() => onMove(index + 1)}>上移一层</StudioButton>
        <StudioButton disabled={disabled || index <= 0} onClick={() => onMove(index - 1)}>下移一层</StudioButton>
        <StudioButton disabled={disabled} onClick={onDuplicate}>复制</StudioButton>
        <StudioButton disabled={disabled} className="is-danger" onClick={onDelete}>删除</StudioButton>
      </div>
    </section>
  )
}

function AuthoringFieldPicker({
  fields,
  value,
  onChange,
}: {
  fields: Array<{ field: string; label: string }>
  value?: string
  onChange(field: string): void
}) {
  return (
    <label className="course-field">
      <span>AI 精确字段</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择具体字段……</option>
        {fields.map((entry) => <option key={entry.field} value={entry.field}>{entry.label} · {entry.field}</option>)}
      </select>
    </label>
  )
}

function ExportDifferencePanel({
  differences,
  notes,
  onClose,
}: {
  differences: CourseExportDifference[]
  notes: string[]
  onClose(): void
}) {
  return (
    <section className="course-export-differences" aria-label="导出差异">
      <header><strong>可交付能力与差异</strong><button type="button" onClick={onClose}>关闭</button></header>
      <table>
        <thead><tr><th>内容类型</th><th>格式</th><th>处理</th><th>说明</th></tr></thead>
        <tbody>{differences.map((item) => (
          <tr key={`${item.surfaceId}:${item.target}`}>
            <td>{surfaceTeacherLabel(item.surfaceKind)}</td>
            <td>{item.target.toUpperCase()}</td>
            <td>{{ preserved: '完整保留', static: '静态画面', fallback: '使用后备内容', omitted: '不导出' }[item.disposition]}</td>
            <td>{item.detail}</td>
          </tr>
        ))}</tbody>
      </table>
      {notes.length > 0 && <details open><summary>上次导出警告</summary><ul>{notes.map((note, index) => <li key={`${index}:${note}`}>{note}</li>)}</ul></details>}
      <p>PPTX 仅转换幻灯片：可编辑文字和图形尽量保持 Office 对象，互动内容使用实际快照、后备画面或明确占位；流式讲义和空间画布不会被伪造成 PPTX 页面。</p>
    </section>
  )
}
