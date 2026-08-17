import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShapeNode, createTextNode } from '@/renderer/project/createProject'
import { v9SlideLayerContextKey } from '@/renderer/course/v9SlideVerticalSlice'
import { useEditorStore } from '@/renderer/store/editorStore'
import {
  NodesTab,
  type NodesTabDocumentControl,
} from '@/renderer/ui/NodesTab'

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('NodesTab document control', () => {
  it('remounts row drafts when the controlled authoring context changes', () => {
    const text = createTextNode({ id: 'same-id', name: '同名共用项' })
    const firstContextKey = v9SlideLayerContextKey({
      sessionId: 'session|location',
      locationId: 'current',
      stateId: null,
      editingScope: 'surface',
    })
    const secondContextKey = v9SlideLayerContextKey({
      sessionId: 'session',
      locationId: 'location|current',
      stateId: null,
      editingScope: 'surface',
    })
    expect(firstContextKey).not.toBe(secondContextKey)
    const base: NodesTabDocumentControl = {
      editingScope: 'surface',
      contextKey: firstContextKey,
      scopeLabel: '当前内容共用',
      nodes: [text],
      selectedNodeIds: [],
      onSelectNode: vi.fn(),
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onRenameNode: vi.fn(),
      onSetNodeVisible: vi.fn(),
      onSetNodeLocked: vi.fn(),
      onReorderNodes: vi.fn(),
    }
    const { rerender } = render(<NodesTab documentControl={base} />)
    fireEvent.doubleClick(screen.getByText('同名共用项'))
    const draft = screen.getByRole('textbox', { name: '重命名“同名共用项”' })
    fireEvent.change(draft, { target: { value: '未提交旧内容' } })

    rerender(<NodesTab documentControl={{
      ...base,
      contextKey: secondContextKey,
    }} />)

    expect(screen.queryByRole('textbox', { name: '重命名“同名共用项”' }))
      .not.toBeInTheDocument()
    expect(screen.getByText('同名共用项')).toBeInTheDocument()
    expect(base.onRenameNode).not.toHaveBeenCalled()
  })

  it('keeps shared Native rows editable while gating omitted dynamic content', () => {
    const text = createTextNode({ id: 'surface-native', name: '共用提示' })
    const onSetNodeVisible = vi.fn()
    render(<NodesTab documentControl={{
      editingScope: 'surface',
      contextKey: 'surface-context',
      scopeLabel: '当前内容共用',
      nodes: [text],
      selectedNodeIds: [],
      omittedItemsReason: '当前内容共用层还有 2 个动态内容或复用内容暂不能编辑；已显示的元素仍可编辑。',
      reorderUnavailableReason: '当前列表未包含共用层中的全部元素，暂不能调整整体层级。',
      onSelectNode: vi.fn(),
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onRenameNode: vi.fn(),
      onSetNodeVisible,
      onSetNodeLocked: vi.fn(),
      onReorderNodes: vi.fn(),
    }} />)

    expect(screen.getByText('当前内容共用')).toBeInTheDocument()
    expect(screen.getByText(/还有 2 个动态内容或复用内容暂不能编辑/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '调整“共用提示”层级' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '隐藏“共用提示”' }))
    expect(onSetNodeVisible).toHaveBeenCalledWith(text.id, false)
  })

  it('routes selection and layer actions only through the injected owner', () => {
    const projectBefore = useEditorStore.getState().project
    const historyBefore = useEditorStore.getState().history
    const text = createTextNode({ id: 'controlled-text', name: '标题' })
    const shape = {
      ...createShapeNode('rectangle', { id: 'controlled-shape' }),
      name: '背景矩形',
      visible: false,
      locked: true,
    }
    const control: NodesTabDocumentControl = {
      editingScope: 'scene',
      contextKey: 'scene-context',
      scopeLabel: '导入场景',
      nodes: [text, shape],
      selectedNodeIds: [text.id],
      onSelectNode: vi.fn(),
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onRenameNode: vi.fn(),
      onSetNodeVisible: vi.fn(),
      onSetNodeLocked: vi.fn(),
      onReorderNodes: vi.fn(),
    }

    render(<NodesTab documentControl={control} />)

    expect(screen.getByText('导入场景')).toBeInTheDocument()
    expect(screen.getByText('已选 1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('背景矩形'), { ctrlKey: true })
    expect(control.onSelectNode).toHaveBeenCalledWith(shape.id, true)

    fireEvent.click(screen.getByRole('button', { name: '显示“背景矩形”' }))
    fireEvent.click(screen.getByRole('button', { name: '解锁“背景矩形”' }))
    fireEvent.click(screen.getByRole('button', { name: '复制“背景矩形”' }))
    fireEvent.click(screen.getByRole('button', { name: '删除“背景矩形”' }))
    expect(control.onSetNodeVisible).toHaveBeenCalledWith(shape.id, true)
    expect(control.onSetNodeLocked).toHaveBeenCalledWith(shape.id, false)
    expect(control.onDuplicateNode).toHaveBeenCalledWith(shape.id)
    expect(control.onDeleteNode).toHaveBeenCalledWith(shape.id)

    fireEvent.doubleClick(screen.getByText('标题'))
    const rename = screen.getByRole('textbox', { name: '重命名“标题”' })
    fireEvent.change(rename, { target: { value: '新标题' } })
    fireEvent.blur(rename)
    expect(control.onRenameNode).toHaveBeenCalledWith(text.id, '新标题')

    fireEvent.click(screen.getByText('导入场景'))
    expect(control.onSelectNode).toHaveBeenCalledWith(null, false)
    expect(useEditorStore.getState().project).toBe(projectBefore)
    expect(useEditorStore.getState().history).toBe(historyBefore)
  })

  it('describes named-state removal as hiding and disables an already hidden item', () => {
    const visible = createTextNode({ id: 'visible-state-text', name: '状态标题' })
    const hidden = createTextNode({
      id: 'hidden-state-text',
      name: '已隐藏提示',
      visible: false,
    })
    const onDeleteNode = vi.fn()

    render(<NodesTab documentControl={{
      editingScope: 'scene',
      contextKey: 'named-state-context',
      scopeLabel: '讲解态',
      nodes: [visible, hidden],
      selectedNodeIds: [],
      deletionMode: 'hide-in-state',
      onSelectNode: vi.fn(),
      onDeleteNode,
      onDuplicateNode: vi.fn(),
      onRenameNode: vi.fn(),
      onSetNodeVisible: vi.fn(),
      onSetNodeLocked: vi.fn(),
      onReorderNodes: vi.fn(),
    }} />)

    fireEvent.click(screen.getByRole('button', {
      name: '从当前状态隐藏“状态标题”',
    }))
    expect(onDeleteNode).toHaveBeenCalledWith(visible.id)
    expect(screen.getByRole('button', {
      name: '“已隐藏提示”已在当前状态隐藏',
    })).toBeDisabled()
  })

  it('keeps supported rows editable while disabling incomplete mixed-scene ordering', () => {
    const text = createTextNode({ id: 'mixed-text', name: '可编辑正文' })
    const onSetNodeVisible = vi.fn()
    const omittedItemsReason = '当前幻灯片还有 1 个动态元素暂不在列表中。'
    const reorderUnavailableReason = '当前列表未包含全部元素，暂不能调整整体层级。'

    render(<NodesTab documentControl={{
      editingScope: 'scene',
      contextKey: 'mixed-scene-context',
      scopeLabel: '混合幻灯片',
      nodes: [text],
      selectedNodeIds: [],
      omittedItemsReason,
      reorderUnavailableReason,
      onSelectNode: vi.fn(),
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onRenameNode: vi.fn(),
      onSetNodeVisible,
      onSetNodeLocked: vi.fn(),
      onReorderNodes: vi.fn(),
    }} />)

    expect(screen.getByText(omittedItemsReason)).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: '调整“可编辑正文”层级',
    })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '隐藏“可编辑正文”' }))
    expect(onSetNodeVisible).toHaveBeenCalledWith(text.id, false)
    expect(screen.getByText(reorderUnavailableReason)).toBeInTheDocument()
  })

  it('keeps long layer names on a single horizontal line', () => {
    const longName = '这是一段需要在窄侧栏里保持单行并截断的超长图层名称'.repeat(3)
    const text = createTextNode({ id: 'long-name', name: longName })
    render(
      <div style={{ width: 280 }}>
        <NodesTab documentControl={{
          editingScope: 'scene',
          contextKey: 'horizontal-name',
          scopeLabel: '本页',
          nodes: [text],
          selectedNodeIds: [],
          onSelectNode: vi.fn(),
          onDeleteNode: vi.fn(),
          onDuplicateNode: vi.fn(),
          onRenameNode: vi.fn(),
          onSetNodeVisible: vi.fn(),
          onSetNodeLocked: vi.fn(),
          onReorderNodes: vi.fn(),
        }} />
      </div>,
    )
    const name = screen.getByText(longName)
    expect(name.querySelector('br')).toBeNull()
    expect(name).toHaveStyle({
      writingMode: 'horizontal-tb',
      whiteSpace: 'nowrap',
      textOverflow: 'ellipsis',
    })
    expect(screen.getByTestId('node-item-long-name')).toHaveStyle({
      display: 'flex',
      flexWrap: 'nowrap',
      writingMode: 'horizontal-tb',
    })
    expect(screen.queryByText('定位控制器')).not.toBeInTheDocument()
  })

  it('renders T04-shaped effective rows without importing the T04 list', () => {
    const onSelectNode = vi.fn()
    render(<NodesTab documentControl={{
      editingScope: 'scene',
      contextKey: 'effective-rows',
      scopeLabel: '有效图层',
      nodes: [],
      selectedNodeIds: ['banner'],
      effectiveRows: [{
        id: 'banner',
        name: '全课横幅标题',
        sourceKind: 'global',
        ownerKey: 'global',
        sourceLabel: '全课',
        selected: true,
        locked: false,
        hidden: false,
      }],
      onSelectNode,
      onDeleteNode: vi.fn(),
      onDuplicateNode: vi.fn(),
      onRenameNode: vi.fn(),
      onSetNodeVisible: vi.fn(),
      onSetNodeLocked: vi.fn(),
      onReorderNodes: vi.fn(),
    }} />)

    expect(screen.getByText('全课')).toBeInTheDocument()
    expect(screen.getByText('全课横幅标题')).toHaveStyle({ writingMode: 'horizontal-tb' })
    fireEvent.click(screen.getByText('全课横幅标题'))
    expect(onSelectNode).toHaveBeenCalledWith('banner', false)
  })
})
