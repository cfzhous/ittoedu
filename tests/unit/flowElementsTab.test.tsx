import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createFlowBlockInsertRequest,
  FlowElementsTab,
  type FlowBlockInsertRequest,
} from '@/renderer/ui/FlowElementsTab'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const ALL_BLOCK_TYPES = [
  ['heading', '标题'],
  ['paragraph', '段落'],
  ['list', '列表'],
  ['quote', '引用'],
  ['divider', '分隔线'],
  ['media', '媒体'],
  ['table', '表格'],
  ['formula', '公式'],
  ['code', '代码'],
  ['callout', '提示块'],
  ['section', '分节'],
  ['component', '互动组件'],
] as const

describe('FlowElementsTab', () => {
  it('renders an accessible picker with teacher-friendly Chinese labels for every Flow block type', () => {
    render(<FlowElementsTab onInsert={vi.fn()} />)

    for (const [, ariaLabel] of ALL_BLOCK_TYPES) {
      expect(screen.getByRole('button', { name: ariaLabel })).toBeInTheDocument()
    }
    expect(screen.getByRole('group', { name: 'Flow 内容块类型' })).toBeInTheDocument()
    expect(screen.getByText('标题')).toBeInTheDocument()
    expect(screen.getByText('互动组件')).toBeInTheDocument()
  })

  it('sends a complete, safe insert request for every block type', () => {
    const onInsert = vi.fn()
    render(<FlowElementsTab onInsert={onInsert} />)

    for (const [type] of ALL_BLOCK_TYPES) {
      fireEvent.click(screen.getByTestId(`add-flow-${type}`))
    }

    expect(onInsert).toHaveBeenCalledTimes(ALL_BLOCK_TYPES.length)
    const requests = onInsert.mock.calls.map(([request]) => request)
    const byType = new Map(requests.map((request) => [request.type, request]))

    expect(byType.get('heading')).toMatchObject({ type: 'heading', level: 2, text: '新标题' })
    expect(byType.get('paragraph')).toMatchObject({ type: 'paragraph', text: '在这里编辑正文……' })
    const listRequest = byType.get('list') as Extract<FlowBlockInsertRequest, { type: 'list' }>
    expect(listRequest).toMatchObject({ type: 'list', ordered: false })
    expect(listRequest.items).toHaveLength(1)
    expect(listRequest.items[0]?.text).toBe('列表项')
    expect(byType.get('quote')).toMatchObject({ type: 'quote', text: '引用内容', citation: '出处' })
    expect(byType.get('divider')).toMatchObject({ type: 'divider' })
    expect(byType.get('media')).toMatchObject({
      type: 'media',
      assetId: '',
      mediaKind: 'image',
      layout: 'content-width',
    })
    const tableRequest = byType.get('table') as Extract<FlowBlockInsertRequest, { type: 'table' }>
    expect(tableRequest).toMatchObject({ type: 'table', caption: '表格' })
    expect(tableRequest.columns).toHaveLength(2)
    expect(tableRequest.rows).toHaveLength(1)
    const formulaRequest = byType.get('formula') as Extract<FlowBlockInsertRequest, { type: 'formula' }>
    expect(formulaRequest).toMatchObject({ type: 'formula', accessibleText: 'x 的平方' })
    expect(formulaRequest.ast).toMatchObject({ type: 'script' })
    expect(byType.get('code')).toMatchObject({ type: 'code', language: 'text', code: '在这里编辑代码' })
    expect(byType.get('callout')).toMatchObject({
      type: 'callout',
      tone: 'note',
      title: '提示',
      body: '在这里编辑提示内容。',
    })
    expect(byType.get('section')).toMatchObject({
      type: 'section',
      title: '可折叠分节',
      collapsedByDefault: false,
      blocks: [],
    })
    expect(byType.get('component')).toMatchObject({
      type: 'component',
      component: { packageId: '', version: '' },
      props: {},
      staticFallbackAssetId: '',
    })

    for (const request of requests) {
      expect(request.id).toMatch(/^block-/)
    }
  })

  it('generates temp ids only for fields the command layer accepts as optional', () => {
    const heading = createFlowBlockInsertRequest('heading')
    const list = createFlowBlockInsertRequest('list') as Extract<FlowBlockInsertRequest, { type: 'list' }>
    const table = createFlowBlockInsertRequest('table') as Extract<FlowBlockInsertRequest, { type: 'table' }>
    const formula = createFlowBlockInsertRequest('formula') as Extract<FlowBlockInsertRequest, { type: 'formula' }>

    expect(heading.id).toMatch(/^block-/)
    expect(list.id).toMatch(/^block-/)
    expect(list.items[0]?.id).toMatch(/^item-/)
    expect(table.id).toMatch(/^block-/)
    expect(table.rows[0]?.id).toMatch(/^row-/)
    expect(table.columns[0]?.id).toBe('column-a')
    expect(table.columns[1]?.id).toBe('column-b')
    expect(formula.formulaId).toMatch(/^formula-/)
  })

  it('disables the whole picker and explains the teacher-safe reason', () => {
    const onInsert = vi.fn()
    render(<FlowElementsTab onInsert={onInsert} disabledReason="请先创建 Flow 文档。" />)

    expect(screen.getByTestId('flow-elements-tab')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('请先创建 Flow 文档。')
    for (const [, ariaLabel] of ALL_BLOCK_TYPES) {
      expect(screen.getByRole('button', { name: ariaLabel })).toBeDisabled()
    }
    fireEvent.click(screen.getByTestId('add-flow-paragraph'))
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('supports nested insertion into the current section when a section id is supplied', () => {
    const onInsert = vi.fn()
    const onInsertNested = vi.fn()
    render(
      <FlowElementsTab
        onInsert={onInsert}
        onInsertNested={onInsertNested}
        nestedSectionId="section-1"
      />,
    )

    fireEvent.click(screen.getByLabelText('插入到当前分节'))
    fireEvent.click(screen.getByTestId('add-flow-paragraph'))

    expect(onInsertNested).toHaveBeenCalledTimes(1)
    const [sectionId, request] = onInsertNested.mock.calls[0]!
    expect(sectionId).toBe('section-1')
    expect(request).toMatchObject({ type: 'paragraph', text: '在这里编辑正文……' })
    expect(onInsert).not.toHaveBeenCalled()
  })
})
