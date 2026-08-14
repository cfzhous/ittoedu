import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { nanoid } from 'nanoid'
import {
  formulaAstToAccessibleText,
  parseFormulaLinear,
  serializeFormulaAst,
} from '../../../shared/formulaLinear'
import {
  canIndentFlowListItem,
  canMoveFlowListItem,
  changeFlowListItemIndent,
  flowListSubtreeEnd,
  moveFlowListItem,
} from '../../../shared/flowListStructure'
import type { FlowBlock } from '../../../shared/courseProjectTypes'
import {
  FLOW_BLOCK_TERMS,
  FLOW_BLOCK_TYPE_ORDER,
  FLOW_CALLOUT_TONE_LABELS,
  FLOW_HEADING_LEVEL_LABELS,
  FLOW_MEDIA_KIND_LABELS,
  FLOW_MEDIA_LAYOUT_LABELS,
  FLOW_SECTION_INSERTABLE_TYPES,
  flowBlockTypeLabel,
} from './flowBlockTerminology'

type HeadingBlock = Extract<FlowBlock, { type: 'heading' }>
type ParagraphBlock = Extract<FlowBlock, { type: 'paragraph' }>
type QuoteBlock = Extract<FlowBlock, { type: 'quote' }>
type ListBlock = Extract<FlowBlock, { type: 'list' }>
type CalloutBlock = Extract<FlowBlock, { type: 'callout' }>
type TableBlock = Extract<FlowBlock, { type: 'table' }>
type FormulaBlock = Extract<FlowBlock, { type: 'formula' }>
type CodeBlock = Extract<FlowBlock, { type: 'code' }>
type SectionBlock = Extract<FlowBlock, { type: 'section' }>
type DividerBlock = Extract<FlowBlock, { type: 'divider' }>
type MediaBlock = Extract<FlowBlock, { type: 'media' }>
type ComponentBlock = Extract<FlowBlock, { type: 'component' }>

export type FlowEditorIdPrefix = 'block' | 'item' | 'column' | 'row' | 'formula'
export type FlowEditorIdFactory = (prefix: FlowEditorIdPrefix) => string

export interface FlowBlockEditorProps {
  block: FlowBlock
  onChange(next: FlowBlock): void
  disabled?: boolean
  depth?: number
  idFactory?: FlowEditorIdFactory
  resolveAssetUrl?: (assetId: string) => string | undefined
  onRequestReplaceMedia?: (block: MediaBlock) => void
  componentName?: string
  resolveComponentName?: (block: ComponentBlock) => string | undefined
  componentChoices?: readonly FlowComponentChoice[]
  onRequestReplaceComponent?: (block: ComponentBlock, choice: FlowComponentChoice) => void
  onRequestReplaceComponentFallback?: (block: ComponentBlock) => void
  componentPropLabels?: Readonly<Record<string, string>>
  showHeader?: boolean
}

export interface FlowComponentChoice {
  packageId: string
  version: string
  name: string
}

const defaultIdFactory: FlowEditorIdFactory = (prefix) => `${prefix}-${nanoid(10)}`

function definedText(value: string): string | undefined {
  return value === '' ? undefined : value
}

function moveEntry<T>(values: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= values.length || to < 0 || to >= values.length) {
    return [...values]
  }
  const next = [...values]
  const [entry] = next.splice(from, 1)
  next.splice(to, 0, entry)
  return next
}

