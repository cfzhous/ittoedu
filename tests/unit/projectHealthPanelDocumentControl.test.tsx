import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const storeAccess = vi.hoisted(() => ({
  hook: vi.fn(() => {
    throw new Error('controlled health panel must not read the legacy Store hook')
  }),
  getState: vi.fn(() => {
    throw new Error('controlled health panel must not read legacy Store state')
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
  ProjectHealthPanel,
  type ProjectHealthPanelDocumentControl,
} from '@/renderer/ui/ProjectHealthPanel'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ProjectHealthPanel document control', () => {
  it('renders an empty controlled result without consulting the legacy document', () => {
    const onExportDiagnostics = vi.fn()
    const control: ProjectHealthPanelDocumentControl = {
      summary: { error: 0, warning: 0, info: 0, canExport: true },
      diagnostics: [],
      description: '检查当前课件的引用与交付设置。',
      footer: '当前没有阻断交付的问题。',
      onExportDiagnostics,
    }

    render(
      <ProjectHealthPanel
        open
        onClose={vi.fn()}
        documentControl={control}
      />,
    )

    expect(screen.getByText(control.description)).toBeInTheDocument()
    expect(screen.getByText('未发现工程问题')).toBeInTheDocument()
    expect(screen.getByText(control.footer)).toBeInTheDocument()
    expect(screen.queryByText(/信息释放/)).not.toBeInTheDocument()
    expect(screen.queryByText(/视觉密度/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '导出诊断报告' }))
    expect(onExportDiagnostics).toHaveBeenCalledTimes(1)
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })

  it('renders errors and delegates locating through the controlled port only', () => {
    const onLocate = vi.fn()
    const diagnostic = {
      severity: 'error' as const,
      message: '开场场景引用了已删除的素材。',
      code: '素材引用',
    }
    const control: ProjectHealthPanelDocumentControl = {
      summary: { error: 1, warning: 0, info: 0, canExport: false },
      diagnostics: [diagnostic],
      description: '检查当前课件的引用与交付设置。',
      footer: '请先处理错误，再导出成品。',
      onLocate,
    }

    render(
      <ProjectHealthPanel
        open
        onClose={vi.fn()}
        documentControl={control}
      />,
    )

    expect(screen.getByText(/1 个错误/)).toBeInTheDocument()
    expect(screen.getByText(diagnostic.message)).toBeInTheDocument()
    expect(screen.getByText(diagnostic.code)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '定位' }))
    expect(onLocate).toHaveBeenCalledWith(diagnostic, 0)
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })
})
