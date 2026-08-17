import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import './editorActions.css'

/**
 * Narrow snapshot bag for the menu primitive. T02 owns the production
 * `EditorSelectionSnapshot`; pass that object as `TSnapshot` instead of
 * importing T02 from this file.
 */
export interface EditorContextMenuSnapshot {
  readonly sessionId: string
  readonly projectRevision: number
  readonly locationId: string
  readonly surfaceKind: string
  readonly owner: string
  readonly authoringAddresses: readonly string[]
  readonly selectedIds: readonly string[]
  readonly focusKind: string
}

export interface EditorContextMenuAction {
  readonly id: string
  readonly label: string
  readonly enabled: boolean
  readonly reason?: string
}

export interface EditorContextMenuPoint {
  readonly x: number
  readonly y: number
}

export type EditorContextMenuOpenRequest =
  | {
      readonly kind: 'pointer'
      readonly clientX: number
      readonly clientY: number
    }
  | {
      readonly kind: 'keyboard'
      readonly clientX: number
      readonly clientY: number
    }

export interface EditorContextMenuProps<TSnapshot = EditorContextMenuSnapshot> {
  readonly snapshot: TSnapshot
  readonly actions: readonly EditorContextMenuAction[]
  readonly onInvoke: (actionId: string, snapshot: TSnapshot) => void
  readonly children?: ReactNode
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly onOpenRequest?: (
    request: EditorContextMenuOpenRequest,
  ) => TSnapshot | false | void
  readonly anchorPoint?: EditorContextMenuPoint
  readonly label?: string
}

interface MenuSession<TSnapshot> {
  readonly snapshot: TSnapshot
  readonly x: number
  readonly y: number
}

const VIEWPORT_PADDING = 8

function isMenuKey(event: { key: string; shiftKey: boolean }): boolean {
  if (event.key === 'ContextMenu' || event.key === 'Menu') return true
  return event.key === 'F10' && event.shiftKey
}

function clampMenuToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  const maxLeft = Math.max(VIEWPORT_PADDING, viewportWidth - width - VIEWPORT_PADDING)
  const maxTop = Math.max(VIEWPORT_PADDING, viewportHeight - height - VIEWPORT_PADDING)
  return {
    left: Math.min(Math.max(x, VIEWPORT_PADDING), maxLeft),
    top: Math.min(Math.max(y, VIEWPORT_PADDING), maxTop),
  }
}

function keyboardAnchorFromTarget(target: EventTarget | null): EditorContextMenuPoint {
  if (target instanceof HTMLElement) {
    const rect = target.getBoundingClientRect()
    return { x: rect.left, y: rect.bottom }
  }
  return { x: 8, y: 8 }
}

export function toEditorContextMenuActions(
  items: readonly {
    readonly actionId: string
    readonly enabled: boolean
    readonly reason: string
    readonly label?: string
  }[],
): EditorContextMenuAction[] {
  return items.map((item) => ({
    id: item.actionId,
    label: item.label ?? item.actionId,
    enabled: item.enabled,
    reason: item.reason,
  }))
}

