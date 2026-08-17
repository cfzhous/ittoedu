import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { compareStableStrings } from '../../shared/stableOrder'
import { serializeFormulaAst } from '../../shared/formulaLinear'
import type { FormulaAstNode } from '../../shared/projectTypes'
import type {
  FlowBlockView,
  FlowEditorLayerTarget,
  FlowEditorLayerView,
  FlowEditorView,
} from '../course/flowEditorView'
import type { WorkspaceControllerLocateRequest } from './workspaceSlideAuthoring'
// C2: reuse the existing structural command protocol instead of inventing a new one.
import type { FlowStructuralCommand } from './FlowPropertiesTab'

export type FlowBlockMoveDirection = 'up' | 'down' | 'left' | 'right'

export interface FlowStructuralActionProps {
  readonly onDeleteBlock?: (blockId: string) => void
  readonly onDuplicateBlock?: (blockId: string) => void
  readonly onMoveBlock?: (blockId: string, direction: FlowBlockMoveDirection) => void
}

/** One complete frame produced by a Flow controller pointer gesture. */
export interface FlowWorkspaceLayerTransform extends FlowEditorLayerTarget {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
}

export interface FlowWorkspaceProps extends FlowStructuralActionProps {
  readonly view: FlowEditorView
  readonly selectedBlockId?: string | null
  readonly onSelectBlock?: (blockId: string) => void
  readonly layers?: readonly FlowEditorLayerView[]
  readonly selectedLayerTarget?: FlowEditorLayerTarget | null
  readonly controllerLocateRequest?: WorkspaceControllerLocateRequest | null
  readonly onSelectLayer?: (target: FlowEditorLayerTarget) => void
  readonly onTransformLayer?: (transform: FlowWorkspaceLayerTransform) => void
  readonly onPatchBlock?: (blockId: string, patch: FlowInlineTextPatch) => void
  /** C2: narrow structural command for list item text edits; reuses FlowPropertiesTab protocol. */
  readonly onStructuralCommand?: (command: FlowStructuralCommand) => void
  /** Teacher-safe reason that makes in-place text editing unavailable. */
  readonly editingUnavailableReason?: string
  readonly readOnly?: boolean
}

/** C1 narrow text patch for in-place heading/paragraph/quote editing. */
export interface FlowInlineTextPatch {
  readonly type?: 'heading' | 'paragraph' | 'quote'
  readonly text?: string
}

/**
 * Single in-place editing target. Kept only inside the FlowWorkspace
 * component; never written to Store, project or persistence.
 */
interface FlowInlineEditState {
  readonly blockId: string
  readonly field: 'text'
  /** Stable list item id when editing a list item; absent for block text. */
  readonly itemId?: string
  readonly original: string
  readonly draft: string
  readonly composing: boolean
}

/** Editing controller shared by every FlowListItem for the single target. */
interface FlowInlineEditingController {
  readonly state: FlowInlineEditState | null
  readonly unavailableReason?: string
  readonly begin: (blockId: string, itemId?: string) => boolean
  readonly commit: () => void
  readonly cancel: () => void
  readonly changeDraft: (draft: string) => void
  readonly changeComposing: (composing: boolean) => void
}

function sortFlowLayerViews(
  layers: readonly FlowEditorLayerView[],
): FlowEditorLayerView[] {
  return [...layers].sort((left, right) =>
    left.item.order - right.item.order ||
    compareStableStrings(left.selectionId, right.selectionId),
  )
}

function flowLayerKey(layer: Pick<FlowEditorLayerView, 'source' | 'selectionId'>): string {
  return `${layer.source}:${layer.selectionId}`
}

function flowLayerTarget(layer: FlowEditorLayerView): FlowEditorLayerTarget {
  return {
    source: layer.source,
    layerItemId: layer.selectionId,
  }
}

function sameFlowLayerTarget(
  left: FlowEditorLayerTarget | null | undefined,
  right: FlowEditorLayerTarget,
): boolean {
  return left?.source === right.source && left.layerItemId === right.layerItemId
}

function isGlobalTeacherController(layer: FlowEditorLayerView): boolean {
  return layer.source === 'global' &&
    layer.item.kind === 'native' &&
    layer.item.content.nativeType === 'teacher-controller'
}