export function createDefaultFlowBlock(
  type: typeof FLOW_SECTION_INSERTABLE_TYPES[number],
  idFactory: FlowEditorIdFactory = defaultIdFactory,
): FlowBlock {
  const id = idFactory('block')
  switch (type) {
    case 'heading': return { id, type, level: 2, text: '新标题' }
    case 'paragraph': return { id, type, text: '在这里输入正文' }
    case 'quote': return { id, type, text: '引用内容' }
    case 'list': return { id, type, ordered: false, items: [{ id: idFactory('item'), text: '列表项', level: 0 }] }
    case 'callout': return { id, type, tone: 'note', title: '提示', body: '提示内容' }
    case 'table': {
      const columnA = idFactory('column')
      const columnB = idFactory('column')
      return {
        id,
        type,
        columns: [{ id: columnA, header: '项目' }, { id: columnB, header: '内容' }],
        rows: [{ id: idFactory('row'), cells: { [columnA]: '', [columnB]: '' } }],
      }
    }
    case 'formula': return {
      id,
      type,
      formulaId: idFactory('formula'),
      accessibleText: 'x 的平方',
      ast: parseFormulaLinear('x^2'),
    }
    case 'code': return { id, type, language: 'text', code: '在这里输入代码' }
    case 'section': return { id, type, title: '新分节', collapsedByDefault: false, blocks: [] }
    case 'divider': return { id, type }
  }
}

function EditorField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="course-field"><span>{label}</span>{children}</label>
}

function ActionButton({ children, danger = false, ...props }: {
  children: ReactNode
  danger?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={danger ? 'danger-button' : 'secondary-button'}
      {...props}
    >
      {children}
    </button>
  )
}

function HeadingEditor({ block, disabled, onChange }: {
  block: HeadingBlock
  disabled: boolean
  onChange(next: HeadingBlock): void
}) {
  return (
    <>
      <EditorField label="标题级别">
        <select
          value={block.level}
          disabled={disabled}
          onChange={(event) => onChange({ ...block, level: Number(event.currentTarget.value) as HeadingBlock['level'] })}
        >
          {Object.entries(FLOW_HEADING_LEVEL_LABELS).map(([level, label]) => (
            <option key={level} value={level}>{label}</option>
          ))}
        </select>
      </EditorField>
      <EditorField label="标题内容">
        <input value={block.text} disabled={disabled} onChange={(event) => onChange({ ...block, text: event.currentTarget.value })} />
      </EditorField>
    </>
  )
}

function ParagraphEditor({ block, disabled, onChange }: {
  block: ParagraphBlock
  disabled: boolean
  onChange(next: ParagraphBlock): void
}) {
  return (
    <EditorField label="正文内容">
      <textarea rows={6} value={block.text} disabled={disabled} onChange={(event) => onChange({ ...block, text: event.currentTarget.value })} />
    </EditorField>
  )
}

function QuoteEditor({ block, disabled, onChange }: {
  block: QuoteBlock
  disabled: boolean
  onChange(next: QuoteBlock): void
}) {
  return (
    <>
      <EditorField label="引用内容">
        <textarea rows={4} value={block.text} disabled={disabled} onChange={(event) => onChange({ ...block, text: event.currentTarget.value })} />
      </EditorField>
      <EditorField label="引用出处">
        <input value={block.citation ?? ''} disabled={disabled} onChange={(event) => onChange({ ...block, citation: definedText(event.currentTarget.value) })} />
      </EditorField>
    </>
  )
}

