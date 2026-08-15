import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecentProjectEntry } from '@/shared/ipcTypes'
import { useEditorStore } from '@/renderer/store/editorStore'
import { utf8ByteLength } from '@/renderer/export/exportSize'
import { ExportSizeWarningDialog } from '@/renderer/ui/ExportSizeWarningDialog'
import { TopToolbar, type ExportFormat } from '@/renderer/ui/TopToolbar'

afterEach(cleanup)

beforeEach(() => {
  localStorage.clear()
  useEditorStore.getState().createNewProject()
  useEditorStore.setState({ editorMode: 'simple' })
})

function renderToolbar(
  onExport: (format: ExportFormat) => void,
  busy = false,
  onOpenHealth = vi.fn(),
  options: {
    onSave?: (saveAs?: boolean) => void
    onImportLegacy?: () => void
    recentProjects?: RecentProjectEntry[]
    onOpenRecent?: (path: string) => void
    onPreview?: () => void
    documentControl?: ComponentProps<typeof TopToolbar>['documentControl']
  } = {},
) {
  render(
    <TopToolbar
      busy={busy}
      documentControl={options.documentControl}
      onNew={() => undefined}
      onOpen={() => undefined}
      onImportLegacy={options.onImportLegacy ?? (() => undefined)}
      recentProjects={options.recentProjects ?? []}
      onOpenRecent={options.onOpenRecent ?? (() => undefined)}
      onSave={options.onSave ?? (() => undefined)}
      healthSummary={{ error: 0, warning: 0, info: 0, total: 0, canExport: true }}
      onOpenHealth={onOpenHealth}
      onPreview={options.onPreview ?? (() => undefined)}
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

  it('uses the injected active-document truth without mutating the hidden V8 project', () => {
    const v8ProjectBefore = useEditorStore.getState().project
    const onRename = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    renderToolbar(vi.fn(), false, vi.fn(), {
      documentControl: {
        title: 'V9 标题',
        dirty: true,
        canUndo: false,
        canRedo: true,
        locationLabel: '场景 2 / 4',
        canInspectHealth: false,
        canPreview: false,
        canExport: false,
        onRename,
        onUndo,
        onRedo,
      },
    })

    expect(screen.getByText('V9 标题 *')).toBeInTheDocument()
    expect(screen.getByText('场景 2 / 4')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤销（Ctrl+Z）' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重做（Ctrl+Y / Ctrl+Shift+Z）' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '在独立窗口整课预览' })).toBeDisabled()
    expect(screen.getByLabelText('导出课件')).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByTitle('更多工程操作'))
    expect(screen.getByRole('menuitem', { name: '工程检查暂不可用' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '重做（Ctrl+Y / Ctrl+Shift+Z）' }))
    expect(onRedo).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '重命名课件' }))
    fireEvent.change(screen.getByRole('textbox', { name: '课件名称' }), {
      target: { value: '新 V9 标题' },
    })
    fireEvent.blur(screen.getByRole('textbox', { name: '课件名称' }))
    expect(onRename).toHaveBeenCalledWith('新 V9 标题')
    expect(onUndo).not.toHaveBeenCalled()
    expect(useEditorStore.getState().project).toBe(v8ProjectBefore)
  })

  it('moves Save As, project health, and recent projects into More in simple mode', () => {
    const onOpenHealth = vi.fn()
    const onSave = vi.fn()
    const onImportLegacy = vi.fn()
    const onOpenRecent = vi.fn()
    renderToolbar(vi.fn(), false, onOpenHealth, {
      onSave,
      onImportLegacy,
      onOpenRecent,
      recentProjects: [{
        path: 'C:\\lessons\\rain.h5lesson',
        name: '雨中的苏轼',
        lastOpenedAt: 1,
      }],
    })

    expect(screen.queryByRole('button', { name: '另存为' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('打开最近工程')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: '工程检查：未发现问题',
    })).not.toBeInTheDocument()

    fireEvent.click(screen.getByTitle('更多工程操作'))
    fireEvent.click(screen.getByRole('menuitem', { name: /另存为/ }))
    expect(onSave).toHaveBeenCalledWith(true)

    fireEvent.click(screen.getByTitle('更多工程操作'))
    fireEvent.click(screen.getByRole('menuitem', { name: /导入旧版工程/ }))
    expect(onImportLegacy).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByTitle('更多工程操作'))
    fireEvent.click(screen.getByRole('menuitem', {
      name: '工程检查：未发现问题',
    }))
    expect(onOpenHealth).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByTitle('更多工程操作'))
    fireEvent.click(screen.getByRole('button', { name: /雨中的苏轼/ }))
    expect(onOpenRecent).toHaveBeenCalledWith('C:\\lessons\\rain.h5lesson')
  })

  it('keeps advanced project controls directly visible in professional mode', () => {
    const onImportLegacy = vi.fn()
    act(() => useEditorStore.getState().setEditorMode('professional'))
    renderToolbar(vi.fn(), false, vi.fn(), { onImportLegacy })

    expect(screen.queryByTitle('更多工程操作')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTitle('打开最近工程'))
    fireEvent.click(screen.getByRole('button', { name: /导入旧版工程/ }))
    expect(onImportLegacy).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '另存为' })).toBeInTheDocument()
    expect(screen.getByTitle('打开最近工程')).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: '工程检查：未发现问题',
    })).toBeInTheDocument()
    expect(screen.queryByRole('button', {
      name: '导入可信的 .h5component 组件',
    })).not.toBeInTheDocument()
  })

  it('changes editor density without replacing or mutating the Project document', () => {
    const projectBefore = useEditorStore.getState().project
    renderToolbar(vi.fn())

    fireEvent.click(screen.getByRole('button', { name: '专业' }))
    expect(useEditorStore.getState().editorMode).toBe('professional')
    expect(useEditorStore.getState().project).toBe(projectBefore)

    fireEvent.click(screen.getByRole('button', { name: '简洁' }))
    expect(useEditorStore.getState().editorMode).toBe('simple')
    expect(useEditorStore.getState().project).toBe(projectBefore)
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

  it('keeps available delivery formats usable while disabling only an unsupported format', () => {
    const onExport = vi.fn<(format: ExportFormat) => void>()
    const onPreview = vi.fn()
    renderToolbar(onExport, false, vi.fn(), {
      onPreview,
      documentControl: {
        title: '当前课件',
        dirty: false,
        canUndo: false,
        canRedo: false,
        locationLabel: '幻灯片 1 / 1',
        canInspectHealth: false,
        canPreview: true,
        canExport: true,
        unavailableExports: { pdf: '当前课件暂不能导出 PDF' },
        onRename: vi.fn(),
        onUndo: vi.fn(),
        onRedo: vi.fn(),
      },
    })

    fireEvent.click(screen.getByRole('button', { name: '在独立窗口整课预览' }))
    expect(onPreview).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByLabelText('导出课件'))
    const html = screen.getByRole('menuitem', { name: /单 HTML/ })
    const pdf = screen.getByRole('menuitem', { name: /^PDF/ })
    expect(html).toBeEnabled()
    expect(pdf).toBeDisabled()
    expect(pdf).toHaveAttribute('title', '当前课件暂不能导出 PDF')
    fireEvent.click(html)
    expect(onExport).toHaveBeenCalledWith('single-html')
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
