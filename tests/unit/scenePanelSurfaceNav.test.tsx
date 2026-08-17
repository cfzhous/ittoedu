// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCourseStructureViewModel } from '@/renderer/course/courseEditorLayout'
import { createBlankSlideCourse } from '@/renderer/course/courseLocationCommands'
import {
  ScenePanel,
  type ScenePanelCourseLocation,
  type ScenePanelDocumentControl,
} from '@/renderer/ui/ScenePanel'
import {
  ScenePickerOverlay,
  type ScenePickerLocation,
} from '@/player/ScenePickerOverlay'

const slideLocations: readonly ScenePanelCourseLocation[] = [
  { locationId: 'loc-slide-1', label: '第一页 导入', kind: 'slide-scene', surfaceId: 'surface-slide', active: true },
  { locationId: 'loc-flow-1', label: '第一讲 数轴', kind: 'flow-block', surfaceId: 'surface-flow', active: false },
  { locationId: 'loc-spatial-1', label: '空间探索', kind: 'spatial-camera', surfaceId: 'surface-spatial', active: false },
]

function slideDocumentControl(): ScenePanelDocumentControl {
  return {
    editingScope: 'scene',
    globalElementCount: 1,
    globalHasRuntime: false,
    scenes: [{
      id: 'v9-scene-one',
      name: '第一页 导入',
      active: true,
      showRuntimeBadge: false,
      thumbnailStateName: '基础',
      thumbnail: { backgroundColor: '#ffffff', entries: [], assets: {}, assetFiles: {}, components: {} },
    }],
    onAddScene: () => undefined,
    onActivateScene: () => undefined,
    onActivateGlobal: () => undefined,
    onRenameScene: () => undefined,
    onDeleteScene: () => undefined,
    onDuplicateScene: () => undefined,
    onReorderScenes: () => undefined,
  }
}

const pickerLocations: readonly ScenePickerLocation[] = [
  { id: 'entry-slide-1', locationId: 'loc-slide-1', name: '第一页 导入', kind: 'slide-scene' },
  { id: 'entry-flow-1', locationId: 'loc-flow-1', name: '第一讲 数轴', kind: 'flow-block' },
  { id: 'entry-spatial-1', locationId: 'loc-spatial-1', name: '空间探索', kind: 'spatial-camera' },
]

function createPickerStage(): HTMLElement {
  const stage = document.createElement('section')
  stage.style.position = 'relative'
  document.body.append(stage)
  return stage
}

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.clearAllMocks()
})

