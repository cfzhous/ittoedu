// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlowEditorView } from '@/renderer/course/flowEditorView'
import type { SpatialSurfaceDocument } from '@/shared/courseProjectTypes'

const legacySentinels = vi.hoisted(() => ({
  createGame: vi.fn(() => {
    throw new Error('Flow/Spatial workspace mounted the legacy canvas')
  }),
  loadPlayerBundle: vi.fn(() => {
    throw new Error('Flow/Spatial workspace loaded the Player bundle')
  }),
  useStore: vi.fn(() => {
    throw new Error('Flow/Spatial workspace read the legacy Store')
  }),
}))

vi.mock('@/renderer/phaser/createEditorGame', () => ({
  createEditorGame: legacySentinels.createGame,
}))

vi.mock('@/renderer/export/loadPlayerBundle', () => ({
  loadPlayerBundle: legacySentinels.loadPlayerBundle,
}))

vi.mock('@/renderer/store/editorStore', () => ({
  selectActiveScene: vi.fn(),
  selectCourseRuntimeTextValue: vi.fn(),
  selectEditingNodes: vi.fn(),
  selectSelectedNode: vi.fn(),
  useEditorStore: legacySentinels.useStore,
}))

import { Workspace } from '@/renderer/ui/Workspace'

const flowView: FlowEditorView = {
  projectId: 'project-flow',
  revision: 1,
  locationId: 'location-flow-1',
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

const spatialSurface: SpatialSurfaceDocument = {
  id: 'surface-spatial',
  type: 'spatial-2d',
  title: '空间探索',
  surfaceLayerItems: [],
  world: {
    bounds: { mode: 'finite', x: 0, y: 0, width: 1280, height: 720 },
    layerItems: [],
  },
  camera: {
    home: { x: 0, y: 0, zoom: 1 },
    frames: [{ id: 'frame-1', name: '全景', x: 0, y: 0, zoom: 1 }],
  },
  semanticZoom: [],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Workspace Flow/Spatial current-location trial run', () => {
  it('renders a working trial-run button inside the Flow workspace branch', () => {
    const onTrialRun = vi.fn()
    render(
      <Workspace
        flowAuthoring={{
          view: flowView,
          selectedBlockId: flowView.activeBlockId,
          onSelectBlock: () => undefined,
        }}
        onTrialRun={onTrialRun}
        onAddImage={vi.fn()}
        onAddVideo={vi.fn()}
        onSelectImageAsset={vi.fn(async () => null)}
      />,
    )

    expect(screen.getByTestId('workspace-flow-authoring')).toBeInTheDocument()
    const button = screen.getByTestId('workspace-flow-trial-run')
    expect(button).toHaveTextContent('当前位置试运行')
    expect(button).not.toBeDisabled()
    expect(button.closest('main')).toHaveClass('workspace', 'workspace--edit')

    fireEvent.click(button)
    expect(onTrialRun).toHaveBeenCalledTimes(1)
  })

  it('renders a working trial-run button inside the Spatial workspace branch', () => {
    const onTrialRun = vi.fn()
    render(
      <Workspace
        spatialAuthoring={{
          spatial: spatialSurface,
          viewportSize: { width: 1280, height: 720 },
          selectedLayerItemIds: [],
          interactionDisabled: false,
          onSelect: () => undefined,
          onTransformEnd: () => undefined,
        }}
        onTrialRun={onTrialRun}
        onAddImage={vi.fn()}
        onAddVideo={vi.fn()}
        onSelectImageAsset={vi.fn(async () => null)}
      />,
    )

    expect(screen.getByTestId('workspace-spatial-authoring')).toBeInTheDocument()
    const button = screen.getByTestId('workspace-spatial-trial-run')
    expect(button).toHaveTextContent('当前位置试运行')
    expect(button).not.toBeDisabled()
    expect(button.closest('main')).toHaveClass('workspace', 'workspace--edit')

    fireEvent.click(button)
    expect(onTrialRun).toHaveBeenCalledTimes(1)
  })

  it('keeps the Flow/Spatial trial-run buttons disabled with a teacher-safe title when no callback is provided', () => {
    const flow = render(
      <Workspace
        flowAuthoring={{
          view: flowView,
          selectedBlockId: flowView.activeBlockId,
          onSelectBlock: () => undefined,
        }}
        onAddImage={vi.fn()}
        onAddVideo={vi.fn()}
        onSelectImageAsset={vi.fn(async () => null)}
      />,
    )

    const flowButton = flow.getByTestId('workspace-flow-trial-run')
    expect(flowButton).toBeDisabled()
    expect(flowButton).toHaveAttribute('title', '当前位置试运行暂不可用')

    flow.unmount()

    const spatial = render(
      <Workspace
        spatialAuthoring={{
          spatial: spatialSurface,
          viewportSize: { width: 1280, height: 720 },
          selectedLayerItemIds: [],
          interactionDisabled: false,
          onSelect: () => undefined,
          onTransformEnd: () => undefined,
        }}
        onAddImage={vi.fn()}
        onAddVideo={vi.fn()}
        onSelectImageAsset={vi.fn(async () => null)}
      />,
    )

    const spatialButton = spatial.getByTestId('workspace-spatial-trial-run')
    expect(spatialButton).toBeDisabled()
    expect(spatialButton).toHaveAttribute('title', '当前位置试运行暂不可用')
  })
})
