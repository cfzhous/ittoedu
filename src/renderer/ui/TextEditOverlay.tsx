import { Bold, Eraser, Highlighter, Italic, Strikethrough, Underline } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { TextNode, TextRun, TextRunStyle } from '../../shared/projectTypes'

interface TextEditOverlayProps {
  node: TextNode
  workspace: HTMLElement
  canvas: HTMLCanvasElement
  onPreview(text: string, runs: TextRun[]): void
  onCommit(text: string, runs: TextRun[]): void
  onCancel(): void
}

interface OverlayMetrics {
  left: number
  top: number
  width: number
  height: number
  fontSize: number
  lineHeight: number
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function styleAt(node: TextNode, index: number): TextRunStyle {
  const style: TextRunStyle = {}
  for (const run of node.runs) {
    if (index >= run.start && index < run.end) Object.assign(style, run.style)
  }
  return style
}

export function buildInitialRichTextHtml(node: TextNode): string {
  return Array.from(node.text).map((character, index) => {
    if (character === '\n') return '<br>'
    const style = styleAt(node, index)
    const effectiveUnderline = style.underline ?? node.style.underline
    const effectiveStrike = style.strike ?? node.style.strike
    const decorationOverride =
      effectiveUnderline !== node.style.underline ||
      effectiveStrike !== node.style.strike
    const decorations = [
      effectiveUnderline ? 'underline' : '',
      effectiveStrike ? 'line-through' : '',
    ].filter(Boolean).join(' ')
    const highlightColor = style.highlightColor === undefined
      ? node.style.highlightColor
      : style.highlightColor
    const css = [
      style.color !== undefined ? `color:${style.color}` : '',
      style.bold !== undefined ? `font-weight:${style.bold ? '700' : '400'}` : '',
      style.italic !== undefined ? `font-style:${style.italic ? 'italic' : 'normal'}` : '',
      decorationOverride ? 'display:inline-block' : '',
      decorationOverride ? `text-decoration-line:${decorations || 'none'}` : '',
      highlightColor ? `background-color:${highlightColor}` : '',
      highlightColor === null && node.style.highlightColor
        ? 'background-color:transparent'
        : '',
    ].filter(Boolean).join(';')
    return css ? `<span style="${css}">${escapeHtml(character)}</span>` : escapeHtml(character)
  }).join('')
}

function rgbToHex(value: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return null
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

function authoredBackgroundColor(element: HTMLElement, root: HTMLElement): string | null {
  let current: HTMLElement | null = element
  while (current && current !== root) {
    if (current.style.backgroundColor) return getComputedStyle(current).backgroundColor
    current = current.parentElement
  }
  return null
}

function isTransparentColor(value: string): boolean {
  if (value === 'transparent') return true
  const match = value.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/i)
  return Boolean(match && Number(match[1]) === 0)
}

interface StyledCharacter {
  value: string
  style: TextRunStyle
}

function extractEditor(root: HTMLElement, node: TextNode): { text: string; runs: TextRun[] } {
  const characters: StyledCharacter[] = []
  const visit = (current: Node) => {
    if (current.nodeType === Node.TEXT_NODE) {
      const parent = current.parentElement ?? root
      const computed = getComputedStyle(parent)
      const color = rgbToHex(computed.color)
      const authoredBackground = authoredBackgroundColor(parent, root)
      const background = authoredBackground ? rgbToHex(authoredBackground) : null
      const decoration = computed.textDecorationLine
      const style: TextRunStyle = {
        ...(color && color !== node.style.color.toLowerCase() ? { color } : {}),
        ...(Number.parseInt(computed.fontWeight, 10) >= 600 !== node.style.bold ? { bold: Number.parseInt(computed.fontWeight, 10) >= 600 } : {}),
        ...((computed.fontStyle === 'italic') !== node.style.italic ? { italic: computed.fontStyle === 'italic' } : {}),
        ...(decoration.includes('underline') !== node.style.underline ? { underline: decoration.includes('underline') } : {}),
        ...(decoration.includes('line-through') !== node.style.strike ? { strike: decoration.includes('line-through') } : {}),
        ...(authoredBackground && isTransparentColor(authoredBackground) && node.style.highlightColor
          ? { highlightColor: null }
          : background && background !== node.style.highlightColor
            ? { highlightColor: background }
            : {}),
      }
      for (const value of Array.from(current.textContent ?? '')) characters.push({ value, style })
      return
    }
    if (current instanceof HTMLBRElement) {
      characters.push({ value: '\n', style: {} })
      return
    }
    const block = current instanceof HTMLElement && ['DIV', 'P'].includes(current.tagName)
    if (block && characters.length > 0 && characters.at(-1)?.value !== '\n') {
      characters.push({ value: '\n', style: {} })
    }
    current.childNodes.forEach(visit)
  }
  root.childNodes.forEach(visit)
  while (characters.at(-1)?.value === '\n') characters.pop()
  const text = characters.map((character) => character.value).join('')
  const runs: TextRun[] = []
  let start = 0
  while (start < characters.length) {
    const serialized = JSON.stringify(characters[start].style)
    let end = start + 1
    while (end < characters.length && JSON.stringify(characters[end].style) === serialized) end += 1
    if (Object.keys(characters[start].style).length > 0) {
      runs.push({ start, end, style: characters[start].style })
    }
    start = end
  }
  return { text, runs }
}

export function TextEditOverlay({
  node,
  workspace,
  canvas,
  onPreview,
  onCommit,
  onCancel,
}: TextEditOverlayProps) {
  const [metrics, setMetrics] = useState<OverlayMetrics | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const initialNodeRef = useRef(node)
  const nodeRef = useRef(node)
  const initializedRef = useRef(false)
  const composingRef = useRef(false)
  const pendingBlurRef = useRef(false)
  const finishedRef = useRef(false)
  const blurReadyRef = useRef(false)
  const focusTimerRef = useRef<number | null>(null)
  const finishTimerRef = useRef<number | null>(null)
  nodeRef.current = node

  const read = () => editorRef.current
    ? extractEditor(editorRef.current, nodeRef.current)
    : { text: nodeRef.current.text, runs: nodeRef.current.runs }
  const finish = (cancel: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (cancel) onCancel()
    else {
      const value = read()
      onCommit(value.text, value.runs)
    }
  }

  useLayoutEffect(() => {
    const update = () => {
      const canvasRect = canvas.getBoundingClientRect()
      const workspaceRect = workspace.getBoundingClientRect()
      const scaleX = canvasRect.width / 1280
      const scaleY = canvasRect.height / 720
      const fontSize = node.style.fontSize * scaleY
      setMetrics({
        left: canvasRect.left - workspaceRect.left + node.x * scaleX,
        top: canvasRect.top - workspaceRect.top + node.y * scaleY,
        width: Math.max(16, node.width * scaleX),
        height: Math.max(16, node.height * scaleY),
        fontSize,
        lineHeight: fontSize * 1.22 + node.style.lineSpacing * scaleY,
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(canvas)
    observer.observe(workspace)
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [
    canvas,
    node.height,
    node.style.fontSize,
    node.style.lineSpacing,
    node.width,
    node.x,
    node.y,
    workspace,
  ])

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor || !metrics || initializedRef.current) return
    initializedRef.current = true
    editor.innerHTML = buildInitialRichTextHtml(initialNodeRef.current)
    // Run focus in the next browser task. A canvas double click is reported
    // by Phaser from inside a native pointer event; focusing synchronously in
    // that event is undone by the event's remaining default focus action.
    focusTimerRef.current = window.setTimeout(() => {
      focusTimerRef.current = null
      if (finishedRef.current || !editor.isConnected) return
      editor.focus({ preventScroll: true })
      const selection = window.getSelection()
      const range = document.createRange()
      range.selectNodeContents(editor)
      selection?.removeAllRanges()
      selection?.addRange(range)
      blurReadyRef.current = true
    }, 0)
  }, [metrics])

  useLayoutEffect(() => () => {
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current)
    }
    if (finishTimerRef.current !== null) {
      window.clearTimeout(finishTimerRef.current)
    }
  }, [])

