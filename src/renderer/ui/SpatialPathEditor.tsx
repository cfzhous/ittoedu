import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  LayerItem,
  SpatialPathDocument,
  SpatialPathStyle,
  SpatialRelationDocument,
  SpatialRelationKind,
} from '../../shared/courseProjectTypes'

export type SpatialPathEditorMode = 'hidden' | 'page-section' | 'path' | 'relation'

export interface SpatialPathEditorProps {
  readonly surfaceTitle: string
  readonly worldLayerItems: readonly LayerItem[]
  readonly paths: readonly SpatialPathDocument[]
  readonly relations: readonly SpatialRelationDocument[]
  readonly pageSection?: boolean
  readonly selectedPathId?: string | null
  readonly selectedRelationId?: string | null
  readonly disabled?: boolean
  readonly onAddPath: (input: {
    name: string
    layerItemIds: string[]
    style?: SpatialPathStyle
  }) => void
  readonly onRenamePath: (pathId: string, name: string) => void
  readonly onUpdatePathStyle: (pathId: string, style: SpatialPathStyle) => void
  readonly onReorderPathWaypoints?: (pathId: string, layerItemIds: string[]) => void
  readonly onDeletePath: (pathId: string) => void
  readonly onAddRelation: (input: {
    sourceLayerItemId: string
    targetLayerItemId: string
    kind: SpatialRelationKind
    label?: string
  }) => void
  readonly onUpdateRelationLabel: (relationId: string, label: string) => void
  readonly onUpdateRelationKind: (relationId: string, kind: SpatialRelationKind) => void
  readonly onDeleteRelation: (relationId: string) => void
}

