import { nanoid } from 'nanoid'
import { useId, useState } from 'react'
import {
  Box,
  Code2,
  Heading,
  ImageIcon,
  List,
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
  FlowDividerBlock,
  FlowFormulaBlock,
  FlowHeadingBlock,
  FlowListBlock,
  FlowMediaBlock,
  FlowParagraphBlock,
  FlowQuoteBlock,
  FlowSectionBlock,
  FlowTableBlock,
} from '../../shared/courseProjectTypes'

type BlockIdOptional<Block extends FlowBlock> = Omit<Block, 'id'> & { id?: string }

export type FlowHeadingInsertRequest = BlockIdOptional<FlowHeadingBlock>
export type FlowParagraphInsertRequest = BlockIdOptional<FlowParagraphBlock>
export type FlowListInsertRequest = BlockIdOptional<FlowListBlock>
export type FlowQuoteInsertRequest = BlockIdOptional<FlowQuoteBlock>
export type FlowDividerInsertRequest = BlockIdOptional<FlowDividerBlock>
export type FlowMediaInsertRequest = BlockIdOptional<FlowMediaBlock>
export type FlowTableInsertRequest = BlockIdOptional<FlowTableBlock>
export type FlowFormulaInsertRequest = BlockIdOptional<FlowFormulaBlock>
export type FlowCodeInsertRequest = BlockIdOptional<FlowCodeBlock>
export type FlowCalloutInsertRequest = BlockIdOptional<FlowCalloutBlock>
export type FlowSectionInsertRequest = BlockIdOptional<FlowSectionBlock>
export type FlowComponentInsertRequest = BlockIdOptional<FlowComponentBlock>

export type FlowBlockInsertRequest =
  | FlowHeadingInsertRequest
  | FlowParagraphInsertRequest
  | FlowListInsertRequest
  | FlowQuoteInsertRequest
  | FlowDividerInsertRequest
  | FlowMediaInsertRequest
  | FlowTableInsertRequest
  | FlowFormulaInsertRequest
  | FlowCodeInsertRequest
  | FlowCalloutInsertRequest
  | FlowSectionInsertRequest
  | FlowComponentInsertRequest

export interface FlowElementsTabProps {
  onInsert(request: FlowBlockInsertRequest): void
  /** When both this callback and `nestedSectionId` are present, a local
   *  "insert into current section" toggle is shown and used on click. */
  onInsertNested?(sectionId: string, request: FlowBlockInsertRequest): void
  disabledReason?: string
  nestedSectionId?: string
}

interface FlowBlockTypeMeta {
  type: FlowBlock['type']
  label: string
  icon: typeof Type
  testId: string
}

const FLOW_BLOCK_TYPES: readonly FlowBlockTypeMeta[] = [
  { type: 'heading', label: '标题', icon: Heading, testId: 'add-flow-heading' },
  { type: 'paragraph', label: '段落', icon: Type, testId: 'add-flow-paragraph' },
  { type: 'list', label: '列表', icon: List, testId: 'add-flow-list' },
  { type: 'quote', label: '引用', icon: Quote, testId: 'add-flow-quote' },
  { type: 'divider', label: '分隔线', icon: Minus, testId: 'add-flow-divider' },
  { type: 'media', label: '媒体', icon: ImageIcon, testId: 'add-flow-media' },
  { type: 'table', label: '表格', icon: Table, testId: 'add-flow-table' },
  { type: 'formula', label: '公式', icon: Sigma, testId: 'add-flow-formula' },
  { type: 'code', label: '代码', icon: Code2, testId: 'add-flow-code' },
  { type: 'callout', label: '提示块', icon: Quote, testId: 'add-flow-callout' },
  { type: 'section', label: '分节', icon: PanelTop, testId: 'add-flow-section' },
  { type: 'component', label: '互动组件', icon: Box, testId: 'add-flow-component' },
]

function clientTempId(prefix: string): string {
  return `${prefix}-${nanoid(10)}`
}

/** Builds a complete insert request with safe, teacher-facing defaults.
 *  Top-level block ids are generated here because the command layer accepts
 *  an optional id and uses it as the preferred stable id. Nested child ids
 *  (list items, table rows, formula) are also generated when the command
 *  layer requires complete child records on insert. */
