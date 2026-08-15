import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TeacherControllerButton } from '../../src/shared/projectTypes'
import {
  createTeacherControllerLayout,
  type TeacherControllerViewStatus,
} from '../../src/shared/teacherControllerLayout'
import {
  TeacherControllerDom,
  type TeacherControllerDomSession,
} from '../../src/player/teacherControllerDom'
import {
  TEACHER_CONTROLLER_KEYBOARD_STEP,
  type TeacherControllerRuntimeNode,
  type TeacherControllerSessionOffset,
} from '../../src/player/teacherControllerRuntimeSession'

function buttons(): TeacherControllerButton[] {
  return [
    { id: 'previous', action: { type: 'scene.previous' }, label: '上一页', visible: true },
    { id: 'next', action: { type: 'scene.next' }, label: '下一页', visible: true },
    { id: 'sound', action: { type: 'audio.toggle-mute' }, label: '声音', visible: true },
    { id: 'fullscreen', action: { type: 'player.fullscreen.toggle' }, label: '全屏', visible: true },
  ]
}

function node(overrides: Partial<TeacherControllerRuntimeNode> = {}): TeacherControllerRuntimeNode {
  return {
    title: '教师控制台',
    x: 190,
    y: 638,
    width: 900,
    height: 64,
    rotation: 0,
    compact: false,
    showSceneProgress: true,
    collapsible: true,
    buttons: buttons(),
    style: {
      backgroundColor: '#172033',
      backgroundOpacity: 0.94,
      accentColor: '#e7b85c',
      textColor: '#f8fafc',
      cornerRadius: 16,
    },
    ...overrides,
  }
}

interface HarnessOptions {
  initialSession?: Partial<TeacherControllerDomSession>
  status?: TeacherControllerViewStatus
}

interface Harness {
  controller: TeacherControllerDom
  container: HTMLElement
  root: HTMLElement
  onAction: ReturnType<typeof vi.fn>
  onSessionChange: ReturnType<typeof vi.fn>
  status: TeacherControllerViewStatus
  setStatus(status: TeacherControllerViewStatus): void
  session(): TeacherControllerDomSession
  destroy(): void
}

function harness(options: HarnessOptions = {}): Harness {
  let session: TeacherControllerDomSession = {
    offset: { dx: 0, dy: 0 },
    collapsed: false,
    ...options.initialSession,
  }
  let status: TeacherControllerViewStatus = options.status ?? { muted: false, fullscreen: false }
  const onAction = vi.fn()
  const onSessionChange = vi.fn((next: TeacherControllerDomSession) => { session = next })
  const container = document.createElement('div')
  container.style.position = 'absolute'
  const controller = new TeacherControllerDom({
    node: node(),
    container,
    canvas: { width: 1280, height: 720 },
    scenes: [
      { id: 'scene-intro', name: '课程导入' },
      { id: 'scene-practice', name: '课堂练习' },
    ],
    getCurrentSceneId: () => 'scene-practice',
    getStateLabel: () => '答题中',
    getStatus: () => status,
    getSession: () => session,
    onSessionChange,
    onAction,
    getInteractive: () => true,
  })
  const root = controller.rootElement
  // jsdom does not lay out; provide the fixed logical frame for hit testing
  // and the drag delta mapping.
  mockRect(root, { left: 0, top: 0, width: 900, height: 64 })
  mockRect(container, { left: 0, top: 0, width: 900, height: 64 })
  return {
    controller,
    container,
    root,
    onAction,
    onSessionChange,
    status,
    setStatus(next) { status = next },
    session: () => session,
    destroy: () => controller.destroy(),
  }
}

function mockRect(element: HTMLElement, rect: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({}),
    }),
  })
}

function pointer(
  element: HTMLElement,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  clientX: number,
  clientY: number,
  pointerId = 1,
): void {
  element.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    pointerId,
    clientX,
    clientY,
    pointerType: 'mouse',
  }))
}

