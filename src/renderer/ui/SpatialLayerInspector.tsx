import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'

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

interface SpatialLayerInspectorDraft {
  readonly label: string
  readonly x: string
  readonly y: string
  readonly width: string
  readonly height: string
  readonly rotation: string
  readonly opacity: string
}

type SpatialLayerNumberKey = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity'

const SPATIAL_LAYER_NUMBER_KEYS: readonly SpatialLayerNumberKey[] = [
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'opacity',
]

interface SpatialLayerDraftPatch {
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
  readonly opacity: number
}

function numberValue(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function draftFromLayer(layer: SpatialLayerInspectorLayer): SpatialLayerInspectorDraft {
  return {
    label: layer.label,
    x: String(layer.x),
    y: String(layer.y),
    width: String(layer.width),
    height: String(layer.height),
    rotation: String(layer.rotation),
    opacity: String(layer.opacity),
  }
}

function draftSignature(draft: SpatialLayerInspectorDraft): string {
  return JSON.stringify(draft)
}

function patchFromDraft(
  draft: SpatialLayerInspectorDraft,
): SpatialLayerDraftPatch | null {
  const x = numberValue(draft.x)
  const y = numberValue(draft.y)
  const width = numberValue(draft.width)
  const height = numberValue(draft.height)
  const rotation = numberValue(draft.rotation)
  const opacity = numberValue(draft.opacity)

  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    rotation === undefined ||
    opacity === undefined
  ) {
    return null
  }

  return {
    label: draft.label,
    x,
    y,
    width: Math.max(1, width),
    height: Math.max(1, height),
    rotation,
    opacity: Math.min(1, Math.max(0, opacity)),
  }
}

function patchMatchesLayer(
  layer: SpatialLayerInspectorLayer,
  patch: SpatialLayerDraftPatch,
): boolean {
  return patch.label === layer.label &&
    patch.x === layer.x &&
    patch.y === layer.y &&
    patch.width === layer.width &&
    patch.height === layer.height &&
    patch.rotation === layer.rotation &&
    patch.opacity === layer.opacity
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

  return (
    <SpatialLayerInspectorFields
      layer={layer}
      onPatch={onPatch}
      disabled={disabled}
    />
  )
}

function SpatialLayerInspectorFields(props: {
  readonly layer: SpatialLayerInspectorLayer
  readonly onPatch: SpatialLayerInspectorProps['onPatch']
  readonly disabled: boolean
}): React.JSX.Element {
  const { layer, onPatch, disabled } = props
  const [draft, setDraft] = useState<SpatialLayerInspectorDraft>(() => draftFromLayer(layer))
  const lastCommittedDraftRef = useRef<string | null>(null)

  useEffect(() => {
    setDraft(draftFromLayer(layer))
  }, [
    layer.layerItemId,
    layer.label,
    layer.x,
    layer.y,
    layer.width,
    layer.height,
    layer.rotation,
    layer.opacity,
  ])

  const restoreInvalidNumberFields = (): void => {
    setDraft((current) => {
      const next = { ...current }
      for (const key of SPATIAL_LAYER_NUMBER_KEYS) {
        if (numberValue(current[key]) === undefined) {
          next[key] = String(layer[key])
        }
      }
      return next
    })
  }

  const resetDraft = (): void => {
    setDraft(draftFromLayer(layer))
  }

  const commitDraft = (): void => {
    if (disabled) return

    const signature = draftSignature(draft)
    if (lastCommittedDraftRef.current === signature) return

    const patch = patchFromDraft(draft)
    if (patch === null) {
      restoreInvalidNumberFields()
      return
    }
    if (patchMatchesLayer(layer, patch)) return

    onPatch(patch)
    lastCommittedDraftRef.current = signature
  }

  const handleText = (event: ChangeEvent<HTMLInputElement>): void => {
    if (disabled) return
    setDraft((current) => ({ ...current, label: event.target.value }))
  }

  const handleNumber = (key: SpatialLayerNumberKey, value: string): void => {
    if (disabled) return
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const handleCheckbox = (key: 'visible' | 'locked', checked: boolean): void => {
    if (disabled) return
    onPatch({ [key]: checked } as Partial<SpatialLayerInspectorLayer>)
  }

  const handleDraftKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (disabled) return
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      resetDraft()
    }
  }

  const numberField = (
    key: SpatialLayerNumberKey,
    label: string,
    step = 1,
  ) => (
    <label>
      <span>{label}</span>
      <input
        type="number"
        value={draft[key]}
        step={step}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => handleNumber(key, event.target.value)}
        onBlur={() => commitDraft()}
        onKeyDown={handleDraftKeyDown}
      />
    </label>
  )

  return (
    <div className="spatial-layer-inspector" data-testid="spatial-layer-inspector">
      <label>
        <span>名称</span>
        <input
          type="text"
          value={draft.label}
          disabled={disabled}
          aria-label="名称"
          maxLength={120}
          onChange={handleText}
          onBlur={() => commitDraft()}
          onKeyDown={handleDraftKeyDown}
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
        {numberField('x', 'X')}
        {numberField('y', 'Y')}
        {numberField('width', '宽')}
        {numberField('height', '高')}
        {numberField('rotation', '旋转')}
        {numberField('opacity', '不透明度', 0.05)}
      </div>
    </div>
  )
}