function ListEditor({ block, disabled, idFactory, onChange }: {
  block: ListBlock
  disabled: boolean
  idFactory: FlowEditorIdFactory
  onChange(next: ListBlock): void
}) {
  const addItem = () => onChange({
    ...block,
    items: [...block.items, { id: idFactory('item'), text: '新列表项', level: block.items.at(-1)?.level ?? 0 }],
  })
  return (
    <>
      <EditorField label="列表形式">
        <select value={block.ordered ? 'ordered' : 'unordered'} disabled={disabled} onChange={(event) => onChange({ ...block, ordered: event.currentTarget.value === 'ordered' })}>
          <option value="unordered">项目符号</option>
          <option value="ordered">编号列表</option>
        </select>
      </EditorField>
      <ol aria-label="列表项" className="course-flow-editor-collection">
        {block.items.map((item, index) => (
          <li key={item.id} data-list-level={item.level} style={{ marginLeft: item.level * 20 }}>
            <EditorField label={`列表项 ${index + 1}`}>
              <input value={item.text} disabled={disabled} onChange={(event) => onChange({
                ...block,
                items: block.items.map((entry) => entry.id === item.id ? { ...entry, text: event.currentTarget.value } : entry),
              })} />
            </EditorField>
            <p className="course-empty">第 {item.level + 1} 级</p>
            <div className="course-property-actions">
              <ActionButton aria-label={`上移列表项 ${index + 1}`} disabled={disabled || !canMoveFlowListItem(block.items, index, 'up')} onClick={() => onChange({ ...block, items: moveFlowListItem(block.items, index, 'up') })}>上移</ActionButton>
              <ActionButton aria-label={`下移列表项 ${index + 1}`} disabled={disabled || !canMoveFlowListItem(block.items, index, 'down')} onClick={() => onChange({ ...block, items: moveFlowListItem(block.items, index, 'down') })}>下移</ActionButton>
              <ActionButton aria-label={`增加列表项 ${index + 1} 缩进`} disabled={disabled || !canIndentFlowListItem(block.items, index)} onClick={() => onChange({ ...block, items: changeFlowListItemIndent(block.items, index, 'indent') })}>增加缩进</ActionButton>
              <ActionButton aria-label={`减少列表项 ${index + 1} 缩进`} disabled={disabled || item.level === 0} onClick={() => onChange({ ...block, items: changeFlowListItemIndent(block.items, index, 'outdent') })}>减少缩进</ActionButton>
              <ActionButton danger aria-label={`删除列表项 ${index + 1}`} disabled={disabled || block.items.length - (flowListSubtreeEnd(block.items, index) - index) < 1} onClick={() => {
                const end = flowListSubtreeEnd(block.items, index)
                onChange({ ...block, items: [...block.items.slice(0, index), ...block.items.slice(end)] })
              }}>删除</ActionButton>
            </div>
          </li>
        ))}
      </ol>
      <ActionButton disabled={disabled} onClick={addItem}>添加列表项</ActionButton>
    </>
  )
}

