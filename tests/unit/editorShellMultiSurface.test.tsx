// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlowEditorView } from '@/renderer/course/flowEditorView'
import type { SpatialSurfaceDocument } from '@/shared/courseProjectTypes'
import { createTeacherControllerNode } from '@/renderer/project/createProject'
import { useEditorStore } from '@/renderer/store/editorStore'
import { TopToolbar } from '@/renderer/ui/TopToolbar'
import { ScenePanel } from '@/renderer/ui/ScenePanel'
import { RightSidebar } from '@/renderer/ui/RightSidebar'
import type { PropertiesTabDocumentControl } from '@/renderer/ui/PropertiesTab'

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

function spatialDocumentControl(
  controllerProperties?: PropertiesTabDocumentControl,
) {
  return {
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
    ...(controllerProperties ? { controllerProperties } : {}),
  }
}

function globalControllerProperties(
  onUpdateNode = vi.fn(() => true),
): PropertiesTabDocumentControl {
  const node = createTeacherControllerNode({
    id: 'global-controller',
    title: '全课控制器',
    x: 120,
    y: 42,
    width: 300,
    height: 72,
  })
  return {
    editingScope: 'scene',
    editorMode: 'simple',
    selectedNodes: [node],
    target: {
      sessionId: 'session-spatial',
      locationId: 'location-spatial-1',
      stateId: null,
      editingScope: 'scene',
      source: 'global',
      projectRevision: 7,
      layerItemId: node.id,
    },
    scopeLabel: '全课控制器',
    scopeDescription: '本次修改将应用到整门课。',
    overrideActive: false,
    textContentUnavailableReason: '不可用',
    richTextUnavailableReason: '不可用',
    mediaUnavailableReason: '不可用',
    controllerUnavailableReason: '不可用',
    controllerScenes: [],
    onUpdateNode,
    onClearOverride: () => false,
  }
}

afterEach(() => {
  cleanup()
  act(() => {
    useEditorStore.getState().setActiveTab('elements')
  })
})

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
        spatialDocumentControl={spatialDocumentControl()}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )
    expect(screen.getByTestId('spatial-elements-tab')).toBeInTheDocument()
  })

  it('routes a selected Spatial global controller to the shared full-course properties view', () => {
    const onUpdateNode = vi.fn(() => true)
    act(() => {
      useEditorStore.getState().setActiveTab('properties')
    })
    render(
      <RightSidebar
        spatialDocumentControl={spatialDocumentControl(globalControllerProperties(onUpdateNode))}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    expect(screen.getByText('全课控制器')).toBeInTheDocument()
    expect(screen.getByText('本次修改将应用到整门课。')).toBeInTheDocument()
    expect(screen.queryByTestId('spatial-camera-panel')).not.toBeInTheDocument()

    const title = screen.getByLabelText('控制器标题')
    fireEvent.change(title, { target: { value: 'Spatial 全课控制' } })
    fireEvent.blur(title)
    expect(onUpdateNode).toHaveBeenCalledWith(expect.objectContaining({
      source: 'global',
      layerItemId: 'global-controller',
    }), { title: 'Spatial 全课控制' })
  })

  it('forwards the Spatial controller locator with its explicit stable source and ID', () => {
    const onLocateController = vi.fn()
    act(() => {
      useEditorStore.getState().setActiveTab('layers')
    })
    render(
      <RightSidebar
        spatialDocumentControl={{
          ...spatialDocumentControl(),
          layerList: {
            layers: [{
              source: 'global',
              scopedVisible: true,
              effectiveVisible: true,
              selectionId: 'global-controller',
              item: {
                layerItemId: 'global-controller',
                label: '教师控制器',
                kind: 'native',
                visible: true,
                locked: false,
                order: 1,
                content: { nativeType: 'teacher-controller' },
              },
            }, {
              source: 'global',
              scopedVisible: false,
              effectiveVisible: false,
              selectionId: 'hidden-global-controller',
              item: {
                layerItemId: 'hidden-global-controller',
                label: '隐藏教师控制器',
                kind: 'native',
                visible: false,
                locked: true,
                order: 2,
                content: { nativeType: 'teacher-controller' },
              },
            }] as never,
            onLocateController,
          },
        }}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('locate-controller-global-global-controller'))
    expect(onLocateController).toHaveBeenCalledWith({
      source: 'global',
      layerItemId: 'global-controller',
    })
    expect(
      screen.getByTestId('locate-controller-global-hidden-global-controller'),
    ).toBeDisabled()
    expect(
      screen.getByTestId('locate-controller-global-hidden-global-controller'),
    ).toHaveAttribute('title', '控制器当前不可见，无法定位到画布')
  })

  it('marks a shared Spatial row through a local source-explicit inspection target', () => {
    const onSelectLayer = vi.fn()
    act(() => {
      useEditorStore.getState().setActiveTab('layers')
    })
    render(
      <RightSidebar
        spatialDocumentControl={{
          ...spatialDocumentControl(),
          layerList: {
            layers: [{
              source: 'surface',
              scopedVisible: false,
              effectiveVisible: false,
              selectionId: 'shared-spatial-note',
              item: {
                layerItemId: 'shared-spatial-note',
                label: '空间共用说明',
                kind: 'native',
                visible: true,
                locked: false,
                order: 1,
                content: { nativeType: 'text' },
              },
            }] as never,
            onSelectLayer,
          },
        }}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    const sharedItem = screen.getByTestId('spatial-layer-list-item-surface-shared-spatial-note')
    expect(sharedItem).not.toHaveClass('spatial-layer-list-item--selected')
    expect(sharedItem).toHaveAttribute('data-layer-view-only', 'true')
    expect(sharedItem).toHaveAttribute('data-layer-effective-visible', 'false')

    fireEvent.click(sharedItem)
    expect(sharedItem).toHaveClass('spatial-layer-list-item--selected')
    expect(sharedItem).toHaveAttribute('aria-pressed', 'true')
    expect(onSelectLayer).toHaveBeenCalledWith({
      source: 'surface',
      layerItemId: 'shared-spatial-note',
    })
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
          screenController: {
            source: 'global',
            layerItemId: 'global-controller',
            label: '教师控制器',
            title: '课堂导航',
            compact: false,
            locked: false,
            opacity: 1,
            frame: { x: 120, y: 42, width: 300, height: 72, rotation: 0 },
          },
          selectedScreenControllerTarget: {
            source: 'global',
            layerItemId: 'global-controller',
          },
          onSelectScreenController: () => undefined,
          onScreenControllerTransformEnd: () => undefined,
        }}
        onAddImage={() => undefined}
        onAddVideo={() => undefined}
        onSelectImageAsset={async () => null}
      />,
    )
    expect(screen.getByTestId('workspace-spatial-authoring')).toBeInTheDocument()
    expect(screen.getByTestId('spatial-screen-controller')).toBeInTheDocument()
  })
})
