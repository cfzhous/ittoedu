import { nanoid } from 'nanoid'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { ComponentPackageData } from '../../shared/componentTypes'
import { CourseEventBus } from '../../player/CourseEventBus'
import {
  deriveCourseProjectAuthoringInventorySnapshot,
  getEffectiveCourseLayerOrder,
  type AuthoringInventoryValueKind,
} from '../../shared/courseProjectModel'
import type {
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
import { buildPublishedCourseStandaloneHtml } from '../export/course/buildCoursePackages'
import { buildPublishedCourseWebPackageAsync } from '../export/course/buildCoursePackages'
import { buildCoursePrintArtifacts } from '../export/course/buildCoursePrintArtifacts'
import {
  buildCoursePptx,
} from '../export/course/buildCoursePptx'
import {
  buildFlowDocx,
  type FlowDocxLayerEntry,
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
  importProjectV8ArchiveAsCourseProject,
  openCourseProjectArchiveAsync,
} from '../project/courseProjectArchive'
import {
  addCourseSurface,
  addComponentLayer,
  addFlowBlock,
  addImageLayer,
  addNativeVisualLayer,
  addSlideScene,
  addSlideTextLayer,
  addSpatialCameraFrame,
  addSpatialSemanticZoomRule,
  addSpatialTextLayer,
  applyCourseAuthoringPatch,
  commitCourseHistory,
  createCourseHistory,
  createCourseProject,
  deleteCourseSurface,
  deleteFlowBlock,
  deleteNestedFlowBlock,
  deleteLayerItem,
  deleteSpatialSemanticZoomRule,
  duplicateFlowBlock,
  duplicateNestedFlowBlock,
  insertNestedFlowBlock,
  duplicateLayerItem,
  redoCourseHistory,
  renameSlidePresentationState,
  reorderFlowBlock,
  reorderNestedFlowBlock,
  reorderLayerItem,
  saveSlidePresentationState,
  setInitialSlidePresentationState,
  deleteSlidePresentationState,
  undoCourseHistory,
  updateCourseProject,
  updateNestedFlowBlock,
  updateLayerItem,
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
  FlowCourseCanvas,
  SlideCourseCanvas,
  SpatialCourseCanvas,
  flowBlockPrimaryText,
  flattenFlowBlocks,
  selectedLayer,
  type StudioMode,
} from './CourseSurfaceCanvas'
import './course-studio.css'

interface CourseStudioAppProps {
  onOpenLegacy(): void
}

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

function surfaceLabel(type: CourseSurfaceDocument['type']): string {
  if (type === 'slide') return 'Slide'
  if (type === 'flow') return 'Flow'
  return 'Spatial'
}

function newFlowBlock(type: FlowBlock['type'], id = `block-${nanoid(10)}`): FlowBlock {
  switch (type) {
    case 'heading': return { id, type, level: 2, text: '新标题' }
    case 'paragraph': return { id, type, text: '在这里编辑正文……' }
    case 'quote': return { id, type, text: '引用内容', citation: '出处' }
    case 'list': return { id, type, ordered: false, items: [{ id: `item-${nanoid(8)}`, text: '列表项' }] }
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

function titleFromProject(project: CourseProjectDocument): string {
  return `${project.title}${project.revision > 0 ? ` · r${project.revision}` : ''}`
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
    throw new Error(`AI Patch 不是有效 UTF-8 JSON：${cause instanceof Error ? cause.message : String(cause)}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('AI Patch 根节点必须是对象')
  }
  const record = value as Record<string, unknown>
  if (record.op !== 'replace') throw new Error('AI Patch 仅支持 op="replace"')
  if (!Number.isSafeInteger(record.expectedRevision) || (record.expectedRevision as number) < 0) {
    throw new Error('AI Patch.expectedRevision 必须是非负安全整数')
  }
  if (typeof record.authoringAddress !== 'string' || !record.authoringAddress.startsWith('courseware://authoring/')) {
    throw new Error('AI Patch.authoringAddress 无效')
  }
  if (!Object.prototype.hasOwnProperty.call(record, 'value')) throw new Error('AI Patch 缺少 value')
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

function StudioButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <button type="button" {...props}>{children}</button>
}

export default function CourseStudioApp({ onOpenLegacy }: CourseStudioAppProps) {
  const [history, setHistory] = useState<CourseHistoryState>(() => createCourseHistory(createCourseProject()))
  const [assetFiles, setAssetFiles] = useState<Record<string, Uint8Array>>({})
  const [componentFiles, setComponentFiles] = useState<Record<string, Record<string, Uint8Array>>>({})
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('已进入 Course Project V9')
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<StudioMode>('inspect')
  const [activeSurfaceId, setActiveSurfaceId] = useState(() => history.present.surfaces[0]!.id)
  const [activeSceneIds, setActiveSceneIds] = useState<Record<string, string>>(() => {
    const surface = history.present.surfaces[0]
    const sceneId = defaultSceneId(surface)
    return sceneId ? { [surface!.id]: sceneId } : {}
  })
  const [reviewStateIds, setReviewStateIds] = useState<Record<string, string>>({})
  const [cameraBySurface, setCameraBySurface] = useState<Record<string, SpatialCameraPose>>({})
  const [selection, setSelection] = useState<Selection>(null)
  const [flowSearch, setFlowSearch] = useState('')
  const [flowInsertType, setFlowInsertType] = useState<FlowBlock['type']>('paragraph')
  const [differencesOpen, setDifferencesOpen] = useState(false)
  const [lastExportNotes, setLastExportNotes] = useState<string[]>([])
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
  const assetUrlsRef = useRef(assetUrls)
  const slideHostRef = useRef<SlideSurfaceHost | null>(null)
  const pendingReviewFrameRef = useRef<{
    sceneId: string
    sourceState?: SlidePresentationState
    snapshot: SlideReviewFrameSnapshot
  } | null>(null)
  const playbackSessionRef = useRef<CourseStudioPlaybackSession | null>(null)
  projectRef.current = project
  activeSurfaceIdRef.current = activeSurfaceId
  activeSceneIdsRef.current = activeSceneIds
  assetUrlsRef.current = assetUrls

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
  })
  const playbackSession = useMemo(() => {
    const previous = playbackSessionRef.current
    const next = new CourseStudioPlaybackSession(project, {
    getActiveSurfaceId: () => activeSurfaceIdRef.current,
    getActiveSceneId: (surfaceId) => activeSceneIdsRef.current[surfaceId],
    activateLocation: (location) => {
      setActiveSurfaceId(location.surfaceId)
      setSelection(null)
      if (location.kind === 'slide-scene') {
        setActiveSceneIds((current) => ({ ...current, [location.surfaceId]: location.sceneId }))
        void slideHostRef.current?.setScene(location.sceneId, location.stateId)
      } else if (location.kind === 'flow-block') {
        setSelection({ kind: 'flow-block', id: location.blockId, surfaceId: location.surfaceId })
        queueMicrotask(() => document.querySelector(`[data-flow-block-id="${CSS.escape(location.blockId)}"]`)?.scrollIntoView({ block: 'center' }))
      } else {
        const surface = projectRef.current.surfaces.find((candidate) => candidate.id === location.surfaceId)
        const frame = surface?.type === 'spatial-2d'
          ? surface.camera.frames.find((candidate) => candidate.id === location.cameraFrameId)
          : undefined
        if (frame) setCameraBySurface((current) => ({ ...current, [location.surfaceId]: frame }))
      }
    },
    setPresentationState: (surfaceId, stateId) => {
      if (surfaceId !== activeSurfaceIdRef.current || !slideHostRef.current) return false
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
      onBlocked: (message) => setError(`导航已被教学条件阻止：${message}`),
    }, {
      locationId: previous?.currentLocationId,
      stateValues: previous?.state.snapshot(),
    })
    playbackSessionRef.current = next
    return next
  // Project content edits keep one session. Only declarations/guards/locations replace it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionSignature])

  useEffect(() => playbackSession.setInspectionMode(mode === 'inspect'), [mode, playbackSession])

  const parsedComponentPackages = useMemo(
    () => componentPackagesFromArchive(project, componentFiles),
    [componentFiles, project.componentPackages],
  )
  const parsedComponentPackagesRef = useRef(parsedComponentPackages)
  parsedComponentPackagesRef.current = parsedComponentPackages
  const courseEvents = useMemo(() => new CourseEventBus(), [sessionSignature])
  useEffect(() => () => courseEvents.dispose(), [courseEvents])
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
    reportDiagnostic: (_surfaceId, _itemId, cause) => setError(cause.message),
  }), [courseEvents, playbackSession])
  useEffect(() => () => dynamicHosts.dispose(), [dynamicHosts])
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

  const commit = useCallback((operation: (current: CourseProjectDocument) => CourseProjectDocument) => {
    try {
      const current = historyRef.current
      const next = commitCourseHistory(current, operation(current.present))
      historyRef.current = next
      projectRef.current = next.present
      setHistory(next)
      setDirty(true)
    } catch (cause) {
      setError(readableError(cause))
    }
  }, [])

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
    setFlowSearch('')
    if (surface.type === 'slide') {
      const sceneId = activeSceneIdsRef.current[surface.id] ?? surface.scenes[0]!.id
      setActiveSceneIds((current) => ({ ...current, [surface.id]: sceneId }))
      const location = projectRef.current.locations.find((candidate) => (
        candidate.kind === 'slide-scene' && candidate.surfaceId === surface.id && candidate.sceneId === sceneId
      ))
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
    document.title = `${project.title}${dirty ? ' *' : ''} - Course Studio V9`
    window.__COURSEWARE_EDITOR_DIRTY__ = dirty
    void window.desktopAPI?.setDirtyState(dirty).catch(() => undefined)
  }, [dirty, project.title])

  const loadArchive = useCallback((archive: {
    project: CourseProjectDocument
    assetFiles: Record<string, Uint8Array>
    componentFiles: Record<string, Record<string, Uint8Array>>
  }, path: string | null, migrated: boolean) => {
    const nextHistory = createCourseHistory(archive.project)
    historyRef.current = nextHistory
    setHistory(nextHistory)
    setAssetFiles(archive.assetFiles)
    setComponentFiles(archive.componentFiles)
    setProjectPath(migrated ? null : path)
    setDirty(migrated)
    setActiveSurfaceId(archive.project.surfaces[0]!.id)
    setActiveSceneIds({})
    setReviewStateIds({})
    setCameraBySurface({})
    setSelection(null)
    setStatus(migrated
      ? '已显式将 Project V8 迁移到 V9；原文件未改写，请另存'
      : `已打开 ${archive.project.title}`)
  }, [])

  const handleOpen = useCallback((migrateV8: boolean) => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('请在桌面编辑器中打开工程')
      const selected = await window.desktopAPI.openProject()
      if (!selected) return
      if (migrateV8) {
        loadArchive(importProjectV8ArchiveAsCourseProject(selected.bytes), null, true)
      } else {
        try {
          loadArchive(await openCourseProjectArchiveAsync(selected.bytes), selected.path, false)
        } catch (cause) {
          if (cause instanceof UserFacingError && cause.cause instanceof Error && 'schemaVersion' in cause.cause && cause.cause.schemaVersion === 8) {
            throw new Error('这是 Project V8。请使用工具栏的“迁移 V8”，编辑器不会静默改写旧工程。')
          }
          throw cause
        }
      }
    }, '工程打开失败。')
  }, [loadArchive, run])

  const handleNew = useCallback(() => {
    if (dirty && !window.confirm('当前修改尚未保存，仍要新建吗？')) return
    const next = createCourseProject()
    loadArchive({ project: next, assetFiles: {}, componentFiles: {} }, null, false)
    setStatus('已新建 Course Project V9')
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

  useEffect(() => {
    if (!window.desktopAPI) return
    const offSave = window.desktopAPI.onRequestSave(() => { void run(() => save(false).then(() => undefined), '保存失败。') })
    const offClose = window.desktopAPI.onRequestSaveAndClose(() => save(false))
    return () => { offSave(); offClose() }
  }, [run, save])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input,textarea,select,[contenteditable="true"]')) return
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLocaleLowerCase('en-US')
      if (key === 's') {
        event.preventDefault()
        void run(() => save(event.shiftKey).then(() => undefined), '保存失败。')
      } else if (key === 'z') {
        event.preventDefault()
        const next = event.shiftKey ? redoCourseHistory(historyRef.current) : undoCourseHistory(historyRef.current)
        historyRef.current = next
        setHistory(next)
        setDirty(true)
      } else if (key === 'y') {
        event.preventDefault()
        const next = redoCourseHistory(historyRef.current)
        historyRef.current = next
        setHistory(next)
        setDirty(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [run, save])

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
      setStatus('已打开 Published Course V2 预览')
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

  const captureSlide = useCallback(async ({ surface, scene }: {
    surface: SlideSurfaceDocument
    scene: SlideSurfaceDocument['scenes'][number]
  }): Promise<string> => {
    const container = document.createElement('div')
    container.style.position = 'fixed'
    container.style.left = '-100000px'
    container.style.top = '0'
    document.body.appendChild(container)
    const abort = new AbortController()
    const host = new SlideSurfaceHost(surface, {
      initialSceneId: scene.id,
      globalLayerItems: project.globalLayerItems,
      componentHostFactory: dynamicHosts.componentHost,
      runtimeHostFactory: dynamicHosts.runtimeHost,
    })
    try {
      await host.mount({
        surfaceId: surface.id,
        container,
        signal: abort.signal,
        services: {
          navigate: () => undefined,
          getCourseState: () => undefined,
          setCourseState: () => undefined,
          resolveAsset,
        },
      })
      await host.activate()
      await host.setScene(scene.id)
      const capture = await host.capture({ purpose: 'export' })
      return capture.content
    } finally {
      abort.abort()
      await host.destroy()
      container.remove()
    }
  }, [dynamicHosts.componentHost, dynamicHosts.runtimeHost, project.globalLayerItems, resolveAsset])

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
    const host = new FlowSurfaceHost(surface, {
      globalLayerItems: project.globalLayerItems,
      componentHostFactory: dynamicHosts.componentHost,
      runtimeHostFactory: dynamicHosts.runtimeHost,
      locationId,
    })
    try {
      await host.mount({
        surfaceId: surface.id,
        container,
        signal: abort.signal,
        services: {
          navigate: () => undefined,
          getCourseState: (key) => playbackSession.state.get(key),
          setCourseState: (key, value) => playbackSession.state.set(key, value as never),
          resolveAsset,
        },
      })
      await host.activate()
      await host.setLocationId(locationId)
      return await host.capture({ purpose: 'export' })
    } finally {
      abort.abort()
      await host.destroy()
      container.remove()
    }
  }, [dynamicHosts.componentHost, dynamicHosts.runtimeHost, playbackSession.state, project.globalLayerItems, resolveAsset])

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
        ...built.failures.map((failure) => `${failure.sourceId}: ${failure.error.message}`),
      ]
      setLastExportNotes(notes)
      const result = await window.desktopAPI.exportPdf({ suggestedName: `${project.title}.pdf`, html: built.artifact.html })
      if (result) setStatus(`PDF 已导出到 ${result.path}；非 Flow 表面按静态帧保留`)
    }, 'PDF 导出失败。')
  }, [captureFlow, captureSlide, project, resolveAsset, run])

  const handleExportDocx = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导出需要桌面编辑器')
      if (activeSurface.type !== 'flow') throw new Error('DOCX 仅对当前 Flow 表面开放；其他表面不会被伪造为 Word 内容。')
      const start = project.locations.find((location) => location.id === project.startLocationId)
      const locationId = start?.surfaceId === activeSurface.id
        ? start.id
        : project.locations.find((location) => location.surfaceId === activeSurface.id)?.id
      if (!locationId) throw new Error(`Flow 表面 ${activeSurface.id} 没有可导出的课程位置。`)
      const effectiveLayerItems = getEffectiveCourseLayerOrder({
        project,
        surfaceId: activeSurface.id,
        locationId,
      }).filter((entry): entry is FlowDocxLayerEntry => (
        entry.source === 'global' || entry.source === 'surface'
      ))
      const built = buildFlowDocx(activeSurface, {
        locationId,
        effectiveLayerItems,
        resolveAsset: (assetId) => {
          const meta = project.assets[assetId]
          const bytes = assetFiles[assetId]
          return meta && bytes ? { bytes, mimeType: meta.mimeType, filename: meta.filename } : undefined
        },
      })
      setLastExportNotes(built.warnings)
      const result = await window.desktopAPI.exportBinary({
        suggestedName: `${activeSurface.title}.docx`,
        extension: 'docx',
        bytes: built.bytes,
      })
      if (result) setStatus(`DOCX 已导出到 ${result.path}`)
    }, 'DOCX 导出失败。')
  }, [activeSurface, assetFiles, project.assets, run])

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
      if (result) setStatus(`PPTX 已导出 ${built.slideCount} 页到 ${result.path}；Flow/Spatial 差异已记录`)
    }, 'PPTX 导出失败。')
  }, [assetFiles, capturePptxDynamicItem, project, run])

  const addSurface = (type: CourseSurfaceDocument['type']) => {
    const id = `surface-${nanoid(10)}`
    try {
      const currentHistory = historyRef.current
      const nextProject = addCourseSurface(currentHistory.present, type, { id })
      const nextHistory = commitCourseHistory(currentHistory, nextProject)
      historyRef.current = nextHistory
      setHistory(nextHistory)
      setDirty(true)
      const nextSurface = nextProject.surfaces.find((surface) => surface.id === id)
      if (nextSurface) selectSurface(nextSurface)
    } catch (cause) {
      setError(readableError(cause))
    }
  }

  const addFlow = () => {
    if (activeSurface.type !== 'flow') return
    try {
      const block = newFlowBlock(flowInsertType)
      commit((current) => addFlowBlock(current, activeSurface.id, block))
      setSelection({ kind: 'flow-block', id: block.id, surfaceId: activeSurface.id })
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
  }

  const editFlow = (blockId: string, value: string) => {
    if (activeSurface.type !== 'flow') return
    commit((current) => updateNestedFlowBlock(current, activeSurface.id, blockId, (block) => {
      switch (block.type) {
        case 'heading':
        case 'paragraph':
        case 'quote': block.text = value; break
        case 'list': block.items = value.split('\n').map((text, index) => ({ id: block.items[index]?.id ?? `item-${nanoid(8)}`, text })); break
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

  const importImage = () => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导入需要桌面编辑器')
      const selected = await window.desktopAPI.selectImage()
      if (!selected) return
      const dimensions = await readImageDimensions(selected.bytes, selected.mimeType)
      const imported = createImageAssetImport(selected, { dimensions })
      let next = updateCourseProject(historyRef.current.present, (draft) => {
        draft.assets[imported.meta.id] = imported.meta
      })
      if (activeSurface.type === 'flow') {
        next = addFlowBlock(next, activeSurface.id, {
          id: `block-${nanoid(10)}`,
          type: 'media',
          assetId: imported.meta.id,
          mediaKind: 'image',
          altText: imported.meta.filename,
          caption: imported.meta.filename,
          layout: 'content-width',
        })
      } else {
        next = addImageLayer(next, {
          surfaceId: activeSurface.id,
          ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
          assetId: imported.meta.id,
          width: Math.min(dimensions.width, activeSurface.type === 'slide' ? 640 : dimensions.width),
          height: Math.min(dimensions.height, activeSurface.type === 'slide' ? 480 : dimensions.height),
          x: activeSurface.type === 'spatial-2d' ? camera?.x ?? 0 : 200,
          y: activeSurface.type === 'spatial-2d' ? camera?.y ?? 0 : 140,
        })
      }
      setAssetFiles((files) => ({ ...files, [imported.meta.id]: imported.bytes }))
      const nextHistory = commitCourseHistory(historyRef.current, next)
      historyRef.current = nextHistory
      setHistory(nextHistory)
      setDirty(true)
      setStatus(`已导入图片 ${imported.meta.filename}`)
    }, '图片导入失败。')
  }

  const importComponent = () => {
    void run(async () => {
      if (!window.desktopAPI) throw new Error('导入需要桌面编辑器')
      const selected = await window.desktopAPI.selectComponentPackage()
      if (!selected) return
      const imported = await importComponentPackageAsync(selected.bytes)
      if (historyRef.current.present.componentPackages[imported.manifest.id]) {
        throw new Error(`工程已包含组件 ${imported.manifest.id}；当前 V9 编辑器暂不静默替换可执行包。`)
      }
      let next = updateCourseProject(historyRef.current.present, (draft) => {
        draft.componentPackages[imported.manifest.id] = imported.metadata
      })
      let inserted = false
      let fallback: ReturnType<typeof componentFallbackAsset> | undefined
      if (imported.manifest.supportedScopes.includes('scene') && activeSurface.type === 'flow') {
        fallback = componentFallbackAsset(imported)
        next = updateCourseProject(next, (draft) => {
          draft.assets[fallback!.meta.id] = fallback!.meta
        })
        next = addFlowBlock(next, activeSurface.id, {
          id: `block-${nanoid(10)}`,
          type: 'component',
          component: { packageId: imported.manifest.id, version: imported.manifest.version },
          props: structuredClone(imported.manifest.defaultProps),
          staticFallbackAssetId: fallback.meta.id,
        })
        inserted = true
      } else if (imported.manifest.supportedScopes.includes('scene')) {
        next = addComponentLayer(next, {
          surfaceId: activeSurface.id,
          ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
          packageId: imported.manifest.id,
          version: imported.manifest.version,
          label: imported.manifest.name,
          props: structuredClone(imported.manifest.defaultProps),
          width: imported.manifest.defaultSize.width,
          height: imported.manifest.defaultSize.height,
          x: activeSurface.type === 'spatial-2d' ? camera?.x ?? 0 : 160,
          y: activeSurface.type === 'spatial-2d' ? camera?.y ?? 0 : 120,
        })
        inserted = true
      }
      setComponentFiles((files) => ({ ...files, [imported.key]: imported.files }))
      if (fallback) setAssetFiles((files) => ({ ...files, [fallback!.meta.id]: fallback!.bytes }))
      const nextHistory = commitCourseHistory(historyRef.current, next)
      historyRef.current = nextHistory
      setHistory(nextHistory)
      setDirty(true)
      setStatus(inserted
        ? `已导入并插入组件 ${imported.manifest.name}`
        : `已导入组件 ${imported.manifest.name}；该包未声明 scene 挂载范围，未自动插入`)
    }, '组件导入失败。')
  }

  const insertEmbeddedComponent = (pkg: ComponentPackageData) => {
    if (!pkg.manifest.supportedScopes.includes('scene')) {
      setError(`组件 ${pkg.manifest.name} 未声明 scene 挂载范围，不能插入当前表面。`)
      return
    }
    if (activeSurface.type === 'flow') {
      const fallback = componentFallbackAsset(pkg)
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
      setSelection({ kind: 'flow-block', id: blockId, surfaceId: activeSurface.id })
      setStatus(`已将组件 ${pkg.manifest.name} 插入当前 Flow 内容流`)
      return
    }
    if (activeSurface.type === 'slide' && !activeSceneId) return
    commit((current) => addComponentLayer(current, {
      surfaceId: activeSurface.id,
      ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
      packageId: pkg.manifest.id,
      version: pkg.manifest.version,
      label: pkg.manifest.name,
      props: structuredClone(pkg.manifest.defaultProps),
      width: pkg.manifest.defaultSize.width,
      height: pkg.manifest.defaultSize.height,
      x: activeSurface.type === 'spatial-2d' ? camera?.x ?? 0 : 160,
      y: activeSurface.type === 'spatial-2d' ? camera?.y ?? 0 : 120,
    }))
    setStatus(`已将组件 ${pkg.manifest.name} 插入当前 ${surfaceLabel(activeSurface.type)} 表面`)
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

  const layerContext = selectedItem ? {
    surfaceId: activeSurface.id,
    ...(activeSurface.type === 'slide' ? { sceneId: activeSceneId } : {}),
    layerItemId: selectedItem.layerItemId,
    ...(selection?.kind === 'layer' ? { source: selection.source } : {}),
  } : null

  const handleSlideHostReady = useCallback((host: SlideSurfaceHost | null) => {
    slideHostRef.current = host
  }, [])

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
      description: '教师从当前检查画面显式保存；仅持久化可结构化的背景、图层顺序、几何、透明度与显隐，不伪造 Runtime/Component 内部状态。',
      backgroundColor: sourceState?.backgroundColor ?? activeScene.backgroundColor,
      backgroundAssetId: sourceState?.backgroundAssetId === undefined
        ? activeScene.backgroundAssetId
        : sourceState.backgroundAssetId,
      layerItemOverrides: snapshot.layerItemOverrides,
      layerItemOrder: snapshot.layerItemOrder,
    }))
    setReviewStateIds((current) => ({ ...current, [activeSceneId]: stateId }))
    setStatus(`已保存命名复核态“${name}”；Runtime/Component 内部临时状态仍保留在当前会话中`)
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
    if (
      action.type === 'scene.go' || action.type === 'scene.next' ||
      action.type === 'scene.previous' || action.type === 'scene.replay' ||
      action.type === 'course.restart'
    ) {
      playbackSession.beforeTeacherAction(action)
      return false
    }
    return true
  }, [playbackSession])
  const handleTeacherSideEffect = useCallback((action: TeacherControllerAction): void => {
    if (action.type === 'audio.toggle-mute') {
      const media = document.querySelectorAll<HTMLMediaElement>('.course-canvas-shell audio, .course-canvas-shell video')
      const muted = ![...media].every((element) => element.muted)
      media.forEach((element) => { element.muted = muted })
    } else if (action.type === 'player.fullscreen.toggle') {
      const canvas = document.querySelector<HTMLElement>('.course-canvas-shell')
      if (document.fullscreenElement) void document.exitFullscreen?.()
      else void canvas?.requestFullscreen?.()
    }
  }, [])

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
      let next = updateCourseProject(current.present, (draft) => {
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
      const nextHistory = commitCourseHistory(current, next)
      historyRef.current = nextHistory
      projectRef.current = next
      setHistory(nextHistory)
      setAssetFiles((files) => ({ ...files, [imported.meta.id]: imported.bytes }))
      setDirty(true)
      setStatus(`已替换${kind === 'image' ? '图片' : kind === 'video' ? '视频' : '声音'}素材：${imported.meta.filename}`)
    }, '素材替换失败。')
  }, [run, selectedAuthoringFields, selectedBlock, selectedItem])

  const copyAiReference = async () => {
    if (!selection) return
    if (!selection.field) {
      setError('请先在“AI 精确字段”中选择具体字段；普通图层点选不会默认猜测第一个地址。')
      return
    }
    if (!currentAiReference) {
      setError('所选 AI 字段已失效，请重新点选画布目标。')
      return
    }
    await navigator.clipboard.writeText(JSON.stringify({
      projectPath,
      dirty,
      reference: currentAiReference,
    }, null, 2))
    setStatus('已复制稳定 AI 作者引用（hitId 不参与定位）')
  }

  const handleApplyAiPatch = useCallback(() => {
    void run(async () => {
      if (!window.desktopAPI?.selectCourseAuthoringPatch) throw new Error('当前桌面桥不支持选择 AI Patch')
      const selected = await window.desktopAPI.selectCourseAuthoringPatch()
      if (!selected) return
      const patch = parseCourseAuthoringPatch(selected.bytes)
      const current = historyRef.current
      const next = applyCourseAuthoringPatch(current.present, patch)
      const nextHistory = commitCourseHistory(current, next)
      historyRef.current = nextHistory
      setHistory(nextHistory)
      setDirty(true)
      setStatus(`已应用 AI Patch：${selected.name}；可使用撤销恢复`)
    }, 'AI Patch 应用失败，工程未发生变化。')
  }, [run])

  return (
    <div className="course-studio" data-testid="course-studio-v9">
      <header className="course-toolbar">
        <strong>Course Studio <span>V9</span></strong>
        <div className="course-toolbar__group">
          <StudioButton onClick={handleNew}>新建</StudioButton>
          <StudioButton onClick={() => handleOpen(false)}>打开 V9</StudioButton>
          <StudioButton onClick={() => handleOpen(true)}>迁移 V8</StudioButton>
          <StudioButton onClick={() => void run(() => save(false).then(() => undefined), '保存失败。')} disabled={busy}>保存</StudioButton>
          <StudioButton onClick={() => void run(() => save(true).then(() => undefined), '另存失败。')} disabled={busy}>另存</StudioButton>
          <StudioButton onClick={handleApplyAiPatch} disabled={busy}>应用 AI Patch</StudioButton>
        </div>
        <div className="course-toolbar__group course-mode-switch" aria-label="运行与编辑当前帧">
          <StudioButton className={mode === 'inspect' ? 'is-active' : ''} onClick={enterCurrentFrameInspection}>编辑当前帧</StudioButton>
          <StudioButton className={mode === 'playback' ? 'is-active' : ''} onClick={() => setMode('playback')}>试运行</StudioButton>
          <StudioButton disabled={mode !== 'playback'} onClick={() => playbackSession.restart()}>重启试运行</StudioButton>
        </div>
        <div className="course-toolbar__group course-toolbar__exports">
          <StudioButton onClick={handlePreview}>预览</StudioButton>
          <StudioButton onClick={handleExportHtml}>HTML</StudioButton>
          <StudioButton onClick={handleExportWeb}>网页包</StudioButton>
          <StudioButton onClick={handleExportPdf}>PDF</StudioButton>
          <StudioButton onClick={handleExportPptx} disabled={!project.surfaces.some((surface) => surface.type === 'slide')}>PPTX</StudioButton>
          <StudioButton onClick={handleExportDocx} disabled={activeSurface.type !== 'flow'}>DOCX</StudioButton>
          <StudioButton onClick={() => setDifferencesOpen((open) => !open)}>导出差异</StudioButton>
        </div>
        <StudioButton className="course-legacy-link" onClick={onOpenLegacy} data-testid="open-legacy-v8">旧版 V8 编辑器</StudioButton>
      </header>

      {differencesOpen && (
        <ExportDifferencePanel differences={differences} notes={lastExportNotes} onClose={() => setDifferencesOpen(false)} />
      )}

      <main className="course-studio-main">
        <aside className="course-outline" aria-label="课程结构">
          <CommitInput
            label="课程标题"
            value={project.title}
            onCommit={(title) => commit((current) => updateCourseProject(current, (draft) => { draft.title = title.trim() || '未命名课程' }))}
          />
          <div className="course-outline__add">
            <StudioButton onClick={() => addSurface('slide')}>+ Slide</StudioButton>
            <StudioButton onClick={() => addSurface('flow')}>+ Flow</StudioButton>
            <StudioButton onClick={() => addSurface('spatial-2d')}>+ Spatial</StudioButton>
          </div>
          <nav>
            {project.surfaces.map((surface) => (
              <section key={surface.id} className={surface.id === activeSurface.id ? 'is-active' : ''}>
                <button type="button" className="course-surface-row" onClick={() => selectSurface(surface)}>
                  <span className={`course-surface-badge is-${surface.type}`}>{surfaceLabel(surface.type)}</span>
                  <span>{surface.title}</span>
                </button>
                {surface.id === activeSurface.id && surface.type === 'slide' && (
                  <div className="course-outline__children">
                    {surface.scenes.map((scene) => (
                      <button
                        type="button"
                        key={scene.id}
                        className={scene.id === activeSceneId ? 'is-current' : ''}
                        onClick={() => {
                          const location = project.locations.find((candidate) => (
                            candidate.kind === 'slide-scene' && candidate.surfaceId === surface.id && candidate.sceneId === scene.id
                          ))
                          if (location) playbackSession.authorActivate(location)
                          else setActiveSceneIds((current) => ({ ...current, [surface.id]: scene.id }))
                          setSelection(null)
                        }}
                      >{scene.name}</button>
                    ))}
                    {activeScene?.presentation && (
                      <div className="course-review-states" role="group" aria-label="命名复核态">
                        {activeScene.presentation.states.map((state) => (
                          <button
                            type="button"
                            key={state.id}
                            className={state.id === activeReviewStateId ? 'is-current' : ''}
                            aria-pressed={state.id === activeReviewStateId}
                            onClick={() => {
                              setReviewStateIds((current) => ({ ...current, [activeScene.id]: state.id }))
                              setStatus(`已切换到命名复核态“${state.name}”`)
                            }}
                          >
                            {state.name}{state.id === activeScene.presentation?.initialStateId ? ' · 初始' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    <StudioButton onClick={() => {
                      const id = `scene-${nanoid(10)}`
                      commit((current) => addSlideScene(current, surface.id, { id }))
                      setActiveSceneIds((current) => ({ ...current, [surface.id]: id }))
                    }}>+ 新建场景</StudioButton>
                  </div>
                )}
                {surface.id === activeSurface.id && surface.type === 'flow' && (
                  <div className="course-outline__children course-flow-toc">
                    <input aria-label="搜索 Flow 内容" placeholder="搜索内容……" value={flowSearch} onChange={(event) => setFlowSearch(event.target.value)} />
                    {flattenFlowBlocks(surface.blocks).filter(blockMatchesHeading).map((block) => (
                      <button type="button" key={block.id} onClick={() => {
                        const location = project.locations.find((candidate) => (
                          candidate.kind === 'flow-block' && candidate.surfaceId === surface.id && candidate.blockId === block.id
                        ))
                        if (location) playbackSession.authorActivate(location)
                        else setSelection({ kind: 'flow-block', id: block.id, surfaceId: surface.id })
                      }}>
                        {'·'.repeat(block.level)} {block.text}
                      </button>
                    ))}
                  </div>
                )}
                {surface.id === activeSurface.id && surface.type === 'spatial-2d' && (
                  <div className="course-outline__children">
                    {surface.camera.frames.map((frame) => (
                      <button type="button" key={frame.id} onClick={() => {
                        const location = project.locations.find((candidate) => (
                          candidate.kind === 'spatial-camera' && candidate.surfaceId === surface.id && candidate.cameraFrameId === frame.id
                        ))
                        if (location) playbackSession.authorActivate(location)
                        else setCameraBySurface((current) => ({ ...current, [surface.id]: frame }))
                      }}>
                        {frame.name} · {Math.round(frame.zoom * 100)}%
                      </button>
                    ))}
                    <StudioButton onClick={() => camera && commit((current) => addSpatialCameraFrame(current, surface.id, camera))}>+ 保存当前镜头</StudioButton>
                  </div>
                )}
              </section>
            ))}
          </nav>
        </aside>

        <section className="course-center">
          <div className="course-center__tools">
            {activeSurface.type === 'slide' && (
              <>
                <StudioButton disabled={mode === 'playback'} onClick={() => activeSceneId && commit((current) => addSlideTextLayer(current, activeSurface.id, activeSceneId))}>+ 文字</StudioButton>
                <StudioButton disabled={mode === 'playback'} onClick={() => addVisualLayer('formula')}>+ 公式</StudioButton>
                <StudioButton disabled={mode === 'playback'} onClick={() => addVisualLayer('shape')}>+ 图形</StudioButton>
                <StudioButton
                  disabled={mode === 'playback'}
                  onPointerDownCapture={stageNamedReviewFrame}
                  onClick={saveNamedReviewState}
                >保存为命名复核态</StudioButton>
                <StudioButton disabled={mode === 'playback' || !activeReviewStateId} onClick={renameActiveReviewState}>重命名复核态</StudioButton>
                <StudioButton disabled={mode === 'playback' || !activeReviewStateId || activeScene?.presentation?.initialStateId === activeReviewStateId} onClick={makeActiveReviewStateInitial}>设为初始</StudioButton>
                <StudioButton disabled={mode === 'playback' || !activeReviewStateId} onClick={removeActiveReviewState}>删除复核态</StudioButton>
              </>
            )}
            {activeSurface.type === 'flow' && (
              <>
                <select aria-label="Flow 块类型" value={flowInsertType} onChange={(event) => setFlowInsertType(event.target.value as FlowBlock['type'])}>
                  {(['heading', 'paragraph', 'quote', 'list', 'callout', 'table', 'formula', 'code', 'section', 'divider'] as const).map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <StudioButton disabled={mode === 'playback'} onClick={addFlow}>+ 内容块</StudioButton>
              </>
            )}
            {activeSurface.type === 'spatial-2d' && (
              <>
                <StudioButton disabled={mode === 'playback'} onClick={() => commit((current) => addSpatialTextLayer(current, activeSurface.id, '可移动文字', { x: camera?.x, y: camera?.y }))}>+ 文字</StudioButton>
                <StudioButton disabled={mode === 'playback'} onClick={() => addVisualLayer('formula')}>+ 公式</StudioButton>
                <StudioButton disabled={mode === 'playback'} onClick={() => addVisualLayer('shape')}>+ 图形</StudioButton>
                <span>{Math.round((camera?.zoom ?? 1) * 100)}%</span>
                <StudioButton onClick={() => setCameraBySurface((current) => ({ ...current, [activeSurface.id]: activeSurface.camera.home }))}>回到首页镜头</StudioButton>
              </>
            )}
            <StudioButton disabled={mode === 'playback'} onClick={importImage}>+ 导入图片</StudioButton>
            <StudioButton disabled={mode === 'playback'} onClick={importComponent}>+ 导入组件</StudioButton>
            {Object.values(parsedComponentPackages).map((pkg) => (
              <StudioButton
                key={`${pkg.manifest.id}@${pkg.manifest.version}`}
                disabled={mode === 'playback' || !pkg.manifest.supportedScopes.includes('scene')}
                title={`插入 Component · ${pkg.manifest.id}@${pkg.manifest.version}`}
                onClick={() => insertEmbeddedComponent(pkg)}
              >+ {pkg.manifest.name}</StudioButton>
            ))}
            <span className="course-center__mode-note">
              {mode === 'inspect' ? '交互已冻结；正在编辑试运行后的当前帧' : '试运行中；返回编辑不会重建表面实例'}
            </span>
          </div>
          <div className="course-canvas-shell">
            {activeSurface.type === 'slide' && activeSceneId && (
              <SlideCourseCanvas
                surface={activeSurface}
                sceneId={activeSceneId}
                presentationStateId={activeReviewStateId}
                mode={mode}
                selectedLayerItemId={selection?.kind === 'layer' ? selection.id : null}
                resolveAsset={resolveAsset}
                componentHostFactory={dynamicHosts.componentHost}
                runtimeHostFactory={dynamicHosts.runtimeHost}
                globalLayerItems={project.globalLayerItems}
                onHostReady={handleSlideHostReady}
                beforeTeacherControllerAction={handleTeacherAction}
                onTeacherControllerAction={handleTeacherSideEffect}
                onLayerHit={(hit) => mode === 'inspect' && setSelection({
                  kind: 'layer',
                  id: hit.layerItemId,
                  carrier: hit.kind,
                  source: hit.source,
                  surfaceId: hit.surfaceId,
                  ...(hit.sceneId ? { sceneId: hit.sceneId } : {}),
                  ...(hit.field ? { field: hit.field } : {}),
                  ...(hit.hitId ? { hitId: hit.hitId } : {}),
                  ...(hit.targetKind ? { targetKind: hit.targetKind } : {}),
                })}
                onError={setError}
              />
            )}
            {activeSurface.type === 'flow' && (
              <FlowCourseCanvas
                surface={activeSurface}
                mode={mode}
                selectedBlockId={selection?.kind === 'flow-block' ? selection.id : null}
                selectedLayerItemId={selection?.kind === 'layer' ? selection.id : null}
                search={flowSearch}
                resolveAsset={resolveAsset}
                renderComponent={renderFlowComponent}
                componentHostFactory={dynamicHosts.componentHost}
                runtimeHostFactory={dynamicHosts.runtimeHost}
                globalLayerItems={project.globalLayerItems}
                locationId={selection?.kind === 'flow-block'
                  ? project.locations.find((location) => (
                      location.kind === 'flow-block' &&
                      location.surfaceId === activeSurface.id &&
                      location.blockId === selection.id
                    ))?.id ?? playbackSession.currentLocationId
                  : playbackSession.currentLocationId}
                beforeTeacherControllerAction={handleTeacherAction}
                onTeacherControllerAction={handleTeacherSideEffect}
                onLayerHit={(hit) => mode === 'inspect' && setSelection({
                  kind: 'layer',
                  id: hit.layerItemId,
                  carrier: hit.kind,
                  source: hit.source,
                  surfaceId: hit.surfaceId,
                  ...(hit.field ? { field: hit.field } : {}),
                  ...(hit.hitId ? { hitId: hit.hitId } : {}),
                  ...(hit.targetKind ? { targetKind: hit.targetKind } : {}),
                })}
                onComponentHit={(id, detail) => mode === 'inspect' && setSelection({
                  kind: 'flow-block',
                  id,
                  surfaceId: activeSurface.id,
                  ...(detail?.field ? { field: detail.field } : {}),
                  ...(detail?.hitId ? { hitId: detail.hitId } : {}),
                  ...(detail?.targetKind ? { targetKind: detail.targetKind } : {}),
                })}
                onSelect={(id) => mode === 'inspect' && setSelection({ kind: 'flow-block', id, surfaceId: activeSurface.id })}
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
                resolveAsset={resolveAsset}
                componentHostFactory={dynamicHosts.componentHost}
                runtimeHostFactory={dynamicHosts.runtimeHost}
                globalLayerItems={project.globalLayerItems}
                locationId={project.locations.find((location) => (
                  location.kind === 'spatial-camera' &&
                  location.surfaceId === activeSurface.id &&
                  activeSurface.camera.frames.some((frame) => (
                    frame.id === location.cameraFrameId &&
                    frame.x === camera.x && frame.y === camera.y && frame.zoom === camera.zoom
                  ))
                ))?.id ?? project.locations.find((location) => location.surfaceId === activeSurface.id)?.id}
                onCameraChange={(next) => setCameraBySurface((current) => ({ ...current, [activeSurface.id]: next }))}
                onSelect={(id) => mode === 'inspect' && setSelection(id ? {
                  kind: 'layer',
                  id,
                  carrier: (
                    activeSurface.world.layerItems.find((item) => item.layerItemId === id) ??
                    activeSurface.surfaceLayerItems.find((entry) => entry.item.layerItemId === id)?.item ??
                    project.globalLayerItems.find((entry) => entry.item.layerItemId === id)?.item
                  )?.kind ?? 'native',
                  source: project.globalLayerItems.some((entry) => entry.item.layerItemId === id)
                    ? 'global'
                    : activeSurface.surfaceLayerItems.some((entry) => entry.item.layerItemId === id)
                      ? 'surface'
                      : 'world',
                  surfaceId: activeSurface.id,
                } : null)}
                onLayerHit={(hit) => mode === 'inspect' && setSelection({
                  kind: 'layer',
                  id: hit.layerItemId,
                  carrier: hit.kind,
                  source: hit.source,
                  surfaceId: hit.surfaceId,
                  ...(hit.field ? { field: hit.field } : {}),
                  ...(hit.hitId ? { hitId: hit.hitId } : {}),
                  ...(hit.targetKind ? { targetKind: hit.targetKind } : {}),
                })}
                onMove={(id, dx, dy) => commit((current) => updateLayerItem(current, {
                  surfaceId: activeSurface.id,
                  layerItemId: id,
                  source: current.globalLayerItems.some((entry) => entry.item.layerItemId === id)
                    ? 'global' as const
                    : current.surfaces.find((surface) => surface.id === activeSurface.id)?.surfaceLayerItems
                        .some((entry) => entry.item.layerItemId === id)
                      ? 'surface' as const
                      : 'world' as const,
                }, (item) => { item.frame.x += dx; item.frame.y += dy }))}
                onError={setError}
              />
            )}
          </div>
        </section>

        <aside className="course-inspector" aria-label="图层与属性">
          <h2>{activeSurface.title}</h2>
          <CommitInput
            label="表面名称"
            value={activeSurface.title}
            disabled={mode === 'playback'}
            onCommit={(title) => commit((current) => updateCourseProject(current, (draft) => {
              const surface = draft.surfaces.find((candidate) => candidate.id === activeSurface.id)
              if (surface) surface.title = title.trim() || surfaceLabel(surface.type)
            }))}
          />
          {project.surfaces.length > 1 && (
            <StudioButton className="is-danger" disabled={mode === 'playback'} onClick={() => {
              commit((current) => deleteCourseSurface(current, activeSurface.id))
              setSelection(null)
            }}>删除表面</StudioButton>
          )}
          {effectiveLayerEntries.length > 0 && (
            <>
              <h3>图层（前 → 后）</h3>
              <div className="course-layer-list">
                {[...effectiveLayerEntries].reverse().map(({ item, source }) => (
                  <button
                    type="button"
                    key={item.layerItemId}
                    className={selection?.kind === 'layer' && selection.id === item.layerItemId ? 'is-current' : ''}
                    onClick={() => setSelection({
                      kind: 'layer',
                      id: item.layerItemId,
                      carrier: item.kind,
                      source,
                      surfaceId: activeSurface.id,
                      ...(source === 'scene' && activeSceneId ? { sceneId: activeSceneId } : {}),
                    })}
                  >
                    <span>{item.label}</span><small>{source} · {item.kind} · z{item.order}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {activeSurface.type === 'flow' && selectedBlock && (
            <FlowBlockInspector
              block={selectedBlock}
              index={selectedBlockLocation?.siblings.indexOf(selectedBlock) ?? -1}
              count={selectedBlockLocation?.siblings.length ?? 0}
              disabled={mode === 'playback'}
              onEdit={(value) => editFlow(selectedBlock.id, value)}
              onMove={(toIndex) => commit((current) => selectedBlockLocation?.parentSectionId
                ? reorderNestedFlowBlock(current, activeSurface.id, selectedBlock.id, toIndex)
                : reorderFlowBlock(current, activeSurface.id, selectedBlock.id, toIndex))}
              onDuplicate={() => commit((current) => selectedBlockLocation?.parentSectionId
                ? duplicateNestedFlowBlock(current, activeSurface.id, selectedBlock.id)
                : duplicateFlowBlock(current, activeSurface.id, selectedBlock.id))}
              onDelete={() => {
                commit((current) => selectedBlockLocation?.parentSectionId
                  ? deleteNestedFlowBlock(current, activeSurface.id, selectedBlock.id)
                  : deleteFlowBlock(current, activeSurface.id, selectedBlock.id))
                setSelection(null)
              }}
              onInsertChild={selectedBlock.type === 'section'
                ? () => {
                    const child = newFlowBlock('paragraph')
                    commit((current) => insertNestedFlowBlock(current, activeSurface.id, selectedBlock.id, child))
                    setSelection({ kind: 'flow-block', id: child.id, surfaceId: activeSurface.id })
                  }
                : undefined}
              authoringFields={selectedAuthoringFields}
              selectedAuthoringField={selectedAuthoringFields.find((entry) => entry.field === selection?.field)}
              selectedField={selection?.field}
              selectedTargetKind={selection?.targetKind}
              onSelectField={selectAuthoringField}
              onCommitAuthoringValue={commitAuthoringValue}
              onReplaceAsset={replaceSelectedAsset}
              onCopyAi={() => void copyAiReference()}
            />
          )}
          {selectedItem && layerContext && (
            <LayerInspector
              item={selectedItem}
              disabled={mode === 'playback'}
              onChange={changeLayer}
              onMove={(toIndex) => commit((current) => reorderLayerItem(current, { ...layerContext, toIndex }))}
              index={effectiveLayerEntries.findIndex(({ item }) => item.layerItemId === selectedItem.layerItemId)}
              count={effectiveLayerEntries.length}
              onDuplicate={() => commit((current) => duplicateLayerItem(current, layerContext))}
              onDelete={() => { commit((current) => deleteLayerItem(current, layerContext)); setSelection(null) }}
              authoringFields={selectedAuthoringFields}
              selectedAuthoringField={selectedAuthoringFields.find((entry) => entry.field === selection?.field)}
              selectedField={selection?.field}
              selectedTargetKind={selection?.targetKind}
              onSelectField={selectAuthoringField}
              onReplaceAsset={replaceSelectedAsset}
              onCopyAi={() => void copyAiReference()}
            />
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
              onUpdate={(ruleId, field, value) => commit((current) => updateSpatialSemanticZoomRule(current, activeSurface.id, ruleId, (rule) => {
                if (field === 'visible') rule.visible = Boolean(value)
                else rule[field] = Number(value)
              }))}
              onDelete={(ruleId) => commit((current) => deleteSpatialSemanticZoomRule(current, activeSurface.id, ruleId))}
            />
          )}
          {!selectedItem && !selectedBlock && <p className="course-empty">点选画布内容或右侧图层后编辑属性。</p>}
        </aside>
      </main>

      <footer className="course-status" aria-live="polite">
        <span className={busy ? 'is-busy' : ''} />
        <span>{busy ? '正在处理……' : status}</span>
        <span className="course-status__spacer" />
        <span>{titleFromProject(project)}</span>
        <span>·</span>
        <span>{projectPath ?? '尚未保存'}</span>
      </footer>
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
          <code>{rule.layerItemIds.join(', ')}</code>
          <div className="course-field-grid">
            <CommitInput label="min" type="number" value={rule.minZoom} disabled={disabled} onCommit={(value) => onUpdate(rule.id, 'minZoom', Number(value))} />
            <CommitInput label="max" type="number" value={rule.maxZoom} disabled={disabled} onCommit={(value) => onUpdate(rule.id, 'maxZoom', Number(value))} />
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
  onEdit,
  onMove,
  onDuplicate,
  onDelete,
  onCopyAi,
  onInsertChild,
  authoringFields,
  selectedAuthoringField,
  selectedField,
  selectedTargetKind,
  onSelectField,
  onCommitAuthoringValue,
  onReplaceAsset,
}: {
  block: FlowBlock
  index: number
  count: number
  disabled: boolean
  onEdit(value: string): void
  onMove(index: number): void
  onDuplicate(): void
  onDelete(): void
  onCopyAi(): void
  onInsertChild?: () => void
  authoringFields: SelectedAuthoringField[]
  selectedAuthoringField?: SelectedAuthoringField
  selectedField?: string
  selectedTargetKind?: 'text' | 'asset'
  onSelectField(field: string): void
  onCommitAuthoringValue(entry: SelectedAuthoringField, value: unknown): void
  onReplaceAsset(field: string): void
}) {
  const value = flowBlockPrimaryText(block)
  return (
    <section className="course-properties">
      <h3>{block.type} 块</h3>
      {value !== null && block.type !== 'component' && <CommitInput label="主要内容" value={value} disabled={disabled} onCommit={onEdit} />}
      <div className="course-property-actions">
        <StudioButton disabled={disabled || index <= 0} onClick={() => onMove(index - 1)}>上移</StudioButton>
        <StudioButton disabled={disabled || index >= count - 1} onClick={() => onMove(index + 1)}>下移</StudioButton>
        <StudioButton disabled={disabled} onClick={onDuplicate}>复制</StudioButton>
        <StudioButton disabled={disabled} className="is-danger" onClick={onDelete}>删除</StudioButton>
      </div>
      {onInsertChild && <StudioButton disabled={disabled} onClick={onInsertChild}>+ 在分节中插入正文</StudioButton>}
      <AuthoringFieldPicker fields={authoringFields} value={selectedField} onChange={onSelectField} />
      {selectedAuthoringField && (
        <AuthoringValueEditor
          entry={{
            ...selectedAuthoringField,
            valueKind: selectedTargetKind === 'asset' ? 'asset' : selectedAuthoringField.valueKind,
            disabled,
          }}
          onCommit={(next) => onCommitAuthoringValue(selectedAuthoringField, next)}
          onReplaceAsset={onReplaceAsset}
        />
      )}
      <StudioButton onClick={onCopyAi}>复制 AI 稳定引用</StudioButton>
      <code>{block.id}</code>
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
  onCopyAi,
  authoringFields,
  selectedAuthoringField,
  selectedField,
  selectedTargetKind,
  onSelectField,
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
  onCopyAi(): void
  authoringFields: SelectedAuthoringField[]
  selectedAuthoringField?: SelectedAuthoringField
  selectedField?: string
  selectedTargetKind?: 'text' | 'asset'
  onSelectField(field: string): void
  onReplaceAsset(field: string): void
}) {
  return (
    <section className="course-properties">
      <h3>{item.kind} 属性</h3>
      <CommitInput label="图层名称" value={item.label} disabled={disabled} onCommit={(value) => onChange((draft) => { draft.label = value })} />
      <div className="course-field-grid">
        {(['x', 'y', 'width', 'height'] as const).map((field) => (
          <CommitInput key={field} label={field} type="number" value={Math.round(item.frame[field] * 100) / 100} disabled={disabled} onCommit={(value) => onChange((draft) => {
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
      <AuthoringFieldPicker fields={authoringFields} value={selectedField} onChange={onSelectField} />
      <StudioButton onClick={onCopyAi}>复制 AI 稳定引用</StudioButton>
      <code>{item.layerItemId}</code>
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
        <thead><tr><th>表面</th><th>格式</th><th>处理</th><th>说明</th></tr></thead>
        <tbody>{differences.map((item) => (
          <tr key={`${item.surfaceId}:${item.target}`}><td>{item.surfaceKind}</td><td>{item.target.toUpperCase()}</td><td>{item.disposition}</td><td>{item.detail}</td></tr>
        ))}</tbody>
      </table>
      {notes.length > 0 && <details open><summary>上次导出警告</summary><ul>{notes.map((note, index) => <li key={`${index}:${note}`}>{note}</li>)}</ul></details>}
      <p>PPTX 仅转换 Slide 表面：Native 文字/形状尽量保持 Office 对象，Runtime/Component 用实际快照、作者后备或显式占位；Flow/Spatial 不会被伪造为 PPTX 页。</p>
    </section>
  )
}
