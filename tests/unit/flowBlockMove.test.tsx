import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlowCourseCanvas } from '@/renderer/course/CourseSurfaceCanvas'
import {
  addCourseSurface,
  createCourseProject,
  moveFlowBlock,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  createFlowBlockMoveRequest,
  flowBlockIdsInDocumentOrder,
  moveFlowBlockInPlace,
} from '@/renderer/course/flow/flowBlockMove'
import type {
  CourseLocation,
  CourseProjectDocument,
  FlowBlock,
  FlowSurfaceDocument,
} from '@/shared/courseProjectTypes'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

afterEach(cleanup)

const FLOW_SURFACE_ID = 'flow-drag-test'

function flowBlocks(): FlowBlock[] {
  return [
    { id: 'top-a', type: 'heading', level: 1, text: '顶层甲' },
    {
      id: 'section-a',
      type: 'section',
      title: '分节甲',
      collapsedByDefault: false,
      blocks: [
        { id: 'child-a', type: 'paragraph', text: '分节内容甲' },
        {
          id: 'section-b',
          type: 'section',
          title: '子分节乙',
          collapsedByDefault: false,
          blocks: [{ id: 'leaf-b', type: 'quote', text: '子分节内容', citation: '教师' }],
        },
      ],
    },
    { id: 'top-b', type: 'paragraph', text: '顶层乙' },
  ]
}

function projectWithFlowTree(): CourseProjectDocument {
  let project = addCourseSurface(
    createCourseProject({ id: 'flow-drag-project', now: '2026-08-14T00:00:00.000Z' }),
    'flow',
    { id: FLOW_SURFACE_ID, now: '2026-08-14T00:00:01.000Z' },
  )
  project = updateCourseProject(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === FLOW_SURFACE_ID)
    if (!surface || surface.type !== 'flow') throw new Error('Flow fixture missing')
    surface.blocks = flowBlocks()
    draft.locations = draft.locations.filter((location) => location.surfaceId !== FLOW_SURFACE_ID)
    draft.locations.push(...flowBlockIdsInDocumentOrder(surface.blocks).map((blockId) => ({
      id: `location-${blockId}`,
      label: blockId,
      kind: 'flow-block' as const,
      surfaceId: FLOW_SURFACE_ID,
      blockId,
    })))
  }, '2026-08-14T00:00:02.000Z')
  return project
}

function flowSurface(project: CourseProjectDocument): FlowSurfaceDocument {
  const surface = project.surfaces.find((candidate) => candidate.id === FLOW_SURFACE_ID)
  if (!surface || surface.type !== 'flow') throw new Error('Flow fixture missing')
  return surface
}

function dataTransfer(): DataTransfer {
  const data = new Map<string, string>()
  return {
    dropEffect: 'none',
    effectAllowed: 'uninitialized',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    clearData: (format?: string) => format ? data.delete(format) : data.clear(),
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => { data.set(format, value) },
    setDragImage: () => undefined,
  }
}

describe('Flow semantic block moves', () => {
  it('normalizes visual slots and supports reorder, enter and exit operations without changing ids', () => {
    const blocks = flowBlocks()
    expect(createFlowBlockMoveRequest(blocks, 'top-a', null, 1)).toBeNull()
    expect(createFlowBlockMoveRequest(blocks, 'top-a', null, 3)).toEqual({
      blockId: 'top-a', targetParentId: null, targetIndex: 2,
    })

    const enter = createFlowBlockMoveRequest(blocks, 'top-b', 'section-a', 1)
    expect(enter).toEqual({ blockId: 'top-b', targetParentId: 'section-a', targetIndex: 1 })
    moveFlowBlockInPlace(blocks, enter!)
    expect(flowBlockIdsInDocumentOrder(blocks)).toEqual([
      'top-a', 'section-a', 'child-a', 'top-b', 'section-b', 'leaf-b',
    ])

    const exit = createFlowBlockMoveRequest(blocks, 'child-a', null, 1)
    expect(exit).toEqual({ blockId: 'child-a', targetParentId: null, targetIndex: 1 })
    moveFlowBlockInPlace(blocks, exit!)
    expect(flowBlockIdsInDocumentOrder(blocks)).toEqual([
      'top-a', 'child-a', 'section-a', 'top-b', 'section-b', 'leaf-b',
    ])
  })

  it('rejects moving a section into itself or one of its descendants', () => {
    const blocks = flowBlocks()
    expect(() => createFlowBlockMoveRequest(blocks, 'section-a', 'section-a', 0))
      .toThrow('不能把分节移入自身')
    expect(() => createFlowBlockMoveRequest(blocks, 'section-a', 'section-b', 0))
      .toThrow('不能把分节移入自身')
    expect(flowBlockIdsInDocumentOrder(blocks)).toEqual([
      'top-a', 'section-a', 'child-a', 'section-b', 'leaf-b', 'top-b',
    ])
  })

  it('commits a cross-section move as one V9 revision and synchronizes location order', () => {
    const project = projectWithFlowTree()
    const beforeRevision = project.revision
    const next = moveFlowBlock(project, FLOW_SURFACE_ID, {
      blockId: 'top-b', targetParentId: 'section-a', targetIndex: 1,
    }, '2026-08-14T00:00:03.000Z')

    expect(next).not.toBe(project)
    expect(next.revision).toBe(beforeRevision + 1)
    expect(flowBlockIdsInDocumentOrder(flowSurface(project).blocks)).toEqual([
      'top-a', 'section-a', 'child-a', 'section-b', 'leaf-b', 'top-b',
    ])
    const orderedBlockIds = flowBlockIdsInDocumentOrder(flowSurface(next).blocks)
    expect(orderedBlockIds).toEqual([
      'top-a', 'section-a', 'child-a', 'top-b', 'section-b', 'leaf-b',
    ])
    expect(next.locations
      .filter((location): location is Extract<CourseLocation, { kind: 'flow-block' }> => (
        location.kind === 'flow-block' && location.surfaceId === FLOW_SURFACE_ID
      ))
      .map((location) => location.blockId))
      .toEqual(orderedBlockIds)
    expect(courseProjectDocumentSchema.parse(next)).toEqual(next)

    const noOp = moveFlowBlock(next, FLOW_SURFACE_ID, {
      blockId: 'top-b', targetParentId: 'section-a', targetIndex: 1,
    })
    expect(noOp).toBe(next)
  })
})