function flowLayerCardStyle(
  layer: FlowEditorLayerView,
  preview?: { x: number; y: number },
): CSSProperties {
  return {
    position: 'absolute',
    left: preview?.x ?? layer.item.frame.x,
    top: preview?.y ?? layer.item.frame.y,
    width: layer.item.frame.width,
    height: layer.item.frame.height,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  }
}

interface FlowLayerDragState {
  readonly pointerId: number
  readonly key: string
  readonly target: FlowEditorLayerTarget
  readonly frame: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly rotation: number
  }
  readonly startClientX: number
  readonly startClientY: number
  moved: boolean
}

function FlowAuthoringLayerOverlay({
  layers,
  selectedLayerTarget,
  controllerLocateRequest,
  onSelectLayer,
  onTransformLayer,
  readOnly,
}: {
  layers: readonly FlowEditorLayerView[]
  selectedLayerTarget: FlowEditorLayerTarget | null | undefined
  controllerLocateRequest?: WorkspaceControllerLocateRequest | null
  onSelectLayer?: (target: FlowEditorLayerTarget) => void
  onTransformLayer?: (transform: FlowWorkspaceLayerTransform) => void
  readOnly: boolean
}) {
  const sortedLayers = sortFlowLayerViews(layers).filter((layer) => layer.effectiveVisible)
  const dragRef = useRef<FlowLayerDragState | null>(null)
  const suppressedClickKeyRef = useRef<string | null>(null)
  const controllerCardsRef = useRef(new Map<string, HTMLButtonElement>())
  const lastControllerLocateRequestRef = useRef<number | null>(null)
  const [dragPreview, setDragPreview] = useState<{
    readonly key: string
    readonly x: number
    readonly y: number
  } | null>(null)

  // The right sidebar locates the existing visible controller card. Keeping
  // this in the workspace avoids creating a duplicate global-layer proxy.
  useEffect(() => {
    if (
      !controllerLocateRequest ||
      lastControllerLocateRequestRef.current === controllerLocateRequest.requestId
    ) return
    const card = controllerCardsRef.current.get(
      controllerLocateRequest.layerItemId,
    )
    if (!card) return
    lastControllerLocateRequestRef.current = controllerLocateRequest.requestId
    if (typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    card.focus({ preventScroll: true })
  }, [controllerLocateRequest, sortedLayers])

  const clearDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return null
    dragRef.current = null
    setDragPreview(null)
    if (
      typeof event.currentTarget.hasPointerCapture === 'function' &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    return drag
  }

  if (sortedLayers.length === 0) return null
  return (
    <div
      className="flow-authoring-layer-overlay"
      data-testid="flow-authoring-layer-overlay"
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    >
      {sortedLayers.map((layer) => {
        const target = flowLayerTarget(layer)
        const key = flowLayerKey(layer)
        const layerLabel = layer.item.label || (
          layer.source === 'global' ? '全局图层' : '讲义图层'
        )
        const sourceLabel = layer.source === 'global' ? '全局' : '讲义'
        const selected = sameFlowLayerTarget(selectedLayerTarget, target)
        const clickable = Boolean(onSelectLayer)
        const draggable = !readOnly &&
          !layer.item.locked &&
          isGlobalTeacherController(layer) &&
          Boolean(onSelectLayer && onTransformLayer)
        const preview = dragPreview?.key === key
          ? { x: dragPreview.x, y: dragPreview.y }
          : undefined
        const stateLabel = [
          layer.item.visible ? '显示' : '隐藏',
          layer.item.locked ? '锁定' : '未锁定',
        ].join(' · ')
        const ariaLabel = `${layerLabel}（${sourceLabel} · ${stateLabel}）`
        return (
          <button
            key={key}
            type="button"
            className={`flow-layer-card${selected ? ' flow-layer-card--selected' : ''}`}
            data-layer-item-id={layer.selectionId}
            data-layer-source={layer.source}
            data-layer-visible={layer.item.visible}
            data-layer-locked={layer.item.locked}
            data-layer-scoped-visible={layer.scopedVisible}
            data-layer-effective-visible={layer.effectiveVisible}
            data-layer-draggable={draggable}
            data-testid={`flow-layer-card-${layer.source}-${layer.selectionId}`}
            ref={isGlobalTeacherController(layer)
              ? (element) => {
                  if (element) controllerCardsRef.current.set(layer.selectionId, element)
                  else controllerCardsRef.current.delete(layer.selectionId)
                }
              : undefined}
            aria-label={ariaLabel}
            style={{
              ...flowLayerCardStyle(layer, preview),
              pointerEvents: clickable ? 'auto' : 'none',
            }}
            onPointerDown={draggable
              ? (event) => {
                  if (event.button !== 0) return
                  event.stopPropagation()
                  event.preventDefault()
                  onSelectLayer?.(target)
                  suppressedClickKeyRef.current = key
                  dragRef.current = {
                    pointerId: event.pointerId,
                    key,
                    target,
                    frame: {
                      x: layer.item.frame.x,
                      y: layer.item.frame.y,
                      width: layer.item.frame.width,
                      height: layer.item.frame.height,
                      rotation: layer.item.rotation,
                    },
                    startClientX: event.clientX,
                    startClientY: event.clientY,
                    moved: false,
                  }
                  setDragPreview({
                    key,
                    x: layer.item.frame.x,
                    y: layer.item.frame.y,
                  })
                  if (typeof event.currentTarget.setPointerCapture === 'function') {
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }
                }
              : undefined}
            onPointerMove={draggable
              ? (event) => {
                  const drag = dragRef.current
                  if (drag === null || drag.pointerId !== event.pointerId) return
                  const x = drag.frame.x + event.clientX - drag.startClientX
                  const y = drag.frame.y + event.clientY - drag.startClientY
                  drag.moved = drag.moved || x !== drag.frame.x || y !== drag.frame.y
                  setDragPreview({ key: drag.key, x, y })
                  event.preventDefault()
                }
              : undefined}
            onPointerUp={draggable
              ? (event) => {
                  const drag = clearDrag(event)
                  if (drag === null || !drag.moved) return
                  const x = drag.frame.x + event.clientX - drag.startClientX
                  const y = drag.frame.y + event.clientY - drag.startClientY
                  onTransformLayer?.({
                    ...drag.target,
                    x,
                    y,
                    width: drag.frame.width,
                    height: drag.frame.height,
                    rotation: drag.frame.rotation,
                  })
                }
              : undefined}
            onPointerCancel={draggable
              ? (event) => { clearDrag(event) }
              : undefined}
            onClick={clickable
              ? (event) => {
                  event.stopPropagation()
                  if (suppressedClickKeyRef.current === key) {
                    suppressedClickKeyRef.current = null
                    return
                  }
                  onSelectLayer?.(target)
                }
              : undefined}
          >
            <span className="flow-layer-card__label">{layerLabel}</span>
            <span className="flow-layer-card__source">{sourceLabel}</span>
            <span className="flow-layer-card__state">
              {layer.item.visible ? '显示' : '隐藏'} · {layer.item.locked ? '锁定' : '未锁定'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function flowBlockFrameProps(
  blockView: FlowBlockView,
  selected: boolean,
  readOnly: boolean,
  onSelectBlock?: (blockId: string) => void,
  onDoubleClick?: (event: MouseEvent<HTMLElement>) => void,
): {
    'data-flow-block-id': string
    'data-flow-parent-id': string
    className: string
    'aria-selected': boolean
    onClick?: (event: MouseEvent<HTMLElement>) => void
    onDoubleClick?: (event: MouseEvent<HTMLElement>) => void
  } {
  return {
    'data-flow-block-id': blockView.blockId,
    'data-flow-parent-id': blockView.parentId ?? '',
    className: `flow-block flow-block-${blockView.block.type}${selected ? ' flow-block--selected' : ''}`,
    'aria-selected': selected,
    ...(readOnly || !onSelectBlock ? {} : {
      onClick: (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        onSelectBlock(blockView.blockId)
      },
    }),
    ...(onDoubleClick ? { onDoubleClick } : {}),
  }
}

function FlowInlineTextEditor({
  blockView,
  inlineEditing,
}: {
  blockView: FlowBlockView
  inlineEditing?: FlowInlineEditingController
}): ReactNode {
  const state = inlineEditing?.state
  if (!state) return null
  const block = blockView.block
  const label = block.type === 'heading'
    ? '编辑标题文本'
    : block.type === 'quote'
      ? '编辑引用文本'
      : block.type === 'list'
        ? '编辑列表项文本'
        : '编辑段落文本'
  return (
    <textarea
      className="flow-inline-editor"
      data-flow-inline-editor="true"
      data-flow-inline-field={state.field}
      data-flow-block-id={blockView.blockId}
      data-flow-parent-id={blockView.parentId ?? ''}
      data-flow-list-item-id={state.itemId}
      aria-label={label}
      value={state.draft}
      rows={block.type === 'heading' || block.type === 'list' ? 1 : 3}
      autoFocus
      onKeyDown={(event) => {
        // React 合成 KeyboardEvent 类型不含 isComposing，读原生事件标志。
        if (event.nativeEvent.isComposing || state.composing) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          inlineEditing?.cancel()
          return
        }
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          inlineEditing?.commit()
        }
      }}
      onChange={(event) => inlineEditing?.changeDraft(event.currentTarget.value)}
      onCompositionStart={() => inlineEditing?.changeComposing(true)}
      onCompositionEnd={() => inlineEditing?.changeComposing(false)}
      onBlur={() => inlineEditing?.commit()}
    />
  )
}

function FlowBlockActionToolbar({
  blockId,
  readOnly,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
}: {
  blockId: string
  readOnly: boolean
  onDeleteBlock?: (blockId: string) => void
  onDuplicateBlock?: (blockId: string) => void
  onMoveBlock?: (blockId: string, direction: FlowBlockMoveDirection) => void
}) {
  if (!onDeleteBlock && !onDuplicateBlock && !onMoveBlock) return null
  return (
    <div
      className="flow-block-toolbar"
      role="toolbar"
      aria-label="内容块操作"
      data-testid="flow-workspace-block-toolbar"
      style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '6px 0' }}
    >
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-delete"
        aria-label="删除"
        disabled={readOnly || !onDeleteBlock}
        onClick={() => onDeleteBlock?.(blockId)}
      >
        删除
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-duplicate"
        aria-label="复制"
        disabled={readOnly || !onDuplicateBlock}
        onClick={() => onDuplicateBlock?.(blockId)}
      >
        复制
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-move-up"
        aria-label="上移"
        disabled={readOnly || !onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'up')}
      >
        上移
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-move-down"
        aria-label="下移"
        disabled={readOnly || !onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'down')}
      >
        下移
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-promote"
        aria-label="提升层级"
        disabled={readOnly || !onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'left')}
      >
        提升层级
      </button>
      <button
        type="button"
        className="secondary-button"
        data-testid="flow-workspace-block-demote"
        aria-label="降低层级"
        disabled={readOnly || !onMoveBlock}
        onClick={() => onMoveBlock?.(blockId, 'right')}
      >
        降低层级
      </button>
    </div>
  )
}

function FlowListItem({
  blockView,
  childrenByParent,
  selectedBlockId,
  readOnly,
  onSelectBlock,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
  inlineEditing,
}: {
  blockView: FlowBlockView
  childrenByParent: Map<string | null, FlowBlockView[]>
  selectedBlockId: string | null | undefined
  readOnly: boolean
  onSelectBlock?: (blockId: string) => void
  onDeleteBlock?: (blockId: string) => void
  onDuplicateBlock?: (blockId: string) => void
  onMoveBlock?: (blockId: string, direction: FlowBlockMoveDirection) => void
  inlineEditing?: FlowInlineEditingController
}): ReactNode {
  const block = blockView.block
  const selected = blockView.blockId === selectedBlockId
  const editingHere = inlineEditing?.state != null &&
    inlineEditing.state.blockId === blockView.blockId &&
    inlineEditing.state.field === 'text' &&
    inlineEditing.state.itemId === undefined
  if (editingHere) {
    return <FlowInlineTextEditor blockView={blockView} inlineEditing={inlineEditing} />
  }
  const blockDoubleClickEditable = (
    block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote'
  ) && !readOnly && !inlineEditing?.unavailableReason
  const listItemEditable = (
    block.type === 'list' && !readOnly && !inlineEditing?.unavailableReason
  )
  const props = flowBlockFrameProps(
    blockView,
    selected,
    readOnly,
    onSelectBlock,
    blockDoubleClickEditable
      ? (event) => {
          event.stopPropagation()
          inlineEditing?.begin(blockView.blockId)
        }
      : undefined,
  )

  let rendered: ReactNode
  switch (block.type) {
    case 'heading':
      switch (block.level) {
        case 1: rendered = <h1 {...props}>{block.text}</h1>; break
        case 2: rendered = <h2 {...props}>{block.text}</h2>; break
        case 3: rendered = <h3 {...props}>{block.text}</h3>; break
        case 4: rendered = <h4 {...props}>{block.text}</h4>; break
        case 5: rendered = <h5 {...props}>{block.text}</h5>; break
        case 6: rendered = <h6 {...props}>{block.text}</h6>; break
        default: rendered = null
      }
      break
    case 'paragraph':
      rendered = <p {...props}>{block.text}</p>
      break
    case 'quote':
      rendered = (
        <blockquote {...props}>
          <p>{block.text}</p>
          {block.citation ? <cite>{block.citation}</cite> : null}
        </blockquote>
      )
      break
    case 'list': {
      const items = block.items.map((item) => {
        const editingThisItem = inlineEditing?.state?.blockId === blockView.blockId &&
          inlineEditing.state.itemId === item.id
        return editingThisItem
          ? (
              <li key={item.id} data-flow-list-item-id={item.id}>
                <FlowInlineTextEditor blockView={blockView} inlineEditing={inlineEditing} />
              </li>
            )
          : (
              <li
                key={item.id}
                data-flow-list-item-id={item.id}
                className="flow-list-item-editable"
                onDoubleClick={listItemEditable
                  ? (event) => {
                      event.stopPropagation()
                      inlineEditing?.begin(blockView.blockId, item.id)
                    }
                  : undefined}
              >
                {item.text}
              </li>
            )
      })
      rendered = block.ordered ? <ol {...props}>{items}</ol> : <ul {...props}>{items}</ul>
      break
    }
    case 'divider':
      rendered = <hr {...props} />
      break
    case 'media': {
      const isImage = block.mediaKind === 'image'
      rendered = (
        <figure {...props} data-flow-media-layout={block.layout}>
          {isImage
            ? <img data-flow-asset-id={block.assetId} alt={block.altText ?? ''} />
            : (
                <div className="flow-media-placeholder" data-flow-media-kind={block.mediaKind}>
                  {block.mediaKind === 'audio' ? '音频占位符' : '视频占位符'}
                </div>
              )}
          {block.caption ? <figcaption>{block.caption}</figcaption> : null}
        </figure>
      )
      break
    }
    case 'table':
      rendered = (
        <table {...props}>
          {block.caption ? <caption>{block.caption}</caption> : null}
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th key={column.id} data-flow-column-id={column.id}>{column.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row) => (
              <tr key={row.id} data-flow-row-id={row.id}>
                {block.columns.map((column) => (
                  <td key={column.id}>{row.cells[column.id] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
      break
    case 'formula':
      rendered = (
        <div {...props} role="math" aria-label={block.accessibleText} data-flow-formula-id={block.formulaId}>
          {serializeFormulaAst(block.ast as FormulaAstNode)}
        </div>
      )
      break
    case 'code':
      rendered = (
        <pre {...props}>
          <code {...(block.language ? { 'data-flow-language': block.language } : {})}>{block.code}</code>
        </pre>
      )
      break
    case 'callout':
      rendered = (
        <aside {...props} data-flow-tone={block.tone}>
          {block.title ? <strong>{block.title}</strong> : null}
          <p>{block.body}</p>
        </aside>
      )
      break
    case 'section':
      rendered = (
        <details {...props} open={!block.collapsedByDefault}>
          <summary>{block.title}</summary>
          <div className="flow-section-content">
            {(childrenByParent.get(block.id) ?? []).map((child) => (
              <FlowListItem
                key={child.blockId}
                blockView={child}
                childrenByParent={childrenByParent}
                selectedBlockId={selectedBlockId}
                readOnly={readOnly}
                onSelectBlock={onSelectBlock}
                onDeleteBlock={onDeleteBlock}
                onDuplicateBlock={onDuplicateBlock}
                onMoveBlock={onMoveBlock}
                inlineEditing={inlineEditing}
              />
            ))}
          </div>
        </details>
      )
      break
    case 'component':
      rendered = (
        <aside {...props} data-flow-component-package-id={block.component.packageId} data-flow-component-version={block.component.version}>
          {block.staticFallbackAssetId
            ? <img data-flow-static-fallback-asset-id={block.staticFallbackAssetId} alt="" />
            : null}
          <strong>互动组件：{block.component.packageId}</strong>
          <p>版本 {block.component.version}</p>
        </aside>
      )
      break
  }

  if (selected) {
    return (
      <>
        {rendered}
        <FlowBlockActionToolbar
          blockId={blockView.blockId}
          readOnly={readOnly}
          onDeleteBlock={onDeleteBlock}
          onDuplicateBlock={onDuplicateBlock}
          onMoveBlock={onMoveBlock}
        />
      </>
    )
  }
  return rendered
}

export function FlowWorkspace({
  view,
  selectedBlockId,
  onSelectBlock,
  layers,
  selectedLayerTarget,
  controllerLocateRequest,
  onSelectLayer,
  onTransformLayer,
  readOnly = false,
  onPatchBlock,
  editingUnavailableReason,
  onStructuralCommand,
  onDeleteBlock,
  onDuplicateBlock,
  onMoveBlock,
}: FlowWorkspaceProps) {
  const childrenByParent = new Map<string | null, FlowBlockView[]>()
  for (const blockView of view.blocks) {
    const siblings = childrenByParent.get(blockView.parentId)
    if (siblings) siblings.push(blockView)
    else childrenByParent.set(blockView.parentId, [blockView])
  }
  const rootBlocks = childrenByParent.get(null) ?? []

  const inlineEditRef = useRef<FlowInlineEditState | null>(null)
  const composingRef = useRef(false)
  const [inlineEdit, setInlineEdit] = useState<FlowInlineEditState | null>(null)

  const updateInlineEdit = (next: FlowInlineEditState | null) => {
    inlineEditRef.current = next
    setInlineEdit(next)
  }

  const commitInlineEdit = () => {
    const current = inlineEditRef.current
    if (current === null) return
    composingRef.current = false
    updateInlineEdit(null)
    if (current.draft === current.original) return
    const blockView = view.blocks.find((entry) => entry.blockId === current.blockId)
    if (!blockView) return
    const block = blockView.block
    if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
      onPatchBlock?.(current.blockId, { type: block.type, text: current.draft })
      return
    }
    if (block.type === 'list' && current.itemId !== undefined) {
      onStructuralCommand?.({
        blockId: current.blockId,
        kind: 'list.editItem',
        itemId: current.itemId,
        text: current.draft,
      })
    }
  }

  const cancelInlineEdit = () => {
    composingRef.current = false
    updateInlineEdit(null)
  }

  const beginInlineEdit = (blockId: string, itemId?: string): boolean => {
    if (readOnly || editingUnavailableReason) return false
    if (
      inlineEditRef.current?.blockId === blockId &&
      inlineEditRef.current.itemId === itemId
    ) return true
    commitInlineEdit()
    const blockView = view.blocks.find((entry) => entry.blockId === blockId)
    if (!blockView) return false
    const block = blockView.block
    if (block.type === 'heading' || block.type === 'paragraph' || block.type === 'quote') {
      if (itemId !== undefined) return false
      updateInlineEdit({
        blockId,
        field: 'text',
        original: block.text,
        draft: block.text,
        composing: false,
      })
      return true
    }
    if (block.type === 'list') {
      const item = block.items.find((candidate) => candidate.id === itemId)
      if (!item) return false
      updateInlineEdit({
        blockId,
        field: 'text',
        itemId: item.id,
        original: item.text,
        draft: item.text,
        composing: false,
      })
      return true
    }
    return false
  }

  const changeInlineDraft = (draft: string) => {
    const current = inlineEditRef.current
    if (current === null) return
    updateInlineEdit({ ...current, draft })
  }

  const changeInlineComposing = (composing: boolean) => {
    composingRef.current = composing
    const current = inlineEditRef.current
    if (current === null || current.composing === composing) return
    updateInlineEdit({ ...current, composing })
  }

  const inlineEditing: FlowInlineEditingController = {
    state: inlineEdit,
    unavailableReason: editingUnavailableReason,
    begin: beginInlineEdit,
    commit: commitInlineEdit,
    cancel: cancelInlineEdit,
    changeDraft: changeInlineDraft,
    changeComposing: changeInlineComposing,
  }

  // readOnly / unavailable exits any active target immediately, keeping
  // ordinary selection and reading untouched.
  useEffect(() => {
    if (readOnly || editingUnavailableReason) {
      composingRef.current = false
      inlineEditRef.current = null
      setInlineEdit(null)
    }
  }, [editingUnavailableReason, readOnly])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (readOnly) return
    // C2: structural shortcuts exit immediately while an edit target is
    // active, during composition, or when the event originated from a form
    // control / contenteditable inside the workspace.
    if (event.nativeEvent.isComposing || composingRef.current || inlineEditRef.current !== null) return
    const keySource = event.target
    if (
      keySource instanceof HTMLElement &&
      (keySource.tagName === 'INPUT' ||
        keySource.tagName === 'TEXTAREA' ||
        keySource.tagName === 'SELECT' ||
        keySource.isContentEditable)
    ) return
    if (!selectedBlockId) return
    const key = event.key
    const modifier = event.ctrlKey || event.metaKey
    if (key === 'Delete' || key === 'Backspace') {
      if (!onDeleteBlock) return
      event.preventDefault()
      onDeleteBlock(selectedBlockId)
      return
    }
    if (modifier && (key === 'd' || key === 'D')) {
      if (!onDuplicateBlock) return
      event.preventDefault()
      onDuplicateBlock(selectedBlockId)
      return
    }
    if (event.altKey && key === 'ArrowUp') {
      if (!onMoveBlock) return
      event.preventDefault()
      onMoveBlock(selectedBlockId, 'up')
      return
    }
    if (event.altKey && key === 'ArrowDown') {
      if (!onMoveBlock) return
      event.preventDefault()
      onMoveBlock(selectedBlockId, 'down')
      return
    }
    if (key === 'Enter' && !modifier && !event.altKey && !event.shiftKey) {
      const blockView = view.blocks.find((entry) => entry.blockId === selectedBlockId)
      const firstListItemId = blockView?.block.type === 'list' && blockView.block.items.length > 0
        ? blockView.block.items[0]!.id
        : undefined
      if (beginInlineEdit(selectedBlockId, firstListItemId)) event.preventDefault()
    }
  }

  return (
    <article
      className="flow-editor-surface"
      data-surface-id={view.surfaceId}
      style={{
        '--flow-reading-width': `${view.layout.readingWidth}px`,
        position: 'relative',
      } as CSSProperties}
      tabIndex={0}
      aria-label="Flow 讲义画布"
      onKeyDown={handleKeyDown}
    >
      {rootBlocks.map((blockView) => (
        <FlowListItem
          key={blockView.blockId}
          blockView={blockView}
          childrenByParent={childrenByParent}
          selectedBlockId={selectedBlockId}
          readOnly={readOnly}
          onSelectBlock={onSelectBlock}
          onDeleteBlock={onDeleteBlock}
          onDuplicateBlock={onDuplicateBlock}
          onMoveBlock={onMoveBlock}
          inlineEditing={inlineEditing}
        />
      ))}
      {layers ? (
        <FlowAuthoringLayerOverlay
          layers={layers}
          selectedLayerTarget={selectedLayerTarget}
          controllerLocateRequest={controllerLocateRequest}
          onSelectLayer={onSelectLayer}
          onTransformLayer={onTransformLayer}
          readOnly={readOnly}
        />
      ) : null}
    </article>
  )
}
