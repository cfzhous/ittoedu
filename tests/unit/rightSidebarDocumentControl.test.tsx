import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTextNode } from '@/renderer/project/createProject'
import { useEditorStore } from '@/renderer/store/editorStore'
import {
  RightSidebar,
  type RightSidebarDocumentControl,
} from '@/renderer/ui/RightSidebar'

beforeEach(() => {
  localStorage.clear()
  useEditorStore.getState().createNewProject()
  useEditorStore.setState({ editorMode: 'simple', activeTab: 'elements' })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RightSidebar document control', () => {
  it('enables controlled tabs and gates each unsupported original tab independently', () => {
    const projectBefore = useEditorStore.getState().project
    const legacyAddImage = vi.fn()
    const addText = vi.fn()
    const setVisible = vi.fn()
    const node = createTextNode({ id: 'sidebar-text', name: '课题' })
    const documentControl: RightSidebarDocumentControl = {
      elements: {
        editingScope: 'scene',
        editorMode: 'simple',
        mediaUnavailableReason: '媒体库稍后开放',
        controllerUnavailableReason: '控制器设置稍后开放',
        onAddText: addText,
        onAddFormula: vi.fn(),
        onAddShape: vi.fn(),
      },
      layers: {
        editingScope: 'scene',
        contextKey: 'sidebar-scene-context',
        scopeLabel: '场景一',
        nodes: [node],
        selectedNodeIds: [],
        onSelectNode: vi.fn(),
        onDeleteNode: vi.fn(),
        onDuplicateNode: vi.fn(),
        onRenameNode: vi.fn(),
        onSetNodeVisible: setVisible,
        onSetNodeLocked: vi.fn(),
        onReorderNodes: vi.fn(),
      },
      unavailableReasons: {
        properties: '属性编辑尚未接入',
      },
    }

    render(
      <RightSidebar
        documentControl={documentControl}
        documentEditingUnavailableReason="旧的整栏禁用不应覆盖窄端口"
        onAddImage={legacyAddImage}
        onReplaceImage={vi.fn()}
        onAddVideo={vi.fn()}
        onImportAudio={vi.fn()}
        onImportVideo={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('编辑面板')).not.toHaveAttribute('aria-disabled')
    fireEvent.click(screen.getByTestId('add-text'))
    expect(addText).toHaveBeenCalledTimes(1)
    expect(legacyAddImage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: '图层' }))
    expect(screen.getByTestId('nodes-tab')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '隐藏“课题”' }))
    expect(setVisible).toHaveBeenCalledWith(node.id, false)
    expect(screen.getByLabelText('编辑面板')).not.toHaveAttribute('aria-disabled')

    fireEvent.click(screen.getByRole('tab', { name: '属性' }))
    expect(screen.getByText('属性面板暂不可用')).toBeInTheDocument()
    expect(screen.getByText('属性编辑尚未接入')).toBeInTheDocument()
    expect(screen.getByLabelText('编辑面板')).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('status')).toHaveAttribute('aria-disabled', 'true')
    expect(useEditorStore.getState().project).toBe(projectBefore)
  })

  it('keeps available tabs operable while the active tab shows a capability gate', () => {
    const documentControl: RightSidebarDocumentControl = {
      properties: {
        editingScope: 'scene',
        editorMode: 'simple',
        selectedNodes: [],
        target: null,
        scopeLabel: '基础场景',
        scopeDescription: '修改基础元素会影响继承它的命名状态。',
        overrideActive: false,
        textContentUnavailableReason: '文字内容暂不可编辑。',
        richTextUnavailableReason: '局部文字格式暂不可编辑。',
        mediaUnavailableReason: '媒体专属设置暂不可编辑。',
        controllerUnavailableReason: '教师控制器设置暂不可编辑。',
        onUpdateNode: vi.fn(() => true),
        onClearOverride: vi.fn(() => true),
      },
      unavailableReasons: {
        elements: '元素面板暂未接入',
      },
    }
    render(
      <RightSidebar
        documentControl={documentControl}
        onAddImage={vi.fn()}
        onReplaceImage={vi.fn()}
        onAddVideo={vi.fn()}
        onImportAudio={vi.fn()}
        onImportVideo={vi.fn()}
      />,
    )

    expect(screen.getByText('元素面板暂不可用')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-disabled', 'true')
    const propertiesTab = screen.getByRole('tab', { name: '属性' })
    expect(propertiesTab).toBeEnabled()

    fireEvent.click(propertiesTab)

    expect(useEditorStore.getState().activeTab).toBe('properties')
    expect(screen.getByTestId('properties-tab')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('mounts the controlled properties panel without invoking legacy document actions', () => {
    useEditorStore.setState({ activeTab: 'properties' })
    const projectBefore = useEditorStore.getState().project
    const historyBefore = useEditorStore.getState().history
    const node = createTextNode({
      id: 'property-text',
      name: '属性标题',
      style: { overflow: 'fixed' },
    })
    const onUpdateNode = vi.fn(() => true)
    const legacyReplaceImage = vi.fn()
    const target = {
      sessionId: 'session-properties',
      locationId: 'location-properties',
      stateId: null,
      editingScope: 'scene' as const,
      layerItemId: node.id,
    }
    const documentControl: RightSidebarDocumentControl = {
      properties: {
        editingScope: 'scene',
        editorMode: 'simple',
        selectedNodes: [node],
        target,
        scopeLabel: '基础场景',
        scopeDescription: '修改基础元素会影响继承它的命名状态。',
        overrideActive: false,
        textContentUnavailableReason: '文字内容暂不可编辑。',
        richTextUnavailableReason: '局部文字格式暂不可编辑。',
        mediaUnavailableReason: '媒体专属设置暂不可编辑。',
        controllerUnavailableReason: '教师控制器专属设置暂不可编辑。',
        onUpdateNode,
        onClearOverride: vi.fn(() => true),
      },
    }

    render(
      <RightSidebar
        documentControl={documentControl}
        onAddImage={vi.fn()}
        onReplaceImage={legacyReplaceImage}
        onAddVideo={vi.fn()}
        onImportAudio={vi.fn()}
        onImportVideo={vi.fn()}
      />,
    )

    expect(screen.getByTestId('properties-tab')).toBeInTheDocument()
    expect(screen.getByLabelText('编辑面板')).not.toHaveAttribute('aria-disabled')
    const name = screen.getByLabelText('名称')
    fireEvent.change(name, { target: { value: '更新后的标题' } })
    fireEvent.blur(name)
    expect(onUpdateNode).toHaveBeenCalledWith(target, { name: '更新后的标题' })
    expect(legacyReplaceImage).not.toHaveBeenCalled()
    expect(useEditorStore.getState().project).toBe(projectBefore)
    expect(useEditorStore.getState().history).toBe(historyBefore)
  })
})
