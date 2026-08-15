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
import { useEffect, useMemo, useState } from 'react'
import { ensureScenePresentation } from '../../shared/presentation'
import { useEditorStore } from '../store/editorStore'
import { ConfirmDialog } from './ConfirmDialog'
import {
  buildLegacySceneThumbnailRenderModel,
  SceneThumbnail,
  type SceneThumbnailRenderModel,
} from './SceneThumbnail'
import { hasUnrepresentedRuntime } from './sceneThumbnailComposition'
import type { FlowEditorView } from '../course/flowEditorView'
import { FlowOutlinePanel } from './FlowOutlinePanel'
import {
  SpatialCameraPanel,
  type SpatialCameraPanelProps,
} from './SpatialCameraPanel'

export interface ScenePanelSceneRow {
  id: string
  name: string
  active: boolean
  showRuntimeBadge: boolean
  thumbnailStateName: string
  thumbnail: SceneThumbnailRenderModel
}

/**
 * Narrow document/control boundary shared by the original panel UI and the V9
 * editor backend. It contains no ProjectDocument or editor-store operations.
 */
export interface ScenePanelFlowDocumentControl {
  readonly surfaceTitle: string
  readonly flowView: FlowEditorView
  readonly selectedBlockId?: string | null
  readonly onSelectBlock: (blockId: string) => void
  readonly onAddSurface?: () => void
}

export interface ScenePanelSpatialDocumentControl extends SpatialCameraPanelProps {
  readonly onAddSurface?: () => void
}

export interface ScenePanelDocumentControl {
  /** Explains why the current course location has no scene-authoring surface. */
  unavailableReason?: string
  editingScope: 'scene' | 'surface' | 'global'
  globalElementCount: number
  globalHasRuntime: boolean
  /** Keeps the original entry visible while a backend lacks a truthful global authoring surface. */
  globalEditingDisabled?: boolean
  globalEditingUnavailableReason?: string
  /** Optional V9-only sibling scope shared by every scene in the current content. */
  surfaceLayer?: {
    readonly elementCount: number
    readonly hasDynamicContent: boolean
    readonly editingDisabled?: boolean
    readonly editingUnavailableReason?: string
    onActivate(): void
  }
  scenes: readonly ScenePanelSceneRow[]
  onAddScene(): void
  onActivateScene(sceneId: string): void
  onActivateGlobal(): void
  onRenameScene(sceneId: string, name: string): void
  onDeleteScene(sceneId: string): void
  onDuplicateScene(sceneId: string): void
  onReorderScenes(sceneIds: readonly string[]): void
}

interface SortableSceneProps {
  scene: ScenePanelSceneRow
  index: number
  canDelete: boolean
  onActivate(): void
  onRename(name: string): void
  onDelete(): void
  onDuplicate(): void
}

function SortableScene({
  scene,
  index,
  canDelete,
  onActivate,
  onRename,
  onDelete,
  onDuplicate,
}: SortableSceneProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(scene.name)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: scene.id })

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
      className={`scene-item${scene.active ? ' scene-item--active' : ''}`}
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
        aria-current={scene.active ? 'page' : undefined}
        aria-label={`打开场景“${scene.name}”；缩略图使用状态“${scene.thumbnailStateName}”`}
        onClick={(event) => {
          event.stopPropagation()
          onActivate()
        }}
      >
        <SceneThumbnail model={scene.thumbnail} />
        <span className="scene-number">{index + 1}</span>
        {scene.showRuntimeBadge && (
          <span
            className="runtime-badge"
            title="动态内容没有静态后备，请在当前位置试运行中查看"
          >
            动态内容
          </span>
        )}
        <span
          className="thumbnail-state-badge"
          title={`缩略图使用状态：${scene.thumbnailStateName}`}
        >
          缩略图 · {scene.thumbnailStateName}
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

