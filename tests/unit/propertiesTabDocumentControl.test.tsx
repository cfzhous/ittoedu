import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFormulaNode,
  createImageNode,
  createShapeNode,
  createTeacherControllerNode,
  createTextNode,
  createVideoNode,
} from '@/renderer/project/createProject'
import type { SceneNode } from '@/shared/projectTypes'

const storeAccess = vi.hoisted(() => ({
  hook: vi.fn(() => {
    throw new Error('controlled properties must not read the V8 Store hook')
  }),
  getState: vi.fn(() => {
    throw new Error('controlled properties must not read V8 Store state')
  }),
}))

vi.mock('@/renderer/store/editorStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/renderer/store/editorStore')>()
  return {
    ...actual,
    useEditorStore: Object.assign(storeAccess.hook, {
      getState: storeAccess.getState,
    }),
  }
})

import {
  PropertiesTab,
  type PropertiesTabDocumentControl,
} from '@/renderer/ui/PropertiesTab'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function controlFor(
  selectedNodes: readonly SceneNode[],
  onUpdateNode = vi.fn(() => true),
  onClearOverride = vi.fn(() => true),
): PropertiesTabDocumentControl {
  const selected = selectedNodes.length === 1 ? selectedNodes[0]! : null
  return {
    editingScope: 'scene',
    editorMode: 'professional',
    selectedNodes,
    target: selected ? {
      sessionId: 'session-current',
      locationId: 'location-scene-a',
      stateId: 'state-explain',
      layerItemId: selected.id,
    } : null,
    scopeLabel: '状态：讲解态',
    scopeDescription: '修改只影响当前讲解状态。',
    overrideActive: Boolean(selected),
    textContentUnavailableReason: '文字内容编辑稍后开放；当前可调整整段样式。',
    richTextUnavailableReason: '局部文字格式编辑稍后开放。',
    mediaUnavailableReason: '媒体专属设置稍后开放。',
    controllerUnavailableReason: '教师控制器专属设置稍后开放。',
    onUpdateNode,
    onClearOverride,
  }
}

