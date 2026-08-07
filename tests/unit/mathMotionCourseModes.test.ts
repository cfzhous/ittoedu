import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  MotionFunctionLabLifecycle,
  MotionFunctionLabProps,
} from '../../examples/math-motion-function-lab/runtime.entry'
import { BASE_LINKED_GRAPH_MODEL, VERIFIED_MATH_TRUTHS } from '../../examples/math-motion-function-lab/mathModel'

interface RuntimeDefinition {
  id: string
  runtimeApiVersion: 4
  create(context: Record<string, unknown>): MotionFunctionLabLifecycle
}

const palette = {
  paper: '#FBF8F1',
  ink: '#16191F',
  muted: '#74777C',
  line: '#C9CDD2',
  blue: '#145DCE',
  blueSoft: '#DCE9FF',
  red: '#E04424',
  redSoft: '#F8D9CF',
  focus: '#0A53BE',
}

const courseModel = {
  base: BASE_LINKED_GRAPH_MODEL,
  domainVariant: {
    ...VERIFIED_MATH_TRUTHS.domainVariant,
    domain: [...VERIFIED_MATH_TRUTHS.domainVariant.domain] as [number, number],
  },
  transfer: {
    ...VERIFIED_MATH_TRUTHS.transfer,
    domain: [...VERIFIED_MATH_TRUTHS.transfer.domain] as [number, number],
  },
}

let definition: RuntimeDefinition

beforeEach(async () => {
  vi.resetModules()
  document.body.replaceChildren()
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
  document.body.replaceChildren()
})

function courseContent(): Record<string, string> {
  return new Proxy<Record<string, string>>({}, {
    get(_target, property) {
      return typeof property === 'string' ? property : ''
    },
  })
}

function createMode(
  mode: Exclude<MotionFunctionLabProps['mode'], 'linked-graph'>,
  phase: string,
) {
  const root = document.createElement('div')
  document.body.append(root)
  const emit = vi.fn()
  const values = new Map<string, unknown>()
  const courseState = {
    get<T>(key: string) {
      return values.get(key) as T | undefined
    },
    set(key: string, value: unknown) {
      values.set(key, value)
    },
  }
  const props = {
    mode,
    phase,
    model: courseModel,
    content: courseContent(),
    palette,
    reducedMotion: false,
  } as MotionFunctionLabProps
  const lifecycle = definition.create({
    runtimeApiVersion: 4,
    renderMode: 'dom',
    instanceId: `unit-${mode}`,
    width: 1138,
    height: 452,
    mode: 'preview',
    props,
    scope: 'scene',
    dom: { root },
    emit,
    courseState,
  })
  return { root, emit, values, props, lifecycle }
}

function clickByText(root: HTMLElement, text: string): void {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')]
    .find((element) => element.textContent === text)
  expect(button, `button ${text}`).toBeDefined()
  button!.click()
}

