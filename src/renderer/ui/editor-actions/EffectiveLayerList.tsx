import {
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Eye, EyeOff, GripVertical, Lock, MoreHorizontal, Trash2, Unlock } from 'lucide-react'
import './editorActions.css'

export type EffectiveLayerSourceKind =
  | 'global'
  | 'surface'
  | 'scene'
  | 'location'
  | 'state'
  | 'flow'
  | 'world'
  | 'camera'

export const EFFECTIVE_LAYER_SOURCE_LABELS: Readonly<Record<EffectiveLayerSourceKind, string>> = {
  global: '全课',
  surface: '当前内容',
  scene: '本页',
  location: '本页',
  state: '当前状态',
  flow: 'Flow',
  world: '世界',
  camera: '镜头',
}

export interface EffectiveLayerItem {
  readonly id: string
  readonly name: string
  readonly sourceKind: EffectiveLayerSourceKind | string
  readonly ownerKey: string
  readonly sourceLabel?: string
  readonly selected?: boolean
  readonly locked?: boolean
  readonly hidden?: boolean
  readonly disabled?: boolean
  readonly reorderDisabledReason?: string
}

export interface EffectiveLayerSelectEvent {
  readonly id: string
  readonly additive: boolean
}

export interface EffectiveLayerReorderEvent {
  readonly fromId: string
  readonly toId: string
  readonly fromOwnerKey: string
  readonly toOwnerKey: string
  readonly placement: 'before' | 'after'
}

export interface EffectiveLayerMenuEvent {
  readonly id: string
  readonly clientX: number
  readonly clientY: number
  readonly trigger: 'pointer' | 'keyboard'
}

export interface EffectiveLayerListProps {
  readonly items: readonly EffectiveLayerItem[]
  readonly onSelect: (event: EffectiveLayerSelectEvent) => void
  readonly onRename: (id: string, name: string) => void
  readonly onReorder: (event: EffectiveLayerReorderEvent) => void
  readonly onToggleVisibility: (id: string) => void
  readonly onToggleLock: (id: string) => void
  readonly onOpenMenu: (event: EffectiveLayerMenuEvent) => void
  readonly onDelete?: (id: string) => void
  readonly deletionMode?: 'delete' | 'hide-in-state'
  readonly label?: string
}

export function layerSourceLabel(
  sourceKind: EffectiveLayerSourceKind | string,
  sourceLabel?: string,
): string {
  if (sourceLabel) return sourceLabel
  return EFFECTIVE_LAYER_SOURCE_LABELS[sourceKind as EffectiveLayerSourceKind] ?? sourceKind
}

