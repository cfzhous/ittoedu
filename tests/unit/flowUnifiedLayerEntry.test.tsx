import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FlowBlock,
  NativeLayerItem,
} from '@/shared/courseProjectTypes'
import { materializeNativeLayerItem } from '@/shared/courseProjectSchema'
import type {
  FlowEditorLayerTarget,
  FlowEditorLayerView,
  FlowEditorView,
} from '@/renderer/course/flowEditorView'
import { FlowWorkspace } from '@/renderer/ui/FlowWorkspace'
import { RightSidebar } from '@/renderer/ui/RightSidebar'
import type { PropertiesTabDocumentControl } from '@/renderer/ui/PropertiesTab'
import { useEditorStore } from '@/renderer/store/editorStore'

function nativeLayerItem(
  layerItemId: string,
  order: number,
  frame: { x: number; y: number; width: number; height: number },
  label: string,
  visible = true,
  locked = false,
): NativeLayerItem {
  return {
    layerItemId,
    label,
    kind: 'native',
    frame: { mode: 'absolute', ...frame },
    order,
    visible,
    locked,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    content: {
      nativeType: 'text',
      data: {
        text: label,
        runs: [],
        style: {
          fontFamily: 'sans-serif',
          fontSize: 24,
          color: '#172033',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          emphasis: false,
          highlightColor: null,
          align: 'left',
          verticalAlign: 'top',
          writingMode: 'horizontal',
          lineSpacing: 1.3,
          letterSpacing: 0,
          padding: 4,
          overflow: 'fixed',
          backgroundColor: '#ffffff',
          backgroundOpacity: 0,
          cornerRadius: 0,
        },
      },
    },
  }
}

function teacherControllerLayerItem(
  layerItemId: string,
  order: number,
  frame: { x: number; y: number; width: number; height: number },
  label: string,
  visible = true,
  locked = false,
): NativeLayerItem {
  return {
    ...nativeLayerItem(layerItemId, order, frame, label, visible, locked),
    content: {
      nativeType: 'teacher-controller',
      data: {
        title: label,
        showSceneProgress: true,
        compact: false,
        collapsible: false,
        defaultCollapsed: false,
        buttons: [{
          id: 'next',
          label: '下一页',
          visible: true,
          action: { type: 'scene.next' },
        }],
        style: {
          backgroundColor: '#ffffff',
          backgroundOpacity: 1,
          accentColor: '#2563eb',
          textColor: '#172033',
          cornerRadius: 8,
        },
        includeInStaticExports: false,
      },
    },
  }
}

function layerView(
  item: NativeLayerItem,
  source: FlowEditorLayerView['source'],
  scopedVisible = true,
): FlowEditorLayerView {
  return {
    source,
    scopedVisible,
    effectiveVisible: scopedVisible && item.visible,
    selectionId: item.layerItemId,
    item,
  }
}

function headingBlock(): FlowBlock {
  return { id: 'block-1', type: 'heading', level: 1, text: '学习目标' }
}

