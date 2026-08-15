import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlowPropertiesTab } from '@/renderer/ui/FlowPropertiesTab'
import type { FlowBlock } from '@/shared/courseProjectTypes'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function headingBlock(): FlowBlock {
  return { id: 'block-heading', type: 'heading', level: 2, text: '标题' }
}

function paragraphBlock(): FlowBlock {
  return { id: 'block-paragraph', type: 'paragraph', text: '段落内容' }
}

function listBlock(): FlowBlock {
  return {
    id: 'block-list',
    type: 'list',
    ordered: false,
    items: [
      { id: 'item-a', text: '第一项' },
      { id: 'item-b', text: '第二项' },
    ],
  }
}

function quoteBlock(): FlowBlock {
  return { id: 'block-quote', type: 'quote', text: '引用内容', citation: '出处' }
}

function dividerBlock(): FlowBlock {
  return { id: 'block-divider', type: 'divider' }
}

function mediaBlock(): FlowBlock {
  return {
    id: 'block-media',
    type: 'media',
    assetId: 'asset-a',
    mediaKind: 'image',
    caption: '媒体标题',
    altText: '替代',
    layout: 'content-width',
  }
}

function tableBlock(): FlowBlock {
  return {
    id: 'block-table',
    type: 'table',
    caption: '表格标题',
    columns: [
      { id: 'column-a', header: '项目' },
      { id: 'column-b', header: '内容' },
    ],
    rows: [
      { id: 'row-a', cells: { 'column-a': '甲', 'column-b': '乙' } },
      { id: 'row-b', cells: { 'column-a': '丙', 'column-b': '丁' } },
    ],
  }
}

function formulaBlock(): FlowBlock {
  return {
    id: 'block-formula',
    type: 'formula',
    formulaId: 'formula-a',
    accessibleText: 'x 的平方',
    ast: { type: 'token', value: 'x' },
  }
}

function codeBlock(): FlowBlock {
  return { id: 'block-code', type: 'code', language: 'text', code: 'const a = 1' }
}

function calloutBlock(): FlowBlock {
  return {
    id: 'block-callout',
    type: 'callout',
    tone: 'note',
    title: '提示',
    body: '提示内容',
  }
}

function sectionBlock(): FlowBlock {
  return {
    id: 'block-section',
    type: 'section',
    title: '分节',
    collapsedByDefault: false,
    blocks: [],
  }
}

function componentBlock(): FlowBlock {
  return {
    id: 'block-component',
    type: 'component',
    component: { packageId: 'com.example', version: '1.0.0' },
    props: {},
    staticFallbackAssetId: 'asset-a',
  }
}

const ALL_EDITORS = [
  [headingBlock(), 'flow-editor-heading'],
  [paragraphBlock(), 'flow-editor-paragraph'],
  [listBlock(), 'flow-editor-list'],
  [quoteBlock(), 'flow-editor-quote'],
  [dividerBlock(), 'flow-editor-divider'],
  [mediaBlock(), 'flow-editor-media'],
  [tableBlock(), 'flow-editor-table'],
  [formulaBlock(), 'flow-editor-formula'],
  [codeBlock(), 'flow-editor-code'],
  [calloutBlock(), 'flow-editor-callout'],
  [sectionBlock(), 'flow-editor-section'],
  [componentBlock(), 'flow-editor-component'],
] as const

