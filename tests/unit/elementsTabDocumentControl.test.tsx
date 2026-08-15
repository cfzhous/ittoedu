import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '@/renderer/store/editorStore'
import {
  ElementsTab,
  type ElementsTabDocumentControl,
} from '@/renderer/ui/ElementsTab'

beforeEach(() => {
  useEditorStore.getState().createNewProject()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ElementsTab document control', () => {
  it('uses only injected native callbacks and exposes honest local media gates', () => {
    const projectBefore = useEditorStore.getState().project
    const historyBefore = useEditorStore.getState().history
    const onAddText = vi.fn()
    const onAddFormula = vi.fn()
    const onAddShape = vi.fn()
    const legacyAddImage = vi.fn()
    const legacyAddVideo = vi.fn()
    const legacyImportAudio = vi.fn()
    const documentControl: ElementsTabDocumentControl = {
      editingScope: 'scene',
      editorMode: 'simple',
      mediaUnavailableReason: '媒体添加尚未开放',
      controllerUnavailableReason: '控制器编辑尚未开放',
      onAddText,
      onAddFormula,
      onAddShape,
    }

    render(
      <ElementsTab
        documentControl={documentControl}
        onAddImage={legacyAddImage}
        onAddVideo={legacyAddVideo}
        onImportAudio={legacyImportAudio}
      />,
    )

    fireEvent.click(screen.getByTestId('add-text'))
    fireEvent.click(screen.getByTestId('add-formula'))
    fireEvent.click(screen.getByRole('button', { name: '添加矩形' }))

    expect(onAddText).toHaveBeenCalledTimes(1)
    expect(onAddFormula).toHaveBeenCalledTimes(1)
    expect(onAddShape).toHaveBeenCalledWith('rectangle')
    expect(screen.getByTestId('add-image')).toBeDisabled()
    expect(screen.getByTestId('add-video')).toBeDisabled()
    expect(screen.getByTestId('import-audio')).toBeDisabled()
    expect(screen.getByTitle('单击添加到画布')).toBeInTheDocument()
    expect(screen.getByText('媒体添加尚未开放')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '媒体' }))
    expect(screen.queryByTestId('media-tab')).not.toBeInTheDocument()
    expect(screen.getByText('媒体添加尚未开放')).toBeInTheDocument()

    expect(legacyAddImage).not.toHaveBeenCalled()
    expect(legacyAddVideo).not.toHaveBeenCalled()
    expect(legacyImportAudio).not.toHaveBeenCalled()
    expect(useEditorStore.getState().project).toBe(projectBefore)
    expect(useEditorStore.getState().history).toBe(historyBefore)
  })

  it('keeps the original professional controls category with a local controller gate', () => {
    render(
      <ElementsTab
        documentControl={{
          editingScope: 'global',
          editorMode: 'professional',
          mediaUnavailableReason: '媒体添加尚未开放',
          controllerUnavailableReason: '控制器编辑尚未开放',
          onAddText: vi.fn(),
          onAddFormula: vi.fn(),
          onAddShape: vi.fn(),
        }}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: '控制与全局' }))
    expect(screen.getByTestId('add-teacher-controller')).toBeDisabled()
    expect(screen.getByText('控制器编辑尚未开放')).toBeInTheDocument()
    expect(screen.getByTestId('global-elements-notice')).toBeInTheDocument()
  })
})
