import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { serializeFormulaAst } from '../../shared/formulaLinear'
import type { FormulaAstNode } from '../../shared/projectTypes'
import type { FlowBlockView, FlowEditorView } from '../course/flowEditorView'

export type FlowBlockMoveDirection = 'up' | 'down' | 'left' | 'right'

export interface FlowStructuralActionProps {
  readonly onDeleteBlock?: (blockId: string) => void
  readonly onDuplicateBlock?: (blockId: string) => void
  readonly onMoveBlock?: (blockId: string, direction: FlowBlockMoveDirection) => void
}

export interface FlowWorkspaceProps extends FlowStructuralActionProps {
  readonly view: FlowEditorView
  readonly selectedBlockId?: string | null
  readonly onSelectBlock?: (blockId: string) => void
  readonly readOnly?: boolean
}

function flowBlockFrameProps(
  blockView: FlowBlockView,
  selected: boolean,
  readOnly: boolean,
  onSelectBlock?: (blockId: string) => void,
): {
    'data-flow-block-id': string
    'data-flow-parent-id': string
    className: string
    'aria-selected': boolean
    onClick?: (event: MouseEvent<HTMLElement>) => void
  } {
  return {
    'data-flow-block-id': blockView.blockId,
    'data-flow-parent-id': blockView.parentId ?? '',
    className: `flow-block flow-block-${blockView.block.type}${selected ? ' flow-block--selected' : ''}`,
    'aria-selected': selected,
    ...(readOnly || !onSelectBlock ? {} : {
      onClick: (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        onSelectBlock(blockView.blockId)
      },
    }),
  }
}

function FlowBlockActionToolbar({
  blockId,
  readOnly,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
}: {
  blockId: string
  readOnly: boolean
  onDeleteBlock?: (blockId: string) => void
  onDuplicateBlock?: (blockId: string) => void
  onMoveBlock?: (blockId: string, direction: FlowBlockMoveDirection) => void
}) {
  if (!onDeleteBlock && !onDuplicateBlock && !onMoveBlock) return null
  return (
    <div
      className="flow-block-toolbar"
      role="toolbar"
      aria-label="内容块操作"
      data-testid="flow-workspace-block-toolbar"
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '6px 0' }}
    >
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-delete"
        aria-label="删除"
        disabled={readOnly || !onDeleteBlock}
        onClick={() => onDeleteBlock?.(blockId)}
      >
        删除
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-duplicate"
        aria-label="复制"
        disabled={readOnly || !onDuplicateBlock}
        onClick={() => onDuplicateBlock?.(blockId)}
      >
        复制
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-move-up"
        aria-label="上移"
        disabled={readOnly || !onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'up')}
      >
        上移
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-move-down"
        aria-label="下移"
        disabled={readOnly || !onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'down')}
      >
        下移
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-promote"
        aria-label="提升层级"
        disabled={readOnly || !onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'left')}
      >
        提升层级
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-demote"
        aria-label="降低层级"
        disabled={readOnly || !onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'right')}
      >
        降低层级
      </button>
    </div>
  )
}

