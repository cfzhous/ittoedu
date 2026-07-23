import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore } from '@/renderer/store/editorStore'
import { utf8ByteLength } from '@/renderer/export/exportSize'
import { ExportSizeWarningDialog } from '@/renderer/ui/ExportSizeWarningDialog'
import { TopToolbar, type ExportFormat } from '@/renderer/ui/TopToolbar'

afterEach(cleanup)

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

function renderToolbar(
  onExport: (format: ExportFormat) => void,
  busy = false,
  onOpenHealth = vi.fn(),
) {
  render(
    <TopToolbar
      busy={busy}
      onNew={() => undefined}
      onOpen={() => undefined}
      recentProjects={[]}
      onOpenRecent={() => undefined}
      onSave={() => undefined}
      onImportComponent={() => undefined}
      healthSummary={{ error: 0, warning: 0, info: 0, total: 0, canExport: true }}
      onOpenHealth={onOpenHealth}
      onPreview={() => undefined}
      onExport={onExport}
    />,
  )
}

describe('unified export menu', () => {
  it('renames the project inline and keeps the change undoable', () => {
    renderToolbar(vi.fn())
    fireEvent.click(screen.getByRole('button', { name: '重命名课件' }))
    const title = screen.getByRole('textbox', { name: '课件名称' })
    fireEvent.change(title, { target: { value: '雨中的苏轼' } })
    fireEvent.blur(title)
    expect(useEditorStore.getState().project.title).toBe('雨中的苏轼')
    expect(useEditorStore.getState().dirty).toBe(true)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().project.title).toBe('未命名课件')
  })

  it('opens project health from the toolbar', () => {
    const onOpenHealth = vi.fn()
    renderToolbar(vi.fn(), false, onOpenHealth)
    fireEvent.click(screen.getByRole('button', { name: '工程检查：未发现问题' }))
    expect(onOpenHealth).toHaveBeenCalledOnce()
  })

  it('offers all four formats from one export control', () => {
    const onExport = vi.fn<(format: ExportFormat) => void>()
    renderToolbar(onExport)

    fireEvent.click(screen.getByLabelText('导出课件'))
    expect(screen.getByRole('menuitem', { name: /单 HTML/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /网页包/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /PowerPoint（PPTX）/ })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^PDF/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: /网页包/ }))
    expect(onExport).toHaveBeenCalledWith('web-package')
  })

  it('does not open while the editor is busy', () => {
    renderToolbar(vi.fn(), true)
    const trigger = screen.getByLabelText('导出课件')
    fireEvent.click(trigger)
    expect(trigger.closest('details')).not.toHaveAttribute('open')
  })
})

describe('single HTML size warning', () => {
  it('measures the real UTF-8 size without relying on JavaScript string length', () => {
    expect(utf8ByteLength('HTML课件😀')).toBe(
      new TextEncoder().encode('HTML课件😀').byteLength,
    )
  })

  it('recommends the web package but still allows a warning-sized HTML', () => {
    const onPackage = vi.fn()
    const onContinue = vi.fn()
    render(
      <ExportSizeWarningDialog
        open
        byteLength={72 * 1024 * 1024}
        hardLimitBytes={256 * 1024 * 1024}
        onCancel={() => undefined}
        onExportWebPackage={onPackage}
        onContinueSingleHtml={onContinue}
      />,
    )

    expect(screen.getByText(/72\.0 MB/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /导出网页包/ }))
    expect(onPackage).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: /仍导出单 HTML/ }))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('blocks single HTML when it exceeds the hard saving limit', () => {
    render(
      <ExportSizeWarningDialog
        open
        byteLength={300 * 1024 * 1024}
        hardLimitBytes={256 * 1024 * 1024}
        onCancel={() => undefined}
        onExportWebPackage={() => undefined}
        onContinueSingleHtml={() => undefined}
      />,
    )

    expect(screen.getByText(/超过单 HTML/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /仍导出单 HTML/ })).not.toBeInTheDocument()
  })
})
