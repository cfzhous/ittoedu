import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EffectiveLayerList,
  type EffectiveLayerItem,
  type EffectiveLayerListProps,
} from '@/renderer/ui/editor-actions/EffectiveLayerList'

afterEach(() => {
  cleanup()
})

function item(overrides: Partial<EffectiveLayerItem> & Pick<EffectiveLayerItem, 'id' | 'name' | 'sourceKind'>): EffectiveLayerItem {
  return {
    ownerKey: String(overrides.sourceKind),
    ...overrides,
  }
}

function handlers(): Pick<
  EffectiveLayerListProps,
  'onSelect' | 'onRename' | 'onReorder' | 'onToggleVisibility' | 'onToggleLock' | 'onOpenMenu'
> {
  return {
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onReorder: vi.fn(),
    onToggleVisibility: vi.fn(),
    onToggleLock: vi.fn(),
    onOpenMenu: vi.fn(),
  }
}

const compactItems: readonly EffectiveLayerItem[] = [
  item({ id: 'g1', name: '全课标题条', sourceKind: 'global', selected: true }),
  item({ id: 'sf1', name: '当前内容水印', sourceKind: 'surface' }),
  item({ id: 'sc1', name: '本页讲解文字', sourceKind: 'scene' }),
  item({ id: 'st1', name: '当前状态标注', sourceKind: 'state', hidden: true }),
  item({ id: 'f1', name: 'Flow 导读标题', sourceKind: 'flow' }),
  item({ id: 'w1', name: '世界地标', sourceKind: 'world', locked: true }),
  item({ id: 'c1', name: '镜头框 A', sourceKind: 'camera', disabled: true }),
]

function styleOf(element: Element): CSSStyleDeclaration {
  return window.getComputedStyle(element)
}

