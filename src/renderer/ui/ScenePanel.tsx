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
import { Copy, Globe2, GripVertical, Layers3, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ensureScenePresentation } from '../../shared/presentation'
import type { SceneDocument } from '../../shared/projectTypes'
import { useEditorStore } from '../store/editorStore'
import { ConfirmDialog } from './ConfirmDialog'
import { SceneThumbnail } from './SceneThumbnail'
import { hasUnrepresentedRuntime } from './sceneThumbnailComposition'

interface SortableSceneProps {
  scene: SceneDocument
  index: number
  active: boolean
  canDelete: boolean
  showRuntimeBadge: boolean
  onActivate(): void
  onRename(name: string): void
  onDelete(): void
  onDuplicate(): void
}

function SortableScene({
  scene,
  index,
  active,
  canDelete,
  showRuntimeBadge,
  onActivate,
  onRename,
  onDelete,
  onDuplicate,
}: SortableSceneProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(scene.name)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id })
  const presentation = ensureScenePresentation(scene)
  const thumbnailStateId = presentation.thumbnailStateId ?? presentation.initialStateId
  const thumbnailState = presentation.states.find((state) => state.id === thumbnailStateId)

  useEffect(() => setName(scene.name), [scene.name])

  const commit = () => {
    const next = name.trim()
    if (next) onRename(next)
    else setName(scene.name)
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      className={`scene-item${active ? ' scene-item--active' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
      data-testid={`scene-item-${scene.id}`}
      onClick={onActivate}
      role="group"
      aria-label={`场景 ${index + 1}：${scene.name}`}
    >
      <button
        type="button"
        className="drag-handle"
        title="拖动调整场景顺序"
        aria-label={`拖动“${scene.name}”`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={15} />
      </button>
      <button
        type="button"
        className="scene-thumbnail-wrap"
        aria-current={active ? 'page' : undefined}
        aria-label={`打开场景“${scene.name}”；缩略图使用状态“${thumbnailState?.name ?? '初始状态'}”`}
        onClick={(event) => {
          event.stopPropagation()
          onActivate()
        }}
      >
        <SceneThumbnail scene={scene} />
        <span className="scene-number">{index + 1}</span>
        {showRuntimeBadge && (
          <span
            className="runtime-badge"
            title="已启用的运行时无静态后备，请在当前位置试运行中查看"
          >
            运行时
          </span>
        )}
        <span
          className="thumbnail-state-badge"
          title={`缩略图使用状态：${thumbnailState?.name ?? '初始状态'}`}
        >
          缩略图 · {thumbnailState?.name ?? '初始状态'}
        </span>
      </button>
      <div className="scene-meta">
      {editing ? (
        <input
          autoFocus
          className="scene-name-input"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setName(scene.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <span
          className="scene-name"
          title={`${scene.name}（双击改名）`}
          role="button"
          tabIndex={0}
          aria-label={`重命名场景“${scene.name}”`}
          onDoubleClick={(event) => {
            event.stopPropagation()
            setEditing(true)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== 'F2') return
            event.stopPropagation()
            setEditing(true)
          }}
        >
          {scene.name}
        </span>
      )}
      </div>
      <button
        type="button"
        className="icon-button"
        title="复制场景"
        aria-label={`复制“${scene.name}”`}
        onClick={(event) => { event.stopPropagation(); onDuplicate() }}
      >
        <Copy size={14} />
      </button>
      <button
        type="button"
        className="icon-button icon-button--danger"
        title={canDelete ? '删除场景' : '工程至少保留一个场景'}
        aria-label={`删除“${scene.name}”`}
        disabled={!canDelete}
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export function ScenePanel() {
  const scenes = useEditorStore((state) => state.project.scenes)
  const globalLayer = useEditorStore(
    (state) => state.project.globalLayer,
  )
  const globalRuntime = useEditorStore((state) => state.project.globalRuntime)
  const editingScope = useEditorStore((state) => state.editingScope)
  const activeSceneId = useEditorStore((state) => state.activeSceneId)
  const addScene = useEditorStore((state) => state.addScene)
  const deleteScene = useEditorStore((state) => state.deleteScene)
  const duplicateScene = useEditorStore((state) => state.duplicateScene)
  const reorderScenes = useEditorStore((state) => state.reorderScenes)
  const updateScene = useEditorStore((state) => state.updateScene)
  const setActiveScene = useEditorStore((state) => state.setActiveScene)
  const setEditingScope = useEditorStore((state) => state.setEditingScope)
  const [pendingDelete, setPendingDelete] = useState<SceneDocument | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = scenes.findIndex((scene) => scene.id === active.id)
    const newIndex = scenes.findIndex((scene) => scene.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    reorderScenes(arrayMove(scenes, oldIndex, newIndex).map((scene) => scene.id))
  }

  return (
    <aside className="panel scene-panel" aria-label="场景列表">
      <div className="panel-header">
        <h2 className="panel-title">场景</h2>
        <button
          type="button"
          className="secondary-button"
          onClick={addScene}
          data-testid="add-scene"
        >
          <Plus size={14} />
          新建场景
        </button>
      </div>
      <div className="global-layer-entry-wrap">
        <button
          type="button"
          className={`global-layer-entry${editingScope === 'global' ? ' global-layer-entry--active' : ''}`}
          aria-pressed={editingScope === 'global'}
          data-testid="global-layer-entry"
          onClick={() => setEditingScope('global')}
        >
          <span className="global-layer-entry__icon"><Globe2 size={19} /></span>
          <span className="global-layer-entry__content">
            <strong>全局层</strong>
            <small>
              {globalLayer.length} 个元素
              {globalRuntime ? ' · 自定义运行时' : ''}
            </small>
          </span>
          <Layers3 size={16} />
        </button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={scenes.map((scene) => scene.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="scene-list">
            {scenes.map((scene, index) => (
              <SortableScene
                key={scene.id}
                scene={scene}
                index={index}
                active={editingScope === 'scene' && scene.id === activeSceneId}
                canDelete={scenes.length > 1}
                showRuntimeBadge={hasUnrepresentedRuntime(scene, globalRuntime)}
                onActivate={() => setActiveScene(scene.id)}
                onRename={(name) => updateScene(scene.id, { name })}
                onDelete={() => setPendingDelete(scene)}
                onDuplicate={() => duplicateScene(scene.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="删除场景？"
        message={
          pendingDelete
            ? `“${pendingDelete.name}”及其中的全部节点将被删除。此操作可以撤销。`
            : ''
        }
        confirmLabel="删除场景"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) deleteScene(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </aside>
  )
}
