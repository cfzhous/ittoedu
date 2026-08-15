import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  LayerItem,
  SpatialPathDocument,
  SpatialPathStyle,
  SpatialRelationDocument,
  SpatialRelationKind,
} from '../../shared/courseProjectTypes'

export interface SpatialPathEditorProps {
  readonly surfaceTitle: string
  readonly worldLayerItems: readonly LayerItem[]
  readonly paths: readonly SpatialPathDocument[]
  readonly relations: readonly SpatialRelationDocument[]
  readonly disabled?: boolean
  readonly onAddPath: (input: {
    name: string
    layerItemIds: string[]
    style?: SpatialPathStyle
  }) => void
  readonly onRenamePath: (pathId: string, name: string) => void
  readonly onUpdatePathStyle: (pathId: string, style: SpatialPathStyle) => void
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

export function SpatialPathEditor({
  surfaceTitle,
  worldLayerItems,
  paths,
  relations,
  disabled = false,
  onAddPath,
  onRenamePath,
  onUpdatePathStyle,
  onDeletePath,
  onAddRelation,
  onUpdateRelationLabel,
  onUpdateRelationKind,
  onDeleteRelation,
}: SpatialPathEditorProps): React.JSX.Element {
  const [editingPathId, setEditingPathId] = useState<string | null>(null)
  const [pathName, setPathName] = useState('')
  const [pathLayerItemIds, setPathLayerItemIds] = useState<string[]>([])
  const [pathColor, setPathColor] = useState('#3388ff')
  const [pathWidth, setPathWidth] = useState('2')
  const [pathDash, setPathDash] = useState<'solid' | 'dashed' | 'dotted'>('solid')

  const [relationSourceId, setRelationSourceId] = useState('')
  const [relationTargetId, setRelationTargetId] = useState('')
  const [relationKind, setRelationKind] = useState<SpatialRelationKind>('arrow')
  const [relationLabel, setRelationLabel] = useState('')

  const layerLabel = (layerItemId: string): string =>
    worldLayerItems.find((item) => item.layerItemId === layerItemId)?.label || layerItemId

  const parsedPathWidth = Number(pathWidth)
  const canAddPath =
    pathName.trim().length > 0 &&
    pathLayerItemIds.length > 0 &&
    Number.isFinite(parsedPathWidth) &&
    parsedPathWidth > 0

  const canAddRelation =
    relationSourceId.length > 0 &&
    relationTargetId.length > 0 &&
    relationSourceId !== relationTargetId

  const togglePathLayerItem = (layerItemId: string) => {
    setPathLayerItemIds((current) => current.includes(layerItemId)
      ? current.filter((id) => id !== layerItemId)
      : [...current, layerItemId],
    )
  }

  return (
    <section className="property-section spatial-path-editor" aria-label="路径与关系">
      <h3 className="property-title">路径与关系</h3>
      <p className="property-hint">
        「{surfaceTitle}」的路径和关系会随课程保存；请选择已存在的世界图层作为路径点或关系两端。
      </p>

      <div className="property-subsection-header">
        <strong>新建路径</strong>
      </div>
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
      <div className="spatial-path-editor__world-options">
        {worldLayerItems.length === 0 ? (
          <p className="property-hint">当前空间表面还没有可作为路径点的世界图层。</p>
        ) : worldLayerItems.map((item) => (
          <label className="spatial-path-editor__world-option" key={item.layerItemId}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={pathLayerItemIds.includes(item.layerItemId)}
              onChange={() => togglePathLayerItem(item.layerItemId)}
            />
            <span>{layerLabel(item.layerItemId)}</span>
          </label>
        ))}
      </div>
      <div className="spatial-path-editor__style-row">
        <label>
          <span>颜色</span>
          <input
            type="color"
            aria-label="路径颜色"
            disabled={disabled}
            value={pathColor}
            onChange={(event) => setPathColor(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>线宽</span>
          <input
            className="form-input"
            type="number"
            aria-label="路径线宽"
            disabled={disabled}
            min={0.5}
            step={0.5}
            value={pathWidth}
            onChange={(event) => setPathWidth(event.currentTarget.value)}
          />
        </label>
        <label>
          <span>线型</span>
          <select
            className="form-input"
            aria-label="路径线型"
            disabled={disabled}
            value={pathDash}
            onChange={(event) => setPathDash(event.currentTarget.value as 'solid' | 'dashed' | 'dotted')}
          >
            {DASH_OPTIONS.map((dash) => (
              <option value={dash} key={dash}>{dash === 'solid' ? '实线' : dash === 'dashed' ? '虚线' : '点线'}</option>
            ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        className="secondary-button"
        disabled={disabled || !canAddPath}
        onClick={() => {
          onAddPath({
            name: pathName.trim(),
            layerItemIds: pathLayerItemIds,
            style: {
              color: pathColor,
              width: parsedPathWidth,
              dash: pathDash,
            },
          })
          setPathName('')
          setPathLayerItemIds([])
        }}
      >
        <Plus size={14} />添加路径
      </button>

      <div className="property-subsection-header">
        <strong>路径列表</strong>
      </div>
      <div className="spatial-path-editor__paths">
        {paths.length === 0 ? (
          <p className="property-hint">还没有路径。</p>
        ) : paths.map((path) => (
          <div className="spatial-path-editor__path" key={path.id}>
            {editingPathId === path.id ? (
              <BufferedTextInput
                ariaLabel={`重命名路径 ${path.name}`}
                disabled={disabled}
                value={path.name}
                onCommit={(name) => {
                  onRenamePath(path.id, name)
                  setEditingPathId(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="spatial-path-editor__path-name"
                disabled={disabled}
                onClick={() => setEditingPathId(path.id)}
              >
                <span>{path.name}</span>
                <span className="property-hint">
                  {path.layerItemIds.map(layerLabel).join(' → ') || '未选择图层'}
                </span>
              </button>
            )}
            <div className="spatial-path-editor__style-row">
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
                    <option value={dash} key={dash}>{dash === 'solid' ? '实线' : dash === 'dashed' ? '虚线' : '点线'}</option>
                  ))}
                </select>
              </label>
            </div>
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
      </div>

      <div className="property-subsection-header">
        <strong>新建关系</strong>
      </div>
      <div className="spatial-path-editor__relation-form">
        <label>
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
              <option value={item.layerItemId} key={item.layerItemId}>{layerLabel(item.layerItemId)}</option>
            ))}
          </select>
        </label>
        <label>
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
              <option value={item.layerItemId} key={item.layerItemId}>{layerLabel(item.layerItemId)}</option>
            ))}
          </select>
        </label>
        <label>
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
        <label>
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
      </div>

      <div className="property-subsection-header">
        <strong>关系列表</strong>
      </div>
      <div className="spatial-path-editor__relations">
        {relations.length === 0 ? (
          <p className="property-hint">还没有关系连线。</p>
        ) : relations.map((relation) => (
          <div className="spatial-path-editor__relation" key={relation.id}>
            <div className="spatial-path-editor__relation-name">
              {layerLabel(relation.sourceLayerItemId)} → {layerLabel(relation.targetLayerItemId)}
            </div>
            <BufferedTextInput
              ariaLabel={`关系标签 ${layerLabel(relation.sourceLayerItemId)} → ${layerLabel(relation.targetLayerItemId)}`}
              disabled={disabled}
              allowEmpty
              value={relation.label ?? ''}
              onCommit={(label) => onUpdateRelationLabel(relation.id, label)}
            />
            <select
              className="form-input"
              aria-label={`关系类型 ${layerLabel(relation.sourceLayerItemId)} → ${layerLabel(relation.targetLayerItemId)}`}
              disabled={disabled}
              value={relation.kind}
              onChange={(event) => onUpdateRelationKind(relation.id, event.currentTarget.value as SpatialRelationKind)}
            >
              <option value="line">直线</option>
              <option value="arrow">箭头</option>
              <option value="bidirectional">双向箭头</option>
            </select>
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
      </div>
    </section>
  )
}
