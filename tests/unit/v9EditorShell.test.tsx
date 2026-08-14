import { useState, type ComponentProps } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  V9EditorShell,
  type V9EditorInspectorPanels,
  type V9EditorMode,
  type V9EditorToolbarGroups,
  type V9InspectorTabId,
} from '../../src/renderer/course/editor-shell/V9EditorShell'

const noop = () => undefined

afterEach(cleanup)

function toolbar(overrides?: Partial<V9EditorToolbarGroups>): V9EditorToolbarGroups {
  return {
    file: [{ id: 'save', label: '保存', onSelect: noop }],
    history: [{ id: 'undo', label: '撤销', onSelect: noop }],
    session: [{ id: 'run', label: '试运行', onSelect: noop }],
    output: [{ id: 'preview', label: '预览', onSelect: noop }],
    ...overrides,
  }
}

const panels: V9EditorInspectorPanels = {
  elements: <div>元素面板内容</div>,
  layers: <div>图层面板内容</div>,
  properties: <div>属性面板内容</div>,
  interaction: <div>互动面板内容</div>,
  developer: <div>开发面板内容</div>,
}

function renderShell(
  overrides?: Partial<ComponentProps<typeof V9EditorShell>>,
) {
  return render(
    <V9EditorShell
      mode="simple"
      onModeChange={noop}
      projectTitle="二次函数"
      projectMeta="第 1 场景"
      toolbar={toolbar()}
      structure={<div>左侧课程目录</div>}
      workspaceTools={<button type="button">适合画布</button>}
      workspace={<div>当前画布</div>}
      activeInspectorTab="elements"
      onInspectorTabChange={noop}
      inspectorPanels={panels}
      status="已保存"
      selectionStatus="已选中：标题"
      viewportStatus="80%"
      professionalStatus="无诊断"
      {...overrides}
    />,
  )
}

describe('V9EditorShell', () => {
  it('以四个教师任务组和可替换插槽组成编辑器外壳', () => {
    renderShell()

    expect(screen.getByTestId('v9-editor-shell')).toHaveAttribute(
      'data-editor-mode',
      'simple',
    )
    expect(screen.getByRole('group', { name: '文件' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '历史' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '编辑与运行' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '预览与导出' })).toBeInTheDocument()

    expect(screen.getByText('左侧课程目录')).toBeInTheDocument()
    expect(screen.getByRole('main', { name: '课件编辑区' })).toHaveTextContent(
      '适合画布',
    )
    expect(screen.getByRole('main', { name: '课件编辑区' })).toHaveTextContent(
      '当前画布',
    )
    expect(screen.getByRole('contentinfo', { name: '编辑器状态' })).toHaveTextContent(
      '已保存',
    )
    expect(screen.getByRole('contentinfo', { name: '编辑器状态' })).toHaveTextContent(
      '已选中：标题',
    )
    expect(screen.queryByText('无诊断')).not.toBeInTheDocument()
  })

  it('简洁模式保留四个教师面板，专业模式增加开发面板', async () => {
    const user = userEvent.setup()

    function Harness() {
      const [mode, setMode] = useState<V9EditorMode>('simple')
      const [tab, setTab] = useState<V9InspectorTabId>('elements')
      return (
        <V9EditorShell
          mode={mode}
          onModeChange={setMode}
          projectTitle="课件"
          toolbar={toolbar()}
          structure={<div>结构</div>}
          workspace={<div>画布</div>}
          activeInspectorTab={tab}
          onInspectorTabChange={setTab}
          inspectorPanels={panels}
          professionalStatus="无诊断"
        />
      )
    }

    render(<Harness />)

    const simpleTabs = screen.getAllByRole('tab')
    expect(simpleTabs).toHaveLength(4)
    expect(screen.getByRole('tab', { name: '互动' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: '开发' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '专业' }))
    expect(screen.getAllByRole('tab')).toHaveLength(5)
    await user.click(screen.getByRole('tab', { name: '开发' }))
    expect(screen.getByRole('tabpanel')).toHaveTextContent('开发面板内容')
    expect(screen.getByText('无诊断')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '简洁' }))
    expect(screen.queryByRole('tab', { name: '开发' })).not.toBeInTheDocument()
    expect(screen.getByRole('tabpanel')).toHaveTextContent('元素面板内容')
  })

  it('将低频动作收进更多菜单，执行后关闭菜单', async () => {
    const user = userEvent.setup()
    const save = vi.fn()
    const inspect = vi.fn()
    renderShell({
      toolbar: toolbar({
        file: [{ id: 'save', label: '保存', shortcut: 'Ctrl+S', onSelect: save }],
        more: [{ id: 'inspect', label: '工程检查', onSelect: inspect }],
      }),
    })

    await user.click(screen.getByRole('button', { name: '保存（Ctrl+S）' }))
    expect(save).toHaveBeenCalledOnce()

    const more = screen.getByRole('button', { name: '更多操作' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: '更多操作' })
    await user.click(within(menu).getByRole('menuitem', { name: '工程检查' }))

    expect(inspect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu', { name: '更多操作' })).not.toBeInTheDocument()
  })

  it('忙碌时禁用顶部动作并显示处理中状态', () => {
    const save = vi.fn()
    renderShell({
      busy: true,
      status: undefined,
      toolbar: toolbar({
        file: [{ id: 'save', label: '保存', onSelect: save }],
        more: [{ id: 'inspect', label: '工程检查', onSelect: noop }],
      }),
    })

    const saveButton = screen.getByRole('button', { name: '保存' })
    expect(saveButton).toBeDisabled()
    fireEvent.click(saveButton)
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '更多操作' })).toBeDisabled()
    expect(screen.getByRole('contentinfo', { name: '编辑器状态' })).toHaveTextContent(
      '正在处理',
    )
  })
})
