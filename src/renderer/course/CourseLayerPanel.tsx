import {
  useId,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  Trash2,
  Unlock,
} from 'lucide-react'
import type { LayerItem } from '../../shared/courseProjectTypes'
import {
  LAYER_SCOPE_LABELS,
  layerTeacherLabel,
} from './courseTeacherLabels'

export type CourseLayerSource = keyof typeof LAYER_SCOPE_LABELS

export interface CourseLayerPanelEntry {
  item: LayerItem
  source: CourseLayerSource
}

export interface CourseLayerReorderRequest {
  layerItemId: string
  /** Destination in canonical back-to-front effective-layer order. */
  toIndex: number
  /** Complete effective order after the requested move, back to front. */
  orderedLayerItemIds: string[]
}

export interface CourseLayerPanelProps {
  entries: readonly CourseLayerPanelEntry[]
  selectedIds: readonly string[]
  onSelectionChange(selectedIds: string[]): void
  onToggleVisible(entry: CourseLayerPanelEntry, visible: boolean): void
  onToggleLocked(entry: CourseLayerPanelEntry, locked: boolean): void
  onReorder(request: CourseLayerReorderRequest): void
  onDuplicate(layerItemIds: string[]): void
  onDelete(layerItemIds: string[]): void
  disabled?: boolean
  className?: string
}

function moveEntry<T>(values: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= values.length || to < 0 || to >= values.length) {
    return [...values]
  }
  const next = [...values]
  const [entry] = next.splice(from, 1)
  next.splice(to, 0, entry)
  return next
}

function frontToBack(entries: readonly CourseLayerPanelEntry[]): CourseLayerPanelEntry[] {
  return [...entries].sort((left, right) => (
    right.item.order - left.item.order ||
    left.item.layerItemId.localeCompare(right.item.layerItemId)
  ))
}

function layerOperationIds(
  entryId: string,
  selectedIds: readonly string[],
  visibleEntries: readonly CourseLayerPanelEntry[],
): string[] {
  if (!selectedIds.includes(entryId)) return [entryId]
  const selected = new Set(selectedIds)
  return visibleEntries
    .filter((entry) => selected.has(entry.item.layerItemId))
    .map((entry) => entry.item.layerItemId)
}

function LayerStateButton({
  entry,
  disabled,
  state,
  onToggleVisible,
  onToggleLocked,
}: {
  entry: CourseLayerPanelEntry
  disabled: boolean
  state: 'visible' | 'locked'
  onToggleVisible(entry: CourseLayerPanelEntry, visible: boolean): void
  onToggleLocked(entry: CourseLayerPanelEntry, locked: boolean): void
}) {
  const { item } = entry
  if (state === 'visible') {
    const action = item.visible ? '隐藏' : '显示'
    return (
      <button
        type="button"
        className="course-layer-panel__state"
        disabled={disabled}
        aria-label={`${action}“${item.label}”`}
        aria-pressed={!item.visible}
        title={`${action}图层`}
        onClick={() => onToggleVisible(entry, !item.visible)}
      >
        {item.visible ? <Eye aria-hidden="true" size={14} /> : <EyeOff aria-hidden="true" size={14} />}
        <span>{item.visible ? '可见' : '已隐藏'}</span>
      </button>
    )
  }
  const action = item.locked ? '解锁' : '锁定'
  return (
    <button
      type="button"
      className="course-layer-panel__state"
      disabled={disabled}
      aria-label={`${action}“${item.label}”`}
      aria-pressed={item.locked}
      title={`${action}图层`}
      onClick={() => onToggleLocked(entry, !item.locked)}
    >
      {item.locked ? <Lock aria-hidden="true" size={14} /> : <Unlock aria-hidden="true" size={14} />}
      <span>{item.locked ? '已锁定' : '未锁定'}</span>
    </button>
  )
}