function FlowListItem({
  blockView,
  childrenByParent,
  selectedBlockId,
  readOnly,
  onSelectBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
}: {
  blockView: FlowBlockView
  childrenByParent: Map<string | null, FlowBlockView[]>
  selectedBlockId: string | null | undefined
  readOnly: boolean
  onSelectBlock?: (blockId: string) => void
  onDeleteBlock?: (blockId: string) => void
  onDuplicateBlock?: (blockId: string) => void
  onMoveBlock?: (blockId: string, direction: FlowBlockMoveDirection) => void
}): ReactNode {
  const block = blockView.block
  const selected = blockView.blockId === selectedBlockId
  const props = flowBlockFrameProps(blockView, selected, readOnly, onSelectBlock)

  let rendered: ReactNode
  switch (block.type) {
    case 'heading':
      switch (block.level) {
        case 1: rendered = <h1 {...props}>{block.text}</h1>; break
        case 2: rendered = <h2 {...props}>{block.text}</h2>; break
        case 3: rendered = <h3 {...props}>{block.text}</h3>; break
        case 4: rendered = <h4 {...props}>{block.text}</h4>; break
        case 5: rendered = <h5 {...props}>{block.text}</h5>; break
        case 6: rendered = <h6 {...props}>{block.text}</h6>; break
        default: rendered = null
      }
      break
    case 'paragraph':
      rendered = <p {...props}>{block.text}</p>
      break
    case 'quote':
      rendered = (
        <blockquote {...props}>
          <p>{block.text}</p>
          {block.citation ? <cite>{block.citation}</cite> : null}
        </blockquote>
      )
      break
    case 'list':
      rendered = block.ordered
        ? <ol {...props}>{block.items.map((item) => <li key={item.id} data-flow-list-item-id={item.id}>{item.text}</li>)}</ol>
        : <ul {...props}>{block.items.map((item) => <li key={item.id} data-flow-list-item-id={item.id}>{item.text}</li>)}</ul>
      break
    case 'divider':
      rendered = <hr {...props} />
      break
    case 'media': {
      const isImage = block.mediaKind === 'image'
      rendered = (
        <figure {...props} data-flow-media-layout={block.layout}>
          {isImage
            ? <img data-flow-asset-id={block.assetId} alt={block.altText ?? ''} />
            : (
                <div className="flow-media-placeholder" data-flow-media-kind={block.mediaKind}>
                  {block.mediaKind === 'audio' ? '音频占位符' : '视频占位符'}
                </div>
              )}
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      )
      break
    }
    case 'table':
      rendered = (
        <table {...props}>
          {block.caption ? <caption>{block.caption}</caption> : null}
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th key={column.id} data-flow-column-id={column.id}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.id} data-flow-row-id={row.id}>
                {block.columns.map((column) => (
                  <td key={column.id}>{row.cells[column.id] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      break
    case 'formula':
      rendered = (
        <div {...props} role="math" aria-label={block.accessibleText} data-flow-formula-id={block.formulaId}>
          {serializeFormulaAst(block.ast as FormulaAstNode)}
        </div>
      )
      break
    case 'code':
      rendered = (
        <pre {...props}>
          <code {...(block.language ? { 'data-flow-language': block.language } : {})}>{block.code}</code>
        </pre>
      )
      break
    case 'callout':
      rendered = (
        <aside {...props} data-flow-tone={block.tone}>
          {block.title ? <strong>{block.title}</strong> : null}
          <p>{block.body}</p>
        </aside>
      )
      break
    case 'section':
      rendered = (
        <details {...props} open={!block.collapsedByDefault}>
          <summary>{block.title}</summary>
          <div className="flow-section-content">
            {(childrenByParent.get(block.id) ?? []).map((child) => (
              <FlowListItem
                key={child.blockId}
                blockView={child}
                childrenByParent={childrenByParent}
                selectedBlockId={selectedBlockId}
                readOnly={readOnly}
                onSelectBlock={onSelectBlock}
                onDeleteBlock={onDeleteBlock}
                onDuplicateBlock={onDuplicateBlock}
                onMoveBlock={onMoveBlock}
              />
            ))}
          </div>
        </details>
      )
      break
    case 'component':
      rendered = (
        <aside {...props} data-flow-component-package-id={block.component.packageId} data-flow-component-version={block.component.version}>
          {block.staticFallbackAssetId
            ? <img data-flow-static-fallback-asset-id={block.staticFallbackAssetId} alt="" />
            : null}
          <strong>互动组件：{block.component.packageId}</strong>
          <p>版本 {block.component.version}</p>
        </aside>
      )
      break
  }

  if (selected) {
    return (
      <>
        {rendered}
        <FlowBlockActionToolbar
          blockId={blockView.blockId}
          readOnly={readOnly}
          onDeleteBlock={onDeleteBlock}
          onDuplicateBlock={onDuplicateBlock}
          onMoveBlock={onMoveBlock}
        />
      </>
    )
  }
  return rendered
}

export function FlowWorkspace({
  view,
  selectedBlockId,
  onSelectBlock,
  readOnly = false,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
}: FlowWorkspaceProps) {
  const childrenByParent = new Map<string | null, FlowBlockView[]>()
  for (const blockView of view.blocks) {
    const siblings = childrenByParent.get(blockView.parentId)
    if (siblings) siblings.push(blockView)
    else childrenByParent.set(blockView.parentId, [blockView])
  }
  const rootBlocks = childrenByParent.get(null) ?? []

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (readOnly || !selectedBlockId) return
    const key = event.key
    const modifier = event.ctrlKey || event.metaKey
    if (key === 'Delete' || key === 'Backspace') {
      if (!onDeleteBlock) return
      event.preventDefault()
      onDeleteBlock(selectedBlockId)
      return
    }
    if (modifier && (key === 'd' || key === 'D')) {
      if (!onDuplicateBlock) return
      event.preventDefault()
      onDuplicateBlock(selectedBlockId)
      return
    }
    if (event.altKey && key === 'ArrowUp') {
      if (!onMoveBlock) return
      event.preventDefault()
      onMoveBlock(selectedBlockId, 'up')
      return
    }
    if (event.altKey && key === 'ArrowDown') {
      if (!onMoveBlock) return
      event.preventDefault()
      onMoveBlock(selectedBlockId, 'down')
      return
    }
  }

  return (
    <article
      className="flow-editor-surface"
      data-surface-id={view.surfaceId}
      style={{ '--flow-reading-width': `${view.layout.readingWidth}px` } as CSSProperties}
      tabIndex={0}
      aria-label="Flow 讲义画布"
      onKeyDown={handleKeyDown}
    >
      {rootBlocks.map((blockView) => (
        <FlowListItem
          key={blockView.blockId}
          blockView={blockView}
          childrenByParent={childrenByParent}
          selectedBlockId={selectedBlockId}
          readOnly={readOnly}
          onSelectBlock={onSelectBlock}
          onDeleteBlock={onDeleteBlock}
          onDuplicateBlock={onDuplicateBlock}
          onMoveBlock={onMoveBlock}
        />
      ))}
    </article>
  )
}
