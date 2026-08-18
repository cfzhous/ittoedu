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
import { FileText, Globe2, GripVertical, Layers3, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { deriveCourseEditorLayout, type CourseEditorLayoutResult } from '../course/courseEditorLayout'
import {
  addSpatialCameraFrameFromSession,
  deleteSpatialCameraFrameInSession,
  reorderSpatialCameraFramesInSession,
} from '../course/spatialCameraCommands'
import { selectFlowEditorBlock } from '../course/flowEditorSlice'
import {
  buildCourseTreeView,
  SPATIAL_CAMERA_GROUP_LABEL,
  type CourseTreeNode,
} from '../course/courseTreeView'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import {
  selectActiveCourseLocationId,
  selectActiveCourseProjectDocument,
  selectCandidateGlobalLayerItems,
  useEditorStore,
} from '../store/editorStore'
import { AddCourseContentMenu } from './AddCourseContentMenu'
import { ConfirmDialog } from './ConfirmDialog'

const COURSE_TREE_ROOT_KEY = '__course-tree-root__'

const SORTABLE_PAGE_KINDS = new Set(['slide-page', 'flow-page', 'spatial-page'])

export type CourseTreeReorderPlan =
  | { readonly kind: 'surfaces'; readonly surfaceIds: string[] }
  | { readonly kind: 'scenes'; readonly sceneIds: string[] }
  | { readonly kind: 'cameras'; readonly surfaceId: string; readonly frameId: string; readonly toIndex: number }

type CourseTreeSortableKind = 'page' | 'slide-scene' | 'spatial-camera'

interface CourseTreeSortableSlot {
  readonly id: string
  readonly kind: CourseTreeSortableKind
  readonly parentKey: string
  readonly surfaceId: string
}

function indexCourseTreeSlots(pages: readonly CourseTreeNode[]): Map<string, CourseTreeSortableSlot> {
  const slots = new Map<string, CourseTreeSortableSlot>()
  for (const page of pages) {
    if (SORTABLE_PAGE_KINDS.has(page.kind)) {
      slots.set(page.id, {
        id: page.id,
        kind: 'page',
        parentKey: COURSE_TREE_ROOT_KEY,
        surfaceId: page.surfaceId,
      })
    }
    if (page.kind === 'slide-page') {
      for (const child of page.children) {
        if (child.kind !== 'slide-scene') continue
        slots.set(child.id, {
          id: child.id,
          kind: 'slide-scene',
          parentKey: page.id,
          surfaceId: page.surfaceId,
        })
      }
    }
    if (page.kind === 'spatial-page') {
      for (const group of page.children) {
        if (group.kind !== 'spatial-camera-group') continue
        for (const camera of group.children) {
          if (camera.kind !== 'spatial-camera') continue
          slots.set(camera.id, {
            id: camera.id,
            kind: 'spatial-camera',
            parentKey: group.id,
            surfaceId: page.surfaceId,
          })
        }
      }
    }
  }
  return slots
}

export function planCourseTreeReorder(
  project: Pick<CourseProjectDocument, 'locations' | 'surfaces'>,
  pages: readonly CourseTreeNode[],
  activeId: string,
  overId: string,
): CourseTreeReorderPlan | null {
  if (!activeId || !overId || activeId === overId) return null
  const slots = indexCourseTreeSlots(pages)
  const active = slots.get(activeId)
  const over = slots.get(overId)
  if (!active || !over) return null
  if (active.parentKey !== over.parentKey) return null
  if (active.kind !== over.kind) return null

  if (active.kind === 'page') {
    const surfaceIds = pages.map((page) => page.id)
    const oldIndex = surfaceIds.indexOf(activeId)
    const newIndex = surfaceIds.indexOf(overId)
    if (oldIndex < 0 || newIndex < 0) return null
    return { kind: 'surfaces', surfaceIds: arrayMove(surfaceIds, oldIndex, newIndex) }
  }

  if (active.kind === 'slide-scene') {
    const surface = project.surfaces.find((candidate) => candidate.id === active.surfaceId)
    if (!surface || surface.type !== 'slide') return null
    const sceneIdOf = (locationId: string) => {
      const location = project.locations.find((candidate) => candidate.id === locationId)
      return location?.kind === 'slide-scene' ? location.sceneId : null
    }
    const fromSceneId = sceneIdOf(activeId)
    const toSceneId = sceneIdOf(overId)
    if (!fromSceneId || !toSceneId) return null
    const sceneIds = surface.scenes.map((scene) => scene.id)
    const oldIndex = sceneIds.indexOf(fromSceneId)
    const newIndex = sceneIds.indexOf(toSceneId)
    if (oldIndex < 0 || newIndex < 0) return null
    return { kind: 'scenes', sceneIds: arrayMove(sceneIds, oldIndex, newIndex) }
  }

  const surface = project.surfaces.find((candidate) => candidate.id === active.surfaceId)
  if (!surface || surface.type !== 'spatial-2d') return null
  const frameIdOf = (locationId: string) => {
    const location = project.locations.find((candidate) => candidate.id === locationId)
    return location?.kind === 'spatial-camera' ? location.cameraFrameId : null
  }
  const frameId = frameIdOf(activeId)
  const overFrameId = frameIdOf(overId)
  if (!frameId || !overFrameId) return null
  const toIndex = surface.camera.frames.findIndex((frame) => frame.id === overFrameId)
  if (toIndex < 0) return null
  return { kind: 'cameras', surfaceId: active.surfaceId, frameId, toIndex }
}

function isSortableCourseTreeNode(kind: CourseTreeNode['kind']): boolean {
  return kind === 'slide-page'
    || kind === 'flow-page'
    || kind === 'spatial-page'
    || kind === 'slide-scene'
    || kind === 'spatial-camera'
}

function thumbnailStateNameForTreeNode(
  project: CourseProjectDocument,
  node: CourseTreeNode,
): string | null {
  if (node.kind !== 'slide-scene' || !node.locationId) return null
  const location = project.locations.find((candidate) => candidate.id === node.locationId)
  if (location?.kind !== 'slide-scene') return null
  const surface = project.surfaces.find((candidate) => candidate.id === location.surfaceId)
  if (surface?.type !== 'slide') return null
  const scene = surface.scenes.find((candidate) => candidate.id === location.sceneId)
  const presentation = scene?.presentation
  if (!presentation) return '初始'
  const stateId = presentation.thumbnailStateId ?? presentation.initialStateId
  return presentation.states.find((state) => state.id === stateId)?.name ?? '初始'
}

function slideSceneCountOnSamePage(
  project: CourseProjectDocument,
  node: CourseTreeNode,
): number {
  if (node.kind !== 'slide-scene') return 0
  const surface = project.surfaces.find((candidate) => candidate.id === node.surfaceId)
  return surface?.type === 'slide' ? surface.scenes.length : 0
}

function slideSceneIdFromLocation(
  project: CourseProjectDocument,
  locationId: string,
): string | null {
  const location = project.locations.find((candidate) => candidate.id === locationId)
  return location?.kind === 'slide-scene' ? location.sceneId : null
}

function panelLayoutForActiveLocation(
  project: NonNullable<ReturnType<typeof selectActiveCourseProjectDocument>>,
  activeLocationId: string | null,
): CourseEditorLayoutResult {
  const base = deriveCourseEditorLayout(project, activeLocationId ?? undefined)
  if (base.kind !== 'mixed' || !activeLocationId) return base
  const location = project.locations.find((candidate) => candidate.id === activeLocationId)
  const surface = project.surfaces.find((candidate) => candidate.id === location?.surfaceId)
  if (surface?.type === 'flow') {
    return {
      ...base,
      primary: { action: 'flow-page' },
      dropdown: ['slide-page', 'spatial-page'],
    }
  }
  if (surface?.type === 'spatial-2d') {
    return {
      ...base,
      primary: { action: 'spatial-page' },
      dropdown: ['slide-page', 'flow-page'],
    }
  }
  return base
}

function SortableCourseTreeNode({
  node,
  depth,
  row,
  nested,
}: {
  node: CourseTreeNode
  depth: number
  row: ReactNode
  nested: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id })
  return (
    <div
      ref={setNodeRef}
      className="course-page-tree__node"
      data-kind={node.kind}
      data-testid={`course-page-node-${node.id}`}
      style={{
        marginLeft: depth * 14,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
      }}
    >
      <div className="course-page-tree__row">
        <button
          type="button"
          className="drag-handle"
          title="拖动调整顺序"
          aria-label={`拖动“${node.label}”`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={15} />
        </button>
        {row}
      </div>
      {nested}
    </div>
  )
}

function CourseTreeNodeRow({
  node,
  activeLocationId,
  depth,
  onActivateLocation,
  onRenameFlowPage,
  onRenameFlowHeading,
  onAddSpatialCamera,
  onDeleteSpatialCamera,
  onDeleteSlideScene,
}: {
  node: CourseTreeNode
  activeLocationId: string | null
  depth: number
  onActivateLocation(locationId: string): void
  onRenameFlowPage?(surfaceId: string, title: string): void
  onRenameFlowHeading?(locationId: string, title: string): void
  onAddSpatialCamera?(surfaceId: string): void
  onDeleteSpatialCamera?(locationId: string): void
  onDeleteSlideScene?(locationId: string): void
}) {
  const editingScope = useEditorStore((state) => state.editingScope)
  const project = useEditorStore(selectActiveCourseProjectDocument)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const active = Boolean(
    node.locationId &&
    node.locationId === activeLocationId &&
    editingScope !== 'global',
  )
  const thumbnailStateName = project ? thumbnailStateNameForTreeNode(project, node) : null
  const canDeleteSlideScene = Boolean(
    project && slideSceneCountOnSamePage(project, node) > 1,
  )

  const commitRename = () => {
    if (!editingKey) return
    const next = draft.trim()
    if (editingKey.startsWith('page:') && next) {
      onRenameFlowPage?.(editingKey.slice('page:'.length), next)
    } else if (editingKey.startsWith('heading:') && next) {
      onRenameFlowHeading?.(editingKey.slice('heading:'.length), next)
    }
    setEditingKey(null)
  }

  const renderChild = (child: CourseTreeNode) => (
    <CourseTreeNodeRow
      key={child.id}
      node={child}
      activeLocationId={activeLocationId}
      depth={depth + 1}
      onActivateLocation={onActivateLocation}
      onRenameFlowPage={onRenameFlowPage}
      onRenameFlowHeading={onRenameFlowHeading}
      onAddSpatialCamera={onAddSpatialCamera}
      onDeleteSpatialCamera={onDeleteSpatialCamera}
      onDeleteSlideScene={onDeleteSlideScene}
    />
  )

  if (node.kind === 'spatial-camera-group') {
    return (
      <div
        className="course-page-tree__node course-page-tree__node--camera-group"
        data-kind={node.kind}
        data-testid={`course-page-node-${node.id}`}
        style={{ marginLeft: depth * 14 }}
      >
        <div className="spatial-page-tree__group course-page-tree__group-row">
          <span>{SPATIAL_CAMERA_GROUP_LABEL}</span>
          <button
            type="button"
            className="icon-button"
            data-testid="add-spatial-camera"
            aria-label="添加镜头"
            title="从当前画面添加镜头"
            onClick={() => onAddSpatialCamera?.(node.surfaceId)}
          >
            <Plus size={14} />
          </button>
        </div>
        <SortableContext
          items={node.children.map((child) => child.id)}
          strategy={verticalListSortingStrategy}
        >
          {node.children.map(renderChild)}
        </SortableContext>
      </div>
    )
  }

  const labelContent = editingKey === node.id ? (
    <input
      autoFocus
      className="scene-name-input"
      value={draft}
      maxLength={80}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commitRename}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') setEditingKey(null)
      }}
    />
  ) : (
    <span>{node.label}</span>
  )

  const row = (
    <>
      <button
        type="button"
        className={`course-page-tree__label${active ? ' is-active' : ''}${
          node.kind === 'flow-heading' || node.kind === 'flow-section'
            ? ' course-page-tree__label--heading'
            : ''
        }`}
        disabled={!node.locationId}
        aria-current={active ? 'page' : undefined}
        aria-label={
          node.kind === 'slide-scene' && thumbnailStateName
            ? `打开场景“${node.label}”；缩略图使用状态“${thumbnailStateName}”`
            : undefined
        }
        data-testid={
          node.kind === 'flow-page'
            ? `flow-page-${node.surfaceId}`
            : node.kind === 'flow-heading' || node.kind === 'flow-section'
              ? `flow-heading-${node.locationId}`
              : node.kind === 'spatial-camera'
                ? `spatial-camera-${node.id}`
                : node.kind === 'slide-scene'
                  ? `scene-item-${node.id}`
                  : undefined
        }
        data-heading-level={
          node.kind === 'flow-heading' || node.kind === 'flow-section'
            ? node.kind === 'flow-section' ? 2 : 1
            : undefined
        }
        onClick={() => {
          if (node.locationId) onActivateLocation(node.locationId)
        }}
        onDoubleClick={(event) => {
          if (node.kind === 'flow-page') {
            event.preventDefault()
            setEditingKey(`page:${node.surfaceId}`)
            setDraft(node.label)
            return
          }
          if (node.kind === 'flow-heading' || node.kind === 'flow-section') {
            event.preventDefault()
            setEditingKey(`heading:${node.locationId}`)
            setDraft(node.label)
          }
        }}
      >
        {node.kind === 'flow-page' || node.kind === 'spatial-page' || node.kind === 'slide-page' ? (
          <FileText size={14} />
        ) : null}
        {labelContent}
        {node.kind === 'slide-scene' && thumbnailStateName ? (
          <small>缩略图 · {thumbnailStateName}</small>
        ) : null}
      </button>
      {node.kind === 'spatial-camera' && onDeleteSpatialCamera && node.locationId ? (
        <button
          type="button"
          className="icon-button"
          aria-label={`删除镜头 ${node.label}`}
          onClick={() => onDeleteSpatialCamera(node.locationId!)}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
      {node.kind === 'slide-scene' && node.locationId ? (
        <button
          type="button"
          className="icon-button icon-button--danger"
          title={canDeleteSlideScene ? '删除场景' : '至少保留一个场景'}
          aria-label={`删除“${node.label}”`}
          disabled={!canDeleteSlideScene}
          onClick={(event) => {
            event.stopPropagation()
            if (canDeleteSlideScene) onDeleteSlideScene?.(node.locationId!)
          }}
        >
          <Trash2 size={14} />
        </button>
      ) : null}
    </>
  )

  const nested = node.kind === 'slide-page' ? (
    <SortableContext
      items={node.children.map((child) => child.id)}
      strategy={verticalListSortingStrategy}
    >
      {node.children.map(renderChild)}
    </SortableContext>
  ) : (
    node.children.map(renderChild)
  )

  if (isSortableCourseTreeNode(node.kind)) {
    return (
      <SortableCourseTreeNode node={node} depth={depth} row={row} nested={nested} />
    )
  }

  return (
    <div
      className="course-page-tree__node"
      data-kind={node.kind}
      data-testid={`course-page-node-${node.id}`}
      style={{ marginLeft: depth * 14 }}
    >
      <div className="course-page-tree__row">
        {row}
      </div>
      {nested}
    </div>
  )
}

export function ScenePanel() {
  const project = useEditorStore(selectActiveCourseProjectDocument)
  const activeLocationId = useEditorStore(selectActiveCourseLocationId)
  const editingScope = useEditorStore((state) => state.editingScope)
  const globalLayerCount = useEditorStore(selectCandidateGlobalLayerItems)?.length ?? 0
  const setEditingScope = useEditorStore((state) => state.setEditingScope)
  const activateCourseLocation = useEditorStore((state) => state.activateCourseLocation)
  const addCourseContent = useEditorStore((state) => state.addCourseContent)
  const reorderCourseSurfaces = useEditorStore((state) => state.reorderCourseSurfaces)
  const reorderScenes = useEditorStore((state) => state.reorderScenes)
  const runSpatialCommand = useEditorStore((state) => state.runSpatialCommand)
  const applyFlowSelection = useEditorStore((state) => state.applyFlowSelection)
  const renameFlowHeading = useEditorStore((state) => state.renameFlowHeading)
  const renameFlowPage = useEditorStore((state) => state.renameFlowPage)
  const flowSession = useEditorStore((state) => state.flowSession)
  const spatialSession = useEditorStore((state) => state.spatialSession)
  const [pendingDeleteCameraId, setPendingDeleteCameraId] = useState<string | null>(null)
  const [pendingDeleteSceneId, setPendingDeleteSceneId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const treeView = useMemo(
    () => (project ? buildCourseTreeView(project) : null),
    [project],
  )
  const layout = useMemo(
    () => (project ? panelLayoutForActiveLocation(project, activeLocationId) : null),
    [project, activeLocationId],
  )

  const pendingCameraName = useMemo(() => {
    if (!project || !pendingDeleteCameraId) return null
    for (const surface of project.surfaces) {
      if (surface.type !== 'spatial-2d') continue
      const frame = surface.camera.frames.find((candidate) => candidate.id === pendingDeleteCameraId)
      if (frame) return frame.name
    }
    return pendingDeleteCameraId
  }, [project, pendingDeleteCameraId])

  const pendingSceneName = useMemo(() => {
    if (!project || !pendingDeleteSceneId) return null
    for (const surface of project.surfaces) {
      if (surface.type !== 'slide') continue
      const scene = surface.scenes.find((candidate) => candidate.id === pendingDeleteSceneId)
      if (scene) return scene.name
    }
    return pendingDeleteSceneId
  }, [project, pendingDeleteSceneId])

  if (!project || !treeView || !layout) {
    return null
  }

  const activateLocation = (locationId: string) => {
    const location = project.locations.find((candidate) => candidate.id === locationId)
    if (!location) return
    if (location.kind === 'flow-block') {
      if (flowSession) {
        applyFlowSelection(selectFlowEditorBlock(project, locationId, location.blockId))
      } else {
        activateCourseLocation(locationId)
      }
      return
    }
    activateCourseLocation(locationId)
  }

  const handlePrimaryAdd = () => {
    if (layout.primary.action === 'scene' && layout.primary.surfaceId) {
      addCourseContent('scene', { surfaceId: layout.primary.surfaceId })
      return
    }
    addCourseContent(layout.primary.action)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const plan = planCourseTreeReorder(
      project,
      treeView.pages,
      String(active.id),
      String(over.id),
    )
    if (!plan) return
    if (plan.kind === 'surfaces') {
      reorderCourseSurfaces(plan.surfaceIds)
      return
    }
    if (plan.kind === 'scenes') {
      if (flowSession || spatialSession) {
        const dragged = project.locations.find((location) => location.id === String(active.id))
        if (dragged) activateCourseLocation(dragged.id)
      }
      reorderScenes(plan.sceneIds)
      return
    }
    if (spatialSession?.selection.surfaceId !== plan.surfaceId) {
      const target = project.locations.find((location) =>
        location.kind === 'spatial-camera'
        && location.surfaceId === plan.surfaceId
        && location.cameraFrameId === plan.frameId,
      )
      if (target) activateCourseLocation(target.id)
    }
    runSpatialCommand((current) =>
      reorderSpatialCameraFramesInSession(current, plan.frameId, plan.toIndex),
    )
  }

  return (
    <aside className="panel scene-panel" aria-label="课程结构">
      <div className="panel-header">
        <h2 className="panel-title">{treeView.shared.label}</h2>
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
            <strong>{treeView.shared.globalEntry.label}（{treeView.shared.globalEntry.rangeLabel}）</strong>
            <small>{globalLayerCount} 个元素</small>
          </span>
          <Layers3 size={16} />
        </button>
      </div>
      <div className="scene-panel__divider" role="separator" />
      <div className="panel-header panel-header--course-structure">
        <h2 className="panel-title">课程结构</h2>
        <AddCourseContentMenu
          layout={layout}
          onPrimary={handlePrimaryAdd}
          onAddSlidePage={layout.dropdown.includes('slide-page')
            ? () => addCourseContent('slide-page')
            : undefined}
          onAddFlowPage={layout.dropdown.includes('flow-page')
            ? () => addCourseContent('flow-page')
            : undefined}
          onAddSpatialPage={layout.dropdown.includes('spatial-page')
            ? () => addCourseContent('spatial-page')
            : undefined}
        />
      </div>
      <div className="course-page-tree" data-testid="course-page-tree">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={treeView.pages.map((page) => page.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="course-page-tree__list">
              {treeView.pages.map((page) => (
                <CourseTreeNodeRow
                  key={page.id}
                  node={page}
                  activeLocationId={activeLocationId}
                  depth={0}
                  onActivateLocation={activateLocation}
                  onRenameFlowPage={renameFlowPage}
                  onRenameFlowHeading={renameFlowHeading}
                  onAddSpatialCamera={(surfaceId) => {
                    if (spatialSession?.selection.surfaceId !== surfaceId) {
                      const target = project.locations.find((location) =>
                        location.surfaceId === surfaceId && location.kind === 'spatial-camera',
                      )
                      if (target) activateCourseLocation(target.id)
                    }
                    runSpatialCommand((current) => addSpatialCameraFrameFromSession(current), {
                      statusMessage: '已添加镜头',
                    })
                  }}
                  onDeleteSpatialCamera={(locationId) => {
                    const spatialLocation = project.locations.find((location) => location.id === locationId)
                    if (spatialLocation?.kind === 'spatial-camera') {
                      setPendingDeleteSceneId(null)
                      setPendingDeleteCameraId(spatialLocation.cameraFrameId)
                    }
                  }}
                  onDeleteSlideScene={(locationId) => {
                    const sceneId = slideSceneIdFromLocation(project, locationId)
                    if (sceneId) {
                      setPendingDeleteCameraId(null)
                      setPendingDeleteSceneId(sceneId)
                    }
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDeleteCameraId)}
        title="删除镜头？"
        message={pendingCameraName ? `“${pendingCameraName}”将被删除。此操作可以撤销。` : ''}
        confirmLabel="删除镜头"
        danger
        onCancel={() => setPendingDeleteCameraId(null)}
        onConfirm={() => {
          if (pendingDeleteCameraId) {
            runSpatialCommand((current) =>
              deleteSpatialCameraFrameInSession(current, pendingDeleteCameraId),
            )
          }
          setPendingDeleteCameraId(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(pendingDeleteSceneId)}
        title="删除场景？"
        message={pendingSceneName ? `“${pendingSceneName}”及其中的全部节点将被删除。此操作可以撤销。` : ''}
        confirmLabel="删除场景"
        danger
        onCancel={() => setPendingDeleteSceneId(null)}
        onConfirm={() => {
          if (pendingDeleteSceneId) {
            useEditorStore.getState().deleteScene(pendingDeleteSceneId)
          }
          setPendingDeleteSceneId(null)
        }}
      />
    </aside>
  )
}
