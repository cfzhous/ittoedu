import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '@/renderer/store/editorStore'
import { RightSidebar } from '@/renderer/ui/RightSidebar'

beforeEach(() => {
  localStorage.clear()
  useEditorStore.getState().createNewProject()
  useEditorStore.setState({
    editorMode: 'simple',
    activeTab: 'elements',
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('right sidebar document capability gate', () => {
  it('keeps the original tabs without mounting controls for an unavailable document backend', () => {
    const projectBefore = useEditorStore.getState().project
    render(
      <RightSidebar
        documentEditingUnavailableReason="当前工程的编辑命令尚未接入"
        onAddImage={vi.fn()}
        onReplaceImage={vi.fn()}
        onAddVideo={vi.fn()}
        onImportAudio={vi.fn()}
        onImportVideo={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('编辑面板')).not.toHaveAttribute('aria-disabled')
    expect(screen.getByRole('status')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('元素面板暂不可用')).toBeInTheDocument()
    expect(screen.getByText('当前工程的编辑命令尚未接入')).toBeInTheDocument()
    expect(screen.queryByTestId('add-text')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '图层' }))
    expect(screen.getByText('图层面板暂不可用')).toBeInTheDocument()
    expect(useEditorStore.getState().project).toBe(projectBefore)
  })
})
