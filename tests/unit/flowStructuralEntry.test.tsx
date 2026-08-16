import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FlowBlockView, FlowEditorView } from '@/renderer/course/flowEditorView'
import { FlowElementsTab } from '@/renderer/ui/FlowElementsTab'
import { FlowOutlinePanel } from '@/renderer/ui/FlowOutlinePanel'
import { FlowPropertiesTab } from '@/renderer/ui/FlowPropertiesTab'
import { FlowWorkspace } from '@/renderer/ui/FlowWorkspace'
import type { FlowBlock } from '@/shared/courseProjectTypes'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function headingBlock(): FlowBlock {
  return { id: 'block-h1', type: 'heading', level: 1, text: '第一章 开始' }
}

function paragraphBlock(): FlowBlock {
  return { id: 'block-p', type: 'paragraph', text: '正文段落' }
}

function sectionBlock(): FlowBlock {
  return { id: 'block-section', type: 'section', title: '章节 A', collapsedByDefault: false, blocks: [] }
}

function blockView(block: FlowBlock, index: number): FlowBlockView {
  return {
    blockId: block.id,
    parentId: null,
    depth: 0,
    index,
    stableAddress: `surface:flow-surface/block:${block.id}`,
    label: block.type === 'paragraph' ? '正文段落' : block.type === 'heading' ? '第一章 开始' : '章节 A',
    block,
  }
}

function flowView(): FlowEditorView {
  return {
    projectId: 'course-flow-structural',
    revision: 1,
    locationId: 'loc-flow',
    surfaceId: 'flow-surface',
    surfaceTitle: '讲义',
    activeBlockId: 'block-p',
    layout: { readingWidth: 720, wideContentWidth: 960 },
    blocks: [
      blockView(headingBlock(), 0),
      blockView(paragraphBlock(), 1),
      blockView(sectionBlock(), 2),
    ],
    outline: [
      { blockId: 'block-h1', title: '第一章 开始', level: 1, depth: 0, kind: 'heading', path: ['surfaces', 0, 'blocks', 0] },
      { blockId: 'block-section', title: '章节 A', level: 1, depth: 0, kind: 'section', path: ['surfaces', 0, 'blocks', 2] },
    ],
    globalLayerItems: [],
    surfaceLayerItems: [],
  }
}

