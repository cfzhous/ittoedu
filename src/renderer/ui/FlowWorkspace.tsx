import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { serializeFormulaAst } from '../../shared/formulaLinear'
import type { FormulaAstNode } from '../../shared/projectTypes'
import type { CourseProjectDocument, FlowBlock } from '../../shared/courseProjectTypes'
import type { FlowCommandResult } from '../course/flowEditorCommands'
import {
  executeFlowDelete,
  executeFlowEditorCommand,
} from '../course/flowEditorCommands'
import type { FlowBlockView, FlowEditorLayerView, FlowEditorView } from '../course/flowEditorView'
import {
  selectFlowEditorBlocks,
  selectFlowOverlay,
  type FlowEditorSelection,
} from '../course/flowEditorSlice'
import {
  applyFlowTextEditGesture,
  beginFlowFormulaEdit,
  beginFlowTextEdit,
  buildFlowRichTextHtml,
  cancelFlowTextEdit,
  cellToRichText,
  clearFlowTextEditRangeStyle,
  commitFlowFormulaAst,
  commitFlowTextEdit,
  deferFlowTextAction,
  extractFlowRichTextFromEditor,
  finishFlowTextComposition,
  FLOW_PAPER_TEXT_COLOR,
  FLOW_TEXT_REJECT_FORMULA_RUNS,
  flowFormulaBlockToAuthoringNode,
  formatFlowAuthoringBlock,
  formatFlowAuthoringTextStyle,
  logicalFlowSelectionOffsets,
  markFlowTextComposing,
  resolveFlowTextBlur,
  resolveFlowTextHistoryAction,
  resolveFlowTextKeyDown,
  restoreFlowLogicalSelection,
  toggleFlowTextEditEmphasis,
  toggleFlowTextEditRunStyle,
  updateFlowTextDraft,
  updateFlowTextRange,
  type FlowTextEditSession,
} from '../authoring/flowTextEdit'
import { FormulaEditDialog } from './FormulaEditDialog'
import {
  FlowBlockContextToolbar,
  type FlowBlockContextCommand,
} from './FlowBlockContextToolbar'

export interface FlowWorkspaceProps {
  readonly project: CourseProjectDocument
  readonly view: FlowEditorView
  readonly selection: FlowEditorSelection | null
  readonly onProjectChange?: (result: FlowCommandResult) => void
  readonly onSelectionChange?: (selection: FlowEditorSelection | null) => void
  readonly onTextEditChange?: (edit: FlowTextEditSession | null) => void
  readonly readOnly?: boolean
}

export function FlowInlineRichTextEditor({
  blockId,
  label,
  text,
  runs,
  restyleToken,
  range,
  composing,
  onDraftChange,
  onComposingChange,
  onCommit,
  onCancel,
  onKeyAction,
}: {
  readonly blockId: string
  readonly label: string
  readonly text: string
  readonly runs: import('../../shared/projectTypes').TextRun[]
  readonly restyleToken: number
  readonly range: { start: number; end: number }
  readonly composing: boolean
  readonly onDraftChange: (
    text: string,
    runs: import('../../shared/projectTypes').TextRun[],
    offsets: { start: number; end: number } | null,
  ) => void
  readonly onComposingChange: (composing: boolean) => void
  readonly onCommit: () => void
  readonly onCancel: () => void
  readonly onKeyAction: (event: ReactKeyboardEvent<HTMLElement>) => void
}) {
  const editorRef = useRef<HTMLElement>(null)
  const initializedRef = useRef(false)
  const composingRef = useRef(composing)
  const finishedRef = useRef(false)
  const blurReadyRef = useRef(false)
  const lastRestyleRef = useRef(-1)
  composingRef.current = composing

  const read = () => editorRef.current
    ? extractFlowRichTextFromEditor(editorRef.current)
    : { text, runs }

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (!initializedRef.current || lastRestyleRef.current !== restyleToken) {
      editor.innerHTML = buildFlowRichTextHtml(text, runs)
      lastRestyleRef.current = restyleToken
      initializedRef.current = true
      restoreFlowLogicalSelection(editor, range.start, range.end)
    }
    const timer = window.setTimeout(() => {
      if (finishedRef.current || !editor.isConnected) return
      editor.focus({ preventScroll: true })
      restoreFlowLogicalSelection(editor, range.start, range.end)
      blurReadyRef.current = true
    }, 0)
    return () => window.clearTimeout(timer)
  }, [restyleToken])

  return (
    <span
      ref={editorRef}
      className="flow-inline-editor"
      data-testid="flow-inline-editor"
      data-flow-inline-editor="true"
      data-flow-rich-text="true"
      data-flow-block-id={blockId}
      aria-label={label}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      style={{
        outline: 'none',
        caretColor: '#1a1d24',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        minHeight: '1.4em',
        color: FLOW_PAPER_TEXT_COLOR,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onInput={() => {
        const value = read()
        const offsets = editorRef.current ? logicalFlowSelectionOffsets(editorRef.current) : null
        onDraftChange(value.text, value.runs, offsets)
      }}
      onCompositionStart={() => {
        composingRef.current = true
        onComposingChange(true)
      }}
      onCompositionEnd={() => {
        composingRef.current = false
        const value = read()
        const offsets = editorRef.current ? logicalFlowSelectionOffsets(editorRef.current) : null
        onDraftChange(value.text, value.runs, offsets)
        onComposingChange(false)
      }}
      onBlur={(event) => {
        if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('.flow-block-context-toolbar')) {
          return
        }
        if (!blurReadyRef.current) return
        onCommit()
      }}
      onKeyDown={(event) => {
        if (composingRef.current || event.nativeEvent.isComposing) return
        onKeyAction(event)
        if (event.key === 'Escape') {
          event.preventDefault()
          finishedRef.current = true
          onCancel()
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          finishedRef.current = true
          onCommit()
        }
      }}
    />
  )
}