function ScenePanelContent({
  documentControl,
}: {
  documentControl: ScenePanelDocumentControl
}) {
  const [pendingDelete, setPendingDelete] = useState<ScenePanelSceneRow | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const oldIndex = documentControl.scenes.findIndex((scene) => scene.id === active.id)
    const newIndex = documentControl.scenes.findIndex((scene) => scene.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    documentControl.onReorderScenes(
      arrayMove([...documentControl.scenes], oldIndex, newIndex)
        .map((scene) => scene.id),
    )
  }

  return (
    <aside className="panel scene-panel" aria-label="场景列表">
      <div className="panel-header">
        <h2 className="panel-title">场景</h2>
        <button
          type="button"
          className="secondary-button"
          onClick={documentControl.onAddScene}
          data-testid="add-scene"
        >
          <Plus size={14} />
          新建场景
        </button>
      </div>
      <div className="global-layer-entry-wrap">
        <button
          type="button"
          className={`global-layer-entry${documentControl.editingScope === 'global' ? ' global-layer-entry--active' : ''}`}
          aria-pressed={documentControl.editingScope === 'global'}
          data-testid="global-layer-entry"
          disabled={documentControl.globalEditingDisabled}
          title={documentControl.globalEditingUnavailableReason}
          onClick={documentControl.onActivateGlobal}
        >
          <span className="global-layer-entry__icon"><Globe2 size={19} /></span>
          <span className="global-layer-entry__content">
            <strong>全局层</strong>
            <small>
              {documentControl.globalElementCount} 个元素
              {documentControl.globalHasRuntime ? ' · 自定义动态内容' : ''}
              {documentControl.globalEditingDisabled ? ' · 暂不可编辑' : ''}
            </small>
          </span>
          <Layers3 size={16} />
        </button>
        {documentControl.surfaceLayer && (
          <button
            type="button"
            className={`global-layer-entry global-layer-entry--surface${documentControl.editingScope === 'surface' ? ' global-layer-entry--active' : ''}`}
            aria-pressed={documentControl.editingScope === 'surface'}
            data-testid="surface-layer-entry"
            disabled={documentControl.surfaceLayer.editingDisabled}
            title={documentControl.surfaceLayer.editingUnavailableReason}
            onClick={documentControl.surfaceLayer.onActivate}
          >
            <span className="global-layer-entry__icon"><Layers3 size={19} /></span>
            <span className="global-layer-entry__content">
              <strong>当前内容共用</strong>
              <small>
                {documentControl.surfaceLayer.elementCount} 个元素 · 场景间共享
                {documentControl.surfaceLayer.hasDynamicContent ? ' · 含动态内容' : ''}
                {documentControl.surfaceLayer.editingDisabled ? ' · 暂不可编辑' : ''}
              </small>
            </span>
            <Layers3 size={16} />
          </button>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={documentControl.scenes.map((scene) => scene.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="scene-list">
            {documentControl.scenes.map((scene, index) => (
              <SortableScene
                key={scene.id}
                scene={scene}
                index={index}
                canDelete={documentControl.scenes.length > 1}
                onActivate={() => documentControl.onActivateScene(scene.id)}
                onRename={(name) => documentControl.onRenameScene(scene.id, name)}
                onDelete={() => setPendingDelete(scene)}
                onDuplicate={() => documentControl.onDuplicateScene(scene.id)}
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
          if (pendingDelete) documentControl.onDeleteScene(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </aside>
  )
}

export function LegacyScenePanelAdapter() {
  const scenes = useEditorStore((state) => state.project.scenes)
  const globalLayer = useEditorStore(
    (state) => state.project.globalLayer,
  )
  const globalRuntime = useEditorStore((state) => state.project.globalRuntime)
  const assets = useEditorStore((state) => state.project.assets)
  const assetFiles = useEditorStore((state) => state.assetFiles)
  const componentPackages = useEditorStore((state) => state.componentPackages)
  const editingScope = useEditorStore((state) => state.editingScope)
  const activeSceneId = useEditorStore((state) => state.activeSceneId)
  const addScene = useEditorStore((state) => state.addScene)
  const deleteScene = useEditorStore((state) => state.deleteScene)
  const duplicateScene = useEditorStore((state) => state.duplicateScene)
  const reorderScenes = useEditorStore((state) => state.reorderScenes)
  const updateScene = useEditorStore((state) => state.updateScene)
  const setActiveScene = useEditorStore((state) => state.setActiveScene)
  const setEditingScope = useEditorStore((state) => state.setEditingScope)
  const sceneRows = useMemo<ScenePanelSceneRow[]>(() => scenes.map((scene) => {
    const presentation = ensureScenePresentation(scene)
    const thumbnailStateId = presentation.thumbnailStateId ?? presentation.initialStateId
    const thumbnailState = presentation.states.find((state) => state.id === thumbnailStateId)
    return {
      id: scene.id,
      name: scene.name,
      active: editingScope === 'scene' && scene.id === activeSceneId,
      showRuntimeBadge: hasUnrepresentedRuntime(scene, globalRuntime),
      thumbnailStateName: thumbnailState?.name ?? '初始状态',
      thumbnail: buildLegacySceneThumbnailRenderModel({
        scene,
        globalLayer,
        globalRuntime,
        assets,
        assetFiles,
        componentPackages,
      }),
    }
  }), [
    activeSceneId,
    assetFiles,
    assets,
    componentPackages,
    editingScope,
    globalLayer,
    globalRuntime,
    scenes,
  ])

  return <ScenePanelContent documentControl={{
    editingScope,
    globalElementCount: globalLayer.length,
    globalHasRuntime: Boolean(globalRuntime),
    scenes: sceneRows,
    onAddScene: addScene,
    onActivateScene: setActiveScene,
    onActivateGlobal: () => setEditingScope('global'),
    onRenameScene: (sceneId, name) => updateScene(sceneId, { name }),
    onDeleteScene: deleteScene,
    onDuplicateScene: duplicateScene,
    onReorderScenes: (sceneIds) => reorderScenes([...sceneIds]),
  }} />
}

export function ScenePanel({
  documentControl,
  flowDocumentControl,
  spatialDocumentControl,
}: {
  documentControl?: ScenePanelDocumentControl
  flowDocumentControl?: ScenePanelFlowDocumentControl
  spatialDocumentControl?: ScenePanelSpatialDocumentControl
} = {}) {
  if (flowDocumentControl) {
    return (
      <aside className="panel scene-panel" aria-label="Flow 讲义导航">
        <div className="panel-header">
          <h2 className="panel-title">Flow 讲义</h2>
          {flowDocumentControl.onAddSurface && (
            <button
              type="button"
              className="secondary-button"
              onClick={flowDocumentControl.onAddSurface}
              data-testid="add-flow-surface"
            >
              <Plus size={14} />
              添加 Flow 讲义
            </button>
          )}
        </div>
        <div
          className="scene-panel-surface-title"
          data-testid="scene-panel-surface-title"
        >
          {flowDocumentControl.surfaceTitle}
        </div>
        <div className="scene-panel-flow-outline" data-testid="scene-panel-flow-outline">
          <FlowOutlinePanel
            view={flowDocumentControl.flowView}
            selectedBlockId={flowDocumentControl.selectedBlockId}
            onSelectBlock={flowDocumentControl.onSelectBlock}
          />
        </div>
      </aside>
    )
  }
  if (spatialDocumentControl) {
    const {
      onAddSurface,
      ...cameraPanelProps
    } = spatialDocumentControl
    return (
      <aside className="panel scene-panel" aria-label="Spatial 空间导航">
        <div className="panel-header">
          <h2 className="panel-title">Spatial 空间</h2>
          {onAddSurface && (
            <button
              type="button"
              className="secondary-button"
              onClick={onAddSurface}
              data-testid="add-spatial-surface"
            >
              <Plus size={14} />
              添加 Spatial 空间
            </button>
          )}
        </div>
        <div
          className="scene-panel-surface-title"
          data-testid="scene-panel-surface-title"
        >
          {spatialDocumentControl.surfaceTitle}
        </div>
        <div className="scene-panel-spatial-frames" data-testid="scene-panel-spatial-frames">
          <SpatialCameraPanel {...cameraPanelProps} />
        </div>
      </aside>
    )
  }
  if (documentControl?.unavailableReason) {
    return (
      <aside className="panel scene-panel" aria-label="场景列表">
        <div className="panel-header">
          <h2 className="panel-title">场景</h2>
        </div>
        <div
          className="right-sidebar-capability-gate"
          role="status"
          data-testid="scene-panel-course-location-gate"
        >
          <strong>当前内容暂不可编辑</strong>
          <p>{documentControl.unavailableReason}</p>
        </div>
      </aside>
    )
  }
  return documentControl
    ? <ScenePanelContent documentControl={documentControl} />
    : <LegacyScenePanelAdapter />
}
