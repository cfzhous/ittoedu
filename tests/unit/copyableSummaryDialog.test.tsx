import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyableSummaryDialog } from '@/renderer/ui/CopyableSummaryDialog'

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

afterEach(() => {
  cleanup()
  if (originalClipboardDescriptor) {
    Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor)
  } else {
    Reflect.deleteProperty(navigator, 'clipboard')
  }
})

describe('CopyableSummaryDialog', () => {
  it('keeps the complete batch summary visible and copies it without truncation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const summary = Array.from(
      { length: 24 },
      (_, index) => `第 ${index + 1} 项：组件-${index + 1}.h5component 校验失败（哈希冲突）`,
    ).join('\n')

    render(
      <CopyableSummaryDialog
        open
        title="外部组件导入结果"
        summary={summary}
        onClose={vi.fn()}
      />,
    )

    const content = screen.getByRole('textbox', { name: '完整批次摘要' })
    expect(content).toHaveValue(summary)
    expect(content).toHaveAttribute('readonly')

    fireEvent.click(screen.getByRole('button', { name: '复制完整摘要' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(summary))
    expect(screen.getByRole('button', { name: '已复制' })).toBeInTheDocument()
  })

  it('closes through both the explicit action and Escape', () => {
    const onClose = vi.fn()
    render(
      <CopyableSummaryDialog
        open
        title="批次摘要"
        summary="完整内容"
        onClose={onClose}
      />,
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
