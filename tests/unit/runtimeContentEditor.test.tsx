import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RuntimeDocument } from '../../src/shared/runtimeTypes'
import { RuntimeContentEditor } from '../../src/renderer/ui/RuntimeContentEditor'

const runtime: RuntimeDocument = {
  runtimeApiVersion: 2,
  enabled: true,
  renderMode: 'hybrid',
  source:
    'CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})',
  content: {
    values: {
      title: '原始标题',
      'feedback.success': '回答正确',
    },
    metadata: {
      title: { label: '主标题', maxLength: 20 },
      'feedback.success': {
        label: '成功反馈',
        description: '答对后显示',
        multiline: true,
      },
    },
  },
  assets: {},
}

describe('RuntimeContentEditor', () => {
  it('renders every registered visible text and updates only its content value', () => {
    const onChange = vi.fn()
    render(<RuntimeContentEditor runtime={runtime} onChange={onChange} />)

    expect(screen.getByLabelText('主标题')).toHaveValue('原始标题')
    expect(screen.getByLabelText('成功反馈')).toHaveValue('回答正确')
    expect(screen.getByText('答对后显示')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('成功反馈'), {
      target: { value: '请继续保持' },
    })

    const updated = onChange.mock.calls[0]?.[0] as RuntimeDocument
    expect(updated.content.values).toEqual({
      title: '原始标题',
      'feedback.success': '请继续保持',
    })
    expect(updated.source).toBe(runtime.source)
  })

  it('shows a clear empty state when the runtime owns no authored text', () => {
    render(
      <RuntimeContentEditor
        runtime={{
          ...runtime,
          content: { values: {} },
        }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('runtime-content-empty')).toBeInTheDocument()
  })
})
