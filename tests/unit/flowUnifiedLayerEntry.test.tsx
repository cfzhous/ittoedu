import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FlowBlock,
  NativeLayerItem,
} from '@/shared/courseProjectTypes'
import type {
  FlowEditorLayerView,
  FlowEditorView,
} from '@/renderer/course/flowEditorView'
import { FlowWorkspace } from '@/renderer/ui/FlowWorkspace'
import { RightSidebar } from '@/renderer/ui/RightSidebar'
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
    effectiveLayers: [],
  }
}

const flowLayers: readonly FlowEditorLayerView[] = [
  layerView(nativeLayerItem('layer-global', 30, { x: 10, y: 20, width: 200, height: 50 }, '全局标题'), 'global'),
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
  it('renders one presentational card per layer sorted by order then stable id with position and state', () => {
    const { container } = render(
      <FlowWorkspace
        view={flowView()}
        layers={flowLayers}
        selectedLayerItemId="layer-surface-a"
      />,
    )

    const orderedIds = [...container.querySelectorAll<HTMLElement>('[data-layer-item-id]')]
      .map((element) => element.dataset.layerItemId)
    expect(orderedIds).toEqual(['layer-surface-a', 'layer-surface-b', 'layer-global'])

    const overlay = screen.getByTestId('flow-authoring-layer-overlay')
    expect(overlay).toBeInTheDocument()

    const selectedCard = screen.getByTestId('flow-layer-card-layer-surface-a')
    expect(selectedCard).toHaveAttribute('data-layer-source', 'surface')
    expect(selectedCard).toHaveAttribute('data-layer-visible', 'true')
    expect(selectedCard).toHaveAttribute('data-layer-locked', 'false')
    expect(selectedCard).toHaveClass('flow-layer-card--selected')
    expect(selectedCard.style.left).toBe('40px')
    expect(selectedCard.style.top).toBe('80px')
    expect(selectedCard.style.width).toBe('300px')
    expect(selectedCard.style.height).toBe('120px')

    const hiddenLockedCard = screen.getByTestId('flow-layer-card-layer-surface-b')
    expect(hiddenLockedCard).toHaveAttribute('data-layer-visible', 'false')
    expect(hiddenLockedCard).toHaveAttribute('data-layer-locked', 'true')
    expect(hiddenLockedCard).toHaveTextContent('隐藏')
    expect(hiddenLockedCard).toHaveTextContent('锁定')
  })

  it('calls onSelectLayer with the stable layer item id when an overlay card is clicked', () => {
    const onSelectLayer = vi.fn()
    render(
      <FlowWorkspace
        view={flowView()}
        layers={flowLayers}
        selectedLayerItemId={null}
        onSelectLayer={onSelectLayer}
      />,
    )

    fireEvent.click(screen.getByTestId('flow-layer-card-layer-global'))
    expect(onSelectLayer).toHaveBeenCalledTimes(1)
    expect(onSelectLayer).toHaveBeenCalledWith('layer-global')
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
    selectedLayerItemId?: string | null
    onSelectLayer?(layerItemId: string): void
  }) {
    return {
      elements: {
        onInsert: () => undefined,
        nestedSectionId: undefined,
      },
      properties: {
        block: headingBlock(),
      },
      layers,
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
          selectedLayerItemId: 'layer-surface-a',
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
    expect(orderedIds).toEqual(['layer-surface-a', 'layer-surface-b', 'layer-global'])

    const globalItem = screen.getByTestId('flow-layer-list-item-layer-global')
    expect(globalItem).toHaveTextContent('全局')
    expect(globalItem).toHaveTextContent('显示')
    expect(globalItem).toHaveTextContent('未锁定')

    const surfaceItem = screen.getByTestId('flow-layer-list-item-layer-surface-b')
    expect(surfaceItem).toHaveTextContent('讲义')
    expect(surfaceItem).toHaveTextContent('隐藏')
    expect(surfaceItem).toHaveTextContent('锁定')
    expect(surfaceItem).toHaveAttribute('data-layer-source', 'surface')

    fireEvent.click(surfaceItem)
    expect(onSelectLayer).toHaveBeenCalledWith('layer-surface-b')
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
      'Flow 讲义暂不提供此面板；现有内容不会改变。',
    )
  })
})