function BufferedTextInput({
  value,
  ariaLabel,
  disabled,
  allowEmpty = false,
  onCommit,
}: {
  value: string
  ariaLabel: string
  disabled?: boolean
  allowEmpty?: boolean
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const commit = () => {
    const next = draft.trim()
    if (!next && !allowEmpty) {
      setDraft(value)
      return
    }
    if (next === value) {
      setDraft(value)
      return
    }
    onCommit(next)
  }

  return (
    <input
      className="form-input"
      aria-label={ariaLabel}
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

const DASH_OPTIONS = ['solid', 'dashed', 'dotted'] as const

export function spatialPathEditorMode(props: {
  readonly pageSection?: boolean
  readonly selectedPathId?: string | null
  readonly selectedRelationId?: string | null
}): SpatialPathEditorMode {
  if (props.selectedPathId) return 'path'
  if (props.selectedRelationId) return 'relation'
  if (props.pageSection) return 'page-section'
  return 'hidden'
}

function PathStyleFields({
  path,
  disabled,
  onUpdatePathStyle,
}: {
  path: SpatialPathDocument
  disabled?: boolean
  onUpdatePathStyle: (pathId: string, style: SpatialPathStyle) => void
}) {
  return (
    <div className="form-field">
      <label>
        <span>颜色</span>
        <input
          type="color"
          aria-label={`路径颜色 ${path.name}`}
          disabled={disabled}
          value={path.style?.color ?? '#3388ff'}
          onChange={(event) => onUpdatePathStyle(path.id, {
            ...path.style,
            color: event.currentTarget.value,
          })}
        />
      </label>
      <label>
        <span>线宽</span>
        <input
          className="form-input"
          type="number"
          aria-label={`路径线宽 ${path.name}`}
          disabled={disabled}
          min={0.5}
          step={0.5}
          defaultValue={path.style?.width ?? 2}
          key={`${path.id}-width-${path.style?.width ?? 2}`}
          onBlur={(event) => {
            const width = Number(event.currentTarget.value)
            if (Number.isFinite(width) && width > 0 && width !== (path.style?.width ?? 2)) {
              onUpdatePathStyle(path.id, { ...path.style, width })
            }
          }}
        />
      </label>
      <label>
        <span>线型</span>
        <select
          className="form-input"
          aria-label={`路径线型 ${path.name}`}
          disabled={disabled}
          value={path.style?.dash ?? 'solid'}
          onChange={(event) => onUpdatePathStyle(path.id, {
            ...path.style,
            dash: event.currentTarget.value as SpatialPathStyle['dash'],
          })}
        >
          {DASH_OPTIONS.map((dash) => (
            <option value={dash} key={dash}>
              {dash === 'solid' ? '实线' : dash === 'dashed' ? '虚线' : '点线'}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

/**
 * Lightweight path/relation fields. Default render is hidden. R5-Z should
 * mount this as a collapsed Properties page segment or after a canvas hit on
 * a path/relation. Do not import into App / RightSidebar / PropertiesTab.
 */
export function SpatialPathEditor(props: SpatialPathEditorProps): React.JSX.Element | null {
  const mode = spatialPathEditorMode(props)
  if (mode === 'hidden') return null

  const {
    surfaceTitle,
    worldLayerItems,
    paths,
    relations,
    selectedPathId,
    selectedRelationId,
    disabled = false,
    onAddPath,
    onRenamePath,
    onUpdatePathStyle,
    onReorderPathWaypoints,
    onDeletePath,
    onAddRelation,
    onUpdateRelationLabel,
    onUpdateRelationKind,
    onDeleteRelation,
  } = props

  const [pathName, setPathName] = useState('')
  const [pathLayerItemIds, setPathLayerItemIds] = useState<string[]>([])
  const [relationSourceId, setRelationSourceId] = useState('')
  const [relationTargetId, setRelationTargetId] = useState('')
  const [relationKind, setRelationKind] = useState<SpatialRelationKind>('arrow')
  const [relationLabel, setRelationLabel] = useState('')

  const layerLabel = (layerItemId: string): string => (
    worldLayerItems.find((item) => item.layerItemId === layerItemId)?.label || layerItemId
  )

  const canAddPath = pathName.trim().length > 0 && pathLayerItemIds.length > 0
  const canAddRelation = relationSourceId.length > 0
    && relationTargetId.length > 0
    && relationSourceId !== relationTargetId

  const selectedPath = selectedPathId
    ? paths.find((path) => path.id === selectedPathId)
    : undefined
  const selectedRelation = selectedRelationId
    ? relations.find((relation) => relation.id === selectedRelationId)
    : undefined

  const createPathForm = (
    <>
      <div className="form-field">
        <label htmlFor="spatial-path-name">路径名称</label>
        <input
          id="spatial-path-name"
          className="form-input"
          aria-label="路径名称"
          disabled={disabled}
          value={pathName}
          maxLength={200}
          onChange={(event) => setPathName(event.currentTarget.value)}
        />
      </div>
      {worldLayerItems.length === 0 ? (
        <p className="property-hint">当前空间表面还没有可作为路径点的世界图层。</p>
      ) : worldLayerItems.map((item) => (
        <label className="property-hint" key={item.layerItemId}>
          <input
            type="checkbox"
            disabled={disabled}
            checked={pathLayerItemIds.includes(item.layerItemId)}
            onChange={() => setPathLayerItemIds((current) => (
              current.includes(item.layerItemId)
                ? current.filter((id) => id !== item.layerItemId)
                : [...current, item.layerItemId]
            ))}
          />
          {layerLabel(item.layerItemId)}
        </label>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={disabled || !canAddPath}
        onClick={() => {
          onAddPath({
            name: pathName.trim(),
            layerItemIds: pathLayerItemIds,
            style: { color: '#3388ff', width: 2, dash: 'solid' },
          })
          setPathName('')
          setPathLayerItemIds([])
        }}
      >
        <Plus size={14} />添加路径
      </button>
    </>
  )

  const createRelationForm = (
    <>
      <label className="form-field">
        <span>起点</span>
        <select
          className="form-input"
          aria-label="关系起点"
          disabled={disabled}
          value={relationSourceId}
          onChange={(event) => setRelationSourceId(event.currentTarget.value)}
        >
          <option value="">请选择起点</option>
          {worldLayerItems.map((item) => (
            <option value={item.layerItemId} key={item.layerItemId}>
              {layerLabel(item.layerItemId)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>终点</span>
        <select
          className="form-input"
          aria-label="关系终点"
          disabled={disabled}
          value={relationTargetId}
          onChange={(event) => setRelationTargetId(event.currentTarget.value)}
        >
          <option value="">请选择终点</option>
          {worldLayerItems.map((item) => (
            <option value={item.layerItemId} key={item.layerItemId}>
              {layerLabel(item.layerItemId)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span>类型</span>
        <select
          className="form-input"
          aria-label="关系类型"
          disabled={disabled}
          value={relationKind}
          onChange={(event) => setRelationKind(event.currentTarget.value as SpatialRelationKind)}
        >
          <option value="line">直线</option>
          <option value="arrow">箭头</option>
          <option value="bidirectional">双向箭头</option>
        </select>
      </label>
      <label className="form-field">
        <span>标签</span>
        <input
          className="form-input"
          aria-label="关系标签"
          disabled={disabled}
          value={relationLabel}
          maxLength={500}
          onChange={(event) => setRelationLabel(event.currentTarget.value)}
        />
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={disabled || !canAddRelation}
        onClick={() => {
          onAddRelation({
            sourceLayerItemId: relationSourceId,
            targetLayerItemId: relationTargetId,
            kind: relationKind,
            ...(relationLabel.trim() ? { label: relationLabel.trim() } : {}),
          })
          setRelationSourceId('')
          setRelationTargetId('')
          setRelationLabel('')
        }}
      >
        <Plus size={14} />添加关系
      </button>
    </>
  )

  if (mode === 'path') {
    return (
      <section className="property-section" aria-label="路径">
        <h3 className="property-title">路径</h3>
        {!selectedPath ? (
          <p className="property-hint" role="status">找不到这条路径，请重新选择。</p>
        ) : (
          <>
            <BufferedTextInput
              ariaLabel={`重命名路径 ${selectedPath.name}`}
              disabled={disabled}
              value={selectedPath.name}
              onCommit={(name) => onRenamePath(selectedPath.id, name)}
            />
            <p className="property-hint">
              {selectedPath.layerItemIds.map(layerLabel).join(' → ') || '未选择图层'}
            </p>
            {onReorderPathWaypoints && selectedPath.layerItemIds.map((layerItemId, index) => (
              <div className="form-field" key={`${selectedPath.id}-${layerItemId}`}>
                <span>{layerLabel(layerItemId)}</span>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={disabled || index === 0}
                  aria-label={`上移路径点 ${layerLabel(layerItemId)}`}
                  onClick={() => {
                    const next = [...selectedPath.layerItemIds]
                    const swap = next[index - 1]!
                    next[index - 1] = layerItemId
                    next[index] = swap
                    onReorderPathWaypoints(selectedPath.id, next)
                  }}
                >
                  上移
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={disabled || index === selectedPath.layerItemIds.length - 1}
                  aria-label={`下移路径点 ${layerLabel(layerItemId)}`}
                  onClick={() => {
                    const next = [...selectedPath.layerItemIds]
                    const swap = next[index + 1]!
                    next[index + 1] = layerItemId
                    next[index] = swap
                    onReorderPathWaypoints(selectedPath.id, next)
                  }}
                >
                  下移
                </button>
              </div>
            ))}
            <PathStyleFields
              path={selectedPath}
              disabled={disabled}
              onUpdatePathStyle={onUpdatePathStyle}
            />
            <button
              type="button"
              className="secondary-button secondary-button--danger"
              disabled={disabled}
              aria-label={`删除路径 ${selectedPath.name}`}
              onClick={() => onDeletePath(selectedPath.id)}
            >
              <Trash2 size={14} />删除路径
            </button>
          </>
        )}
      </section>
    )
  }

  if (mode === 'relation') {
    return (
      <section className="property-section" aria-label="关系">
        <h3 className="property-title">关系</h3>
        {!selectedRelation ? (
          <p className="property-hint" role="status">找不到这条关系连线，请重新选择。</p>
        ) : (
          <>
            <p className="property-hint">
              {layerLabel(selectedRelation.sourceLayerItemId)}
              {' → '}
              {layerLabel(selectedRelation.targetLayerItemId)}
            </p>
            <BufferedTextInput
              ariaLabel={`关系标签 ${layerLabel(selectedRelation.sourceLayerItemId)} → ${layerLabel(selectedRelation.targetLayerItemId)}`}
              disabled={disabled}
              allowEmpty
              value={selectedRelation.label ?? ''}
              onCommit={(label) => onUpdateRelationLabel(selectedRelation.id, label)}
            />
            <select
              className="form-input"
              aria-label={`关系类型 ${layerLabel(selectedRelation.sourceLayerItemId)} → ${layerLabel(selectedRelation.targetLayerItemId)}`}
              disabled={disabled}
              value={selectedRelation.kind}
              onChange={(event) => onUpdateRelationKind(
                selectedRelation.id,
                event.currentTarget.value as SpatialRelationKind,
              )}
            >
              <option value="line">直线</option>
              <option value="arrow">箭头</option>
              <option value="bidirectional">双向箭头</option>
            </select>
            <button
              type="button"
              className="secondary-button secondary-button--danger"
              disabled={disabled}
              aria-label={`删除关系 ${layerLabel(selectedRelation.sourceLayerItemId)} → ${layerLabel(selectedRelation.targetLayerItemId)}`}
              onClick={() => onDeleteRelation(selectedRelation.id)}
            >
              <Trash2 size={14} />删除关系
            </button>
          </>
        )}
      </section>
    )
  }

  return (
    <section className="property-section" aria-label="路径与关系">
      <details className="simple-advanced-properties">
        <summary>路径与关系</summary>
        <p className="property-hint">
          「{surfaceTitle}」的路径和关系会随课程保存。它们不是图层行，也不会进入通用叠放顺序。
        </p>
        {createPathForm}
        {paths.length === 0 ? (
          <p className="property-hint">还没有路径。</p>
        ) : paths.map((path) => (
          <div className="form-field" key={path.id}>
            <p className="property-hint">
              {path.name}
              {' · '}
              {path.layerItemIds.map(layerLabel).join(' → ')}
            </p>
            <button
              type="button"
              className="secondary-button secondary-button--danger"
              disabled={disabled}
              aria-label={`删除路径 ${path.name}`}
              onClick={() => onDeletePath(path.id)}
            >
              <Trash2 size={14} />删除
            </button>
          </div>
        ))}
        {createRelationForm}
        {relations.length === 0 ? (
          <p className="property-hint">还没有关系连线。</p>
        ) : relations.map((relation) => (
          <div className="form-field" key={relation.id}>
            <p className="property-hint">
              {layerLabel(relation.sourceLayerItemId)}
              {' → '}
              {layerLabel(relation.targetLayerItemId)}
            </p>
            <button
              type="button"
              className="secondary-button secondary-button--danger"
              disabled={disabled}
              aria-label={`删除关系 ${layerLabel(relation.sourceLayerItemId)} → ${layerLabel(relation.targetLayerItemId)}`}
              onClick={() => onDeleteRelation(relation.id)}
            >
              <Trash2 size={14} />删除
            </button>
          </div>
        ))}
      </details>
    </section>
  )
}
