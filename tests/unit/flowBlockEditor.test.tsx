import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formulaAstToAccessibleText,
  parseFormulaLinear,
  serializeFormulaAst,
} from '@/shared/formulaLinear'
import { flowBlockSchema } from '@/shared/courseProjectSchema'
import type { FlowBlock } from '@/shared/courseProjectTypes'
import {
  createDefaultFlowBlock,
  FlowBlockEditor,
  type FlowBlockEditorProps,
  type FlowEditorIdFactory,
} from '@/renderer/course/flow/FlowBlockEditor'
import {
  FLOW_BLOCK_TERMS,
  FLOW_BLOCK_TYPE_ORDER,
  FLOW_SECTION_INSERTABLE_TYPES,
  flowBlockTypeLabel,
} from '@/renderer/course/flow/flowBlockTerminology'

afterEach(cleanup)

function controlledEditor<T extends FlowBlock>(
  initial: T,
  props: Omit<FlowBlockEditorProps, 'block' | 'onChange'> = {},
): { current(): T } {
  let current = initial
  function Harness() {
    const [block, setBlock] = useState<FlowBlock>(initial)
    return (
      <FlowBlockEditor
        {...props}
        block={block}
        onChange={(next) => {
          current = next as T
          setBlock(next)
        }}
      />
    )
  }
  render(<Harness />)
  return { current: () => current }
}

const deterministicId: FlowEditorIdFactory = (prefix) => `${prefix}-new`

describe('Flow block teacher terminology', () => {
  it('covers every protocol block type with one Chinese label', () => {
    expect(FLOW_BLOCK_TYPE_ORDER).toHaveLength(12)
    expect(new Set(FLOW_BLOCK_TYPE_ORDER)).toHaveProperty('size', 12)
    for (const type of FLOW_BLOCK_TYPE_ORDER) {
      expect(flowBlockTypeLabel(type)).toBe(FLOW_BLOCK_TERMS[type].label)
      expect(FLOW_BLOCK_TERMS[type].label).toMatch(/[\p{Script=Han}]/u)
      expect(FLOW_BLOCK_TERMS[type].description.length).toBeGreaterThan(5)
    }
    expect(flowBlockTypeLabel('component')).toBe('互动组件')
  })

  it('creates schema-valid default blocks for every asset-free insert type', () => {
    let serial = 0
    const idFactory: FlowEditorIdFactory = (prefix) => `${prefix}-${++serial}`
    for (const type of FLOW_SECTION_INSERTABLE_TYPES) {
      expect(flowBlockSchema.safeParse(createDefaultFlowBlock(type, idFactory)).success).toBe(true)
    }
  })
})

