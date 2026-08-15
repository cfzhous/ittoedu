import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  LayerItem,
  SpatialCameraFrame,
  SpatialCameraPose,
  SpatialSemanticZoomRule,
} from '../../shared/courseProjectTypes'

export interface SpatialCameraPanelProps {
  surfaceTitle: string
  frames: readonly SpatialCameraFrame[]
  home: SpatialCameraPose
  sessionCamera: SpatialCameraPose | null
  activeCameraFrameId: string | null
  worldLayerItems: readonly LayerItem[]
  semanticZoomRules: readonly SpatialSemanticZoomRule[]
  disabled?: boolean
  onAddFrame(): void
  onRenameFrame(frameId: string, name: string): void
  onReorderFrame(frameId: string, toIndex: number): void
  onDeleteFrame(frameId: string): void
  onSetHome(): void
  onActivateFrame(frameId: string): void
  onAddSemanticZoomRule(rule: {
    layerItemIds: string[]
    minZoom: number
    maxZoom: number
    visible: boolean
  }): void
  onUpdateSemanticZoomRule(
    ruleId: string,
    patch: Partial<Omit<SpatialSemanticZoomRule, 'id'>>,
  ): void
  onDeleteSemanticZoomRule(ruleId: string): void
}

function BufferedTextInput({
  value,
  ariaLabel,
  disabled,
  onCommit,
}: {
  value: string
  ariaLabel: string
  disabled?: boolean
  onCommit(value: string): void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const commit = () => {
    const next = draft.trim()
    if (!next || next === value) {
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

function BufferedNumberInput({
  value,
  ariaLabel,
  disabled,
  onCommit,
}: {
  value: number
  ariaLabel: string
  disabled?: boolean
  onCommit(value: number): void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])

  const commit = () => {
    const next = Number(draft)
    if (!Number.isFinite(next) || next === value) {
      setDraft(String(value))
      return
    }
    onCommit(next)
  }

  return (
    <input
      className="form-input"
      type="number"
      aria-label={ariaLabel}
      disabled={disabled}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(String(value))
          event.currentTarget.blur()
        }
      }}
    />
  )
}