describe('PropertiesTab document control', () => {
  it('edits text common and whole-node style fields only through the injected owner', () => {
    const text = createTextNode({
      id: 'controlled-text',
      name: '标题',
      text: '原文',
      style: { overflow: 'fixed' },
    })
    const onUpdateNode = vi.fn(() => true)
    const onClearOverride = vi.fn(() => true)
    const legacyReplaceImage = vi.fn()

    render(
      <PropertiesTab
        documentControl={controlFor([text], onUpdateNode, onClearOverride)}
        onReplaceImage={legacyReplaceImage}
      />,
    )

    expect(screen.getByText('状态：讲解态')).toBeInTheDocument()
    expect(screen.getByText('此元素已有当前状态设置。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '恢复基础值' }))
    const name = screen.getByLabelText('名称')
    fireEvent.change(name, { target: { value: '新标题' } })
    fireEvent.blur(name)
    fireEvent.click(screen.getByRole('button', { name: '锁定图层' }))
    fireEvent.click(screen.getByRole('button', { name: '加粗' }))
    const target = expect.objectContaining({
      sessionId: 'session-current',
      locationId: 'location-scene-a',
      stateId: 'state-explain',
      layerItemId: text.id,
    })
    expect(onUpdateNode).toHaveBeenCalledWith(target, { name: '新标题' })
    expect(onUpdateNode).toHaveBeenCalledWith(target, { locked: true })
    expect(onUpdateNode).toHaveBeenCalledWith(target, { style: { bold: true } })
    expect(onClearOverride).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-current',
      locationId: 'location-scene-a',
      stateId: 'state-explain',
      layerItemId: text.id,
    }))
    expect(screen.getByLabelText('文字内容')).toBeDisabled()
    expect(screen.getByText('文字内容编辑稍后开放；当前可调整整段样式。'))
      .toBeInTheDocument()
    expect(screen.getByRole('button', { name: '编辑局部文字格式' })).toBeDisabled()
    expect(screen.getByText('局部文字格式编辑稍后开放。')).toBeInTheDocument()
    onUpdateNode.mockClear()
    fireEvent.change(screen.getByLabelText('文字颜色选择器'), {
      target: { value: '#123456' },
    })
    fireEvent.change(screen.getByLabelText('文字颜色选择器'), {
      target: { value: '#456789' },
    })
    expect(onUpdateNode).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '应用文字颜色' }))
    expect(onUpdateNode).toHaveBeenCalledTimes(1)
    expect(onUpdateNode).toHaveBeenCalledWith(target, {
      style: { color: '#456789' },
    })
    expect(legacyReplaceImage).not.toHaveBeenCalled()
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })

  it('restores a common-field draft when the current target rejects the update', () => {
    const text = createTextNode({
      id: 'buffered-text',
      text: '保留原文',
      style: { overflow: 'fixed' },
    })
    const onUpdateNode = vi.fn(() => false)
    render(<PropertiesTab documentControl={controlFor([text], onUpdateNode)} />)

    const name = screen.getByLabelText('名称')
    fireEvent.change(name, { target: { value: '取消的标题' } })
    fireEvent.keyDown(name, { key: 'Escape' })
    expect(onUpdateNode).not.toHaveBeenCalled()
    expect(name).toHaveValue(text.name)

    fireEvent.change(name, { target: { value: '被拒绝的标题' } })
    expect(onUpdateNode).not.toHaveBeenCalled()
    fireEvent.blur(name)

    expect(onUpdateNode).toHaveBeenCalledTimes(1)
    expect(onUpdateNode).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-current',
      locationId: 'location-scene-a',
      stateId: 'state-explain',
      layerItemId: text.id,
    }), { name: '被拒绝的标题' })
    expect(screen.getByLabelText('名称')).toHaveValue(text.name)
    expect(screen.getByLabelText('文字内容')).toBeDisabled()
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })

  it('remounts field drafts when the same layer id belongs to a new editing context', () => {
    const text = createTextNode({ id: 'same-layer-id', name: '上下文标题' })
    const onUpdateNode = vi.fn(() => true)
    const initial = controlFor([text], onUpdateNode)
    const { rerender } = render(<PropertiesTab documentControl={initial} />)
    fireEvent.change(screen.getByLabelText('名称'), {
      target: { value: '未提交草稿' },
    })
    expect(screen.getByLabelText('名称')).toHaveValue('未提交草稿')

    rerender(<PropertiesTab documentControl={{
      ...initial,
      target: {
        ...initial.target!,
        sessionId: 'session-reopened',
        locationId: 'location-scene-b',
        stateId: 'state-review',
      },
    }} />)

    expect(screen.getByLabelText('名称')).toHaveValue(text.name)
    expect(onUpdateNode).not.toHaveBeenCalled()
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })

  it('reuses formula and shape common/style controls without mounting legacy state', () => {
    const formula = createFormulaNode({ id: 'controlled-formula' })
    const shape = createShapeNode('rectangle', { id: 'controlled-shape' })
    const onUpdateNode = vi.fn(() => true)
    const { rerender } = render(
      <PropertiesTab documentControl={controlFor([formula], onUpdateNode)} />,
    )

    const formulaSize = screen.getByLabelText('公式字号')
    fireEvent.change(formulaSize, { target: { value: '72' } })
    fireEvent.blur(formulaSize)
    fireEvent.click(screen.getByRole('button', { name: '公式左对齐' }))
    expect(onUpdateNode).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: formula.id,
    }), {
      style: { fontSize: 72 },
    })
    expect(onUpdateNode).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: formula.id,
    }), {
      style: { align: 'left' },
    })
    onUpdateNode.mockClear()
    fireEvent.change(screen.getByLabelText('公式颜色选择器'), {
      target: { value: '#123456' },
    })
    fireEvent.change(screen.getByLabelText('公式颜色选择器'), {
      target: { value: '#234567' },
    })
    expect(onUpdateNode).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '应用公式颜色' }))
    expect(onUpdateNode).toHaveBeenCalledTimes(1)
    expect(onUpdateNode).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: formula.id,
    }), { style: { color: '#234567' } })

    rerender(<PropertiesTab documentControl={controlFor([shape], onUpdateNode)} />)
    onUpdateNode.mockClear()
    fireEvent.change(screen.getByLabelText('图形类型'), {
      target: { value: 'ellipse' },
    })
    fireEvent.change(screen.getByLabelText('填充色选择器'), {
      target: { value: '#123456' },
    })
    fireEvent.change(screen.getByLabelText('填充色选择器'), {
      target: { value: '#345678' },
    })
    expect(onUpdateNode).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: '应用填充色' }))
    expect(onUpdateNode).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: shape.id,
    }), { shapeType: 'ellipse' })
    expect(onUpdateNode).toHaveBeenCalledWith(expect.objectContaining({
      layerItemId: shape.id,
    }), {
      style: { fillColor: '#345678' },
    })
    expect(onUpdateNode).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('名称')).toBeInTheDocument()
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })

  it('shows local disabled gates for media and teacher-controller properties', () => {
    const image = createImageNode({ id: 'controlled-image', assetId: 'image-asset' })
    const video = createVideoNode({ id: 'controlled-video', assetId: 'video-asset' })
    const controller = createTeacherControllerNode({ id: 'controlled-controller' })
    const onUpdateNode = vi.fn(() => true)
    const { rerender } = render(
      <PropertiesTab documentControl={controlFor([image], onUpdateNode)} />,
    )

    expect(screen.getByTestId('controlled-properties-media-gate'))
      .toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('媒体专属设置稍后开放。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '媒体属性暂不可编辑' })).toBeDisabled()
    expect(screen.getByLabelText('名称')).toBeInTheDocument()

    rerender(<PropertiesTab documentControl={controlFor([video], onUpdateNode)} />)
    expect(screen.getByText('媒体专属设置稍后开放。')).toBeInTheDocument()

    rerender(<PropertiesTab documentControl={controlFor([controller], onUpdateNode)} />)
    expect(screen.getByTestId('controlled-properties-controller-gate'))
      .toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('教师控制器专属设置稍后开放。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '教师控制器属性暂不可编辑' }))
      .toBeDisabled()
    expect(onUpdateNode).not.toHaveBeenCalled()
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })

  it('gates empty, multi-selection and global scope without falling back to V8', () => {
    const text = createTextNode({ id: 'selected-text' })
    const shape = createShapeNode('ellipse', { id: 'selected-shape' })
    const { rerender } = render(
      <PropertiesTab documentControl={controlFor([])} />,
    )
    expect(screen.getByTestId('controlled-properties-empty-gate')).toBeInTheDocument()

    rerender(<PropertiesTab documentControl={controlFor([text, shape])} />)
    expect(screen.getByTestId('controlled-properties-multi-gate')).toBeInTheDocument()

    rerender(<PropertiesTab documentControl={{
      ...controlFor([text]),
      editingScope: 'global',
    }} />)
    expect(screen.getByTestId('controlled-properties-global-gate')).toBeInTheDocument()
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })
})
