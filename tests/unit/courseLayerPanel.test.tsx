import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LayerItem } from '@/shared/courseProjectTypes'
import {
  CourseLayerPanel,
  type CourseLayerPanelEntry,
  type CourseLayerReorderRequest,
} from '@/renderer/course/CourseLayerPanel'

afterEach(cleanup)

function textLayer(id: string, label: string, order: number, options: {
  visible?: boolean
  locked?: boolean
} = {}): LayerItem {
  return {
    layerItemId: id,
    label,
    kind: 'native',
    frame: { mode: 'absolute', x: 0, y: 0, width: 240, height: 80 },
    order,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    content: {
      nativeType: 'text',
      data: {
        text: label,
        runs: [],
        style: {
          fontFamily: 'Arial',
          fontSize: 24,
          color: '#000000',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          emphasis: false,
          highlightColor: null,
          align: 'left',
          verticalAlign: 'top',
          writingMode: 'horizontal',
          lineSpacing: 6,
          letterSpacing: 0,
          padding: 0,
          overflow: 'auto-height',
          backgroundColor: '#ffffff',
          backgroundOpacity: 0,
          cornerRadius: 0,
        },
      },
    },
  }
}

function runtimeLayer(id: string, label: string, order: number): LayerItem {
  return {
    layerItemId: id,
    label,
    kind: 'runtime',
    frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 180 },
    order,
    visible: false,
    locked: true,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: 'window.test = true',
      content: { values: {} },
      assets: {},
    },
  }
}

const entries: CourseLayerPanelEntry[] = [
  { item: textLayer('back', '背景说明', 10), source: 'scene' },
  { item: runtimeLayer('middle', '函数实验', 20), source: 'surface' },
  { item: textLayer('front', '课堂标题', 30), source: 'global' },
]

function noopProps() {
  return {
    onSelectionChange: vi.fn(),
    onToggleVisible: vi.fn(),
    onToggleLocked: vi.fn(),
    onReorder: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
  }
}

describe('CourseLayerPanel', () => {
  it('shows the effective order with only teacher-facing scope and kind labels', () => {
    const view = render(<CourseLayerPanel entries={entries} selectedIds={[]} {...noopProps()} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByRole('button', { name: /选择图层/u }).textContent)).toEqual([
      expect.stringContaining('课堂标题'),
      expect.stringContaining('函数实验'),
      expect.stringContaining('背景说明'),
    ])
    expect(within(rows[0]).getByText(/文字 · 全课程/u)).toBeInTheDocument()
    expect(within(rows[1]).getByText(/互动内容 · 当前内容共用/u)).toBeInTheDocument()
    expect(view.container.textContent).not.toMatch(/scene|surface|global|native|runtime|z\d/iu)
  })

  it('uses ordinary click for one selection and Shift click to add or remove selections', () => {
    const selectionChanges: string[][] = []
    function Harness() {
      const [selectedIds, setSelectedIds] = useState<string[]>([])
      return (
        <CourseLayerPanel
          entries={entries}
          selectedIds={selectedIds}
          {...noopProps()}
          onSelectionChange={(ids) => { selectionChanges.push(ids); setSelectedIds(ids) }}
        />
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '选择图层“课堂标题”' }))
    fireEvent.click(screen.getByRole('button', { name: '选择图层“函数实验”' }), { shiftKey: true })
    expect(selectionChanges).toEqual([['front'], ['front', 'middle']])
    expect(screen.getByRole('button', { name: '选择图层“课堂标题”' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('已选择 2 个图层')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '选择图层“课堂标题”' }), { shiftKey: true })
    expect(selectionChanges.at(-1)).toEqual(['middle'])
  })

  it('exposes hidden and locked state in text and sends explicit next values', () => {
    const props = noopProps()
    render(<CourseLayerPanel entries={entries} selectedIds={[]} {...props} />)
    const runtimeRow = screen.getByRole('listitem', { name: '图层：函数实验' })
    expect(within(runtimeRow).getByText('已隐藏')).toBeInTheDocument()
    expect(within(runtimeRow).getByText('已锁定')).toBeInTheDocument()
    fireEvent.click(within(runtimeRow).getByRole('button', { name: '显示“函数实验”' }))
    fireEvent.click(within(runtimeRow).getByRole('button', { name: '解锁“函数实验”' }))
    expect(props.onToggleVisible).toHaveBeenCalledWith(entries[1], true)
    expect(props.onToggleLocked).toHaveBeenCalledWith(entries[1], false)
  })

  it('emits canonical back-to-front order for keyboard-accessible move buttons', () => {
    const requests: CourseLayerReorderRequest[] = []
    render(<CourseLayerPanel entries={entries} selectedIds={[]} {...noopProps()} onReorder={(request) => requests.push(request)} />)
    fireEvent.click(screen.getByRole('button', { name: '下移“课堂标题”一层' }))
    expect(requests).toEqual([{
      layerItemId: 'front',
      toIndex: 1,
      orderedLayerItemIds: ['back', 'front', 'middle'],
    }])
  })

  it('supports pointer drag ordering and batch duplicate/delete callbacks', () => {
    const props = noopProps()
    render(<CourseLayerPanel entries={entries} selectedIds={['front', 'middle']} {...props} />)
    const data = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: 'none',
      setData: (type: string, value: string) => data.set(type, value),
      getData: (type: string) => data.get(type) ?? '',
    }
    fireEvent.dragStart(screen.getByRole('button', { name: '调整“课堂标题”层级' }), { dataTransfer })
    fireEvent.drop(screen.getByRole('listitem', { name: '图层：背景说明' }), { dataTransfer })
    expect(props.onReorder).toHaveBeenCalledWith({
      layerItemId: 'front',
      toIndex: 0,
      orderedLayerItemIds: ['front', 'back', 'middle'],
    })

    fireEvent.click(screen.getByRole('button', { name: '复制所选' }))
    fireEvent.click(screen.getByRole('button', { name: '删除“课堂标题”' }))
    expect(props.onDuplicate).toHaveBeenCalledWith(['front', 'middle'])
    expect(props.onDelete).toHaveBeenCalledWith(['front', 'middle'])
  })

  it('keeps an empty state readable and disables every control on request', () => {
    const { rerender } = render(<CourseLayerPanel entries={[]} selectedIds={[]} disabled {...noopProps()} />)
    expect(screen.getByText('当前内容还没有图层，请从“元素”中添加。')).toBeInTheDocument()
    rerender(<CourseLayerPanel entries={entries} selectedIds={['front']} disabled {...noopProps()} />)
    expect(screen.getAllByRole('button').every((button) => button.hasAttribute('disabled'))).toBe(true)
  })
})
