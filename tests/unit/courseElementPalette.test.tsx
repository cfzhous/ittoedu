import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CourseElementPalette,
  type CourseElementPaletteAction,
} from '@/renderer/course/CourseElementPalette'
import { FLOW_BLOCK_TYPE_ORDER } from '@/renderer/course/flow/flowBlockTerminology'

afterEach(cleanup)

describe('CourseElementPalette', () => {
  it('shows only real Slide authoring entries and emits structured actions', () => {
    const onAction = vi.fn<(action: CourseElementPaletteAction) => void>()
    render(<CourseElementPalette surfaceType="slide" onAction={onAction} />)

    expect(screen.getByRole('button', { name: '添加文字' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加公式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加图形' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加图片' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加视频' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加教师控制器' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加音频' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加表格' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加文字' }))
    fireEvent.click(screen.getByRole('button', { name: '添加视频' }))
    expect(onAction).toHaveBeenNthCalledWith(1, { kind: 'native', element: 'text' })
    expect(onAction).toHaveBeenNthCalledWith(2, { kind: 'media', mediaKind: 'video' })
  })

  it('在全课程已有教师控制器时明确显示已添加并禁止重复添加', () => {
    render(
      <CourseElementPalette
        surfaceType="flow"
        teacherControllerPresent
        onAction={vi.fn()}
      />,
    )
    const controller = screen.getByRole('button', { name: '教师控制器已添加' })
    expect(controller).toBeDisabled()
    expect(controller).toHaveTextContent('已添加到全课程')
  })

  it('uses the same supported canvas entries for Spatial without exposing protocol names', () => {
    const view = render(<CourseElementPalette surfaceType="spatial-2d" onAction={vi.fn()} />)
    expect(screen.getByRole('button', { name: '添加文字' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加图片' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加视频' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '添加音频' })).not.toBeInTheDocument()
    expect(view.container.textContent).not.toMatch(/spatial|slide|native|mediaKind/u)
  })

  it('covers all twelve creatable Flow block types through the one action callback', () => {
    const actions: CourseElementPaletteAction[] = []
    render(
      <CourseElementPalette
        surfaceType="flow"
        components={[{ packageId: 'number-line', version: '1.0.0', name: '可交互数轴' }]}
        onAction={(action) => actions.push(action)}
      />,
    )

    const buttons = [
      '添加标题',
      '添加正文',
      '添加引用',
      '添加列表',
      '添加提示',
      '添加表格',
      '添加公式',
      '添加代码',
      '添加分节',
      '添加分隔线',
      '添加图片',
      '添加互动组件：可交互数轴',
    ]
    buttons.forEach((name) => fireEvent.click(screen.getByRole('button', { name })))
    const blockTypes = new Set(actions.flatMap((action) => {
      if (action.kind === 'flow-block') return [action.blockType]
      if (action.kind === 'component') return ['component' as const]
      return []
    }))
    expect(blockTypes).toEqual(new Set(FLOW_BLOCK_TYPE_ORDER))
    expect(screen.getByRole('button', { name: '添加音频' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加视频' })).toBeInTheDocument()
    expect(actions.every((action) => action.kind === 'flow-block' || action.kind === 'component')).toBe(true)
  })

  it('lists imported components by teacher names without revealing package ids or versions', () => {
    const onAction = vi.fn<(action: CourseElementPaletteAction) => void>()
    const view = render(
      <CourseElementPalette
        surfaceType="slide"
        onAction={onAction}
        components={[
          {
            packageId: 'internal.number-line',
            version: '2.3.1',
            name: '可交互数轴',
            description: '拖动点观察数值变化',
          },
          {
            packageId: 'internal.unsupported',
            version: '1.0.0',
            name: '暂不可用组件',
            disabled: true,
            disabledReason: '不支持当前内容',
          },
        ]}
      />,
    )
    const group = screen.getByRole('region', { name: '已导入的互动组件' })
    expect(within(group).getByText('可交互数轴')).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: '添加互动组件：暂不可用组件' })).toBeDisabled()
    expect(view.container.textContent).not.toContain('internal.number-line')
    expect(view.container.textContent).not.toContain('2.3.1')

    fireEvent.click(within(group).getByRole('button', { name: '添加互动组件：可交互数轴' }))
    expect(onAction).toHaveBeenCalledWith({
      kind: 'component',
      packageId: 'internal.number-line',
      version: '2.3.1',
    })
  })

  it('disables every action without hiding the palette structure', () => {
    render(
      <CourseElementPalette
        surfaceType="flow"
        disabled
        onAction={vi.fn()}
        components={[{ packageId: 'pkg', version: '1', name: '函数实验器' }]}
      />,
    )
    expect(screen.getByRole('heading', { name: '内容结构' })).toBeInTheDocument()
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true)
  })
})
