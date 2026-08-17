// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ScenePanel,
  type ScenePanelCourseLocation,
  type ScenePanelDocumentControl,
  type ScenePanelFlowDocumentControl,
  type ScenePanelSpatialDocumentControl,
} from '@/renderer/ui/ScenePanel'
import type { FlowEditorView } from '@/renderer/course/flowEditorView'
import type { CourseEditorShellPolicy } from '@/renderer/course/courseEditorLayout'
import {
  ScenePickerOverlay,
  type ScenePickerLocation,
} from '@/player/ScenePickerOverlay'

const SLIDE_POLICY: CourseEditorShellPolicy = {
  layout: 'slide',
  primaryNavigation: 'slide-thumbnails',
  leftPanelLabel: '幻灯片',
  showCourseLocationNav: false,
  simpleSidebarTabs: ['elements', 'layers', 'properties'],
}

const FLOW_POLICY: CourseEditorShellPolicy = {
  layout: 'flow',
  primaryNavigation: 'flow-outline',
  leftPanelLabel: '讲义大纲',
  showCourseLocationNav: false,
  simpleSidebarTabs: ['elements', 'layers', 'properties'],
}

const SPATIAL_POLICY: CourseEditorShellPolicy = {
  layout: 'spatial',
  primaryNavigation: 'spatial-camera-list',
  leftPanelLabel: '镜头列表',
  showCourseLocationNav: false,
  simpleSidebarTabs: ['elements', 'layers', 'properties'],
}

const MIXED_POLICY: CourseEditorShellPolicy = {
  layout: 'mixed',
  primaryNavigation: 'course-locations',
  leftPanelLabel: '课程流程',
  showCourseLocationNav: true,
  simpleSidebarTabs: ['elements', 'layers', 'properties'],
}

const flowView: FlowEditorView = {
  projectId: 'project-flow',
  revision: 1,
  locationId: 'loc-flow-1',
  surfaceId: 'surface-flow',
  surfaceTitle: '第一讲 数轴',
  activeBlockId: 'block-1',
  layout: { readingWidth: 720, wideContentWidth: 960 },
  blocks: [{
    blockId: 'block-1',
    parentId: null,
    depth: 0,
    index: 0,
    stableAddress: 'surface:surface-flow/block:block-1',
    label: '学习目标',
    block: { id: 'block-1', type: 'heading', level: 1, text: '学习目标' },
  }],
  outline: [{
    blockId: 'block-1',
    title: '学习目标',
    level: 1,
    depth: 0,
    kind: 'heading',
    path: ['surfaces', 0, 'blocks', 0],
  }],
  globalLayerItems: [],
  surfaceLayerItems: [],
}

function flowDocumentControl(): ScenePanelFlowDocumentControl {
  return {
    surfaceTitle: flowView.surfaceTitle,
    flowView,
    selectedBlockId: flowView.activeBlockId,
    onSelectBlock: () => undefined,
  }
}

function spatialDocumentControl(): ScenePanelSpatialDocumentControl {
  return {
    surfaceTitle: '空间探索',
    frames: [{ id: 'frame-1', name: '全景', x: 0, y: 0, zoom: 1 }],
    home: { x: 0, y: 0, zoom: 1 },
    sessionCamera: { x: 0, y: 0, zoom: 1 },
    activeCameraFrameId: 'frame-1',
    worldLayerItems: [],
    semanticZoomRules: [],
    onAddFrame: () => undefined,
    onRenameFrame: () => undefined,
    onReorderFrame: () => undefined,
    onDeleteFrame: () => undefined,
    onSetHome: () => undefined,
    onActivateFrame: () => undefined,
    onAddSemanticZoomRule: () => undefined,
    onUpdateSemanticZoomRule: () => undefined,
    onDeleteSemanticZoomRule: () => undefined,
  }
}

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

