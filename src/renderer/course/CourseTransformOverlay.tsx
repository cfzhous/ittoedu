import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  COURSE_RESIZE_HANDLES,
  applyCourseTransformRequest,
  courseSelectionBounds,
  rotationDeltaBetween,
  selectionRotationHandlePoint,
  toCourseTransformItem,
  type CourseResizeHandle,
  type CourseSelectionBounds,
  type CourseTransformItem,
  type CourseTransformKind,
  type CourseTransformRequest,
  type CourseTransformSourceItem,
  type LogicalPoint,
} from './courseTransformGeometry'

export interface ClientDeltaConversionContext {
  kind: Exclude<CourseTransformKind, 'nudge'>
  pointerId: number
  startClient: LogicalPoint
  currentClient: LogicalPoint
  resizeHandle?: CourseResizeHandle
}

export interface CourseTransformChange {
  kind: CourseTransformKind
  selectedLayerItemIds: readonly string[]
  initialItems: readonly CourseTransformItem[]
  items: readonly CourseTransformItem[]
  delta: LogicalPoint
  rotationDelta?: number
  resizeHandle?: CourseResizeHandle
  snappingDisabled: boolean
}

export interface CourseTransformOverlayProps {
  /** Current Project V9 facts. The overlay never derives these values from DOM. */
  items: readonly CourseTransformSourceItem[]
  selectedLayerItemIds: readonly string[]
  /** Converts a client-pixel drag into the caller's logical surface coordinates. */
  clientDeltaToLogicalDelta?(
    delta: LogicalPoint,
    context: ClientDeltaConversionContext,
  ): LogicalPoint
  /** Optional surface-specific transform policy. The default follows LayerItem semantics. */
  applyTransform?(request: CourseTransformRequest): readonly CourseTransformItem[]
  /** Pointer gestures emit zero or more previews, followed by exactly one commit. */
  onPreview?(change: CourseTransformChange): void
  onCommit(change: CourseTransformChange): void
  onCancel?(kind: Exclude<CourseTransformKind, 'nudge'>): void
  onDoubleClickSelection?(selectedLayerItemIds: readonly string[]): void
  /**
   * When false, the selected item's interior remains hit-testable (for Runtime
   * and Component authoring targets); moving stays available from four edges.
   */
  captureInterior?: boolean
  disabled?: boolean
  minimumSize?: number
  keyboardStep?: number
  keyboardLargeStep?: number
  rotationSnapDegrees?: number
  handleSize?: number
  rotationHandleOffset?: number
  className?: string
  style?: CSSProperties
  ariaLabel?: string
}

interface PointerGesture {
  kind: Exclude<CourseTransformKind, 'nudge'>
  pointerId: number
  startClient: LogicalPoint
  initialItems: CourseTransformItem[]
  initialBounds: CourseSelectionBounds
  resizeHandle?: CourseResizeHandle
  rotationStart: LogicalPoint
  captureTarget: HTMLDivElement
  lastChange: CourseTransformChange | null
}

const HANDLE_LABELS: Record<CourseResizeHandle, string> = {
  nw: '缩放左上角',
  n: '缩放上边',
  ne: '缩放右上角',
  e: '缩放右边',
  se: '缩放右下角',
  s: '缩放下边',
  sw: '缩放左下角',
  w: '缩放左边',
}

const HANDLE_CURSORS: Record<CourseResizeHandle, CSSProperties['cursor']> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

const HANDLE_POSITIONS: Record<CourseResizeHandle, Pick<CSSProperties, 'left' | 'top'>> = {
  nw: { left: '0%', top: '0%' },
  n: { left: '50%', top: '0%' },
  ne: { left: '100%', top: '0%' },
  e: { left: '100%', top: '50%' },
  se: { left: '100%', top: '100%' },
  s: { left: '50%', top: '100%' },
  sw: { left: '0%', top: '100%' },
  w: { left: '0%', top: '50%' },
}

function cloneTransformItems(items: readonly CourseTransformItem[]): CourseTransformItem[] {
  return items.map((item) => ({ ...item, frame: { ...item.frame } }))
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  )
}

function selectionStyle(bounds: CourseSelectionBounds): CSSProperties {
  return {
    position: 'absolute',
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transform: `rotate(${bounds.rotation}deg)`,
    transformOrigin: 'center center',
    boxSizing: 'border-box',
  }
}

