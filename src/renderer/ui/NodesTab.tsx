import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useRef, useState } from 'react'
import {
  Box,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  ImageIcon,
  Layers3,
  Lock,
  Square,
  Trash2,
  Type,
  Unlock,
  Video,
  SlidersHorizontal,
  Sigma,
} from 'lucide-react'
import type { SceneNode } from '../../shared/projectTypes'
import {
  selectActiveScene,
  selectEditingNodes,
  useEditorStore,
} from '../store/editorStore'

const nodeIcon = {
  text: Type,
  formula: Sigma,
  image: ImageIcon,
  video: Video,
  shape: Square,
  'teacher-controller': SlidersHorizontal,
  'external-component': Box,
} as const

const NODES_TAB_ROW_STYLE = {
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'nowrap',
  alignItems: 'center',
  width: '100%',
  minWidth: 0,
  height: 32,
  maxHeight: 32,
  overflow: 'hidden',
  writingMode: 'horizontal-tb',
  textOrientation: 'mixed',
} as const

const NODES_TAB_NAME_STYLE = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  writingMode: 'horizontal-tb',
} as const

const NODES_TAB_SOURCE_STYLE = {
  flex: '0 0 auto',
  maxWidth: '4.75em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  writingMode: 'horizontal-tb',
  color: 'var(--text-muted, #747d8c)',
  fontSize: 11,
} as const

const NODES_TAB_SOURCE_LABELS: Record<string, string> = {
  global: '全课',
  surface: '当前内容',
  scene: '本页',
  location: '本页',
  state: '当前状态',
  flow: 'Flow',
  world: '世界',
  camera: '镜头',
}

/** Compact row model matching T04 fields without importing T04 files. */
export interface NodesTabEffectiveRow {
  readonly id: string
  readonly name: string
  readonly sourceKind: string
  readonly ownerKey: string
  readonly sourceLabel?: string
  readonly selected?: boolean
  readonly locked?: boolean
  readonly hidden?: boolean
}

export interface NodesTabDocumentControl {
  readonly editingScope: 'scene' | 'surface' | 'global'
  /** Remounts transient row/DnD state whenever the owning document context changes. */
  readonly contextKey: string
  readonly scopeLabel: string
  readonly nodes: readonly SceneNode[]
  readonly selectedNodeIds: readonly string[]
  /** Named states hide inherited items instead of deleting their stable base identity. */
  readonly deletionMode?: 'delete' | 'hide-in-state'
  /** Explains supported scene items that are intentionally omitted from this partial list. */
  readonly omittedItemsReason?: string
  /** Disables whole-list ordering until every effective item participates. */
  readonly reorderUnavailableReason?: string
  /** Optional T04-compatible rows. When set, names stay on one horizontal line. */
  readonly effectiveRows?: readonly NodesTabEffectiveRow[]
  /** The owner decides whether an additive request extends, toggles, or replaces selection. */
  onSelectNode(nodeId: string | null, additive: boolean): void
  onDeleteNode(nodeId: string): void
  onDuplicateNode(nodeId: string): void
  onRenameNode(nodeId: string, name: string): void
  onSetNodeVisible(nodeId: string, visible: boolean): void
  onSetNodeLocked(nodeId: string, locked: boolean): void
  onReorderNodes(nodeIds: readonly string[]): void
}

export interface NodesTabProps {
  documentControl?: NodesTabDocumentControl
}

type NodesTabViewProps = NodesTabDocumentControl

interface SortableNodeProps {
  node: SceneNode
  selected: boolean
  deletionMode: 'delete' | 'hide-in-state'
  reorderEnabled: boolean
  reorderUnavailableReason?: string
  onSelect(additive: boolean): void
  onDelete(): void
  onDuplicate(): void
  onRename(name: string): void
  onToggleVisible(): void
  onToggleLocked(): void
}

