import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const legacySentinels = vi.hoisted(() => ({
  createGame: vi.fn(() => {
    throw new Error('Unavailable workspace mounted the legacy canvas')
  }),
  loadPlayerBundle: vi.fn(() => {
    throw new Error('Unavailable workspace loaded the Player')
  }),
  useStore: vi.fn(() => {
    throw new Error('Unavailable workspace read the legacy Store')
  }),
}))

vi.mock('@/renderer/phaser/createEditorGame', () => ({
  createEditorGame: legacySentinels.createGame,
}))

vi.mock('@/renderer/export/loadPlayerBundle', () => ({
  loadPlayerBundle: legacySentinels.loadPlayerBundle,
}))

vi.mock('@/renderer/store/editorStore', () => ({
  selectActiveScene: vi.fn(),
  selectEditingNodes: vi.fn(),
  selectSelectedNode: vi.fn(),
  useEditorStore: legacySentinels.useStore,
}))

import { Workspace } from '@/renderer/ui/Workspace'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Workspace course-location gate', () => {
  it('keeps unavailable content inside the original shell without mounting canvas or Player paths', () => {
    render(<Workspace
      courseLocationUnavailableReason="此类内容的画布编辑功能尚未开放。"
      onAddImage={vi.fn()}
      onAddVideo={vi.fn()}
      onSelectImageAsset={vi.fn(async () => null)}
    />)

    const gate = screen.getByTestId('workspace-course-location-gate')
    expect(gate).toHaveAttribute('role', 'status')
    expect(gate).not.toHaveClass('runtime-preview-loading')
    expect(gate).toHaveTextContent('此类内容的画布编辑功能尚未开放。')
    expect(gate.closest('main')).toHaveClass('workspace', 'workspace--edit')
    expect(screen.queryByTestId('canvas-stage')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '画布模式' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '画布视图' })).not.toBeInTheDocument()
    expect(legacySentinels.useStore).not.toHaveBeenCalled()
    expect(legacySentinels.createGame).not.toHaveBeenCalled()
    expect(legacySentinels.loadPlayerBundle).not.toHaveBeenCalled()
  })
})
