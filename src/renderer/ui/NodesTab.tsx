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
  component: Box,
  runtime: Box,
} as const

export type NodesTabEffectiveLayerSource = 'global' | 'surface' | 'scene' | 'world'
export type NodesTabEffectiveLayerKind = keyof typeof nodeIcon

/**
 * A current-page layer row with explicit ownership. This is intentionally a
 * read-only projection: it never becomes a second layer model or tries to
 * infer source ownership from a layer ID.
 */
export interface NodesTabEffectiveLayer {
  readonly source: NodesTabEffectiveLayerSource
  readonly layerItemId: string
  readonly label: string
  readonly kind: NodesTabEffectiveLayerKind
  readonly order: number
  readonly visible: boolean
  readonly locked: boolean
  readonly effectiveVisible: boolean
  readonly selected: boolean
  readonly controller?: boolean
  /** Shared content without a narrow authoring command remains view-only. */
  readonly viewOnly?: boolean
  readonly impactLabel?: string
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
  /**
   * Optional V9 current-page projection. When supplied, it replaces the
   * scope-local legacy list with a source-explicit, non-reorderable list.
   */
  readonly effectiveLayers?: readonly NodesTabEffectiveLayer[]
  onSelectEffectiveLayer?(layer: NodesTabEffectiveLayer): void
  onLocateController?(layer: NodesTabEffectiveLayer): void
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
      className={`node-item${selected ? ' node-item--selected' : ''}`}
      style={{
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
          className="node-name"
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

function effectiveLayerSourceLabel(source: NodesTabEffectiveLayerSource): string {
  switch (source) {
    case 'global': return '全课内容'
    case 'surface': return '当前内容共用'
    case 'world': return '空间内容'
    case 'scene': return '当前页面'
  }
}

function EffectiveLayerList({
  contextKey,
  effectiveLayers: layers,
  onSelectEffectiveLayer,
  onLocateController,
}: Pick<NodesTabDocumentControl,
  'contextKey' | 'effectiveLayers' | 'onSelectEffectiveLayer' | 'onLocateController'>) {
  const [inspectedSharedLayer, setInspectedSharedLayer] = useState<{
    readonly source: NodesTabEffectiveLayerSource
    readonly layerItemId: string
  } | null>(null)
  useEffect(() => {
    setInspectedSharedLayer(null)
  }, [contextKey])
  const sortedLayers = [...(layers ?? [])].sort((left, right) =>
    left.order - right.order || left.layerItemId.localeCompare(right.layerItemId),
  )
  return (
    <div className="nodes-tree nodes-tree--effective" data-testid="nodes-tab">
      <div className="tree-root">
        <ChevronDown size={14} />
        <Layers3 size={15} />
        <span>当前页面图层</span>
      </div>
      {sortedLayers.length === 0 ? (
        <div className="empty-state">当前页面没有可查看的图层</div>
      ) : (
        <div className="nodes-list" role="list">
          {sortedLayers.map((layer) => {
            const Icon = nodeIcon[layer.kind]
            const sourceLabel = effectiveLayerSourceLabel(layer.source)
            const stateLabel = `${layer.visible ? '显示' : '隐藏'} · ${layer.locked ? '锁定' : '未锁定'}`
            const controllerLabel = `定位控制器“${layer.label}”`
            const selected = inspectedSharedLayer === null
              ? layer.selected
              : inspectedSharedLayer.source === layer.source &&
                inspectedSharedLayer.layerItemId === layer.layerItemId
            return (
              <div
                key={`${layer.source}:${layer.layerItemId}`}
                className={`node-item node-item--effective${selected ? ' node-item--selected' : ''}`}
                data-testid={`effective-layer-item-${layer.source}-${layer.layerItemId}`}
                data-layer-source={layer.source}
                data-layer-item-id={layer.layerItemId}
                data-layer-effective-visible={layer.effectiveVisible}
                data-layer-view-only={layer.viewOnly ? 'true' : 'false'}
                role="listitem"
              >
                <button
                  type="button"
                  className="node-item__effective-select"
                  aria-pressed={selected}
                  aria-label={`${layer.label}（${sourceLabel} · ${stateLabel}）`}
                  onClick={() => {
                    setInspectedSharedLayer(
                      layer.viewOnly
                        ? { source: layer.source, layerItemId: layer.layerItemId }
                        : null,
                    )
                    onSelectEffectiveLayer?.(layer)
                  }}
                >
                  <span className="node-type-icon" title={layer.kind}>
                    <Icon size={15} />
                  </span>
                  <span className="node-name">{layer.label}</span>
                  <span className="node-item__effective-source">{sourceLabel}</span>
                  <span className="node-item__effective-state">{stateLabel}</span>
                </button>
                {layer.controller ? (
                  <button
                    type="button"
                    className="secondary-button node-item__locate-controller"
                    data-testid={`locate-controller-${layer.source}-${layer.layerItemId}`}
                    aria-label={controllerLabel}
                    title={layer.effectiveVisible
                      ? '在当前画布中定位控制器'
                      : '控制器当前不可见，无法定位到画布'}
                    disabled={!layer.effectiveVisible}
                    onClick={() => {
                      setInspectedSharedLayer(null)
                      onLocateController?.(layer)
                    }}
                  >
                    定位控制器
                  </button>
                ) : layer.viewOnly ? (
                  <span className="node-item__effective-impact" role="status">
                    {layer.impactLabel ?? '当前仅可查看影响范围'}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
      <div className="tree-order-note">
        当前页面按实际叠放顺序显示；共用内容保留原有数据和影响范围。
      </div>
    </div>
  )
}

export function NodesTab({ documentControl }: NodesTabProps = {}) {
  if (documentControl?.effectiveLayers) {
    return <EffectiveLayerList {...documentControl} />
  }
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
      {nodes.length === 0 ? (
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
