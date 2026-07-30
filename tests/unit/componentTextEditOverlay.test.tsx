import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ComponentTextEditOverlay } from '../../src/renderer/ui/ComponentTextEditOverlay'
import type { ExternalComponentNode } from '../../src/shared/projectTypes'

const node: ExternalComponentNode = {
  id: 'component-1',
  name: '示例组件',
  type: 'external-component',
  x: 100,
  y: 80,
  width: 400,
  height: 240,
  rotation: 0,
  opacity: 1,
  visible: true,
  playbackInitialVisibility: 'inherit',
  locked: false,
  component: { packageId: 'com.example.inline', version: '4.0.0' },
  props: { content: { title: '旧标题' } },
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('组件画布文字浮层', () => {
  it('直接编辑显式 key 并用 Enter 提交', () => {
    const workspace = document.createElement('div')
    const canvas = document.createElement('canvas')
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(
      rect(10, 20, 900, 600),
    )
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
      rect(60, 70, 640, 360),
    )
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    render(
      <ComponentTextEditOverlay
        node={node}
        target={{
          nodeId: node.id,
          key: 'content.title',
          label: '组件标题',
          bounds: { x: 24, y: 20, width: 240, height: 44 },
        }}
        value="旧标题"
        workspace={workspace}
        canvas={canvas}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    )
    const editor = screen.getByLabelText('组件标题')
    fireEvent.change(editor, { target: { value: '画布内新标题' } })
    fireEvent.keyDown(editor, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('画布内新标题')
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('Escape 取消且不会提交草稿', () => {
    const workspace = document.createElement('div')
    const canvas = document.createElement('canvas')
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(
      rect(0, 0, 900, 600),
    )
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
      rect(20, 30, 640, 360),
    )
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    render(
      <ComponentTextEditOverlay
        node={node}
        target={{
          nodeId: node.id,
          key: 'content.caption',
          label: '组件说明',
          multiline: true,
          bounds: { x: 24, y: 72, width: 320, height: 80 },
        }}
        value="旧说明"
        workspace={workspace}
        canvas={canvas}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    )
    const editor = screen.getByLabelText('组件说明')
    fireEvent.change(editor, { target: { value: '未保存说明' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCommit).not.toHaveBeenCalled()
  })
})