function SortableNode({
  node,
  selected,
  deletionMode,
  reorderEnabled,
  reorderUnavailableReason,
  onSelect,
  onDelete,
  onDuplicate,
  onRename,
  onToggleVisible,
  onToggleLocked,
}: SortableNodeProps) {
  const Icon = nodeIcon[node.type]
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(node.name)
  const selectTimerRef = useRef<number | null>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id, disabled: !reorderEnabled })

  useEffect(() => setDraftName(node.name), [node.name])
  useEffect(() => () => {
    if (selectTimerRef.current !== null) window.clearTimeout(selectTimerRef.current)
  }, [])

  const commitName = () => {
    const nextName = draftName.trim()
    if (nextName && nextName !== node.name) onRename(nextName)
    else setDraftName(node.name)
    setEditing(false)
  }
  const alreadyHiddenInState = deletionMode === 'hide-in-state' && !node.visible
  const deleteLabel = deletionMode === 'hide-in-state'
    ? alreadyHiddenInState
      ? `“${node.name}”已在当前状态隐藏`
      : `从当前状态隐藏“${node.name}”`
    : `删除“${node.name}”`

  return (
    <div
      ref={setNodeRef}
      className={`node-item nodes-tab-row${selected ? ' node-item--selected' : ''}`}
      style={{
        ...NODES_TAB_ROW_STYLE,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      data-testid={`node-item-${node.id}`}
    >
      <button
        type="button"
        className="drag-handle"
        title={reorderUnavailableReason ?? '拖动调整前后层级'}
        aria-label={`调整“${node.name}”层级`}
        disabled={!reorderEnabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={14} />
      </button>
      <span className="node-type-icon" title={node.type}>
        <Icon size={15} />
      </span>
      {editing ? (
        <input
          autoFocus
          className="node-name-input"
          value={draftName}
          maxLength={80}
          aria-label={`重命名“${node.name}”`}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitName}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraftName(node.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <span
          className="node-name nodes-tab-row__name"
          style={NODES_TAB_NAME_STYLE}
          title={`${node.name}（双击改名，Ctrl / Shift 单击可多选）`}
          onClick={(event) => {
            const additive = event.ctrlKey || event.metaKey || event.shiftKey
            // Synthetic/keyboard activation and additive selection cannot be
            // mistaken for rename, so keep those paths immediate. A real
            // primary click is briefly deferred so the second click can claim
            // the gesture for in-place rename before selecting the layer opens
            // the Properties tab and unmounts this list.
            if (event.detail === 0 || additive) {
              onSelect(additive)
              return
            }
            if (selectTimerRef.current !== null) {
              window.clearTimeout(selectTimerRef.current)
            }
            selectTimerRef.current = window.setTimeout(() => {
              selectTimerRef.current = null
              onSelect(false)
            }, 250)
          }}
          onDoubleClick={(event) => {
            event.preventDefault()
            if (selectTimerRef.current !== null) {
              window.clearTimeout(selectTimerRef.current)
              selectTimerRef.current = null
            }
            setEditing(true)
          }}
        >
          {node.name}
        </span>
      )}
      <button
        type="button"
        className="icon-button"
        title={node.visible ? '隐藏图层' : '显示图层'}
        aria-label={`${node.visible ? '隐藏' : '显示'}“${node.name}”`}
        onClick={onToggleVisible}
      >
        {node.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button
        type="button"
        className="icon-button"
        title={node.locked ? '解锁图层' : '锁定图层'}
        aria-label={`${node.locked ? '解锁' : '锁定'}“${node.name}”`}
        onClick={onToggleLocked}
      >
        {node.locked ? <Lock size={14} /> : <Unlock size={14} />}
      </button>
      <button
        type="button"
        className="icon-button"
        title="复制图层"
        aria-label={`复制“${node.name}”`}
        onClick={onDuplicate}
      >
        <Copy size={14} />
      </button>
      <button
        type="button"
        className="icon-button icon-button--danger"
        title={deleteLabel}
        aria-label={deleteLabel}
        disabled={alreadyHiddenInState}
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export function NodesTab({ documentControl }: NodesTabProps = {}) {
  if (documentControl) return <NodesTabView {...documentControl} />
  return <LegacyNodesTabAdapter />
}

function LegacyNodesTabAdapter() {
  const scene = useEditorStore(selectActiveScene)
  const nodes = useEditorStore(selectEditingNodes)
  const editingScope = useEditorStore((state) => state.editingScope)
  const activePresentationStateId = useEditorStore(
    (state) => state.activePresentationStateId,
  )
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds)
  const selectNode = useEditorStore((state) => state.selectNode)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const deleteNode = useEditorStore((state) => state.deleteNode)
  const duplicateNode = useEditorStore((state) => state.duplicateNode)
  const updateNode = useEditorStore((state) => state.updateNode)
  const reorderNodes = useEditorStore((state) => state.reorderNodes)

  return (
    <NodesTabView
      editingScope={editingScope}
      contextKey={JSON.stringify([
        'legacy',
        scene.id,
        activePresentationStateId,
        editingScope,
      ])}
      scopeLabel={editingScope === 'global' ? '全局元素' : scene.name}
      nodes={nodes}
      selectedNodeIds={selectedNodeIds}
      onSelectNode={(nodeId, additive) => {
        selectNode(nodeId, additive)
        // Ctrl/Shift selection is an in-progress layer-list operation. Keep
        // the list visible until the author explicitly opens Properties.
        if (additive) setActiveTab('layers')
      }}
      onDeleteNode={deleteNode}
      onDuplicateNode={duplicateNode}
      onRenameNode={(nodeId, name) => updateNode(nodeId, { name })}
      onSetNodeVisible={(nodeId, visible) => updateNode(nodeId, { visible })}
      onSetNodeLocked={(nodeId, locked) => updateNode(nodeId, { locked })}
      onReorderNodes={(nodeIds) => reorderNodes([...nodeIds])}
    />
  )
}

function NodesTabView({
  editingScope,
  contextKey,
  scopeLabel,
  nodes,
  selectedNodeIds,
  deletionMode = 'delete',
  omittedItemsReason,
  reorderUnavailableReason,
  effectiveRows,
  onSelectNode,
  onDeleteNode,
  onDuplicateNode,
  onRenameNode,
  onSetNodeVisible,
  onSetNodeLocked,
  onReorderNodes,
}: NodesTabViewProps) {
  const dragContextRef = useRef<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const commitDragEnd = ({ active, over }: DragEndEvent) => {
    if (reorderUnavailableReason) return
    if (!over || active.id === over.id) return
    const visualNodes = [...nodes].reverse()
    const oldIndex = visualNodes.findIndex((node) => node.id === active.id)
    const newIndex = visualNodes.findIndex((node) => node.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onReorderNodes(
      arrayMove(visualNodes, oldIndex, newIndex)
        .reverse()
        .map((node) => node.id),
    )
  }

  const visualNodes = [...nodes].reverse()

  return (
    <div className="nodes-tree" data-testid="nodes-tab">
      <div className="tree-root" onClick={() => onSelectNode(null, false)}>
        <ChevronDown size={14} />
        <Layers3 size={15} />
        <span>{scopeLabel}</span>
        {selectedNodeIds.length > 0 && <span className="tree-selection-count">已选 {selectedNodeIds.length}</span>}
      </div>
      {omittedItemsReason && (
        <div className="empty-state" role="status">
          {omittedItemsReason}
        </div>
      )}
      {effectiveRows ? (
        effectiveRows.length === 0 ? (
          <div className="empty-state">
            {editingScope === 'global' ? '全局层还没有组件' : '当前还没有图层'}
          </div>
        ) : (
          <div className="nodes-list nodes-tab-effective-list" role="list" aria-label="有效图层">
            {effectiveRows.map((row) => {
              const source = row.sourceLabel ?? NODES_TAB_SOURCE_LABELS[row.sourceKind] ?? row.sourceKind
              return (
                <div
                  key={row.id}
                  className={`node-item nodes-tab-row${row.selected ? ' node-item--selected' : ''}`}
                  style={NODES_TAB_ROW_STYLE}
                  data-testid={`node-item-${row.id}`}
                  data-owner-key={row.ownerKey}
                  role="listitem"
                  onClick={(event) => {
                    onSelectNode(row.id, event.ctrlKey || event.metaKey || event.shiftKey)
                  }}
                >
                  <span className="nodes-tab-row__source" style={NODES_TAB_SOURCE_STYLE} title={source}>
                    {source}
                  </span>
                  <span
                    className="node-name nodes-tab-row__name"
                    style={NODES_TAB_NAME_STYLE}
                    title={`${source} · ${row.name}`}
                  >
                    {row.name}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    title={row.hidden ? '显示图层' : '隐藏图层'}
                    aria-label={`${row.hidden ? '显示' : '隐藏'}“${row.name}”`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSetNodeVisible(row.id, Boolean(row.hidden))
                    }}
                  >
                    {row.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title={row.locked ? '解锁图层' : '锁定图层'}
                    aria-label={`${row.locked ? '解锁' : '锁定'}“${row.name}”`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSetNodeLocked(row.id, !row.locked)
                    }}
                  >
                    {row.locked ? <Lock size={14} /> : <Unlock size={14} />}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="复制图层"
                    aria-label={`复制“${row.name}”`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onDuplicateNode(row.id)
                    }}
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    title={`删除“${row.name}”`}
                    aria-label={`删除“${row.name}”`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteNode(row.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )
      ) : nodes.length === 0 ? (
        <div className="empty-state">
          {omittedItemsReason
            ? '当前幻灯片没有可在此编辑的元素'
            : editingScope === 'global'
              ? '全局层还没有组件'
              : editingScope === 'surface'
                ? '当前内容还没有场景间共用元素'
              : '当前场景还没有节点'}
          <br />
          {editingScope === 'surface'
            ? '可在支持的导入或移动操作中加入共用内容'
            : `从“元素”面板加入${editingScope === 'global' ? '全局内容' : '内容'}`}
        </div>
      ) : (
        <>
          <DndContext
            key={contextKey}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => { dragContextRef.current = contextKey }}
            onDragCancel={() => { dragContextRef.current = null }}
            onDragEnd={(event) => {
              const startedContext = dragContextRef.current
              dragContextRef.current = null
              if (startedContext !== contextKey) return
              commitDragEnd(event)
            }}
          >
            <SortableContext
              items={visualNodes.map((node) => node.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="nodes-list">
                {visualNodes.map((node) => (
                  <SortableNode
                    key={node.id}
                    node={node}
                    selected={selectedNodeIds.includes(node.id)}
                    deletionMode={deletionMode}
                    reorderEnabled={!reorderUnavailableReason}
                    reorderUnavailableReason={reorderUnavailableReason}
                    onSelect={(additive) => onSelectNode(node.id, additive)}
                    onDelete={() => onDeleteNode(node.id)}
                    onDuplicate={() => onDuplicateNode(node.id)}
                    onRename={(name) => onRenameNode(node.id, name)}
                    onToggleVisible={() => onSetNodeVisible(node.id, !node.visible)}
                    onToggleLocked={() => onSetNodeLocked(node.id, !node.locked)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="tree-order-note">
            {reorderUnavailableReason ?? (editingScope === 'global'
              ? '列表顺序控制同一全局层级内的前后关系；underlay / overlay 在属性中设置。'
              : editingScope === 'surface'
                ? '列表最上方就是共用内容的画面最上层；拖动条目可改变层级。'
              : '列表最上方就是画面最上层；拖动条目可改变层级。')}
          </div>
        </>
      )}
    </div>
  )
}