describe('ScenePanel course location navigation', () => {
  it('renders 课程内容 above the slide scene list and dispatches activation', () => {
    const onActivateLocation = vi.fn()
    render(
      <ScenePanel
        documentControl={slideDocumentControl()}
        courseLocations={slideLocations}
        onActivateLocation={onActivateLocation}
      />,
    )

    const nav = screen.getByTestId('course-location-nav')
    expect(nav).toBeInTheDocument()
    expect(screen.getByText('课程内容')).toBeInTheDocument()

    // Teacher-facing Chinese kind labels.
    expect(screen.getByText('幻灯片')).toBeInTheDocument()
    expect(screen.getByText('讲义')).toBeInTheDocument()
    expect(screen.getByText('空间')).toBeInTheDocument()

    const slideRow = screen.getByTestId('course-location-loc-slide-1')
    const flowRow = screen.getByTestId('course-location-loc-flow-1')
    const spatialRow = screen.getByTestId('course-location-loc-spatial-1')

    // The course list is visually above the scene list.
    const panel = slideRow.closest('aside')
    expect(panel).not.toBeNull()
    expect(panel!.querySelector('[data-testid="course-location-nav"]')).toBe(nav)
    expect(
      nav.compareDocumentPosition(panel!.querySelector('.scene-list') as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    expect(slideRow).toHaveAttribute('aria-current', 'page')
    expect(flowRow).not.toHaveAttribute('aria-current')
    expect(slideRow).toHaveTextContent('第一页 导入')

    fireEvent.click(flowRow)
    expect(onActivateLocation).toHaveBeenCalledWith('loc-flow-1')
    fireEvent.click(spatialRow)
    expect(onActivateLocation).toHaveBeenCalledWith('loc-spatial-1')
  })

  it('shows 添加讲义/添加空间 only when callbacks exist and dispatches them', () => {
    const onAddFlowSurface = vi.fn()
    const onAddSpatialSurface = vi.fn()
    render(
      <ScenePanel
        documentControl={slideDocumentControl()}
        courseLocations={slideLocations}
        onAddFlowSurface={onAddFlowSurface}
        onAddSpatialSurface={onAddSpatialSurface}
      />,
    )

    const addFlow = screen.getByTestId('add-flow-surface')
    const addSpatial = screen.getByTestId('add-spatial-surface')
    expect(addFlow).toHaveTextContent('添加讲义')
    expect(addSpatial).toHaveTextContent('添加空间')

    fireEvent.click(addFlow)
    fireEvent.click(addSpatial)
    expect(onAddFlowSurface).toHaveBeenCalledOnce()
    expect(onAddSpatialSurface).toHaveBeenCalledOnce()
  })

  it('keeps the existing slide path unchanged when courseLocations is absent', () => {
    render(<ScenePanel documentControl={slideDocumentControl()} />)

    expect(screen.queryByTestId('course-location-nav')).not.toBeInTheDocument()
    expect(screen.getByTestId('add-scene')).toBeInTheDocument()
    expect(screen.getByTestId('scene-item-v9-scene-one')).toBeInTheDocument()
    expect(screen.queryByTestId('add-flow-surface')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-spatial-surface')).not.toBeInTheDocument()
  })
})

describe('ScenePickerOverlay location entries', () => {
  it('lists course locations, highlights the current one and emits locationId', async () => {
    const stage = createPickerStage()
    const onSelect = vi.fn()
    const picker = new ScenePickerOverlay({
      stage,
      scenes: [],
      locations: pickerLocations,
      onSelect,
    })

    picker.open('loc-flow-1')
    await Promise.resolve()

    const dialog = stage.querySelector('[role="dialog"][data-scene-picker]')
    expect(dialog).toHaveAccessibleName('课程内容')
    expect(stage.querySelector('[aria-label="全部课程内容"]')).not.toBeNull()

    const buttons = [...stage.querySelectorAll<HTMLButtonElement>(
      '.lesson-scene-picker__item',
    )]
    expect(buttons.map((button) => button.dataset.locationId)).toEqual([
      'loc-slide-1',
      'loc-flow-1',
      'loc-spatial-1',
    ])
    expect(buttons[1]).toHaveAttribute('aria-current', 'page')
    expect(buttons[0]).toHaveTextContent('幻灯片')
    expect(buttons[1]).toHaveTextContent('讲义')
    expect(buttons[2]).toHaveTextContent('空间')
    expect(document.activeElement).toBe(buttons[1])

    fireEvent.click(buttons[2]!)
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith('loc-spatial-1', false)
    expect(picker.isOpen).toBe(false)

    picker.destroy()
  })

  it('keeps scenes as a fallback when locations is not provided', async () => {
    const stage = createPickerStage()
    const onSelect = vi.fn()
    const picker = new ScenePickerOverlay({
      stage,
      scenes: [{ id: 'scene_intro', name: '课程导入' }],
      onSelect,
    })

    picker.open('scene_intro')
    await Promise.resolve()

    const button = stage.querySelector<HTMLButtonElement>(
      '.lesson-scene-picker__item',
    )
    expect(button?.dataset.sceneId).toBe('scene_intro')
    expect(button?.dataset.locationId).toBeUndefined()
    expect(stage.querySelector('[role="dialog"][data-scene-picker]'))
      .toHaveAccessibleName('场景目录')

    fireEvent.click(button!)
    expect(onSelect).toHaveBeenCalledWith('scene_intro', false)

    picker.destroy()
  })
})

describe('ScenePanel course structure wiring', () => {
  it('keeps 共享内容 and three add-page entries when courseStructure is provided', () => {
    const onSelectGlobalLayer = vi.fn()
    const onAddSlidePage = vi.fn()
    const onAddFlowPage = vi.fn()
    const onAddSpatialPage = vi.fn()
    const courseStructure = buildCourseStructureViewModel(createBlankSlideCourse({ title: '未命名课件' }).project)

    render(
      <ScenePanel
        courseStructure={courseStructure}
        authoringScope="location"
        activeLocationId={courseStructure.pageTree.nodes[0]?.locationId}
        onSelectGlobalLayer={onSelectGlobalLayer}
        onAddSlidePage={onAddSlidePage}
        onAddFlowPage={onAddFlowPage}
        onAddSpatialPage={onAddSpatialPage}
      />,
    )

    expect(screen.getByTestId('shared-content-section')).toHaveTextContent('共享内容')
    expect(screen.getByTestId('global-layer-entry')).toHaveTextContent('全局层')
    expect(screen.getByTestId('global-layer-entry')).toHaveTextContent('全课')
    fireEvent.click(screen.getByTestId('global-layer-entry'))
    expect(onSelectGlobalLayer).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByTestId('add-slide-page'))
    fireEvent.click(screen.getByTestId('add-flow-page'))
    fireEvent.click(screen.getByTestId('add-spatial-page'))
    expect(onAddSlidePage).toHaveBeenCalledOnce()
    expect(onAddFlowPage).toHaveBeenCalledOnce()
    expect(onAddSpatialPage).toHaveBeenCalledOnce()
  })
})
