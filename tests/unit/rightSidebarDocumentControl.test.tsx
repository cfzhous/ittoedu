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
    expect(screen.getByLabelText('编辑面板')).toHaveAttribute('aria-disabled', 'true')
    expect(useEditorStore.getState().project).toBe(projectBefore)
  })
})