function CalloutEditor({ block, disabled, onChange }: {
  block: CalloutBlock
  disabled: boolean
  onChange(next: CalloutBlock): void
}) {
  return (
    <>
      <EditorField label="提示类型">
        <select value={block.tone} disabled={disabled} onChange={(event) => onChange({ ...block, tone: event.currentTarget.value as CalloutBlock['tone'] })}>
          {Object.entries(FLOW_CALLOUT_TONE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </EditorField>
      <EditorField label="提示标题">
        <input value={block.title ?? ''} disabled={disabled} onChange={(event) => onChange({ ...block, title: definedText(event.currentTarget.value) })} />
      </EditorField>
      <EditorField label="提示内容">
        <textarea rows={4} value={block.body} disabled={disabled} onChange={(event) => onChange({ ...block, body: event.currentTarget.value })} />
      </EditorField>
    </>
  )
}

function TableEditor({ block, disabled, idFactory, onChange }: {
  block: TableBlock
  disabled: boolean
  idFactory: FlowEditorIdFactory
  onChange(next: TableBlock): void
}) {
  const addColumn = () => {
    const id = idFactory('column')
    onChange({
      ...block,
      columns: [...block.columns, { id, header: `第 ${block.columns.length + 1} 列` }],
      rows: block.rows.map((row) => ({ ...row, cells: { ...row.cells, [id]: '' } })),
    })
  }
  const deleteColumn = (columnId: string) => onChange({
    ...block,
    columns: block.columns.filter((column) => column.id !== columnId),
    rows: block.rows.map((row) => {
      const cells = { ...row.cells }
      delete cells[columnId]
      return { ...row, cells }
    }),
  })
  const addRow = () => onChange({
    ...block,
    rows: [...block.rows, {
      id: idFactory('row'),
      cells: Object.fromEntries(block.columns.map((column) => [column.id, ''])),
    }],
  })
  return (
    <>
      <EditorField label="表格标题">
        <input value={block.caption ?? ''} disabled={disabled} onChange={(event) => onChange({ ...block, caption: definedText(event.currentTarget.value) })} />
      </EditorField>
      <div role="group" aria-label="表格列" className="course-flow-editor-columns">
        {block.columns.map((column, index) => (
          <div key={column.id}>
            <EditorField label={`列标题 ${index + 1}`}>
              <input value={column.header} disabled={disabled} onChange={(event) => onChange({
                ...block,
                columns: block.columns.map((entry) => entry.id === column.id ? { ...entry, header: event.currentTarget.value } : entry),
              })} />
            </EditorField>
            <div className="course-property-actions">
              <ActionButton aria-label={`左移第 ${index + 1} 列`} disabled={disabled || index === 0} onClick={() => onChange({ ...block, columns: moveEntry(block.columns, index, index - 1) })}>左移</ActionButton>
              <ActionButton aria-label={`右移第 ${index + 1} 列`} disabled={disabled || index === block.columns.length - 1} onClick={() => onChange({ ...block, columns: moveEntry(block.columns, index, index + 1) })}>右移</ActionButton>
              <ActionButton danger aria-label={`删除第 ${index + 1} 列`} disabled={disabled || block.columns.length === 1} onClick={() => deleteColumn(column.id)}>删除列</ActionButton>
            </div>
          </div>
        ))}
        <ActionButton disabled={disabled} onClick={addColumn}>添加列</ActionButton>
      </div>
      <div className="course-flow-editor-table-wrap">
        <table aria-label={block.caption || '可编辑表格'}>
          <thead><tr>{block.columns.map((column) => <th key={column.id}>{column.header || '未命名列'}</th>)}</tr></thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={row.id}>
                {block.columns.map((column, columnIndex) => (
                  <td key={column.id}>
                    <label>
                      <span className="course-visually-hidden">第 {rowIndex + 1} 行第 {columnIndex + 1} 列</span>
                      <input
                        aria-label={`第 ${rowIndex + 1} 行第 ${columnIndex + 1} 列`}
                        value={row.cells[column.id] ?? ''}
                        disabled={disabled}
                        onChange={(event) => onChange({
                          ...block,
                          rows: block.rows.map((entry) => entry.id === row.id
                            ? { ...entry, cells: { ...entry.cells, [column.id]: event.currentTarget.value } }
                            : entry),
                        })}
                      />
                    </label>
                  </td>
                ))}
                <td>
                  <div className="course-property-actions">
                    <ActionButton aria-label={`上移第 ${rowIndex + 1} 行`} disabled={disabled || rowIndex === 0} onClick={() => onChange({ ...block, rows: moveEntry(block.rows, rowIndex, rowIndex - 1) })}>上移</ActionButton>
                    <ActionButton aria-label={`下移第 ${rowIndex + 1} 行`} disabled={disabled || rowIndex === block.rows.length - 1} onClick={() => onChange({ ...block, rows: moveEntry(block.rows, rowIndex, rowIndex + 1) })}>下移</ActionButton>
                    <ActionButton danger aria-label={`删除第 ${rowIndex + 1} 行`} disabled={disabled} onClick={() => onChange({ ...block, rows: block.rows.filter((entry) => entry.id !== row.id) })}>删除行</ActionButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActionButton disabled={disabled} onClick={addRow}>添加行</ActionButton>
    </>
  )
}

function FormulaEditor({ block, disabled, onChange }: {
  block: FormulaBlock
  disabled: boolean
  onChange(next: FormulaBlock): void
}) {
  const canonicalSource = useMemo(() => serializeFormulaAst(block.ast), [block.ast])
  const [source, setSource] = useState(canonicalSource)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setSource(canonicalSource)
    setError(null)
  }, [canonicalSource, block.id])
  const apply = () => {
    try {
      const ast = parseFormulaLinear(source)
      const previousAutomatic = block.accessibleText.replace(/\s+/gu, '') === formulaAstToAccessibleText(block.ast).replace(/\s+/gu, '')
      onChange({
        ...block,
        ast,
        accessibleText: previousAutomatic ? formulaAstToAccessibleText(ast) : block.accessibleText,
      })
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  return (
    <>
      <EditorField label="公式内容（线性输入）">
        <input
          value={source}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => { setSource(event.currentTarget.value); setError(null) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              apply()
            }
          }}
        />
      </EditorField>
      <p className="course-empty">可输入 x^2、a/b、\\sqrt&#123;x&#125;；应用后保存为结构化公式。</p>
      {error && <p role="alert">公式无法应用：{error}</p>}
      <ActionButton disabled={disabled || source === canonicalSource} onClick={apply}>应用公式</ActionButton>
      <EditorField label="公式朗读说明">
        <input value={block.accessibleText} disabled={disabled} onChange={(event) => onChange({ ...block, accessibleText: event.currentTarget.value })} />
      </EditorField>
    </>
  )
}