export function SpatialCameraPanel({
  surfaceTitle,
  frames,
  home,
  sessionCamera,
  activeCameraFrameId,
  worldLayerItems,
  semanticZoomRules,
  disabled = false,
  onAddFrame,
  onRenameFrame,
  onReorderFrame,
  onDeleteFrame,
  onSetHome,
  onActivateFrame,
  onAddSemanticZoomRule,
  onUpdateSemanticZoomRule,
  onDeleteSemanticZoomRule,
}: SpatialCameraPanelProps) {
  const [editingFrameId, setEditingFrameId] = useState<string | null>(null)
  const [ruleLayerItemIds, setRuleLayerItemIds] = useState<string[]>([])
  const [ruleMinZoom, setRuleMinZoom] = useState('0')
  const [ruleMaxZoom, setRuleMaxZoom] = useState('1')
  const [ruleVisible, setRuleVisible] = useState(true)

  const layerLabel = (layerItemId: string): string => {
    const item = worldLayerItems.find((candidate) => candidate.layerItemId === layerItemId)
    return item?.label || layerItemId
  }

  const parsedRuleMinZoom = Number(ruleMinZoom)
  const parsedRuleMaxZoom = Number(ruleMaxZoom)
  const canAddRule =
    ruleLayerItemIds.length > 0 &&
    Number.isFinite(parsedRuleMinZoom) &&
    Number.isFinite(parsedRuleMaxZoom) &&
    parsedRuleMinZoom >= 0 &&
    parsedRuleMaxZoom > 0 &&
    parsedRuleMinZoom < parsedRuleMaxZoom

  const toggleRuleLayerItem = (layerItemId: string) => {
    setRuleLayerItemIds((current) => current.includes(layerItemId)
      ? current.filter((id) => id !== layerItemId)
      : [...current, layerItemId],
    )
  }

  return (
    <section className="property-section spatial-camera-panel" aria-label="镜头与语义缩放">
      <h3 className="property-title">镜头画面</h3>
      <p className="property-hint">
        「{surfaceTitle}」的工程镜头会随课程保存；画面平移和缩放只在本次编辑中生效，不会写入课程。
      </p>

      <div className="property-subsection-header">
        <strong>镜头列表</strong>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || !sessionCamera}
          onClick={onAddFrame}
        >
          <Plus size={14} />从当前画面添加
        </button>
      </div>

      <div className="spatial-camera-panel__frames">
        {frames.map((frame, index) => (
          <div
            className={`spatial-camera-panel__frame${activeCameraFrameId === frame.id ? ' spatial-camera-panel__frame--active' : ''}`}
            key={frame.id}
          >
            {editingFrameId === frame.id ? (
              <BufferedTextInput
                ariaLabel={`重命名镜头 ${frame.name}`}
                disabled={disabled}
                value={frame.name}
                onCommit={(name) => {
                  onRenameFrame(frame.id, name)
                  setEditingFrameId(null)
                }}
              />
            ) : (
              <button
                type="button"
                className="spatial-camera-panel__frame-name"
                disabled={disabled}
                onClick={() => onActivateFrame(frame.id)}
              >
                <span>{frame.name}</span>
                <span className="spatial-camera-panel__frame-pose">
                  x {Math.round(frame.x)} y {Math.round(frame.y)} · {Math.round(frame.zoom * 100)}%
                </span>
              </button>
            )}
            <div className="spatial-camera-panel__frame-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={disabled}
                aria-label={`重命名镜头 ${frame.name}`}
                onClick={() => setEditingFrameId(frame.id)}
              >
                重命名
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={disabled || index === 0}
                aria-label={`上移镜头 ${frame.name}`}
                onClick={() => onReorderFrame(frame.id, index - 1)}
              >
                上移
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={disabled || index === frames.length - 1}
                aria-label={`下移镜头 ${frame.name}`}
                onClick={() => onReorderFrame(frame.id, index + 1)}
              >
                下移
              </button>
              <button
                type="button"
                className="secondary-button secondary-button--danger"
                disabled={disabled || frames.length <= 1}
                aria-label={`删除镜头 ${frame.name}`}
                onClick={() => onDeleteFrame(frame.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="property-subsection-header">
        <strong>首页镜头</strong>
        <button
          type="button"
          className="secondary-button"
          disabled={disabled || !sessionCamera}
          onClick={onSetHome}
        >
          设为首页镜头
        </button>
      </div>
      <p className="property-hint">
        首页镜头：x {Math.round(home.x)} y {Math.round(home.y)} · {Math.round(home.zoom * 100)}%。点击「设为首页镜头」会把当前画面保存为首页镜头。
      </p>

      <h3 className="property-title">语义缩放</h3>
      <p className="property-hint">
        按镜头缩放范围决定世界图层是否可见；保存、试运行与导出共用同一规则。
      </p>

      <div className="property-subsection-header">
        <strong>世界图层</strong>
      </div>
      <div className="spatial-camera-panel__world-options">
        {worldLayerItems.length === 0 ? (
          <p className="property-hint">当前空间表面还没有可参与语义缩放的世界图层。</p>
        ) : worldLayerItems.map((item) => (
          <label className="spatial-camera-panel__world-option" key={item.layerItemId}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={ruleLayerItemIds.includes(item.layerItemId)}
              onChange={() => toggleRuleLayerItem(item.layerItemId)}
            />
            <span>{layerLabel(item.layerItemId)}</span>
          </label>
        ))}
      </div>

      <div className="form-field">
        <label htmlFor="spatial-camera-rule-min-zoom">最小缩放</label>
        <input
          id="spatial-camera-rule-min-zoom"
          className="form-input"
          type="number"
          aria-label="最小缩放"
          disabled={disabled}
          value={ruleMinZoom}
          onChange={(event) => setRuleMinZoom(event.currentTarget.value)}
        />
      </div>
      <div className="form-field">
        <label htmlFor="spatial-camera-rule-max-zoom">最大缩放</label>
        <input
          id="spatial-camera-rule-max-zoom"
          className="form-input"
          type="number"
          aria-label="最大缩放"
          disabled={disabled}
          value={ruleMaxZoom}
          onChange={(event) => setRuleMaxZoom(event.currentTarget.value)}
        />
      </div>
      <label className="spatial-camera-panel__check">
        <input
          type="checkbox"
          disabled={disabled}
          checked={ruleVisible}
          onChange={(event) => setRuleVisible(event.target.checked)}
        />
        范围内可见
      </label>
      <button
        type="button"
        className="secondary-button"
        disabled={disabled || !canAddRule}
        onClick={() => {
          onAddSemanticZoomRule({
            layerItemIds: ruleLayerItemIds,
            minZoom: parsedRuleMinZoom,
            maxZoom: parsedRuleMaxZoom,
            visible: ruleVisible,
          })
          setRuleLayerItemIds([])
        }}
      >
        <Plus size={14} />添加语义缩放规则
      </button>

      <div className="spatial-camera-panel__rules">
        {semanticZoomRules.map((rule) => (
          <div className="spatial-camera-panel__rule" key={rule.id}>
            <div className="spatial-camera-panel__rule-layers">
              {rule.layerItemIds.map((layerItemId) => layerLabel(layerItemId)).join('、') || '未选择图层'}
            </div>
            <div className="spatial-camera-panel__rule-range">
              <BufferedNumberInput
                ariaLabel={`规则最小缩放 ${rule.id}`}
                disabled={disabled}
                value={rule.minZoom}
                onCommit={(minZoom) => onUpdateSemanticZoomRule(rule.id, { minZoom })}
              />
              <span>≤ zoom &lt;</span>
              <BufferedNumberInput
                ariaLabel={`规则最大缩放 ${rule.id}`}
                disabled={disabled}
                value={rule.maxZoom}
                onCommit={(maxZoom) => onUpdateSemanticZoomRule(rule.id, { maxZoom })}
              />
            </div>
            <label className="spatial-camera-panel__check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={rule.visible}
                onChange={(event) => onUpdateSemanticZoomRule(rule.id, { visible: event.target.checked })}
              />
              范围内可见
            </label>
            <button
              type="button"
              className="secondary-button secondary-button--danger"
              disabled={disabled}
              onClick={() => onDeleteSemanticZoomRule(rule.id)}
            >
              <Trash2 size={14} />删除规则
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
