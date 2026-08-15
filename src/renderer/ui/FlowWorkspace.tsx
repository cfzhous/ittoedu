import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { serializeFormulaAst } from '../../shared/formulaLinear'
import type { FormulaAstNode } from '../../shared/projectTypes'
import type { FlowBlockView, FlowEditorView } from '../course/flowEditorView'

export interface FlowWorkspaceProps {
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

function FlowListItem({
  blockView,
  childrenByParent,
  selectedBlockId,
  readOnly,
  onSelectBlock,
}: {
  blockView: FlowBlockView
  childrenByParent: Map<string | null, FlowBlockView[]>
  selectedBlockId: string | null | undefined
  readOnly: boolean
  onSelectBlock?: (blockId: string) => void
}): ReactNode {
  const block = blockView.block
  const selected = blockView.blockId === selectedBlockId
  const props = flowBlockFrameProps(blockView, selected, readOnly, onSelectBlock)
  switch (block.type) {
    case 'heading':
      switch (block.level) {
        case 1: return <h1 {...props}>{block.text}</h1>
        case 2: return <h2 {...props}>{block.text}</h2>
        case 3: return <h3 {...props}>{block.text}</h3>
        case 4: return <h4 {...props}>{block.text}</h4>
        case 5: return <h5 {...props}>{block.text}</h5>
        case 6: return <h6 {...props}>{block.text}</h6>
      }
      return null
    case 'paragraph':
      return <p {...props}>{block.text}</p>
    case 'quote':
      return (
        <blockquote {...props}>
          <p>{block.text}</p>
          {block.citation ? <cite>{block.citation}</cite> : null}
        </blockquote>
      )
    case 'list':
      return block.ordered
        ? <ol {...props}>{block.items.map((item) => <li key={item.id} data-flow-list-item-id={item.id}>{item.text}</li>)}</ol>
        : <ul {...props}>{block.items.map((item) => <li key={item.id} data-flow-list-item-id={item.id}>{item.text}</li>)}</ul>
    case 'divider':
      return <hr {...props} />
    case 'media': {
      const isImage = block.mediaKind === 'image'
      return (
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
    }
    case 'table':
      return (
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
    case 'formula':
      return (
        <div {...props} role="math" aria-label={block.accessibleText} data-flow-formula-id={block.formulaId}>
          {serializeFormulaAst(block.ast as FormulaAstNode)}
        </div>
      )
    case 'code':
      return (
        <pre {...props}>
          <code {...(block.language ? { 'data-flow-language': block.language } : {})}>{block.code}</code>
        </pre>
      )
    case 'callout':
      return (
        <aside {...props} data-flow-tone={block.tone}>
          {block.title ? <strong>{block.title}</strong> : null}
          <p>{block.body}</p>
        </aside>
      )
    case 'section':
      return (
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
              />
            ))}
          </div>
        </details>
      )
    case 'component':
      return (
        <aside {...props} data-flow-component-package-id={block.component.packageId} data-flow-component-version={block.component.version}>
          {block.staticFallbackAssetId
            ? <img data-flow-static-fallback-asset-id={block.staticFallbackAssetId} alt="" />
            : null}
          <strong>互动组件：{block.component.packageId}</strong>
          <p>版本 {block.component.version}</p>
        </aside>
      )
  }
}

export function FlowWorkspace({
  view,
  selectedBlockId,
  onSelectBlock,
  readOnly = false,
}: FlowWorkspaceProps) {
  const childrenByParent = new Map<string | null, FlowBlockView[]>()
  for (const blockView of view.blocks) {
    const siblings = childrenByParent.get(blockView.parentId)
    if (siblings) siblings.push(blockView)
    else childrenByParent.set(blockView.parentId, [blockView])
  }
  const rootBlocks = childrenByParent.get(null) ?? []
  return (
    <article
      className="flow-editor-surface"
      data-surface-id={view.surfaceId}
      style={{ '--flow-reading-width': `${view.layout.readingWidth}px` } as CSSProperties}
    >
      {rootBlocks.map((blockView) => (
        <FlowListItem
          key={blockView.blockId}
          blockView={blockView}
          childrenByParent={childrenByParent}
          selectedBlockId={selectedBlockId}
          readOnly={readOnly}
          onSelectBlock={onSelectBlock}
        />
      ))}
    </article>
  )
}
