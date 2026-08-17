import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  LayerItem,
  SpatialCameraPose,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import {
  spatialCameraFromPose,
  validateSpatialCamera,
  worldToScreen,
  type SpatialCamera,
} from '../../player/surfaces/spatial/spatialModel'
import {
  buildWorkspaceMinimap,
  cullWorkspaceItems,
  panCamera,
  screenPointToWorld,
  worldGroupTransform,
  workspaceFrameChanged,
  workspaceFrameFromLayerItem,
  zoomCameraAt,
  type SpatialWorkspaceFrame,
} from './spatialWorkspaceAuthoring'
import type { WorkspaceControllerLocateRequest } from './workspaceSlideAuthoring'

export interface SpatialWorkspaceItemTransform extends SpatialWorkspaceFrame {
  readonly layerItemId: string
}

/**
 * The course-global teacher controller is authored in Spatial as a screen
 * layer. It intentionally has a separate, source-explicit contract from
 * `SpatialWorkspaceItemTransform`, which is reserved for world items.
 */
export interface SpatialWorkspaceScreenControllerTarget {
  readonly source: 'global'
  readonly layerItemId: string
}

export interface SpatialWorkspaceScreenController extends SpatialWorkspaceScreenControllerTarget {
  readonly label: string
  readonly title: string
  readonly compact: boolean
  readonly locked: boolean
  readonly opacity: number
  readonly frame: SpatialWorkspaceFrame
}

export interface SpatialWorkspaceScreenControllerTransform
  extends SpatialWorkspaceScreenControllerTarget, SpatialWorkspaceFrame {}

export interface SpatialWorkspaceProps {
  readonly spatial: SpatialSurfaceDocument
  readonly viewportSize: { width: number; height: number }
  readonly selectedLayerItemIds?: readonly string[]
  readonly interactionDisabled?: boolean
  readonly activeCameraFrameId?: string | null
  readonly onCameraChange?: (pose: SpatialCameraPose) => void
  readonly onSelect: (ids: readonly string[]) => void
  readonly onTransformEnd: (transforms: readonly SpatialWorkspaceItemTransform[]) => void
  /** Effective-visible global teacher controller, rendered outside the world. */
  readonly screenController?: SpatialWorkspaceScreenController | null
  readonly selectedScreenControllerTarget?: SpatialWorkspaceScreenControllerTarget | null
  /** One-shot UI focus request for the existing fixed screen controller. */
  readonly controllerLocateRequest?: WorkspaceControllerLocateRequest | null
  readonly onSelectScreenController?: (
    target: SpatialWorkspaceScreenControllerTarget,
  ) => void
  readonly onScreenControllerTransformEnd?: (
    transform: SpatialWorkspaceScreenControllerTransform,
  ) => void
}

type SpatialGestureKind = 'pan' | 'move' | 'resize' | 'rotate'

const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type ResizeHandle = (typeof RESIZE_HANDLES)[number]

const MIN_SPATIAL_ITEM_SIZE = 8
const DRAG_START_PX = 3
const HANDLE_SIZE = 9

interface SpatialGesture {
  readonly kind: SpatialGestureKind
  /** World transforms use the camera; screen controller transforms do not. */
  readonly coordinateSpace: 'world' | 'screen'
  readonly pointerId: number
  readonly startClientX: number
  readonly startClientY: number
  readonly startPoint: { x: number; y: number }
  readonly startCamera: SpatialCamera
  readonly itemIds: readonly string[]
  readonly startDrafts: Readonly<Record<string, SpatialWorkspaceFrame>>
  readonly screenController?: SpatialWorkspaceScreenController
  readonly resizeHandle?: ResizeHandle
  moved: boolean
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(value)
    ? value
    : fallback
}

function spatialItemCenter(frame: SpatialWorkspaceFrame): { x: number; y: number } {
  return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }
}

function spatialPathDashArray(dash?: 'solid' | 'dashed' | 'dotted'): string | undefined {
  if (dash === 'dashed') return '8 6'
  if (dash === 'dotted') return '2 5'
  return undefined
}