function actionFromTarget(target: EventTarget | null): {
  kind: Exclude<CourseTransformKind, 'nudge'>
  resizeHandle?: CourseResizeHandle
  captureTarget: HTMLElement
} | null {
  if (!(target instanceof Element)) return null
  const actionNode = target.closest<HTMLElement>('[data-course-transform-action]')
  const action = actionNode?.dataset.courseTransformAction
  if (!actionNode) return null
  if (action === 'move' || action === 'rotate') return { kind: action, captureTarget: actionNode }
  if (action?.startsWith('resize:')) {
    const resizeHandle = action.slice('resize:'.length) as CourseResizeHandle
    if (COURSE_RESIZE_HANDLES.includes(resizeHandle)) {
      return { kind: 'resize', resizeHandle, captureTarget: actionNode }
    }
  }
  return null
}

function meaningfulChange(change: CourseTransformChange): boolean {
  return Math.abs(change.delta.x) > 1e-9 ||
    Math.abs(change.delta.y) > 1e-9 ||
    Math.abs(change.rotationDelta ?? 0) > 1e-9
}

function sameGesturePosition(left: CourseTransformChange, right: CourseTransformChange): boolean {
  return Math.abs(left.delta.x - right.delta.x) <= 1e-9 &&
    Math.abs(left.delta.y - right.delta.y) <= 1e-9 &&
    Math.abs((left.rotationDelta ?? 0) - (right.rotationDelta ?? 0)) <= 1e-9 &&
    left.resizeHandle === right.resizeHandle &&
    left.snappingDisabled === right.snappingDisabled
}

