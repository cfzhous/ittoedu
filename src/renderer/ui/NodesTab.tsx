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
import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import type { SceneNode } from '../../shared/projectTypes'
import {
  selectActiveScene,
  selectEditingNodes,
  useEditorStore,
} from '../store/editorStore'

const nodeIcon = {
  text: Type,
  image: ImageIcon,
  video: Video,
  shape: Square,
  'teacher-controller': SlidersHorizontal,
  'external-component': Box,
} as const

interface SortableNodeProps {
  node: SceneNode
  selected: boolean
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id })

  useEffect(() => setDraftName(node.name), [node.name])

  const commitName = () => {
    const nextName = draftName.trim()
    if (nextName && nextName !== node.name) onRename(nextName)
    else setDraftName(node.name)
    setEditing(false)
  }

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
        title="拖动调整前后层级"
        aria-label={`调整“${node.name}”层级`}
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
          onClick={(event) => onSelect(event.ctrlKey || event.metaKey || event.shiftKey)}
          onDoubleClick={() => setEditing(true)}
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
        title="删除节点"
        aria-label={`删除“${node.name}”`}
        onClick={onDelete}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export function NodesTab() {
  const scene = useEditorStore(selectActiveScene)
  const nodes = useEditorStore(selectEditingNodes)
  const editingScope = useEditorStore((state) => state.editingScope)
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds)
  const selectNode = useEditorStore((state) => state.selectNode)
  const setActiveTab = useEditorStore((state) => state.setActiveTab)
  const deleteNode = useEditorStore((state) => state.deleteNode)
  const duplicateNode = useEditorStore((state) => state.duplicateNode)
  const updateNode = useEditorStore((state) => state.updateNode)
  const reorderNodes = useEditorStore((state) => state.reorderNodes)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const visualNodes = [...nodes].reverse()
    const oldIndex = visualNodes.findIndex((node) => node.id === active.id)
    const newIndex = visualNodes.findIndex((node) => node.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    reorderNodes(
      arrayMove(visualNodes, oldIndex, newIndex)
        .reverse()
        .map((node) => node.id),
    )
  }

  const visualNodes = [...nodes].reverse()

  return (
    <div className="nodes-tree" data-testid="nodes-tab">
      <div className="tree-root" onClick={() => selectNode(null)}>
        <ChevronDown size={14} />
        <Layers3 size={15} />
        <span>{editingScope === 'global' ? '全局元素' : scene.name}</span>
        {selectedNodeIds.length > 0 && <span className="tree-selection-count">已选 {selectedNodeIds.length}</span>}
      </div>
      {nodes.length === 0 ? (
        <div className="empty-state">
          {editingScope === 'global' ? '全局层还没有组件' : '当前场景还没有节点'}
          <br />
          从“元素”面板添加{editingScope === 'global' ? '全局内容' : '内容'}
        </div>
      ) : (
        <>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
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
                    onSelect={(additive) => {
                      selectNode(node.id, additive)
                      setActiveTab('layers')
                    }}
                    onDelete={() => deleteNode(node.id)}
                    onDuplicate={() => duplicateNode(node.id)}
                    onRename={(name) => updateNode(node.id, { name })}
                    onToggleVisible={() => updateNode(node.id, { visible: !node.visible })}
                    onToggleLocked={() => updateNode(node.id, { locked: !node.locked })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="tree-order-note">
            {editingScope === 'global'
              ? '列表顺序控制同一全局层级内的前后关系；underlay / overlay 在属性中设置。'
              : '列表最上方就是画面最上层；拖动条目可改变层级。'}
          </div>
        </>
      )}
    </div>
  )
}
