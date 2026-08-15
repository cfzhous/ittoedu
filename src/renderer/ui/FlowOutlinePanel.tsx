import type { FlowEditorView, FlowOutlineEntry } from '../course/flowEditorView'

export interface FlowOutlinePanelProps {
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

function FlowOutlineNodeView({
  node,
  selectedBlockId,
  onSelectBlock,
}: {
  node: FlowOutlineNode
  selectedBlockId: string | null | undefined
  onSelectBlock?: (blockId: string) => void
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
      {node.children.length > 0
        ? (
            <ul className="flow-outline-children">
              {node.children.map((child) => (
                <FlowOutlineNodeView
                  key={child.entry.blockId}
                  node={child}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={onSelectBlock}
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
}: FlowOutlinePanelProps) {
  const tree = buildFlowOutlineTree(view.outline)
  return (
    <nav className="flow-outline-panel" aria-label="讲义大纲">
      <ul className="flow-outline-root">
        {tree.map((node) => (
          <FlowOutlineNodeView
            key={node.entry.blockId}
            node={node}
            selectedBlockId={selectedBlockId}
            onSelectBlock={onSelectBlock}
          />
        ))}
      </ul>
    </nav>
  )
}
