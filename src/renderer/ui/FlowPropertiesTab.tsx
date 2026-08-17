import { useEffect, useRef, useState, type ComponentType } from 'react'
import {
  Box,
  Code2,
  Heading,
  ImageIcon,
  List,
  MessageSquare,
  Minus,
  PanelTop,
  Quote,
  Sigma,
  Table,
  Type,
} from 'lucide-react'
import type {
  FlowBlock,
  FlowCalloutBlock,
  FlowCodeBlock,
  FlowComponentBlock,
  FlowFormulaBlock,
  FlowHeadingBlock,
  FlowListBlock,
  FlowMediaBlock,
  FlowParagraphBlock,
  FlowQuoteBlock,
  FlowSectionBlock,
  FlowTableBlock,
} from '../../shared/courseProjectTypes'

export type FlowBlockPatch =
  | { type?: 'heading'; level?: FlowHeadingBlock['level']; text?: string }
  | { type?: 'paragraph'; text?: string }
  | { type?: 'list'; ordered?: boolean }
  | { type?: 'quote'; text?: string; citation?: string }
  | {
      type?: 'media'
      assetId?: string
      mediaKind?: FlowMediaBlock['mediaKind']
      altText?: string
      caption?: string
      layout?: FlowMediaBlock['layout']
    }
  | {
      type?: 'table'
      caption?: string
      columns?: FlowTableBlock['columns']
      rows?: FlowTableBlock['rows']
    }
  | { type?: 'formula'; accessibleText?: string }
  | { type?: 'code'; language?: string; code?: string }
  | {
      type?: 'callout'
      tone?: FlowCalloutBlock['tone']
      title?: string
      body?: string
    }
  | { type?: 'section'; title?: string; collapsedByDefault?: boolean }
  | {
      type?: 'component'
      component?: FlowComponentBlock['component']
      props?: Record<string, unknown>
      staticFallbackAssetId?: string
    }

export type FlowStructuralCommand =
  | { blockId: string; kind: 'list.addItem'; text: string }
  | { blockId: string; kind: 'list.deleteItem'; itemId: string }
  | { blockId: string; kind: 'list.editItem'; itemId: string; text: string }
  | { blockId: string; kind: 'list.reorderItem'; itemId: string; toIndex: number }
  | { blockId: string; kind: 'table.addColumn' }
  | { blockId: string; kind: 'table.deleteColumn'; columnId: string }
  | { blockId: string; kind: 'table.addRow' }
  | { blockId: string; kind: 'table.deleteRow'; rowId: string }

export interface FlowPropertiesTabProps {
  block: FlowBlock | null
  assets?: ReadonlyArray<{ id: string; label: string }>
  componentPackages?: ReadonlyArray<{ packageId: string; version: string }>
  onPatch?(blockId: string, patch: FlowBlockPatch): void
  onStructuralCommand?(command: FlowStructuralCommand): void
  /** Teacher-safe reason shown when structural commands (list items, table rows/columns) are not available. */
  structuralUnavailableReason?: string
  /** When true, body text inputs (heading/paragraph/quote body, list items) become an in-place editing hint. */
  inlineTextEditing?: boolean
}

type IconComponent = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>

function BlockSection({
  icon: Icon,
  title,
  testId,
  children,
}: {
  icon: IconComponent
  title: string
  testId: string
  children: React.ReactNode
}) {
  return (
    <section className="property-section" data-testid={testId}>
      <h3 className="property-title"><Icon size={14} aria-hidden />{title}</h3>
      {children}
    </section>
  )
}