function CodeEditor({ block, disabled, onChange }: {
  block: CodeBlock
  disabled: boolean
  onChange(next: CodeBlock): void
}) {
  return (
    <>
      <EditorField label="代码语言">
        <input value={block.language ?? ''} disabled={disabled} placeholder="例如 Python" onChange={(event) => onChange({ ...block, language: definedText(event.currentTarget.value) })} />
      </EditorField>
      <EditorField label="代码内容">
        <textarea rows={10} spellCheck={false} value={block.code} disabled={disabled} onChange={(event) => onChange({ ...block, code: event.currentTarget.value })} />
      </EditorField>
    </>
  )
}

function SectionEditor({
  block,
  disabled,
  depth,
  idFactory,
  onChange,
  editorProps,
}: {
  block: SectionBlock
  disabled: boolean
  depth: number
  idFactory: FlowEditorIdFactory
  onChange(next: SectionBlock): void
  editorProps: Omit<FlowBlockEditorProps, 'block' | 'onChange' | 'disabled' | 'depth' | 'idFactory' | 'showHeader'>
}) {
  const [insertType, setInsertType] = useState<typeof FLOW_SECTION_INSERTABLE_TYPES[number]>('paragraph')
  const addChild = () => onChange({ ...block, blocks: [...block.blocks, createDefaultFlowBlock(insertType, idFactory)] })
  return (
    <>
      <EditorField label="分节标题">
        <input value={block.title} disabled={disabled} onChange={(event) => onChange({ ...block, title: event.currentTarget.value })} />
      </EditorField>
      <label className="course-check">
        <input type="checkbox" checked={block.collapsedByDefault} disabled={disabled} onChange={(event) => onChange({ ...block, collapsedByDefault: event.currentTarget.checked })} />
        默认折叠
      </label>
      <div role="list" aria-label={`${block.title}的内容`} className="course-flow-editor-section-children">
        {block.blocks.length === 0 && <p className="course-empty">这个分节还没有内容。</p>}
        {block.blocks.map((child, index) => (
          <article role="listitem" key={child.id}>
            <FlowBlockEditor
              {...editorProps}
              block={child}
              disabled={disabled}
              depth={depth + 1}
              idFactory={idFactory}
              onChange={(nextChild) => onChange({
                ...block,
                blocks: block.blocks.map((entry) => entry.id === child.id ? nextChild : entry),
              })}
            />
            <div className="course-property-actions">
              <ActionButton aria-label={`上移${flowBlockTypeLabel(child.type)} ${index + 1}`} disabled={disabled || index === 0} onClick={() => onChange({ ...block, blocks: moveEntry(block.blocks, index, index - 1) })}>上移</ActionButton>
              <ActionButton aria-label={`下移${flowBlockTypeLabel(child.type)} ${index + 1}`} disabled={disabled || index === block.blocks.length - 1} onClick={() => onChange({ ...block, blocks: moveEntry(block.blocks, index, index + 1) })}>下移</ActionButton>
              <ActionButton danger aria-label={`删除${flowBlockTypeLabel(child.type)} ${index + 1}`} disabled={disabled} onClick={() => onChange({ ...block, blocks: block.blocks.filter((entry) => entry.id !== child.id) })}>删除</ActionButton>
            </div>
          </article>
        ))}
      </div>
      <div className="course-field-grid">
        <EditorField label="添加内容类型">
          <select value={insertType} disabled={disabled} onChange={(event) => setInsertType(event.currentTarget.value as typeof insertType)}>
            {FLOW_SECTION_INSERTABLE_TYPES.map((type) => <option key={type} value={type}>{flowBlockTypeLabel(type)}</option>)}
          </select>
        </EditorField>
        <ActionButton disabled={disabled} onClick={addChild}>添加到分节</ActionButton>
      </div>
    </>
  )
}