describe('EffectiveLayerList', () => {
  it('renders a compact single-line row for every source at a 1366 sidebar width', () => {
    const longName = '这是一段需要在窄侧栏里保持单行并截断的超长图层名称'.repeat(4)
    render(
      <div style={{ width: 280 }}>
        <EffectiveLayerList
          {...handlers()}
          items={[
            ...compactItems,
            item({
              id: 'long',
              name: longName,
              sourceKind: 'scene',
              ownerKey: 'scene',
            }),
          ]}
        />
      </div>,
    )

    const sources = screen.getAllByText(/^(全课|当前内容|本页|当前状态|Flow|世界|镜头)$/)
      .map((node) => node.textContent)
    expect(new Set(sources)).toEqual(new Set(['全课', '当前内容', '本页', '当前状态', 'Flow', '世界', '镜头']))

    const longRow = screen.getByTestId('effective-layer-row-long')
    const name = within(longRow).getByRole('button', { name: `本页 · ${longName}` })
    expect(name).toHaveAttribute('title', `本页 · ${longName}`)
    expect(name.textContent).toBe(longName)
    expect(name.querySelector('br')).toBeNull()

    expect(styleOf(longRow).display).toBe('flex')
    expect(styleOf(longRow).flexDirection).toBe('row')
    expect(styleOf(longRow).flexWrap).toBe('nowrap')
    expect(styleOf(longRow).writingMode).toBe('horizontal-tb')
    expect(styleOf(longRow).height).toBe('32px')
    expect(styleOf(name).whiteSpace).toBe('nowrap')
    expect(styleOf(name).textOverflow).toBe('ellipsis')
    expect(styleOf(name).overflow).toBe('hidden')
    expect(styleOf(within(longRow).getByTitle('本页')).whiteSpace).toBe('nowrap')
    expect(styleOf(longRow.querySelector('.ea-layer-row__actions')!).width).toBe('84px')
  })

  it('emits only controlled events and never reorders its own rows', () => {
    const events = handlers()
    const items = [
      item({ id: 'a', name: '上层', sourceKind: 'scene', ownerKey: 'scene-1' }),
      item({ id: 'b', name: '下层', sourceKind: 'global', ownerKey: 'global' }),
    ]
    render(<EffectiveLayerList {...events} items={items} />)

    fireEvent.click(screen.getByRole('button', { name: '本页 · 上层' }))
    expect(events.onSelect).toHaveBeenCalledWith({ id: 'a', additive: false })

    fireEvent.click(screen.getByRole('button', { name: '本页 · 上层' }), { ctrlKey: true })
    expect(events.onSelect).toHaveBeenCalledWith({ id: 'a', additive: true })

    fireEvent.click(screen.getByRole('button', { name: '隐藏“上层”' }))
    expect(events.onToggleVisibility).toHaveBeenCalledWith('a')

    fireEvent.click(screen.getByRole('button', { name: '锁定“上层”' }))
    expect(events.onToggleLock).toHaveBeenCalledWith('a')

    fireEvent.click(screen.getByRole('button', { name: '打开“上层”的更多动作' }))
    expect(events.onOpenMenu).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', trigger: 'pointer' }),
    )

    fireEvent.doubleClick(screen.getByRole('button', { name: '本页 · 上层' }))
    const rename = screen.getByRole('textbox', { name: '重命名“上层”' })
    fireEvent.change(rename, { target: { value: '新名称' } })
    fireEvent.blur(rename)
    expect(events.onRename).toHaveBeenCalledWith('a', '新名称')

    const handle = screen.getByRole('button', { name: '拖动调整“上层”层级' })
    const target = screen.getByTestId('effective-layer-row-b')
    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, value: string) {
        this.data[type] = value
      },
      getData(type: string) {
        return this.data[type] ?? ''
      },
      effectAllowed: 'move',
      dropEffect: 'move',
    }
    fireEvent.dragStart(handle, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer, clientY: 80 })

    expect(events.onReorder).toHaveBeenCalledWith({
      fromId: 'a',
      toId: 'b',
      fromOwnerKey: 'scene-1',
      toOwnerKey: 'global',
      placement: expect.stringMatching(/before|after/),
    })
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveAttribute('data-layer-id', 'a')
    expect(rows[1]).toHaveAttribute('data-layer-id', 'b')
  })

  it('keeps caller-rejected cross-owner drops in the original order', () => {
    const items = [
      item({ id: 'scene-item', name: '本页矩形', sourceKind: 'scene', ownerKey: 'scene' }),
      item({ id: 'global-item', name: '全课控制器', sourceKind: 'global', ownerKey: 'global' }),
    ]
    const onReorder = vi.fn((request: { fromOwnerKey: string; toOwnerKey: string }) => {
      expect(request.fromOwnerKey).not.toBe(request.toOwnerKey)
    })
    render(
      <EffectiveLayerList
        {...handlers()}
        items={items}
        onReorder={onReorder}
      />,
    )

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, value: string) {
        this.data[type] = value
      },
      getData(type: string) {
        return this.data[type] ?? ''
      },
      effectAllowed: 'move',
      dropEffect: 'move',
    }
    fireEvent.dragStart(screen.getByRole('button', { name: '拖动调整“本页矩形”层级' }), { dataTransfer })
    fireEvent.drop(screen.getByTestId('effective-layer-row-global-item'), { dataTransfer, clientY: 10 })

    expect(onReorder).toHaveBeenCalled()
    expect(screen.getAllByRole('listitem').map((row) => row.getAttribute('data-layer-id'))).toEqual([
      'scene-item',
      'global-item',
    ])
  })

  it('exposes selected, locked, hidden and disabled states', () => {
    render(<EffectiveLayerList {...handlers()} items={compactItems} />)

    expect(screen.getByTestId('effective-layer-row-g1')).toHaveClass('ea-layer-row--selected')
    expect(screen.getByTestId('effective-layer-row-st1')).toHaveClass('ea-layer-row--hidden')
    expect(screen.getByTestId('effective-layer-row-w1')).toHaveClass('ea-layer-row--locked')
    expect(screen.getByRole('button', { name: '解锁“世界地标”' })).toBeEnabled()
    expect(screen.getByTestId('effective-layer-row-c1')).toHaveClass('ea-layer-row--disabled')
    expect(screen.getByRole('button', { name: '隐藏“镜头框 A”' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '打开“镜头框 A”的更多动作' })).toBeDisabled()
  })

  it('supports keyboard focus, rename, reorder request and menu', () => {
    const events = handlers()
    render(
      <EffectiveLayerList
        {...events}
        items={[
          item({ id: 'one', name: '第一层', sourceKind: 'scene', ownerKey: 'scene' }),
          item({ id: 'two', name: '第二层', sourceKind: 'scene', ownerKey: 'scene' }),
        ]}
      />,
    )

    const first = screen.getByTestId('effective-layer-row-one')
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(screen.getByTestId('effective-layer-row-two')).toHaveFocus()

    fireEvent.keyDown(screen.getByTestId('effective-layer-row-two'), { key: 'Enter' })
    expect(events.onSelect).toHaveBeenCalledWith({ id: 'two', additive: false })

    fireEvent.keyDown(screen.getByTestId('effective-layer-row-two'), { key: 'F2' })
    expect(screen.getByRole('textbox', { name: '重命名“第二层”' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('textbox', { name: '重命名“第二层”' }), { key: 'Escape' })

    fireEvent.keyDown(screen.getByTestId('effective-layer-row-two'), {
      key: 'ArrowUp',
      altKey: true,
    })
    expect(events.onReorder).toHaveBeenCalledWith({
      fromId: 'two',
      toId: 'one',
      fromOwnerKey: 'scene',
      toOwnerKey: 'scene',
      placement: 'before',
    })

    fireEvent.keyDown(screen.getByTestId('effective-layer-row-two'), { key: 'F10', shiftKey: true })
    expect(events.onOpenMenu).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'two', trigger: 'keyboard' }),
    )
  })
})