function spatialRelationMarkerId(relationId: string, index: number): string {
  return `spatial-relation-${index}-${relationId.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

function workspaceItemFrame(
  item: LayerItem,
  drafts: Readonly<Record<string, SpatialWorkspaceFrame>>,
): SpatialWorkspaceFrame {
  return drafts[item.layerItemId] ?? workspaceFrameFromLayerItem(item)
}

function frameScreenCenter(
  camera: SpatialCamera,
  frame: SpatialWorkspaceFrame,
): { x: number; y: number } {
  return worldToScreen(camera, {
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  })
}

function selectionScreenRect(
  camera: SpatialCamera,
  frame: SpatialWorkspaceFrame,
): { x: number; y: number; width: number; height: number } {
  const center = frameScreenCenter(camera, frame)
  return {
    x: center.x - frame.width * camera.zoom / 2,
    y: center.y - frame.height * camera.zoom / 2,
    width: frame.width * camera.zoom,
    height: frame.height * camera.zoom,
  }
}

function resizeFrame(
  start: SpatialWorkspaceFrame,
  handle: ResizeHandle,
  worldPoint: { x: number; y: number },
): SpatialWorkspaceFrame {
  const min = MIN_SPATIAL_ITEM_SIZE
  let { x, y, width, height } = start
  const right = x + width
  const bottom = y + height
  if (handle === 'nw' || handle === 'w' || handle === 'sw') {
    x = Math.min(worldPoint.x, right - min)
    width = right - x
  }
  if (handle === 'ne' || handle === 'e' || handle === 'se') {
    width = Math.max(min, worldPoint.x - x)
  }
  if (handle === 'nw' || handle === 'n' || handle === 'ne') {
    y = Math.min(worldPoint.y, bottom - min)
    height = bottom - y
  }
  if (handle === 'sw' || handle === 's' || handle === 'se') {
    height = Math.max(min, worldPoint.y - y)
  }
  return { x, y, width, height, rotation: start.rotation }
}

function rotateFrame(
  start: SpatialWorkspaceFrame,
  camera: SpatialCamera,
  startPoint: { x: number; y: number },
  currentPoint: { x: number; y: number },
): SpatialWorkspaceFrame {
  const center = frameScreenCenter(camera, start)
  const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x)
  const currentAngle = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x)
  const rotation = start.rotation + (currentAngle - startAngle) * 180 / Math.PI
  return { ...start, rotation: Math.min(36_000, Math.max(-36_000, rotation)) }
}

function rotateScreenFrame(
  start: SpatialWorkspaceFrame,
  startPoint: { x: number; y: number },
  currentPoint: { x: number; y: number },
): SpatialWorkspaceFrame {
  const center = {
    x: start.x + start.width / 2,
    y: start.y + start.height / 2,
  }
  const startAngle = Math.atan2(startPoint.y - center.y, startPoint.x - center.x)
  const currentAngle = Math.atan2(currentPoint.y - center.y, currentPoint.x - center.x)
  const rotation = start.rotation + (currentAngle - startAngle) * 180 / Math.PI
  return { ...start, rotation: Math.min(36_000, Math.max(-36_000, rotation)) }
}

function screenControllerFrameChanged(
  controller: SpatialWorkspaceScreenController,
  frame: SpatialWorkspaceFrame,
): boolean {
  const start = controller.frame
  return start.x !== frame.x ||
    start.y !== frame.y ||
    start.width !== frame.width ||
    start.height !== frame.height ||
    start.rotation !== frame.rotation
}

function nativeKindLabel(item: Extract<LayerItem, { kind: 'native' }>): string {
  switch (item.content.nativeType) {
    case 'image': return '图片'
    case 'video': return '视频'
    case 'formula': return '公式'
    case 'shape': return '图形'
    case 'teacher-controller': return '教师控制器'
    case 'text': return '文本'
  }
}

function renderShapeGlyph(
  item: Extract<LayerItem, { kind: 'native' }>,
  frame: SpatialWorkspaceFrame,
): React.JSX.Element {
  const content = item.content as { nativeType: 'shape'; data: {
    shapeType: string
    style: {
      fillColor: string
      fillOpacity: number
      borderColor: string
      borderOpacity: number
      borderWidth: number
      lineStyle: string
      cornerRadius: number
      startArrow: string
      endArrow: string
    }
  } }
  const data = content.data
  const shapeType = data.shapeType
  const fill = safeColor(data.style.fillColor, '#e2e8f0')
  const stroke = safeColor(data.style.borderColor, '#64748b')
  const strokeWidth = Math.max(0, data.style.borderWidth)
  const common = {
    fill,
    fillOpacity: Math.max(0, Math.min(1, data.style.fillOpacity)),
    stroke,
    strokeOpacity: Math.max(0, Math.min(1, data.style.borderOpacity)),
    strokeWidth,
  }
  if (shapeType === 'ellipse') {
    return <ellipse {...common} cx={frame.x + frame.width / 2} cy={frame.y + frame.height / 2} rx={frame.width / 2} ry={frame.height / 2} />
  }
  if (shapeType === 'triangle') {
    return <polygon {...common} points={`${frame.x + frame.width / 2},${frame.y} ${frame.x + frame.width},${frame.y + frame.height} ${frame.x},${frame.y + frame.height}`} />
  }
  if (shapeType === 'diamond') {
    return <polygon {...common} points={`${frame.x + frame.width / 2},${frame.y} ${frame.x + frame.width},${frame.y + frame.height / 2} ${frame.x + frame.width / 2},${frame.y + frame.height} ${frame.x},${frame.y + frame.height / 2}`} />
  }
  if (shapeType === 'line' || shapeType.startsWith('arrow-')) {
    const vertical = shapeType === 'arrow-up' || shapeType === 'arrow-down'
    return vertical
      ? <line {...common} x1={frame.x + frame.width / 2} y1={frame.y} x2={frame.x + frame.width / 2} y2={frame.y + frame.height} />
      : <line {...common} x1={frame.x} y1={frame.y + frame.height / 2} x2={frame.x + frame.width} y2={frame.y + frame.height / 2} />
  }
  return <rect {...common} x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx={shapeType === 'rounded-rectangle' ? Math.max(1, data.style.cornerRadius) : 0} />
}

function renderWorldItemContent(
  item: LayerItem,
  frame: SpatialWorkspaceFrame,
): React.JSX.Element {
  if (item.kind === 'component' || item.kind === 'runtime') {
    const label = item.kind === 'component'
      ? `互动组件：${item.label}`
      : `互动运行时：${item.label}`
    return (
      <g>
        <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx={8} fill={item.kind === 'component' ? '#eff6ff' : '#f5f3ff'} stroke="#64748b" />
        <text x={frame.x + frame.width / 2} y={frame.y + frame.height / 2} textAnchor="middle" dominantBaseline="middle" fill="#172033" fontSize={14}>{label}</text>
      </g>
    )
  }

  const native = item as Extract<LayerItem, { kind: 'native' }>
  if (native.content.nativeType === 'text') {
    const data = native.content.data
    const style = data.style
    return (
      <g>
        {style.backgroundOpacity > 0 && (
          <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx={Math.max(0, style.cornerRadius)} fill={safeColor(style.backgroundColor, '#ffffff')} fillOpacity={Math.max(0, Math.min(1, style.backgroundOpacity))} />
        )}
        <text
          x={frame.x + frame.width / 2}
          y={frame.y + frame.height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={safeColor(style.color, '#172033')}
          fontFamily={style.fontFamily}
          fontSize={style.fontSize}
          fontWeight={style.bold ? 700 : 400}
          fontStyle={style.italic ? 'italic' : 'normal'}
          textDecoration={[style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ') || undefined}
        >
          {data.text}
        </text>
      </g>
    )
  }

  const label = `${nativeKindLabel(native)}：${item.label}`
  if (native.content.nativeType === 'shape') {
    return (
      <g>
        {renderShapeGlyph(native, frame)}
        <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} fill="none" stroke="#94a3b8" strokeDasharray="4 4" />
      </g>
    )
  }
  if (native.content.nativeType === 'formula') {
    return (
      <g>
        <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx={4} fill="#fff7ed" stroke="#64748b" />
        <text x={frame.x + frame.width / 2} y={frame.y + frame.height / 2} textAnchor="middle" dominantBaseline="middle" fill="#172033" fontSize={14}>
          {label}：{native.content.data.accessibleText}
        </text>
      </g>
    )
  }
  return (
    <g>
      <rect x={frame.x} y={frame.y} width={frame.width} height={frame.height} rx={4} fill={native.content.nativeType === 'teacher-controller' ? '#fef2f2' : '#f0fdf4'} stroke="#64748b" />
      <text x={frame.x + frame.width / 2} y={frame.y + frame.height / 2} textAnchor="middle" dominantBaseline="middle" fill="#172033" fontSize={14}>{label}</text>
    </g>
  )
}

export function SpatialWorkspace(props: SpatialWorkspaceProps): React.JSX.Element {
  const {
    spatial,
    viewportSize,
    selectedLayerItemIds,
    interactionDisabled = false,
    activeCameraFrameId,
    onCameraChange,
    onSelect,
    onTransformEnd,
    screenController,
    selectedScreenControllerTarget,
    controllerLocateRequest,
    onSelectScreenController,
    onScreenControllerTransformEnd,
  } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const screenControllerRef = useRef<HTMLDivElement>(null)
  const lastControllerLocateRequestRef = useRef<number | null>(null)
  const [camera, setCamera] = useState<SpatialCamera>(() => {
    const activeFrame = activeCameraFrameId
      ? spatial.camera.frames.find((frame) => frame.id === activeCameraFrameId)
      : undefined
    return spatialCameraFromPose(activeFrame ?? spatial.camera.home, viewportSize)
  })
  const [drafts, setDrafts] = useState<Readonly<Record<string, SpatialWorkspaceFrame>>>({})
  const draftsRef = useRef<Readonly<Record<string, SpatialWorkspaceFrame>>>({})
  const gestureRef = useRef<SpatialGesture | null>(null)
  const cameraRef = useRef(camera)
  cameraRef.current = camera
  const onCameraChangeRef = useRef(onCameraChange)
  onCameraChangeRef.current = onCameraChange
  const previousHomeRef = useRef({
    surfaceId: spatial.id,
    x: spatial.camera.home.x,
    y: spatial.camera.home.y,
    zoom: spatial.camera.home.zoom,
  })
  const previousActiveCameraFrameIdRef = useRef(activeCameraFrameId)
  const wheelEmitRafRef = useRef<number | null>(null)
  const pendingWheelPoseRef = useRef<SpatialCameraPose | null>(null)

  const commitCamera = useCallback((next: SpatialCamera): void => {
    setCamera(next)
    cameraRef.current = next
    onCameraChangeRef.current?.({ x: next.x, y: next.y, zoom: next.zoom })
  }, [])

  const scheduleWheelEmit = useCallback((pose: SpatialCameraPose): void => {
    pendingWheelPoseRef.current = { x: pose.x, y: pose.y, zoom: pose.zoom }
    if (wheelEmitRafRef.current !== null) return
    const flushWheelEmit = (): void => {
      wheelEmitRafRef.current = null
      const latest = pendingWheelPoseRef.current
      pendingWheelPoseRef.current = null
      if (latest) {
        onCameraChangeRef.current?.({ x: latest.x, y: latest.y, zoom: latest.zoom })
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      wheelEmitRafRef.current = requestAnimationFrame(flushWheelEmit)
    } else {
      wheelEmitRafRef.current = window.setTimeout(flushWheelEmit, 16)
    }
  }, [])

  const selectedIds = selectedLayerItemIds ?? []
  const screenControllerSelected = screenController !== undefined &&
    screenController !== null &&
    selectedScreenControllerTarget?.source === 'global' &&
    selectedScreenControllerTarget.layerItemId === screenController.layerItemId

  // Spatial's global controller lives in a fixed screen layer outside the
  // camera-transformed world. Focusing that existing element is therefore the
  // correct locate behavior; the camera must not be rewritten for it.
  useEffect(() => {
    if (
      !controllerLocateRequest ||
      !screenController ||
      controllerLocateRequest.layerItemId !== screenController.layerItemId ||
      lastControllerLocateRequestRef.current === controllerLocateRequest.requestId
    ) return
    const controller = screenControllerRef.current
    if (!controller) return
    lastControllerLocateRequestRef.current = controllerLocateRequest.requestId
    controller.focus({ preventScroll: true })
  }, [controllerLocateRequest, screenController])
  const itemById = useMemo(
    () => new Map(spatial.world.layerItems.map((item) => [item.layerItemId, item])),
    [spatial.world.layerItems],
  )

  // Reset the session camera only when the surface identity or its authored
  // home pose changes. Viewport-size changes keep the current pan/zoom.
  useEffect(() => {
    const previousHome = previousHomeRef.current
    const nextHome = {
      surfaceId: spatial.id,
      x: spatial.camera.home.x,
      y: spatial.camera.home.y,
      zoom: spatial.camera.home.zoom,
    }
    previousHomeRef.current = nextHome
    if (
      previousHome.surfaceId === nextHome.surfaceId &&
      previousHome.x === nextHome.x &&
      previousHome.y === nextHome.y &&
      previousHome.zoom === nextHome.zoom
    ) return
    setCamera(spatialCameraFromPose(spatial.camera.home, viewportSize))
  }, [
    spatial.id,
    spatial.camera.home.x,
    spatial.camera.home.y,
    spatial.camera.home.zoom,
    viewportSize.width,
    viewportSize.height,
  ])

  useEffect(() => {
    setCamera((current) => validateSpatialCamera({
      ...current,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
    }))
  }, [viewportSize.width, viewportSize.height])

  useEffect(() => {
    const previousFrameId = previousActiveCameraFrameIdRef.current
    previousActiveCameraFrameIdRef.current = activeCameraFrameId
    if (previousFrameId === activeCameraFrameId) return
    const activeFrame = activeCameraFrameId
      ? spatial.camera.frames.find((frame) => frame.id === activeCameraFrameId)
      : undefined
    if (!activeFrame) return
    commitCamera(spatialCameraFromPose(
      { x: activeFrame.x, y: activeFrame.y, zoom: activeFrame.zoom },
      viewportSize,
    ))
  }, [
    activeCameraFrameId,
    commitCamera,
    spatial.camera.frames,
    viewportSize.width,
    viewportSize.height,
  ])

  useEffect(() => () => {
    const rafId = wheelEmitRafRef.current
    if (rafId === null) return
    if (typeof requestAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
    } else {
      window.clearTimeout(rafId)
    }
  }, [])

  const commitDrafts = useCallback((next: Readonly<Record<string, SpatialWorkspaceFrame>>) => {
    draftsRef.current = next
    setDrafts(next)
  }, [])

  const visibleEntries = useMemo(
    () => cullWorkspaceItems(spatial, camera),
    [spatial, camera],
  )
  const minimap = useMemo(
    () => buildWorkspaceMinimap(spatial, camera),
    [spatial, camera],
  )

  const renderItems = useMemo(() => {
    const byId = new Map<string, LayerItem>()
    for (const entry of visibleEntries) byId.set(entry.item.layerItemId, entry.item)
    for (const id of selectedIds) {
      const item = itemById.get(id)
      if (item && !byId.has(id)) byId.set(id, item)
    }
    return [...byId.values()].sort((left, right) => (
      left.order - right.order || left.layerItemId.localeCompare(right.layerItemId)
    ))
  }, [itemById, selectedIds, visibleEntries])

  const clientToViewportPoint = useCallback((clientX: number, clientY: number) => {
    const bounds = rootRef.current?.getBoundingClientRect()
    return {
      x: clientX - (bounds?.left ?? 0),
      y: clientY - (bounds?.top ?? 0),
    }
  }, [])

  const finishGesture = useCallback((event: ReactPointerEvent): void => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    rootRef.current?.releasePointerCapture?.(event.pointerId)
    if (gesture.kind === 'pan') {
      if (!gesture.moved) return
      const nextCamera = panCamera(
        gesture.startCamera,
        {
          x: event.clientX - gesture.startClientX,
          y: event.clientY - gesture.startClientY,
        },
      )
      commitCamera(nextCamera)
      return
    }
    if (!gesture.moved) {
      commitDrafts({})
      return
    }
    if (gesture.coordinateSpace === 'screen') {
      const controller = gesture.screenController
      const frame = controller
        ? draftsRef.current[controller.layerItemId]
        : undefined
      commitDrafts({})
      if (controller && frame && screenControllerFrameChanged(controller, frame)) {
        onScreenControllerTransformEnd?.({
          source: 'global',
          layerItemId: controller.layerItemId,
          ...frame,
        })
      }
      return
    }
    const transforms: SpatialWorkspaceItemTransform[] = []
    for (const layerItemId of gesture.itemIds) {
      const frame = draftsRef.current[layerItemId]
      const item = itemById.get(layerItemId)
      if (frame && item && workspaceFrameChanged(item, frame)) {
        transforms.push({ layerItemId, ...frame })
      }
    }
    commitDrafts({})
    if (transforms.length > 0) onTransformEnd(transforms)
  }, [
    commitCamera,
    commitDrafts,
    itemById,
    onScreenControllerTransformEnd,
    onTransformEnd,
  ])

  const handlePointerMove = useCallback((event: ReactPointerEvent): void => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const deltaX = event.clientX - gesture.startClientX
    const deltaY = event.clientY - gesture.startClientY
    if (!gesture.moved && Math.hypot(deltaX, deltaY) <= DRAG_START_PX) return
    gesture.moved = true

    if (gesture.kind === 'pan') {
      setCamera(panCamera(gesture.startCamera, { x: deltaX, y: deltaY }))
      return
    }
    if (gesture.kind === 'move') {
      const zoom = gesture.coordinateSpace === 'world'
        ? gesture.startCamera.zoom
        : 1
      const next: Record<string, SpatialWorkspaceFrame> = {}
      for (const layerItemId of gesture.itemIds) {
        const start = gesture.startDrafts[layerItemId]
        if (!start) continue
        next[layerItemId] = {
          ...start,
          x: start.x + deltaX / zoom,
          y: start.y + deltaY / zoom,
        }
      }
      commitDrafts(next)
      return
    }
    const point = clientToViewportPoint(event.clientX, event.clientY)
    const next: Record<string, SpatialWorkspaceFrame> = {}
    for (const layerItemId of gesture.itemIds) {
      const start = gesture.startDrafts[layerItemId]
      if (!start) continue
      if (gesture.kind === 'resize') {
        next[layerItemId] = resizeFrame(
          start,
          gesture.resizeHandle!,
          gesture.coordinateSpace === 'world'
            ? screenPointToWorld(gesture.startCamera, point)
            : point,
        )
      } else {
        next[layerItemId] = gesture.coordinateSpace === 'world'
          ? rotateFrame(start, gesture.startCamera, gesture.startPoint, point)
          : rotateScreenFrame(start, gesture.startPoint, point)
      }
    }
    commitDrafts(next)
  }, [clientToViewportPoint, commitDrafts])

  const beginItemGesture = useCallback((
    event: ReactPointerEvent,
    nextSelection: readonly string[],
  ): void => {
    const startDrafts: Record<string, SpatialWorkspaceFrame> = {}
    for (const layerItemId of nextSelection) {
      const candidate = itemById.get(layerItemId)
      if (candidate && !candidate.locked) {
        startDrafts[layerItemId] = workspaceFrameFromLayerItem(candidate)
      }
    }
    if (Object.keys(startDrafts).length === 0) return
    gestureRef.current = {
      kind: 'move',
      coordinateSpace: 'world',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: clientToViewportPoint(event.clientX, event.clientY),
      startCamera: camera,
      itemIds: Object.keys(startDrafts),
      startDrafts,
      moved: false,
    }
    commitDrafts(startDrafts)
    rootRef.current?.setPointerCapture?.(event.pointerId)
  }, [camera, clientToViewportPoint, commitDrafts, itemById])

  const beginScreenControllerGesture = useCallback((
    event: ReactPointerEvent,
    controller: SpatialWorkspaceScreenController,
    kind: Exclude<SpatialGestureKind, 'pan'>,
    resizeHandle?: ResizeHandle,
  ): void => {
    if (controller.locked || interactionDisabled) return
    const start = draftsRef.current[controller.layerItemId] ?? controller.frame
    const startDrafts = { [controller.layerItemId]: start }
    gestureRef.current = {
      kind,
      coordinateSpace: 'screen',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: clientToViewportPoint(event.clientX, event.clientY),
      startCamera: camera,
      itemIds: [controller.layerItemId],
      startDrafts,
      screenController: controller,
      ...(resizeHandle ? { resizeHandle } : {}),
      moved: false,
    }
    commitDrafts(startDrafts)
    rootRef.current?.setPointerCapture?.(event.pointerId)
  }, [camera, clientToViewportPoint, commitDrafts, interactionDisabled])

  const handleItemPointerDown = useCallback((
    event: ReactPointerEvent<SVGGElement>,
    item: LayerItem,
  ): void => {
    if (event.button !== 0 || interactionDisabled) return
    event.preventDefault()
    event.stopPropagation()
    const layerItemId = item.layerItemId
    let nextSelection: readonly string[]
    if (event.shiftKey) {
      nextSelection = selectedIds.includes(layerItemId)
        ? selectedIds.filter((id) => id !== layerItemId)
        : [...selectedIds, layerItemId]
      onSelect(nextSelection)
    } else if (!selectedIds.includes(layerItemId)) {
      nextSelection = [layerItemId]
      onSelect(nextSelection)
    } else {
      nextSelection = selectedIds
    }
    beginItemGesture(event, nextSelection)
  }, [beginItemGesture, interactionDisabled, onSelect, selectedIds])

  const handleScreenControllerPointerDown = useCallback((
    event: ReactPointerEvent<HTMLDivElement>,
    controller: SpatialWorkspaceScreenController,
  ): void => {
    if (event.button !== 0 || interactionDisabled) return
    event.preventDefault()
    event.stopPropagation()
    onSelectScreenController?.({
      source: 'global',
      layerItemId: controller.layerItemId,
    })
    if (onScreenControllerTransformEnd) {
      beginScreenControllerGesture(event, controller, 'move')
    }
  }, [
    beginScreenControllerGesture,
    interactionDisabled,
    onScreenControllerTransformEnd,
    onSelectScreenController,
  ])

  const handleResizePointerDown = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    item: LayerItem,
    handle: ResizeHandle,
  ): void => {
    if (event.button !== 0 || interactionDisabled || item.locked) return
    event.preventDefault()
    event.stopPropagation()
    const start = workspaceFrameFromLayerItem(item)
    const startDrafts = { [item.layerItemId]: start }
    gestureRef.current = {
      kind: 'resize',
      coordinateSpace: 'world',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: clientToViewportPoint(event.clientX, event.clientY),
      startCamera: camera,
      itemIds: [item.layerItemId],
      startDrafts,
      resizeHandle: handle,
      moved: false,
    }
    commitDrafts(startDrafts)
    rootRef.current?.setPointerCapture?.(event.pointerId)
  }, [camera, clientToViewportPoint, commitDrafts, interactionDisabled])

  const handleRotatePointerDown = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    item: LayerItem,
  ): void => {
    if (event.button !== 0 || interactionDisabled || item.locked) return
    event.preventDefault()
    event.stopPropagation()
    const start = workspaceFrameFromLayerItem(item)
    const startDrafts = { [item.layerItemId]: start }
    gestureRef.current = {
      kind: 'rotate',
      coordinateSpace: 'world',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: clientToViewportPoint(event.clientX, event.clientY),
      startCamera: camera,
      itemIds: [item.layerItemId],
      startDrafts,
      moved: false,
    }
    commitDrafts(startDrafts)
    rootRef.current?.setPointerCapture?.(event.pointerId)
  }, [camera, clientToViewportPoint, commitDrafts, interactionDisabled])

  const handleScreenControllerResizePointerDown = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    controller: SpatialWorkspaceScreenController,
    handle: ResizeHandle,
  ): void => {
    if (event.button !== 0 || interactionDisabled || controller.locked) return
    event.preventDefault()
    event.stopPropagation()
    beginScreenControllerGesture(event, controller, 'resize', handle)
  }, [beginScreenControllerGesture, interactionDisabled])

  const handleScreenControllerRotatePointerDown = useCallback((
    event: ReactPointerEvent<HTMLButtonElement>,
    controller: SpatialWorkspaceScreenController,
  ): void => {
    if (event.button !== 0 || interactionDisabled || controller.locked) return
    event.preventDefault()
    event.stopPropagation()
    beginScreenControllerGesture(event, controller, 'rotate')
  }, [beginScreenControllerGesture, interactionDisabled])

  const handleRootPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || interactionDisabled) return
    const target = event.target as Element
    if (target.closest('[data-spatial-item]')) return
    if (target.closest('[data-spatial-screen-controller]')) return
    if (target.closest('[data-spatial-handle]')) return
    if (target.closest('.spatial-workspace__controls, .spatial-workspace__minimap')) return
    gestureRef.current = {
      kind: 'pan',
      coordinateSpace: 'world',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: clientToViewportPoint(event.clientX, event.clientY),
      startCamera: camera,
      itemIds: [],
      startDrafts: {},
      moved: false,
    }
    rootRef.current?.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }, [camera, clientToViewportPoint, interactionDisabled])

  const handleRootPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    finishGesture(event)
  }, [finishGesture])

  const handleRootPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    commitDrafts({})
  }, [commitDrafts])

  // Native listener: React's wheel binding is not guaranteed to be
  // non-passive, and the authoring workspace must keep its zoom-at-cursor
  // behavior when a trackpad or wheel is used. Camera updates are applied
  // immediately so the canvas feels responsive; the callback is scheduled on
  // the next animation frame so it is not emitted once per wheel tick.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const handleWheel = (event: WheelEvent): void => {
      if (interactionDisabled) return
      const bounds = root.getBoundingClientRect()
      const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const factor = Math.exp(-event.deltaY * 0.0015)
      const current = cameraRef.current
      const next = zoomCameraAt(current, current.zoom * factor, anchor)
      setCamera(next)
      cameraRef.current = next
      scheduleWheelEmit({ x: next.x, y: next.y, zoom: next.zoom })
      event.preventDefault()
    }
    root.addEventListener('wheel', handleWheel, { passive: false })
    return () => root.removeEventListener('wheel', handleWheel)
  }, [interactionDisabled, scheduleWheelEmit])

  const zoomBy = useCallback((factor: number): void => {
    const current = cameraRef.current
    commitCamera(zoomCameraAt(
      current,
      current.zoom * factor,
      { x: current.viewportWidth / 2, y: current.viewportHeight / 2 },
    ))
  }, [commitCamera])

  const resetCamera = useCallback((): void => {
    commitCamera(spatialCameraFromPose(spatial.camera.home, viewportSize))
  }, [commitCamera, spatial.camera.home, viewportSize])

  const zoomPercent = Math.round(camera.zoom * 100)

  return (
    <div
      ref={rootRef}
      className="spatial-workspace"
      data-testid="spatial-workspace"
      data-camera-zoom={camera.zoom}
      data-camera-x={camera.x}
      data-camera-y={camera.y}
      onPointerDown={handleRootPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handleRootPointerUp}
      onPointerCancel={handleRootPointerCancel}
      style={{
        position: 'relative',
        width: viewportSize.width,
        height: viewportSize.height,
        overflow: 'hidden',
        background: '#f5f7fb',
        userSelect: 'none',
        touchAction: 'none',
        isolation: 'isolate',
      }}
    >
      <svg
        className="spatial-workspace__surface"
        width={viewportSize.width}
        height={viewportSize.height}
        viewBox={`0 0 ${viewportSize.width} ${viewportSize.height}`}
        style={{ display: 'block', width: viewportSize.width, height: viewportSize.height }}
      >
        <g data-spatial-world transform={worldGroupTransform(camera)}>
          {((spatial.world.paths?.length ?? 0) > 0 || (spatial.world.relations?.length ?? 0) > 0) && (
            <g data-spatial-paths-relations style={{ pointerEvents: 'none' }}>
              <defs>
                {(spatial.world.relations ?? []).map((relation, index) => relation.kind === 'line'
                  ? null
                  : (
                    <marker
                      key={relation.id}
                      id={spatialRelationMarkerId(relation.id, index)}
                      markerWidth="10"
                      markerHeight="10"
                      refX="9"
                      refY="5"
                      orient="auto-start-reverse"
                      markerUnits="strokeWidth"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
                    </marker>
                  ))}
              </defs>
              {(spatial.world.paths ?? []).map((path) => {
                const points = path.layerItemIds
                  .map((layerItemId) => itemById.get(layerItemId))
                  .filter((item): item is LayerItem => Boolean(item))
                  .map((item) => spatialItemCenter(workspaceItemFrame(item, drafts)))
                if (points.length === 0) return null
                const style = path.style ?? {}
                return (
                  <polyline
                    key={path.id}
                    data-spatial-path-id={path.id}
                    points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                    fill="none"
                    stroke={safeColor(style.color, '#64748b')}
                    strokeWidth={Math.max(0.5, style.width ?? 2)}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={spatialPathDashArray(style.dash)}
                  />
                )
              })}
              {(spatial.world.relations ?? []).map((relation, index) => {
                const source = itemById.get(relation.sourceLayerItemId)
                const target = itemById.get(relation.targetLayerItemId)
                if (!source || !target) return null
                const sourcePoint = spatialItemCenter(workspaceItemFrame(source, drafts))
                const targetPoint = spatialItemCenter(workspaceItemFrame(target, drafts))
                const markerId = spatialRelationMarkerId(relation.id, index)
                return (
                  <line
                    key={relation.id}
                    data-spatial-relation-id={relation.id}
                    x1={sourcePoint.x}
                    y1={sourcePoint.y}
                    x2={targetPoint.x}
                    y2={targetPoint.y}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeLinecap="round"
                    markerStart={relation.kind === 'bidirectional' ? `url(#${markerId})` : undefined}
                    markerEnd={relation.kind === 'line' ? undefined : `url(#${markerId})`}
                  />
                )
              })}
            </g>
          )}
          {renderItems.map((item) => {
            const frame = drafts[item.layerItemId] ?? workspaceFrameFromLayerItem(item)
            const centerX = frame.x + frame.width / 2
            const centerY = frame.y + frame.height / 2
            return (
              <g
                key={item.layerItemId}
                data-layer-item-id={item.layerItemId}
                data-spatial-item
                opacity={item.opacity}
                transform={frame.rotation !== 0 ? `rotate(${frame.rotation} ${centerX} ${centerY})` : undefined}
                onPointerDown={(event) => handleItemPointerDown(event, item)}
                style={{ cursor: item.locked ? 'default' : 'move' }}
              >
                {renderWorldItemContent(item, frame)}
              </g>
            )
          })}
        </g>
      </svg>

      {screenController && (() => {
        const frame = drafts[screenController.layerItemId] ?? screenController.frame
        return (
          <div
            ref={screenControllerRef}
            className="spatial-workspace__screen-controller"
            data-spatial-screen-controller
            data-layer-item-id={screenController.layerItemId}
            data-layer-source={screenController.source}
            data-layer-locked={screenController.locked}
            data-testid="spatial-screen-controller"
            aria-label={`全课控制器：${screenController.title || screenController.label}`}
            aria-disabled={screenController.locked}
            tabIndex={-1}
            onPointerDown={(event) => handleScreenControllerPointerDown(event, screenController)}
            style={{
              position: 'absolute',
              left: frame.x,
              top: frame.y,
              width: frame.width,
              height: frame.height,
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: screenController.compact ? 6 : 10,
              padding: screenController.compact ? '4px 7px' : '8px 12px',
              border: screenControllerSelected
                ? '2px solid #2563eb'
                : '1px solid #64748b',
              borderRadius: 8,
              background: '#172033',
              color: '#f8fafc',
              opacity: screenController.opacity,
              transform: frame.rotation === 0 ? undefined : `rotate(${frame.rotation}deg)`,
              transformOrigin: 'center',
              cursor: screenController.locked ? 'default' : 'move',
              zIndex: 2,
              overflow: 'hidden',
            }}
          >
            <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {screenController.title || screenController.label || '全课控制器'}
            </strong>
            <span
              aria-hidden="true"
              style={{ fontSize: 11, opacity: 0.78, whiteSpace: 'nowrap' }}
            >
              {screenController.locked ? '已锁定' : '全课'}
            </span>
          </div>
        )
      })()}

      {screenController && screenControllerSelected && (() => {
        const frame = drafts[screenController.layerItemId] ?? screenController.frame
        return (
          <div
            className="spatial-workspace__screen-selection"
            data-testid="spatial-screen-selection"
            data-layer-item-id={screenController.layerItemId}
            style={{
              position: 'absolute',
              left: frame.x,
              top: frame.y,
              width: frame.width,
              height: frame.height,
              border: '1px solid #2563eb',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 4,
                top: -18,
                padding: '1px 6px',
                borderRadius: 3,
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 10,
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}
            >
              全课控制器
            </span>
            {!screenController.locked && RESIZE_HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                data-spatial-handle={`screen-resize-${handle}`}
                aria-label={`调整全课控制器大小 ${handle}`}
                onPointerDown={(event) => handleScreenControllerResizePointerDown(
                  event,
                  screenController,
                  handle,
                )}
                style={{
                  position: 'absolute',
                  ...handleStyle(handle, HANDLE_SIZE),
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  padding: 0,
                  border: '1px solid #2563eb',
                  borderRadius: 2,
                  background: '#ffffff',
                  pointerEvents: 'auto',
                  touchAction: 'none',
                }}
              />
            ))}
            {!screenController.locked && (
              <button
                type="button"
                data-spatial-handle="screen-rotate"
                aria-label="旋转全课控制器"
                onPointerDown={(event) => handleScreenControllerRotatePointerDown(
                  event,
                  screenController,
                )}
                style={{
                  position: 'absolute',
                  left: frame.width / 2 - 6,
                  top: -28,
                  width: 12,
                  height: 12,
                  padding: 0,
                  border: '1px solid #2563eb',
                  borderRadius: '50%',
                  background: '#ffffff',
                  pointerEvents: 'auto',
                  touchAction: 'none',
                  cursor: 'grab',
                }}
              />
            )}
          </div>
        )
      })()}

      {renderItems.map((item) => {
        if (!selectedIds.includes(item.layerItemId)) return null
        const frame = drafts[item.layerItemId] ?? workspaceFrameFromLayerItem(item)
        const rect = selectionScreenRect(camera, frame)
        return (
          <div
            key={item.layerItemId}
            className="spatial-workspace__selection-item"
            data-testid="spatial-selection"
            data-layer-item-id={item.layerItemId}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              border: '1px solid #2563eb',
              pointerEvents: 'none',
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 4,
                top: -18,
                padding: '1px 6px',
                borderRadius: 3,
                background: '#2563eb',
                color: '#ffffff',
                fontSize: 10,
                lineHeight: 1.4,
                whiteSpace: 'nowrap',
              }}
            >
              {item.label}
            </span>
            {RESIZE_HANDLES.map((handle) => (
              <button
                key={handle}
                type="button"
                data-spatial-handle={`resize-${handle}`}
                aria-label={`调整大小 ${handle}`}
                onPointerDown={(event) => handleResizePointerDown(event, item, handle)}
                style={{
                  position: 'absolute',
                  ...handleStyle(handle, HANDLE_SIZE),
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  padding: 0,
                  border: '1px solid #2563eb',
                  borderRadius: 2,
                  background: '#ffffff',
                  pointerEvents: 'auto',
                  touchAction: 'none',
                }}
              />
            ))}
            <button
              type="button"
              data-spatial-handle="rotate"
              aria-label="旋转"
              onPointerDown={(event) => handleRotatePointerDown(event, item)}
              style={{
                position: 'absolute',
                left: rect.width / 2 - 6,
                top: -28,
                width: 12,
                height: 12,
                padding: 0,
                border: '1px solid #2563eb',
                borderRadius: '50%',
                background: '#ffffff',
                pointerEvents: 'auto',
                touchAction: 'none',
                cursor: 'grab',
              }}
            />
          </div>
        )
      })}

      <svg
        className="spatial-workspace__minimap"
        data-testid="spatial-minimap"
        width={minimap.width}
        height={minimap.height}
        viewBox={`0 0 ${minimap.width} ${minimap.height}`}
        aria-label="空间内容小地图"
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          border: '1px solid rgba(0, 0, 0, 0.15)',
          borderRadius: 6,
          background: 'rgba(255, 255, 255, 0.92)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
        }}
      >
        {minimap.nodes.map((node) => (
          <rect
            key={node.id}
            data-layer-item-id={node.id}
            x={node.x}
            y={node.y}
            width={Math.max(1, node.width)}
            height={Math.max(1, node.height)}
            fill="#94a3b8"
            opacity="0.72"
          />
        ))}
        <rect
          className="spatial-workspace__minimap-viewport"
          x={minimap.viewport.x}
          y={minimap.viewport.y}
          width={Math.max(1, minimap.viewport.width)}
          height={Math.max(1, minimap.viewport.height)}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2"
        />
      </svg>

      <div
        className="spatial-workspace__controls"
        role="toolbar"
        aria-label="空间视图控制"
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          border: '1px solid rgba(0, 0, 0, 0.15)',
          borderRadius: 7,
          background: 'rgba(255, 255, 255, 0.92)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.18)',
        }}
      >
        <button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="缩小视图">−</button>
        <output
          data-testid="spatial-zoom-label"
          aria-label="空间缩放倍率"
          style={{ minWidth: 48, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
        >{zoomPercent}%</output>
        <button type="button" onClick={() => zoomBy(1.25)} aria-label="放大视图">+</button>
        <button type="button" onClick={resetCamera} aria-label="回到总览">⌂</button>
      </div>
    </div>
  )
}

function handleStyle(handle: ResizeHandle, size: number): React.CSSProperties {
  const half = size / 2
  const position: React.CSSProperties = {}
  if (handle === 'nw') {
    position.left = -half
    position.top = -half
  } else if (handle === 'n') {
    position.left = `calc(50% - ${half}px)`
    position.top = -half
  } else if (handle === 'ne') {
    position.right = -half
    position.top = -half
  } else if (handle === 'e') {
    position.right = -half
    position.top = `calc(50% - ${half}px)`
  } else if (handle === 'se') {
    position.right = -half
    position.bottom = -half
  } else if (handle === 's') {
    position.left = `calc(50% - ${half}px)`
    position.bottom = -half
  } else if (handle === 'sw') {
    position.left = -half
    position.bottom = -half
  } else {
    position.left = -half
    position.top = `calc(50% - ${half}px)`
  }
  return position
}