function FlowPlainStringEditor({
  blockId,
  label,
  value,
  multiline,
  onChange,
  onComposingChange,
  onCommit,
  onCancel,
}: {
  blockId: string
  label: string
  value: string
  multiline: boolean
  onChange: (value: string) => void
  onComposingChange: (composing: boolean) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const composingRef = useRef(false)
  const shared = {
    className: 'flow-inline-plain-editor',
    'data-testid': 'flow-inline-plain-editor',
    'data-flow-block-id': blockId,
    'aria-label': label,
    value,
    autoFocus: true,
    onPointerDown: (event: ReactPointerEvent<HTMLInputElement | HTMLTextAreaElement>) => event.stopPropagation(),
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(event.currentTarget.value)
    },
    onCompositionStart: () => {
      composingRef.current = true
      onComposingChange(true)
    },
    onCompositionEnd: () => {
      composingRef.current = false
      onComposingChange(false)
    },
    onBlur: () => {
      if (composingRef.current) return
      onCommit()
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (composingRef.current || event.nativeEvent.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      } else if (event.key === 'Enter' && (!multiline || event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        onCommit()
      }
    },
  }
  if (multiline) {
    return <textarea {...shared} rows={4} />
  }
  return <input {...shared} />
}

function overlayCardStyle(layer: FlowEditorLayerView): CSSProperties {
  return {
    position: 'absolute',
    left: layer.item.frame.x,
    top: layer.item.frame.y,
    width: layer.item.frame.width,
    height: layer.item.frame.height,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  }
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(
    target.closest('[data-flow-rich-text="true"]') ||
    target.closest('[data-flow-plain-text="true"]') ||
    target.closest('h1,h2,h3,h4,h5,h6,p,blockquote,li,td,th,code,pre,summary'),
  )
}

function headingTag(level: 1 | 2 | 3 | 4 | 5 | 6): 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' {
  return (`h${level}`) as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
}

function blockLabel(block: FlowBlock): string {
  if (block.type === 'heading') return '编辑标题文本'
  if (block.type === 'quote') return '编辑引用文本'
  if (block.type === 'list') return '编辑列表项文本'
  if (block.type === 'table') return '编辑表格单元格'
  if (block.type === 'code') return '编辑代码'
  if (block.type === 'callout') return '编辑提示正文'
  if (block.type === 'section') return '编辑分节标题'
  return '编辑段落文本'
}

