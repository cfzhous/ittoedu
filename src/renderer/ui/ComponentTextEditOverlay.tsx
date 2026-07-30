import { useLayoutEffect, useRef, useState } from 'react'
import type { ExternalComponentNode } from '../../shared/projectTypes'
import type { ComponentCanvasTextTarget } from '../phaser/adapters/ExternalComponentNodeAdapter'

interface ComponentTextEditOverlayProps {
  node: ExternalComponentNode
  target: ComponentCanvasTextTarget
  value: string
  workspace: HTMLElement
  canvas: HTMLCanvasElement
  onCommit(value: string): void
  onCancel(): void
}

interface OverlayMetrics {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Lightweight plain-text editor for component props. Rich formatting remains
 * component-owned; the host only edits fields explicitly registered by key.
 */
export function ComponentTextEditOverlay({
  node,
  target,
  value,
  workspace,
  canvas,
  onCommit,
  onCancel,
}: ComponentTextEditOverlayProps) {
  const [draft, setDraft] = useState(value)
  const [metrics, setMetrics] = useState<OverlayMetrics | null>(null)
  const controlRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const finishedRef = useRef(false)
  const focusTimerRef = useRef<number | null>(null)

  const finish = (cancel: boolean): void => {
    if (finishedRef.current) return
    finishedRef.current = true
    if (cancel) onCancel()
    else onCommit(draft)
  }

  useLayoutEffect(() => {
    const update = (): void => {
      const canvasRect = canvas.getBoundingClientRect()
      const workspaceRect = workspace.getBoundingClientRect()
      const scaleX = canvasRect.width / 1280
      const scaleY = canvasRect.height / 720
      const angle = node.rotation * Math.PI / 180
      const nodeCenterX = node.x + node.width / 2
      const nodeCenterY = node.y + node.height / 2
      const localCenterX = target.bounds.x + target.bounds.width / 2 - node.width / 2
      const localCenterY = target.bounds.y + target.bounds.height / 2 - node.height / 2
      const centerX = nodeCenterX +
        localCenterX * Math.cos(angle) -
        localCenterY * Math.sin(angle)
      const centerY = nodeCenterY +
        localCenterX * Math.sin(angle) +
        localCenterY * Math.cos(angle)
      const width = Math.max(96, target.bounds.width * scaleX)
      const height = Math.max(target.multiline ? 64 : 34, target.bounds.height * scaleY)
      setMetrics({
        left: canvasRect.left - workspaceRect.left + centerX * scaleX - width / 2,
        top: canvasRect.top - workspaceRect.top + centerY * scaleY - height / 2,
        width,
        height,
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
    node.rotation,
    node.width,
    node.x,
    node.y,
    target.bounds.height,
    target.bounds.width,
    target.bounds.x,
    target.bounds.y,
    target.multiline,
    workspace,
  ])

  useLayoutEffect(() => {
    const control = controlRef.current
    if (!control || !metrics) return
    focusTimerRef.current = window.setTimeout(() => {
      focusTimerRef.current = null
      if (!control.isConnected || finishedRef.current) return
      control.focus({ preventScroll: true })
      control.select()
    }, 0)
    return () => {
      if (focusTimerRef.current !== null) {
        window.clearTimeout(focusTimerRef.current)
      }
    }
  }, [metrics])

  if (!metrics) return null
  const commonProps = {
    className: 'component-text-edit-overlay__control',
    'aria-label': target.label || '组件文字',
    value: draft,
    maxLength: target.maxLength,
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
        (!target.multiline || event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault()
        finish(false)
      }
    },
  }

  return (
    <div
      className="component-text-edit-overlay"
      data-testid="component-text-edit-overlay"
      style={{
        left: metrics.left,
        top: metrics.top,
        width: metrics.width,
        minHeight: metrics.height,
        transform: `rotate(${node.rotation}deg)`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="component-text-edit-overlay__label">
        {target.label || target.key}
      </span>
      {target.multiline ? (
        <textarea
          {...commonProps}
          ref={controlRef as React.Ref<HTMLTextAreaElement>}
          rows={Math.max(2, Math.round(metrics.height / 24))}
        />
      ) : (
        <input
          {...commonProps}
          ref={controlRef as React.Ref<HTMLInputElement>}
          type="text"
        />
      )}
      <span className="component-text-edit-overlay__hint">
        {target.multiline ? 'Ctrl+Enter 提交 · Esc 取消' : 'Enter 提交 · Esc 取消'}
      </span>
    </div>
  )
}
