import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseTransformOverlay } from '@/renderer/course/CourseTransformOverlay'
import {
  COURSE_RESIZE_HANDLES,
  applyCourseTransformRequest,
  courseItemIntersectsLogicalRect,
  courseItemContainsLogicalPoint,
  courseLogicalRectFromPoints,
  courseSelectionBounds,
  layerFrameCorners,
  resizeCourseTransformItems,
  rotateCourseTransformItems,
  rotationDeltaBetween,
  snapCourseTransformItems,
  type CourseTransformItem,
  type CourseTransformRequest,
} from '@/renderer/course/courseTransformGeometry'

function item(
  layerItemId: string,
  frame = { mode: 'absolute' as const, x: 10, y: 20, width: 100, height: 50 },
  rotation = 0,
  locked = false,
): CourseTransformItem {
  return { layerItemId, frame, rotation, locked }
}

afterEach(cleanup)

describe('course transform geometry', () => {
  it('keeps a single selection rotated and uses rotated AABB bounds for multiple items', () => {
    expect(courseSelectionBounds([item('one', undefined, 30)])).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 30,
      center: { x: 60, y: 45 },
    })

    const multi = courseSelectionBounds([
      item('a', { mode: 'absolute', x: 0, y: 0, width: 100, height: 50 }),
      item('b', { mode: 'absolute', x: 100, y: 0, width: 40, height: 20 }, 90),
    ])
    expect(multi?.rotation).toBe(0)
    expect(multi?.x).toBeCloseTo(0)
    expect(multi?.y).toBeCloseTo(-10)
    expect(multi?.width).toBeCloseTo(130)
    expect(multi?.height).toBeCloseTo(60)
  })

  it('resizes a rotated item in local axes while keeping the opposite edge fixed', () => {
    const source = item(
      'rotated',
      { mode: 'absolute', x: 0, y: 0, width: 100, height: 50 },
      90,
    )
    const resized = resizeCourseTransformItems([source], 'e', { x: 0, y: 20 }, 1)[0]
    expect(resized.frame).toMatchObject({ x: -10, y: 10, width: 120, height: 50 })
    const sourceLeftMid = {
      x: (layerFrameCorners(source)[0].x + layerFrameCorners(source)[3].x) / 2,
      y: (layerFrameCorners(source)[0].y + layerFrameCorners(source)[3].y) / 2,
    }
    const resizedLeftMid = {
      x: (layerFrameCorners(resized)[0].x + layerFrameCorners(resized)[3].x) / 2,
      y: (layerFrameCorners(resized)[0].y + layerFrameCorners(resized)[3].y) / 2,
    }
    expect(resizedLeftMid.x).toBeCloseTo(sourceLeftMid.x)
    expect(resizedLeftMid.y).toBeCloseTo(sourceLeftMid.y)
  })

  it('enforces the minimum size instead of flipping a resized frame', () => {
    const resized = resizeCourseTransformItems([item('one')], 'w', { x: 500, y: 0 }, 8)[0]
    expect(resized.frame.width).toBe(8)
    expect(resized.frame.x + resized.frame.width).toBe(110)
  })

  it('scales a multi-selection and rotates every center around the group center', () => {
    const source = [
      item('left', { mode: 'absolute', x: 0, y: 0, width: 20, height: 20 }),
      item('right', { mode: 'absolute', x: 80, y: 0, width: 20, height: 20 }),
    ]
    const resized = resizeCourseTransformItems(source, 'e', { x: 100, y: 0 }, 1)
    expect(resized[0].frame).toMatchObject({ x: 0, width: 40 })
    expect(resized[1].frame).toMatchObject({ x: 160, width: 40 })

    const rotated = rotateCourseTransformItems(source, 90)
    expect(rotated[0].frame.x).toBeCloseTo(40)
    expect(rotated[0].frame.y).toBeCloseTo(-40)
    expect(rotated[1].frame.x).toBeCloseTo(40)
    expect(rotated[1].frame.y).toBeCloseTo(40)
    expect(rotated.map((candidate) => candidate.rotation)).toEqual([90, 90])
  })

  it('normalizes pointer angle changes and routes transform requests', () => {
    expect(rotationDeltaBetween(
      { x: 0, y: 0 },
      { x: -1, y: -0.01 },
      { x: -1, y: 0.01 },
    )).toBeCloseTo(-1.145877, 5)
    const moved = applyCourseTransformRequest({
      kind: 'move',
      items: [item('one')],
      delta: { x: 5, y: -3 },
      minimumSize: 1,
    })
    expect(moved[0].frame).toMatchObject({ x: 15, y: 17 })
  })

  it('snaps moves and resizes to the logical grid and canvas guides', () => {
    const centered = snapCourseTransformItems(
      [item('centered', { mode: 'absolute', x: 587, y: 96, width: 100, height: 50 })],
      'move',
      undefined,
      { canvas: { width: 1280, height: 720 }, gridSize: 8, threshold: 6 },
    )
    expect(centered.items[0].frame).toMatchObject({ x: 590, y: 96 })
    expect(centered.guides).toContainEqual({ axis: 'x', value: 640, kind: 'canvas-center' })
    expect(centered.guides).toContainEqual({ axis: 'y', value: 96, kind: 'grid' })

    const gridded = snapCourseTransformItems(
      [item('gridded', { mode: 'absolute', x: 13, y: 19, width: 100, height: 50 })],
      'move',
      undefined,
      { canvas: { width: 1280, height: 720 }, gridSize: 8, threshold: 4 },
    )
    expect(gridded.items[0].frame).toMatchObject({ x: 16, y: 16 })
    expect(gridded.guides).toEqual([
      { axis: 'x', value: 16, kind: 'grid' },
      { axis: 'y', value: 16, kind: 'grid' },
    ])

    const resized = snapCourseTransformItems(
      [item('resized', { mode: 'absolute', x: 100, y: 96, width: 1176, height: 80 })],
      'resize',
      'e',
      { canvas: { width: 1280, height: 720 }, gridSize: 8, threshold: 6 },
    )
    expect(resized.items[0].frame).toMatchObject({ x: 100, width: 1180 })
    expect(resized.guides).toEqual([
      { axis: 'x', value: 1280, kind: 'canvas-edge' },
    ])
  })

  it('normalizes marquee rectangles and intersects rotated logical geometry', () => {
    expect(courseLogicalRectFromPoints({ x: 90, y: 70 }, { x: 10, y: 20 })).toEqual({
      x: 10,
      y: 20,
      width: 80,
      height: 50,
    })
    const rotated = item(
      'rotated-marquee',
      { mode: 'absolute', x: 0, y: 0, width: 100, height: 100 },
      45,
    )
    expect(courseItemIntersectsLogicalRect(rotated, {
      x: 112, y: 47, width: 10, height: 6,
    })).toBe(true)
    expect(courseItemIntersectsLogicalRect(rotated, {
      x: 123, y: 47, width: 10, height: 6,
    })).toBe(false)
    expect(courseItemContainsLogicalPoint(rotated, { x: 50, y: -15 })).toBe(true)
    expect(courseItemContainsLogicalPoint(rotated, { x: 50, y: -22 })).toBe(false)
  })
})

