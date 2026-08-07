import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import manifest from '../../examples/math-motion-function-lab/manifest.json'
import type {
  MotionFunctionLabLifecycle,
  MotionFunctionLabProps,
} from '../../examples/math-motion-function-lab/runtime.entry'

interface RuntimeDefinition {
  id: string
  runtimeApiVersion: 4
  create(context: Record<string, unknown>): MotionFunctionLabLifecycle
}

let definition: RuntimeDefinition

beforeEach(async () => {
  vi.resetModules()
  definition = undefined as unknown as RuntimeDefinition
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('CoursewareComponent', {
    define(candidate: RuntimeDefinition) {
      definition = candidate
    },
  })
  await import('../../examples/math-motion-function-lab/runtime.entry')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function createLab(mode: 'edit' | 'preview' | 'capture' = 'preview') {
  const root = document.createElement('div')
  document.body.append(root)
  const emit = vi.fn()
  const props = structuredClone(manifest.defaultProps) as MotionFunctionLabProps
  const lifecycle = definition.create({
    runtimeApiVersion: 4,
    renderMode: 'dom',
    instanceId: 'unit-test',
    width: 1140,
    height: 452,
    mode,
    props,
    scope: 'scene',
    dom: { root },
    emit,
  })
  return { root, emit, props, lifecycle }
}

function moveSlider(root: HTMLElement, value: number): void {
  const slider = root.querySelector<HTMLInputElement>('input[type="range"]')!
  slider.value = String(value)
  slider.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('motion-function-lab linked-graph runtime', () => {
  it('registers the course-specific Component API 4 definition', () => {
    expect(definition.id).toBe('com.alepha.math.motion-function-lab')
    expect(definition.runtimeApiVersion).toBe(4)
  })

  it('links the three checkpoints and emits a truthful mastery payload', () => {
    const { root, emit } = createLab()
    const maximumLabel = [...root.querySelectorAll('text')].find(
      (element) => element.textContent === 'Smax = 6',
    )!
    expect(maximumLabel).toHaveAttribute('visibility', 'hidden')
    moveSlider(root, 4)
    moveSlider(root, 2)
    const button = root.querySelector<HTMLButtonElement>('button')!
    expect(button).toBeEnabled()
    button.click()
    expect(maximumLabel).toHaveAttribute('visibility', 'visible')
    expect(emit).toHaveBeenCalledOnce()
    expect(emit).toHaveBeenCalledWith('linked.mastered', expect.objectContaining({
      t: 2,
      area: 6,
      maximum: { input: 2, value: 6 },
      visited: [0, 2, 4],
    }))
  })

  it('keeps the learner in exploration when the confirmed point is not the peak', () => {
    const { root, emit } = createLab()
    moveSlider(root, 4)
    moveSlider(root, 2)
    moveSlider(root, 1)
    root.querySelector<HTMLButtonElement>('button')!.click()
    expect(emit).not.toHaveBeenCalled()
    expect(root.querySelector('[aria-live="polite"]')).toHaveTextContent('当前点还不是最高点')
  })

  it('exposes a keyboard-capable range and clear live value semantics', () => {
    const { root, emit } = createLab()
    const slider = root.querySelector<HTMLInputElement>('input[type="range"]')!
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '4')
    expect(slider).toHaveAttribute('step', '0.1')
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    expect(slider).toHaveAttribute('aria-valuenow', '4')
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }))
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }))
    expect(slider).toHaveAttribute('aria-valuenow', '2')
    expect(slider).toHaveAttribute('aria-valuetext', '时间 t 2，面积 S(t) 6')
    const button = root.querySelector<HTMLButtonElement>('button')!
    expect(button).toBeEnabled()
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(emit).toHaveBeenCalledWith('linked.mastered', expect.objectContaining({ t: 2, area: 6 }))
  })

  it('supports prop edits, deterministic proved capture, visibility and suspension', () => {
    const { root, emit, props, lifecycle } = createLab()
    const slider = root.querySelector<HTMLInputElement>('input[type="range"]')!
    lifecycle.suspend()
    expect(slider).toBeDisabled()
    lifecycle.resume()
    expect(slider).toBeEnabled()
    lifecycle.setVisible(false)
    expect(root).toHaveStyle({ display: 'none' })
    lifecycle.setVisible(true)
    lifecycle.resize(900, 400)
    expect(root).toHaveStyle({ width: '900px', height: '400px' })
    lifecycle.updateProps({
      ...props,
      phase: 'proved',
      content: { ...props.content, confirmedLabel: '结论已经核验', nextLabel: '进入下一幕' },
    })
    lifecycle.prepareCapture()
    expect(slider.value).toBe('2')
    expect(root.querySelector('button')).toHaveTextContent('进入下一幕')
    root.querySelector<HTMLButtonElement>('button')!.click()
    expect(emit).toHaveBeenCalledWith('navigation.next', { mode: 'linked-graph' })
    expect(root.dataset.captureReady).toBe('true')
  })

  it('releases listeners and DOM on destroy', () => {
    const { root, lifecycle } = createLab()
    lifecycle.destroy()
    expect(root).toBeEmptyDOMElement()
    expect(() => lifecycle.destroy()).not.toThrow()
  })
})
