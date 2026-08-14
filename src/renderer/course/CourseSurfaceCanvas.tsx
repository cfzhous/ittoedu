import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { SlideSurfaceHost, type SlideLayerHit, type SlideSurfaceHostOptions } from '../../player/surfaces/slide/SlideSurfaceHost'
import type { ComponentSlideItemHostFactory, RuntimeSlideItemHostFactory } from '../../player/surfaces/slide/SlideSurfaceHost'
import {
  SpatialSurfaceHost,
  type SpatialLayerHit,
  type SpatialSurfaceHostOptions,
} from '../../player/surfaces/spatial/SpatialSurfaceHost'
import {
  SPATIAL_CANONICAL_VIEWPORT,
  isSpatialItemSemanticallyVisible,
} from '../../player/surfaces/spatial/spatialModel'
import {
  FlowScopedLayerHost,
  type FlowLayerHit,
  type FlowRenderedComponent,
} from '../../player/surfaces/flow/FlowSurfaceHost'
import { DomPlaybackFreeze } from '../../player/surfaces/domPlaybackFreeze'
import { serializeFormulaAst } from '../../shared/formulaLinear'
import {
  flowListItemsToTree,
  type FlowListTreeNode,
} from '../../shared/flowListStructure'
import { CanvasPlainTextEditor } from './common/CanvasPlainTextEditor'
import {
  SPATIAL_MAX_ZOOM,
  SPATIAL_MIN_ZOOM,
  type FlowBlock,
  type FlowSurfaceDocument,
  type LayerItem,
  type ScopedLayerItem,
  type SlideSurfaceDocument,
  type SpatialCameraPose,
  type SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import { CourseTransformOverlay } from './CourseTransformOverlay'
import type {
  CourseTransformChange,
} from './CourseTransformOverlay'
import {
  applyCourseTransformRequest,
  courseItemContainsLogicalPoint,
  courseItemIntersectsLogicalRect,
  courseLogicalRectFromPoints,
  snapCourseTransformItems,
  type CourseLogicalRect,
  type CourseSnapGuide,
  type CourseTransformItem,
  type LogicalPoint,
} from './courseTransformGeometry'
import { flowBlockTeacherLabel } from './courseTeacherLabels'
import {
  createFlowBlockMoveRequest,
  type FlowBlockMoveRequest,
} from './flow/flowBlockMove'

export type StudioMode = 'inspect' | 'playback'

export type CourseCanvasLayerSource = 'scene' | 'world' | 'surface' | 'global'

export interface CourseCanvasLayerSelection {
  item: LayerItem
  source: CourseCanvasLayerSource
}

export type CourseCanvasTransformHandler = (change: CourseTransformChange) => void

export type CourseCanvasNativeTextCommitHandler = (
  selection: CourseCanvasLayerSelection,
  text: string,
) => void

export type CourseCanvasLayerSelectionHandler = (
  selections: CourseCanvasLayerSelection[],
  primaryId?: string,
) => void

interface CourseCanvasMarqueeGesture {
  pointerId: number
  startClient: LogicalPoint
  startLogical: LogicalPoint
  currentLogical: LogicalPoint
  shiftKey: boolean
  initialSelections: CourseCanvasLayerSelection[]
}

const SLIDE_MIN_SCALE = 0.5
const SLIDE_MAX_SCALE = 2
const SLIDE_SCALE_STEP = 0.1

function clampSlideScale(value: number): number {
  return Math.min(SLIDE_MAX_SCALE, Math.max(SLIDE_MIN_SCALE, value))
}

function isEditableInteractionTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

function isStandardKeyboardActivationTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(
    'button, a[href], input, textarea, select, summary, video, audio, [contenteditable="true"], [role="button"], [role="link"], [role="menuitem"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"]',
  ))
}

function scopedLayerVisible(entry: ScopedLayerItem, locationId: string | undefined): boolean {
  if (entry.visibility.mode === 'all') return true
  if (!locationId) return false
  const included = entry.visibility.locationIds.includes(locationId)
  return entry.visibility.mode === 'include' ? included : !included
}

function sortCanvasLayerSelections(
  selections: CourseCanvasLayerSelection[],
): CourseCanvasLayerSelection[] {
  return selections.sort((left, right) => (
    left.item.order - right.item.order ||
    left.item.layerItemId.localeCompare(right.item.layerItemId)
  ))
}

function materializeSlideSelectionItem(
  item: LayerItem,
  state: NonNullable<SlideSurfaceDocument['scenes'][number]['presentation']>['states'][number] | undefined,
): LayerItem {
  const next = structuredClone(item)
  const override = state?.layerItemOverrides[item.layerItemId]
  if (!override) return next
  if (override.frame) next.frame = { ...next.frame, ...override.frame }
  if (override.order !== undefined) next.order = override.order
  if (override.visible !== undefined) next.visible = override.visible
  if (override.locked !== undefined) next.locked = override.locked
  if (override.rotation !== undefined) next.rotation = override.rotation
  if (override.opacity !== undefined) next.opacity = override.opacity
  if (override.hitPolicy !== undefined) next.hitPolicy = override.hitPolicy
  if (override.playbackInitialVisibility !== undefined) {
    next.playbackInitialVisibility = override.playbackInitialVisibility
  }
  return next
}

function slideMarqueeCandidates(
  surface: SlideSurfaceDocument,
  sceneId: string,
  presentationStateId: string | undefined,
  locationId: string | undefined,
  globalLayerItems: readonly ScopedLayerItem[] | undefined,
): CourseCanvasLayerSelection[] {
  const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
  if (!scene) return []
  const presentation = scene.presentation
  const state = presentation?.states.find((candidate) => candidate.id === presentationStateId) ??
    presentation?.states.find((candidate) => candidate.id === presentation.initialStateId)
  const selections: CourseCanvasLayerSelection[] = [
    ...(globalLayerItems ?? [])
      .filter((entry) => scopedLayerVisible(entry, locationId))
      .map(({ item }) => ({ item: structuredClone(item), source: 'global' as const })),
    ...surface.surfaceLayerItems
      .filter((entry) => scopedLayerVisible(entry, locationId))
      .map(({ item }) => ({ item: structuredClone(item), source: 'surface' as const })),
    ...scene.layerItems.map((item) => ({
      item: materializeSlideSelectionItem(item, state),
      source: 'scene' as const,
    })),
  ]
  return sortCanvasLayerSelections(selections.filter(({ item }) => (
    item.visible && item.playbackInitialVisibility !== 'hidden'
  )))
}

function flowMarqueeCandidates(
  surface: FlowSurfaceDocument,
  locationId: string | undefined,
  globalLayerItems: readonly ScopedLayerItem[],
): CourseCanvasLayerSelection[] {
  const resolvedLocationId = locationId ?? surface.id
  const selections: CourseCanvasLayerSelection[] = [
    ...globalLayerItems
      .filter((entry) => scopedLayerVisible(entry, resolvedLocationId))
      .map(({ item }) => ({ item, source: 'global' as const })),
    ...surface.surfaceLayerItems
      .filter((entry) => scopedLayerVisible(entry, resolvedLocationId))
      .map(({ item }) => ({ item, source: 'surface' as const })),
  ]
  return sortCanvasLayerSelections(selections.filter(({ item }) => (
    item.visible && item.playbackInitialVisibility !== 'hidden'
  )))
}

function spatialMarqueeCandidates(
  surface: SpatialSurfaceDocument,
  camera: SpatialCameraPose,
  locationId: string | undefined,
  globalLayerItems: readonly ScopedLayerItem[] | undefined,
): CourseCanvasLayerSelection[] {
  const selections: CourseCanvasLayerSelection[] = [
    ...(globalLayerItems ?? [])
      .filter((entry) => scopedLayerVisible(entry, locationId))
      .map(({ item }) => ({ item, source: 'global' as const })),
    ...surface.surfaceLayerItems
      .filter((entry) => scopedLayerVisible(entry, locationId))
      .map(({ item }) => ({ item, source: 'surface' as const })),
    ...surface.world.layerItems.map((item) => ({ item, source: 'world' as const })),
  ]
  return sortCanvasLayerSelections(selections.filter(({ item }) => (
    item.visible && isSpatialItemSemanticallyVisible(item.layerItemId, camera.zoom, surface.semanticZoom)
  )))
}

function updateCanvasLayerSelection(
  current: readonly CourseCanvasLayerSelection[],
  hits: readonly CourseCanvasLayerSelection[],
  toggle: boolean,
): { selections: CourseCanvasLayerSelection[]; primaryId?: string } {
  if (!toggle) {
    const selections = [...new Map(hits.map((selection) => [
      selection.item.layerItemId,
      selection,
    ])).values()]
    return {
      selections,
      ...(selections.at(-1) ? { primaryId: selections.at(-1)!.item.layerItemId } : {}),
    }
  }
  const selections = [...current]
  for (const hit of hits) {
    const index = selections.findIndex(({ item }) => item.layerItemId === hit.item.layerItemId)
    if (index >= 0) selections.splice(index, 1)
    else selections.push(hit)
  }
  const primary = selections.at(-1)
  return {
    selections,
    ...(primary ? { primaryId: primary.item.layerItemId } : {}),
  }
}

function selectionHitsForMarquee(
  candidates: readonly CourseCanvasLayerSelection[],
  rect: CourseLogicalRect,
): CourseCanvasLayerSelection[] {
  return candidates.filter(({ item }) => courseItemIntersectsLogicalRect(item, rect))
}

function completeCanvasMarquee(
  gesture: CourseCanvasMarqueeGesture,
  endClient: LogicalPoint,
  endLogical: LogicalPoint,
  candidates: readonly CourseCanvasLayerSelection[],
  onChange: CourseCanvasLayerSelectionHandler,
): void {
  const dragged = Math.hypot(
    endClient.x - gesture.startClient.x,
    endClient.y - gesture.startClient.y,
  ) >= 3
  if (!dragged) {
    if (!gesture.shiftKey) onChange([], undefined)
    return
  }
  const hits = selectionHitsForMarquee(
    candidates,
    courseLogicalRectFromPoints(gesture.startLogical, endLogical),
  )
  if (gesture.shiftKey && hits.length === 0) return
  const next = updateCanvasLayerSelection(gesture.initialSelections, hits, gesture.shiftKey)
  onChange(next.selections, next.primaryId)
}

function CourseCanvasMarquee({
  rect,
  visualScale = 1,
  surface,
}: {
  rect: CourseLogicalRect
  visualScale?: number
  surface: 'slide' | 'flow' | 'spatial'
}) {
  return (
    <div
      data-course-canvas-marquee={surface}
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        boxSizing: 'border-box',
        border: `${1 / Math.max(0.01, visualScale)}px solid #2563eb`,
        background: 'rgba(37, 99, 235, 0.12)',
        pointerEvents: 'none',
        zIndex: 2_147_483_050,
      }}
    />
  )
}

function applyPreviewGeometry(item: LayerItem, preview: CourseTransformItem | undefined): void {
  if (!preview) return
  item.frame = { ...preview.frame }
  item.rotation = preview.rotation
}

function previewItemsById(items: readonly CourseTransformItem[] | null): Map<string, CourseTransformItem> {
  return new Map((items ?? []).map((item) => [item.layerItemId, item]))
}

function nativePrimaryAuthoringDetail(item: LayerItem): {
  field: string
  targetKind: 'text' | 'asset'
} | null {
  if (item.kind !== 'native') return null
  switch (item.content.nativeType) {
    case 'text': return { field: 'content.data.text', targetKind: 'text' }
    case 'image':
    case 'video': return { field: 'content.data.assetId', targetKind: 'asset' }
    case 'formula': return { field: 'content.data.ast', targetKind: 'text' }
    case 'teacher-controller': return { field: 'content.data.title', targetKind: 'text' }
    case 'shape': return null
  }
}

function overlayMayCaptureInterior(selections: readonly CourseCanvasLayerSelection[]): boolean {
  return selections.every(({ item }) => (
    item.kind === 'native' && item.content.nativeType !== 'teacher-controller'
  ))
}

function editableNativeTextSelection(
  selections: readonly CourseCanvasLayerSelection[],
  layerItemId: string | null,
): CourseCanvasLayerSelection | null {
  if (!layerItemId) return null
  return selections.find(({ item }) => (
    item.layerItemId === layerItemId &&
    !item.locked &&
    item.kind === 'native' &&
    item.content.nativeType === 'text'
  )) ?? null
}

function NativeLayerTextEditor({
  selection,
  onCommit,
  onCancel,
}: {
  selection: CourseCanvasLayerSelection
  onCommit: CourseCanvasNativeTextCommitHandler
  onCancel(): void
}) {
  const item = selection.item
  if (item.kind !== 'native' || item.content.nativeType !== 'text') return null
  const value = item.content.data.text
  return (
    <CanvasPlainTextEditor
      bounds={item.frame}
      rotation={item.rotation}
      label={`编辑${item.label}`}
      value={value}
      multiline={value.includes('\n') || item.content.data.style.overflow === 'auto-height'}
      onCommit={(text) => {
        onCancel()
        if (text !== value) onCommit(selection, text)
      }}
      onCancel={onCancel}
    />
  )
}