describe('FlowPropertiesTab', () => {
  it('disables and explains when no block is selected', () => {
    render(<FlowPropertiesTab block={null} />)

    expect(screen.getByTestId('flow-properties-tab')).toBeInTheDocument()
    expect(screen.getByTestId('flow-properties-empty')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('请先在 Flow 文档中选择一个内容块。')
    expect(screen.getByRole('button', { name: '选择内容块后可编辑' })).toBeDisabled()
  })

  it('renders an editor for every Flow block type', () => {
    for (const [block, testId] of ALL_EDITORS) {
      const { unmount } = render(<FlowPropertiesTab block={block} />)
      expect(screen.getByTestId(testId)).toBeInTheDocument()
      unmount()
    }
  })

  it('patches heading level and text with the selected block id', () => {
    const onPatch = vi.fn()
    render(<FlowPropertiesTab block={headingBlock()} onPatch={onPatch} />)

    fireEvent.change(screen.getByLabelText('标题级别'), { target: { value: '3' } })
    expect(onPatch).toHaveBeenCalledWith('block-heading', { level: 3 })

    const textInput = screen.getByLabelText('标题文本')
    fireEvent.change(textInput, { target: { value: '新标题' } })
    fireEvent.blur(textInput)
    expect(onPatch).toHaveBeenCalledWith('block-heading', { text: '新标题' })
  })

  it('patches paragraph and quote text fields', () => {
    const onPatch = vi.fn()
    render(<FlowPropertiesTab block={paragraphBlock()} onPatch={onPatch} />)
    const paragraph = screen.getByLabelText('段落文本')
    fireEvent.change(paragraph, { target: { value: '新段落' } })
    fireEvent.blur(paragraph)
    expect(onPatch).toHaveBeenCalledWith('block-paragraph', { text: '新段落' })

    cleanup()
    render(<FlowPropertiesTab block={quoteBlock()} onPatch={onPatch} />)
    const quote = screen.getByLabelText('引用内容')
    fireEvent.change(quote, { target: { value: '新引用' } })
    fireEvent.blur(quote)
    expect(onPatch).toHaveBeenCalledWith('block-quote', { text: '新引用' })

    const citation = screen.getByLabelText('出处')
    fireEvent.change(citation, { target: { value: '新出处' } })
    fireEvent.blur(citation)
    expect(onPatch).toHaveBeenCalledWith('block-quote', { citation: '新出处' })
  })

  it('dispatches structural commands for list item add, delete, edit and reorder', () => {
    const onPatch = vi.fn()
    const onStructuralCommand = vi.fn()
    render(
      <FlowPropertiesTab
        block={listBlock()}
        onPatch={onPatch}
        onStructuralCommand={onStructuralCommand}
      />,
    )

    fireEvent.click(screen.getByTestId('flow-list-add-item'))
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-list',
      kind: 'list.addItem',
      text: '新列表项',
    })

    fireEvent.click(screen.getByTestId('flow-list-item-1-delete'))
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-list',
      kind: 'list.deleteItem',
      itemId: 'item-a',
    })

    const firstInput = screen.getByLabelText('列表项 1')
    fireEvent.change(firstInput, { target: { value: '修改项' } })
    fireEvent.blur(firstInput)
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-list',
      kind: 'list.editItem',
      itemId: 'item-a',
      text: '修改项',
    })

    fireEvent.click(screen.getByTestId('flow-list-item-1-move-down'))
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-list',
      kind: 'list.reorderItem',
      itemId: 'item-a',
      toIndex: 1,
    })

    fireEvent.click(screen.getByLabelText('有序列表'))
    expect(onPatch).toHaveBeenCalledWith('block-list', { ordered: true })
  })

  it('patches media properties', () => {
    const onPatch = vi.fn()
    render(
      <FlowPropertiesTab
        block={mediaBlock()}
        assets={[
          { id: 'asset-a', label: '图片A' },
          { id: 'asset-b', label: '图片B' },
        ]}
        onPatch={onPatch}
      />,
    )

    fireEvent.change(screen.getByLabelText('素材'), { target: { value: 'asset-b' } })
    expect(onPatch).toHaveBeenCalledWith('block-media', { assetId: 'asset-b' })

    fireEvent.change(screen.getByLabelText('媒体类型'), { target: { value: 'video' } })
    expect(onPatch).toHaveBeenCalledWith('block-media', { mediaKind: 'video' })

    fireEvent.change(screen.getByLabelText('版式'), { target: { value: 'wide' } })
    expect(onPatch).toHaveBeenCalledWith('block-media', { layout: 'wide' })

    const caption = screen.getByLabelText('标题说明')
    fireEvent.change(caption, { target: { value: '新标题说明' } })
    fireEvent.blur(caption)
    expect(onPatch).toHaveBeenCalledWith('block-media', { caption: '新标题说明' })

    const alt = screen.getByLabelText('替代文本')
    fireEvent.change(alt, { target: { value: '新替代文本' } })
    fireEvent.blur(alt)
    expect(onPatch).toHaveBeenCalledWith('block-media', { altText: '新替代文本' })
  })

  it('patches table caption, column headers and cell text; dispatches table structural commands', () => {
    const onPatch = vi.fn()
    const onStructuralCommand = vi.fn()
    render(
      <FlowPropertiesTab
        block={tableBlock()}
        onPatch={onPatch}
        onStructuralCommand={onStructuralCommand}
      />,
    )

    const caption = screen.getByLabelText('表格标题')
    fireEvent.change(caption, { target: { value: '新表格标题' } })
    fireEvent.blur(caption)
    expect(onPatch).toHaveBeenCalledWith('block-table', { caption: '新表格标题' })

    const firstColumn = screen.getByLabelText('列 1 标题')
    fireEvent.change(firstColumn, { target: { value: '新项目' } })
    fireEvent.blur(firstColumn)
    expect(onPatch).toHaveBeenCalledWith('block-table', {
      columns: [
        { id: 'column-a', header: '新项目' },
        { id: 'column-b', header: '内容' },
      ],
    })

    const cell = screen.getByLabelText('第 1 行 项目')
    fireEvent.change(cell, { target: { value: '新甲' } })
    fireEvent.blur(cell)
    expect(onPatch).toHaveBeenCalledWith('block-table', {
      rows: [
        { id: 'row-a', cells: { 'column-a': '新甲', 'column-b': '乙' } },
        { id: 'row-b', cells: { 'column-a': '丙', 'column-b': '丁' } },
      ],
    })

    fireEvent.click(screen.getByTestId('flow-table-add-column'))
    expect(onStructuralCommand).toHaveBeenCalledWith({ blockId: 'block-table', kind: 'table.addColumn' })

    fireEvent.click(screen.getByTestId('flow-table-column-1-delete'))
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-table',
      kind: 'table.deleteColumn',
      columnId: 'column-a',
    })

    fireEvent.click(screen.getByTestId('flow-table-add-row'))
    expect(onStructuralCommand).toHaveBeenCalledWith({ blockId: 'block-table', kind: 'table.addRow' })

    fireEvent.click(screen.getByTestId('flow-table-row-1-delete'))
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-table',
      kind: 'table.deleteRow',
      rowId: 'row-a',
    })
  })

  it('patches formula, code, callout and section editors', () => {
    const onPatch = vi.fn()
    render(<FlowPropertiesTab block={formulaBlock()} onPatch={onPatch} />)
    const formula = screen.getByLabelText('公式说明（无障碍文本）')
    fireEvent.change(formula, { target: { value: 'x 加 y' } })
    fireEvent.blur(formula)
    expect(onPatch).toHaveBeenCalledWith('block-formula', { accessibleText: 'x 加 y' })

    cleanup()
    render(<FlowPropertiesTab block={codeBlock()} onPatch={onPatch} />)
    const language = screen.getByLabelText('语言')
    fireEvent.change(language, { target: { value: 'typescript' } })
    fireEvent.blur(language)
    expect(onPatch).toHaveBeenCalledWith('block-code', { language: 'typescript' })

    const code = screen.getByLabelText('代码')
    fireEvent.change(code, { target: { value: 'const b = 2' } })
    fireEvent.blur(code)
    expect(onPatch).toHaveBeenCalledWith('block-code', { code: 'const b = 2' })

    cleanup()
    render(<FlowPropertiesTab block={calloutBlock()} onPatch={onPatch} />)
    fireEvent.change(screen.getByLabelText('提示类型'), { target: { value: 'warning' } })
    expect(onPatch).toHaveBeenCalledWith('block-callout', { tone: 'warning' })

    const title = screen.getByLabelText('标题')
    fireEvent.change(title, { target: { value: '警告标题' } })
    fireEvent.blur(title)
    expect(onPatch).toHaveBeenCalledWith('block-callout', { title: '警告标题' })

    const body = screen.getByLabelText('正文')
    fireEvent.change(body, { target: { value: '警告正文' } })
    fireEvent.blur(body)
    expect(onPatch).toHaveBeenCalledWith('block-callout', { body: '警告正文' })

    cleanup()
    render(<FlowPropertiesTab block={sectionBlock()} onPatch={onPatch} />)
    const sectionTitle = screen.getByLabelText('分节标题')
    fireEvent.change(sectionTitle, { target: { value: '新分节' } })
    fireEvent.blur(sectionTitle)
    expect(onPatch).toHaveBeenCalledWith('block-section', { title: '新分节' })

    fireEvent.click(screen.getByLabelText('默认折叠'))
    expect(onPatch).toHaveBeenCalledWith('block-section', { collapsedByDefault: true })
  })

  it('patches component package, props and static fallback asset', () => {
    const onPatch = vi.fn()
    render(
      <FlowPropertiesTab
        block={componentBlock()}
        assets={[
          { id: 'asset-a', label: '图片A' },
          { id: 'asset-b', label: '图片B' },
        ]}
        componentPackages={[
          { packageId: 'com.example', version: '1.0.0' },
          { packageId: 'com.example', version: '2.0.0' },
        ]}
        onPatch={onPatch}
      />,
    )

    fireEvent.change(screen.getByLabelText('组件包'), { target: { value: 'com.example@2.0.0' } })
    expect(onPatch).toHaveBeenCalledWith('block-component', {
      component: { packageId: 'com.example', version: '2.0.0' },
    })

    fireEvent.change(screen.getByLabelText('静态替代素材'), { target: { value: 'asset-b' } })
    expect(onPatch).toHaveBeenCalledWith('block-component', { staticFallbackAssetId: 'asset-b' })

    const props = screen.getByLabelText('互动组件属性 JSON')
    fireEvent.change(props, { target: { value: '{ broken json' } })
    fireEvent.blur(props)
    expect(screen.getByTestId('flow-component-props-error')).toHaveTextContent('有效的 JSON 对象')
    expect(onPatch).not.toHaveBeenCalledWith('block-component', expect.objectContaining({ props: expect.anything() }))

    fireEvent.change(props, { target: { value: '{"title":"新属性"}' } })
    fireEvent.blur(props)
    expect(onPatch).toHaveBeenCalledWith('block-component', { props: { title: '新属性' } })
  })
})