function DividerEditor({ block: _block }: { block: DividerBlock }) {
  return <div aria-label="分隔线预览"><hr /><p className="course-empty">分隔线没有需要填写的内容。</p></div>
}

function MediaPreview({ block, url }: { block: MediaBlock; url?: string }) {
  if (!url) return <p className="course-empty">媒体已关联；替换或预览由工程素材库提供。</p>
  if (block.mediaKind === 'image') return <img src={url} alt={block.altText ?? ''} />
  if (block.mediaKind === 'audio') return <audio src={url} controls aria-label={block.altText || block.caption || '音频预览'} />
  return <video src={url} controls aria-label={block.altText || block.caption || '视频预览'} />
}

function MediaEditor({ block, disabled, url, onChange, onRequestReplace }: {
  block: MediaBlock
  disabled: boolean
  url?: string
  onChange(next: MediaBlock): void
  onRequestReplace?: (block: MediaBlock) => void
}) {
  return (
    <>
      <figure className="course-flow-live-media">
        <MediaPreview block={block} url={url} />
        {block.caption && <figcaption>{block.caption}</figcaption>}
      </figure>
      <div className="course-field-grid">
        <EditorField label="媒体类型">
          <output aria-label="媒体类型">{FLOW_MEDIA_KIND_LABELS[block.mediaKind]}</output>
        </EditorField>
        <EditorField label="显示宽度">
          <select value={block.layout} disabled={disabled} onChange={(event) => onChange({ ...block, layout: event.currentTarget.value as MediaBlock['layout'] })}>
            {Object.entries(FLOW_MEDIA_LAYOUT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </EditorField>
      </div>
      <EditorField label="无障碍说明">
        <input value={block.altText ?? ''} disabled={disabled} onChange={(event) => onChange({ ...block, altText: definedText(event.currentTarget.value) })} />
      </EditorField>
      <EditorField label="媒体说明">
        <input value={block.caption ?? ''} disabled={disabled} onChange={(event) => onChange({ ...block, caption: definedText(event.currentTarget.value) })} />
      </EditorField>
      <ActionButton disabled={disabled || !onRequestReplace} onClick={() => onRequestReplace?.(block)}>替换媒体</ActionButton>
      <p className="course-empty">媒体类型由所选素材决定；如需改成另一种媒体，请从元素面板重新插入。</p>
    </>
  )
}

type ComponentPropPath = Array<string | number>

interface ComponentPropLeaf {
  path: ComponentPropPath
  value: unknown
}

function componentPropLeaves(value: unknown, path: ComponentPropPath = []): ComponentPropLeaf[] {
  if (Array.isArray(value)) {
    return value.length === 0 ? [{ path, value }] : value.flatMap((entry, index) => componentPropLeaves(entry, [...path, index]))
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return entries.length === 0 ? [{ path, value }] : entries.flatMap(([key, entry]) => componentPropLeaves(entry, [...path, key]))
  }
  return [{ path, value }]
}

function setComponentPropAtPath(props: Record<string, unknown>, path: ComponentPropPath, value: unknown): Record<string, unknown> {
  const next = structuredClone(props)
  if (path.length === 0) return next
  let current: unknown = next
  for (let index = 0; index < path.length - 1; index += 1) {
    current = (current as Record<string | number, unknown>)[path[index]]
  }
  ;(current as Record<string | number, unknown>)[path.at(-1)!] = value
  return next
}

function ComponentPropInput({ label, value, disabled, onChange }: {
  label: string
  value: unknown
  disabled: boolean
  onChange(value: unknown): void
}) {
  if (typeof value === 'boolean') {
    return <label className="course-check"><input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />{label}</label>
  }
  if (typeof value === 'number') {
    return <EditorField label={label}><input type="number" value={value} disabled={disabled} onChange={(event) => { const next = Number(event.currentTarget.value); if (Number.isFinite(next)) onChange(next) }} /></EditorField>
  }
  if (typeof value === 'string') {
    return <EditorField label={label}>{value.includes('\n') || value.length > 120
      ? <textarea rows={4} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />
      : <input value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)} />}</EditorField>
  }
  return <p className="course-empty">{label}：当前值没有可直接编辑的基础字段。</p>
}