interface SlideCanvasProps {
  surface: SlideSurfaceDocument
  sceneId: string
  locationId?: string
  presentationStateId?: string
  mode: StudioMode
  selectedLayerItemId: string | null
  selectedLayerItems?: readonly CourseCanvasLayerSelection[]
  resolveAsset(assetId: string): string | undefined
  onLayerHit(hit: SlideLayerHit): void
  onLayerSelectionChange?: CourseCanvasLayerSelectionHandler
  onLayerTransformPreview?: CourseCanvasTransformHandler
  onLayerTransformCommit?: CourseCanvasTransformHandler
  onNativeTextCommit?: CourseCanvasNativeTextCommitHandler
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  globalLayerItems?: SlideSurfaceHostOptions['globalLayerItems']
  interactionEvents?: SlideSurfaceHostOptions['interactionEvents']
  interactionActions?: SlideSurfaceHostOptions['interactionActions']
  executeAudioAction?: SlideSurfaceHostOptions['executeAudioAction']
  beforeTeacherControllerAction?: SlideSurfaceHostOptions['beforeTeacherControllerAction']
  teacherControllerProgressText?: SlideSurfaceHostOptions['teacherControllerProgressText']
  onTeacherControllerAction?: SlideSurfaceHostOptions['onTeacherControllerAction']
  onHostReady?(host: SlideSurfaceHost | null): void
  onInteractionReady?(host: SlideSurfaceHost): void | Promise<void>
  onError(message: string): void
}

