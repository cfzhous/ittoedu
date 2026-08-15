// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlowEditorView } from '@/renderer/course/flowEditorView'
import type { SpatialSurfaceDocument } from '@/shared/courseProjectTypes'
import { TopToolbar } from '@/renderer/ui/TopToolbar'
import { ScenePanel } from '@/renderer/ui/ScenePanel'
import { RightSidebar } from '@/renderer/ui/RightSidebar'

vi.mock('@/renderer/phaser/createEditorGame', () => ({
  createEditorGame: vi.fn(),
}))

vi.mock('@/renderer/export/loadPlayerBundle', () => ({
  loadPlayerBundle: () => '',
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

const baseToolbarProps = {
  busy: false,
  onNew: () => undefined,
  onOpen: () => undefined,
  onImportLegacy: () => undefined,
  recentProjects: [],
  onOpenRecent: () => undefined,
  onSave: () => undefined,
  healthSummary: { error: 0, warning: 0, info: 0, total: 0, canExport: true },
  onOpenHealth: () => undefined,
  onPreview: () => undefined,
  onExport: () => undefined,
}

function toolbarDocumentControl(unavailableExports?: Record<string, string>) {
  return {
    title: '未命名课件',
    dirty: false,
    canUndo: false,
    canRedo: false,
    locationLabel: 'Flow 讲义',
    editorMode: 'simple' as const,
    healthChecked: true,
    canInspectHealth: true,
    canPreview: true,
    canExport: true,
    unavailableExports,
    onRename: () => undefined,
    onUndo: () => undefined,
    onRedo: () => undefined,
    onSetEditorMode: () => undefined,
  }
}

afterEach(cleanup)

describe('editor shell multi-surface integration', () => {
  it('renders the DOCX export menu item and honors unavailableExports.docx', () => {
    const { rerender } = render(
      <TopToolbar
        {...baseToolbarProps}
        documentControl={toolbarDocumentControl()}
      />,
    )
    expect(screen.getByTestId('export-docx')).toBeInTheDocument()
    expect(screen.getByTestId('export-docx')).not.toBeDisabled()

    rerender(
      <TopToolbar
        {...baseToolbarProps}
        documentControl={toolbarDocumentControl({ docx: '请先切换到 Flow 讲义位置' })}
      />,
    )
    expect(screen.getByTestId('export-docx')).toBeDisabled()
    expect(screen.getByTestId('export-docx')).toHaveAttribute(
      'title',
      '请先切换到 Flow 讲义位置',
    )
  })

  it('renders Flow navigation and camera-frame navigation in ScenePanel', () => {
    const { rerender } = render(
      <ScenePanel
        flowDocumentControl={{
          surfaceTitle: flowView.surfaceTitle,
          flowView,
          selectedBlockId: flowView.activeBlockId,
          onSelectBlock: () => undefined,
          onAddSurface: () => undefined,
        }}
      />,
    )
    expect(screen.getByTestId('scene-panel-surface-title')).toHaveTextContent('第一讲 数轴')
    expect(screen.getByTestId('add-flow-surface')).toBeInTheDocument()
    expect(screen.getByTestId('scene-panel-flow-outline')).toBeInTheDocument()

    rerender(
      <ScenePanel
        spatialDocumentControl={{
          surfaceTitle: spatialSurface.title,
          frames: spatialSurface.camera.frames,
          home: spatialSurface.camera.home,
          sessionCamera: spatialSurface.camera.home,
          activeCameraFrameId: 'frame-1',
          worldLayerItems: spatialSurface.world.layerItems,
          semanticZoomRules: spatialSurface.semanticZoom,
          onAddFrame: () => undefined,
          onRenameFrame: () => undefined,
          onReorderFrame: () => undefined,
          onDeleteFrame: () => undefined,
          onSetHome: () => undefined,
          onActivateFrame: () => undefined,
          onAddSemanticZoomRule: () => undefined,
          onUpdateSemanticZoomRule: () => undefined,
          onDeleteSemanticZoomRule: () => undefined,
          onAddSurface: () => undefined,
        }}
      />,
    )
    expect(screen.getByTestId('scene-panel-surface-title')).toHaveTextContent('空间探索')
    expect(screen.getByTestId('add-spatial-surface')).toBeInTheDocument()
    expect(screen.getByTestId('scene-panel-spatial-frames')).toBeInTheDocument()
  })

  it('renders Flow and Spatial right-sidebar controls without the slide document control', () => {
    const { rerender } = render(
      <RightSidebar
        flowDocumentControl={{
          elements: {
            onInsert: () => undefined,
            nestedSectionId: undefined,
          },
          properties: {
            block: flowView.blocks[0]!.block as never,
          },
        }}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )
    expect(screen.getByTestId('flow-elements-tab')).toBeInTheDocument()

    rerender(
      <RightSidebar
        spatialDocumentControl={{
          elements: {
            onAddText: () => undefined,
            onAddShape: () => undefined,
            onAddFormula: () => undefined,
          },
          layers: {
            layer: null,
            onPatch: () => undefined,
          },
          properties: {
            camera: {
              surfaceTitle: spatialSurface.title,
              frames: spatialSurface.camera.frames,
              home: spatialSurface.camera.home,
              sessionCamera: spatialSurface.camera.home,
              activeCameraFrameId: 'frame-1',
              worldLayerItems: spatialSurface.world.layerItems,
              semanticZoomRules: spatialSurface.semanticZoom,
              onAddFrame: () => undefined,
              onRenameFrame: () => undefined,
              onReorderFrame: () => undefined,
              onDeleteFrame: () => undefined,
              onSetHome: () => undefined,
              onActivateFrame: () => undefined,
              onAddSemanticZoomRule: () => undefined,
              onUpdateSemanticZoomRule: () => undefined,
              onDeleteSemanticZoomRule: () => undefined,
            },
            paths: {
              surfaceTitle: spatialSurface.title,
              worldLayerItems: spatialSurface.world.layerItems,
              paths: [],
              relations: [],
              onAddPath: () => undefined,
              onRenamePath: () => undefined,
              onUpdatePathStyle: () => undefined,
              onDeletePath: () => undefined,
              onAddRelation: () => undefined,
              onUpdateRelationLabel: () => undefined,
              onUpdateRelationKind: () => undefined,
              onDeleteRelation: () => undefined,
            },
          },
        }}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )
    expect(screen.getByTestId('spatial-elements-tab')).toBeInTheDocument()
  })

  it('routes Workspace to FlowWorkspace and SpatialWorkspace before the Phaser slide editor', () => {
    const { rerender } = render(
      <Workspace
        flowAuthoring={{
          view: flowView,
          selectedBlockId: flowView.activeBlockId,
          onSelectBlock: () => undefined,
        }}
        onAddImage={() => undefined}
        onAddVideo={() => undefined}
        onSelectImageAsset={async () => null}
      />,
    )
    expect(screen.getByTestId('workspace-flow-authoring')).toBeInTheDocument()

    rerender(
      <Workspace
        spatialAuthoring={{
          spatial: spatialSurface,
          viewportSize: { width: 1280, height: 720 },
          selectedLayerItemIds: [],
          interactionDisabled: false,
          onSelect: () => undefined,
          onTransformEnd: () => undefined,
        }}
        onAddImage={() => undefined}
        onAddVideo={() => undefined}
        onSelectImageAsset={async () => null}
      />,
    )
    expect(screen.getByTestId('workspace-spatial-authoring')).toBeInTheDocument()
  })
})