export function createFlowBlockInsertRequest(
  type: FlowBlock['type'],
): FlowBlockInsertRequest {
  switch (type) {
    case 'heading':
      return { id: clientTempId('block'), type, level: 2, text: '新标题' }
    case 'paragraph':
      return { id: clientTempId('block'), type, text: '在这里编辑正文……' }
    case 'quote':
      return { id: clientTempId('block'), type, text: '引用内容', citation: '出处' }
    case 'list':
      return {
        id: clientTempId('block'),
        type,
        ordered: false,
        items: [{ id: clientTempId('item'), text: '列表项' }],
      }
    case 'divider':
      return { id: clientTempId('block'), type }
    case 'media':
      // The command layer is expected to reject or fill an empty asset id
      // with a teacher-safe message before the block becomes persisted data.
      return {
        id: clientTempId('block'),
        type,
        assetId: '',
        mediaKind: 'image',
        altText: '',
        caption: '',
        layout: 'content-width',
      }
    case 'table':
      return {
        id: clientTempId('block'),
        type,
        caption: '表格',
        columns: [
          { id: 'column-a', header: '项目' },
          { id: 'column-b', header: '内容' },
        ],
        rows: [{
          id: clientTempId('row'),
          cells: { 'column-a': '示例', 'column-b': '可编辑' },
        }],
      }
    case 'formula':
      return {
        id: clientTempId('block'),
        type,
        formulaId: clientTempId('formula'),
        accessibleText: 'x 的平方',
        ast: {
          type: 'script',
          base: { type: 'token', value: 'x' },
          superscript: { type: 'token', value: '2' },
        },
      }
    case 'code':
      return {
        id: clientTempId('block'),
        type,
        language: 'text',
        code: '在这里编辑代码',
      }
    case 'callout':
      return {
        id: clientTempId('block'),
        type,
        tone: 'note',
        title: '提示',
        body: '在这里编辑提示内容。',
      }
    case 'section':
      return {
        id: clientTempId('block'),
        type,
        title: '可折叠分节',
        collapsedByDefault: false,
        blocks: [],
      }
    case 'component':
      return {
        id: clientTempId('block'),
        type,
        component: { packageId: '', version: '' },
        props: {},
        staticFallbackAssetId: '',
      }
  }
}

export function FlowElementsTab({
  onInsert,
  onInsertNested,
  disabledReason,
  nestedSectionId,
}: FlowElementsTabProps) {
  const toggleId = useId()
  const [insertNested, setInsertNested] = useState(false)
  const disabled = Boolean(disabledReason)
  const canNest = Boolean(onInsertNested) && Boolean(nestedSectionId)

  const handleInsert = (request: FlowBlockInsertRequest) => {
    if (disabled) return
    if (canNest && insertNested && onInsertNested && nestedSectionId) {
      onInsertNested(nestedSectionId, request)
      return
    }
    onInsert(request)
  }

  return (
    <div className="elements-scroll" data-testid="flow-elements-tab" aria-disabled={disabled}>
      <div className="section-heading section-heading--spaced">
        <span>Flow 内容块</span>
        <Type size={14} aria-hidden="true" />
      </div>

      {disabledReason && (
        <div className="empty-state add-category-empty" role="status" data-testid="flow-elements-disabled-reason">
          {disabledReason}
        </div>
      )}

      {canNest && (
        <div className="toggle-row" data-testid="flow-nested-insert-toggle">
          <span>插入到当前分节</span>
          <label className="toggle">
            <input
              id={toggleId}
              type="checkbox"
              aria-label="插入到当前分节"
              checked={insertNested}
              disabled={disabled}
              onChange={(event) => setInsertNested(event.target.checked)}
            />
            <span className="toggle-track" />
          </label>
        </div>
      )}

      <div className="element-grid" role="group" aria-label="Flow 内容块类型">
        {FLOW_BLOCK_TYPES.map(({ type, label, icon: Icon, testId }) => (
          <button
            key={type}
            type="button"
            className="element-card"
            aria-label={label}
            data-testid={testId}
            disabled={disabled}
            title={disabled ? disabledReason : `插入${label}`}
            onClick={() => handleInsert(createFlowBlockInsertRequest(type))}
          >
            <span className="element-icon">
              <Icon size={20} aria-hidden="true" />
            </span>
            {label}
          </button>
        ))}
      </div>

      {disabled && !disabledReason && (
        <p className="property-hint" role="status">当前无法插入 Flow 内容块。</p>
      )}
    </div>
  )
}
