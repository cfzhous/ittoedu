import type { FlowEditorView, FlowOutlineEntry } from '../course/flowEditorView'
import type { FlowBlockMoveDirection, FlowStructuralActionProps } from './FlowWorkspace'

export interface FlowOutlinePanelProps extends FlowStructuralActionProps {
  readonly view: FlowEditorView
  readonly selectedBlockId?: string | null
  readonly onSelectBlock?: (blockId: string) => void
}

interface FlowOutlineNode {
  entry: FlowOutlineEntry
  children: FlowOutlineNode[]
}

function buildFlowOutlineTree(entries: readonly FlowOutlineEntry[]): FlowOutlineNode[] {
  const roots: FlowOutlineNode[] = []
  const stack: FlowOutlineNode[] = []
  for (const entry of entries) {
    const node: FlowOutlineNode = { entry, children: [] }
    while (stack.length > 0 && stack[stack.length - 1]!.entry.depth >= entry.depth) {
      stack.pop()
    }
    if (stack.length === 0) roots.push(node)
    else stack[stack.length - 1]!.children.push(node)
    stack.push(node)
  }
  return roots
}

function FlowOutlineBlockToolbar({
  blockId,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
}: {
  blockId: string
  onDeleteBlock?: (blockId: string) => void
  onDuplicateBlock?: (blockId: string) => void
  onMoveBlock?: (blockId: string, direction: FlowBlockMoveDirection) => void
}) {
  if (!onDeleteBlock && !onDuplicateBlock && !onMoveBlock) return null
  return (
    <div
      className="flow-outline-block-toolbar"
      role="toolbar"
      aria-label="内容块操作"
      data-testid="flow-outline-block-toolbar"
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', margin: '4px 0' }}
    >
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-outline-block-delete"
        aria-label="删除"
        disabled={!onDeleteBlock}
        onClick={() => onDeleteBlock?.(blockId)}
      >
        删除
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-outline-block-duplicate"
        aria-label="复制"
        disabled={!onDuplicateBlock}
        onClick={() => onDuplicateBlock?.(blockId)}
      >
        复制
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-outline-block-move-up"
        aria-label="上移"
        disabled={!onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'up')}
      >
        上移
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-outline-block-move-down"
        aria-label="下移"
        disabled={!onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'down')}
      >
        下移
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-outline-block-promote"
        aria-label="提升层级"
        disabled={!onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'left')}
      >
        提升层级
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-outline-block-demote"
        aria-label="降低层级"
        disabled={!onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'right')}
      >
        降低层级
      </button>
    </div>
  )
}

function FlowOutlineNodeView({
  node,
  selectedBlockId,
  onSelectBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
}: {
  node: FlowOutlineNode
  selectedBlockId: string | null | undefined
  onSelectBlock?: (blockId: string) => void
  onDeleteBlock?: (blockId: string) => void
  onDuplicateBlock?: (blockId: string) => void
  onMoveBlock?: (blockId: string, direction: FlowBlockMoveDirection) => void
}) {
  const { entry } = node
  const selected = entry.blockId === selectedBlockId
  const kindLabel = entry.kind === 'heading' ? `标题 ${entry.level}` : '章节'
  return (
    <li data-flow-outline-depth={entry.depth}>
      <button
        type="button"
        className={`flow-outline-item flow-outline-item--${entry.kind}${selected ? ' flow-outline-item--selected' : ''}`}
        data-flow-outline-block-id={entry.blockId}
        aria-label={`${kindLabel}：${entry.title}`}
        aria-selected={selected}
        onClick={() => onSelectBlock?.(entry.blockId)}
      >
        <span className="flow-outline-kind" aria-hidden="true">
          {entry.kind === 'heading' ? `H${entry.level}` : '§'}
        </span>
        <span className="flow-outline-title">{entry.title}</span>
      </button>
      {selected
        ? (
            <FlowOutlineBlockToolbar
              blockId={entry.blockId}
              onDeleteBlock={onDeleteBlock}
              onDuplicateBlock={onDuplicateBlock}
              onMoveBlock={onMoveBlock}
            />
          )
        : null}
      {node.children.length > 0
        ? (
            <ul className="flow-outline-children">
              {node.children.map((child) => (
                <FlowOutlineNodeView
                  key={child.entry.blockId}
                  node={child}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={onSelectBlock}
                  onDeleteBlock={onDeleteBlock}
                  onDuplicateBlock={onDuplicateBlock}
                  onMoveBlock={onMoveBlock}
                />
              ))}
            </ul>
          )
        : null}
    </li>
  )
}

export function FlowOutlinePanel({
  view,
  selectedBlockId,
  onSelectBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
}: FlowOutlinePanelProps) {
  const tree = buildFlowOutlineTree(view.outline)
  return (
    <nav
      className="flow-outline-panel"
      aria-label="课程结构"
      data-testid="flow-outline-panel"
    >
      <ul className="flow-outline-root">
        <li
          data-flow-outline-kind="page"
          data-flow-outline-page-id={view.surfaceId}
        >
          <button
            type="button"
            className="flow-outline-item flow-outline-item--page"
            data-flow-outline-page-id={view.surfaceId}
            aria-label={`流式页面：${view.surfaceTitle}`}
            onClick={() => onSelectBlock?.(view.activeBlockId)}
          >
            <span className="flow-outline-kind" aria-hidden="true">页</span>
            <span className="flow-outline-title">{view.surfaceTitle}</span>
          </button>
          {tree.length > 0
            ? (
                <ul className="flow-outline-children">
                  {tree.map((node) => (
                    <FlowOutlineNodeView
                      key={node.entry.blockId}
                      node={node}
                      selectedBlockId={selectedBlockId}
                      onSelectBlock={onSelectBlock}
                      onDeleteBlock={onDeleteBlock}
                      onDuplicateBlock={onDuplicateBlock}
                      onMoveBlock={onMoveBlock}
                    />
                  ))}
                </ul>
              )
            : null}
        </li>
      </ul>
    </nav>
  )
}