describe('FlowBlockEditor structured editing', () => {
  it('edits heading structure instead of flattening it to one text value', () => {
    const editor = controlledEditor<Extract<FlowBlock, { type: 'heading' }>>({
      id: 'heading-main',
      type: 'heading',
      level: 2,
      text: '原标题',
    })
    expect(screen.getByRole('region', { name: '标题编辑器' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('标题级别'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('标题内容'), { target: { value: '新标题' } })
    expect(editor.current()).toEqual({
      id: 'heading-main',
      type: 'heading',
      level: 3,
      text: '新标题',
    })
  })

  it('adds, edits, moves and deletes list items while preserving stable ids', () => {
    const editor = controlledEditor<Extract<FlowBlock, { type: 'list' }>>({
      id: 'list-main',
      type: 'list',
      ordered: false,
      items: [{ id: 'item-a', text: '甲', level: 0 }, { id: 'item-b', text: '乙', level: 0 }],
    }, { idFactory: deterministicId })

    fireEvent.click(screen.getByRole('button', { name: '下移列表项 1' }))
    expect(editor.current().items.map((item) => item.id)).toEqual(['item-b', 'item-a'])
    fireEvent.change(screen.getByLabelText('列表项 1'), { target: { value: '乙（修改）' } })
    fireEvent.click(screen.getByRole('button', { name: '添加列表项' }))
    expect(editor.current().items).toEqual([
      { id: 'item-b', text: '乙（修改）', level: 0 },
      { id: 'item-a', text: '甲', level: 0 },
      { id: 'item-new', text: '新列表项', level: 0 },
    ])
    fireEvent.click(screen.getByRole('button', { name: '删除列表项 2' }))
    expect(editor.current().items.map((item) => item.id)).toEqual(['item-b', 'item-new'])
    expect(flowBlockSchema.safeParse(editor.current()).success).toBe(true)
  })

  it('indents and outdents a list subtree without creating skipped levels', () => {
    const editor = controlledEditor<Extract<FlowBlock, { type: 'list' }>>({
      id: 'list-outline',
      type: 'list',
      ordered: true,
      items: [
        { id: 'item-a', text: '甲', level: 0 },
        { id: 'item-b', text: '乙', level: 0 },
        { id: 'item-c', text: '丙', level: 0 },
      ],
    })

    expect(screen.getByRole('button', { name: '增加列表项 1 缩进' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '增加列表项 2 缩进' }))
    expect(editor.current().items.map((item) => item.level)).toEqual([0, 1, 0])
    fireEvent.click(screen.getByRole('button', { name: '增加列表项 3 缩进' }))
    expect(editor.current().items.map((item) => item.level)).toEqual([0, 1, 1])
    fireEvent.click(screen.getByRole('button', { name: '增加列表项 3 缩进' }))
    expect(editor.current().items.map((item) => item.level)).toEqual([0, 1, 2])
    fireEvent.click(screen.getByRole('button', { name: '减少列表项 2 缩进' }))
    expect(editor.current().items.map((item) => item.level)).toEqual([0, 0, 1])
    expect(flowBlockSchema.safeParse(editor.current()).success).toBe(true)
  })

  it('edits a real table and keeps every row aligned when columns change', () => {
    const editor = controlledEditor<Extract<FlowBlock, { type: 'table' }>>({
      id: 'table-main',
      type: 'table',
      caption: '数据',
      columns: [{ id: 'column-a', header: '姓名' }, { id: 'column-b', header: '得分' }],
      rows: [
        { id: 'row-a', cells: { 'column-a': '小明', 'column-b': '90' } },
        { id: 'row-b', cells: { 'column-a': '小华', 'column-b': '95' } },
      ],
    }, { idFactory: deterministicId })

    fireEvent.click(screen.getByRole('button', { name: '添加列' }))
    expect(editor.current().columns.at(-1)).toEqual({ id: 'column-new', header: '第 3 列' })
    expect(editor.current().rows.every((row) => row.cells['column-new'] === '')).toBe(true)
    fireEvent.change(screen.getByLabelText('第 1 行第 3 列'), { target: { value: '优秀' } })
    expect(editor.current().rows[0].cells['column-new']).toBe('优秀')
    fireEvent.click(screen.getByRole('button', { name: '下移第 1 行' }))
    expect(editor.current().rows.map((row) => row.id)).toEqual(['row-b', 'row-a'])
    fireEvent.click(screen.getByRole('button', { name: '删除第 2 列' }))
    expect(editor.current().columns.map((column) => column.id)).toEqual(['column-a', 'column-new'])
    expect(editor.current().rows.every((row) => !Object.hasOwn(row.cells, 'column-b'))).toBe(true)
    expect(flowBlockSchema.safeParse(editor.current()).success).toBe(true)
  })

  it('edits nested blocks and adds, moves and deletes section children', () => {
    const editor = controlledEditor<Extract<FlowBlock, { type: 'section' }>>({
      id: 'section-main',
      type: 'section',
      title: '第一节',
      collapsedByDefault: false,
      blocks: [
        { id: 'paragraph-a', type: 'paragraph', text: '甲' },
        { id: 'paragraph-b', type: 'paragraph', text: '乙' },
      ],
    }, { idFactory: deterministicId })

    fireEvent.change(screen.getAllByLabelText('正文内容')[0], { target: { value: '甲（修改）' } })
    expect(editor.current().blocks[0]).toMatchObject({ id: 'paragraph-a', text: '甲（修改）' })
    fireEvent.click(screen.getByRole('button', { name: '下移正文 1' }))
    expect(editor.current().blocks.map((block) => block.id)).toEqual(['paragraph-b', 'paragraph-a'])
    fireEvent.change(screen.getByLabelText('添加内容类型'), { target: { value: 'heading' } })
    fireEvent.click(screen.getByRole('button', { name: '添加到分节' }))
    expect(editor.current().blocks.at(-1)).toMatchObject({ id: 'block-new', type: 'heading', text: '新标题' })
    fireEvent.click(screen.getByRole('button', { name: '删除标题 3' }))
    expect(editor.current().blocks.map((block) => block.id)).toEqual(['paragraph-b', 'paragraph-a'])
    expect(flowBlockSchema.safeParse(editor.current()).success).toBe(true)
  })

  it('parses formula input to AST and keeps a deliberate custom reading description', () => {
    const originalAst = parseFormulaLinear('x^2')
    const editor = controlledEditor<Extract<FlowBlock, { type: 'formula' }>>({
      id: 'formula-block',
      type: 'formula',
      formulaId: 'formula-main',
      accessibleText: '自定义朗读',
      ast: originalAst,
    })

    fireEvent.change(screen.getByLabelText('公式内容（线性输入）'), { target: { value: 'a/b' } })
    fireEvent.click(screen.getByRole('button', { name: '应用公式' }))
    expect(serializeFormulaAst(editor.current().ast)).toBe('\\frac{a}{b}')
    expect(editor.current().accessibleText).toBe('自定义朗读')

    const beforeInvalid = editor.current().ast
    fireEvent.change(screen.getByLabelText('公式内容（线性输入）'), { target: { value: '/x' } })
    fireEvent.click(screen.getByRole('button', { name: '应用公式' }))
    expect(screen.getByRole('alert')).toHaveTextContent('公式无法应用')
    expect(editor.current().ast).toEqual(beforeInvalid)
  })

  it('keeps automatically generated formula reading text in sync', () => {
    const ast = parseFormulaLinear('x^2')
    const editor = controlledEditor<Extract<FlowBlock, { type: 'formula' }>>({
      id: 'formula-block',
      type: 'formula',
      formulaId: 'formula-main',
      accessibleText: formulaAstToAccessibleText(ast),
      ast,
    })
    fireEvent.change(screen.getByLabelText('公式内容（线性输入）'), { target: { value: 'x+1' } })
    fireEvent.click(screen.getByRole('button', { name: '应用公式' }))
    expect(editor.current().accessibleText).toBe(formulaAstToAccessibleText(editor.current().ast))
  })

  it('previews media, delegates replacement and edits component props field by field', () => {
    const replaceMedia = vi.fn()
    const media = controlledEditor<Extract<FlowBlock, { type: 'media' }>>({
      id: 'media-main',
      type: 'media',
      assetId: 'asset-main',
      mediaKind: 'image',
      altText: '二次函数图像',
      caption: '图一',
      layout: 'wide',
    }, {
      resolveAssetUrl: () => 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      onRequestReplaceMedia: replaceMedia,
    })
    expect(screen.getByRole('img', { name: '二次函数图像' })).toBeInTheDocument()
    expect(screen.getByLabelText('媒体类型')).toHaveTextContent('图片')
    expect(screen.queryByRole('combobox', { name: '媒体类型' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('媒体说明'), { target: { value: '新图注' } })
    fireEvent.click(screen.getByRole('button', { name: '替换媒体' }))
    expect(media.current().caption).toBe('新图注')
    expect(replaceMedia).toHaveBeenCalledWith(expect.objectContaining({ id: 'media-main', caption: '新图注' }))

    cleanup()
    const replaceComponent = vi.fn()
    const replaceFallback = vi.fn()
    const component = controlledEditor<Extract<FlowBlock, { type: 'component' }>>({
      id: 'component-main',
      type: 'component',
      component: { packageId: 'number-line', version: '1.0.0' },
      props: { title: '数轴', settings: { steps: 5, showAnswer: false } },
      staticFallbackAssetId: 'asset-fallback',
    }, {
      componentName: '可交互数轴',
      componentChoices: [
        { packageId: 'number-line', version: '1.0.0', name: '可交互数轴' },
        { packageId: 'function-lab', version: '2.0.0', name: '函数实验器' },
      ],
      resolveAssetUrl: () => 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
      onRequestReplaceComponent: replaceComponent,
      onRequestReplaceComponentFallback: replaceFallback,
      componentPropLabels: {
        title: '组件标题',
        'settings.steps': '刻度数量',
        'settings.showAnswer': '显示答案',
      },
    })
    fireEvent.change(screen.getByLabelText('组件标题'), { target: { value: '一次函数数轴' } })
    fireEvent.change(screen.getByLabelText('刻度数量'), { target: { value: '8' } })
    fireEvent.click(screen.getByLabelText('显示答案'))
    expect(component.current().props).toEqual({ title: '一次函数数轴', settings: { steps: 8, showAnswer: true } })
    expect(screen.getByRole('heading', { name: '可交互数轴' })).toBeInTheDocument()
    expect(screen.queryByText('number-line')).not.toBeInTheDocument()
    expect(screen.queryByText('1.0.0')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: '可交互数轴的静态预览' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '替换静态预览' }))
    expect(replaceFallback).toHaveBeenCalledWith(expect.objectContaining({ id: 'component-main' }))
    fireEvent.change(screen.getByLabelText('替换为'), { target: { value: 'function-lab@2.0.0' } })
    fireEvent.click(screen.getByRole('button', { name: '应用替换' }))
    expect(replaceComponent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'component-main' }),
      expect.objectContaining({ name: '函数实验器' }),
    )
  })
})

describe('FlowBlockEditor block coverage', () => {
  it('renders a dedicated Chinese editor for all twelve block types', () => {
    const ast = parseFormulaLinear('x')
    const samples: FlowBlock[] = [
      { id: 'heading', type: 'heading', level: 2, text: '标题' },
      { id: 'paragraph', type: 'paragraph', text: '正文' },
      { id: 'quote', type: 'quote', text: '引用' },
      { id: 'list', type: 'list', ordered: false, items: [{ id: 'item', text: '项目', level: 0 }] },
      { id: 'callout', type: 'callout', tone: 'note', body: '提示' },
      { id: 'table', type: 'table', columns: [{ id: 'column', header: '列' }], rows: [] },
      { id: 'formula', type: 'formula', formulaId: 'formula-main', accessibleText: 'x', ast },
      { id: 'code', type: 'code', language: 'text', code: 'code' },
      { id: 'section', type: 'section', title: '分节', collapsedByDefault: false, blocks: [] },
      { id: 'divider', type: 'divider' },
      { id: 'media', type: 'media', assetId: 'asset-main', mediaKind: 'image', layout: 'wide' },
      { id: 'component', type: 'component', component: { packageId: 'pkg', version: '1.0.0' }, props: {}, staticFallbackAssetId: 'fallback' },
    ]
    for (const block of samples) {
      const view = render(<FlowBlockEditor block={block} onChange={vi.fn()} />)
      expect(screen.getByRole('region', { name: `${flowBlockTypeLabel(block.type)}编辑器` })).toHaveAttribute('data-flow-block-type', block.type)
      view.unmount()
    }
  })
})