export function EditorContextMenu<TSnapshot = EditorContextMenuSnapshot>(
  props: EditorContextMenuProps<TSnapshot>,
): JSX.Element {
  const {
    snapshot,
    actions,
    onInvoke,
    children,
    open: openProp,
    onOpenChange,
    onOpenRequest,
    anchorPoint,
    label = '编辑动作',
  } = props

  const menuId = useId()
  const isControlled = openProp !== undefined
  const [uncontrolledSession, setUncontrolledSession] = useState<MenuSession<TSnapshot> | null>(
    null,
  )
  const [controlledSession, setControlledSession] = useState<MenuSession<TSnapshot> | null>(() =>
    openProp
      ? {
          snapshot,
          x: anchorPoint?.x ?? 0,
          y: anchorPoint?.y ?? 0,
        }
      : null,
  )
  const [position, setPosition] = useState({
    left: anchorPoint?.x ?? 0,
    top: anchorPoint?.y ?? 0,
  })
  const [activeIndex, setActiveIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const session = isControlled ? controlledSession : uncontrolledSession
  const isOpen = isControlled ? Boolean(openProp) : session !== null
  const boundSnapshot = session?.snapshot ?? snapshot

  const rememberTrigger = useCallback(() => {
    const active = document.activeElement
    restoreFocusRef.current = active instanceof HTMLElement ? active : null
  }, [])

  const restoreTriggerFocus = useCallback(() => {
    const trigger = restoreFocusRef.current
    restoreFocusRef.current = null
    if (trigger && document.contains(trigger)) {
      trigger.focus()
    }
  }, [])

  const closeMenu = useCallback(() => {
    if (isControlled) {
      setControlledSession(null)
    } else {
      setUncontrolledSession(null)
    }
    onOpenChange?.(false)
    restoreTriggerFocus()
  }, [isControlled, onOpenChange, restoreTriggerFocus])

  const openAt = useCallback(
    (nextSnapshot: TSnapshot, point: EditorContextMenuPoint) => {
      rememberTrigger()
      const nextSession = { snapshot: nextSnapshot, x: point.x, y: point.y }
      if (isControlled) {
        setControlledSession(nextSession)
      } else {
        setUncontrolledSession(nextSession)
      }
      setPosition({ left: point.x, top: point.y })
      setActiveIndex(0)
      onOpenChange?.(true)
    },
    [isControlled, onOpenChange, rememberTrigger],
  )

  const resolveOpen = useCallback(
    (request: EditorContextMenuOpenRequest): boolean => {
      const requested = onOpenRequest?.(request)
      if (requested === false) return false
      const nextSnapshot = requested === undefined ? snapshot : requested
      openAt(nextSnapshot, { x: request.clientX, y: request.clientY })
      return true
    },
    [onOpenRequest, openAt, snapshot],
  )

  useLayoutEffect(() => {
    if (!isControlled) return
    if (openProp) {
      setControlledSession((current) =>
        current ?? {
          snapshot,
          x: anchorPoint?.x ?? 0,
          y: anchorPoint?.y ?? 0,
        },
      )
      return
    }
    setControlledSession(null)
  }, [anchorPoint?.x, anchorPoint?.y, isControlled, openProp, snapshot])

  useLayoutEffect(() => {
    if (!isOpen || !session || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    setPosition(
      clampMenuToViewport(
        session.x,
        session.y,
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight,
      ),
    )
  }, [isOpen, session])

  useLayoutEffect(() => {
    if (!isOpen) return
    const item = itemRefs.current[activeIndex] ?? itemRefs.current[0]
    item?.focus()
  }, [activeIndex, isOpen, actions.length])

  useEffect(() => {
    if (!isOpen) return
    const openedAt = performance.now()
    const onPointerDown = (event: PointerEvent) => {
      if (performance.now() - openedAt < 16) return
      const target = event.target
      if (target instanceof Node && menuRef.current?.contains(target)) return
      closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeMenu()
      }
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [closeMenu, isOpen])

  const invokeAction = useCallback(
    (action: EditorContextMenuAction) => {
      if (!action.enabled) return
      onInvoke(action.id, boundSnapshot)
      closeMenu()
    },
    [boundSnapshot, closeMenu, onInvoke],
  )

  const moveActive = useCallback(
    (delta: number) => {
      if (actions.length === 0) return
      setActiveIndex((current) => {
        const next = (current + delta + actions.length) % actions.length
        return next
      })
    },
    [actions.length],
  )

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(0, actions.length - 1))
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMenu()
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      const action = actions[activeIndex]
      if (action) invokeAction(action)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      closeMenu()
    }
  }

  const onHostContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    resolveOpen({
      kind: 'pointer',
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }

  const onHostKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!isMenuKey(event)) return
    event.preventDefault()
    event.stopPropagation()
    const point = keyboardAnchorFromTarget(event.currentTarget)
    resolveOpen({
      kind: 'keyboard',
      clientX: point.x,
      clientY: point.y,
    })
  }

  const menu = isOpen
    ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          className="ea-context-menu"
          role="menu"
          aria-label={label}
          data-testid="editor-context-menu"
          style={{ left: position.left, top: position.top }}
          onKeyDown={onMenuKeyDown}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <ul className="ea-context-menu__list">
            {actions.map((action, index) => {
              const reasonId = `${menuId}-${action.id}-reason`
              return (
                <li key={action.id}>
                  <button
                    ref={(node) => {
                      itemRefs.current[index] = node
                    }}
                    type="button"
                    role="menuitem"
                    className="ea-context-menu__item"
                    data-testid={`editor-context-menu-item-${action.id}`}
                    tabIndex={index === activeIndex ? 0 : -1}
                    aria-disabled={!action.enabled}
                    aria-describedby={action.reason ? reasonId : undefined}
                    title={action.reason}
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      invokeAction(action)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      event.stopPropagation()
                      invokeAction(action)
                    }}
                  >
                    <span className="ea-context-menu__item-label">{action.label}</span>
                    {action.reason ? (
                      <span id={reasonId} className="ea-context-menu__item-reason">
                        {action.reason}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>,
        document.body,
      )
    : null

  if (!children) {
    return <>{menu}</>
  }

  return (
    <div
      className="ea-context-menu-host"
      data-testid="editor-context-menu-host"
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-controls={isOpen ? menuId : undefined}
      onContextMenu={onHostContextMenu}
      onKeyDown={onHostKeyDown}
    >
      {children}
      {menu}
    </div>
  )
}

export { clampMenuToViewport }