describe('ScenePanel shell-policy primary navigation', () => {
  it('pure slide policy keeps the scene list as the primary navigation and hides the course-content list', () => {
    render(
      <ScenePanel
        shellPolicy={SLIDE_POLICY}
        documentControl={slideDocumentControl()}
        courseLocations={slideLocations}
        onActivateLocation={vi.fn()}
        onAddFlowSurface={vi.fn()}
        onAddSpatialSurface={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('course-location-nav')).not.toBeInTheDocument()
    expect(screen.getByTestId('add-scene')).toBeInTheDocument()
    expect(screen.getByTestId('scene-item-v9-scene-one')).toBeInTheDocument()
    // Cross-type add commands must not leak into a pure slide course.
    expect(screen.queryByTestId('add-flow-surface')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-spatial-surface')).not.toBeInTheDocument()
  })

  it('pure flow policy renders the outline navigation without the course-content list', () => {
    render(
      <ScenePanel
        shellPolicy={FLOW_POLICY}
        flowDocumentControl={flowDocumentControl()}
        courseLocations={slideLocations}
        onActivateLocation={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('course-location-nav')).not.toBeInTheDocument()
    expect(screen.getByTestId('scene-panel-flow-outline')).toBeInTheDocument()
    expect(screen.getByTestId('scene-panel-surface-title')).toHaveTextContent('第一讲 数轴')
  })

  it('pure spatial policy renders the camera list without the course-content list', () => {
    render(
      <ScenePanel
        shellPolicy={SPATIAL_POLICY}
        spatialDocumentControl={spatialDocumentControl()}
        courseLocations={slideLocations}
        onActivateLocation={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('course-location-nav')).not.toBeInTheDocument()
    expect(screen.getByTestId('scene-panel-spatial-frames')).toBeInTheDocument()
    expect(screen.getByTestId('scene-panel-surface-title')).toHaveTextContent('空间探索')
  })

  it('mixed policy renders the 课程流程 list with every location and dispatches stable locationIds', () => {
    const onActivateLocation = vi.fn()
    const onAddFlowSurface = vi.fn()
    const onAddSpatialSurface = vi.fn()
    render(
      <ScenePanel
        shellPolicy={MIXED_POLICY}
        documentControl={slideDocumentControl()}
        courseLocations={slideLocations}
        onActivateLocation={onActivateLocation}
        onAddFlowSurface={onAddFlowSurface}
        onAddSpatialSurface={onAddSpatialSurface}
      />,
    )

    const nav = screen.getByTestId('course-location-nav')
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '课程流程' })).toBeInTheDocument()

    for (const location of slideLocations) {
      expect(screen.getByTestId(`course-location-${location.locationId}`)).toBeInTheDocument()
    }
    expect(screen.getByText('讲义')).toBeInTheDocument()
    expect(screen.getByText('空间')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('course-location-loc-flow-1'))
    expect(onActivateLocation).toHaveBeenCalledWith('loc-flow-1')
    fireEvent.click(screen.getByTestId('course-location-loc-spatial-1'))
    expect(onActivateLocation).toHaveBeenCalledWith('loc-spatial-1')
    fireEvent.click(screen.getByTestId('add-flow-surface'))
    expect(onAddFlowSurface).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByTestId('add-spatial-surface'))
    expect(onAddSpatialSurface).toHaveBeenCalledOnce()
  })

  it('keeps the course-location-nav DOM identity while switching locations across surface kinds', () => {
    const onActivateLocation = vi.fn()
    const { rerender } = render(
      <ScenePanel
        shellPolicy={MIXED_POLICY}
        documentControl={slideDocumentControl()}
        courseLocations={slideLocations}
        onActivateLocation={onActivateLocation}
      />,
    )
    const nav = screen.getByTestId('course-location-nav')

    const flowActiveLocations = slideLocations.map((location) => ({
      ...location,
      active: location.locationId === 'loc-flow-1',
    }))
    rerender(
      <ScenePanel
        shellPolicy={MIXED_POLICY}
        flowDocumentControl={flowDocumentControl()}
        courseLocations={flowActiveLocations}
        onActivateLocation={onActivateLocation}
      />,
    )

    expect(screen.getByTestId('course-location-nav')).toBe(nav)
    expect(screen.getByTestId('course-location-loc-flow-1')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByTestId('course-location-loc-slide-1')).not.toHaveAttribute(
      'aria-current',
    )

    const spatialActiveLocations = slideLocations.map((location) => ({
      ...location,
      active: location.locationId === 'loc-spatial-1',
    }))
    rerender(
      <ScenePanel
        shellPolicy={MIXED_POLICY}
        spatialDocumentControl={spatialDocumentControl()}
        courseLocations={spatialActiveLocations}
        onActivateLocation={onActivateLocation}
      />,
    )

    expect(screen.getByTestId('course-location-nav')).toBe(nav)
    expect(screen.getByTestId('course-location-loc-spatial-1')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('flattens every same-type location into the primary navigation for multi-surface pure courses', () => {
    const onActivateLocation = vi.fn()
    const twoSlideLocations: readonly ScenePanelCourseLocation[] = [
      { locationId: 'loc-slide-1', label: '第一页 导入', kind: 'slide-scene', surfaceId: 'surface-slide', active: true },
      { locationId: 'loc-slide-2', label: '第二页 练习', kind: 'slide-scene', surfaceId: 'surface-slide-b', active: false },
    ]
    render(
      <ScenePanel
        shellPolicy={SLIDE_POLICY}
        documentControl={slideDocumentControl()}
        courseLocations={twoSlideLocations}
        onActivateLocation={onActivateLocation}
      />,
    )

    expect(screen.getByRole('heading', { name: '幻灯片' })).toBeInTheDocument()
    expect(screen.getByTestId('course-location-loc-slide-1')).toBeInTheDocument()
    expect(screen.getByTestId('course-location-loc-slide-2')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('course-location-loc-slide-2'))
    expect(onActivateLocation).toHaveBeenCalledWith('loc-slide-2')
    // Same-type course keeps the scene list as the slide navigation.
    expect(screen.getByTestId('add-scene')).toBeInTheDocument()
  })

  it('keeps the V8 LegacyScenePanelAdapter path when no policy or locations are supplied', () => {
    render(<ScenePanel />)

    expect(screen.queryByTestId('course-location-nav')).not.toBeInTheDocument()
    expect(screen.getAllByTestId(/^scene-item-/).length).toBeGreaterThan(0)
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