export function CourseLayerPanel({
  entries,
  selectedIds,
  onSelectionChange,
  onToggleVisible,
  onToggleLocked,
  onReorder,
  onDuplicate,
  onDelete,
  disabled = false,
  className,
}: CourseLayerPanelProps) {
  const selectionHelpId = useId()
  const visibleEntries = useMemo(() => frontToBack(entries), [entries])
  const availableIds = useMemo(
    () => new Set(visibleEntries.map((entry) => entry.item.layerItemId)),
    [visibleEntries],
  )
  const effectiveSelectedIds = selectedIds.filter((id) => availableIds.has(id))
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const classes = ['course-layer-panel', className].filter(Boolean).join(' ')

  const emitVisualMove = (layerItemId: string, visualTargetIndex: number) => {
    const visualIds = visibleEntries.map((entry) => entry.item.layerItemId)
    const fromIndex = visualIds.indexOf(layerItemId)
    if (fromIndex < 0 || visualTargetIndex < 0 || visualTargetIndex >= visualIds.length || fromIndex === visualTargetIndex) return
    const nextVisualIds = moveEntry(visualIds, fromIndex, visualTargetIndex)
    const orderedLayerItemIds = [...nextVisualIds].reverse()
    onReorder({
      layerItemId,
      toIndex: orderedLayerItemIds.indexOf(layerItemId),
      orderedLayerItemIds,
    })
  }

  const handleDrop = (event: ReactDragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault()
    const sourceId = draggedId || event.dataTransfer.getData('text/plain')
    setDraggedId(null)
    if (!sourceId || sourceId === targetId) return
    emitVisualMove(sourceId, visibleEntries.findIndex((entry) => entry.item.layerItemId === targetId))
  }

  return (
    <section className={classes} aria-label="图层">
      <header className="course-layer-panel__header">
        <div>
          <h3>图层</h3>
          <p>{effectiveSelectedIds.length > 0 ? `已选择 ${effectiveSelectedIds.length} 个图层` : '从前到后排列'}</p>
        </div>
        <div className="course-layer-panel__batch-actions">
          <button
            type="button"
            disabled={disabled || effectiveSelectedIds.length === 0}
            onClick={() => onDuplicate([...effectiveSelectedIds])}
          >
            <Copy aria-hidden="true" size={14} />
            复制所选
          </button>
          <button
            type="button"
            disabled={disabled || effectiveSelectedIds.length === 0}
            onClick={() => onDelete([...effectiveSelectedIds])}
          >
            <Trash2 aria-hidden="true" size={14} />
            删除所选
          </button>
        </div>
      </header>

      {visibleEntries.length === 0 ? (
        <p className="course-layer-panel__empty">当前内容还没有图层，请从“元素”中添加。</p>
      ) : (
        <>
          <p id={selectionHelpId} className="course-layer-panel__help">
            单击选择图层；按住 Shift 单击可增减多选。可拖动把手排序，也可使用上移、下移按钮。
          </p>
          <ol className="course-layer-panel__list" aria-label="图层（前到后）">
            {visibleEntries.map((entry, visualIndex) => {
              const { item } = entry
              const selected = effectiveSelectedIds.includes(item.layerItemId)
              const operationIds = layerOperationIds(item.layerItemId, effectiveSelectedIds, visibleEntries)
              return (
                <li
                  key={item.layerItemId}
                  className={`course-layer-panel__row${selected ? ' is-selected' : ''}${draggedId === item.layerItemId ? ' is-dragging' : ''}`}
                  aria-label={`图层：${item.label}`}
                  onDragOver={(event) => {
                    if (!disabled) event.preventDefault()
                  }}
                  onDrop={(event) => !disabled && handleDrop(event, item.layerItemId)}
                >
                  <button
                    type="button"
                    className="course-layer-panel__drag"
                    draggable={!disabled}
                    disabled={disabled}
                    aria-label={`调整“${item.label}”层级`}
                    title="拖动调整层级"
                    onDragStart={(event) => {
                      setDraggedId(item.layerItemId)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', item.layerItemId)
                    }}
                    onDragEnd={() => setDraggedId(null)}
                  >
                    <GripVertical aria-hidden="true" size={15} />
                  </button>
                  <button
                    type="button"
                    className="course-layer-panel__select"
                    disabled={disabled}
                    aria-pressed={selected}
                    aria-describedby={selectionHelpId}
                    aria-label={`选择图层“${item.label}”`}
                    onClick={(event) => {
                      if (!event.shiftKey) {
                        onSelectionChange([item.layerItemId])
                        return
                      }
                      onSelectionChange(selected
                        ? effectiveSelectedIds.filter((id) => id !== item.layerItemId)
                        : [...effectiveSelectedIds, item.layerItemId])
                    }}
                  >
                    <strong>{item.label}</strong>
                    <small>{layerTeacherLabel(item)} · {LAYER_SCOPE_LABELS[entry.source]}</small>
                  </button>
                  <LayerStateButton
                    entry={entry}
                    disabled={disabled}
                    state="visible"
                    onToggleVisible={onToggleVisible}
                    onToggleLocked={onToggleLocked}
                  />
                  <LayerStateButton
                    entry={entry}
                    disabled={disabled}
                    state="locked"
                    onToggleVisible={onToggleVisible}
                    onToggleLocked={onToggleLocked}
                  />
                  <button
                    type="button"
                    disabled={disabled || visualIndex === 0}
                    aria-label={`上移“${item.label}”一层`}
                    title="上移一层"
                    onClick={() => emitVisualMove(item.layerItemId, visualIndex - 1)}
                  >
                    <ArrowUp aria-hidden="true" size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={disabled || visualIndex === visibleEntries.length - 1}
                    aria-label={`下移“${item.label}”一层`}
                    title="下移一层"
                    onClick={() => emitVisualMove(item.layerItemId, visualIndex + 1)}
                  >
                    <ArrowDown aria-hidden="true" size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`复制“${item.label}”`}
                    onClick={() => onDuplicate(operationIds)}
                  >
                    <Copy aria-hidden="true" size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`删除“${item.label}”`}
                    onClick={() => onDelete(operationIds)}
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </section>
  )
}