describe('FlowWorkspace structural action toolbar and keyboard entry', () => {
  it('renders the selected block toolbar and fires click callbacks with the selected block id and direction', () => {
    const onDeleteBlock = vi.fn()
    const onDuplicateBlock = vi.fn()
    const onMoveBlock = vi.fn()
    render(
      <FlowWorkspace
        view={flowView()}
        selectedBlockId="block-p"
        onDeleteBlock={onDeleteBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
      />,
    )

    expect(screen.getByRole('toolbar', { name: '内容块操作' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDeleteBlock).toHaveBeenCalledWith('block-p')
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(onDuplicateBlock).toHaveBeenCalledWith('block-p')
    fireEvent.click(screen.getByRole('button', { name: '上移' }))
    expect(onMoveBlock).toHaveBeenCalledWith('block-p', 'up')
    fireEvent.click(screen.getByRole('button', { name: '下移' }))
    expect(onMoveBlock).toHaveBeenCalledWith('block-p', 'down')
    fireEvent.click(screen.getByRole('button', { name: '提升层级' }))
    expect(onMoveBlock).toHaveBeenCalledWith('block-p', 'left')
    fireEvent.click(screen.getByRole('button', { name: '降低层级' }))
    expect(onMoveBlock).toHaveBeenCalledWith('block-p', 'right')
  })

  it('handles Delete/Backspace, Control/Command+D and Alt+ArrowUp/Down on the workspace root', () => {
    const onDeleteBlock = vi.fn()
    const onDuplicateBlock = vi.fn()
    const onMoveBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={flowView()}
        selectedBlockId="block-p"
        onDeleteBlock={onDeleteBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
      />,
    )
    const root = container.querySelector('article.flow-editor-surface')!

    fireEvent.keyDown(root, { key: 'Delete' })
    fireEvent.keyDown(root, { key: 'Backspace' })
    expect(onDeleteBlock).toHaveBeenNthCalledWith(1, 'block-p')
    expect(onDeleteBlock).toHaveBeenNthCalledWith(2, 'block-p')

    fireEvent.keyDown(root, { key: 'd', ctrlKey: true })
    fireEvent.keyDown(root, { key: 'd', metaKey: true })
    expect(onDuplicateBlock).toHaveBeenNthCalledWith(1, 'block-p')
    expect(onDuplicateBlock).toHaveBeenNthCalledWith(2, 'block-p')

    fireEvent.keyDown(root, { key: 'ArrowUp', altKey: true })
    expect(onMoveBlock).toHaveBeenCalledWith('block-p', 'up')
    fireEvent.keyDown(root, { key: 'ArrowDown', altKey: true })
    expect(onMoveBlock).toHaveBeenCalledWith('block-p', 'down')
  })

  it('prevents default for handled keyboard shortcuts', () => {
    const onDeleteBlock = vi.fn()
    const onDuplicateBlock = vi.fn()
    const onMoveBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={flowView()}
        selectedBlockId="block-p"
        onDeleteBlock={onDeleteBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
      />,
    )
    const root = container.querySelector('article.flow-editor-surface')!

    const deleteEvent = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true })
    fireEvent(root, deleteEvent)
    expect(deleteEvent.defaultPrevented).toBe(true)

    const duplicateEvent = new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true })
    fireEvent(root, duplicateEvent)
    expect(duplicateEvent.defaultPrevented).toBe(true)

    const moveEvent = new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true, cancelable: true })
    fireEvent(root, moveEvent)
    expect(moveEvent.defaultPrevented).toBe(true)
  })

  it('does not fire structural callbacks in readOnly mode', () => {
    const onDeleteBlock = vi.fn()
    const onDuplicateBlock = vi.fn()
    const onMoveBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={flowView()}
        selectedBlockId="block-p"
        readOnly
        onDeleteBlock={onDeleteBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
      />,
    )
    const root = container.querySelector('article.flow-editor-surface')!

    fireEvent.keyDown(root, { key: 'Delete' })
    fireEvent.keyDown(root, { key: 'Backspace' })
    fireEvent.keyDown(root, { key: 'd', ctrlKey: true })
    fireEvent.keyDown(root, { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(root, { key: 'ArrowDown', altKey: true })
    expect(onDeleteBlock).not.toHaveBeenCalled()
    expect(onDuplicateBlock).not.toHaveBeenCalled()
    expect(onMoveBlock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    fireEvent.click(screen.getByRole('button', { name: '上移' }))
    expect(onDeleteBlock).not.toHaveBeenCalled()
    expect(onDuplicateBlock).not.toHaveBeenCalled()
    expect(onMoveBlock).not.toHaveBeenCalled()
  })
})

describe('FlowOutlinePanel structural action toolbar', () => {
  it('renders toolbar on the selected outline node and fires callbacks', () => {
    const onDeleteBlock = vi.fn()
    const onDuplicateBlock = vi.fn()
    const onMoveBlock = vi.fn()
    render(
      <FlowOutlinePanel
        view={flowView()}
        selectedBlockId="block-h1"
        onDeleteBlock={onDeleteBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
      />,
    )

    expect(screen.getByRole('toolbar', { name: '内容块操作' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(onDeleteBlock).toHaveBeenCalledWith('block-h1')
    fireEvent.click(screen.getByRole('button', { name: '复制' }))
    expect(onDuplicateBlock).toHaveBeenCalledWith('block-h1')
    fireEvent.click(screen.getByRole('button', { name: '上移' }))
    expect(onMoveBlock).toHaveBeenCalledWith('block-h1', 'up')
    fireEvent.click(screen.getByRole('button', { name: '下移' }))
    expect(onMoveBlock).toHaveBeenCalledWith('block-h1', 'down')
    fireEvent.click(screen.getByRole('button', { name: '提升层级' }))
    expect(onMoveBlock).toHaveBeenCalledWith('block-h1', 'left')
    fireEvent.click(screen.getByRole('button', { name: '降低层级' }))
    expect(onMoveBlock).toHaveBeenCalledWith('block-h1', 'right')
  })
})

describe('FlowPropertiesTab structural unavailable reason', () => {
  it('shows the structuralUnavailableReason instead of silently disabling list structural buttons', () => {
    const onPatch = vi.fn()
    render(
      <FlowPropertiesTab
        block={{
          id: 'block-list',
          type: 'list',
          ordered: false,
          items: [{ id: 'item-a', text: '第一项' }],
        }}
        onPatch={onPatch}
        structuralUnavailableReason="当前课程未接入结构编辑，请先联系课程负责人。"
      />,
    )

    expect(screen.getByTestId('flow-structural-unavailable-reason')).toHaveTextContent(
      '当前课程未接入结构编辑，请先联系课程负责人。',
    )
    expect(screen.getByTestId('flow-list-add-item')).toBeDisabled()
    expect(screen.getByTestId('flow-list-item-1-delete')).toBeDisabled()
  })

  it('shows the structuralUnavailableReason for table structural buttons when no structural command is supplied', () => {
    render(
      <FlowPropertiesTab
        block={{
          id: 'block-table',
          type: 'table',
          caption: '表格',
          columns: [{ id: 'column-a', header: '项目' }],
          rows: [{ id: 'row-a', cells: { 'column-a': '甲' } }],
        }}
        structuralUnavailableReason="列表/表格结构编辑暂未接入。"
      />,
    )

    expect(screen.getByTestId('flow-structural-unavailable-reason')).toHaveTextContent(
      '列表/表格结构编辑暂未接入。',
    )
    expect(screen.getByTestId('flow-table-add-column')).toBeDisabled()
    expect(screen.getByTestId('flow-table-add-row')).toBeDisabled()
  })
})

describe('FlowElementsTab media and component insert gating', () => {
  it('disables media and component insertion with the supplied teacher-safe reasons', () => {
    const onInsert = vi.fn()
    render(
      <FlowElementsTab
        onInsert={onInsert}
        assets={[]}
        componentPackages={[]}
        unavailableReasons={{
          media: '请先导入图片、音频或视频素材。',
          component: '请先嵌入互动组件包。',
        }}
      />,
    )

    expect(screen.getByTestId('flow-media-unavailable-reason')).toHaveTextContent('请先导入图片、音频或视频素材。')
    expect(screen.getByTestId('flow-component-unavailable-reason')).toHaveTextContent('请先嵌入互动组件包。')
    expect(screen.getByTestId('add-flow-media')).toBeDisabled()
    expect(screen.getByTestId('add-flow-component')).toBeDisabled()
    expect(screen.getByTestId('add-flow-paragraph')).not.toBeDisabled()

    fireEvent.click(screen.getByTestId('add-flow-media'))
    fireEvent.click(screen.getByTestId('add-flow-component'))
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('uses available assets and component packages for inserted media and component blocks', () => {
    const onInsert = vi.fn()
    render(
      <FlowElementsTab
        onInsert={onInsert}
        assets={[
          { id: 'asset-audio', label: '旁白.mp3', kind: 'audio' },
          { id: 'asset-image', label: '封面.png', kind: 'image' },
        ]}
        componentPackages={[{ packageId: 'com.example.demo', version: '1.0.0' }]}
      />,
    )

    fireEvent.click(screen.getByTestId('add-flow-media'))
    fireEvent.click(screen.getByTestId('add-flow-component'))

    expect(onInsert).toHaveBeenCalledTimes(2)
    const [mediaRequest] = onInsert.mock.calls[0]!
    expect(mediaRequest).toMatchObject({
      type: 'media',
      assetId: 'asset-image',
      mediaKind: 'image',
    })
    const [componentRequest] = onInsert.mock.calls[1]!
    expect(componentRequest).toMatchObject({
      type: 'component',
      component: { packageId: 'com.example.demo', version: '1.0.0' },
      staticFallbackAssetId: 'asset-image',
    })
  })
})