function ComponentEditor({
  block,
  disabled,
  labels,
  name,
  fallbackUrl,
  choices,
  onChange,
  onRequestReplace,
  onRequestReplaceFallback,
}: {
  block: ComponentBlock
  disabled: boolean
  labels: Readonly<Record<string, string>>
  name: string
  fallbackUrl?: string
  choices: readonly FlowComponentChoice[]
  onChange(next: ComponentBlock): void
  onRequestReplace?: (block: ComponentBlock, choice: FlowComponentChoice) => void
  onRequestReplaceFallback?: (block: ComponentBlock) => void
}) {
  const leaves = componentPropLeaves(block.props)
  const currentKey = `${block.component.packageId}@${block.component.version}`
  const replacementChoices = choices.filter((choice) => (
    `${choice.packageId}@${choice.version}` !== currentKey
  ))
  const [replacementKey, setReplacementKey] = useState('')
  useEffect(() => setReplacementKey(''), [currentKey])
  const replacement = replacementChoices.find((choice) => (
    `${choice.packageId}@${choice.version}` === replacementKey
  ))
  return (
    <>
      <section aria-label="当前互动组件">
        <h4>{name}</h4>
        <p className="course-empty">在试运行中查看互动效果；下方内容可直接调整。</p>
      </section>
      <section aria-label="组件属性">
        <h4>组件内容</h4>
        {leaves.length === 0 && <p className="course-empty">这个组件没有公开可编辑属性。</p>}
        {leaves.map((entry) => {
          const path = entry.path.join('.')
          const label = labels[path] ?? path
          return (
            <ComponentPropInput
              key={path}
              label={label}
              value={entry.value}
              disabled={disabled}
              onChange={(value) => onChange({ ...block, props: setComponentPropAtPath(block.props, entry.path, value) })}
            />
          )
        })}
      </section>
      <section aria-label="静态预览">
        <h4>静态预览</h4>
        <p className="course-empty">打印、导出讲义或组件暂时无法运行时，会显示这张图片。</p>
        {fallbackUrl
          ? (
              <figure className="course-flow-live-media">
                <img src={fallbackUrl} alt={`${name}的静态预览`} />
                <figcaption>{name}的静态预览</figcaption>
              </figure>
            )
          : <p role="status">当前静态预览无法显示，请重新选择图片。</p>}
        <div className="course-property-actions">
          {fallbackUrl && <a className="secondary-button" href={fallbackUrl} target="_blank" rel="noreferrer">查看大图</a>}
          <ActionButton disabled={disabled || !onRequestReplaceFallback} onClick={() => onRequestReplaceFallback?.(block)}>替换静态预览</ActionButton>
        </div>
      </section>
      <section aria-label="替换互动组件">
        <h4>替换互动组件</h4>
        {replacementChoices.length > 0
          ? (
              <>
                <EditorField label="替换为">
                  <select value={replacementKey} disabled={disabled} onChange={(event) => setReplacementKey(event.currentTarget.value)}>
                    <option value="">请选择已导入的互动组件</option>
                    {replacementChoices.map((choice) => (
                      <option key={`${choice.packageId}@${choice.version}`} value={`${choice.packageId}@${choice.version}`}>{choice.name}</option>
                    ))}
                  </select>
                </EditorField>
                <ActionButton disabled={disabled || !replacement || !onRequestReplace} onClick={() => replacement && onRequestReplace?.(block, replacement)}>应用替换</ActionButton>
              </>
            )
          : <p className="course-empty">请先从“元素”面板导入另一种互动组件。</p>}
      </section>
    </>
  )
}

