import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../../src/renderer/ui/AppErrorBoundary'

function Broken(): never {
  throw new Error('测试界面故障')
}

describe('AppErrorBoundary', () => {
  it('shows a recoverable error surface instead of a blank renderer', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <AppErrorBoundary>
        <Broken />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('编辑器界面发生错误')
    expect(screen.getByRole('alert')).toHaveTextContent('测试界面故障')
    expect(screen.getByRole('button', { name: '重新载入编辑器' })).toBeVisible()
    spy.mockRestore()
  })
})