function center(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('TeacherControllerDom rendering', () => {
  it('renders title, progress and buttons with live mute/fullscreen labels', () => {
    const { root } = harness()
    expect(root.className).toBe('slide-native-teacher-controller')
    expect(root.querySelector('.slide-teacher-controller-title')).toHaveTextContent('教师控制台')
    const progress = root.querySelector('.slide-teacher-controller-progress')
    expect(progress).toHaveTextContent('2 / 2 · 课堂练习 · 答题中')
    const labels = [...root.querySelectorAll<HTMLButtonElement>('[data-controller-button-id]')]
      .map((button) => button.textContent)
    expect(labels).toEqual(['上一页', '下一页', '声音 · 开', '全屏'])
    expect(root.querySelector('[data-controller-button-id="sound"]'))
      .toHaveTextContent('声音 · 开')
  })

  it('refreshes the fullscreen label from fullscreenchange', () => {
    const { root, setStatus } = harness()
    expect(root.querySelector('[data-controller-button-id="fullscreen"]'))
      .toHaveTextContent('全屏')
    setStatus({ muted: false, fullscreen: true })
    window.dispatchEvent(new Event('fullscreenchange'))
    expect(root.querySelector('[data-controller-button-id="fullscreen"]'))
      .toHaveTextContent('退出全屏')
  })

  it('renders only the collapse pill when collapsed', () => {
    const { root } = harness({ initialSession: { collapsed: true } })
    expect(root.querySelector('[data-controller-button-id]')).toBeNull()
    expect(root.querySelector('.slide-teacher-controller-title')).toBeNull()
    const collapse = root.querySelector<HTMLButtonElement>('[data-teacher-controller-collapse]')
    expect(collapse).not.toBeNull()
    expect(collapse).toHaveTextContent('展')
    expect(collapse).toHaveAttribute('aria-label', '展开教师控制器')
  })
})

describe('TeacherControllerDom collapse and drag sessions', () => {
  it('toggles collapse on the pill and reports the re-constrained session', () => {
    const { controller, root, onSessionChange, session } = harness()
    const layout = createTeacherControllerLayout(node(), 900, 64)
    const pill = layout.collapse!
    const { x, y } = center(pill)
    // A real tap on the pill (buttons are pointer-transparent) toggles.
    pointer(root, 'pointerdown', x, y)
    pointer(root, 'pointerup', x, y)
    expect(controller.collapsed).toBe(true)
    expect(onSessionChange).toHaveBeenCalledWith(expect.objectContaining({ collapsed: true }))
    // The collapsed pill reached the canvas edge is still constrained.
    expect(session().collapsed).toBe(true)
    expect(root.querySelector('[data-controller-button-id]')).toBeNull()
  })

  it('moves the panel with a pointer drag and never activates a button', () => {
    const { controller, root, onAction, onSessionChange, session } = harness()
    const next = [...root.querySelectorAll<HTMLButtonElement>('[data-controller-button-id]')]
      .find((button) => button.dataset.controllerButtonId === 'next')!
    const buttonCenter = center({
      x: Number.parseFloat(next.style.left),
      y: Number.parseFloat(next.style.top),
      width: Number.parseFloat(next.style.width),
      height: Number.parseFloat(next.style.height),
    })
    pointer(root, 'pointerdown', buttonCenter.x, buttonCenter.y)
    pointer(root, 'pointermove', buttonCenter.x + 30, buttonCenter.y + 18)
    pointer(root, 'pointerup', buttonCenter.x + 30, buttonCenter.y + 18)
    // A drag that crosses the threshold moves, not clicks.
    expect(onAction).not.toHaveBeenCalled()
    expect(controller.offset.dx).toBeGreaterThan(0)
    expect(controller.offset.dy).toBeGreaterThan(0)
    expect(onSessionChange).toHaveBeenCalledTimes(1)
    expect(session().offset.dx).toBeCloseTo(30 * 1280 / 900, 5)
  })

  it('activates a button on a clean tap and keeps the offset unchanged', () => {
    const { root, onAction, onSessionChange } = harness()
    const next = [...root.querySelectorAll<HTMLButtonElement>('[data-controller-button-id]')]
      .find((button) => button.dataset.controllerButtonId === 'next')!
    const buttonCenter = center({
      x: Number.parseFloat(next.style.left),
      y: Number.parseFloat(next.style.top),
      width: Number.parseFloat(next.style.width),
      height: Number.parseFloat(next.style.height),
    })
    pointer(root, 'pointerdown', buttonCenter.x, buttonCenter.y)
    pointer(root, 'pointerup', buttonCenter.x, buttonCenter.y)
    expect(onAction).toHaveBeenCalledOnce()
    expect(onAction).toHaveBeenCalledWith({ type: 'scene.next' })
    expect(onSessionChange).not.toHaveBeenCalled()
  })

  it('moves the controller with Alt plus arrow keys', () => {
    const { root, onSessionChange, session } = harness()
    root.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      bubbles: true,
    }))
    expect(onSessionChange).toHaveBeenCalledOnce()
    expect(session().offset).toEqual({
      dx: TEACHER_CONTROLLER_KEYBOARD_STEP,
      dy: 0,
    } satisfies TeacherControllerSessionOffset)
  })

  it('ignores Alt arrows in the opposite modifier shape', () => {
    const { root, onSessionChange } = harness()
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    root.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      altKey: true,
      ctrlKey: true,
      bubbles: true,
    }))
    expect(onSessionChange).not.toHaveBeenCalled()
  })

  it('destroys the controller and releases the fullscreenchange listener', () => {
    const { controller, container, root, setStatus } = harness()
    controller.destroy()
    expect(root.parentElement).toBeNull()
    expect(container.childElementCount).toBe(0)
    // No re-render after destroy: a status change must not resurrect the root.
    setStatus({ muted: false, fullscreen: true })
    window.dispatchEvent(new Event('fullscreenchange'))
    expect(root.parentElement).toBeNull()
  })
})
