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
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
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
import type {
  CoursePageTreeNode,
  CourseStructureViewModel,
} from '../course/courseEditorLayout'
import {
  GLOBAL_LAYER_ENTRY_ID,
  SHARED_CONTENT_SECTION_ID,
} from '../course/courseEditorLayout'
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

export type ScenePanelCourseLocationKind =
  | 'slide-scene'
  | 'flow-block'
  | 'spatial-camera'

export interface ScenePanelCourseLocation {
  locationId: string
  label: string
  kind: ScenePanelCourseLocationKind
  surfaceId: string
  active: boolean
}

const scenePanelCourseLocationKindLabels: Record<
  ScenePanelCourseLocationKind,
  string
> = {
  'slide-scene': '幻灯片',
  'flow-block': '讲义',
  'spatial-camera': '空间',
}

interface CourseLocationNavProps {
  courseLocations: readonly ScenePanelCourseLocation[]
  onActivateLocation?: (locationId: string) => void
  onAddFlowSurface?: () => void
  onAddSpatialSurface?: () => void
}

const courseLocationNavListStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  maxHeight: 220,
  overflowX: 'hidden',
  overflowY: 'auto',
  padding: 8,
}

const courseLocationNavKindStyle: CSSProperties = {
  padding: '2px 6px',
  borderRadius: 6,
  background: 'rgba(91, 156, 255, 0.16)',
  color: '#b9d3ff',
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

const courseLocationNavLabelStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  fontSize: 12,
  fontWeight: 600,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

function courseLocationNavItemStyle(active: boolean): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    gap: 8,
    alignItems: 'center',
    width: '100%',
    minHeight: 40,
    padding: '6px 9px',
    border: `1px solid ${active ? 'rgba(91, 156, 255, 0.58)' : 'var(--border)'}`,
    borderRadius: 8,
    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
    background: active ? 'var(--accent-soft)' : 'var(--panel-bg-elevated)',
    boxShadow: active ? 'inset 3px 0 0 #5b9cff' : 'none',
    textAlign: 'left',
    cursor: 'pointer',
  }
}

