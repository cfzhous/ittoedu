import { useEffect, useRef, useState } from 'react'

export interface CanvasPlainTextBounds {
  x: number
  y: number
  width: number
  height: number
}

interface CanvasPlainTextEditorProps {
  bounds: CanvasPlainTextBounds
  label: string
  value: string
  multiline?: boolean
  maxLength?: number
  rotation?: number
  onCommit(value: string): void
  onCancel(): void
}

/** Fixed-canvas text editor used by the native V9 authoring surface. */
export function CanvasPlainTextEditor({
  bounds,
  label,
  value,
  multiline = false,
  maxLength,
  rotation = 0,
  onCommit,
  onCancel,
}: CanvasPlainTextEditorProps) {
  const [draft, setDraft] = useState(value)
  const controlRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const finishedRef = useRef(false)

  const finish = (cancel: boolean) => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (cancel) onCancel()
    else onCommit(draft)
  }

  useEffect(() => {
    const control = controlRef.current
    if (!control) return
    const timer = window.setTimeout(() => {
      if (!control.isConnected || finishedRef.current) return
      control.focus({ preventScroll: true })
      control.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const common = {
    className: 'canvas-plain-text-editor__control',
    'aria-label': label,
    value: draft,
    maxLength,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setDraft(event.currentTarget.value),
    onBlur: () => finish(false),
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (event.nativeEvent.isComposing) return
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(true)
      } else if (
        event.key === 'Enter' &&
        (!multiline || event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault()
        finish(false)
      }
    },
  }

  return (
    <div
      className="canvas-plain-text-editor"
      data-testid="canvas-plain-text-editor"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: Math.max(96, bounds.width),
        minHeight: Math.max(multiline ? 64 : 34, bounds.height),
        transform: `rotate(${rotation}deg)`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <span className="canvas-plain-text-editor__label">{label}</span>
      {multiline ? (
        <textarea
          {...common}
          ref={controlRef as React.Ref<HTMLTextAreaElement>}
          rows={Math.max(2, Math.round(bounds.height / 24))}
        />
      ) : (
        <input
          {...common}
          ref={controlRef as React.Ref<HTMLInputElement>}
          type="text"
        />
      )}
      <span className="canvas-plain-text-editor__hint">
        {multiline ? 'Ctrl+Enter 完成 · Esc 取消' : 'Enter 完成 · Esc 取消'}
      </span>
    </div>
  )
}
