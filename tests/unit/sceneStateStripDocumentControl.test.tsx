import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const legacyV8Sentinels = vi.hoisted(() => ({
  ensurePresentation: vi.fn(() => {
    throw new Error('V9 SceneStateStrip leaked into ensureScenePresentation')
  }),
  selectActiveScene: vi.fn(() => {
    throw new Error('V9 SceneStateStrip leaked into the V8 scene selector')
  }),
  useStore: vi.fn(() => {
    throw new Error('V9 SceneStateStrip leaked into useEditorStore')
  }),
}))

vi.mock('@/shared/presentation', () => ({
  ensureScenePresentation: legacyV8Sentinels.ensurePresentation,
}))

vi.mock('@/renderer/store/editorStore', () => ({
  selectActiveScene: legacyV8Sentinels.selectActiveScene,
  useEditorStore: legacyV8Sentinels.useStore,
}))

import {
  SceneStateStrip,
  type SceneStateStripDocumentControl,
} from '@/renderer/ui/SceneStateStrip'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SceneStateStrip V9 document control', () => {
  it('renders and operates exclusively through the narrow port', () => {
    const callbacks = {
      onSetEditorMode: vi.fn(),
      onActivateState: vi.fn(),
      onAddState: vi.fn(),
      onDuplicateState: vi.fn(),
      onRenameState: vi.fn(),
      onSetInitialState: vi.fn(),
      onSetThumbnailState: vi.fn(),
      onClearState: vi.fn(),
      onDeleteState: vi.fn(),
    }
    const professionalControl: SceneStateStripDocumentControl = {
      editingScope: 'scene',
      editorMode: 'professional',
      activeStateId: 'v9_state_branch',
      states: [{
        id: 'v9_state_initial',
        name: '初始',
        overrideCount: 0,
        incomingCount: 0,
        scopedCount: 0,
        initial: true,
        thumbnail: true,
      }, {
        id: 'v9_state_branch',
        name: '分支',
        overrideCount: 3,
        incomingCount: 2,
        scopedCount: 1,
        initial: false,
        thumbnail: false,
      }],
      ...callbacks,
    }

    const { rerender } = render(
      <SceneStateStrip documentControl={professionalControl} />,
    )

    expect(screen.getByText('正在编辑“分支”的覆盖值')).toBeInTheDocument()
    expect(screen.getByText('3 项覆盖')).toBeInTheDocument()
    expect(screen.getByText('2 个入口 · 1 条状态映射')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: '基础场景，所有命名状态的继承源',
    }))
    expect(callbacks.onActivateState).toHaveBeenCalledWith(null)

    fireEvent.click(screen.getByRole('button', { name: '新建场景状态' }))
    expect(callbacks.onAddState).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '复制当前状态' }))
    expect(callbacks.onDuplicateState).toHaveBeenCalledWith('v9_state_branch')

    fireEvent.click(screen.getByRole('button', { name: '重命名当前状态' }))
    const input = screen.getByRole('textbox', { name: '状态名称' })
    fireEvent.change(input, { target: { value: '新分支' } })
    fireEvent.blur(input)
    expect(callbacks.onRenameState).toHaveBeenCalledWith('v9_state_branch', '新分支')

    fireEvent.click(screen.getByRole('button', {
      name: '将当前状态设为运行初始状态',
    }))
    expect(callbacks.onSetInitialState).toHaveBeenCalledWith('v9_state_branch')
    fireEvent.click(screen.getByRole('button', {
      name: '将当前状态设为场景缩略图状态',
    }))
    expect(callbacks.onSetThumbnailState).toHaveBeenCalledWith('v9_state_branch')

    fireEvent.click(screen.getByRole('button', {
      name: '清除当前状态的全部覆盖',
    }))
    fireEvent.click(screen.getByRole('button', { name: '清除覆盖' }))
    expect(callbacks.onClearState).toHaveBeenCalledWith('v9_state_branch')

    fireEvent.click(screen.getByRole('button', { name: '删除当前状态' }))
    fireEvent.click(screen.getByRole('button', { name: '删除状态' }))
    expect(callbacks.onDeleteState).toHaveBeenCalledWith('v9_state_branch')

    rerender(
      <SceneStateStrip
        documentControl={{ ...professionalControl, editorMode: 'simple' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '管理状态' }))
    expect(callbacks.onSetEditorMode).toHaveBeenCalledWith('professional')

    expect(legacyV8Sentinels.useStore).not.toHaveBeenCalled()
    expect(legacyV8Sentinels.selectActiveScene).not.toHaveBeenCalled()
    expect(legacyV8Sentinels.ensurePresentation).not.toHaveBeenCalled()
  })
})
