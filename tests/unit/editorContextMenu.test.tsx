import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EditorContextMenu,
  clampMenuToViewport,
  toEditorContextMenuActions,
  type EditorContextMenuAction,
  type EditorContextMenuSnapshot,
} from '@/renderer/ui/editor-actions/EditorContextMenu'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function snapshot(overrides: Partial<EditorContextMenuSnapshot> = {}): EditorContextMenuSnapshot {
  return {
    sessionId: 'session-1',
    projectRevision: 4,
    locationId: 'loc-slide-1',
    surfaceKind: 'slide',
    owner: 'scene',
    authoringAddresses: ['courseware://authoring/p/scene/slide/s1/native/title'],
    selectedIds: ['title'],
    focusKind: 'none',
    ...overrides,
  }
}

const actions: readonly EditorContextMenuAction[] = [
  { id: 'copy', label: '复制', enabled: true },
  { id: 'delete', label: '删除', enabled: false, reason: '当前项已锁定' },
  { id: 'lock', label: '锁定', enabled: true },
]

function renderMenu(
  props: Partial<ComponentProps<typeof EditorContextMenu<EditorContextMenuSnapshot>>> & {
    children?: ReactNode
  } = {},
) {
  const onInvoke = vi.fn()
  const view = render(
    <EditorContextMenu
      snapshot={snapshot()}
      actions={actions}
      onInvoke={onInvoke}
      {...props}
    >
      {props.children ?? <button type="button">画布目标</button>}
    </EditorContextMenu>,
  )
  return { ...view, onInvoke }
}

describe('EditorContextMenu', () => {
  it('maps T02 availability rows onto the menu action props', () => {
    expect(toEditorContextMenuActions([
      { actionId: 'copy', enabled: true, reason: '', label: '复制' },
      { actionId: 'delete', enabled: false, reason: '当前项已锁定', label: '删除' },
    ])).toEqual([
      { id: 'copy', label: '复制', enabled: true, reason: '' },
      { id: 'delete', label: '删除', enabled: false, reason: '当前项已锁定' },
    ])
  })

  it('opens from a mouse right-click and invokes with the bound snapshot', () => {
    const { onInvoke } = renderMenu()
    fireEvent.contextMenu(screen.getByRole('button', { name: '画布目标' }), {
      clientX: 24,
      clientY: 36,
    })

    expect(screen.getByRole('menu', { name: '编辑动作' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '复制' }))
    expect(onInvoke).toHaveBeenCalledTimes(1)
    expect(onInvoke).toHaveBeenCalledWith('copy', snapshot())
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('opens from Shift+F10 and the Menu key', () => {
    const { rerender, onInvoke } = renderMenu()
    const trigger = screen.getByRole('button', { name: '画布目标' })
    fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    rerender(
      <EditorContextMenu snapshot={snapshot()} actions={actions} onInvoke={onInvoke}>
        <button type="button">画布目标</button>
      </EditorContextMenu>,
    )
    fireEvent.keyDown(screen.getByRole('button', { name: '画布目标' }), { key: 'ContextMenu' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })

    fireEvent.keyDown(screen.getByRole('button', { name: '画布目标' }), { key: 'Menu' })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('shows the disabled reason and cannot invoke that action by click or keyboard', () => {
    const { onInvoke } = renderMenu()
    fireEvent.contextMenu(screen.getByRole('button', { name: '画布目标' }))

    const disabled = screen.getByRole('menuitem', { name: /删除/ })
    expect(disabled).toHaveAttribute('aria-disabled', 'true')
    expect(disabled).toHaveTextContent('当前项已锁定')
    expect(disabled).toHaveAttribute('title', '当前项已锁定')

    fireEvent.click(disabled)
    fireEvent.keyDown(disabled, { key: 'Enter' })
    fireEvent.keyDown(disabled, { key: ' ' })
    expect(onInvoke).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('moves with arrow keys and activates the focused enabled item with Enter or Space', () => {
    const { onInvoke } = renderMenu()
    fireEvent.contextMenu(screen.getByRole('button', { name: '画布目标' }))
    const menu = screen.getByRole('menu')

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    fireEvent.keyDown(menu, { key: 'Enter' })
    expect(onInvoke).not.toHaveBeenCalled()

    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    fireEvent.keyDown(menu, { key: ' ' })
    expect(onInvoke).toHaveBeenCalledWith('lock', snapshot())
  })

  it('keeps the snapshot captured at open even if props or hover change', () => {
    const first = snapshot({ selectedIds: ['a', 'b'], projectRevision: 7 })
    const hovered = snapshot({ selectedIds: ['ghost'], projectRevision: 99 })
    const onInvoke = vi.fn()
    const { rerender } = render(
      <EditorContextMenu snapshot={first} actions={actions} onInvoke={onInvoke}>
        <button type="button">多选集合</button>
      </EditorContextMenu>,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: '多选集合' }))
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '锁定' }))

    rerender(
      <EditorContextMenu snapshot={hovered} actions={actions} onInvoke={onInvoke}>
        <button type="button">多选集合</button>
      </EditorContextMenu>,
    )
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: '复制' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '复制' }))

    expect(onInvoke).toHaveBeenCalledWith('copy', first)
    expect(onInvoke).not.toHaveBeenCalledWith('copy', hovered)
  })

  it('lets the caller supply the snapshot after a pre-select open request', () => {
    const selected = snapshot({ selectedIds: ['after-select'] })
    const onInvoke = vi.fn()
    render(
      <EditorContextMenu
        snapshot={snapshot({ selectedIds: [] })}
        actions={actions}
        onInvoke={onInvoke}
        onOpenRequest={() => selected}
      >
        <button type="button">未选中目标</button>
      </EditorContextMenu>,
    )

    fireEvent.contextMenu(screen.getByRole('button', { name: '未选中目标' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '复制' }))
    expect(onInvoke).toHaveBeenCalledWith('copy', selected)
  })

  it('does not open when onOpenRequest cancels', () => {
    renderMenu({ onOpenRequest: () => false })
    fireEvent.contextMenu(screen.getByRole('button', { name: '画布目标' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('restores the trigger focus after Escape', () => {
    renderMenu()
    const trigger = screen.getByRole('button', { name: '画布目标' })
    trigger.focus()
    fireEvent.contextMenu(trigger)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(trigger).not.toHaveFocus()

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('keeps the menu inside the viewport', () => {
    vi.stubGlobal('innerWidth', 400)
    vi.stubGlobal('innerHeight', 300)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
      if (this.getAttribute('role') === 'menu') {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 180,
          bottom: 160,
          width: 180,
          height: 160,
          toJSON() {
            return {}
          },
        } as DOMRect
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 40,
        bottom: 20,
        width: 40,
        height: 20,
        toJSON() {
          return {}
        },
      } as DOMRect
    })

    render(
      <EditorContextMenu
        open
        snapshot={snapshot()}
        actions={actions}
        onInvoke={vi.fn()}
        anchorPoint={{ x: 390, y: 280 }}
      />,
    )

    const menu = screen.getByRole('menu')
    const left = Number.parseFloat(menu.style.left)
    const top = Number.parseFloat(menu.style.top)
    expect(left + 180).toBeLessThanOrEqual(400)
    expect(top + 160).toBeLessThanOrEqual(300)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(top).toBeGreaterThanOrEqual(8)
    expect(clampMenuToViewport(390, 280, 180, 160, 400, 300)).toEqual({ left: 212, top: 132 })
  })
})