export function FlowBlockEditor({
  block,
  onChange,
  disabled = false,
  depth = 0,
  idFactory = defaultIdFactory,
  resolveAssetUrl,
  onRequestReplaceMedia,
  componentName,
  resolveComponentName,
  componentChoices = [],
  onRequestReplaceComponent,
  onRequestReplaceComponentFallback,
  componentPropLabels = {},
  showHeader = true,
}: FlowBlockEditorProps) {
  const sharedProps = {
    resolveAssetUrl,
    onRequestReplaceMedia,
    componentName,
    resolveComponentName,
    componentChoices,
    onRequestReplaceComponent,
    onRequestReplaceComponentFallback,
    componentPropLabels,
  }
  let editor: ReactNode
  switch (block.type) {
    case 'heading': editor = <HeadingEditor block={block} disabled={disabled} onChange={onChange} />; break
    case 'paragraph': editor = <ParagraphEditor block={block} disabled={disabled} onChange={onChange} />; break
    case 'quote': editor = <QuoteEditor block={block} disabled={disabled} onChange={onChange} />; break
    case 'list': editor = <ListEditor block={block} disabled={disabled} idFactory={idFactory} onChange={onChange} />; break
    case 'callout': editor = <CalloutEditor block={block} disabled={disabled} onChange={onChange} />; break
    case 'table': editor = <TableEditor block={block} disabled={disabled} idFactory={idFactory} onChange={onChange} />; break
    case 'formula': editor = <FormulaEditor block={block} disabled={disabled} onChange={onChange} />; break
    case 'code': editor = <CodeEditor block={block} disabled={disabled} onChange={onChange} />; break
    case 'section': editor = (
      <SectionEditor
        block={block}
        disabled={disabled}
        depth={depth}
        idFactory={idFactory}
        onChange={onChange}
        editorProps={sharedProps}
      />
    ); break
    case 'divider': editor = <DividerEditor block={block} />; break
    case 'media': editor = (
      <MediaEditor
        block={block}
        disabled={disabled}
        url={resolveAssetUrl?.(block.assetId)}
        onChange={onChange}
        onRequestReplace={onRequestReplaceMedia}
      />
    ); break
    case 'component': editor = (
      <ComponentEditor
        block={block}
        disabled={disabled}
        labels={componentPropLabels}
        name={componentName ?? resolveComponentName?.(block) ?? '互动组件'}
        fallbackUrl={resolveAssetUrl?.(block.staticFallbackAssetId)}
        choices={componentChoices}
        onChange={onChange}
        onRequestReplace={onRequestReplaceComponent}
        onRequestReplaceFallback={onRequestReplaceComponentFallback}
      />
    ); break
  }
  const term = FLOW_BLOCK_TERMS[block.type]
  return (
    <section
      className="course-properties course-flow-block-editor"
      data-flow-block-type={block.type}
      data-flow-block-id={block.id}
      data-flow-depth={depth}
      aria-label={`${term.label}编辑器`}
    >
      {showHeader && <header><h3>{term.label}</h3><p>{term.description}</p></header>}
      {editor}
    </section>
  )
}

export function FlowBlockTypeOptions({ includeUnavailable = true }: { includeUnavailable?: boolean }) {
  const types = includeUnavailable ? FLOW_BLOCK_TYPE_ORDER : FLOW_SECTION_INSERTABLE_TYPES
  return <>{types.map((type) => <option key={type} value={type}>{flowBlockTypeLabel(type)}</option>)}</>
}
