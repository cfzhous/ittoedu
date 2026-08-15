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

export interface SpatialWorkspaceItemTransform extends SpatialWorkspaceFrame {
  readonly layerItemId: string
}

export interface SpatialWorkspaceProps {
  readonly spatial: SpatialSurfaceDocument
  readonly viewportSize: { width: number; height: number }
  readonly selectedLayerItemIds?: readonly string[]
  readonly interactionDisabled?: boolean
  readonly onSelect: (ids: readonly string[]) => void
  readonly onTransformEnd: (transforms: readonly SpatialWorkspaceItemTransform[]) => void
}

type SpatialGestureKind = 'pan' | 'move' | 'resize' | 'rotate'

const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
type ResizeHandle = (typeof RESIZE_HANDLES)[number]

const MIN_SPATIAL_ITEM_SIZE = 8
const DRAG_START_PX = 3
const HANDLE_SIZE = 9

interface SpatialGesture {
  readonly kind: SpatialGestureKind
  readonly pointerId: number
  readonly startClientX: number
  readonly startClientY: number
  readonly startPoint: { x: number; y: number }
  readonly startCamera: SpatialCamera
  readonly itemIds: readonly string[]
  readonly startDrafts: Readonly<Record<string, SpatialWorkspaceFrame>>
  readonly resizeHandle?: ResizeHandle
  moved: boolean
}

function safeColor(value: string | undefined, fallback: string): string {
  return value && /^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d\s.,%]+\))$/i.test(value)
    ? value
    : fallback
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
    onSelect,
    onTransformEnd,
  } = props
  const rootRef = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState<SpatialCamera>(() => (
    spatialCameraFromPose(spatial.camera.home, viewportSize)
  ))
  const [drafts, setDrafts] = useState<Readonly<Record<string, SpatialWorkspaceFrame>>>({})
  const draftsRef = useRef<Readonly<Record<string, SpatialWorkspaceFrame>>>({})
  const gestureRef = useRef<SpatialGesture | null>(null)

  const selectedIds = selectedLayerItemIds ?? []
  const itemById = useMemo(
    () => new Map(spatial.world.layerItems.map((item) => [item.layerItemId, item])),
    [spatial.world.layerItems],
  )

  // Reset the session camera only when the surface identity or its authored
  // home pose changes. Viewport-size changes keep the current pan/zoom.
  useEffect(() => {
    setCamera(spatialCameraFromPose(spatial.camera.home, viewportSize))
  }, [spatial.id, spatial.camera.home.x, spatial.camera.home.y, spatial.camera.home.zoom])

  useEffect(() => {
    setCamera((current) => validateSpatialCamera({
      ...current,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
    }))
  }, [viewportSize.width, viewportSize.height])

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
    if (gesture.kind === 'pan') return
    if (!gesture.moved) {
      commitDrafts({})
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
  }, [commitDrafts, itemById, onTransformEnd])

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
      const zoom = gesture.startCamera.zoom
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
        next[layerItemId] = resizeFrame(start, gesture.resizeHandle!, screenPointToWorld(gesture.startCamera, point))
      } else {
        next[layerItemId] = rotateFrame(start, gesture.startCamera, gesture.startPoint, point)
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

  const handleRootPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || interactionDisabled) return
    const target = event.target as Element
    if (target.closest('[data-spatial-item]')) return
    if (target.closest('[data-spatial-handle]')) return
    if (target.closest('.spatial-workspace__controls, .spatial-workspace__minimap')) return
    gestureRef.current = {
      kind: 'pan',
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
  // behavior when a trackpad or wheel is used.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const handleWheel = (event: WheelEvent): void => {
      if (interactionDisabled) return
      const bounds = root.getBoundingClientRect()
      const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      const factor = Math.exp(-event.deltaY * 0.0015)
      setCamera((current) => zoomCameraAt(current, current.zoom * factor, anchor))
      event.preventDefault()
    }
    root.addEventListener('wheel', handleWheel, { passive: false })
    return () => root.removeEventListener('wheel', handleWheel)
  }, [interactionDisabled])

  const zoomBy = useCallback((factor: number): void => {
    setCamera((current) => zoomCameraAt(
      current,
      current.zoom * factor,
      { x: current.viewportWidth / 2, y: current.viewportHeight / 2 },
    ))
  }, [])

  const resetCamera = useCallback((): void => {
    setCamera(spatialCameraFromPose(spatial.camera.home, viewportSize))
  }, [spatial.camera.home, viewportSize])

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