function BufferedInput({
  label,
  value,
  disabled = false,
  onCommit,
}: {
  label: string
  value: string
  disabled?: boolean
  onCommit(value: string): void
}) {
  const [draft, setDraft] = useState(String(value))
  const cancelledRef = useRef(false)
  useEffect(() => {
    setDraft(String(value))
    cancelledRef.current = false
  }, [value])
  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false
      setDraft(String(value))
      return
    }
    const next = draft.trim()
    if (next === String(value)) return
    if (next) {
      onCommit(next)
      setDraft(next)
    } else {
      setDraft(String(value))
    }
  }
  return (
    <div className="form-field">
      <label>{label}</label>
      <input
        className="form-input"
        aria-label={label}
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          cancelledRef.current = false
          setDraft(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') {
            cancelledRef.current = true
            setDraft(String(value))
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

function BufferedTextArea({
  label,
  value,
  disabled = false,
  trim = true,
  onCommit,
}: {
  label: string
  value: string
  disabled?: boolean
  trim?: boolean
  onCommit(value: string): void
}) {
  const [draft, setDraft] = useState(String(value))
  const cancelledRef = useRef(false)
  useEffect(() => {
    setDraft(String(value))
    cancelledRef.current = false
  }, [value])
  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false
      setDraft(String(value))
      return
    }
    const next = trim ? draft.trim() : draft
    if (next === String(value)) return
    if (next || !trim) {
      onCommit(next)
      setDraft(next)
    } else {
      setDraft(String(value))
    }
  }
  return (
    <div className="form-field">
      <label>{label}</label>
      <textarea
        className="form-textarea"
        aria-label={label}
        value={draft}
        disabled={disabled}
        onChange={(event) => {
          cancelledRef.current = false
          setDraft(event.target.value)
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            cancelledRef.current = true
            setDraft(String(value))
            event.currentTarget.blur()
          }
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            commit()
            event.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}

function SelectField<T extends string | number>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  disabled?: boolean
  onChange(value: T): void
}) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <select
        className="form-input"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange(checked: boolean): void
}) {
  return (
    <div className="toggle-row">
      <span>{label}</span>
      <label className="toggle">
        <input
          type="checkbox"
          aria-label={label}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="toggle-track" />
      </label>
    </div>
  )
}