function CourseLocationNav({
  courseLocations,
  onActivateLocation,
  onAddFlowSurface,
  onAddSpatialSurface,
}: CourseLocationNavProps) {
  return (
    <section
      className="course-location-nav"
      data-testid="course-location-nav"
      aria-label="课程内容"
    >
      <div className="panel-header">
        <h2 className="panel-title">课程内容</h2>
        {(onAddFlowSurface || onAddSpatialSurface) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {onAddFlowSurface && (
              <button
                type="button"
                className="secondary-button"
                onClick={onAddFlowSurface}
                data-testid="add-flow-surface"
              >
                <Plus size={14} />
                添加讲义
              </button>
            )}
            {onAddSpatialSurface && (
              <button
                type="button"
                className="secondary-button"
                onClick={onAddSpatialSurface}
                data-testid="add-spatial-surface"
              >
                <Plus size={14} />
                添加空间
              </button>
            )}
          </div>
        )}
      </div>
      <div
        className="course-location-nav__list"
        style={courseLocationNavListStyle}
      >
        {courseLocations.map((location) => (
          <button
            key={location.locationId}
            type="button"
            className={`course-location-nav__item${location.active ? ' course-location-nav__item--active' : ''}`}
            style={courseLocationNavItemStyle(location.active)}
            data-testid={`course-location-${location.locationId}`}
            data-location-id={location.locationId}
            data-kind={location.kind}
            aria-current={location.active ? 'page' : undefined}
            onClick={() => onActivateLocation?.(location.locationId)}
          >
            <span style={courseLocationNavKindStyle}>
              {scenePanelCourseLocationKindLabels[location.kind]}
            </span>
            <span style={courseLocationNavLabelStyle}>{location.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
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
  courseLocations,
  onActivateLocation,
  onAddFlowSurface,
  onAddSpatialSurface,
  footer,
}: {
  documentControl: ScenePanelDocumentControl
  courseLocations?: readonly ScenePanelCourseLocation[]
  onActivateLocation?: (locationId: string) => void
  onAddFlowSurface?: () => void
  onAddSpatialSurface?: () => void
  footer?: ReactNode
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
      {courseLocations && (
        <CourseLocationNav
          courseLocations={courseLocations}
          onActivateLocation={onActivateLocation}
          onAddFlowSurface={onAddFlowSurface}
          onAddSpatialSurface={onAddSpatialSurface}
        />
      )}
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
      <div
        className="global-layer-entry-wrap"
        data-testid="shared-content-section"
        aria-label="共享内容"
      >
        <button
          type="button"
          className={`global-layer-entry${documentControl.editingScope === 'global' ? ' global-layer-entry--active' : ''}`}
          aria-pressed={documentControl.editingScope === 'global'}
          data-testid="global-layer-entry"
          data-entry-id={GLOBAL_LAYER_ENTRY_ID}
          data-section-id={SHARED_CONTENT_SECTION_ID}
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
      {footer}
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

function SharedContentSection({
  active,
  globalElementCount,
  globalHasRuntime,
  onSelect,
}: {
  active: boolean
  globalElementCount?: number
  globalHasRuntime?: boolean
  onSelect(): void
}) {
  return (
    <section
      className="shared-content-section"
      data-testid="shared-content-section"
      aria-label="共享内容"
    >
      <div className="panel-header">
        <h2 className="panel-title">共享内容</h2>
      </div>
      <button
        type="button"
        className={`global-layer-entry${active ? ' global-layer-entry--active' : ''}`}
        aria-pressed={active}
        data-testid="global-layer-entry"
        data-entry-id={GLOBAL_LAYER_ENTRY_ID}
        data-section-id={SHARED_CONTENT_SECTION_ID}
        onClick={onSelect}
      >
        <span className="global-layer-entry__icon"><Globe2 size={19} /></span>
        <span className="global-layer-entry__content">
          <strong>全局层</strong>
          <small>
            全课
            {globalElementCount !== undefined ? ` · ${globalElementCount} 个元素` : ''}
            {globalHasRuntime ? ' · 自定义动态内容' : ''}
          </small>
        </span>
        <Layers3 size={16} />
      </button>
    </section>
  )
}

function CoursePageTreeItem({
  node,
  activeLocationId,
  onActivate,
}: {
  node: CoursePageTreeNode
  activeLocationId?: string | null
  onActivate(locationId: string): void
}) {
  const active = Boolean(node.locationId && node.locationId === activeLocationId)
  return (
    <div
      className="course-page-tree__node"
      data-kind={node.kind}
      data-testid={`course-page-node-${node.id}`}
    >
      <button
        type="button"
        className={`course-page-tree__label${active ? ' is-active' : ''}`}
        disabled={!node.locationId}
        aria-current={active ? 'page' : undefined}
        onClick={() => {
          if (node.locationId) onActivate(node.locationId)
        }}
      >
        <span>{node.label}</span>
      </button>
      {node.children.length > 0 && (
        <div className="course-page-tree__children">
          {node.children.map((child) => (
            <CoursePageTreeItem
              key={child.id}
              node={child}
              activeLocationId={activeLocationId}
              onActivate={onActivate}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AddContentMenu({
  onAddSlidePage,
  onAddFlowPage,
  onAddSpatialPage,
}: {
  onAddSlidePage?(): void
  onAddFlowPage?(): void
  onAddSpatialPage?(): void
}) {
  return (
    <details className="add-content-menu" data-testid="add-content-menu">
      <summary className="secondary-button">
        <Plus size={14} />
        新增内容
      </summary>
      <div className="add-content-menu__panel" role="menu" aria-label="新增内容">
        <button
          type="button"
          role="menuitem"
          data-testid="add-slide-page"
          onClick={(event) => {
            event.currentTarget.closest('details')?.removeAttribute('open')
            onAddSlidePage?.()
          }}
        >
          空白演示
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="add-flow-page"
          onClick={(event) => {
            event.currentTarget.closest('details')?.removeAttribute('open')
            onAddFlowPage?.()
          }}
        >
          空白流式
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="add-spatial-page"
          onClick={(event) => {
            event.currentTarget.closest('details')?.removeAttribute('open')
            onAddSpatialPage?.()
          }}
        >
          空白无限画布
        </button>
      </div>
    </details>
  )
}

function CompactSlideList({
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
    <>
      <div className="panel-header">
        <h2 className="panel-title">幻灯片</h2>
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
            </small>
          </span>
        </button>
      )}
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
    </>
  )
}

export function ScenePanel({
  documentControl,
  flowDocumentControl,
  spatialDocumentControl,
  courseLocations,
  courseStructure,
  authoringScope,
  activeLocationId,
  onActivateLocation,
  onSelectGlobalLayer,
  onAddSlidePage,
  onAddFlowPage,
  onAddSpatialPage,
  onAddFlowSurface,
  onAddSpatialSurface,
}: {
  documentControl?: ScenePanelDocumentControl
  flowDocumentControl?: ScenePanelFlowDocumentControl
  spatialDocumentControl?: ScenePanelSpatialDocumentControl
  courseLocations?: readonly ScenePanelCourseLocation[]
  courseStructure?: CourseStructureViewModel
  authoringScope?: 'location' | 'global-layer'
  activeLocationId?: string | null
  onActivateLocation?: (locationId: string) => void
  onSelectGlobalLayer?: () => void
  onAddSlidePage?: () => void
  onAddFlowPage?: () => void
  onAddSpatialPage?: () => void
  onAddFlowSurface?: () => void
  onAddSpatialSurface?: () => void
} = {}) {
  if (courseStructure) {
    const unavailable = courseStructure.layout.layout === 'unavailable'
    const compactSlide = courseStructure.pageTree.compact && Boolean(documentControl)
    if (compactSlide && documentControl) {
      return (
        <ScenePanelContent
          documentControl={documentControl}
          footer={(
            <AddContentMenu
              onAddSlidePage={onAddSlidePage}
              onAddFlowPage={onAddFlowPage ?? onAddFlowSurface}
              onAddSpatialPage={onAddSpatialPage ?? onAddSpatialSurface}
            />
          )}
        />
      )
    }
    return (
      <aside className="panel scene-panel" aria-label={courseStructure.shell.leftPanelLabel}>
        <SharedContentSection
          active={authoringScope === 'global-layer'}
          globalElementCount={documentControl?.globalElementCount}
          globalHasRuntime={documentControl?.globalHasRuntime}
          onSelect={() => onSelectGlobalLayer?.()}
        />
        {unavailable ? (
          <div
            className="right-sidebar-capability-gate"
            role="status"
            data-testid="scene-panel-course-location-gate"
          >
            <strong>当前内容暂不可编辑</strong>
            <p>{courseStructure.layout.unavailable?.message ?? '当前位置不可用'}</p>
          </div>
        ) : (
          <section
            className="course-page-tree"
            data-testid="course-page-tree"
            aria-label="课程结构"
          >
            <div className="panel-header">
              <h2 className="panel-title">
                {courseStructure.shell.leftPanelLabel === '幻灯片' ? '幻灯片' : '课程结构'}
              </h2>
            </div>
            <div className="course-page-tree__list">
              {courseStructure.pageTree.nodes.map((node) => (
                <CoursePageTreeItem
                  key={node.id}
                  node={node}
                  activeLocationId={activeLocationId}
                  onActivate={(locationId) => onActivateLocation?.(locationId)}
                />
              ))}
            </div>
          </section>
        )}
        <AddContentMenu
          onAddSlidePage={onAddSlidePage}
          onAddFlowPage={onAddFlowPage ?? onAddFlowSurface}
          onAddSpatialPage={onAddSpatialPage ?? onAddSpatialSurface}
        />
      </aside>
    )
  }

  const courseLocationNav = courseLocations ? (
    <CourseLocationNav
      courseLocations={courseLocations}
      onActivateLocation={onActivateLocation}
      onAddFlowSurface={onAddFlowSurface}
      onAddSpatialSurface={onAddSpatialSurface}
    />
  ) : null

  if (flowDocumentControl) {
    return (
      <aside className="panel scene-panel" aria-label="Flow 讲义导航">
        {courseLocationNav}
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
        {courseLocationNav}
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
        {courseLocationNav}
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
  if (documentControl) {
    return (
      <ScenePanelContent
        documentControl={documentControl}
        courseLocations={courseLocations}
        onActivateLocation={onActivateLocation}
        onAddFlowSurface={onAddFlowSurface}
        onAddSpatialSurface={onAddSpatialSurface}
      />
    )
  }
  if (courseLocations) {
    return (
      <aside className="panel scene-panel" aria-label="课程内容">
        {courseLocationNav}
      </aside>
    )
  }
  return <LegacyScenePanelAdapter />
}