describe('CourseTransformOverlay', () => {
  it('renders a selection, rotation control, and all eight resize handles', () => {
    render(
      <CourseTransformOverlay
        items={[item('one')]}
        selectedLayerItemIds={['one']}
        onCommit={() => undefined}
      />,
    )
    expect(screen.getByLabelText('拖动选择')).toBeInTheDocument()
    expect(screen.getByLabelText('旋转选择')).toBeInTheDocument()
    COURSE_RESIZE_HANDLES.forEach((handle) => {
      expect(document.querySelector(`[data-course-resize-handle="${handle}"]`)).toBeInTheDocument()
    })
  })

  it('converts client deltas, previews a pointer drag, then commits once', () => {
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    render(
      <CourseTransformOverlay
        items={[item('one')]}
        selectedLayerItemIds={['one']}
        clientDeltaToLogicalDelta={(delta) => ({ x: delta.x / 2, y: delta.y / 2 })}
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    )
    const overlay = screen.getByTestId('course-transform-overlay')
    fireEvent.pointerDown(screen.getByLabelText('拖动选择'), {
      button: 0,
      pointerId: 7,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(overlay, { pointerId: 7, clientX: 140, clientY: 120 })
    fireEvent.pointerUp(overlay, { pointerId: 7, clientX: 140, clientY: 120 })

    expect(onPreview).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0]).toMatchObject({
      kind: 'move',
      delta: { x: 20, y: 10 },
      items: [{ layerItemId: 'one', frame: { x: 30, y: 30 } }],
    })
  })

  it('keeps a real pointer-captured double click routed to inline editing', () => {
    const onDoubleClickSelection = vi.fn()
    render(
      <CourseTransformOverlay
        items={[item('one')]}
        selectedLayerItemIds={['one']}
        onDoubleClickSelection={onDoubleClickSelection}
        onCommit={() => undefined}
      />,
    )
    const selection = screen.getByLabelText('拖动选择')
    const overlay = screen.getByTestId('course-transform-overlay')
    fireEvent.pointerDown(selection, { button: 0, pointerId: 31, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(overlay, { pointerId: 31, clientX: 20, clientY: 20 })
    fireEvent.pointerDown(selection, { button: 0, pointerId: 32, clientX: 20, clientY: 20 })
    fireEvent.pointerUp(overlay, { pointerId: 32, clientX: 20, clientY: 20 })
    // Chromium may retarget dblclick to the pointer-capture owner rather than
    // the inner move rectangle. The overlay must remember the visible action.
    fireEvent.doubleClick(overlay)
    expect(onDoubleClickSelection).toHaveBeenCalledWith(['one'])
  })

  it('uses the supplied transform policy and supports normal and large keyboard nudges', () => {
    const onPreview = vi.fn()
    const onCommit = vi.fn()
    const applyTransform = vi.fn((request: CourseTransformRequest) => request.items.map((source) => ({
      ...source,
      frame: { ...source.frame, x: source.frame.x + request.delta.x * 2 },
    })))
    render(
      <CourseTransformOverlay
        items={[item('one')]}
        selectedLayerItemIds={['one']}
        keyboardStep={2}
        keyboardLargeStep={12}
        applyTransform={applyTransform}
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    )
    const overlay = screen.getByTestId('course-transform-overlay')
    fireEvent.keyDown(overlay, { key: 'ArrowRight' })
    fireEvent.keyDown(overlay, { key: 'ArrowLeft', shiftKey: true })
    expect(applyTransform.mock.calls.map(([request]) => request.delta)).toEqual([
      { x: 2, y: 0 },
      { x: -12, y: 0 },
    ])
    expect(onPreview).toHaveBeenCalledTimes(2)
    expect(onCommit).toHaveBeenCalledTimes(2)
    expect(onCommit.mock.calls[0][0].items[0].frame.x).toBe(14)
  })

  it('shows locked selections but blocks handles, pointer transforms, and nudges', () => {
    const onCommit = vi.fn()
    render(
      <CourseTransformOverlay
        items={[item('locked', undefined, 0, true)]}
        selectedLayerItemIds={['locked']}
        onCommit={onCommit}
      />,
    )
    const overlay = screen.getByTestId('course-transform-overlay')
    expect(screen.getByLabelText('已锁定选择')).toBeInTheDocument()
    expect(screen.queryByLabelText('旋转选择')).not.toBeInTheDocument()
    fireEvent.pointerDown(screen.getByLabelText('已锁定选择'), {
      button: 0,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    })
    fireEvent.pointerMove(overlay, { pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.pointerUp(overlay, { pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.keyDown(overlay, { key: 'ArrowRight' })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('draws individual rotated outlines plus an axis-aligned group box', () => {
    render(
      <CourseTransformOverlay
        items={[
          item('one', undefined, 30),
          item('two', { mode: 'absolute', x: 200, y: 100, width: 80, height: 40 }, -15),
        ]}
        selectedLayerItemIds={['one', 'two']}
        onCommit={() => undefined}
      />,
    )
    expect(document.querySelectorAll('[data-course-transform-item-outline]')).toHaveLength(2)
    const group = document.querySelector<HTMLElement>('[data-course-transform-selection]')
    expect(group?.style.transform).toBe('rotate(0deg)')
    expect(screen.getByTestId('course-transform-overlay')).toHaveAttribute('data-selection-count', '2')
  })
})