function selectByFocus(root: HTMLElement, focusKey: string, value: string): void {
  const select = root.querySelector<HTMLSelectElement>(`select[data-focus-key="${focusKey}"]`)
  expect(select, `select ${focusKey}`).toBeDefined()
  select!.value = value
  select!.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('motion-function-lab structured course modes', () => {
  it('locks a prediction without grading it and stores only the selected prediction', () => {
    const { root, emit, values } = createMode('prediction', 'prediction_open')
    clickByText(root, 'optionMiddle')
    clickByText(root, 'lockLabel')
    expect(emit).toHaveBeenCalledWith('prediction.locked', { selection: 'middle' })
    expect(values.get('mathMotion.prediction')).toBe('middle')
    expect(values.get('mathMotion.completedBeats')).toEqual(['prediction'])
    clickByText(root, 'nextLabel')
    expect(emit).toHaveBeenCalledWith('navigation.next', { mode: 'prediction' })
  })

  it('emits repair and completion for constraint classification', () => {
    const { root, emit } = createMode('constraints', 'constraints_attempt')
    selectByFocus(root, 'constraint-speed', 'variable')
    selectByFocus(root, 'constraint-time', 'constant')
    selectByFocus(root, 'constraint-domain', 'range')
    selectByFocus(root, 'constraint-area', 'target')
    clickByText(root, 'submitLabel')
    expect(emit).toHaveBeenCalledWith('constraints.repair', expect.objectContaining({
      incorrect: ['speed', 'time'],
    }))

    selectByFocus(root, 'constraint-speed', 'constant')
    selectByFocus(root, 'constraint-time', 'variable')
    clickByText(root, 'submitLabel')
    expect(emit).toHaveBeenCalledWith('constraints.completed', expect.objectContaining({
      classifications: { speed: 'constant', time: 'variable', domain: 'range', area: 'target' },
    }))
  })

  it('repairs distractors before accepting the single-source model', () => {
    const { root, emit } = createMode('model', 'model_attempt')
    selectByFocus(root, 'model-ap', 'apReverse')
    selectByFocus(root, 'model-bq', 'bqCorrect')
    selectByFocus(root, 'model-domain', 'domainCorrect')
    selectByFocus(root, 'model-area', 'areaDouble')
    clickByText(root, 'submitLabel')
    expect(emit).toHaveBeenCalledWith('model.repair', expect.objectContaining({
      incorrect: ['ap', 'area'],
    }))

    selectByFocus(root, 'model-ap', 'apCorrect')
    selectByFocus(root, 'model-area', 'areaCorrect')
    clickByText(root, 'submitLabel')
    expect(emit).toHaveBeenCalledWith('model.completed', expect.objectContaining({
      selections: {
        ap: 'apCorrect',
        bq: 'bqCorrect',
        domain: 'domainCorrect',
        area: 'areaCorrect',
      },
    }))
  })

  it('rejects the out-of-domain vertex and accepts 16 at t = 4', () => {
    const { root, emit } = createMode('domain', 'domain_attempt')
    clickByText(root, 'optionVertex')
    clickByText(root, 'submitLabel')
    expect(emit).toHaveBeenCalledWith('domain.repair', expect.objectContaining({ selection: 'vertex' }))
    clickByText(root, 'optionEndpoint')
    clickByText(root, 'submitLabel')
    expect(emit).toHaveBeenCalledWith('domain.completed', expect.objectContaining({
      maximum: { input: 4, value: 16 },
    }))
  })

  it('tracks transfer hints and completes at 12 with the pair (4, 3)', () => {
    const { root, emit, values } = createMode('transfer', 'transfer_attempt')
    clickByText(root, 'hintLabel')
    expect(values.get('mathMotion.hintCount')).toBe(1)
    expect(emit).toHaveBeenCalledWith('transfer.hint', { hintCount: 1 })
    selectByFocus(root, 'transfer-formula', 'formulaTriangle')
    selectByFocus(root, 'transfer-result', 'resultVertex')
    clickByText(root, 'submitLabel')
    expect(emit).toHaveBeenCalledWith('transfer.repair', expect.objectContaining({
      incorrect: ['formula', 'result'],
      hintCount: 1,
    }))
    expect(values.get('mathMotion.hintCount')).toBe(1)

    selectByFocus(root, 'transfer-formula', 'formulaCorrect')
    selectByFocus(root, 'transfer-result', 'resultCorrect')
    clickByText(root, 'submitLabel')
    expect(emit).toHaveBeenCalledWith('transfer.completed', expect.objectContaining({
      maximum: { input: 4, value: 12, pairedValue: 3 },
    }))
  })

  it('accepts only the five-step sequence constraints → variables → relation → domain → interpret', () => {
    const { root, emit } = createMode('summary', 'summary_attempt')
    expect(root.textContent).not.toContain('completeStatus')
    expect(root.textContent).not.toContain('completionMark')
    for (const key of ['constraints', 'variables', 'relation', 'domain', 'interpret']) {
      clickByText(root, `step.${key}`)
    }
    clickByText(root, 'submitLabel')
    expect(root.textContent).toContain('completeStatus')
    expect(root.textContent).toContain('completionMark')
    expect(emit).toHaveBeenCalledWith('summary.completed', {
      sequence: ['constraints', 'variables', 'relation', 'domain', 'interpret'],
      attempts: 1,
    })
  })
})
