import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const storeAccess = vi.hoisted(() => ({
  hook: vi.fn(() => {
    throw new Error('controlled toolbar must not read the legacy Store hook')
  }),
  getState: vi.fn(() => {
    throw new Error('controlled toolbar must not read legacy Store state')
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
  TopToolbar,
  type TopToolbarDocumentControl,
} from '@/renderer/ui/TopToolbar'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderControlledToolbar(
  control: TopToolbarDocumentControl,
  onOpenHealth = vi.fn(),
) {
  return render(
    <TopToolbar
      busy={false}
      documentControl={control}
      onNew={vi.fn()}
      onOpen={vi.fn()}
      onImportLegacy={vi.fn()}
      recentProjects={[]}
      onOpenRecent={vi.fn()}
      onSave={vi.fn()}
      healthSummary={{
        error: 0,
        warning: 0,
        info: 0,
        total: 0,
        canExport: true,
      }}
      onOpenHealth={onOpenHealth}
      onPreview={vi.fn()}
      onExport={vi.fn()}
    />,
  )
}

function documentControl(
  overrides: Partial<TopToolbarDocumentControl> = {},
): TopToolbarDocumentControl {
  return {
    title: '当前课件',
    dirty: false,
    canUndo: true,
    canRedo: false,
    locationLabel: '幻灯片 1 / 2',
    editorMode: 'simple',
    healthChecked: false,
    canInspectHealth: true,
    canPreview: true,
    canExport: true,
    onRename: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onSetEditorMode: vi.fn(),
    ...overrides,
  }
}

describe('TopToolbar document control', () => {
  it('shows an honest not-yet-checked state and delegates every controlled action', () => {
    const onOpenHealth = vi.fn()
    const control = documentControl()

    renderControlledToolbar(control, onOpenHealth)

    fireEvent.click(screen.getByRole('button', { name: '专业' }))
    expect(control.onSetEditorMode).toHaveBeenCalledWith('professional')

    fireEvent.click(screen.getByRole('button', { name: '撤销（Ctrl+Z）' }))
    expect(control.onUndo).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '重命名课件' }))
    fireEvent.change(screen.getByRole('textbox', { name: '课件名称' }), {
      target: { value: '受控标题' },
    })
    fireEvent.blur(screen.getByRole('textbox', { name: '课件名称' }))
    expect(control.onRename).toHaveBeenCalledWith('受控标题')

    fireEvent.click(screen.getByTitle('更多工程操作'))
    const health = screen.getByRole('menuitem', { name: '工程检查' })
    expect(health).toBeEnabled()
    expect(screen.getByText('点击检查')).toBeInTheDocument()
    expect(screen.queryByText('未发现问题')).not.toBeInTheDocument()
    fireEvent.click(health)
    expect(onOpenHealth).toHaveBeenCalledOnce()

    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })

  it('reports success only after a check and keeps unavailable checks disabled', () => {
    const checked = documentControl({ healthChecked: true })
    const { rerender } = renderControlledToolbar(checked)

    fireEvent.click(screen.getByTitle('更多工程操作'))
    expect(screen.getByRole('menuitem', {
      name: '工程检查：未发现问题',
    })).toBeEnabled()
    expect(screen.getByText('未发现问题')).toBeInTheDocument()

    const unavailable = documentControl({
      healthChecked: false,
      canInspectHealth: false,
    })
    rerender(
      <TopToolbar
        busy={false}
        documentControl={unavailable}
        onNew={vi.fn()}
        onOpen={vi.fn()}
        onImportLegacy={vi.fn()}
        recentProjects={[]}
        onOpenRecent={vi.fn()}
        onSave={vi.fn()}
        healthSummary={{
          error: 0,
          warning: 0,
          info: 0,
          total: 0,
          canExport: true,
        }}
        onOpenHealth={vi.fn()}
        onPreview={vi.fn()}
        onExport={vi.fn()}
      />,
    )

    const more = screen.getByTitle('更多工程操作')
    if (!more.closest('details')?.hasAttribute('open')) fireEvent.click(more)
    expect(screen.getByRole('menuitem', {
      name: '工程检查暂不可用',
    })).toBeDisabled()
    expect(storeAccess.hook).not.toHaveBeenCalled()
    expect(storeAccess.getState).not.toHaveBeenCalled()
  })
})