function InlineButton({
  label,
  testId,
  disabled = false,
  onClick,
}: {
  label: string
  testId: string
  disabled?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      className="secondary-button"
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

/** C2: light teacher-facing hint shown when a body text field is edited in place. */
function InlineTextEditingHint({ label }: { label: string }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <p className="property-hint" role="status" data-testid="flow-inline-text-editing-hint">
        请在正文中就地编辑
      </p>
    </div>
  )
}

function HeadingEditor({
  block,
  disabled,
  inlineTextEditing,
  onPatch,
}: {
  block: FlowHeadingBlock
  disabled: boolean
  inlineTextEditing: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  return (
    <BlockSection icon={Heading} title="标题" testId="flow-editor-heading">
      <SelectField<FlowHeadingBlock['level']>
        label="标题级别"
        value={block.level}
        disabled={disabled}
        options={[
          { value: 1, label: '一级标题' },
          { value: 2, label: '二级标题' },
          { value: 3, label: '三级标题' },
          { value: 4, label: '四级标题' },
          { value: 5, label: '五级标题' },
          { value: 6, label: '六级标题' },
        ]}
        onChange={(level) => onPatch(block.id, { level: Number(level) as FlowHeadingBlock['level'] })}
      />
      {inlineTextEditing
        ? <InlineTextEditingHint label="标题文本" />
        : (
            <BufferedInput
              label="标题文本"
              value={block.text}
              disabled={disabled}
              onCommit={(text) => onPatch(block.id, { text })}
            />
          )}
    </BlockSection>
  )
}

function ParagraphEditor({
  block,
  disabled,
  inlineTextEditing,
  onPatch,
}: {
  block: FlowParagraphBlock
  disabled: boolean
  inlineTextEditing: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  return (
    <BlockSection icon={Type} title="段落" testId="flow-editor-paragraph">
      {inlineTextEditing
        ? <InlineTextEditingHint label="段落文本" />
        : (
            <BufferedTextArea
              label="段落文本"
              value={block.text}
              disabled={disabled}
              onCommit={(text) => onPatch(block.id, { text })}
            />
          )}
    </BlockSection>
  )
}

function ListEditor({
  block,
  disabled,
  structuralDisabled,
  structuralUnavailableReason,
  inlineTextEditing,
  onPatch,
  onStructuralCommand,
}: {
  block: FlowListBlock
  disabled: boolean
  structuralDisabled: boolean
  structuralUnavailableReason?: string
  inlineTextEditing: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
  onStructuralCommand(command: FlowStructuralCommand): void
}) {
  return (
    <BlockSection icon={List} title="列表" testId="flow-editor-list">
      {structuralDisabled && (
        <p
          className="property-hint"
          role="status"
          data-testid="flow-structural-unavailable-reason"
        >
          {structuralUnavailableReason ?? '当前内容块暂不支持结构编辑，请使用其他方式调整内容。'}
        </p>
      )}
      <ToggleRow
        label="有序列表"
        checked={block.ordered}
        disabled={disabled}
        onChange={(ordered) => onPatch(block.id, { ordered })}
      />
      <div className="form-field">
        <label>列表项</label>
        <div className="flow-list-items">
          {block.items.map((item, index) => (
            <div className="flow-list-item" key={item.id} data-testid={`flow-list-item-${index + 1}`}>
              {inlineTextEditing
                ? <InlineTextEditingHint label={`列表项 ${index + 1}`} />
                : (
                    <BufferedInput
                      label={`列表项 ${index + 1}`}
                      value={item.text}
                      disabled={structuralDisabled}
                      onCommit={(text) => onStructuralCommand({
                        blockId: block.id,
                        kind: 'list.editItem',
                        itemId: item.id,
                        text,
                      })}
                    />
                  )}
              <div className="flow-list-item-actions">
                <InlineButton
                  label={`上移列表项 ${index + 1}`}
                  testId={`flow-list-item-${index + 1}-move-up`}
                  disabled={structuralDisabled || index === 0}
                  onClick={() => onStructuralCommand({
                    blockId: block.id,
                    kind: 'list.reorderItem',
                    itemId: item.id,
                    toIndex: index - 1,
                  })}
                />
                <InlineButton
                  label={`下移列表项 ${index + 1}`}
                  testId={`flow-list-item-${index + 1}-move-down`}
                  disabled={structuralDisabled || index === block.items.length - 1}
                  onClick={() => onStructuralCommand({
                    blockId: block.id,
                    kind: 'list.reorderItem',
                    itemId: item.id,
                    toIndex: index + 1,
                  })}
                />
                <InlineButton
                  label={`删除列表项 ${index + 1}`}
                  testId={`flow-list-item-${index + 1}-delete`}
                  disabled={structuralDisabled}
                  onClick={() => onStructuralCommand({
                    blockId: block.id,
                    kind: 'list.deleteItem',
                    itemId: item.id,
                  })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      <InlineButton
        label="添加列表项"
        testId="flow-list-add-item"
        disabled={structuralDisabled}
        onClick={() => onStructuralCommand({ blockId: block.id, kind: 'list.addItem', text: '新列表项' })}
      />
    </BlockSection>
  )
}

function QuoteEditor({
  block,
  disabled,
  inlineTextEditing,
  onPatch,
}: {
  block: FlowQuoteBlock
  disabled: boolean
  inlineTextEditing: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  return (
    <BlockSection icon={Quote} title="引用" testId="flow-editor-quote">
      {inlineTextEditing
        ? <InlineTextEditingHint label="引用内容" />
        : (
            <BufferedTextArea
              label="引用内容"
              value={block.text}
              disabled={disabled}
              onCommit={(text) => onPatch(block.id, { text })}
            />
          )}
      <BufferedInput
        label="出处"
        value={block.citation ?? ''}
        disabled={disabled}
        onCommit={(citation) => onPatch(block.id, { citation })}
      />
    </BlockSection>
  )
}

function MediaEditor({
  block,
  assets,
  disabled,
  onPatch,
}: {
  block: FlowMediaBlock
  assets: ReadonlyArray<{ id: string; label: string }>
  disabled: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  return (
    <BlockSection icon={ImageIcon} title="媒体" testId="flow-editor-media">
      <SelectField<string>
        label="素材"
        value={block.assetId}
        disabled={disabled || assets.length === 0}
        options={assets.length > 0
          ? assets.map((asset) => ({ value: asset.id, label: asset.label }))
          : [{ value: block.assetId, label: block.assetId || '暂无素材' }]}
        onChange={(assetId) => onPatch(block.id, { assetId })}
      />
      {assets.length === 0 && (
        <p className="property-hint" role="status">当前工程没有可用素材，请先导入图片、音频或视频。</p>
      )}
      <SelectField<FlowMediaBlock['mediaKind']>
        label="媒体类型"
        value={block.mediaKind}
        disabled={disabled}
        options={[
          { value: 'image', label: '图片' },
          { value: 'audio', label: '音频' },
          { value: 'video', label: '视频' },
        ]}
        onChange={(mediaKind) => onPatch(block.id, { mediaKind })}
      />
      <SelectField<FlowMediaBlock['layout']>
        label="版式"
        value={block.layout}
        disabled={disabled}
        options={[
          { value: 'content-width', label: '正文宽度' },
          { value: 'wide', label: '宽版' },
          { value: 'full-width', label: '全宽' },
        ]}
        onChange={(layout) => onPatch(block.id, { layout })}
      />
      <BufferedInput
        label="标题说明"
        value={block.caption ?? ''}
        disabled={disabled}
        onCommit={(caption) => onPatch(block.id, { caption })}
      />
      <BufferedInput
        label="替代文本"
        value={block.altText ?? ''}
        disabled={disabled}
        onCommit={(altText) => onPatch(block.id, { altText })}
      />
    </BlockSection>
  )
}

function TableEditor({
  block,
  disabled,
  structuralDisabled,
  structuralUnavailableReason,
  onPatch,
  onStructuralCommand,
}: {
  block: FlowTableBlock
  disabled: boolean
  structuralDisabled: boolean
  structuralUnavailableReason?: string
  onPatch(blockId: string, patch: FlowBlockPatch): void
  onStructuralCommand(command: FlowStructuralCommand): void
}) {
  const commitColumns = (columns: FlowTableBlock['columns']) => onPatch(block.id, { columns })
  const commitRows = (rows: FlowTableBlock['rows']) => onPatch(block.id, { rows })
  return (
    <BlockSection icon={Table} title="表格" testId="flow-editor-table">
      {structuralDisabled && (
        <p
          className="property-hint"
          role="status"
          data-testid="flow-structural-unavailable-reason"
        >
          {structuralUnavailableReason ?? '当前内容块暂不支持结构编辑，请使用其他方式调整内容。'}
        </p>
      )}
      <BufferedInput
        label="表格标题"
        value={block.caption ?? ''}
        disabled={disabled}
        onCommit={(caption) => onPatch(block.id, { caption })}
      />
      <div className="form-field">
        <label>列</label>
        {block.columns.map((column, columnIndex) => (
          <div className="flow-table-column" key={column.id} data-testid={`flow-table-column-${columnIndex + 1}`}>
            <BufferedInput
              label={`列 ${columnIndex + 1} 标题`}
              value={column.header}
              disabled={disabled}
              onCommit={(header) => commitColumns(block.columns.map((candidate) => (
                candidate.id === column.id ? { ...candidate, header } : candidate
              )))}
            />
            <InlineButton
              label={`删除列 ${columnIndex + 1}`}
              testId={`flow-table-column-${columnIndex + 1}-delete`}
              disabled={structuralDisabled}
              onClick={() => onStructuralCommand({
                blockId: block.id,
                kind: 'table.deleteColumn',
                columnId: column.id,
              })}
            />
          </div>
        ))}
      </div>
      <InlineButton
        label="添加列"
        testId="flow-table-add-column"
        disabled={structuralDisabled}
        onClick={() => onStructuralCommand({ blockId: block.id, kind: 'table.addColumn' })}
      />
      <div className="form-field">
        <label>行</label>
        {block.rows.map((row, rowIndex) => (
          <div className="flow-table-row" key={row.id} data-testid={`flow-table-row-${rowIndex + 1}`}>
            <div className="flow-table-cells">
              {block.columns.map((column, columnIndex) => (
                <BufferedInput
                  key={column.id}
                  label={`第 ${rowIndex + 1} 行 ${column.header || `列 ${columnIndex + 1}`}`}
                  value={row.cells[column.id] ?? ''}
                  disabled={disabled}
                  onCommit={(text) => commitRows(block.rows.map((candidate) => (
                    candidate.id === row.id
                      ? { ...candidate, cells: { ...candidate.cells, [column.id]: text } }
                      : candidate
                  )))}
                />
              ))}
            </div>
            <InlineButton
              label={`删除行 ${rowIndex + 1}`}
              testId={`flow-table-row-${rowIndex + 1}-delete`}
              disabled={structuralDisabled}
              onClick={() => onStructuralCommand({
                blockId: block.id,
                kind: 'table.deleteRow',
                rowId: row.id,
              })}
            />
          </div>
        ))}
      </div>
      <InlineButton
        label="添加行"
        testId="flow-table-add-row"
        disabled={structuralDisabled}
        onClick={() => onStructuralCommand({ blockId: block.id, kind: 'table.addRow' })}
      />
    </BlockSection>
  )
}

function FormulaEditor({
  block,
  disabled,
  onPatch,
}: {
  block: FlowFormulaBlock
  disabled: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  return (
    <BlockSection icon={Sigma} title="公式" testId="flow-editor-formula">
      <BufferedTextArea
        label="公式说明（无障碍文本）"
        value={block.accessibleText}
        disabled={disabled}
        onCommit={(accessibleText) => onPatch(block.id, { accessibleText })}
      />
      <p className="property-hint">公式内容由公式编辑器维护，这里用于教师修改无障碍说明。</p>
    </BlockSection>
  )
}

function CodeEditor({
  block,
  disabled,
  onPatch,
}: {
  block: FlowCodeBlock
  disabled: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  return (
    <BlockSection icon={Code2} title="代码" testId="flow-editor-code">
      <BufferedInput
        label="语言"
        value={block.language ?? ''}
        disabled={disabled}
        onCommit={(language) => onPatch(block.id, { language })}
      />
      <BufferedTextArea
        label="代码"
        value={block.code}
        disabled={disabled}
        trim={false}
        onCommit={(code) => onPatch(block.id, { code })}
      />
    </BlockSection>
  )
}

function CalloutEditor({
  block,
  disabled,
  onPatch,
}: {
  block: FlowCalloutBlock
  disabled: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  return (
    <BlockSection icon={MessageSquare} title="提示块" testId="flow-editor-callout">
      <SelectField<FlowCalloutBlock['tone']>
        label="提示类型"
        value={block.tone}
        disabled={disabled}
        options={[
          { value: 'note', label: '笔记' },
          { value: 'example', label: '示例' },
          { value: 'warning', label: '警告' },
          { value: 'conclusion', label: '总结' },
        ]}
        onChange={(tone) => onPatch(block.id, { tone })}
      />
      <BufferedInput
        label="标题"
        value={block.title ?? ''}
        disabled={disabled}
        onCommit={(title) => onPatch(block.id, { title })}
      />
      <BufferedTextArea
        label="正文"
        value={block.body}
        disabled={disabled}
        onCommit={(body) => onPatch(block.id, { body })}
      />
    </BlockSection>
  )
}

function SectionEditor({
  block,
  disabled,
  onPatch,
}: {
  block: FlowSectionBlock
  disabled: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  return (
    <BlockSection icon={PanelTop} title="分节" testId="flow-editor-section">
      <BufferedInput
        label="分节标题"
        value={block.title}
        disabled={disabled}
        onCommit={(title) => onPatch(block.id, { title })}
      />
      <ToggleRow
        label="默认折叠"
        checked={block.collapsedByDefault}
        disabled={disabled}
        onChange={(collapsedByDefault) => onPatch(block.id, { collapsedByDefault })}
      />
      <p className="property-hint">分节内的内容块可在左侧 Flow 大纲中展开或折叠。</p>
    </BlockSection>
  )
}

function ComponentEditor({
  block,
  assets,
  componentPackages,
  disabled,
  onPatch,
}: {
  block: FlowComponentBlock
  assets: ReadonlyArray<{ id: string; label: string }>
  componentPackages: ReadonlyArray<{ packageId: string; version: string }>
  disabled: boolean
  onPatch(blockId: string, patch: FlowBlockPatch): void
}) {
  const currentPackage = `${block.component.packageId}@${block.component.version}`
  const packageOptions = componentPackages.length > 0
    ? componentPackages.map((item) => ({
        value: `${item.packageId}@${item.version}`,
        label: `${item.packageId}@${item.version}`,
      }))
    : [{ value: currentPackage, label: currentPackage || '暂无组件包' }]
  const [propsDraft, setPropsDraft] = useState(() => JSON.stringify(block.props, null, 2))
  const [propsError, setPropsError] = useState('')
  useEffect(() => {
    setPropsDraft(JSON.stringify(block.props, null, 2))
    setPropsError('')
  }, [block.props, block.id])
  const commitProps = () => {
    try {
      const parsed: unknown = JSON.parse(propsDraft)
      if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error('not an object')
      }
      setPropsError('')
      onPatch(block.id, { props: parsed as Record<string, unknown> })
    } catch {
      setPropsError('互动组件属性必须是有效的 JSON 对象。')
    }
  }
  return (
    <BlockSection icon={Box} title="互动组件" testId="flow-editor-component">
      <SelectField<string>
        label="组件包"
        value={currentPackage}
        disabled={disabled || componentPackages.length === 0}
        options={packageOptions}
        onChange={(nextPackage) => {
          const separator = nextPackage.lastIndexOf('@')
          if (separator <= 0) return
          const packageId = nextPackage.slice(0, separator)
          const version = nextPackage.slice(separator + 1)
          onPatch(block.id, { component: { packageId, version } })
        }}
      />
      {componentPackages.length === 0 && (
        <p className="property-hint" role="status">当前工程没有已嵌入的互动组件包。</p>
      )}
      <div className="form-field">
        <label>互动组件属性 JSON</label>
        <textarea
          className="form-textarea"
          aria-label="互动组件属性 JSON"
          data-testid="flow-component-props-json"
          value={propsDraft}
          disabled={disabled}
          onChange={(event) => {
            setPropsDraft(event.target.value)
            setPropsError('')
          }}
          onBlur={commitProps}
        />
        {propsError && (
          <p className="property-hint" role="status" data-testid="flow-component-props-error">
            {propsError}
          </p>
        )}
      </div>
      {assets.length > 0 ? (
        <SelectField<string>
          label="静态替代素材"
          value={block.staticFallbackAssetId}
          disabled={disabled}
          options={assets.map((asset) => ({ value: asset.id, label: asset.label }))}
          onChange={(staticFallbackAssetId) => onPatch(block.id, { staticFallbackAssetId })}
        />
      ) : (
        <BufferedInput
          label="静态替代素材"
          value={block.staticFallbackAssetId}
          disabled={disabled}
          onCommit={(staticFallbackAssetId) => onPatch(block.id, { staticFallbackAssetId })}
        />
      )}
    </BlockSection>
  )
}

function FlowPropertiesEmpty() {
  return (
    <div className="properties-scroll" data-testid="flow-properties-tab">
      <section
        className="property-section flow-properties-empty"
        data-testid="flow-properties-empty"
        aria-disabled="true"
      >
        <h3 className="property-title"><Type size={14} aria-hidden="true" />内容块属性</h3>
        <p className="property-hint" role="status">请先在 Flow 文档中选择一个内容块。</p>
        <button type="button" className="secondary-button" disabled>选择内容块后可编辑</button>
      </section>
    </div>
  )
}

export function FlowPropertiesTab({
  block,
  assets = [],
  componentPackages = [],
  onPatch,
  onStructuralCommand,
  structuralUnavailableReason,
  inlineTextEditing = false,
}: FlowPropertiesTabProps) {
  if (!block) {
    return <FlowPropertiesEmpty />
  }

  const disabled = !onPatch
  const structuralDisabled = !onStructuralCommand
  const patch = (blockId: string, nextPatch: FlowBlockPatch) => onPatch?.(blockId, nextPatch)
  const structural = (command: FlowStructuralCommand) => onStructuralCommand?.(command)

  return (
    <div className="properties-scroll" data-testid="flow-properties-tab">
      {block.type === 'heading' && (
        <HeadingEditor
          block={block}
          disabled={disabled}
          inlineTextEditing={inlineTextEditing}
          onPatch={patch}
        />
      )}
      {block.type === 'paragraph' && (
        <ParagraphEditor
          block={block}
          disabled={disabled}
          inlineTextEditing={inlineTextEditing}
          onPatch={patch}
        />
      )}
      {block.type === 'list' && (
        <ListEditor
          block={block}
          disabled={disabled}
          structuralDisabled={structuralDisabled}
          structuralUnavailableReason={structuralUnavailableReason}
          inlineTextEditing={inlineTextEditing}
          onPatch={patch}
          onStructuralCommand={structural}
        />
      )}
      {block.type === 'quote' && (
        <QuoteEditor
          block={block}
          disabled={disabled}
          inlineTextEditing={inlineTextEditing}
          onPatch={patch}
        />
      )}
      {block.type === 'divider' && (
        <BlockSection icon={Minus} title="分隔线" testId="flow-editor-divider">
          <p className="property-hint">分隔线没有可编辑属性，仅用于文档中的视觉分隔。</p>
        </BlockSection>
      )}
      {block.type === 'media' && (
        <MediaEditor block={block} assets={assets} disabled={disabled} onPatch={patch} />
      )}
      {block.type === 'table' && (
        <TableEditor
          block={block}
          disabled={disabled}
          structuralDisabled={structuralDisabled}
          structuralUnavailableReason={structuralUnavailableReason}
          onPatch={patch}
          onStructuralCommand={structural}
        />
      )}
      {block.type === 'formula' && (
        <FormulaEditor block={block} disabled={disabled} onPatch={patch} />
      )}
      {block.type === 'code' && (
        <CodeEditor block={block} disabled={disabled} onPatch={patch} />
      )}
      {block.type === 'callout' && (
        <CalloutEditor block={block} disabled={disabled} onPatch={patch} />
      )}
      {block.type === 'section' && (
        <SectionEditor block={block} disabled={disabled} onPatch={patch} />
      )}
      {block.type === 'component' && (
        <ComponentEditor
          block={block}
          assets={assets}
          componentPackages={componentPackages}
          disabled={disabled}
          onPatch={patch}
        />
      )}
    </div>
  )
}
