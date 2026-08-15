import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShapeNode, createTextNode } from '@/renderer/project/createProject'
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
})