  if (!metrics) return null
  const command = (name: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(name, false, value)
    const result = read()
    onPreview(result.text, result.runs)
  }

  return (
    <>
      <div
        className="text-edit-toolbar"
        style={{ left: metrics.left, top: Math.max(4, metrics.top - 40) }}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <button type="button" title="局部加粗" aria-label="局部加粗" onClick={() => command('bold')}><Bold size={14} /></button>
        <button type="button" title="局部斜体" aria-label="局部斜体" onClick={() => command('italic')}><Italic size={14} /></button>
        <button type="button" title="局部下划线" aria-label="局部下划线" onClick={() => command('underline')}><Underline size={14} /></button>
        <button type="button" title="局部删除线" aria-label="局部删除线" onClick={() => command('strikeThrough')}><Strikethrough size={14} /></button>
        <button type="button" title="局部高亮" aria-label="局部高亮" onClick={() => command('hiliteColor', '#fff3a3')}><Highlighter size={14} /></button>
        <button type="button" title="取消局部高亮" aria-label="取消局部高亮" onClick={() => command('hiliteColor', 'transparent')}><Highlighter size={14} opacity={0.45} /></button>
        <button type="button" title="清除局部格式" aria-label="清除局部格式" onClick={() => command('removeFormat')}><Eraser size={14} /></button>
        <label title="局部文字颜色"><input type="color" aria-label="局部文字颜色" defaultValue={node.style.color} onChange={(event) => command('foreColor', event.target.value)} /></label>
      </div>
      <div
        ref={editorRef}
        className="text-edit-overlay"
        aria-label="编辑文本"
        data-testid="text-edit-overlay"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        style={{
          left: metrics.left,
          top: metrics.top,
          width: metrics.width,
          minHeight: metrics.height,
          maxHeight:
            node.style.overflow === 'auto-height' &&
            node.style.writingMode === 'horizontal'
              ? undefined
              : metrics.height,
          padding: node.style.padding * (metrics.width / node.width),
          fontFamily: node.style.fontFamily,
          fontSize: metrics.fontSize,
          fontWeight: node.style.bold ? 700 : 400,
          fontStyle: node.style.italic ? 'italic' : 'normal',
          textDecoration: `${node.style.underline ? 'underline ' : ''}${node.style.strike ? 'line-through' : ''}`.trim(),
          lineHeight: `${metrics.lineHeight}px`,
          letterSpacing: node.style.letterSpacing * (metrics.width / node.width),
          color: node.style.color,
          textAlign: node.style.align,
          writingMode: node.style.writingMode === 'horizontal'
            ? 'horizontal-tb'
            : node.style.writingMode,
          textOrientation: node.style.writingMode === 'horizontal'
            ? undefined
            : 'upright',
          transform: `rotate(${node.rotation}deg)`,
          transformOrigin: 'center center',
        }}
        onInput={() => {
          const value = read()
          onPreview(value.text, value.runs)
        }}
        onCompositionStart={() => {
          composingRef.current = true
          pendingBlurRef.current = false
        }}
        onCompositionEnd={() => {
          composingRef.current = false
          const value = read()
          onPreview(value.text, value.runs)
          if (pendingBlurRef.current) {
            pendingBlurRef.current = false
            finishTimerRef.current = window.setTimeout(() => finish(false), 0)
          }
        }}
        onBlur={(event) => {
          if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.closest('.text-edit-toolbar')) return
          if (composingRef.current) {
            pendingBlurRef.current = true
            return
          }
          // Ignore focus churn from the pointer sequence that opened this
          // editor. The deferred focus above arms real blur commits.
          if (!blurReadyRef.current) return
          finish(false)
        }}
        onKeyDown={(event) => {
          if (composingRef.current || event.nativeEvent.isComposing) return
          if (event.key === 'Escape') {
            event.preventDefault()
            finish(true)
          } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault()
            finish(false)
          }
        }}
      />
    </>
  )
}