export function CourseTransformOverlay({
  items,
  selectedLayerItemIds,
  clientDeltaToLogicalDelta = (delta) => delta,
  applyTransform = applyCourseTransformRequest,
  onPreview,
  onCommit,
  onCancel,
  onDoubleClickSelection,
  captureInterior = true,
  disabled = false,
  minimumSize = 1,
  keyboardStep = 1,
  keyboardLargeStep = 10,
  rotationSnapDegrees = 15,
  handleSize = 10,
  rotationHandleOffset = 30,
  className,
  style,
  ariaLabel = '画布选择与变换层',
}: CourseTransformOverlayProps) {
  const selectedIdSet = useMemo(() => new Set(selectedLayerItemIds), [selectedLayerItemIds])
  const selectedItems = useMemo(
    () => items.filter((item) => selectedIdSet.has(item.layerItemId)).map(toCourseTransformItem),
    [items, selectedIdSet],
  )
  const selectionKey = selectedItems.map((item) => item.layerItemId).join('\u0000')
  const selectionLocked = selectedItems.some((item) => item.locked)
  const canTransform = !disabled && !selectionLocked && selectedItems.length > 0
  const gestureRef = useRef<PointerGesture | null>(null)
  const lastPointerActionRef = useRef<ReturnType<typeof actionFromTarget>>(null)
  const selectionKeyRef = useRef(selectionKey)
  const [previewItems, setPreviewItems] = useState<CourseTransformItem[] | null>(null)

  useEffect(() => {
    if (selectionKeyRef.current === selectionKey) return
    selectionKeyRef.current = selectionKey
    const gesture = gestureRef.current
    if (!gesture) return
    gestureRef.current = null
    setPreviewItems(null)
    if (typeof gesture.captureTarget.releasePointerCapture === 'function' &&
      gesture.captureTarget.hasPointerCapture?.(gesture.pointerId)) {
      gesture.captureTarget.releasePointerCapture(gesture.pointerId)
    }
    onCancel?.(gesture.kind)
  }, [onCancel, selectionKey])

  useEffect(() => () => {
    const gesture = gestureRef.current
    if (!gesture) return
    if (typeof gesture.captureTarget.releasePointerCapture === 'function' &&
      gesture.captureTarget.hasPointerCapture?.(gesture.pointerId)) {
      gesture.captureTarget.releasePointerCapture(gesture.pointerId)
    }
  }, [])

  const renderedItems = previewItems ?? selectedItems
  const bounds = courseSelectionBounds(renderedItems)

  const buildPointerChange = (
    gesture: PointerGesture,
    event: ReactPointerEvent<HTMLDivElement>,
  ): CourseTransformChange => {
    const clientDelta = {
      x: event.clientX - gesture.startClient.x,
      y: event.clientY - gesture.startClient.y,
    }
    const delta = clientDeltaToLogicalDelta(clientDelta, {
      kind: gesture.kind,
      pointerId: gesture.pointerId,
      startClient: gesture.startClient,
      currentClient: { x: event.clientX, y: event.clientY },
      resizeHandle: gesture.resizeHandle,
    })
    let rotationDelta: number | undefined
    if (gesture.kind === 'rotate') {
      const current = {
        x: gesture.rotationStart.x + delta.x,
        y: gesture.rotationStart.y + delta.y,
      }
      rotationDelta = rotationDeltaBetween(
        gesture.initialBounds.center,
        gesture.rotationStart,
        current,
      )
      if (event.shiftKey && rotationSnapDegrees > 0) {
        rotationDelta = Math.round(rotationDelta / rotationSnapDegrees) * rotationSnapDegrees
      }
    }
    const request: CourseTransformRequest = {
      kind: gesture.kind,
      items: gesture.initialItems,
      delta,
      rotationDelta,
      resizeHandle: gesture.resizeHandle,
      minimumSize,
      disableSnapping: event.altKey,
    }
    return {
      kind: gesture.kind,
      selectedLayerItemIds: gesture.initialItems.map((item) => item.layerItemId),
      initialItems: gesture.initialItems,
      items: cloneTransformItems(applyTransform(request)),
      delta,
      rotationDelta,
      resizeHandle: gesture.resizeHandle,
      snappingDisabled: event.altKey,
    }
  }

  const updatePointerGesture = (event: ReactPointerEvent<HTMLDivElement>): CourseTransformChange | null => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return null
    const change = buildPointerChange(gesture, event)
    if (!meaningfulChange(change)) return null
    if (gesture.lastChange && sameGesturePosition(gesture.lastChange, change)) {
      return gesture.lastChange
    }
    gesture.lastChange = change
    setPreviewItems(cloneTransformItems(change.items))
    onPreview?.(change)
    return change
  }

  const finishPointerGesture = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    let change = gesture.lastChange
    if (!cancelled) change = updatePointerGesture(event) ?? change
    gestureRef.current = null
    setPreviewItems(null)
    if (typeof gesture.captureTarget.releasePointerCapture === 'function' &&
      gesture.captureTarget.hasPointerCapture?.(event.pointerId)) {
      gesture.captureTarget.releasePointerCapture(event.pointerId)
    }
    if (cancelled) onCancel?.(gesture.kind)
    else if (change) onCommit(change)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !canTransform || !bounds) return
    const action = actionFromTarget(event.target)
    lastPointerActionRef.current = action
    if (!action) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.focus({ preventScroll: true })
    if (typeof action.captureTarget.setPointerCapture === 'function') {
      action.captureTarget.setPointerCapture(event.pointerId)
    }
    const initialItems = cloneTransformItems(selectedItems)
    const initialBounds = courseSelectionBounds(initialItems)
    if (!initialBounds) return
    gestureRef.current = {
      kind: action.kind,
      pointerId: event.pointerId,
      startClient: { x: event.clientX, y: event.clientY },
      initialItems,
      initialBounds,
      resizeHandle: action.resizeHandle,
      rotationStart: selectionRotationHandlePoint(initialBounds, rotationHandleOffset),
      captureTarget: action.captureTarget as HTMLDivElement,
      lastChange: null,
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && gestureRef.current) {
      event.preventDefault()
      const gesture = gestureRef.current
      gestureRef.current = null
      setPreviewItems(null)
      if (typeof gesture.captureTarget.releasePointerCapture === 'function' &&
        gesture.captureTarget.hasPointerCapture?.(gesture.pointerId)) {
        gesture.captureTarget.releasePointerCapture(gesture.pointerId)
      }
      onCancel?.(gesture.kind)
      return
    }
    if (!canTransform || isEditableKeyboardTarget(event.target)) return
    const step = event.shiftKey ? keyboardLargeStep : keyboardStep
    const delta = event.key === 'ArrowLeft'
      ? { x: -step, y: 0 }
      : event.key === 'ArrowRight'
        ? { x: step, y: 0 }
        : event.key === 'ArrowUp'
          ? { x: 0, y: -step }
          : event.key === 'ArrowDown'
            ? { x: 0, y: step }
            : null
    if (!delta) return
    event.preventDefault()
    event.stopPropagation()
    const initialItems = cloneTransformItems(selectedItems)
    const change: CourseTransformChange = {
      kind: 'nudge',
      selectedLayerItemIds: initialItems.map((item) => item.layerItemId),
      initialItems,
      items: cloneTransformItems(applyTransform({
        kind: 'nudge',
        items: initialItems,
        delta,
        minimumSize,
        disableSnapping: event.altKey,
      })),
      delta,
      snappingDisabled: event.altKey,
    }
    onPreview?.(change)
    onCommit(change)
  }

  const outlineColor = selectionLocked ? '#f59e0b' : '#3b82f6'
  return (
    <div
      className={className}
      role="group"
      aria-label={ariaLabel}
      aria-disabled={!canTransform}
      tabIndex={canTransform ? 0 : -1}
      data-testid="course-transform-overlay"
      data-selection-count={selectedItems.length}
      data-selection-locked={selectionLocked || undefined}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        outline: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        zIndex: 2_147_483_000,
        ...style,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        if (!gestureRef.current) return
        event.preventDefault()
        event.stopPropagation()
        updatePointerGesture(event)
      }}
      onPointerUp={(event) => finishPointerGesture(event, false)}
      onPointerCancel={(event) => finishPointerGesture(event, true)}
      onKeyDown={onKeyDown}
      onDoubleClick={(event) => {
        const action = actionFromTarget(event.target) ?? lastPointerActionRef.current
        lastPointerActionRef.current = null
        if (!onDoubleClickSelection || action?.kind !== 'move') return
        event.preventDefault()
        event.stopPropagation()
        onDoubleClickSelection(selectedItems.map((item) => item.layerItemId))
      }}
    >
      {renderedItems.length > 1 && renderedItems.map((item) => {
        const itemBounds = courseSelectionBounds([item])
        if (!itemBounds) return null
        return (
          <div
            key={item.layerItemId}
            data-course-transform-item-outline={item.layerItemId}
            style={{
              ...selectionStyle(itemBounds),
              border: `1px dashed ${item.locked ? '#f59e0b' : '#60a5fa'}`,
              pointerEvents: 'none',
            }}
          />
        )
      })}
      {bounds && (
        <div
          data-course-transform-selection
          data-course-transform-action={canTransform && captureInterior ? 'move' : undefined}
          aria-label={selectionLocked ? '已锁定选择' : '拖动选择'}
          style={{
            ...selectionStyle(bounds),
            border: `2px solid ${outlineColor}`,
            background: canTransform ? 'rgba(59, 130, 246, 0.015)' : 'transparent',
            cursor: canTransform ? 'move' : 'not-allowed',
            pointerEvents: canTransform && captureInterior ? 'auto' : 'none',
          }}
        >
          {canTransform && (
            <>
              {!captureInterior && (
                <>
                  {(['top', 'right', 'bottom', 'left'] as const).map((edge) => (
                    <div
                      key={edge}
                      role="button"
                      tabIndex={-1}
                      aria-label="拖动选择边框"
                      data-course-transform-action="move"
                      data-course-transform-move-edge={edge}
                      style={{
                        position: 'absolute',
                        ...(edge === 'top' || edge === 'bottom'
                          ? { left: 0, right: 0, height: Math.max(6, handleSize), [edge]: -handleSize / 2 }
                          : { top: 0, bottom: 0, width: Math.max(6, handleSize), [edge]: -handleSize / 2 }),
                        cursor: 'move',
                        pointerEvents: 'auto',
                      }}
                    />
                  ))}
                </>
              )}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -rotationHandleOffset,
                  width: 1,
                  height: rotationHandleOffset,
                  background: outlineColor,
                  pointerEvents: 'none',
                }}
              />
              <div
                role="button"
                tabIndex={-1}
                aria-label="旋转选择"
                data-course-transform-action="rotate"
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: -rotationHandleOffset,
                  width: handleSize + 2,
                  height: handleSize + 2,
                  border: `2px solid ${outlineColor}`,
                  borderRadius: '50%',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                  transform: 'translate(-50%, -50%)',
                  cursor: 'grab',
                  pointerEvents: 'auto',
                }}
              />
              {COURSE_RESIZE_HANDLES.map((handle) => (
                <div
                  key={handle}
                  role="button"
                  tabIndex={-1}
                  aria-label={HANDLE_LABELS[handle]}
                  data-course-transform-action={`resize:${handle}`}
                  data-course-resize-handle={handle}
                  style={{
                    position: 'absolute',
                    ...HANDLE_POSITIONS[handle],
                    width: handleSize,
                    height: handleSize,
                    border: `2px solid ${outlineColor}`,
                    background: '#ffffff',
                    boxSizing: 'border-box',
                    transform: 'translate(-50%, -50%)',
                    cursor: HANDLE_CURSORS[handle],
                    pointerEvents: 'auto',
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