function flowView(): FlowEditorView {
  return {
    projectId: 'project-flow-layer-entry',
    revision: 1,
    locationId: 'location-flow-1',
    surfaceId: 'surface-flow',
    surfaceTitle: '第一讲 数轴',
    activeBlockId: 'block-1',
    layout: { readingWidth: 720, wideContentWidth: 1120 },
    blocks: [{
      blockId: 'block-1',
      parentId: null,
      depth: 0,
      index: 0,
      stableAddress: 'surface:surface-flow/block:block-1',
      label: '学习目标',
      block: headingBlock(),
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
}

const flowLayers: readonly FlowEditorLayerView[] = [
  layerView(teacherControllerLayerItem('layer-controller', 30, { x: 10, y: 20, width: 200, height: 50 }, '教师控制器'), 'global'),
  layerView(
    teacherControllerLayerItem('layer-hidden-controller', 25, { x: 10, y: 90, width: 200, height: 50 }, '隐藏控制器', false, true),
    'global',
  ),
  layerView(nativeLayerItem('layer-surface-a', 5, { x: 40, y: 80, width: 300, height: 120 }, '表面卡片 A'), 'surface'),
  layerView(
    nativeLayerItem('layer-surface-b', 5, { x: 5, y: 5, width: 80, height: 40 }, '表面卡片 B', false, true),
    'surface',
  ),
]

beforeEach(() => {
  act(() => {
    useEditorStore.getState().setActiveTab('elements')
  })
})

afterEach(() => {
  cleanup()
  act(() => {
    useEditorStore.getState().setActiveTab('elements')
  })
  vi.restoreAllMocks()
})

describe('FlowWorkspace authored layer overlay', () => {
  it('renders only effective-visible cards and preserves explicit source selection', () => {
    const { container } = render(
      <FlowWorkspace
        view={flowView()}
        layers={flowLayers}
        selectedLayerTarget={{ source: 'surface', layerItemId: 'layer-surface-a' }}
      />,
    )

    const orderedIds = [...container.querySelectorAll<HTMLElement>('[data-layer-item-id]')]
      .map((element) => element.dataset.layerItemId)
    expect(orderedIds).toEqual(['layer-surface-a', 'layer-controller'])

    const overlay = screen.getByTestId('flow-authoring-layer-overlay')
    expect(overlay).toBeInTheDocument()

    const selectedCard = screen.getByTestId('flow-layer-card-surface-layer-surface-a')
    expect(selectedCard).toHaveAttribute('data-layer-source', 'surface')
    expect(selectedCard).toHaveAttribute('data-layer-visible', 'true')
    expect(selectedCard).toHaveAttribute('data-layer-locked', 'false')
    expect(selectedCard).toHaveClass('flow-layer-card--selected')
    expect(selectedCard.style.left).toBe('40px')
    expect(selectedCard.style.top).toBe('80px')
    expect(selectedCard.style.width).toBe('300px')
    expect(selectedCard.style.height).toBe('120px')

    const controller = screen.getByTestId('flow-layer-card-global-layer-controller')
    expect(controller).toHaveAttribute('data-layer-source', 'global')
    expect(controller).toHaveAttribute('data-layer-draggable', 'false')
    expect(screen.queryByTestId('flow-layer-card-global-layer-hidden-controller')).not.toBeInTheDocument()
    expect(screen.queryByTestId('flow-layer-card-surface-layer-surface-b')).not.toBeInTheDocument()
  })

  it('reports an explicit global target and commits a controller drag only on pointer-up', () => {
    const onSelectLayer = vi.fn()
    const onTransformLayer = vi.fn()
    render(
      <FlowWorkspace
        view={flowView()}
        layers={flowLayers}
        selectedLayerTarget={null}
        onSelectLayer={onSelectLayer}
        onTransformLayer={onTransformLayer}
      />,
    )

    const controller = screen.getByTestId('flow-layer-card-global-layer-controller')
    expect(controller).toHaveAttribute('data-layer-draggable', 'true')
    fireEvent.pointerDown(controller, {
      pointerId: 7,
      button: 0,
      clientX: 100,
      clientY: 120,
    })
    expect(onSelectLayer).toHaveBeenCalledTimes(1)
    expect(onSelectLayer).toHaveBeenCalledWith({
      source: 'global',
      layerItemId: 'layer-controller',
    })
    fireEvent.pointerMove(controller, {
      pointerId: 7,
      clientX: 124,
      clientY: 112,
    })
    expect(onTransformLayer).not.toHaveBeenCalled()
    expect(controller.style.left).toBe('34px')
    expect(controller.style.top).toBe('12px')
    fireEvent.pointerUp(controller, {
      pointerId: 7,
      clientX: 124,
      clientY: 112,
    })
    expect(onTransformLayer).toHaveBeenCalledTimes(1)
    expect(onTransformLayer).toHaveBeenCalledWith({
      source: 'global',
      layerItemId: 'layer-controller',
      x: 34,
      y: 12,
      width: 200,
      height: 50,
      rotation: 0,
    })
  })

  it('keeps a visible locked controller selectable but not draggable', () => {
    const onSelectLayer = vi.fn()
    const onTransformLayer = vi.fn()
    const lockedController = layerView(
      teacherControllerLayerItem(
        'layer-locked-controller',
        40,
        { x: 60, y: 40, width: 200, height: 50 },
        '锁定控制器',
        true,
        true,
      ),
      'global',
    )
    render(
      <FlowWorkspace
        view={flowView()}
        layers={[lockedController]}
        selectedLayerTarget={null}
        onSelectLayer={onSelectLayer}
        onTransformLayer={onTransformLayer}
      />,
    )

    const controller = screen.getByTestId('flow-layer-card-global-layer-locked-controller')
    expect(controller).toHaveAttribute('data-layer-draggable', 'false')
    fireEvent.pointerDown(controller, {
      pointerId: 8,
      button: 0,
      clientX: 100,
      clientY: 80,
    })
    fireEvent.pointerMove(controller, {
      pointerId: 8,
      clientX: 124,
      clientY: 72,
    })
    fireEvent.pointerUp(controller, {
      pointerId: 8,
      clientX: 124,
      clientY: 72,
    })
    expect(onTransformLayer).not.toHaveBeenCalled()

    fireEvent.click(controller)
    expect(onSelectLayer).toHaveBeenCalledWith({
      source: 'global',
      layerItemId: 'layer-locked-controller',
    })
  })

  it('focuses the existing visible controller card for a locate request', () => {
    render(
      <FlowWorkspace
        view={flowView()}
        layers={flowLayers}
        selectedLayerTarget={{ source: 'global', layerItemId: 'layer-controller' }}
        controllerLocateRequest={{ layerItemId: 'layer-controller', requestId: 1 }}
      />,
    )

    expect(document.activeElement).toBe(
      screen.getByTestId('flow-layer-card-global-layer-controller'),
    )
  })

  it('omits the overlay when layers are not supplied', () => {
    const { container } = render(<FlowWorkspace view={flowView()} />)
    expect(screen.queryByTestId('flow-authoring-layer-overlay')).not.toBeInTheDocument()
    expect(container.querySelector('[data-layer-item-id]')).toBeNull()
  })
})

describe('RightSidebar Flow layers tab', () => {
  function flowDocumentControl(layers?: {
    layers: readonly FlowEditorLayerView[]
    selectedLayerTarget?: FlowEditorLayerTarget | null
    onSelectLayer?(target: FlowEditorLayerTarget): void
    onLocateController?(target: FlowEditorLayerTarget): void
  }, controllerProperties?: PropertiesTabDocumentControl) {
    return {
      elements: {
        onInsert: () => undefined,
        nestedSectionId: undefined,
      },
      properties: {
        block: headingBlock(),
      },
      ...(controllerProperties ? { controllerProperties } : {}),
      layers,
    }
  }

  function controllerProperties(onUpdateNode = vi.fn(() => true)): PropertiesTabDocumentControl {
    const item = teacherControllerLayerItem(
      'layer-controller',
      30,
      { x: 10, y: 20, width: 200, height: 50 },
      '教师控制器',
    )
    const node = materializeNativeLayerItem(item)
    if (node.type !== 'teacher-controller') throw new Error('expected teacher controller')
    return {
      editingScope: 'scene',
      editorMode: 'simple',
      selectedNodes: [{
        ...node,
        id: 'layer-controller',
        x: 10,
        y: 20,
        width: 200,
        height: 50,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
      }],
      target: {
        sessionId: 'session-flow',
        locationId: 'location-flow-1',
        stateId: null,
        editingScope: 'scene',
        source: 'global',
        projectRevision: 4,
        layerItemId: 'layer-controller',
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

  it('renders the same teacher-facing layer list with global/surface labels and lock/visibility state', () => {
    const onSelectLayer = vi.fn()
    act(() => {
      useEditorStore.getState().setActiveTab('layers')
    })
    render(
      <RightSidebar
        flowDocumentControl={flowDocumentControl({
          layers: flowLayers,
          selectedLayerTarget: { source: 'surface', layerItemId: 'layer-surface-a' },
          onSelectLayer,
        })}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    const list = screen.getByTestId('flow-layer-list')
    expect(list).toBeInTheDocument()
    expect(screen.queryByTestId('flow-elements-tab')).not.toBeInTheDocument()

    const orderedIds = [...list.querySelectorAll<HTMLElement>('[data-layer-item-id]')]
      .map((element) => element.dataset.layerItemId)
    expect(orderedIds).toEqual([
      'layer-surface-a',
      'layer-surface-b',
      'layer-hidden-controller',
      'layer-controller',
    ])

    const globalItem = screen.getByTestId('flow-layer-list-item-global-layer-controller')
    expect(globalItem).toHaveTextContent('全课内容')
    expect(globalItem).toHaveTextContent('显示')
    expect(globalItem).toHaveTextContent('未锁定')

    const hiddenController = screen.getByTestId('flow-layer-list-item-global-layer-hidden-controller')
    expect(hiddenController).toHaveTextContent('隐藏')
    expect(hiddenController).toHaveTextContent('锁定')
    expect(hiddenController).toHaveAttribute('data-layer-source', 'global')

    const surfaceItem = screen.getByTestId('flow-layer-list-item-surface-layer-surface-b')
    expect(surfaceItem).toHaveTextContent('当前讲义共用')
    expect(surfaceItem).toHaveTextContent('隐藏')
    expect(surfaceItem).toHaveTextContent('锁定')
    expect(surfaceItem).toHaveAttribute('data-layer-source', 'surface')

    fireEvent.click(surfaceItem)
    expect(onSelectLayer).toHaveBeenCalledWith({
      source: 'surface',
      layerItemId: 'layer-surface-b',
    })
  })

  it('marks a shared Flow layer with a local source-explicit inspection target', () => {
    const onSelectLayer = vi.fn()
    act(() => {
      useEditorStore.getState().setActiveTab('layers')
    })
    render(
      <RightSidebar
        flowDocumentControl={flowDocumentControl({
          layers: flowLayers,
          onSelectLayer,
        })}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    const sharedItem = screen.getByTestId('flow-layer-list-item-surface-layer-surface-b')
    expect(sharedItem).not.toHaveClass('flow-layer-list-item--selected')
    expect(sharedItem).toHaveAttribute('data-layer-effective-visible', 'false')
    expect(sharedItem.parentElement).toHaveTextContent('当前仅可查看影响范围')

    fireEvent.click(sharedItem)
    expect(sharedItem).toHaveClass('flow-layer-list-item--selected')
    expect(onSelectLayer).toHaveBeenCalledWith({
      source: 'surface',
      layerItemId: 'layer-surface-b',
    })
  })

  it('provides a controller locator without inferring ownership from its ID', () => {
    const onLocateController = vi.fn()
    act(() => {
      useEditorStore.getState().setActiveTab('layers')
    })
    render(
      <RightSidebar
        flowDocumentControl={flowDocumentControl({
          layers: flowLayers,
          onLocateController,
        })}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    fireEvent.click(screen.getByTestId('locate-controller-global-layer-controller'))
    expect(onLocateController).toHaveBeenCalledWith({
      source: 'global',
      layerItemId: 'layer-controller',
    })
    expect(
      screen.getByTestId('locate-controller-global-layer-hidden-controller'),
    ).toBeDisabled()
    expect(screen.queryByTestId('locate-controller-surface-layer-surface-a')).not.toBeInTheDocument()
  })

  it('routes a selected global controller to the shared properties view with full-course notice', () => {
    const onUpdateNode = vi.fn(() => true)
    act(() => {
      useEditorStore.getState().setActiveTab('properties')
    })
    render(
      <RightSidebar
        flowDocumentControl={flowDocumentControl(undefined, controllerProperties(onUpdateNode))}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    expect(screen.getByText('全课控制器')).toBeInTheDocument()
    expect(screen.getByText('本次修改将应用到整门课。')).toBeInTheDocument()
    expect(screen.queryByTestId('flow-editor-heading')).not.toBeInTheDocument()

    const title = screen.getByLabelText('控制器标题')
    fireEvent.change(title, { target: { value: 'Flow 全课控制' } })
    fireEvent.blur(title)
    expect(onUpdateNode).toHaveBeenCalledWith(expect.objectContaining({
      source: 'global',
      layerItemId: 'layer-controller',
    }), { title: 'Flow 全课控制' })

    fireEvent.click(screen.getByLabelText('紧凑布局'))
    expect(onUpdateNode).toHaveBeenLastCalledWith(expect.objectContaining({
      source: 'global',
      layerItemId: 'layer-controller',
    }), { compact: true })
  })

  it('keeps the Flow layers tab gated when the optional layers control is absent', () => {
    act(() => {
      useEditorStore.getState().setActiveTab('layers')
    })
    render(
      <RightSidebar
        flowDocumentControl={flowDocumentControl()}
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    expect(screen.queryByTestId('flow-layer-list')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      '讲义暂不提供此面板；现有内容不会改变。',
    )
  })
})