export function FlowWorkspace({
  project,
  view,
  selection,
  onProjectChange,
  onSelectionChange,
  onTextEditChange,
  readOnly = false,
}: FlowWorkspaceProps) {
  const paperRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const editRef = useRef<FlowTextEditSession | null>(null)
  const [edit, setEdit] = useState<FlowTextEditSession | null>(null)
  const [restyleToken, setRestyleToken] = useState(0)
  const [toolbarPlacement, setToolbarPlacement] = useState<'top' | 'below'>('top')
  const [formulaBlockId, setFormulaBlockId] = useState<string | null>(null)
  const toolbarSelectionRef = useRef<{ start: number; end: number } | null>(null)

  const setEditState = (next: FlowTextEditSession | null) => {
    editRef.current = next
    setEdit(next)
    onTextEditChange?.(next)
  }

  useEffect(() => {
    if (readOnly) return
    if (selection?.focus === 'text' && selection.selectedBlockId) {
      if (editRef.current?.blockId === selection.selectedBlockId) return
      const begun = beginFlowTextEdit({
        project,
        selection,
        blockId: selection.selectedBlockId,
        range: selection.textRange ?? {
          blockId: selection.selectedBlockId,
          start: 0,
          end: 0,
        },
      })
      if (!begun.ok) return
      setEditState(begun.edit)
      setRestyleToken((token) => token + 1)
    }
  }, [
    project,
    readOnly,
    selection,
  ])

  useEffect(() => {
    if (!edit || !scrollRef.current) return
    const block = scrollRef.current.querySelector(`[data-flow-block-id="${edit.blockId}"]`)
    if (!(block instanceof HTMLElement) || !scrollRef.current) return
    const update = () => {
      const scrollRect = scrollRef.current!.getBoundingClientRect()
      const blockRect = block.getBoundingClientRect()
      setToolbarPlacement(blockRect.top - scrollRect.top < 36 ? 'below' : 'top')
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scrollRef.current)
    scrollRef.current.addEventListener('scroll', update)
    return () => {
      observer.disconnect()
      scrollRef.current?.removeEventListener('scroll', update)
    }
  }, [edit?.blockId])

  const emitProject = (result: FlowCommandResult) => {
    if (result.ok && result.nextDocument) onProjectChange?.(result)
  }

  const emitSelection = (next: FlowEditorSelection | null) => {
    onSelectionChange?.(next)
  }

  const locationId = selection?.locationId ?? view.locationId

  const commitCurrent = (keepSelected = true) => {
    const current = editRef.current
    if (!current || !selection) {
      setEditState(null)
      return
    }
    const action = resolveFlowTextBlur({ composing: current.composing, blurReady: true })
    if (action === 'defer') {
      setEditState(deferFlowTextAction(current, 'commit'))
      return
    }
    const result = commitFlowTextEdit(project, selection, current, {
      expectedRevision: project.revision,
    })
    setEditState(null)
    emitProject(result)
    if (keepSelected && selection.selectedBlockId) {
      emitSelection(selectFlowEditorBlocks(result.nextDocument ?? project, locationId, [current.blockId]))
    } else if (!keepSelected) {
      emitSelection(null)
    }
  }

  const flushOpenTextEdit = () => {
    const current = editRef.current
    if (!current) return
    if (current.composing) {
      setEditState(deferFlowTextAction(current, 'commit'))
      return
    }
    const result = commitFlowTextEdit(
      project,
      selection ?? selectFlowEditorBlocks(project, locationId, [current.blockId]),
      current,
      { expectedRevision: project.revision },
    )
    setEditState(null)
    emitProject(result)
  }

  useEffect(() => {
    if (readOnly) return
    if (editRef.current && selection?.focus !== 'text') {
      flushOpenTextEdit()
    }
  }, [project, readOnly, selection])

  const cancelCurrent = () => {
    const current = editRef.current
    if (!current || !selection) {
      setEditState(null)
      return
    }
    cancelFlowTextEdit(project, selection, current)
    setEditState(null)
    emitSelection(selectFlowEditorBlocks(project, locationId, [current.blockId]))
  }

  const enterText = (
    blockId: string,
    gesture: 'double-click' | 'enter' | 'click-text',
    extra?: { offset?: number; listItemId?: string; tableRowId?: string; tableColumnId?: string },
  ) => {
    if (readOnly || selection?.authoringScope === 'global') return
    const currentSelection = selection ?? selectFlowEditorBlocks(project, locationId, [blockId])
    const begun = applyFlowTextEditGesture({
      project,
      selection: currentSelection,
      blockId,
      gesture,
      locationId,
      offset: extra?.offset,
      listItemId: extra?.listItemId,
      tableRowId: extra?.tableRowId,
      tableColumnId: extra?.tableColumnId,
    })
    if (!begun.ok) {
      if (begun.reason === FLOW_TEXT_REJECT_FORMULA_RUNS) {
        openFormula(blockId)
      }
      return
    }
    emitSelection(begun.selection)
    setEditState(begun.edit)
    setRestyleToken((token) => token + 1)
  }

  const openFormula = (blockId: string) => {
    if (readOnly || selection?.authoringScope === 'global') return
    const currentSelection = selection ?? selectFlowEditorBlocks(project, locationId, [blockId])
    const begun = beginFlowFormulaEdit({
      project,
      selection: currentSelection,
      blockId,
    })
    if (!begun.ok) return
    emitSelection(begun.selection)
    setEditState(begun.edit)
    setFormulaBlockId(blockId)
  }

  const selectBlock = (blockId: string, event: ReactMouseEvent<HTMLElement>) => {
    if (readOnly) return
    event.stopPropagation()
    if (selection?.authoringScope === 'global') return
    if (editRef.current && editRef.current.blockId !== blockId) {
      commitCurrent(false)
    }
    if (
      selection?.focus === 'block' &&
      selection.selectedBlockId === blockId &&
      isTextTarget(event.target)
    ) {
      enterText(blockId, 'click-text')
      return
    }
    const ids = (() => {
      if (event.ctrlKey || event.metaKey) {
        const current = selection?.selectedBlockIds ?? []
        return current.includes(blockId)
          ? current.filter((id) => id !== blockId)
          : [...current, blockId]
      }
      if (event.shiftKey && selection?.selectedBlockId) {
        const order = view.blocks.map((entry) => entry.blockId)
        const from = order.indexOf(selection.selectedBlockId)
        const to = order.indexOf(blockId)
        if (from >= 0 && to >= 0) {
          return order.slice(Math.min(from, to), Math.max(from, to) + 1)
        }
      }
      return [blockId]
    })()
    if (ids.length === 0) {
      emitSelection(null)
      return
    }
    emitSelection(selectFlowEditorBlocks(project, locationId, ids))
  }

  const handlePaperClick = (event: ReactMouseEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return
    if (editRef.current) commitCurrent(false)
    else emitSelection(null)
  }

  const handleBlockKeyDown = (blockId: string, event: ReactKeyboardEvent<HTMLElement>) => {
    if (readOnly || selection?.authoringScope === 'global') return
    if (editRef.current) return
    if (event.key === 'Enter') {
      event.preventDefault()
      enterText(blockId, 'enter')
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      emitSelection(null)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!selection) return
      event.preventDefault()
      emitProject(executeFlowDelete(project, selection))
      emitSelection(null)
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const order = view.blocks.map((entry) => entry.blockId)
      const index = order.indexOf(blockId)
      const nextIndex = event.key === 'ArrowUp' ? index - 1 : index + 1
      const nextId = order[nextIndex]
      if (nextId) emitSelection(selectFlowEditorBlocks(project, locationId, [nextId]))
    }
  }

  const handleHistoryKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = editRef.current
    if (!current) return
    if (!(event.ctrlKey || event.metaKey)) return
    if (event.key.toLowerCase() !== 'z' && event.key.toLowerCase() !== 'y') return
    const action = event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey)
      ? 'redo' as const
      : 'undo' as const
    const resolved = resolveFlowTextHistoryAction({
      composing: current.composing,
      draftDirty: JSON.stringify(current.original) !== JSON.stringify(current.draft),
      action,
    })
    if (resolved === 'ignore' && current.composing) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (resolved === 'cancel') {
      event.preventDefault()
      event.stopPropagation()
      cancelCurrent()
    }
  }

  const applyToolbarCommand = (command: FlowBlockContextCommand) => {
    if (!selection) return
    const current = editRef.current
    const captured = toolbarSelectionRef.current
    toolbarSelectionRef.current = null
    if (current && captured) setEditState(updateFlowTextRange(current, captured))
    const live = editRef.current

    if (command.type === 'range-style' || command.type === 'range-color' || command.type === 'range-highlight') {
      if (live && command.type === 'range-style') {
        const key = command.style.bold !== undefined
          ? 'bold' as const
          : command.style.italic !== undefined
            ? 'italic' as const
            : command.style.underline !== undefined
              ? 'underline' as const
              : command.style.strike !== undefined
                ? 'strike' as const
                : null
        if (key) {
          setEditState(toggleFlowTextEditRunStyle(live, key, live.range))
          setRestyleToken((token) => token + 1)
          return
        }
      }
      const style = command.type === 'range-style'
        ? command.style
        : command.type === 'range-color'
          ? { color: command.color }
          : { highlightColor: command.color }
      const result = formatFlowAuthoringTextStyle({
        document: project,
        selection,
        style,
        edit: live,
        range: live?.range,
        expectedRevision: project.revision,
      })
      if (result.nextEdit) {
        setEditState(result.nextEdit)
        setRestyleToken((token) => token + 1)
      }
      emitProject(result)
      return
    }
    if (command.type === 'range-emphasis' && live) {
      setEditState(toggleFlowTextEditEmphasis(live, live.range))
      setRestyleToken((token) => token + 1)
      return
    }
    if (command.type === 'range-clear' && live) {
      setEditState(clearFlowTextEditRangeStyle(live, live.range))
      setRestyleToken((token) => token + 1)
      return
    }
    if (command.type === 'heading-level') {
      emitProject(formatFlowAuthoringBlock(project, selection, { kind: 'heading-level', level: command.level }))
      return
    }
    if (command.type === 'convert-heading') {
      emitProject(formatFlowAuthoringBlock(project, selection, { kind: 'convert-heading', level: command.level }))
      return
    }
    if (command.type === 'convert-paragraph') {
      emitProject(formatFlowAuthoringBlock(project, selection, { kind: 'convert-paragraph' }))
      return
    }
    if (command.type === 'list-ordered') {
      emitProject(formatFlowAuthoringBlock(project, selection, { kind: 'list-ordered', ordered: command.ordered }))
      return
    }
    if (command.type === 'indent' || command.type === 'outdent') {
      emitProject(executeFlowEditorCommand(project, selection, { name: command.type }))
      return
    }
    if (command.type === 'move') {
      const blockView = view.blocks.find((entry) => entry.blockId === selection.selectedBlockId)
      if (!blockView) return
      const nextIndex = command.direction === 'up' ? blockView.index - 1 : blockView.index + 1
      if (nextIndex < 0) return
      emitProject(executeFlowEditorCommand(project, selection, {
        name: 'move',
        destination: { parentId: blockView.parentId, index: nextIndex },
      }))
      return
    }
    if (command.type === 'delete') {
      const blockSelection = selection.focus === 'text'
        ? selectFlowEditorBlocks(project, locationId, selection.selectedBlockIds)
        : selection
      emitProject(executeFlowEditorCommand(project, blockSelection, { name: 'delete' }))
      setEditState(null)
      emitSelection(null)
    }
  }

  const formulaBlock = formulaBlockId
    ? view.blocks.find((entry) => entry.blockId === formulaBlockId)?.block
    : undefined
  const formulaNode = formulaBlock?.type === 'formula'
    ? flowFormulaBlockToAuthoringNode({
        id: formulaBlock.id,
        formulaId: formulaBlock.formulaId,
        accessibleText: formulaBlock.accessibleText,
        ast: formulaBlock.ast as FormulaAstNode,
      })
    : null

  const childrenByParent = new Map<string | null, FlowBlockView[]>()
  for (const blockView of view.blocks) {
    const siblings = childrenByParent.get(blockView.parentId)
    if (siblings) siblings.push(blockView)
    else childrenByParent.set(blockView.parentId, [blockView])
  }

  const renderBlock = (blockView: FlowBlockView): ReactNode => {
    const block = blockView.block as FlowBlock
    const selected = selection?.selectedBlockIds.includes(blockView.blockId) ?? false
    const editingThis = edit?.blockId === blockView.blockId
    const showToolbar = selected && !readOnly
    const richDraft = edit?.kind === 'rich-text' && editingThis
      ? edit.draft as { text: string; runs: import('../../shared/projectTypes').TextRun[] }
      : null
    const plainDraft = edit?.kind === 'plain-string' && editingThis
      ? (edit.draft as { text: string }).text
      : null

    const frameProps = {
      'data-testid': `flow-block-${blockView.blockId}`,
      'data-flow-block-id': blockView.blockId,
      'data-flow-parent-id': blockView.parentId ?? '',
      'data-flow-authoring-address': blockView.authoringAddress,
      'data-flow-layer-kind': 'document-block',
      className: `flow-block flow-block-${block.type}${selected ? ' flow-block--selected' : ''}`,
      'aria-selected': selected,
      tabIndex: selected && !editingThis ? 0 : -1,
      onClick: readOnly ? undefined : (event: ReactMouseEvent<HTMLElement>) => selectBlock(blockView.blockId, event),
      onDoubleClick: readOnly ? undefined : (event: ReactMouseEvent<HTMLElement>) => {
        event.stopPropagation()
        if (block.type === 'formula') {
          openFormula(blockView.blockId)
          return
        }
        if (block.type === 'list') {
          const itemId = event.currentTarget.getAttribute('data-flow-active-item') ??
            (event.target instanceof HTMLElement
              ? event.target.closest('li')?.getAttribute('data-flow-list-item-id')
              : null)
          enterText(blockView.blockId, 'double-click', { listItemId: itemId ?? block.items[0]?.id })
          return
        }
        if (block.type === 'table') {
          const cell = event.target instanceof HTMLElement ? event.target.closest('td,th') : null
          enterText(blockView.blockId, 'double-click', {
            tableRowId: cell?.getAttribute('data-flow-row-id') ?? block.rows[0]?.id,
            tableColumnId: cell?.getAttribute('data-flow-column-id') ?? block.columns[0]?.id,
          })
          return
        }
        enterText(blockView.blockId, 'double-click')
      },
      onKeyDown: readOnly ? undefined : (event: ReactKeyboardEvent<HTMLElement>) => {
        handleBlockKeyDown(blockView.blockId, event)
      },
      style: {
        position: 'relative' as const,
        outline: selected ? '2px solid #5b9cff' : undefined,
        boxShadow: selected ? 'inset 4px 0 0 #5b9cff' : undefined,
        padding: '12px 16px',
        margin: '0 0 12px',
      },
    }

    const richEditor = (label: string, text: string, runs: import('../../shared/projectTypes').TextRun[]) => (
      <FlowInlineRichTextEditor
          blockId={blockView.blockId}
          label={label}
          text={richDraft?.text ?? text}
          runs={richDraft?.runs ?? runs}
          restyleToken={restyleToken}
          range={edit?.range ?? { start: 0, end: 0 }}
          composing={edit?.composing ?? false}
          onDraftChange={(nextText, nextRuns, offsets) => {
            const current = editRef.current
            if (!current) return
            let next = updateFlowTextDraft(current, { text: nextText, runs: nextRuns })
            if (offsets) next = updateFlowTextRange(next, offsets)
            setEditState(next)
          }}
          onComposingChange={(composing) => {
            const current = editRef.current
            if (!current) return
            if (composing) {
              setEditState(markFlowTextComposing(current, true))
              return
            }
            const finished = finishFlowTextComposition(current)
            setEditState(finished.edit)
            if (finished.action === 'commit') commitCurrent(true)
            else if (finished.action === 'cancel') cancelCurrent()
          }}
          onCommit={() => commitCurrent(true)}
          onCancel={cancelCurrent}
          onKeyAction={(event) => {
            const current = editRef.current
            if (!current) return
            resolveFlowTextKeyDown({
              kind: current.kind,
              composing: current.composing,
              isComposingEvent: event.nativeEvent.isComposing,
              key: event.key,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
            })
          }}
        />
    )

    let body: ReactNode = null
    switch (block.type) {
      case 'heading': {
        const Tag = headingTag(block.level)
        body = (
          <Tag data-flow-rich-text="true">
            {editingThis && edit?.kind === 'rich-text'
              ? richEditor(blockLabel(block), block.text, block.runs ?? [])
              : block.text}
          </Tag>
        )
        break
      }
      case 'paragraph':
        body = (
          <p data-flow-rich-text="true">
            {editingThis && edit?.kind === 'rich-text'
              ? richEditor(blockLabel(block), block.text, block.runs ?? [])
              : block.text}
          </p>
        )
        break
      case 'quote':
        body = (
          <blockquote data-flow-rich-text="true">
            {editingThis && edit?.kind === 'rich-text'
              ? richEditor(blockLabel(block), block.text, block.runs ?? [])
              : <p>{block.text}</p>}
            {block.citation ? <cite>{block.citation}</cite> : null}
          </blockquote>
        )
        break
      case 'list': {
        const items = block.items.map((item) => {
          const editingItem = editingThis && edit?.listItemId === item.id
          return (
            <li
              key={item.id}
              data-flow-list-item-id={item.id}
              data-flow-rich-text="true"
              onDoubleClick={readOnly ? undefined : (event) => {
                event.stopPropagation()
                enterText(blockView.blockId, 'double-click', { listItemId: item.id })
              }}
            >
              {editingItem && edit?.kind === 'rich-text'
                ? richEditor(blockLabel(block), item.text, item.runs ?? [])
                : item.text}
            </li>
          )
        })
        body = block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
        break
      }
      case 'divider':
        body = <hr />
        break
      case 'media':
        body = (
          <figure data-flow-media-layout={block.layout}>
            {block.mediaKind === 'image'
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
      case 'table':
        body = (
          <table>
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
                  {block.columns.map((column) => {
                    const rich = cellToRichText(row.cells[column.id])
                    const editingCell = editingThis &&
                      edit?.tableRowId === row.id &&
                      edit.tableColumnId === column.id
                    return (
                      <td
                        key={column.id}
                        data-flow-column-id={column.id}
                        data-flow-row-id={row.id}
                        data-flow-rich-text="true"
                        onDoubleClick={readOnly ? undefined : (event) => {
                          event.stopPropagation()
                          enterText(blockView.blockId, 'double-click', {
                            tableRowId: row.id,
                            tableColumnId: column.id,
                          })
                        }}
                      >
                        {editingCell && edit?.kind === 'rich-text'
                          ? richEditor(blockLabel(block), rich.text, rich.runs ?? [])
                          : rich.text}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )
        break
      case 'formula':
        body = (
          <div role="math" aria-label={block.accessibleText} data-flow-formula-id={block.formulaId}>
            {serializeFormulaAst(block.ast as FormulaAstNode)}
          </div>
        )
        break
      case 'code':
        body = (
          <pre data-flow-plain-text="true">
            {editingThis && edit?.field === 'code'
              ? (
                  <FlowPlainStringEditor
                    blockId={blockView.blockId}
                    label={blockLabel(block)}
                    value={plainDraft ?? block.code}
                    multiline
                    onChange={(value) => {
                      const current = editRef.current
                      if (!current) return
                      setEditState(updateFlowTextDraft(current, { text: value }))
                    }}
                    onComposingChange={(composing) => {
                      const current = editRef.current
                      if (!current) return
                      setEditState(markFlowTextComposing(current, composing))
                    }}
                    onCommit={() => commitCurrent(true)}
                    onCancel={cancelCurrent}
                  />
                )
              : <code {...(block.language ? { 'data-flow-language': block.language } : {})}>{block.code}</code>}
          </pre>
        )
        break
      case 'callout':
        body = (
          <aside data-flow-tone={block.tone} data-flow-plain-text="true">
            {block.title ? <strong>{block.title}</strong> : null}
            {editingThis && edit?.field === 'body'
              ? (
                  <FlowPlainStringEditor
                    blockId={blockView.blockId}
                    label={blockLabel(block)}
                    value={plainDraft ?? block.body}
                    multiline
                    onChange={(value) => {
                      const current = editRef.current
                      if (!current) return
                      setEditState(updateFlowTextDraft(current, { text: value }))
                    }}
                    onComposingChange={(composing) => {
                      const current = editRef.current
                      if (!current) return
                      setEditState(markFlowTextComposing(current, composing))
                    }}
                    onCommit={() => commitCurrent(true)}
                    onCancel={cancelCurrent}
                  />
                )
              : <p>{block.body}</p>}
          </aside>
        )
        break
      case 'section':
        body = (
          <details open={!block.collapsedByDefault}>
            <summary data-flow-plain-text="true">
              {editingThis && edit?.field === 'title'
                ? (
                    <FlowPlainStringEditor
                      blockId={blockView.blockId}
                      label={blockLabel(block)}
                      value={plainDraft ?? block.title}
                      multiline={false}
                      onChange={(value) => {
                        const current = editRef.current
                        if (!current) return
                        setEditState(updateFlowTextDraft(current, { text: value }))
                      }}
                      onComposingChange={(composing) => {
                        const current = editRef.current
                        if (!current) return
                        setEditState(markFlowTextComposing(current, composing))
                      }}
                      onCommit={() => commitCurrent(true)}
                      onCancel={cancelCurrent}
                    />
                  )
                : block.title}
            </summary>
            <div className="flow-section-content">
              {(childrenByParent.get(block.id) ?? []).map((child) => (
                <div key={child.blockId}>{renderBlock(child)}</div>
              ))}
            </div>
          </details>
        )
        break
      case 'component':
        body = (
          <aside data-flow-component-package-id={block.component.packageId} data-flow-component-version={block.component.version}>
            {block.staticFallbackAssetId
              ? <img data-flow-static-fallback-asset-id={block.staticFallbackAssetId} alt="" />
              : null}
            <strong>互动组件：{block.component.packageId}</strong>
            <p>版本 {block.component.version}</p>
          </aside>
        )
        break
    }

    return (
      <div {...frameProps}>
        {showToolbar ? (
          <FlowBlockContextToolbar
            block={block}
            edit={editingThis ? edit : null}
            placement={editingThis ? toolbarPlacement : 'top'}
            onPreserveSelection={() => {
              const editor = scrollRef.current?.querySelector('[data-testid="flow-inline-editor"]')
              if (editor instanceof HTMLElement) {
                toolbarSelectionRef.current = logicalFlowSelectionOffsets(editor)
              }
            }}
            onCommand={applyToolbarCommand}
          />
        ) : null}
        {body}
      </div>
    )
  }

  const rootBlocks = childrenByParent.get(null) ?? []
  const overlayLayers = view.overlayLayers.filter((layer) => layer.effectiveVisible)

  return (
    <div
      className="flow-workspace"
      data-testid="flow-workspace"
      data-flow-not-slide-stage="true"
      onKeyDown={handleHistoryKey}
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        height: '100%',
        minHeight: 320,
        overflow: 'hidden',
        background: '#eef1f6',
      }}
    >
      <div
        ref={scrollRef}
        className="flow-workspace__scroll"
        data-testid="flow-workspace-scroll"
        style={{
          flex: 1,
          overflow: 'auto',
          height: '100%',
          padding: '24px 16px 48px',
        }}
      >
        <article
          ref={paperRef}
          className="flow-paper"
          data-testid="flow-paper"
          data-flow-reading-width={view.layout.readingWidth}
          onClick={handlePaperClick}
          style={{
            width: '100%',
            maxWidth: view.layout.readingWidth,
            minHeight: '100%',
            margin: '0 auto',
            padding: '28px 36px 64px',
            background: '#fff',
            color: FLOW_PAPER_TEXT_COLOR,
            boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
          }}
        >
          {rootBlocks.map((blockView) => (
            <div key={blockView.blockId}>{renderBlock(blockView)}</div>
          ))}
        </article>
      </div>
      {overlayLayers.length > 0 ? (
        <div
          className="flow-authoring-layer-overlay"
          data-testid="flow-authoring-layer-overlay"
          style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none' }}
        >
          {overlayLayers.map((layer) => (
            <button
              key={layer.selectionId}
              type="button"
              className={`flow-layer-card${selection?.selectedOverlayIds.includes(layer.selectionId) ? ' flow-layer-card--selected' : ''}`}
              data-layer-item-id={layer.selectionId}
              data-testid={`flow-layer-card-${layer.selectionId}`}
              aria-label={layer.item.label || '浮层'}
              style={overlayCardStyle(layer)}
              onClick={(event) => {
                event.stopPropagation()
                if (editRef.current) commitCurrent(false)
                emitSelection(selectFlowOverlay(project, locationId, [layer.selectionId], selection?.authoringScope ?? 'page'))
              }}
            >
              {layer.item.label || '浮层'}
            </button>
          ))}
        </div>
      ) : null}
      {formulaNode ? (
        <FormulaEditDialog
          node={formulaNode}
          onCancel={() => {
            setFormulaBlockId(null)
            cancelCurrent()
          }}
          onCommit={(ast, accessibleText) => {
            if (!selection) return
            const result = commitFlowFormulaAst(project, selection, ast, accessibleText, {
              expectedRevision: project.revision,
            })
            setFormulaBlockId(null)
            setEditState(null)
            emitProject(result)
            emitSelection(selectFlowEditorBlocks(result.nextDocument ?? project, locationId, [formulaNode.id]))
          }}
        />
      ) : null}
    </div>
  )
}