export function SlideCourseCanvas({
  surface,
  sceneId,
  locationId,
  presentationStateId,
  mode,
  selectedLayerItemId,
  selectedLayerItems,
  resolveAsset,
  onLayerHit,
  onLayerSelectionChange,
  onLayerTransformPreview,
  onLayerTransformCommit,
  onNativeTextCommit,
  componentHostFactory,
  runtimeHostFactory,
  globalLayerItems,
  interactionEvents,
  interactionActions,
  executeAudioAction,
  beforeTeacherControllerAction,
  teacherControllerProgressText,
  onTeacherControllerAction,
  onHostReady,
  onInteractionReady,
  onError,
}: SlideCanvasProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<SlideSurfaceHost | null>(null)
  const locationIdRef = useRef(locationId)
  locationIdRef.current = locationId
  const [slideScale, setSlideScale] = useState(0.8)
  const [slideFitScale, setSlideFitScale] = useState(0.8)
  const [slideZoomMode, setSlideZoomMode] = useState<'fit' | 'manual'>('fit')
  const [slideSpacePressed, setSlideSpacePressed] = useState(false)
  const [slidePanning, setSlidePanning] = useState(false)
  const slideSpacePressedRef = useRef(false)
  const slidePanRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startScrollLeft: number
    startScrollTop: number
  } | null>(null)
  const [transformPreview, setTransformPreview] = useState<CourseTransformItem[] | null>(null)
  const [snapGuides, setSnapGuides] = useState<CourseSnapGuide[]>([])
  const snapGuidesRef = useRef<CourseSnapGuide[]>([])
  const [slideMarquee, setSlideMarquee] = useState<CourseLogicalRect | null>(null)
  const slideMarqueeRef = useRef<CourseCanvasMarqueeGesture | null>(null)
  const [editingTextLayerItemId, setEditingTextLayerItemId] = useState<string | null>(null)
  const hitHandlerRef = useRef(onLayerHit)
  const assetResolverRef = useRef(resolveAsset)
  const errorHandlerRef = useRef(onError)
  const beforeActionRef = useRef(beforeTeacherControllerAction)
  const teacherControllerProgressRef = useRef(teacherControllerProgressText)
  const actionHandlerRef = useRef(onTeacherControllerAction)
  const audioActionRef = useRef(executeAudioAction)
  const interactionActionsRef = useRef(interactionActions)
  const hostReadyRef = useRef(onHostReady)
  const interactionReadyRef = useRef(onInteractionReady)
  const modeRef = useRef(mode)
  const announcedInteractionContextRef = useRef<string | null>(null)
  const nativeTextCommitRef = useRef(onNativeTextCommit)
  hitHandlerRef.current = onLayerHit
  assetResolverRef.current = resolveAsset
  errorHandlerRef.current = onError
  beforeActionRef.current = beforeTeacherControllerAction
  teacherControllerProgressRef.current = teacherControllerProgressText
  actionHandlerRef.current = onTeacherControllerAction
  audioActionRef.current = executeAudioAction
  interactionActionsRef.current = interactionActions
  hostReadyRef.current = onHostReady
  interactionReadyRef.current = onInteractionReady
  modeRef.current = mode
  nativeTextCommitRef.current = onNativeTextCommit

  const transformSelections = useMemo<CourseCanvasLayerSelection[]>(() => {
    if (selectedLayerItems) {
      return selectedLayerItems.filter((selection) => selection.source !== 'world')
    }
    if (!selectedLayerItemId) return []
    const sceneItem = surface.scenes.find((scene) => scene.id === sceneId)
      ?.layerItems.find((item) => item.layerItemId === selectedLayerItemId)
    if (sceneItem) return [{ item: sceneItem, source: 'scene' }]
    const surfaceItem = surface.surfaceLayerItems
      .find((entry) => entry.item.layerItemId === selectedLayerItemId)?.item
    if (surfaceItem) return [{ item: surfaceItem, source: 'surface' }]
    const globalItem = globalLayerItems
      ?.find((entry) => entry.item.layerItemId === selectedLayerItemId)?.item
    return globalItem ? [{ item: globalItem, source: 'global' }] : []
  }, [globalLayerItems, sceneId, selectedLayerItemId, selectedLayerItems, surface])
  const transformSelectionIds = useMemo(
    () => transformSelections.map(({ item }) => item.layerItemId),
    [transformSelections],
  )
  const transformSelectionKey = transformSelectionIds.join('\u0000')
  const marqueeCandidates = useMemo(
    () => slideMarqueeCandidates(surface, sceneId, presentationStateId, locationId, globalLayerItems),
    [globalLayerItems, locationId, presentationStateId, sceneId, surface],
  )
  const canShowTransformOverlay = mode === 'inspect' &&
    Boolean(onLayerTransformCommit) &&
    transformSelections.length > 0

  const announceInteractionReady = useCallback(async (host: SlideSurfaceHost): Promise<void> => {
    if (modeRef.current !== 'playback') return
    const key = `${host.id}\u0000${host.sceneId}`
    if (announcedInteractionContextRef.current === key) return
    announcedInteractionContextRef.current = key
    await interactionReadyRef.current?.(host)
  }, [])
  const editingTextSelection = mode === 'inspect' && onNativeTextCommit
    ? editableNativeTextSelection(transformSelections, editingTextLayerItemId)
    : null

  useEffect(() => {
    if (editingTextLayerItemId && !editingTextSelection) setEditingTextLayerItemId(null)
  }, [editingTextLayerItemId, editingTextSelection])

  useEffect(() => {
    snapGuidesRef.current = []
    setSnapGuides([])
  }, [sceneId, transformSelectionKey])

  const previewSurface = useMemo(() => {
    if (!transformPreview) return surface
    const copy = structuredClone(surface)
    const byId = previewItemsById(transformPreview)
    const sourceById = new Map(transformSelections.map((selection) => [
      selection.item.layerItemId,
      selection.source,
    ]))
    const scene = copy.scenes.find((candidate) => candidate.id === sceneId)
    scene?.layerItems.forEach((item) => {
      if (sourceById.get(item.layerItemId) !== 'scene') return
      const preview = byId.get(item.layerItemId)
      applyPreviewGeometry(item, preview)
      if (!preview || !presentationStateId || !scene.presentation) return
      const state = scene.presentation.states.find((candidate) => candidate.id === presentationStateId)
      if (!state) return
      const existing = state.layerItemOverrides[item.layerItemId] ?? {}
      state.layerItemOverrides[item.layerItemId] = {
        ...existing,
        frame: { ...existing.frame, ...preview.frame },
        rotation: preview.rotation,
      }
    })
    copy.surfaceLayerItems.forEach(({ item }) => {
      if (sourceById.get(item.layerItemId) === 'surface') {
        applyPreviewGeometry(item, byId.get(item.layerItemId))
      }
    })
    return copy
  }, [presentationStateId, sceneId, surface, transformPreview, transformSelections])

  const previewGlobalLayerItems = useMemo(() => {
    if (!transformPreview) return globalLayerItems ?? []
    const copy = structuredClone(globalLayerItems ?? [])
    const byId = previewItemsById(transformPreview)
    const globalIds = new Set(transformSelections
      .filter((selection) => selection.source === 'global')
      .map((selection) => selection.item.layerItemId))
    copy.forEach(({ item }) => {
      if (globalIds.has(item.layerItemId)) applyPreviewGeometry(item, byId.get(item.layerItemId))
    })
    return copy
  }, [globalLayerItems, transformPreview, transformSelections])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateScale = () => {
      const availableWidth = viewport.clientWidth - 48
      const availableHeight = viewport.clientHeight - 48
      if (availableWidth <= 0 || availableHeight <= 0) return
      const next = clampSlideScale(Math.min(
        1,
        availableWidth / surface.canvas.width,
        availableHeight / surface.canvas.height,
      ))
      setSlideFitScale((current) => Math.abs(current - next) < 0.0001 ? current : next)
      if (slideZoomMode === 'fit') {
        setSlideScale((current) => Math.abs(current - next) < 0.0001 ? current : next)
      }
    }
    updateScale()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateScale)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [slideZoomMode, surface.canvas.height, surface.canvas.width])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.code !== 'Space' && event.key !== ' ') || event.repeat) return
      const viewport = viewportRef.current
      const active = document.activeElement
      if (!viewport || isEditableInteractionTarget(event.target) || (
        active !== viewport && !(active instanceof Node && viewport.contains(active))
      )) return
      event.preventDefault()
      slideSpacePressedRef.current = true
      setSlideSpacePressed(true)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (!slideSpacePressedRef.current) return
      event.preventDefault()
      slideSpacePressedRef.current = false
      setSlideSpacePressed(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      slideSpacePressedRef.current = false
    }
  }, [])

  const setManualSlideScale = (direction: -1 | 1) => {
    setSlideZoomMode('manual')
    setSlideScale((current) => clampSlideScale(
      Math.round((current + direction * SLIDE_SCALE_STEP) * 100) / 100,
    ))
  }

  const fitSlideToViewport = () => {
    setSlideZoomMode('fit')
    setSlideScale(slideFitScale)
  }

  const beginSlidePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldPan = event.button === 1 || (
      event.button === 0 && slideSpacePressedRef.current
    )
    if (!shouldPan || isEditableInteractionTarget(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    const viewport = event.currentTarget
    viewport.focus({ preventScroll: true })
    if (typeof viewport.setPointerCapture === 'function') {
      viewport.setPointerCapture(event.pointerId)
    }
    slidePanRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
    }
    setSlidePanning(true)
  }

  const updateSlidePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = slidePanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.scrollLeft = Math.max(
      0,
      pan.startScrollLeft - (event.clientX - pan.startClientX),
    )
    event.currentTarget.scrollTop = Math.max(
      0,
      pan.startScrollTop - (event.clientY - pan.startClientY),
    )
  }

  const finishSlidePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = slidePanRef.current
    if (!pan || pan.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    slidePanRef.current = null
    setSlidePanning(false)
    if (typeof event.currentTarget.releasePointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const slideClientToLogical = (clientX: number, clientY: number): LogicalPoint => {
    const bounds = mountRef.current?.getBoundingClientRect()
    return {
      x: (clientX - (bounds?.left ?? 0)) / slideScale,
      y: (clientY - (bounds?.top ?? 0)) / slideScale,
    }
  }

  const beginSlideMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || mode !== 'inspect' || !onLayerSelectionChange) return
    const target = event.target instanceof Element ? event.target : null
    const layer = target?.closest<HTMLElement>('.slide-layer-item')
    if (layer) {
      const selection = marqueeCandidates.find(({ item }) => (
        item.layerItemId === layer.dataset.layerItemId
      ))
      if (selection) {
        const next = updateCanvasLayerSelection(
          transformSelections,
          [selection],
          event.shiftKey,
        )
        onLayerSelectionChange(next.selections, next.primaryId)
      }
      return
    }
    const transformAction = target?.closest<HTMLElement>('[data-course-transform-action]')
    if (transformAction) {
      if (
        event.shiftKey &&
        transformAction.dataset.courseTransformAction === 'move'
      ) {
        const logical = slideClientToLogical(event.clientX, event.clientY)
        const selection = [...marqueeCandidates].reverse().find(({ item }) => (
          courseItemContainsLogicalPoint(item, logical)
        ))
        if (selection) {
          event.preventDefault()
          event.stopPropagation()
          const next = updateCanvasLayerSelection(transformSelections, [selection], true)
          onLayerSelectionChange(next.selections, next.primaryId)
        }
      }
      return
    }
    if (isEditableInteractionTarget(event.target)) return
    const logical = slideClientToLogical(event.clientX, event.clientY)
    const insideCanvas = logical.x >= 0 && logical.y >= 0 &&
      logical.x <= surface.canvas.width && logical.y <= surface.canvas.height
    if (!insideCanvas) {
      if (!event.shiftKey) onLayerSelectionChange([], undefined)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const gesture: CourseCanvasMarqueeGesture = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startLogical: logical,
      currentLogical: logical,
      shiftKey: event.shiftKey,
      initialSelections: [...transformSelections],
    }
    slideMarqueeRef.current = gesture
    setSlideMarquee(courseLogicalRectFromPoints(logical, logical))
  }

  const updateSlideMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = slideMarqueeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const logical = slideClientToLogical(event.clientX, event.clientY)
    gesture.currentLogical = logical
    setSlideMarquee(courseLogicalRectFromPoints(gesture.startLogical, logical))
  }

  const finishSlideMarquee = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const gesture = slideMarqueeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const logical = slideClientToLogical(event.clientX, event.clientY)
    slideMarqueeRef.current = null
    setSlideMarquee(null)
    if (typeof event.currentTarget.releasePointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!cancelled && onLayerSelectionChange) {
      completeCanvasMarquee(
        gesture,
        { x: event.clientX, y: event.clientY },
        logical,
        marqueeCandidates,
        onLayerSelectionChange,
      )
    }
  }

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const abort = new AbortController()
    const host = new SlideSurfaceHost(surface, {
      initialSceneId: sceneId,
      initialStateId: presentationStateId,
      onLayerHit: (hit) => {
        if (hit.field === 'content.data.text' && nativeTextCommitRef.current) {
          setEditingTextLayerItemId(hit.layerItemId)
        }
        hitHandlerRef.current(hit)
      },
      componentHostFactory,
      runtimeHostFactory,
      globalLayerItems,
      resolveLocationId: () => locationIdRef.current,
      interactionEvents,
      executeAudioAction: (action) => audioActionRef.current?.(action),
      emitInteractionMediaEvents: false,
      deferInteractionEntry: true,
      interactionActions: {
        goToScene: (targetSceneId, stateId) => interactionActionsRef.current?.goToScene?.(targetSceneId, stateId) ?? false,
        nextScene: () => interactionActionsRef.current?.nextScene?.() ?? false,
        previousScene: () => interactionActionsRef.current?.previousScene?.() ?? false,
        replayScene: () => interactionActionsRef.current?.replayScene?.() ?? false,
        restartCourse: () => interactionActionsRef.current?.restartCourse?.() ?? false,
      },
      beforeTeacherControllerAction: (action, item) => beforeActionRef.current?.(action, item) ?? true,
      teacherControllerProgressText: () => teacherControllerProgressRef.current?.() ?? '',
      onTeacherControllerAction: (action, item) => actionHandlerRef.current?.(action, item),
    })
    hostRef.current = host
    hostReadyRef.current?.(host)
    void host.mount({
      surfaceId: surface.id,
      container: mount,
      signal: abort.signal,
      services: {
        navigate: () => undefined,
        getCourseState: () => undefined,
        setCourseState: () => undefined,
        resolveAsset: (assetId) => assetResolverRef.current(assetId),
        reportDiagnostic: (diagnostic) => errorHandlerRef.current(diagnostic.message),
      },
    }).then(async () => {
      // Inspection must be established before activation so editor mount never
      // fires scene-enter rules behind the teacher's back.
      await host.setInspectionMode(mode)
      await host.activate()
      await announceInteractionReady(host)
    }).catch((error: unknown) => {
      errorHandlerRef.current(error instanceof Error ? error.message : '画布挂载失败')
    })
    return () => {
      abort.abort()
      hostRef.current = null
      hostReadyRef.current?.(null)
      void host.destroy()
    }
    // A surface identity change creates a new host. Content updates are reconciled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announceInteractionReady, componentHostFactory, interactionEvents, runtimeHostFactory, surface.id])

  useEffect(() => {
    void hostRef.current?.updateDocument(previewSurface).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '画布更新失败')
    })
  }, [locationId, previewSurface])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    void host.setScene(sceneId).then(() => announceInteractionReady(host)).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '场景切换失败')
    })
  }, [announceInteractionReady, sceneId])

  useEffect(() => {
    if (mode !== 'inspect') return
    const host = hostRef.current
    if (!host || host.stateId === presentationStateId) return
    void host.setPresentationState(presentationStateId).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '命名复核态切换失败')
    })
  }, [mode, presentationStateId])

  useEffect(() => {
    void hostRef.current?.updateGlobalLayerItems(previewGlobalLayerItems).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '全局图层更新失败')
    })
  }, [previewGlobalLayerItems])

  useEffect(() => {
    if (mode === 'inspect') announcedInteractionContextRef.current = null
    const host = hostRef.current
    if (!host) return
    void host.setInspectionMode(mode).then(() => announceInteractionReady(host)).catch((error: unknown) => {
      onError(error instanceof Error ? error.message : '编辑帧切换失败')
    })
  }, [announceInteractionReady, mode])

  useEffect(() => {
    const root = mountRef.current
    root?.querySelectorAll('.slide-layer-item[data-studio-selected="true"]').forEach((element) => {
      delete (element as HTMLElement).dataset.studioSelected
    })
    if (canShowTransformOverlay) return
    const selectedIds = new Set(transformSelectionIds)
    ;[...(root?.querySelectorAll<HTMLElement>('.slide-layer-item') ?? [])]
      .filter((element) => selectedIds.has(element.dataset.layerItemId ?? ''))
      .forEach((element) => { element.dataset.studioSelected = 'true' })
  }, [canShowTransformOverlay, previewSurface, transformSelectionIds])

  return (
    <div
      className="course-slide-viewport"
      data-testid="course-slide-canvas"
      style={{ padding: 0, overflow: 'hidden' }}
    >
      <div
        ref={viewportRef}
        data-testid="course-slide-scroll-viewport"
        tabIndex={0}
        aria-label="幻灯片画布视口"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'auto',
          padding: 24,
          outline: 'none',
          cursor: slidePanning ? 'grabbing' : slideSpacePressed ? 'grab' : 'default',
          touchAction: 'none',
        }}
        onPointerDownCapture={(event) => {
          beginSlidePan(event)
          if (!slidePanRef.current) beginSlideMarquee(event)
        }}
        onPointerMoveCapture={(event) => {
          updateSlidePan(event)
          updateSlideMarquee(event)
        }}
        onPointerUpCapture={(event) => {
          finishSlidePan(event)
          finishSlideMarquee(event, false)
        }}
        onPointerCancelCapture={(event) => {
          finishSlidePan(event)
          finishSlideMarquee(event, true)
        }}
        onPointerDown={(event) => {
          if (event.button === 0 && event.target === event.currentTarget) {
            event.currentTarget.focus({ preventScroll: true })
          }
        }}
      >
        <div
          className="course-slide-mount"
          style={{
            position: 'relative',
            width: surface.canvas.width * slideScale,
            height: surface.canvas.height * slideScale,
          }}
        >
        <div
          ref={mountRef}
          className="course-slide-host"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: surface.canvas.width,
            height: surface.canvas.height,
            transform: `scale(${slideScale})`,
            transformOrigin: 'top left',
          }}
        />
        {(canShowTransformOverlay || editingTextSelection || slideMarquee) && (
          <div
            className="course-slide-transform-layer"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: surface.canvas.width,
              height: surface.canvas.height,
              transform: `scale(${slideScale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          >
            {slideMarquee && (
              <CourseCanvasMarquee
                rect={slideMarquee}
                visualScale={slideScale}
                surface="slide"
              />
            )}
            {snapGuides.map((guide) => (
              <div
                key={`${guide.axis}:${guide.kind}:${guide.value}`}
                data-course-snap-guide={`${guide.axis}:${guide.kind}`}
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  zIndex: 2_147_482_999,
                  ...(guide.axis === 'x'
                    ? {
                      left: guide.value,
                      top: 0,
                      width: 1 / slideScale,
                      height: surface.canvas.height,
                      transform: 'translateX(-50%)',
                    }
                    : {
                      left: 0,
                      top: guide.value,
                      width: surface.canvas.width,
                      height: 1 / slideScale,
                      transform: 'translateY(-50%)',
                    }),
                  background: guide.kind === 'grid' ? '#0ea5e9' : '#ec4899',
                  boxShadow: `0 0 0 ${0.5 / slideScale}px rgba(255, 255, 255, 0.8)`,
                }}
              />
            ))}
            {canShowTransformOverlay && !editingTextSelection && (
              <CourseTransformOverlay
                items={transformSelections.map(({ item }) => item)}
                selectedLayerItemIds={transformSelectionIds}
                clientDeltaToLogicalDelta={(delta) => ({
                  x: delta.x / slideScale,
                  y: delta.y / slideScale,
                })}
                captureInterior={overlayMayCaptureInterior(transformSelections)}
                handleSize={10 / slideScale}
                rotationHandleOffset={30 / slideScale}
                applyTransform={(request) => {
                  const transformed = applyCourseTransformRequest(request)
                  if (request.disableSnapping || (
                    request.kind !== 'move' && request.kind !== 'resize'
                  )) {
                    snapGuidesRef.current = []
                    return transformed
                  }
                  const snapped = snapCourseTransformItems(
                    transformed,
                    request.kind,
                    request.resizeHandle,
                    {
                      canvas: surface.canvas,
                      gridSize: 8,
                      threshold: 6,
                      minimumSize: request.minimumSize,
                    },
                  )
                  snapGuidesRef.current = snapped.guides
                  return snapped.items
                }}
                onPreview={(change) => {
                  setSnapGuides([...snapGuidesRef.current])
                  setTransformPreview(change.items.map((item) => ({ ...item, frame: { ...item.frame } })))
                  onLayerTransformPreview?.(change)
                }}
                onCommit={(change) => {
                  snapGuidesRef.current = []
                  setSnapGuides([])
                  setTransformPreview(null)
                  onLayerTransformCommit?.(change)
                }}
                onCancel={() => {
                  snapGuidesRef.current = []
                  setSnapGuides([])
                  setTransformPreview(null)
                }}
                onDoubleClickSelection={() => {
                  if (transformSelections.length !== 1) return
                  const selection = transformSelections[0]
                  if (selection.source === 'world') return
                  const detail = nativePrimaryAuthoringDetail(selection.item)
                  if (!detail) return
                  onLayerHit({
                    surfaceId: surface.id,
                    sceneId,
                    layerItemId: selection.item.layerItemId,
                    kind: selection.item.kind,
                    order: selection.item.order,
                    source: selection.source,
                    ...detail,
                  })
                  if (detail.field === 'content.data.text' && onNativeTextCommit && !selection.item.locked) {
                    setEditingTextLayerItemId(selection.item.layerItemId)
                  }
                }}
              />
            )}
            {editingTextSelection && onNativeTextCommit && (
              <NativeLayerTextEditor
                selection={editingTextSelection}
                onCommit={onNativeTextCommit}
                onCancel={() => setEditingTextLayerItemId(null)}
              />
            )}
          </div>
        )}
        </div>
      </div>
      <div
        role="toolbar"
        aria-label="幻灯片画布缩放"
        data-course-slide-viewport-control
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 2_147_483_100,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          border: '1px solid #cbd5e1',
          borderRadius: 8,
          background: 'rgba(255, 255, 255, 0.96)',
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.14)',
        }}
      >
        <button
          type="button"
          aria-label="缩小画布"
          disabled={slideScale <= SLIDE_MIN_SCALE + 0.0001}
          onClick={() => setManualSlideScale(-1)}
        >
          缩小
        </button>
        <button
          type="button"
          aria-label="适合窗口"
          aria-pressed={slideZoomMode === 'fit'}
          onClick={fitSlideToViewport}
        >
          适合窗口
        </button>
        <output
          aria-label="画布缩放比例"
          style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
        >
          {Math.round(slideScale * 100)}%
        </output>
        <button
          type="button"
          aria-label="放大画布"
          disabled={slideScale >= SLIDE_MAX_SCALE - 0.0001}
          onClick={() => setManualSlideScale(1)}
        >
          放大
        </button>
      </div>
    </div>
  )
}

function blockSearchText(block: FlowBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote': return `${block.text} ${block.type === 'quote' ? block.citation ?? '' : ''}`
    case 'list': return block.items.map((item) => item.text).join(' ')
    case 'media': return `${block.caption ?? ''} ${block.altText ?? ''}`
    case 'table': return `${block.caption ?? ''} ${block.columns.map((column) => column.header).join(' ')} ${block.rows.flatMap((row) => Object.values(row.cells)).join(' ')}`
    case 'formula': return `${block.accessibleText} ${serializeFormulaAst(block.ast)}`
    case 'code': return `${block.language ?? ''} ${block.code}`
    case 'callout': return `${block.title ?? ''} ${block.body}`
    case 'section': return `${block.title} ${block.blocks.map(blockSearchText).join(' ')}`
    case 'component': return `${block.component.packageId} ${block.component.version}`
    case 'divider': return ''
  }
}

export function flattenFlowBlocks(blocks: readonly FlowBlock[]): FlowBlock[] {
  return blocks.flatMap((block) => [
    block,
    ...(block.type === 'section' ? flattenFlowBlocks(block.blocks) : []),
  ])
}

export function flowBlockPrimaryText(block: FlowBlock): string | null {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'quote': return block.text
    case 'list': return block.items.map((item) => item.text).join('\n')
    case 'code': return block.code
    case 'callout': return block.body
    case 'section': return block.title
    case 'table': return block.caption ?? ''
    case 'formula': return block.accessibleText
    case 'media': return block.caption ?? block.altText ?? ''
    case 'component': return '互动组件'
    case 'divider': return null
  }
}

interface EditableBlockTextProps {
  block: FlowBlock
  disabled: boolean
  onCommit(value: string): void
}

function EditableBlockText({ block, disabled, onCommit }: EditableBlockTextProps) {
  if (block.type === 'list') {
    return <EditableFlowList block={block} disabled={disabled} onCommit={onCommit} />
  }
  return <EditableSimpleBlockText block={block} disabled={disabled} onCommit={onCommit} />
}

function EditableSimpleBlockText({ block, disabled, onCommit }: EditableBlockTextProps) {
  const source = flowBlockPrimaryText(block)
  const [value, setValue] = useState(source ?? '')
  useEffect(() => setValue(source ?? ''), [block.id, source])
  if (source === null) return <hr />
  if (block.type === 'component') return <div className="course-flow-component">{source}</div>
  return (
    <textarea
      className={`course-flow-text course-flow-text--${block.type}`}
      aria-label={`编辑${flowBlockTeacherLabel(block.type)}`}
      value={value}
      readOnly={disabled}
      rows={block.type === 'heading' ? 1 : block.type === 'code' ? 7 : Math.max(2, value.split('\n').length)}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (!disabled && value !== source) onCommit(value)
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

function EditableFlowList({
  block,
  disabled,
  onCommit,
}: {
  block: Extract<FlowBlock, { type: 'list' }>
  disabled: boolean
  onCommit(value: string): void
}) {
  const source = block.items.map((item) => item.text).join('\n')
  const [values, setValues] = useState(() => Object.fromEntries(
    block.items.map((item) => [item.id, item.text]),
  ))
  useEffect(() => setValues(Object.fromEntries(
    block.items.map((item) => [item.id, item.text]),
  )), [block.id, source])
  const tree = flowListItemsToTree(block.items)
  const commit = () => {
    const next = block.items.map((item) => values[item.id] ?? item.text).join('\n')
    if (!disabled && next !== source) onCommit(next)
  }
  const renderTree = (nodes: readonly FlowListTreeNode[]): ReactNode => {
    const ListTag = block.ordered ? 'ol' : 'ul'
    return (
      <ListTag className="course-flow-list" data-list-depth={nodes[0]?.item.level ?? 0}>
        {nodes.map((node) => (
          <li key={node.item.id} data-flow-list-item-id={node.item.id} data-flow-list-level={node.item.level}>
            <input
              aria-label={`编辑列表项：${node.item.text}`}
              value={values[node.item.id] ?? node.item.text}
              readOnly={disabled}
              onChange={(event) => setValues((current) => ({ ...current, [node.item.id]: event.target.value }))}
              onBlur={commit}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') event.currentTarget.blur()
              }}
            />
            {node.children.length > 0 && renderTree(node.children)}
          </li>
        ))}
      </ListTag>
    )
  }
  return renderTree(tree)
}

interface FlowCanvasProps {
  surface: FlowSurfaceDocument
  mode: StudioMode
  selectedBlockId: string | null
  search: string
  resolveAsset(assetId: string): string | undefined
  onSelect(blockId: string): void
  onEdit(blockId: string, value: string): void
  onBlockMove?(request: FlowBlockMoveRequest): void
  renderComponent?(
    block: Extract<FlowBlock, { type: 'component' }>,
    dom: Document,
    mode: StudioMode,
    reportHit: (detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }) => void,
  ): FlowRenderedComponent
  selectedLayerItemId?: string | null
  selectedLayerItems?: readonly CourseCanvasLayerSelection[]
  globalLayerItems?: readonly ScopedLayerItem[]
  locationId?: string
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  beforeTeacherControllerAction?: SlideSurfaceHostOptions['beforeTeacherControllerAction']
  teacherControllerProgressText?: SlideSurfaceHostOptions['teacherControllerProgressText']
  onTeacherControllerAction?: SlideSurfaceHostOptions['onTeacherControllerAction']
  onLayerHit?(hit: FlowLayerHit): void
  onLayerSelectionChange?: CourseCanvasLayerSelectionHandler
  onLayerTransformPreview?: CourseCanvasTransformHandler
  onLayerTransformCommit?: CourseCanvasTransformHandler
  onNativeTextCommit?: CourseCanvasNativeTextCommitHandler
  onComponentHit?(blockId: string, detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }): void
  onError?(message: string): void
}

const FLOW_LOGICAL_OVERLAY_WIDTH = 1280
const FLOW_LOGICAL_OVERLAY_HEIGHT = 720

/** Fits Flow's unified authored layer plane without changing Project coordinates. */
export function fitFlowLogicalOverlayScale(availableWidth: number): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return 1
  return Math.min(1, availableWidth / FLOW_LOGICAL_OVERLAY_WIDTH)
}

const FLOW_BLOCK_DRAG_MIME = 'application/x-ittoedu-flow-block-id'

interface FlowBlockDragState {
  blockId: string
  activeZone: string | null
  request: FlowBlockMoveRequest | null
  feedback: string
}

interface FlowBlockPointerGesture {
  pointerId: number
  blockId: string
  startClientX: number
  startClientY: number
  started: boolean
}

function FlowLiveComponent({
  surfaceId,
  block,
  mode,
  renderComponent,
  onHit,
}: {
  surfaceId: string
  block: Extract<FlowBlock, { type: 'component' }>
  mode: StudioMode
  renderComponent: NonNullable<FlowCanvasProps['renderComponent']>
  onHit(detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }): void
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const renderedRef = useRef<FlowRenderedComponent | null>(null)
  const hitRef = useRef(onHit)
  const contentSignature = JSON.stringify({ component: block.component, props: block.props })
  hitRef.current = onHit
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const rendered = renderComponent(block, mount.ownerDocument, mode, (detail) => hitRef.current(detail))
    renderedRef.current = rendered
    mount.replaceChildren(rendered.node)
    void rendered.setInspectionMode?.(mode)
    void rendered.activate?.()
    return () => {
      renderedRef.current = null
      void rendered.destroy?.()
      mount.replaceChildren()
    }
  }, [block.id, contentSignature, renderComponent])
  useEffect(() => {
    void renderedRef.current?.setInspectionMode?.(mode)
    if (mode === 'playback') void renderedRef.current?.resume?.()
    else void renderedRef.current?.suspend?.()
  }, [mode])
  return <div ref={mountRef} className="course-flow-component-mount" data-surface-id={surfaceId} data-flow-component-block-id={block.id} />
}

function FlowLiveMedia({
  block,
  mode,
  source,
  onCommit,
}: {
  block: Extract<FlowBlock, { type: 'media' }>
  mode: StudioMode
  source: string | undefined
  onCommit(value: string): void
}) {
  const rootRef = useRef<HTMLElement>(null)
  const freezeRef = useRef<DomPlaybackFreeze | null>(null)
  if (!freezeRef.current) freezeRef.current = new DomPlaybackFreeze()

  useEffect(() => {
    const freeze = freezeRef.current
    if (!freeze) return
    if (mode === 'inspect') freeze.freeze(rootRef.current)
    else freeze.release()
  }, [mode])

  useEffect(() => () => freezeRef.current?.discard(), [])

  return (
    <figure ref={rootRef} className="course-flow-live-media" data-layout={block.layout}>
      {block.mediaKind === 'image'
        ? <img src={source} alt={block.altText ?? ''} data-asset-id={block.assetId} />
        : block.mediaKind === 'video'
          ? <video src={source} controls aria-label={block.altText ?? block.caption ?? 'video'} data-asset-id={block.assetId} />
          : <audio src={source} controls aria-label={block.altText ?? block.caption ?? 'audio'} data-asset-id={block.assetId} />}
      <figcaption>
        <EditableBlockText block={block} disabled={mode === 'playback'} onCommit={onCommit} />
      </figcaption>
    </figure>
  )
}

export function FlowCourseCanvas({
  surface,
  mode,
  selectedBlockId,
  search,
  resolveAsset,
  onSelect,
  onEdit,
  onBlockMove,
  renderComponent,
  selectedLayerItemId = null,
  selectedLayerItems,
  globalLayerItems = [],
  locationId,
  componentHostFactory,
  runtimeHostFactory,
  beforeTeacherControllerAction,
  teacherControllerProgressText,
  onTeacherControllerAction,
  onLayerHit,
  onLayerSelectionChange,
  onLayerTransformPreview,
  onLayerTransformCommit,
  onNativeTextCommit,
  onComponentHit,
  onError,
}: FlowCanvasProps) {
  const flowStageRef = useRef<HTMLDivElement>(null)
  const overlayMountRef = useRef<HTMLDivElement>(null)
  const overlayHostRef = useRef<FlowScopedLayerHost | null>(null)
  const [flowLogicalOverlayScale, setFlowLogicalOverlayScale] = useState(1)
  const [transformPreview, setTransformPreview] = useState<CourseTransformItem[] | null>(null)
  const [flowMarquee, setFlowMarquee] = useState<CourseLogicalRect | null>(null)
  const [flowBlockDrag, setFlowBlockDrag] = useState<FlowBlockDragState | null>(null)
  const flowBlockDragRef = useRef<FlowBlockDragState | null>(null)
  const flowDropCommittedRef = useRef(false)
  const flowDragCancelledRef = useRef(false)
  const flowBlockPointerRef = useRef<FlowBlockPointerGesture | null>(null)
  const flowBlockPointerCleanupRef = useRef<(() => void) | null>(null)
  const flowMarqueeRef = useRef<CourseCanvasMarqueeGesture | null>(null)
  const [editingTextLayerItemId, setEditingTextLayerItemId] = useState<string | null>(null)
  const layerHitRef = useRef(onLayerHit)
  const errorRef = useRef(onError)
  const beforeActionRef = useRef(beforeTeacherControllerAction)
  const teacherControllerProgressRef = useRef(teacherControllerProgressText)
  const actionRef = useRef(onTeacherControllerAction)
  const nativeTextCommitRef = useRef(onNativeTextCommit)
  layerHitRef.current = onLayerHit
  errorRef.current = onError
  beforeActionRef.current = beforeTeacherControllerAction
  teacherControllerProgressRef.current = teacherControllerProgressText
  actionRef.current = onTeacherControllerAction
  nativeTextCommitRef.current = onNativeTextCommit
  useEffect(() => {
    const stage = flowStageRef.current
    if (!stage) return
    const update = () => {
      const next = fitFlowLogicalOverlayScale(stage.clientWidth)
      setFlowLogicalOverlayScale((current) => (
        Math.abs(current - next) < 0.001 ? current : next
      ))
    }
    update()
    const ResizeObserverConstructor = stage.ownerDocument.defaultView?.ResizeObserver
      ?? globalThis.ResizeObserver
    if (!ResizeObserverConstructor) return
    const observer = new ResizeObserverConstructor(update)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [surface.id])
  const transformSelections = useMemo<CourseCanvasLayerSelection[]>(() => {
    if (selectedLayerItems) {
      return selectedLayerItems.filter((selection) => (
        selection.source === 'surface' || selection.source === 'global'
      ))
    }
    if (!selectedLayerItemId) return []
    const surfaceItem = surface.surfaceLayerItems
      .find((entry) => entry.item.layerItemId === selectedLayerItemId)?.item
    if (surfaceItem) return [{ item: surfaceItem, source: 'surface' }]
    const globalItem = globalLayerItems
      .find((entry) => entry.item.layerItemId === selectedLayerItemId)?.item
    return globalItem ? [{ item: globalItem, source: 'global' }] : []
  }, [globalLayerItems, selectedLayerItemId, selectedLayerItems, surface.surfaceLayerItems])
  const transformSelectionIds = useMemo(
    () => transformSelections.map(({ item }) => item.layerItemId),
    [transformSelections],
  )
  const marqueeCandidates = useMemo(
    () => flowMarqueeCandidates(surface, locationId, globalLayerItems),
    [globalLayerItems, locationId, surface],
  )
  const canShowTransformOverlay = mode === 'inspect' &&
    Boolean(onLayerTransformCommit) &&
    transformSelections.length > 0
  const editingTextSelection = mode === 'inspect' && onNativeTextCommit
    ? editableNativeTextSelection(transformSelections, editingTextLayerItemId)
    : null
  useEffect(() => {
    if (editingTextLayerItemId && !editingTextSelection) setEditingTextLayerItemId(null)
  }, [editingTextLayerItemId, editingTextSelection])
  const previewSurface = useMemo(() => {
    if (!transformPreview) return surface
    const copy = structuredClone(surface)
    const byId = previewItemsById(transformPreview)
    const surfaceIds = new Set(transformSelections
      .filter((selection) => selection.source === 'surface')
      .map((selection) => selection.item.layerItemId))
    copy.surfaceLayerItems.forEach(({ item }) => {
      if (surfaceIds.has(item.layerItemId)) applyPreviewGeometry(item, byId.get(item.layerItemId))
    })
    return copy
  }, [surface, transformPreview, transformSelections])
  const previewGlobalLayerItems = useMemo(() => {
    if (!transformPreview) return globalLayerItems
    const copy = structuredClone(globalLayerItems)
    const byId = previewItemsById(transformPreview)
    const globalIds = new Set(transformSelections
      .filter((selection) => selection.source === 'global')
      .map((selection) => selection.item.layerItemId))
    copy.forEach(({ item }) => {
      if (globalIds.has(item.layerItemId)) applyPreviewGeometry(item, byId.get(item.layerItemId))
    })
    return copy
  }, [globalLayerItems, transformPreview, transformSelections])
  useEffect(() => {
    const mount = overlayMountRef.current
    if (!mount) return
    const controller = new AbortController()
    const host = new FlowScopedLayerHost(surface, {
      componentHostFactory,
      runtimeHostFactory,
      globalLayerItems,
      locationId,
      inspectionMode: mode,
      beforeTeacherControllerAction: (action, item) => beforeActionRef.current?.(action, item) ?? true,
      teacherControllerProgressText: () => teacherControllerProgressRef.current?.() ?? '',
      onTeacherControllerAction: (action, item) => actionRef.current?.(action, item),
      onLayerHit: (hit) => {
        if (hit.field === 'content.data.text' && nativeTextCommitRef.current) {
          setEditingTextLayerItemId(hit.layerItemId)
        }
        layerHitRef.current?.(hit)
      },
    })
    overlayHostRef.current = host
    void host.mount({
      surfaceId: surface.id,
      container: mount,
      signal: controller.signal,
      services: {
        navigate: () => undefined,
        getCourseState: () => undefined,
        setCourseState: () => undefined,
        resolveAsset,
        reportDiagnostic: (diagnostic) => errorRef.current?.(diagnostic.message),
      },
    }).then(async () => {
      await host.activate()
      if (!selectedLayerItemId) return
      const wrapper = [...mount.querySelectorAll<HTMLElement>('.slide-layer-item')]
        .find((element) => element.dataset.layerItemId === selectedLayerItemId)
      if (wrapper) wrapper.dataset.studioSelected = 'true'
    }).catch((cause: unknown) => {
      errorRef.current?.(cause instanceof Error ? cause.message : 'Flow 图层挂载失败')
    })
    return () => {
      controller.abort()
      overlayHostRef.current = null
      void host.destroy()
    }
    // Stable backend factories and surface identity own the live instances.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentHostFactory, runtimeHostFactory, surface.id])
  useEffect(() => {
    void overlayHostRef.current?.updateDocument(previewSurface).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : 'Flow 图层更新失败')
    })
  }, [onError, previewSurface])
  useEffect(() => {
    void overlayHostRef.current?.updateGlobalLayerItems(previewGlobalLayerItems).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '全局图层更新失败')
    })
  }, [onError, previewGlobalLayerItems])
  useEffect(() => {
    if (!locationId) return
    void overlayHostRef.current?.setLocationId(locationId).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : 'Flow 位置可见性更新失败')
    })
  }, [locationId, onError])
  useEffect(() => {
    void overlayHostRef.current?.setInspectionMode(mode).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : 'Flow 编辑帧切换失败')
    })
  }, [mode, onError])
  useEffect(() => {
    const root = overlayMountRef.current
    root?.querySelectorAll('.slide-layer-item[data-studio-selected="true"]').forEach((element) => {
      delete (element as HTMLElement).dataset.studioSelected
    })
    if (canShowTransformOverlay) return
    const selectedIds = new Set(transformSelectionIds)
    ;[...(root?.querySelectorAll<HTMLElement>('.slide-layer-item') ?? [])]
      .filter((element) => selectedIds.has(element.dataset.layerItemId ?? ''))
      .forEach((element) => { element.dataset.studioSelected = 'true' })
  }, [canShowTransformOverlay, previewGlobalLayerItems, previewSurface, transformSelectionIds])
  const query = search.trim().toLocaleLowerCase('zh-CN')
  const blocks = query
    ? flattenFlowBlocks(surface.blocks).filter((block) => blockSearchText(block).toLocaleLowerCase('zh-CN').includes(query))
    : surface.blocks
  const canDragFlowBlocks = mode === 'inspect' && Boolean(onBlockMove) && query.length === 0
  useEffect(() => {
    flowBlockDragRef.current = flowBlockDrag
  }, [flowBlockDrag])
  useEffect(() => {
    if (!canDragFlowBlocks) {
      flowBlockPointerCleanupRef.current?.()
      flowBlockPointerCleanupRef.current = null
      flowBlockPointerRef.current = null
      setFlowBlockDrag(null)
    }
  }, [canDragFlowBlocks, surface.id])
  useEffect(() => {
    if (!flowBlockDrag) return
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      flowDragCancelledRef.current = true
      flowBlockPointerCleanupRef.current?.()
      flowBlockPointerCleanupRef.current = null
      flowBlockPointerRef.current = null
      flowBlockDragRef.current = null
      setFlowBlockDrag(null)
    }
    window.addEventListener('keydown', cancelWithEscape)
    return () => window.removeEventListener('keydown', cancelWithEscape)
  }, [flowBlockDrag])

  const draggingBlockId = (event: ReactDragEvent<HTMLElement>): string | null => {
    if (!canDragFlowBlocks) return null
    const transferred = event.dataTransfer.getData(FLOW_BLOCK_DRAG_MIME)
    return flowBlockDrag?.blockId ?? (transferred || null)
  }

  const flowDropZoneKey = (parentId: string | null, slotIndex: number): string => (
    `${parentId ?? '$document'}:${slotIndex}`
  )

  const flowDropDescription = (parentId: string | null, targetIndex: number): string => {
    if (parentId === null) return `放到文档顶层第 ${targetIndex + 1} 个位置`
    const section = flattenFlowBlocks(surface.blocks).find((block) => block.id === parentId)
    const sectionName = section?.type === 'section' && section.title.trim()
      ? `“${section.title.trim().slice(0, 28)}”`
      : `“${parentId}”`
    return `放到分节${sectionName}的第 ${targetIndex + 1} 个位置`
  }

  const updateFlowBlockDropPreview = (
    blockId: string,
    targetParentId: string | null,
    targetSlotIndex: number,
  ) => {
    const activeZone = flowDropZoneKey(targetParentId, targetSlotIndex)
    try {
      const request = createFlowBlockMoveRequest(
        surface.blocks,
        blockId,
        targetParentId,
        targetSlotIndex,
      )
      const nextDrag: FlowBlockDragState = {
        blockId,
        activeZone,
        request,
        feedback: request
          ? flowDropDescription(targetParentId, request.targetIndex)
          : '当前位置无需移动',
      }
      flowBlockDragRef.current = nextDrag
      setFlowBlockDrag(nextDrag)
    } catch (cause) {
      const nextDrag: FlowBlockDragState = {
        blockId,
        activeZone,
        request: null,
        feedback: cause instanceof Error ? cause.message : '这里不能放置该内容块',
      }
      flowBlockDragRef.current = nextDrag
      setFlowBlockDrag(nextDrag)
    }
  }

  const previewFlowBlockDrop = (
    event: ReactDragEvent<HTMLElement>,
    targetParentId: string | null,
    targetSlotIndex: number,
  ) => {
    const blockId = draggingBlockId(event)
    if (!blockId) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    updateFlowBlockDropPreview(blockId, targetParentId, targetSlotIndex)
  }

  const commitFlowBlockDrop = (
    event: ReactDragEvent<HTMLElement>,
    targetParentId: string | null,
    targetSlotIndex: number,
  ) => {
    const blockId = draggingBlockId(event)
    if (!blockId || !onBlockMove) return
    event.preventDefault()
    event.stopPropagation()
    try {
      const request = createFlowBlockMoveRequest(
        surface.blocks,
        blockId,
        targetParentId,
        targetSlotIndex,
      )
      if (request) {
        flowDropCommittedRef.current = true
        onBlockMove(request)
      }
    } finally {
      flowBlockDragRef.current = null
      setFlowBlockDrag(null)
    }
  }

  const finishFlowBlockNativeDrag = () => {
    const drag = flowBlockDragRef.current
    if (
      !flowDropCommittedRef.current &&
      !flowDragCancelledRef.current &&
      drag?.activeZone &&
      drag.request &&
      onBlockMove
    ) {
      // Chromium can finish a native HTML drag over a valid React drop zone
      // without delivering React's synthetic `drop`. The last accepted drag
      // request is already a complete structural command, so dragend is the
      // reliable release boundary. The committed flag prevents a real drop
      // from submitting it twice.
      onBlockMove(drag.request)
    }
    flowDropCommittedRef.current = false
    flowDragCancelledRef.current = false
    flowBlockDragRef.current = null
    setFlowBlockDrag(null)
  }


  const beginFlowBlockPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    blockId: string,
    feedback: string,
  ) => {
    if (!canDragFlowBlocks || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    flowDropCommittedRef.current = false
    flowDragCancelledRef.current = false
    flowBlockPointerRef.current = {
      pointerId: event.pointerId,
      blockId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      started: false,
    }
    const nextDrag: FlowBlockDragState = {
      blockId,
      activeZone: null,
      request: null,
      feedback,
    }
    flowBlockDragRef.current = nextDrag
    setFlowBlockDrag(nextDrag)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    onSelect(blockId)
    const dom = event.currentTarget.ownerDocument
    const view = dom.defaultView
    if (view) {
      const pointerId = event.pointerId
      const isMousePointer = !event.pointerType || event.pointerType === 'mouse'
      flowBlockPointerCleanupRef.current?.()
      const move = (pointerEvent: PointerEvent) => {
        updateFlowBlockPointerAt(
          dom,
          pointerEvent.pointerId,
          pointerEvent.clientX,
          pointerEvent.clientY,
        )
      }
      const end = (pointerEvent: PointerEvent) => {
        if (flowBlockPointerRef.current?.pointerId !== pointerEvent.pointerId) return
        finishFlowBlockPointerGesture(false)
      }
      const cancel = (pointerEvent: PointerEvent) => {
        if (flowBlockPointerRef.current?.pointerId !== pointerEvent.pointerId) return
        // Chromium may cancel capture when React replaces the pressed button
        // while revealing drop zones. The physical mouse gesture continues and
        // is completed by the document-level mouseup path below.
        if (isMousePointer) return
        finishFlowBlockPointerGesture(true)
      }
      const mouseMove = (mouseEvent: MouseEvent) => {
        updateFlowBlockPointerAt(
          dom,
          pointerId,
          mouseEvent.clientX,
          mouseEvent.clientY,
        )
      }
      const mouseEnd = (mouseEvent: MouseEvent) => {
        if (mouseEvent.button !== 0 || flowBlockPointerRef.current?.pointerId !== pointerId) return
        finishFlowBlockPointerGesture(false)
      }
      const blur = (blurEvent: Event) => {
        if (blurEvent.target === view) finishFlowBlockPointerGesture(true)
      }
      view.addEventListener('pointermove', move, true)
      view.addEventListener('pointerup', end, true)
      view.addEventListener('pointercancel', cancel, true)
      view.addEventListener('mousemove', mouseMove, true)
      view.addEventListener('mouseup', mouseEnd, true)
      view.addEventListener('blur', blur, true)
      flowBlockPointerCleanupRef.current = () => {
        view.removeEventListener('pointermove', move, true)
        view.removeEventListener('pointerup', end, true)
        view.removeEventListener('pointercancel', cancel, true)
        view.removeEventListener('mousemove', mouseMove, true)
        view.removeEventListener('mouseup', mouseEnd, true)
        view.removeEventListener('blur', blur, true)
      }
    }
  }

  const updateFlowBlockPointerAt = (
    dom: Document,
    pointerId: number,
    clientX: number,
    clientY: number,
  ) => {
    const gesture = flowBlockPointerRef.current
    if (!gesture || gesture.pointerId !== pointerId) return
    if (!gesture.started) {
      const distance = Math.hypot(
        clientX - gesture.startClientX,
        clientY - gesture.startClientY,
      )
      if (distance < 4) return
      gesture.started = true
    }
    const target = dom.elementFromPoint(clientX, clientY)
    const zone = target?.closest<HTMLElement>('.course-flow-drop-zone')
    const slotIndex = Number(zone?.dataset.flowDropSlotIndex)
    if (!zone || !Number.isInteger(slotIndex)) {
      const nextDrag: FlowBlockDragState = {
        blockId: gesture.blockId,
        activeZone: null,
        request: null,
        feedback: '移到可见的插入位置后松开鼠标',
      }
      flowBlockDragRef.current = nextDrag
      setFlowBlockDrag(nextDrag)
      return
    }
    updateFlowBlockDropPreview(
      gesture.blockId,
      zone.dataset.flowDropParentId === 'root' ? null : zone.dataset.flowDropParentId ?? null,
      slotIndex,
    )
  }

  const updateFlowBlockPointerDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    updateFlowBlockPointerAt(
      event.currentTarget.ownerDocument,
      event.pointerId,
      event.clientX,
      event.clientY,
    )
  }

  const finishFlowBlockPointerGesture = (cancelled: boolean) => {
    const gesture = flowBlockPointerRef.current
    if (!gesture) return
    const request = flowBlockDragRef.current?.request
    flowBlockPointerCleanupRef.current?.()
    flowBlockPointerCleanupRef.current = null
    if (!cancelled && gesture.started && request && onBlockMove) onBlockMove(request)
    flowBlockPointerRef.current = null
    flowBlockDragRef.current = null
    setFlowBlockDrag(null)
  }

  const finishFlowBlockPointerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    cancelled: boolean,
  ) => {
    const gesture = flowBlockPointerRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (cancelled && (!event.pointerType || event.pointerType === 'mouse')) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    finishFlowBlockPointerGesture(cancelled)
  }

  const flowClientToLogical = (clientX: number, clientY: number): LogicalPoint => {
    const bounds = overlayMountRef.current?.getBoundingClientRect()
    const scaleX = bounds && bounds.width > 0 ? FLOW_LOGICAL_OVERLAY_WIDTH / bounds.width : 1
    const scaleY = bounds && bounds.height > 0 ? FLOW_LOGICAL_OVERLAY_HEIGHT / bounds.height : 1
    return {
      x: (clientX - (bounds?.left ?? 0)) * scaleX,
      y: (clientY - (bounds?.top ?? 0)) * scaleY,
    }
  }

  const beginFlowMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || mode !== 'inspect' || !onLayerSelectionChange) return
    const target = event.target instanceof Element ? event.target : null
    const layer = target?.closest<HTMLElement>('.slide-layer-item')
    if (layer) {
      const selection = marqueeCandidates.find(({ item }) => (
        item.layerItemId === layer.dataset.layerItemId
      ))
      if (selection) {
        const next = updateCanvasLayerSelection(transformSelections, [selection], event.shiftKey)
        onLayerSelectionChange(next.selections, next.primaryId)
      }
      return
    }
    const transformAction = target?.closest<HTMLElement>('[data-course-transform-action]')
    if (transformAction) {
      if (
        event.shiftKey &&
        transformAction.dataset.courseTransformAction === 'move'
      ) {
        const logical = flowClientToLogical(event.clientX, event.clientY)
        const selection = [...marqueeCandidates].reverse().find(({ item }) => (
          courseItemContainsLogicalPoint(item, logical)
        ))
        if (selection) {
          event.preventDefault()
          event.stopPropagation()
          const next = updateCanvasLayerSelection(transformSelections, [selection], true)
          onLayerSelectionChange(next.selections, next.primaryId)
        }
      }
      return
    }
    // Flow semantic blocks keep their own document selection/edit contract.
    if (target?.closest('[data-flow-block-id]') || isEditableInteractionTarget(event.target)) return
    const logical = flowClientToLogical(event.clientX, event.clientY)
    const insideCanvas = logical.x >= 0 && logical.y >= 0 &&
      logical.x <= FLOW_LOGICAL_OVERLAY_WIDTH && logical.y <= FLOW_LOGICAL_OVERLAY_HEIGHT
    if (!insideCanvas) {
      if (!event.shiftKey) onLayerSelectionChange([], undefined)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const gesture: CourseCanvasMarqueeGesture = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startLogical: logical,
      currentLogical: logical,
      shiftKey: event.shiftKey,
      initialSelections: [...transformSelections],
    }
    flowMarqueeRef.current = gesture
    setFlowMarquee(courseLogicalRectFromPoints(logical, logical))
  }

  const updateFlowMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = flowMarqueeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const logical = flowClientToLogical(event.clientX, event.clientY)
    gesture.currentLogical = logical
    setFlowMarquee(courseLogicalRectFromPoints(gesture.startLogical, logical))
  }

  const finishFlowMarquee = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const gesture = flowMarqueeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const logical = flowClientToLogical(event.clientX, event.clientY)
    flowMarqueeRef.current = null
    setFlowMarquee(null)
    if (typeof event.currentTarget.releasePointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!cancelled && onLayerSelectionChange) {
      completeCanvasMarquee(
        gesture,
        { x: event.clientX, y: event.clientY },
        logical,
        marqueeCandidates,
        onLayerSelectionChange,
      )
    }
  }

  const renderFlowDropZone = (
    parentId: string | null,
    slotIndex: number,
    depth: number,
    empty = false,
  ): ReactNode => {
    const zone = flowDropZoneKey(parentId, slotIndex)
    const active = flowBlockDrag?.activeZone === zone
    const invalid = active && flowBlockDrag?.request === null && flowBlockDrag.feedback !== '当前位置无需移动'
    return (
      <div
        key={`drop:${zone}`}
        className={`course-flow-drop-zone${active ? ' is-active' : ''}${invalid ? ' is-invalid' : ''}${empty ? ' is-empty' : ''}`}
        data-flow-drop-parent-id={parentId ?? 'root'}
        data-flow-drop-slot-index={slotIndex}
        data-flow-drop-active={active ? 'true' : undefined}
        style={depth > 0 ? { marginLeft: Math.min(depth, 5) * 24 } : undefined}
        aria-hidden="true"
        onDragEnter={(event) => previewFlowBlockDrop(event, parentId, slotIndex)}
        onDragOver={(event) => previewFlowBlockDrop(event, parentId, slotIndex)}
        onDrop={(event) => commitFlowBlockDrop(event, parentId, slotIndex)}
      >
        <span>{active ? flowBlockDrag.feedback : '放到这里'}</span>
      </div>
    )
  }

  const renderBlock = (
    block: FlowBlock,
    parentId: string | null,
    index: number,
    depth: number,
  ): ReactNode => {
    const blockTypeLabel = flowBlockTeacherLabel(block.type)
    const summary = (flowBlockPrimaryText(block) ?? '').replace(/\s+/g, ' ').trim().slice(0, 32)
    const dragging = flowBlockDrag?.blockId === block.id
    const dragDescription = canDragFlowBlocks
      ? '拖动排序，也可放入分节或拖出分节'
      : query
        ? '清除搜索后可调整内容块顺序'
        : '当前无法调整内容块顺序'
    return (
      <section
        key={block.id}
        className={`course-flow-card${selectedBlockId === block.id ? ' is-selected' : ''}${depth > 0 ? ' is-nested' : ''}${dragging ? ' is-dragging' : ''}`}
        data-flow-block-id={block.id}
        data-flow-parent-id={parentId ?? 'root'}
        data-flow-index={index}
        style={depth > 0 ? { marginLeft: Math.min(depth, 5) * 24 } : undefined}
        onPointerDown={(event) => { event.stopPropagation(); onSelect(block.id) }}
      >
        {mode === 'inspect' && (
          <button
            type="button"
            className="course-flow-drag-handle"
            draggable={false}
            aria-disabled={!canDragFlowBlocks}
            aria-label={`拖动${blockTypeLabel}${summary ? `“${summary}”` : ''}`}
            aria-describedby={`course-flow-drag-help-${surface.id}`}
            title={dragDescription}
            data-flow-drag-handle={block.id}
            onPointerDown={(event) => beginFlowBlockPointerDrag(
              event,
              block.id,
              `正在拖动${blockTypeLabel}${summary ? `“${summary}”` : ''}`,
            )}
            onPointerMove={updateFlowBlockPointerDrag}
            onPointerUp={(event) => finishFlowBlockPointerDrag(event, false)}
            onPointerCancel={(event) => finishFlowBlockPointerDrag(event, true)}
            onDragStart={(event) => {
              if (!canDragFlowBlocks) {
                event.preventDefault()
                return
              }
              event.stopPropagation()
              event.dataTransfer.effectAllowed = 'move'
              event.dataTransfer.setData(FLOW_BLOCK_DRAG_MIME, block.id)
              flowDropCommittedRef.current = false
              flowDragCancelledRef.current = false
              const nextDrag: FlowBlockDragState = {
                blockId: block.id,
                activeZone: null,
                request: null,
                feedback: `正在拖动${blockTypeLabel}${summary ? `“${summary}”` : ''}`,
              }
              flowBlockDragRef.current = nextDrag
              setFlowBlockDrag(nextDrag)
              onSelect(block.id)
            }}
            onDragEnd={finishFlowBlockNativeDrag}
          >
            <span aria-hidden="true">☷</span>
          </button>
        )}
        <span className="course-flow-kind">{blockTypeLabel}</span>
        {block.type === 'media'
          ? <FlowLiveMedia
              block={block}
              mode={mode}
              source={resolveAsset(block.assetId)}
              onCommit={(value) => onEdit(block.id, value)}
            />
          : block.type === 'component' && renderComponent
          ? <FlowLiveComponent
              surfaceId={surface.id}
              block={block}
              mode={mode}
              renderComponent={renderComponent}
              onHit={(detail) => onComponentHit?.(block.id, detail)}
            />
          : <EditableBlockText
              block={block}
              disabled={mode === 'playback'}
              onCommit={(value) => onEdit(block.id, value)}
            />}
        {block.type === 'section' && (
          <div className="course-flow-section-children" data-section-children={block.id}>
            {block.blocks.length === 0 && <p className="course-empty">该分节还没有子块。</p>}
            {renderBlockList(block.blocks, block.id, depth + 1)}
          </div>
        )}
      </section>
    )
  }

  const renderBlockList = (
    list: FlowBlock[],
    parentId: string | null,
    depth: number,
  ): ReactNode => (
    <div
      className={`course-flow-block-list${list.length === 0 ? ' is-empty' : ''}`}
      data-flow-block-list-parent-id={parentId ?? 'root'}
    >
      {list.map((block, index) => [
        renderFlowDropZone(parentId, index, depth),
        renderBlock(block, parentId, index, depth),
      ])}
      {renderFlowDropZone(parentId, list.length, depth, list.length === 0)}
    </div>
  )
  return (
    <div className="course-flow-scroll" data-testid="course-flow-canvas">
      <div
        ref={flowStageRef}
        className="course-flow-stage"
        onPointerDownCapture={beginFlowMarquee}
        onPointerMoveCapture={updateFlowMarquee}
        onPointerUpCapture={(event) => finishFlowMarquee(event, false)}
        onPointerCancelCapture={(event) => finishFlowMarquee(event, true)}
      >
        <article
          className={`course-flow-document${flowBlockDrag ? ' is-block-dragging' : ''}`}
          style={{ maxWidth: surface.layout.wideContentWidth }}
          data-flow-block-dragging={flowBlockDrag?.blockId}
        >
          {mode === 'inspect' && (
            <span id={`course-flow-drag-help-${surface.id}`} className="course-visually-hidden">
              用鼠标拖动内容块手柄，可调整顶层顺序、移入分节、移出分节或调整分节内顺序。
            </span>
          )}
          <span className="course-visually-hidden" role="status" aria-live="polite">
            {flowBlockDrag?.feedback ?? ''}
          </span>
          {blocks.length === 0 && <p className="course-empty">没有匹配的内容块。</p>}
          {renderBlockList(blocks, null, 0)}
        </article>
        <div
          className="course-flow-overlay-viewport"
          style={{ height: FLOW_LOGICAL_OVERLAY_HEIGHT * flowLogicalOverlayScale }}
        >
          <div
            ref={overlayMountRef}
            className="course-flow-overlay-mount"
            data-flow-logical-scale={flowLogicalOverlayScale.toFixed(4)}
            style={{
              transform: `scale(${flowLogicalOverlayScale})`,
              transformOrigin: '0 0',
            }}
          />
        </div>
        {(canShowTransformOverlay || editingTextSelection || flowMarquee) && (
          <div
            className="course-flow-transform-viewport"
            style={{ height: FLOW_LOGICAL_OVERLAY_HEIGHT * flowLogicalOverlayScale }}
          >
            <div
              className="course-flow-transform-layer"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: FLOW_LOGICAL_OVERLAY_WIDTH,
                height: FLOW_LOGICAL_OVERLAY_HEIGHT,
                pointerEvents: 'none',
                transform: `scale(${flowLogicalOverlayScale})`,
                transformOrigin: '0 0',
              }}
            >
              {flowMarquee && (
                <CourseCanvasMarquee rect={flowMarquee} surface="flow" />
              )}
              {canShowTransformOverlay && !editingTextSelection && <CourseTransformOverlay
                items={transformSelections.map(({ item }) => item)}
                selectedLayerItemIds={transformSelectionIds}
                captureInterior={overlayMayCaptureInterior(transformSelections)}
                onPreview={(change) => {
                  setTransformPreview(change.items.map((item) => ({ ...item, frame: { ...item.frame } })))
                  onLayerTransformPreview?.(change)
                }}
                onCommit={(change) => {
                  setTransformPreview(null)
                  onLayerTransformCommit?.(change)
                }}
                onCancel={() => setTransformPreview(null)}
                onDoubleClickSelection={() => {
                  if (transformSelections.length !== 1) return
                  const selection = transformSelections[0]
                  if (selection.source !== 'surface' && selection.source !== 'global') return
                  const detail = nativePrimaryAuthoringDetail(selection.item)
                  if (!detail) return
                  onLayerHit?.({
                    surfaceId: surface.id,
                    layerItemId: selection.item.layerItemId,
                    kind: selection.item.kind,
                    order: selection.item.order,
                    source: selection.source,
                    ...detail,
                  })
                  if (detail.field === 'content.data.text' && onNativeTextCommit && !selection.item.locked) {
                    setEditingTextLayerItemId(selection.item.layerItemId)
                  }
                }}
              />}
              {editingTextSelection && onNativeTextCommit && (
                <NativeLayerTextEditor
                  selection={editingTextSelection}
                  onCommit={onNativeTextCommit}
                  onCancel={() => setEditingTextLayerItemId(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface SpatialCanvasProps {
  surface: SpatialSurfaceDocument
  mode: StudioMode
  camera: SpatialCameraPose
  selectedLayerItemId: string | null
  selectedLayerItems?: readonly CourseCanvasLayerSelection[]
  resolveAsset(assetId: string): string | undefined
  onCameraChange(camera: SpatialCameraPose): void
  onSelect(layerItemId: string | null): void
  onLayerSelectionChange?: CourseCanvasLayerSelectionHandler
  onLayerHit?(hit: SpatialLayerHit): void
  onMove(
    layerItemId: string,
    dx: number,
    dy: number,
    source?: SpatialLayerHit['source'],
  ): void
  onLayerTransformPreview?: CourseCanvasTransformHandler
  onLayerTransformCommit?: CourseCanvasTransformHandler
  onNativeTextCommit?: CourseCanvasNativeTextCommitHandler
  componentHostFactory?: ComponentSlideItemHostFactory
  runtimeHostFactory?: RuntimeSlideItemHostFactory
  globalLayerItems?: readonly ScopedLayerItem[]
  locationId?: string
  teacherControllerProgressText?: SpatialSurfaceHostOptions['teacherControllerProgressText']
  onTeacherControllerAction?: SpatialSurfaceHostOptions['onTeacherControllerAction']
  onError?(message: string): void
}

type SpatialGesture =
  | { kind: 'pan'; pointerId: number; x: number; y: number; camera: SpatialCameraPose }
  | {
      kind: 'item'
      pointerId: number
      x: number
      y: number
      layerItemId: string
      source: SpatialLayerHit['source']
    }

export function SpatialCourseCanvas({
  surface,
  mode,
  camera,
  selectedLayerItemId,
  selectedLayerItems,
  resolveAsset,
  onCameraChange,
  onSelect,
  onLayerSelectionChange,
  onLayerHit,
  onMove,
  onLayerTransformPreview,
  onLayerTransformCommit,
  onNativeTextCommit,
  componentHostFactory,
  runtimeHostFactory,
  globalLayerItems,
  locationId,
  teacherControllerProgressText,
  onTeacherControllerAction,
  onError,
}: SpatialCanvasProps) {
  const viewport = SPATIAL_CANONICAL_VIEWPORT
  const gestureRef = useRef<SpatialGesture | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<SpatialSurfaceHost | null>(null)
  const cameraRef = useRef(camera)
  const cameraChangeRef = useRef(onCameraChange)
  const selectRef = useRef(onSelect)
  const layerHitRef = useRef(onLayerHit)
  const nativeTextCommitRef = useRef(onNativeTextCommit)
  const assetResolverRef = useRef(resolveAsset)
  const errorRef = useRef(onError)
  const teacherControllerProgressRef = useRef(teacherControllerProgressText)
  const teacherControllerActionRef = useRef(onTeacherControllerAction)
  cameraRef.current = camera
  cameraChangeRef.current = onCameraChange
  selectRef.current = onSelect
  layerHitRef.current = onLayerHit
  nativeTextCommitRef.current = onNativeTextCommit
  assetResolverRef.current = resolveAsset
  errorRef.current = onError
  teacherControllerProgressRef.current = teacherControllerProgressText
  teacherControllerActionRef.current = onTeacherControllerAction
  const [spatialDisplayScale, setSpatialDisplayScale] = useState(0.72)
  const [spatialSpacePressed, setSpatialSpacePressed] = useState(false)
  const [spatialPanning, setSpatialPanning] = useState(false)
  const spatialSpacePressedRef = useRef(false)
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 })
  const [transformPreview, setTransformPreview] = useState<CourseTransformItem[] | null>(null)
  const [spatialMarquee, setSpatialMarquee] = useState<CourseLogicalRect | null>(null)
  const spatialMarqueeRef = useRef<CourseCanvasMarqueeGesture | null>(null)
  const [editingTextLayerItemId, setEditingTextLayerItemId] = useState<string | null>(null)
  const transformSelections = useMemo<CourseCanvasLayerSelection[]>(() => {
    if (selectedLayerItems) {
      return selectedLayerItems.filter((selection) => selection.source !== 'scene')
    }
    if (!selectedLayerItemId) return []
    const worldItem = surface.world.layerItems
      .find((item) => item.layerItemId === selectedLayerItemId)
    if (worldItem) return [{ item: worldItem, source: 'world' }]
    const surfaceItem = surface.surfaceLayerItems
      .find((entry) => entry.item.layerItemId === selectedLayerItemId)?.item
    if (surfaceItem) return [{ item: surfaceItem, source: 'surface' }]
    const globalItem = globalLayerItems
      ?.find((entry) => entry.item.layerItemId === selectedLayerItemId)?.item
    return globalItem ? [{ item: globalItem, source: 'global' }] : []
  }, [globalLayerItems, selectedLayerItemId, selectedLayerItems, surface])
  const transformSelectionIds = useMemo(
    () => transformSelections.map(({ item }) => item.layerItemId),
    [transformSelections],
  )
  const marqueeCandidates = useMemo(
    () => spatialMarqueeCandidates(surface, camera, locationId, globalLayerItems),
    [camera, globalLayerItems, locationId, surface],
  )
  const canShowTransformOverlay = mode === 'inspect' &&
    Boolean(onLayerTransformCommit) &&
    transformSelections.length > 0
  const editingTextSelection = mode === 'inspect' && onNativeTextCommit
    ? editableNativeTextSelection(transformSelections, editingTextLayerItemId)
    : null
  useEffect(() => {
    if (editingTextLayerItemId && !editingTextSelection) setEditingTextLayerItemId(null)
  }, [editingTextLayerItemId, editingTextSelection])

  useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const updateScale = () => {
      const availableWidth = root.clientWidth
      const availableHeight = root.clientHeight
      if (availableWidth <= 0 || availableHeight <= 0) return
      const next = Math.min(
        1,
        availableWidth / viewport.width,
        availableHeight / viewport.height,
      )
      setSpatialDisplayScale((current) => Math.abs(current - next) < 0.0001 ? current : next)
    }
    updateScale()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateScale)
    observer.observe(root)
    return () => observer.disconnect()
  }, [viewport.height, viewport.width])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.code !== 'Space' && event.key !== ' ') || event.repeat) return
      const root = viewportRef.current
      const active = document.activeElement
      if (!root || isEditableInteractionTarget(event.target) ||
        isStandardKeyboardActivationTarget(event.target) ||
        isStandardKeyboardActivationTarget(active) || (
        active !== root && !(active instanceof Node && root.contains(active))
      )) return
      event.preventDefault()
      spatialSpacePressedRef.current = true
      setSpatialSpacePressed(true)
    }
    const releaseSpace = () => {
      if (!spatialSpacePressedRef.current) return
      spatialSpacePressedRef.current = false
      setSpatialSpacePressed(false)
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      if (!spatialSpacePressedRef.current) return
      event.preventDefault()
      releaseSpace()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseSpace)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseSpace)
      spatialSpacePressedRef.current = false
    }
  }, [])
  const previewSurface = useMemo(() => {
    const hasOffsetPreview = selectedLayerItemId && (previewOffset.x !== 0 || previewOffset.y !== 0)
    if (!transformPreview && !hasOffsetPreview) return surface
    const copy = structuredClone(surface)
    if (transformPreview) {
      const byId = previewItemsById(transformPreview)
      const sourceById = new Map(transformSelections.map((selection) => [
        selection.item.layerItemId,
        selection.source,
      ]))
      copy.world.layerItems.forEach((item) => {
        if (sourceById.get(item.layerItemId) === 'world') {
          applyPreviewGeometry(item, byId.get(item.layerItemId))
        }
      })
      copy.surfaceLayerItems.forEach(({ item }) => {
        if (sourceById.get(item.layerItemId) === 'surface') {
          applyPreviewGeometry(item, byId.get(item.layerItemId))
        }
      })
    }
    if (hasOffsetPreview) {
      const source = gestureRef.current?.kind === 'item' ? gestureRef.current.source : 'world'
      const item = source === 'world'
        ? copy.world.layerItems.find((candidate) => candidate.layerItemId === selectedLayerItemId)
        : source === 'surface'
          ? copy.surfaceLayerItems.find((candidate) => candidate.item.layerItemId === selectedLayerItemId)?.item
          : undefined
      if (item) {
        item.frame.x += previewOffset.x
        item.frame.y += previewOffset.y
      }
    }
    return copy
  }, [previewOffset.x, previewOffset.y, selectedLayerItemId, surface, transformPreview, transformSelections])
  const previewGlobalLayerItems = useMemo(() => {
    const copy = structuredClone(globalLayerItems ?? [])
    if (transformPreview) {
      const byId = previewItemsById(transformPreview)
      const globalIds = new Set(transformSelections
        .filter((selection) => selection.source === 'global')
        .map((selection) => selection.item.layerItemId))
      copy.forEach(({ item }) => {
        if (globalIds.has(item.layerItemId)) applyPreviewGeometry(item, byId.get(item.layerItemId))
      })
    }
    if (
      !selectedLayerItemId ||
      (previewOffset.x === 0 && previewOffset.y === 0) ||
      gestureRef.current?.kind !== 'item' ||
      gestureRef.current.source !== 'global'
    ) return copy
    const item = copy.find((candidate) => candidate.item.layerItemId === selectedLayerItemId)?.item
    if (item) {
      item.frame.x += previewOffset.x
      item.frame.y += previewOffset.y
    }
    return copy
  }, [globalLayerItems, previewOffset.x, previewOffset.y, selectedLayerItemId, transformPreview, transformSelections])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const abort = new AbortController()
    const host = new SpatialSurfaceHost(surface, viewport, {
      showControls: false,
      showMinimap: true,
      interactiveCamera: false,
      componentHostFactory,
      runtimeHostFactory,
      globalLayerItems,
      initialLocationId: locationId,
      teacherControllerProgressText: () => teacherControllerProgressRef.current?.() ?? '',
      onTeacherControllerAction: (action, item) => teacherControllerActionRef.current?.(action, item),
      onLayerHit: (hit) => {
        if (hit.field === 'content.data.text' && nativeTextCommitRef.current) {
          setEditingTextLayerItemId(hit.layerItemId)
        }
        if (layerHitRef.current) layerHitRef.current(hit)
        else selectRef.current(hit.layerItemId)
      },
    })
    hostRef.current = host
    void host.mount({
      surfaceId: surface.id,
      container: mount,
      signal: abort.signal,
      services: {
        navigate: () => undefined,
        getCourseState: () => undefined,
        setCourseState: () => undefined,
        resolveAsset: (assetId) => assetResolverRef.current(assetId),
        reportDiagnostic: (diagnostic) => errorRef.current?.(diagnostic.message),
      },
    }).then(async () => {
      await host.setCamera({ ...cameraRef.current, viewportWidth: viewport.width, viewportHeight: viewport.height })
      await host.setInspectionMode(mode)
      await host.activate()
    }).catch((cause: unknown) => {
      errorRef.current?.(cause instanceof Error ? cause.message : '空间画布挂载失败')
    })
    return () => {
      abort.abort()
      hostRef.current = null
      void host.destroy()
    }
    // Stable factories and a surface identity own one live host. Document,
    // camera and mode changes are reconciled below without remounting backends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentHostFactory, runtimeHostFactory, surface.id])

  useEffect(() => {
    void hostRef.current?.updateDocument(previewSurface).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间画布更新失败')
    })
  }, [onError, previewSurface])

  useEffect(() => {
    void hostRef.current?.setCamera({
      ...camera,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    }).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间镜头更新失败')
    })
  }, [camera, onError])

  useEffect(() => {
    void hostRef.current?.setInspectionMode(mode).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间编辑帧切换失败')
    })
  }, [mode, onError])

  useEffect(() => {
    void hostRef.current?.updateGlobalLayerItems(previewGlobalLayerItems).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间全局图层更新失败')
    })
  }, [onError, previewGlobalLayerItems])

  useEffect(() => {
    if (!locationId) return
    void hostRef.current?.setLocationId(locationId).catch((cause: unknown) => {
      onError?.(cause instanceof Error ? cause.message : '空间位置更新失败')
    })
  }, [locationId, onError])

  useEffect(() => {
    const root = mountRef.current
    root?.querySelectorAll('[data-spatial-layer-record][data-studio-selected="true"]').forEach((element) => {
      delete (element as SVGElement).dataset.studioSelected
    })
    if (canShowTransformOverlay) return
    const selectedIds = new Set(transformSelectionIds)
    ;[...(root?.querySelectorAll<SVGGElement>('[data-spatial-layer-record]') ?? [])]
      .filter((element) => selectedIds.has(element.dataset.layerItemId ?? ''))
      .forEach((element) => { element.dataset.studioSelected = 'true' })
  }, [canShowTransformOverlay, previewSurface, transformSelectionIds])

  const worldDelta = (clientDx: number, clientDy: number) => {
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      return { x: clientDx / camera.zoom, y: clientDy / camera.zoom }
    }
    const scaleX = viewport.width / bounds.width
    const scaleY = viewport.height / bounds.height
    return { x: clientDx * scaleX / camera.zoom, y: clientDy * scaleY / camera.zoom }
  }

  const spatialClientToScreen = (clientX: number, clientY: number): LogicalPoint => {
    const bounds = stageRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return { x: clientX, y: clientY }
    return {
      x: (clientX - bounds.left) * viewport.width / bounds.width,
      y: (clientY - bounds.top) * viewport.height / bounds.height,
    }
  }

  const spatialClientToWorld = (clientX: number, clientY: number): LogicalPoint => {
    const screen = spatialClientToScreen(clientX, clientY)
    return {
      x: (screen.x - viewport.width / 2) / camera.zoom + camera.x,
      y: (screen.y - viewport.height / 2) / camera.zoom + camera.y,
    }
  }

  const beginSpatialMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || mode !== 'inspect' || !onLayerSelectionChange) return
    const target = event.target instanceof Element ? event.target : null
    const layer = target?.closest<SVGElement>('[data-spatial-layer-record]')
    if (layer) {
      const selection = marqueeCandidates.find(({ item }) => (
        item.layerItemId === layer.dataset.layerItemId
      ))
      if (selection) {
        const next = updateCanvasLayerSelection(transformSelections, [selection], event.shiftKey)
        onLayerSelectionChange(next.selections, next.primaryId)
      }
      return
    }
    const transformAction = target?.closest<HTMLElement>('[data-course-transform-action]')
    if (transformAction) {
      if (
        event.shiftKey &&
        transformAction.dataset.courseTransformAction === 'move'
      ) {
        const logical = spatialClientToWorld(event.clientX, event.clientY)
        const selection = [...marqueeCandidates].reverse().find(({ item }) => (
          courseItemContainsLogicalPoint(item, logical)
        ))
        if (selection) {
          event.preventDefault()
          event.stopPropagation()
          const next = updateCanvasLayerSelection(transformSelections, [selection], true)
          onLayerSelectionChange(next.selections, next.primaryId)
        }
      }
      return
    }
    if (isEditableInteractionTarget(event.target)) return
    const screen = spatialClientToScreen(event.clientX, event.clientY)
    const insideViewport = screen.x >= 0 && screen.y >= 0 &&
      screen.x <= viewport.width && screen.y <= viewport.height
    if (!insideViewport) {
      if (!event.shiftKey) onLayerSelectionChange([], undefined)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const logical = spatialClientToWorld(event.clientX, event.clientY)
    const gesture: CourseCanvasMarqueeGesture = {
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      startLogical: logical,
      currentLogical: logical,
      shiftKey: event.shiftKey,
      initialSelections: [...transformSelections],
    }
    spatialMarqueeRef.current = gesture
    setSpatialMarquee(courseLogicalRectFromPoints(logical, logical))
  }

  const beginSpatialPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldPan = event.button === 1 || (
      event.button === 0 && spatialSpacePressedRef.current
    )
    if (!shouldPan || isEditableInteractionTarget(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    const root = event.currentTarget
    root.focus({ preventScroll: true })
    if (typeof root.setPointerCapture === 'function') root.setPointerCapture(event.pointerId)
    gestureRef.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      camera: cameraRef.current,
    }
    setSpatialPanning(true)
  }

  const updateSpatialMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = spatialMarqueeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const logical = spatialClientToWorld(event.clientX, event.clientY)
    gesture.currentLogical = logical
    setSpatialMarquee(courseLogicalRectFromPoints(gesture.startLogical, logical))
  }

  const finishSpatialMarquee = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const gesture = spatialMarqueeRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const logical = spatialClientToWorld(event.clientX, event.clientY)
    spatialMarqueeRef.current = null
    setSpatialMarquee(null)
    if (typeof event.currentTarget.releasePointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (!cancelled && onLayerSelectionChange) {
      completeCanvasMarquee(
        gesture,
        { x: event.clientX, y: event.clientY },
        logical,
        marqueeCandidates,
        onLayerSelectionChange,
      )
    }
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const element = event.target as Element
    const layer = element.closest<SVGElement>('[data-spatial-layer-record]')
    if (layer) {
      if (mode === 'inspect' && onLayerSelectionChange) return
      const layerItemId = layer.dataset.layerItemId!
      if (mode === 'inspect') {
        // The native wrapper does not expose a finer field. Dynamic target
        // overlays already reported their full hit (field + hitId) through the
        // host and must not be overwritten by this bubbling handler.
        if (!layerHitRef.current && !element.closest('[data-dynamic-hit-id]')) onSelect(layerItemId)
        event.currentTarget.setPointerCapture(event.pointerId)
        gestureRef.current = {
          kind: 'item',
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          layerItemId,
          source: layer.dataset.layerSource === 'global'
            ? 'global'
            : layer.dataset.layerSource === 'surface'
              ? 'surface'
              : 'world',
        }
      }
    } else {
      if (mode === 'inspect' && onLayerSelectionChange) return
      onSelect(null)
      if (typeof event.currentTarget.setPointerCapture === 'function') {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
      gestureRef.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        camera: cameraRef.current,
      }
      setSpatialPanning(true)
    }
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const delta = worldDelta(event.clientX - gesture.x, event.clientY - gesture.y)
    if (gesture.kind === 'pan') {
      onCameraChange({ ...gesture.camera, x: gesture.camera.x - delta.x, y: gesture.camera.y - delta.y })
    } else {
      setPreviewOffset(delta)
    }
  }

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    if (gesture.kind === 'item' && (previewOffset.x !== 0 || previewOffset.y !== 0)) {
      onMove(gesture.layerItemId, previewOffset.x, previewOffset.y, gesture.source)
    }
    gestureRef.current = null
    if (gesture.kind === 'pan') {
      event.preventDefault()
      event.stopPropagation()
      setSpatialPanning(false)
    }
    setPreviewOffset({ x: 0, y: 0 })
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = cameraRef.current
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      cameraChangeRef.current({
        ...current,
        zoom: Math.min(SPATIAL_MAX_ZOOM, Math.max(SPATIAL_MIN_ZOOM, current.zoom * factor)),
      })
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => root.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div
      ref={viewportRef}
      className={`course-spatial-viewport${mode === 'inspect' ? ' is-inspecting' : ''}`}
      data-testid="course-spatial-canvas"
      tabIndex={0}
      aria-label="空间画布视口"
      style={{
        cursor: spatialPanning ? 'grabbing' : spatialSpacePressed ? 'grab' : undefined,
      }}
      onPointerDownCapture={(event) => {
        const target = event.target instanceof Element ? event.target : null
        if (!target?.closest('button, a, input, textarea, select, [contenteditable="true"]')) {
          event.currentTarget.focus({ preventScroll: true })
        }
        beginSpatialPan(event)
        if (gestureRef.current?.kind !== 'pan') beginSpatialMarquee(event)
      }}
      onPointerMoveCapture={updateSpatialMarquee}
      onPointerUpCapture={(event) => finishSpatialMarquee(event, false)}
      onPointerCancelCapture={(event) => finishSpatialMarquee(event, true)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
    >
      <div
        className="course-spatial-stage-shell"
        style={{
          position: 'relative',
          width: viewport.width * spatialDisplayScale,
          height: viewport.height * spatialDisplayScale,
          flex: 'none',
        }}
      >
        <div
          ref={stageRef}
          className="course-spatial-stage"
          data-logical-viewport={`${viewport.width}x${viewport.height}`}
          style={{
            position: 'relative',
            width: viewport.width,
            height: viewport.height,
            transform: `scale(${spatialDisplayScale})`,
            transformOrigin: 'top left',
          }}
        >
        <div
          ref={mountRef}
          className="course-spatial-mount"
          style={{ position: 'absolute', inset: 0 }}
        />
        {(canShowTransformOverlay || editingTextSelection || spatialMarquee) && (
          <div
            className="course-spatial-transform-layer"
            style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: 1,
                height: 1,
                transform: `translate(${viewport.width / 2}px, ${viewport.height / 2}px) scale(${camera.zoom}) translate(${-camera.x}px, ${-camera.y}px)`,
                transformOrigin: '0 0',
              }}
            >
              {spatialMarquee && (
                <CourseCanvasMarquee
                  rect={spatialMarquee}
                  visualScale={camera.zoom}
                  surface="spatial"
                />
              )}
              {canShowTransformOverlay && !editingTextSelection && <CourseTransformOverlay
                items={transformSelections.map(({ item }) => item)}
                selectedLayerItemIds={transformSelectionIds}
                clientDeltaToLogicalDelta={(delta) => worldDelta(delta.x, delta.y)}
                captureInterior={overlayMayCaptureInterior(transformSelections)}
                handleSize={10 / camera.zoom}
                rotationHandleOffset={30 / camera.zoom}
                onPreview={(change) => {
                  setTransformPreview(change.items.map((item) => ({ ...item, frame: { ...item.frame } })))
                  onLayerTransformPreview?.(change)
                }}
                onCommit={(change) => {
                  setTransformPreview(null)
                  onLayerTransformCommit?.(change)
                }}
                onCancel={() => setTransformPreview(null)}
                onDoubleClickSelection={() => {
                  if (transformSelections.length !== 1) return
                  const selection = transformSelections[0]
                  if (selection.source === 'scene') return
                  const detail = nativePrimaryAuthoringDetail(selection.item)
                  if (!detail) return
                  onLayerHit?.({
                    surfaceId: surface.id,
                    layerItemId: selection.item.layerItemId,
                    kind: selection.item.kind,
                    order: selection.item.order,
                    source: selection.source,
                    ...detail,
                  })
                  if (detail.field === 'content.data.text' && onNativeTextCommit && !selection.item.locked) {
                    setEditingTextLayerItemId(selection.item.layerItemId)
                  }
                }}
              />}
              {editingTextSelection && onNativeTextCommit && (
                <NativeLayerTextEditor
                  selection={editingTextSelection}
                  onCommit={onNativeTextCommit}
                  onCancel={() => setEditingTextLayerItemId(null)}
                />
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}

export function selectedLayer(
  surface: SlideSurfaceDocument | FlowSurfaceDocument | SpatialSurfaceDocument,
  sceneId: string | undefined,
  layerItemId: string | null,
  source: 'scene' | 'world' | 'surface' | 'global' = surface.type === 'slide' ? 'scene' : 'world',
  globalLayerItems: readonly { item: LayerItem }[] = [],
): LayerItem | null {
  if (!layerItemId) return null
  const items = source === 'global'
    ? globalLayerItems.map((entry) => entry.item)
    : source === 'surface'
      ? surface.surfaceLayerItems.map((entry) => entry.item)
      : source === 'world' && surface.type === 'spatial-2d'
        ? surface.world.layerItems
      : surface.type === 'slide'
        ? surface.scenes.find((scene) => scene.id === sceneId)?.layerItems ?? []
        : surface.type === 'spatial-2d'
          ? surface.world.layerItems
          : []
  return items.find((item) => item.layerItemId === layerItemId) ?? null
}
