import type { ChangeEvent } from 'react'

export interface SpatialLayerInspectorLayer {
  readonly layerItemId: string
  readonly label: string
  readonly visible: boolean
  readonly locked: boolean
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
  readonly opacity: number
}

export interface SpatialLayerInspectorProps {
  readonly layer: SpatialLayerInspectorLayer | null
  readonly onPatch: (patch: Partial<SpatialLayerInspectorLayer>) => void
  readonly disabled?: boolean
}

function numberValue(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function SpatialLayerInspector(props: SpatialLayerInspectorProps): React.JSX.Element {
  const { layer, onPatch, disabled = false } = props

  if (!layer) {
    return (
      <div className="spatial-layer-inspector spatial-layer-inspector--empty" data-testid="spatial-layer-inspector">
        <p>请先选择一个空间图层。</p>
      </div>
    )
  }

  const handleText = (event: ChangeEvent<HTMLInputElement>): void => {
    if (disabled) return
    onPatch({ label: event.target.value })
  }

  const handleNumber = (
    key: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity',
    value: string,
  ): void => {
    if (disabled) return
    const parsed = numberValue(value)
    if (parsed === undefined) return
    if (key === 'opacity') {
      onPatch({ opacity: Math.min(1, Math.max(0, parsed)) })
    } else if (key === 'width' || key === 'height') {
      onPatch({ [key]: Math.max(1, parsed) } as Partial<SpatialLayerInspectorLayer>)
    } else {
      onPatch({ [key]: parsed } as Partial<SpatialLayerInspectorLayer>)
    }
  }

  const handleCheckbox = (key: 'visible' | 'locked', checked: boolean): void => {
    if (disabled) return
    onPatch({ [key]: checked } as Partial<SpatialLayerInspectorLayer>)
  }

  const numberField = (
    key: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity',
    label: string,
    value: number,
    step = 1,
  ) => (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => handleNumber(key, event.target.value)}
      />
    </label>
  )

  return (
    <div className="spatial-layer-inspector" data-testid="spatial-layer-inspector">
      <label>
        <span>名称</span>
        <input
          type="text"
          value={layer.label}
          disabled={disabled}
          aria-label="名称"
          maxLength={120}
          onChange={handleText}
        />
      </label>
      <div className="spatial-layer-inspector__flags">
        <label>
          <input
            type="checkbox"
            checked={layer.visible}
            disabled={disabled}
            onChange={(event) => handleCheckbox('visible', event.target.checked)}
          />
          <span>可见</span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={layer.locked}
            disabled={disabled}
            onChange={(event) => handleCheckbox('locked', event.target.checked)}
          />
          <span>锁定</span>
        </label>
      </div>
      <div className="spatial-layer-inspector__numbers">
        {numberField('x', 'X', layer.x)}
        {numberField('y', 'Y', layer.y)}
        {numberField('width', '宽', layer.width)}
        {numberField('height', '高', layer.height)}
        {numberField('rotation', '旋转', layer.rotation)}
        {numberField('opacity', '不透明度', layer.opacity, 0.05)}
      </div>
    </div>
  )
}
