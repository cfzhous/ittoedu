import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  LayerItem,
  SpatialCameraFrame,
  SpatialCameraPose,
  SpatialRelation,
  SpatialSurfaceDocument,
} from '../../shared/courseProjectTypes'
import { LAYER_KIND_LABELS } from './courseTeacherLabels'

function sameCamera(left: SpatialCameraPose, right: SpatialCameraPose): boolean {
  return Math.abs(left.x - right.x) < 0.01 &&
    Math.abs(left.y - right.y) < 0.01 &&
    Math.abs(left.zoom - right.zoom) < 0.0001
}

function CommitTextInput({
  value,
  ariaLabel,
  disabled,
  fallback,
  onCommit,
}: {
  value: string
  ariaLabel: string
  disabled?: boolean
  fallback: string
  onCommit(value: string): void
}) {
  const [draft, setDraft] = useState(value)
  const committed = useRef(value)
  useEffect(() => {
    setDraft(value)
    committed.current = value
  }, [value])

  const commit = () => {
    const next = draft.trim() || fallback
    setDraft(next)
    if (next === committed.current) return
    committed.current = next
    onCommit(next)
  }

  return (
    <input
      aria-label={ariaLabel}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          setDraft(committed.current)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function relationVisualIds(surface: SpatialSurfaceDocument): Set<string> {
  return new Set(surface.relations.flatMap((relation) => [
    relation.lineLayerItemId,
    ...(relation.labelLayerItemId ? [relation.labelLayerItemId] : []),
  ]))
}

function nodeLabel(item: LayerItem): string {
  return `${item.label} · ${LAYER_KIND_LABELS[item.kind]}`
}

export interface SpatialRelationUpdate {
  name?: string
  sourceLayerItemId?: string
  targetLayerItemId?: string
}

export function SpatialRelationsEditor({
  surface,
  selectedLayerItemIds,
  disabled,
  onCreate,
  onUpdate,
  onSelectVisual,
  onDelete,
}: {
  surface: SpatialSurfaceDocument
  selectedLayerItemIds: readonly string[]
  disabled: boolean
  onCreate(input: { sourceLayerItemId: string; targetLayerItemId: string; name: string }): void
  onUpdate(relationId: string, update: SpatialRelationUpdate): void
  onSelectVisual(layerItemId: string): void
  onDelete(relationId: string): void
}) {
  const [newName, setNewName] = useState('')
  const visualIds = useMemo(() => relationVisualIds(surface), [surface])
  const nodes = surface.world.layerItems.filter((item) => !visualIds.has(item.layerItemId))
  const nodesById = new Map(nodes.map((item) => [item.layerItemId, item] as const))
  const selectedNodes = selectedLayerItemIds
    .map((id) => nodesById.get(id))
    .filter((item): item is LayerItem => Boolean(item))
  const selectedRelation = surface.relations.find((relation) => (
    selectedLayerItemIds.includes(relation.lineLayerItemId) ||
    Boolean(relation.labelLayerItemId && selectedLayerItemIds.includes(relation.labelLayerItemId))
  ))

  return (
    <section className="course-properties course-spatial-relations" aria-label="关系与连线">
      <h3>关系与连线</h3>
      <p className="course-empty">
        在画布上按住 Shift 选择两个节点即可连接。生成的连线和文字仍是普通图层，可继续调整箭头、颜色、位置与字体。
      </p>
      <label className="course-field">
        <span>关系文字</span>
        <input
          aria-label="新关系文字"
          placeholder="例如：导致、属于、对比"
          value={newName}
          disabled={disabled}
          onChange={(event) => setNewName(event.target.value)}
        />
      </label>
      <div className="course-spatial-selection-summary" aria-live="polite">
        {selectedNodes.length === 2
          ? `已选：${selectedNodes.map((item) => item.label).join(' → ')}`
          : selectedNodes.length > 2
            ? '当前选中节点超过两个，请只保留两个节点。'
            : `已选 ${selectedNodes.length} 个节点，还需选择 ${2 - selectedNodes.length} 个。`}
      </div>
      <button
        type="button"
        className="course-studio-button course-spatial-connect"
        disabled={disabled || selectedNodes.length !== 2}
        onClick={() => {
          if (selectedNodes.length !== 2) return
          onCreate({
            sourceLayerItemId: selectedNodes[0]!.layerItemId,
            targetLayerItemId: selectedNodes[1]!.layerItemId,
            name: newName.trim() || '关系',
          })
          setNewName('')
        }}
      >
        连接当前两个节点
      </button>

      <div className="course-spatial-relation-list">
        {surface.relations.map((relation, index) => (
          <RelationCard
            key={relation.id}
            relation={relation}
            index={index}
            nodes={nodes}
            active={selectedRelation?.id === relation.id}
            disabled={disabled}
            onUpdate={(update) => onUpdate(relation.id, update)}
            onSelectVisual={onSelectVisual}
            onDelete={() => onDelete(relation.id)}
          />
        ))}
        {surface.relations.length === 0 && (
          <p className="course-spatial-empty">尚未添加连线。</p>
        )}
      </div>
    </section>
  )
}

function RelationCard({
  relation,
  index,
  nodes,
  active,
  disabled,
  onUpdate,
  onSelectVisual,
  onDelete,
}: {
  relation: SpatialRelation
  index: number
  nodes: LayerItem[]
  active: boolean
  disabled: boolean
  onUpdate(update: SpatialRelationUpdate): void
  onSelectVisual(layerItemId: string): void
  onDelete(): void
}) {
  return (
    <article className={`course-spatial-relation${active ? ' is-active' : ''}`} aria-label={`连线 ${index + 1}`}>
      <CommitTextInput
        ariaLabel={`连线 ${index + 1} 的关系文字`}
        value={relation.name}
        fallback="关系"
        disabled={disabled}
        onCommit={(name) => onUpdate({ name })}
      />
      <div className="course-field-grid">
        <label className="course-field">
          <span>起点</span>
          <select
            aria-label={`连线 ${index + 1} 的起点`}
            value={relation.sourceLayerItemId}
            disabled={disabled}
            onChange={(event) => onUpdate({ sourceLayerItemId: event.target.value })}
          >
            {nodes.map((item) => (
              <option
                key={item.layerItemId}
                value={item.layerItemId}
                disabled={item.layerItemId === relation.targetLayerItemId}
              >
                {nodeLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="course-field">
          <span>终点</span>
          <select
            aria-label={`连线 ${index + 1} 的终点`}
            value={relation.targetLayerItemId}
            disabled={disabled}
            onChange={(event) => onUpdate({ targetLayerItemId: event.target.value })}
          >
            {nodes.map((item) => (
              <option
                key={item.layerItemId}
                value={item.layerItemId}
                disabled={item.layerItemId === relation.sourceLayerItemId}
              >
                {nodeLabel(item)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="course-property-actions course-spatial-relation-actions">
        <button type="button" className="course-studio-button" onClick={() => onSelectVisual(relation.lineLayerItemId)}>
          选择连线
        </button>
        <button
          type="button"
          className="course-studio-button"
          disabled={!relation.labelLayerItemId}
          onClick={() => relation.labelLayerItemId && onSelectVisual(relation.labelLayerItemId)}
        >
          选择文字
        </button>
        <button type="button" className="course-studio-button is-danger" disabled={disabled} onClick={onDelete}>
          删除关系
        </button>
      </div>
    </article>
  )
}

export function SpatialTeachingPathPanel({
  surface,
  camera,
  disabled,
  onSetHome,
  onGoHome,
  onSaveFrame,
  onRenameFrame,
  onMoveFrame,
  onDeleteFrame,
  onLocateFrame,
}: {
  surface: SpatialSurfaceDocument
  camera: SpatialCameraPose
  disabled: boolean
  onSetHome(): void
  onGoHome(): void
  onSaveFrame(name?: string): void
  onRenameFrame(frameId: string, name: string): void
  onMoveFrame(frameId: string, toIndex: number): void
  onDeleteFrame(frameId: string): void
  onLocateFrame(frame: SpatialCameraFrame): void
}) {
  const [newFrameName, setNewFrameName] = useState('')
  return (
    <section className="course-spatial-path" aria-label="教学路径与镜头">
      <header>
        <strong>教学路径与镜头</strong>
        <span>按顺序带学生查看重点</span>
      </header>
      <div className="course-spatial-home-actions">
        <button type="button" className="course-studio-button" onClick={onGoHome}>回到首页</button>
        <button
          type="button"
          className="course-studio-button"
          aria-label="将当前画面设为首页"
          disabled={disabled}
          onClick={onSetHome}
        >
          设为首页
        </button>
      </div>
      <div className="course-spatial-save-frame">
        <input
          aria-label="新镜头名称"
          placeholder="镜头名称"
          value={newFrameName}
          disabled={disabled}
          onChange={(event) => setNewFrameName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || disabled) return
            event.preventDefault()
            onSaveFrame(newFrameName.trim() || undefined)
            setNewFrameName('')
          }}
        />
        <button
          type="button"
          className="course-studio-button"
          aria-label="保存当前镜头"
          disabled={disabled}
          onClick={() => {
            onSaveFrame(newFrameName.trim() || undefined)
            setNewFrameName('')
          }}
        >
          保存镜头
        </button>
      </div>
      <ol className="course-spatial-frame-list">
        {surface.camera.frames.map((frame, index) => (
          <li key={frame.id} className={sameCamera(camera, frame) ? 'is-current' : ''}>
            <span className="course-spatial-frame-order">{index + 1}</span>
            <CommitTextInput
              ariaLabel={`第 ${index + 1} 个镜头名称`}
              value={frame.name}
              fallback={`镜头 ${index + 1}`}
              disabled={disabled}
              onCommit={(name) => onRenameFrame(frame.id, name)}
            />
            <span className="course-spatial-frame-zoom">{Math.round(frame.zoom * 100)}%</span>
            <div className="course-spatial-frame-actions">
              <button type="button" className="course-studio-button" onClick={() => onLocateFrame(frame)}>定位</button>
              <button
                type="button"
                className="course-studio-button"
                aria-label={`上移镜头“${frame.name}”`}
                title="上移"
                disabled={disabled || index === 0}
                onClick={() => onMoveFrame(frame.id, index - 1)}
              >↑</button>
              <button
                type="button"
                className="course-studio-button"
                aria-label={`下移镜头“${frame.name}”`}
                title="下移"
                disabled={disabled || index === surface.camera.frames.length - 1}
                onClick={() => onMoveFrame(frame.id, index + 1)}
              >↓</button>
              <button
                type="button"
                className="course-studio-button is-danger"
                aria-label={`删除镜头“${frame.name}”`}
                title="删除"
                disabled={disabled || surface.camera.frames.length <= 1}
                onClick={() => onDeleteFrame(frame.id)}
              >×</button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