function classNames(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

function keyboardMenuPoint(target: EventTarget | null): { x: number; y: number } {
  if (target instanceof HTMLElement) {
    const rect = target.getBoundingClientRect()
    return { x: rect.left, y: rect.bottom }
  }
  return { x: 8, y: 8 }
}

function dropPlacement(event: ReactDragEvent<HTMLElement>): 'before' | 'after' {
  const rect = event.currentTarget.getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

const ROW_LAYOUT_STYLE = {
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'nowrap',
  alignItems: 'center',
  width: '100%',
  minWidth: 0,
  height: 32,
  maxHeight: 32,
  overflow: 'hidden',
  writingMode: 'horizontal-tb',
} as const

const NAME_LAYOUT_STYLE = {
  flex: '1 1 0',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  writingMode: 'horizontal-tb',
} as const

const SOURCE_LAYOUT_STYLE = {
  flex: '0 0 auto',
  maxWidth: '4.75em',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  writingMode: 'horizontal-tb',
} as const

function actionsLayoutStyle(hasDelete: boolean) {
  const width = hasDelete ? 108 : 84
  return {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    flex: `0 0 ${width}px`,
    width,
    minWidth: width,
  } as const
}

export function EffectiveLayerList(props: EffectiveLayerListProps): JSX.Element {
  const {
    items,
    onSelect,
    onRename,
    onReorder,
    onToggleVisibility,
    onToggleLock,
    onOpenMenu,
    onDelete,
    deletionMode = 'delete',
    label = '有效图层',
  } = props

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [focusedId, setFocusedId] = useState<string | null>(items[0]?.id ?? null)
  const draggedIdRef = useRef<string | null>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const focusRow = (id: string) => {
    setFocusedId(id)
    rowRefs.current.get(id)?.focus()
  }

  const beginRename = (item: EffectiveLayerItem) => {
    if (item.disabled || item.locked) return
    setEditingId(item.id)
    setDraftName(item.name)
  }

  const commitRename = (item: EffectiveLayerItem) => {
    const nextName = draftName.trim()
    setEditingId(null)
    if (nextName && nextName !== item.name) onRename(item.id, nextName)
  }

  const emitReorder = (
    fromId: string,
    toId: string,
    placement: EffectiveLayerReorderEvent['placement'],
  ) => {
    if (fromId === toId) return
    const from = items.find((item) => item.id === fromId)
    const to = items.find((item) => item.id === toId)
    if (!from || !to) return
    if (from.disabled || to.disabled) return
    onReorder({
      fromId,
      toId,
      fromOwnerKey: from.ownerKey,
      toOwnerKey: to.ownerKey,
      placement,
    })
  }

  const moveFocus = (fromId: string, delta: number) => {
    const index = items.findIndex((item) => item.id === fromId)
    if (index < 0) return
    const next = items[index + delta]
    if (next) focusRow(next.id)
  }

  const reorderByKeyboard = (fromId: string, delta: -1 | 1) => {
    const index = items.findIndex((item) => item.id === fromId)
    const target = items[index + delta]
    if (!target) return
    emitReorder(fromId, target.id, delta < 0 ? 'before' : 'after')
  }

  if (items.length === 0) {
    return (
      <div
        className="ea-layer-list ea-layer-list--empty"
        role="status"
        data-testid="nodes-tab"
      >
        <div data-testid="effective-layer-list">暂无图层</div>
      </div>
    )
  }

  return (
    <div className="ea-layer-list" data-testid="nodes-tab">
    <div
      role="list"
      aria-label={label}
      data-testid="effective-layer-list"
    >
      {items.map((item) => {
        const source = layerSourceLabel(item.sourceKind, item.sourceLabel)
        const selected = Boolean(item.selected)
        const hidden = Boolean(item.hidden)
        const locked = Boolean(item.locked)
        const disabled = Boolean(item.disabled)
        const reorderBlocked = Boolean(disabled || item.reorderDisabledReason)
        const fullName = `${source} · ${item.name}`
        const editing = editingId === item.id

        return (
          <div
            key={item.id}
            ref={(node) => {
              if (node) rowRefs.current.set(item.id, node)
              else rowRefs.current.delete(item.id)
            }}
            role="listitem"
            style={ROW_LAYOUT_STYLE}
            className={classNames(
              'ea-layer-row',
              selected && 'ea-layer-row--selected',
              locked && 'ea-layer-row--locked',
              hidden && 'ea-layer-row--hidden',
              disabled && 'ea-layer-row--disabled',
            )}
            data-testid={`effective-layer-row-${item.id}`}
            data-layer-id={item.id}
            data-owner-key={item.ownerKey}
            data-source-kind={item.sourceKind}
            aria-selected={selected}
            aria-disabled={disabled}
            tabIndex={focusedId === item.id ? 0 : -1}
            onClick={(event) => {
              if (editing) return
              onSelect({
                id: item.id,
                additive: event.ctrlKey || event.metaKey || event.shiftKey,
              })
            }}
            onContextMenu={(event: ReactMouseEvent<HTMLDivElement>) => {
              event.preventDefault()
              event.stopPropagation()
              if (disabled) return
              onOpenMenu({
                id: item.id,
                clientX: event.clientX,
                clientY: event.clientY,
                trigger: 'pointer',
              })
            }}
            onDragOver={(event: ReactDragEvent<HTMLDivElement>) => {
              if (reorderBlocked || !draggedIdRef.current) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event: ReactDragEvent<HTMLDivElement>) => {
              event.preventDefault()
              if (reorderBlocked) return
              const fromId = event.dataTransfer.getData('text/plain') || draggedIdRef.current
              draggedIdRef.current = null
              if (!fromId) return
              emitReorder(fromId, item.id, dropPlacement(event))
            }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
              if (editing) return
              if ((event.altKey || event.ctrlKey) && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                event.preventDefault()
                if (!reorderBlocked) {
                  reorderByKeyboard(item.id, event.key === 'ArrowUp' ? -1 : 1)
                }
                return
              }
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                moveFocus(item.id, 1)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                moveFocus(item.id, -1)
                return
              }
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect({ id: item.id, additive: event.shiftKey || event.ctrlKey || event.metaKey })
                return
              }
              if (event.key === 'F2') {
                event.preventDefault()
                beginRename(item)
                return
              }
              if (event.key === 'ContextMenu' || event.key === 'Menu' || (event.key === 'F10' && event.shiftKey)) {
                event.preventDefault()
                if (disabled) return
                const point = keyboardMenuPoint(event.currentTarget)
                onOpenMenu({
                  id: item.id,
                  clientX: point.x,
                  clientY: point.y,
                  trigger: 'keyboard',
                })
              }
            }}
          >
            <button
              type="button"
              className="ea-layer-row__handle"
              draggable={!reorderBlocked}
              disabled={reorderBlocked}
              title={item.reorderDisabledReason ?? '拖动调整前后层级'}
              aria-label={`拖动调整“${item.name}”层级`}
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event: ReactDragEvent<HTMLButtonElement>) => {
                if (reorderBlocked) {
                  event.preventDefault()
                  return
                }
                draggedIdRef.current = item.id
                event.dataTransfer.setData('text/plain', item.id)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                draggedIdRef.current = null
              }}
            >
              <GripVertical size={14} aria-hidden="true" />
            </button>
            <span className="ea-layer-row__source" style={SOURCE_LAYOUT_STYLE} title={source}>
              {source}
            </span>
            {editing ? (
              <input
                className="ea-layer-row__name-input"
                style={NAME_LAYOUT_STYLE}
                value={draftName}
                maxLength={80}
                aria-label={`重命名“${item.name}”`}
                autoFocus
                onChange={(event) => setDraftName(event.target.value)}
                onClick={(event) => event.stopPropagation()}
                onBlur={() => commitRename(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    event.currentTarget.blur()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setDraftName(item.name)
                    setEditingId(null)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className="ea-layer-row__name"
                style={NAME_LAYOUT_STYLE}
                title={fullName}
                aria-label={fullName}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect({
                    id: item.id,
                    additive: event.ctrlKey || event.metaKey || event.shiftKey,
                  })
                }}
                onDoubleClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  beginRename(item)
                }}
              >
                {item.name}
              </button>
            )}
            <div className="ea-layer-row__actions" style={actionsLayoutStyle(Boolean(onDelete))}>
              <button
                type="button"
                className="ea-layer-row__action"
                disabled={disabled}
                title={hidden ? '显示图层' : '隐藏图层'}
                aria-label={`${hidden ? '显示' : '隐藏'}“${item.name}”`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (!disabled) onToggleVisibility(item.id)
                }}
              >
                {hidden ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="ea-layer-row__action"
                disabled={disabled}
                title={locked ? '解锁图层' : '锁定图层'}
                aria-label={`${locked ? '解锁' : '锁定'}“${item.name}”`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (!disabled) onToggleLock(item.id)
                }}
              >
                {locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
              </button>
              {onDelete && (() => {
                const hiddenInState = deletionMode === 'hide-in-state' && hidden
                const deleteLabel = deletionMode === 'hide-in-state'
                  ? hiddenInState
                    ? `“${item.name}”已在当前状态隐藏`
                    : `从当前状态隐藏“${item.name}”`
                  : `删除“${item.name}”`
                return (
                  <button
                    type="button"
                    className="ea-layer-row__action"
                    disabled={disabled || hiddenInState}
                    title={deleteLabel}
                    aria-label={deleteLabel}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (!disabled && !hiddenInState) onDelete(item.id)
                    }}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )
              })()}
              <button
                type="button"
                className="ea-layer-row__action"
                disabled={disabled}
                title="更多动作"
                aria-label={`打开“${item.name}”的更多动作`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (disabled) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  onOpenMenu({
                    id: item.id,
                    clientX: rect.left,
                    clientY: rect.bottom,
                    trigger: 'pointer',
                  })
                }}
              >
                <MoreHorizontal size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}