describe('Flow canvas drag affordance', () => {
  it('emits one stable move request from a Chinese drag handle and never exposes document JSON', () => {
    const project = projectWithFlowTree()
    const onBlockMove = vi.fn()
    const view = render(
      <FlowCourseCanvas
        surface={flowSurface(project)}
        mode="inspect"
        selectedBlockId={null}
        search=""
        resolveAsset={() => undefined}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onBlockMove={onBlockMove}
      />,
    )
    const transfer = dataTransfer()
    fireEvent.dragStart(view.getByRole('button', { name: '拖动正文“顶层乙”' }), { dataTransfer: transfer })
    const destination = view.container.querySelector<HTMLElement>(
      '[data-flow-drop-parent-id="section-a"][data-flow-drop-slot-index="1"]',
    )!
    fireEvent.dragOver(destination, { dataTransfer: transfer })
    expect(view.getByRole('status')).toHaveTextContent('放到分节“分节甲”的第 2 个位置')
    fireEvent.drop(destination, { dataTransfer: transfer })
    fireEvent.dragEnd(view.getByRole('button', { name: '拖动正文“顶层乙”' }), { dataTransfer: transfer })

    expect(onBlockMove).toHaveBeenCalledTimes(1)
    expect(onBlockMove).toHaveBeenCalledWith({
      blockId: 'top-b', targetParentId: 'section-a', targetIndex: 1,
    })
    expect(Object.keys(onBlockMove.mock.calls[0]![0])).toEqual([
      'blockId', 'targetParentId', 'targetIndex',
    ])
  })

  it('commits the last accepted drop request on native dragend when Chromium omits drop', () => {
    const project = projectWithFlowTree()
    const onBlockMove = vi.fn()
    const view = render(
      <FlowCourseCanvas
        surface={flowSurface(project)}
        mode="inspect"
        selectedBlockId={null}
        search=""
        resolveAsset={() => undefined}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onBlockMove={onBlockMove}
      />,
    )
    const handle = view.getByRole('button', { name: '拖动正文“顶层乙”' })
    const transfer = dataTransfer()
    fireEvent.dragStart(handle, { dataTransfer: transfer })
    const destination = view.container.querySelector<HTMLElement>(
      '[data-flow-drop-parent-id="section-a"][data-flow-drop-slot-index="1"]',
    )!
    fireEvent.dragOver(destination, { dataTransfer: transfer })
    expect(destination).toHaveAttribute('data-flow-drop-active', 'true')
    fireEvent.dragEnd(handle, { dataTransfer: transfer })

    expect(onBlockMove).toHaveBeenCalledTimes(1)
    expect(onBlockMove).toHaveBeenCalledWith({
      blockId: 'top-b', targetParentId: 'section-a', targetIndex: 1,
    })
  })

  it('commits through the primary pointer gesture without depending on native HTML drop', () => {
    const project = projectWithFlowTree()
    const onBlockMove = vi.fn()
    const view = render(
      <FlowCourseCanvas
        surface={flowSurface(project)}
        mode="inspect"
        selectedBlockId={null}
        search=""
        resolveAsset={() => undefined}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onBlockMove={onBlockMove}
      />,
    )
    const handle = view.getByRole('button', { name: '拖动正文“顶层乙”' })
    const destination = view.container.querySelector<HTMLElement>(
      '[data-flow-drop-parent-id="section-a"][data-flow-drop-slot-index="1"]',
    )!
    const previousElementFromPoint = document.elementFromPoint
    const elementFromPoint = vi.fn(() => destination)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    })
    fireEvent.pointerDown(handle, { pointerId: 7, button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(handle, { pointerId: 7, clientX: 80, clientY: 80 })
    expect(destination).toHaveAttribute('data-flow-drop-active', 'true')
    fireEvent.pointerUp(handle, { pointerId: 7, clientX: 80, clientY: 80 })

    expect(onBlockMove).toHaveBeenCalledTimes(1)
    expect(onBlockMove).toHaveBeenCalledWith({
      blockId: 'top-b', targetParentId: 'section-a', targetIndex: 1,
    })
    if (previousElementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: previousElementFromPoint,
      })
    } else {
      Reflect.deleteProperty(document, 'elementFromPoint')
    }
  })

  it('keeps a real mouse drag alive when pointer capture is cancelled during re-render', () => {
    const project = projectWithFlowTree()
    const onBlockMove = vi.fn()
    const view = render(
      <FlowCourseCanvas
        surface={flowSurface(project)}
        mode="inspect"
        selectedBlockId={null}
        search=""
        resolveAsset={() => undefined}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onBlockMove={onBlockMove}
      />,
    )
    const handle = view.getByRole('button', { name: '拖动正文“顶层乙”' })
    const destination = view.container.querySelector<HTMLElement>(
      '[data-flow-drop-parent-id="section-a"][data-flow-drop-slot-index="1"]',
    )!
    const previousElementFromPoint = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => destination),
    })
    fireEvent.pointerDown(handle, {
      pointerId: 11, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10,
    })
    // Focusing the drag handle naturally blurs the previously edited field;
    // only a real BrowserWindow blur may cancel the gesture.
    fireEvent.blur(handle)
    fireEvent.pointerCancel(handle, { pointerId: 11, pointerType: 'mouse' })
    fireEvent.mouseMove(window, { buttons: 1, clientX: 80, clientY: 80 })
    expect(view.container.querySelector(
      '[data-flow-drop-parent-id="section-a"][data-flow-drop-slot-index="1"]',
    )).toHaveAttribute('data-flow-drop-active', 'true')
    fireEvent.mouseUp(window, { button: 0, clientX: 80, clientY: 80 })
    expect(onBlockMove).toHaveBeenCalledTimes(1)
    expect(onBlockMove).toHaveBeenCalledWith({
      blockId: 'top-b', targetParentId: 'section-a', targetIndex: 1,
    })
    if (previousElementFromPoint) {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: previousElementFromPoint,
      })
    } else {
      Reflect.deleteProperty(document, 'elementFromPoint')
    }
  })

  it('disables semantic dragging in playback and never creates handles for floating layers', () => {
    const surface = flowSurface(projectWithFlowTree())
    surface.surfaceLayerItems.push({
      item: {
        layerItemId: 'floating-text',
        label: '自由图层',
        kind: 'native',
        frame: { mode: 'absolute', x: 0, y: 0, width: 100, height: 40 },
        order: 10,
        visible: true,
        locked: false,
        rotation: 0,
        opacity: 1,
        hitPolicy: 'auto',
        playbackInitialVisibility: 'inherit',
        content: {
          nativeType: 'text',
          data: {
            text: '自由图层',
            runs: [],
            style: {
              fontFamily: 'sans-serif',
              fontSize: 24,
              color: '#000000',
              bold: false,
              italic: false,
              underline: false,
              strike: false,
              emphasis: false,
              highlightColor: null,
              align: 'left',
              verticalAlign: 'top',
              writingMode: 'horizontal',
              lineSpacing: 4,
              letterSpacing: 0,
              padding: 0,
              overflow: 'fixed',
              backgroundColor: '#ffffff',
              backgroundOpacity: 0,
              cornerRadius: 0,
            },
          },
        },
      },
      visibility: { mode: 'all', locationIds: [] },
    })
    const view = render(
      <FlowCourseCanvas
        surface={surface}
        mode="playback"
        selectedBlockId={null}
        search=""
        resolveAsset={() => undefined}
        onSelect={() => undefined}
        onEdit={() => undefined}
        onBlockMove={vi.fn()}
      />,
    )
    expect(view.queryByRole('button', { name: /^拖动/ })).not.toBeInTheDocument()
    expect(view.container.querySelector('[data-flow-drag-handle="floating-text"]')).toBeNull()
  })
})
