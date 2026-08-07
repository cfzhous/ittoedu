import {
  VERIFIED_MATH_TRUTHS,
  evaluateQuadratic,
  quadraticMaximum,
  type QuadraticTruth,
} from './mathModel'

export type StructuredLabMode =
  | 'prediction'
  | 'constraints'
  | 'model'
  | 'domain'
  | 'transfer'
  | 'summary'

type RuntimeMode = 'edit' | 'preview' | 'capture'

interface CourseStateStore {
  get<T = unknown>(key: string): T | undefined
  set(key: string, value: unknown): void
}

interface StructuredPalette {
  paper: string
  ink: string
  muted: string
  line: string
  blue: string
  blueSoft: string
  red: string
  redSoft: string
  focus: string
}

export interface StructuredModeProps {
  mode: StructuredLabMode
  phase: string
  model: unknown
  content: Record<string, string>
  palette: StructuredPalette
  reducedMotion: boolean
}

export interface StructuredModeContext {
  runtimeApiVersion: 4
  renderMode: 'dom'
  instanceId: string
  width: number
  height: number
  mode: RuntimeMode
  props: StructuredModeProps
  scope: 'scene' | 'global'
  dom: { root: HTMLElement }
  courseState?: CourseStateStore
  emit(eventName: string, payload?: unknown): void
}

export interface StructuredModeLifecycle {
  setMode(mode: RuntimeMode): void
  resize(width: number, height: number): void
  updateProps(props: StructuredModeProps): void
  setVisible(visible: boolean): void
  suspend(): void
  resume(): void
  prepareCapture(): void
  destroy(): void
}

interface StructuredState {
  prediction: string
  constraints: Record<string, string>
  model: Record<string, string>
  domain: string
  transfer: Record<string, string>
  summary: string[]
  attempts: number
  incorrect: string[]
  feedbackKey: string
  completed: boolean
  hintShown: boolean
}

const COMPLETED_BEATS_KEY = 'mathMotion.completedBeats'
const PREDICTION_KEY = 'mathMotion.prediction'
const HINT_COUNT_KEY = 'mathMotion.hintCount'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isQuadraticTruth(value: unknown): value is QuadraticTruth {
  return isRecord(value)
    && typeof value.linear === 'number'
    && typeof value.quadratic === 'number'
    && Array.isArray(value.domain)
    && value.domain.length === 2
    && value.domain.every((entry) => typeof entry === 'number')
}

function resolveTruth(model: unknown, key: 'domainVariant' | 'transfer'): QuadraticTruth {
  if (isRecord(model) && isQuadraticTruth(model[key])) return model[key]
  return VERIFIED_MATH_TRUTHS[key]
}

function formatNumber(value: number): string {
  const rounded = Math.abs(value) < 1e-9 ? 0 : Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '')
}

function formatTemplate(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  )
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  if (className) element.className = className
  return element
}

function createSvgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag)
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)))
  return element
}

function isCompletePhase(mode: StructuredLabMode, phase: string): boolean {
  if (mode === 'prediction') return phase === 'prediction_locked'
  return phase.endsWith('_complete')
}

function eventForCompletion(mode: StructuredLabMode): string {
  if (mode === 'prediction') return 'prediction.locked'
  return `${mode}.completed`
}

function beatId(mode: StructuredLabMode): string {
  return mode
}

function addCompletedBeat(ctx: StructuredModeContext, mode: StructuredLabMode): void {
  const current = ctx.courseState?.get<unknown>(COMPLETED_BEATS_KEY)
  const beats = Array.isArray(current)
    ? current.filter((value): value is string => typeof value === 'string')
    : []
  if (!beats.includes(beatId(mode))) {
    ctx.courseState?.set(COMPLETED_BEATS_KEY, [...beats, beatId(mode)])
  }
}

function createStyle(instanceClass: string): HTMLStyleElement {
  const style = createElement('style')
  style.textContent = `
    .${instanceClass} {
      --paper: #FBF8F1;
      --ink: #16191F;
      --muted: #74777C;
      --line: #C9CDD2;
      --blue: #145DCE;
      --blue-soft: #DCE9FF;
      --red: #E04424;
      --red-soft: #F8D9CF;
      --focus: #0A53BE;
      width: 100%;
      height: 100%;
      color: var(--ink);
      background: transparent;
      font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
      container-type: size;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }
    .${instanceClass} * { box-sizing: border-box; }
    .${instanceClass} button,
    .${instanceClass} select {
      font: inherit;
    }
    .${instanceClass} button:focus-visible,
    .${instanceClass} select:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--focus) 55%, transparent);
      outline-offset: 3px;
    }
    .${instanceClass} .lab-sheet {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .${instanceClass} .eyebrow {
      margin: 0;
      color: var(--blue);
      font-size: 13px;
      font-weight: 800;
      letter-spacing: .12em;
    }
    .${instanceClass} .instruction {
      margin: 0;
      color: var(--ink);
      font-size: clamp(17px, 2.1cqh, 21px);
      font-weight: 700;
      line-height: 1.55;
    }
    .${instanceClass} .muted {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.65;
    }
    .${instanceClass} .math {
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
    }
    .${instanceClass} .choice,
    .${instanceClass} .action,
    .${instanceClass} .step-chip {
      min-height: 48px;
      border: 1px solid var(--line);
      border-radius: 4px;
      color: var(--ink);
      background: color-mix(in srgb, var(--paper) 82%, white);
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease, transform 120ms ease;
    }
    .${instanceClass} .choice:hover:not(:disabled),
    .${instanceClass} .step-chip:hover:not(:disabled) {
      border-color: var(--blue);
      transform: translateY(-1px);
    }
    .${instanceClass} .choice[data-selected="true"],
    .${instanceClass} .step-chip[data-selected="true"] {
      border-color: var(--blue);
      color: var(--blue);
      background: var(--blue-soft);
      font-weight: 800;
    }
    .${instanceClass} .choice[data-wrong="true"],
    .${instanceClass} select[data-wrong="true"] {
      border-color: var(--red);
      background: var(--red-soft);
    }
    .${instanceClass} .action {
      border-color: var(--blue);
      color: white;
      background: var(--blue);
      font-weight: 800;
      letter-spacing: .02em;
    }
    .${instanceClass} .action.secondary {
      color: var(--blue);
      background: transparent;
    }
    .${instanceClass} button:disabled,
    .${instanceClass} select:disabled {
      cursor: default;
      opacity: .62;
      transform: none;
    }
    .${instanceClass} .status-line {
      min-height: 46px;
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }
    .${instanceClass} .status-line[data-tone="red"] { color: var(--red); }
    .${instanceClass} .status-line[data-tone="blue"] { color: var(--blue); font-weight: 700; }

    .${instanceClass} .prediction-layout {
      display: grid;
      grid-template-columns: .9fr 1.1fr;
      gap: 54px;
      height: 100%;
      padding: 10px 12px 4px;
      align-items: center;
    }
    .${instanceClass} .prediction-stem {
      align-self: stretch;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding-left: 8px;
      border-left: 7px solid var(--blue);
    }
    .${instanceClass} .prediction-mark {
      margin: 10px 0 18px;
      color: var(--red);
      font: 700 clamp(54px, 10cqh, 92px)/1 "Cambria Math", Cambria, serif;
    }
    .${instanceClass} .prediction-strip {
      position: relative;
      min-height: 300px;
      padding: 24px 26px;
      border-top: 1px solid var(--ink);
      border-bottom: 1px solid var(--line);
    }
    .${instanceClass} .motion-track {
      position: relative;
      height: 118px;
      margin: 30px 16px 28px;
    }
    .${instanceClass} .motion-track::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 55px;
      height: 2px;
      background: var(--ink);
    }
    .${instanceClass} .motion-track span {
      position: absolute;
      top: 44px;
      width: 23px;
      height: 23px;
      border: 4px solid var(--paper);
      border-radius: 50%;
      background: var(--blue);
      box-shadow: 0 0 0 1px var(--blue);
    }
    .${instanceClass} .motion-track span:nth-child(1) { left: 0; }
    .${instanceClass} .motion-track span:nth-child(2) { left: calc(50% - 12px); }
    .${instanceClass} .motion-track span:nth-child(3) { right: 0; }
    .${instanceClass} .prediction-options {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
    }
    .${instanceClass} .prediction-options .choice { padding: 12px 8px; }

    .${instanceClass} .constraints-layout {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 44px;
      height: 100%;
      padding: 6px 8px;
    }
    .${instanceClass} .source-notes {
      position: relative;
      padding: 24px 24px 18px;
      border-left: 1px solid var(--ink);
      border-top: 8px solid var(--red);
    }
    .${instanceClass} .source-notes dl { margin: 22px 0 0; }
    .${instanceClass} .source-notes dt {
      margin-top: 18px;
      color: var(--muted);
      font-size: 12px;
      letter-spacing: .08em;
    }
    .${instanceClass} .source-notes dd {
      margin: 4px 0 0;
      color: var(--ink);
      font: 700 26px/1.35 "Cambria Math", Cambria, serif;
    }
    .${instanceClass} .classification-grid {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 16px;
      min-width: 0;
    }
    .${instanceClass} .classification-rows {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 18px;
      align-content: center;
    }
    .${instanceClass} .classification-row,
    .${instanceClass} .assembly-row {
      display: grid;
      grid-template-columns: minmax(120px, .72fr) minmax(180px, 1.28fr);
      gap: 12px;
      align-items: center;
      padding: 14px;
      border-bottom: 1px solid var(--line);
    }
    .${instanceClass} .classification-row strong,
    .${instanceClass} .assembly-row strong { font-size: 17px; }
    .${instanceClass} select {
      width: 100%;
      min-height: 44px;
      border: 1px solid var(--line);
      border-radius: 3px;
      padding: 0 12px;
      color: var(--ink);
      background: white;
    }
    .${instanceClass} .row-actions {
      display: grid;
      grid-template-columns: minmax(180px, 260px) 1fr;
      gap: 18px;
      align-items: center;
    }

    .${instanceClass} .model-layout {
      display: grid;
      grid-template-columns: 1.15fr .85fr;
      gap: 34px;
      height: 100%;
      padding: 2px 6px;
    }
    .${instanceClass} .assembly-board {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 12px;
      padding-right: 28px;
      border-right: 1px solid var(--line);
    }
    .${instanceClass} .assembly-rows { align-self: center; }
    .${instanceClass} .model-preview {
      position: relative;
      align-self: center;
      min-height: 330px;
      padding: 24px 28px;
      border-top: 1px solid var(--ink);
      background: linear-gradient(160deg, transparent 0 70%, var(--blue-soft) 70% 100%);
    }
    .${instanceClass} .model-preview .large-formula {
      margin: 42px 0 18px;
      color: var(--ink);
      font: 700 clamp(30px, 5cqh, 46px)/1.3 "Cambria Math", Cambria, serif;
    }
    .${instanceClass} .model-preview .large-formula em { color: var(--red); font-style: normal; }
    .${instanceClass} .model-preview .domain-seal {
      display: inline-block;
      padding: 8px 14px;
      color: var(--blue);
      border: 1px solid var(--blue);
      border-radius: 999px;
      font-weight: 700;
    }

    .${instanceClass} .domain-layout {
      display: grid;
      grid-template-columns: 1.15fr .85fr;
      gap: 36px;
      height: 100%;
      padding: 0 8px;
    }
    .${instanceClass} .domain-graph-panel {
      display: grid;
      grid-template-rows: auto 1fr;
      border-bottom: 1px solid var(--ink);
    }
    .${instanceClass} .domain-graph { width: 100%; height: 100%; overflow: visible; }
    .${instanceClass} .domain-task {
      align-self: center;
      padding: 22px 0 12px;
    }
    .${instanceClass} .domain-options {
      display: grid;
      gap: 11px;
      margin: 20px 0;
    }
    .${instanceClass} .domain-options .choice {
      padding: 12px 16px;
      text-align: left;
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
      font-size: 18px;
    }
    .${instanceClass} .domain-conclusion {
      color: var(--red);
      font: 700 28px/1.4 "Cambria Math", Cambria, serif;
    }

    .${instanceClass} .transfer-layout {
      display: grid;
      grid-template-columns: .92fr 1.08fr;
      gap: 42px;
      height: 100%;
      padding: 0 4px;
    }
    .${instanceClass} .transfer-geometry {
      position: relative;
      padding: 22px;
      border: 1px solid var(--line);
      background: linear-gradient(135deg, color-mix(in srgb, var(--blue-soft) 34%, transparent), transparent 62%);
    }
    .${instanceClass} .transfer-geometry svg { width: 100%; height: 300px; }
    .${instanceClass} .transfer-task {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 16px;
      min-width: 0;
    }
    .${instanceClass} .transfer-selects {
      display: grid;
      gap: 18px;
      align-content: center;
    }
    .${instanceClass} .transfer-selects label {
      display: grid;
      grid-template-columns: 132px 1fr;
      gap: 14px;
      align-items: center;
      font-weight: 700;
    }
    .${instanceClass} .hint-strip {
      padding: 12px 16px;
      border-left: 5px solid var(--blue);
      color: var(--blue);
      background: var(--blue-soft);
      font-size: 14px;
      line-height: 1.6;
    }
    .${instanceClass} .transfer-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .${instanceClass} .summary-layout {
      display: grid;
      grid-template-rows: 92px 1fr 112px;
      gap: 18px;
      height: 100%;
      padding: 2px 8px;
    }
    .${instanceClass} .evidence-ribbon {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1px;
      color: white;
      background: var(--ink);
    }
    .${instanceClass} .evidence-ribbon article {
      padding: 14px 18px;
      background: var(--ink);
    }
    .${instanceClass} .evidence-ribbon span {
      display: block;
      color: color-mix(in srgb, white 65%, var(--blue-soft));
      font-size: 11px;
      letter-spacing: .08em;
    }
    .${instanceClass} .evidence-ribbon strong {
      display: block;
      margin-top: 5px;
      color: white;
      font: 700 20px/1.25 "Cambria Math", Cambria, serif;
    }
    .${instanceClass} .method-workbench {
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: 14px;
    }
    .${instanceClass} .method-slots,
    .${instanceClass} .method-bank {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }
    .${instanceClass} .method-slot {
      min-height: 86px;
      display: grid;
      place-items: center;
      padding: 10px 8px;
      border-top: 4px solid var(--line);
      border-bottom: 1px solid var(--line);
      color: var(--muted);
      text-align: center;
      font-size: 15px;
    }
    .${instanceClass} .method-slot[data-filled="true"] {
      border-top-color: var(--blue);
      color: var(--ink);
      font-weight: 800;
    }
    .${instanceClass} .method-slot b {
      display: block;
      margin-bottom: 4px;
      color: var(--red);
      font: 700 19px/1 "Cambria Math", Cambria, serif;
    }
    .${instanceClass} .method-bank .step-chip { padding: 10px; }
    .${instanceClass} .summary-actions {
      display: grid;
      grid-template-columns: 140px 140px 230px 1fr;
      gap: 10px;
      align-items: center;
    }
    .${instanceClass} .completion-band {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 18px;
      align-items: center;
      padding: 12px 20px;
      color: var(--blue);
      border-top: 1px solid var(--blue);
      border-bottom: 1px solid var(--blue);
      font-weight: 800;
    }
    .${instanceClass} .completion-band strong {
      color: var(--red);
      font: 700 30px/1 "Cambria Math", Cambria, serif;
    }
    .${instanceClass} .lab-sheet.has-next .status-line { padding-right: 258px; }
    .${instanceClass} .component-next {
      position: absolute;
      z-index: 8;
      right: 4px;
      bottom: 4px;
      width: 238px;
      min-height: 46px;
      box-shadow: 0 0 0 8px var(--paper);
    }
    .${instanceClass}[data-reduced-motion="true"] * { transition: none !important; }
    @media (prefers-reduced-motion: reduce) {
      .${instanceClass} * { transition: none !important; }
    }
  `
  return style
}

export function isStructuredLabMode(value: string): value is StructuredLabMode {
  return ['prediction', 'constraints', 'model', 'domain', 'transfer', 'summary'].includes(value)
}

export function createStructuredMode(ctx: StructuredModeContext): StructuredModeLifecycle {
  const root = ctx.dom.root
  const instanceClass = `motion-structured-${ctx.instanceId.replace(/[^a-z0-9_-]/gi, '-')}`
  let props = ctx.props
  let runtimeMode = ctx.mode
  let width = ctx.width
  let height = ctx.height
  let visible = true
  let suspended = false
  let destroyed = false
  const state: StructuredState = {
    prediction: '',
    constraints: {},
    model: {},
    domain: '',
    transfer: {},
    summary: [],
    attempts: 0,
    incorrect: [],
    feedbackKey: '',
    completed: false,
    hintShown: false,
  }

  root.classList.add(instanceClass)

  const copy = (key: string): string => props.content[key] ?? ''
  const editable = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    key: string,
    className = '',
  ): HTMLElementTagNameMap[K] => {
    const element = createElement(tag, className)
    element.textContent = copy(key)
    element.dataset.coursewareEditKey = `content.${key}`
    return element
  }

  const interactive = (): boolean =>
    runtimeMode === 'preview'
    && !suspended
    && !state.completed
    && !isCompletePhase(props.mode, props.phase)

  function setPalette(): void {
    root.style.setProperty('--paper', props.palette.paper)
    root.style.setProperty('--ink', props.palette.ink)
    root.style.setProperty('--muted', props.palette.muted)
    root.style.setProperty('--line', props.palette.line)
    root.style.setProperty('--blue', props.palette.blue)
    root.style.setProperty('--blue-soft', props.palette.blueSoft)
    root.style.setProperty('--red', props.palette.red)
    root.style.setProperty('--red-soft', props.palette.redSoft)
    root.style.setProperty('--focus', props.palette.focus)
    root.dataset.reducedMotion = String(props.reducedMotion)
  }

  function applySize(): void {
    root.style.width = `${Math.max(1, width)}px`
    root.style.height = `${Math.max(1, height)}px`
  }

  function ensurePhaseState(): void {
    if (props.phase === 'prediction_locked') state.prediction ||= 'middle'
    if (props.phase === 'constraints_complete') {
      state.constraints = { speed: 'constant', time: 'variable', domain: 'range', area: 'target' }
    }
    if (props.phase === 'model_complete') {
      state.model = { ap: 'apCorrect', bq: 'bqCorrect', domain: 'domainCorrect', area: 'areaCorrect' }
    }
    if (props.phase === 'domain_complete') state.domain = 'endpoint'
    if (props.phase === 'transfer_hint') state.hintShown = true
    if (props.phase === 'transfer_complete') {
      state.transfer = { formula: 'formulaCorrect', result: 'resultCorrect' }
      state.hintShown = true
    }
    if (props.phase === 'summary_complete') {
      state.summary = ['constraints', 'variables', 'relation', 'domain', 'interpret']
    }
    state.completed = state.completed || isCompletePhase(props.mode, props.phase)
  }

  function statusText(defaultKey: string): { text: string; tone: 'red' | 'blue' | '' } {
    if (suspended) return { text: copy('suspendedHint'), tone: '' }
    if (runtimeMode !== 'preview') return { text: copy('disabledHint'), tone: '' }
    if (state.completed || isCompletePhase(props.mode, props.phase)) {
      return { text: copy('completeStatus'), tone: 'blue' }
    }
    if (state.feedbackKey) return { text: copy(state.feedbackKey), tone: 'red' }
    return { text: copy(defaultKey), tone: '' }
  }

  function statusElement(defaultKey: string): HTMLElement {
    const status = createElement('p', 'status-line')
    const resolved = statusText(defaultKey)
    status.textContent = resolved.text
    status.dataset.tone = resolved.tone
    status.setAttribute('aria-live', 'polite')
    return status
  }

  function button(
    labelKey: string,
    className: string,
    focusKey: string,
    handler: () => void,
  ): HTMLButtonElement {
    const element = editable('button', labelKey, className)
    element.type = 'button'
    element.dataset.focusKey = focusKey
    element.disabled = !interactive()
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      handler()
    })
    return element
  }

  function complete(payload: Record<string, unknown>): void {
    state.completed = true
    state.feedbackKey = ''
    addCompletedBeat(ctx, props.mode)
    ctx.emit(eventForCompletion(props.mode), payload)
  }

  function renderPrediction(sheet: HTMLElement): void {
    const layout = createElement('section', 'prediction-layout')
    const stem = createElement('div', 'prediction-stem')
    stem.append(
      editable('p', 'kicker', 'eyebrow'),
      editable('div', 'predictionMark', 'prediction-mark math'),
      editable('p', 'instruction', 'instruction'),
      editable('p', 'predictionContext', 'muted'),
    )
    const strip = createElement('div', 'prediction-strip')
    strip.append(editable('p', 'choiceHeading', 'eyebrow'))
    const track = createElement('div', 'motion-track')
    track.setAttribute('aria-hidden', 'true')
    track.append(createElement('span'), createElement('span'), createElement('span'))
    strip.append(track)
    const options = createElement('div', 'prediction-options')
    const definitions = [
      ['start', 'optionStart'],
      ['middle', 'optionMiddle'],
      ['end', 'optionEnd'],
    ] as const
    definitions.forEach(([value, labelKey]) => {
      const choice = button(labelKey, 'choice', `prediction-${value}`, () => {
        state.prediction = value
        state.feedbackKey = ''
        render(`prediction-${value}`)
      })
      choice.dataset.selected = String(state.prediction === value)
      choice.setAttribute('aria-pressed', String(state.prediction === value))
      options.append(choice)
    })
    const lock = button('lockLabel', 'action', 'prediction-lock', () => {
      if (!state.prediction) {
        state.feedbackKey = 'selectionRequired'
        render('prediction-lock')
        return
      }
      ctx.courseState?.set(PREDICTION_KEY, state.prediction)
      complete({ selection: state.prediction })
      render()
    })
    lock.disabled = !interactive() || !state.prediction
    strip.append(options, lock, statusElement('initialStatus'))
    layout.append(stem, strip)
    sheet.append(layout)
  }

  function selectControl(
    key: string,
    value: string,
    options: Array<[string, string]>,
    change: (value: string) => void,
    wrong: boolean,
  ): HTMLSelectElement {
    const select = createElement('select')
    select.dataset.focusKey = key
    select.dataset.wrong = String(wrong)
    select.disabled = !interactive()
    const placeholder = createElement('option')
    placeholder.value = ''
    placeholder.textContent = copy('choosePlaceholder')
    select.append(placeholder)
    options.forEach(([optionValue, labelKey]) => {
      const option = createElement('option')
      option.value = optionValue
      option.textContent = copy(labelKey)
      select.append(option)
    })
    select.value = value
    select.addEventListener('change', (event) => {
      event.stopPropagation()
      change(select.value)
    })
    return select
  }

  function renderConstraints(sheet: HTMLElement): void {
    const layout = createElement('section', 'constraints-layout')
    const source = createElement('aside', 'source-notes')
    source.append(editable('p', 'kicker', 'eyebrow'), editable('p', 'instruction', 'instruction'))
    const facts = createElement('dl')
    ;[
      ['sourceSpeedLabel', 'sourceSpeed'],
      ['sourceTimeLabel', 'sourceTime'],
      ['sourceBoundaryLabel', 'sourceBoundary'],
      ['sourceTargetLabel', 'sourceTarget'],
    ].forEach(([labelKey, valueKey]) => {
      facts.append(editable('dt', labelKey), editable('dd', valueKey, 'math'))
    })
    source.append(facts)

    const board = createElement('div', 'classification-grid')
    board.append(editable('p', 'classificationHeading', 'eyebrow'))
    const rows = createElement('div', 'classification-rows')
    const categories: Array<[string, string]> = [
      ['constant', 'categoryConstant'],
      ['variable', 'categoryVariable'],
      ['range', 'categoryRange'],
      ['target', 'categoryTarget'],
    ]
    const definitions = [
      ['speed', 'itemSpeed', 'constant'],
      ['time', 'itemTime', 'variable'],
      ['domain', 'itemDomain', 'range'],
      ['area', 'itemArea', 'target'],
    ] as const
    definitions.forEach(([id, labelKey, expected]) => {
      const row = createElement('label', 'classification-row')
      row.append(editable('strong', labelKey, 'math'))
      row.append(selectControl(
        `constraint-${id}`,
        state.constraints[id] ?? '',
        categories,
        (value) => {
          state.constraints[id] = value
          state.incorrect = state.incorrect.filter((entry) => entry !== id)
          state.feedbackKey = ''
          render(`constraint-${id}`)
        },
        state.incorrect.includes(id) && state.constraints[id] !== expected,
      ))
      rows.append(row)
    })
    board.append(rows)
    const actions = createElement('div', 'row-actions')
    const submit = button('submitLabel', 'action', 'constraints-submit', () => {
      const incorrect = definitions
        .filter(([id, , expected]) => state.constraints[id] !== expected)
        .map(([id]) => id)
      if (incorrect.length > 0) {
        state.attempts += 1
        state.incorrect = incorrect
        state.feedbackKey = 'repairStatus'
        ctx.emit('constraints.repair', { attempts: state.attempts, incorrect })
        render('constraints-submit')
        return
      }
      complete({ attempts: state.attempts + 1, classifications: { ...state.constraints } })
      render()
    })
    submit.disabled = !interactive() || definitions.some(([id]) => !state.constraints[id])
    actions.append(submit, statusElement('initialStatus'))
    board.append(actions)
    layout.append(source, board)
    sheet.append(layout)
  }

  function renderModel(sheet: HTMLElement): void {
    const layout = createElement('section', 'model-layout')
    const board = createElement('div', 'assembly-board')
    board.append(editable('p', 'kicker', 'eyebrow'))
    const rows = createElement('div', 'assembly-rows')
    const definitions: Array<{
      id: string
      labelKey: string
      correct: string
      options: Array<[string, string]>
    }> = [
      { id: 'ap', labelKey: 'slotAp', correct: 'apCorrect', options: [['apCorrect', 'apCorrect'], ['apPlus', 'apPlus'], ['apReverse', 'apReverse']] },
      { id: 'bq', labelKey: 'slotBq', correct: 'bqCorrect', options: [['bqCorrect', 'bqCorrect'], ['bqForward', 'bqForward'], ['bqPlus', 'bqPlus']] },
      { id: 'domain', labelKey: 'slotDomain', correct: 'domainCorrect', options: [['domainCorrect', 'domainCorrect'], ['domainLong', 'domainLong'], ['domainOpen', 'domainOpen']] },
      { id: 'area', labelKey: 'slotArea', correct: 'areaCorrect', options: [['areaCorrect', 'areaCorrect'], ['areaDouble', 'areaDouble'], ['areaSum', 'areaSum']] },
    ]
    definitions.forEach((definition) => {
      const row = createElement('label', 'assembly-row')
      row.append(editable('strong', definition.labelKey, 'math'))
      row.append(selectControl(
        `model-${definition.id}`,
        state.model[definition.id] ?? '',
        definition.options,
        (value) => {
          state.model[definition.id] = value
          state.incorrect = state.incorrect.filter((entry) => entry !== definition.id)
          state.feedbackKey = ''
          render(`model-${definition.id}`)
        },
        state.incorrect.includes(definition.id) && state.model[definition.id] !== definition.correct,
      ))
      rows.append(row)
    })
    board.append(rows)
    const boardActions = createElement('div', 'row-actions')
    const submit = button('submitLabel', 'action', 'model-submit', () => {
      const incorrect = definitions
        .filter(({ id, correct }) => state.model[id] !== correct)
        .map(({ id }) => id)
      if (incorrect.length > 0) {
        state.attempts += 1
        state.incorrect = incorrect
        state.feedbackKey = 'repairStatus'
        ctx.emit('model.repair', { attempts: state.attempts, incorrect })
        render('model-submit')
        return
      }
      complete({ attempts: state.attempts + 1, selections: { ...state.model } })
      render()
    })
    submit.disabled = !interactive() || definitions.some(({ id }) => !state.model[id])
    boardActions.append(submit, statusElement('initialStatus'))
    board.append(boardActions)

    const preview = createElement('aside', 'model-preview')
    preview.append(editable('p', 'previewHeading', 'eyebrow'))
    const formula = createElement('div', 'large-formula math')
    if (state.completed || props.phase === 'model_complete') {
      formula.append('S(t) = ', '6t − ', Object.assign(createElement('em'), { textContent: '1.5t²' }))
    } else {
      formula.textContent = copy('previewPlaceholder')
      formula.dataset.coursewareEditKey = 'content.previewPlaceholder'
    }
    const seal = editable('span', 'previewDomain', 'domain-seal math')
    preview.append(formula, seal, editable('p', 'previewNote', 'muted'))
    layout.append(board, preview)
    sheet.append(layout)
  }

  function renderDomainGraph(container: HTMLElement, truth: QuadraticTruth): void {
    const svg = createSvgElement('svg', {
      class: 'domain-graph',
      viewBox: '0 0 650 340',
      role: 'img',
      'aria-label': copy('graphAriaLabel'),
    })
    const axisX = createSvgElement('line', { x1: 58, y1: 286, x2: 622, y2: 286, stroke: props.palette.ink, 'stroke-width': 2 })
    const axisY = createSvgElement('line', { x1: 58, y1: 286, x2: 58, y2: 28, stroke: props.palette.ink, 'stroke-width': 2 })
    const toPoint = (input: number, value: number) => ({
      x: 58 + (input / 7) * 540,
      y: 286 - (value / 19) * 228,
    })
    const fullPath = Array.from({ length: 101 }, (_, index) => {
      const input = 7 * index / 100
      const point = toPoint(input, evaluateQuadratic(truth, input))
      return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    }).join(' ')
    const feasiblePath = Array.from({ length: 81 }, (_, index) => {
      const input = 4 * index / 80
      const point = toPoint(input, evaluateQuadratic(truth, input))
      return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    }).join(' ')
    svg.append(
      axisX,
      axisY,
      createSvgElement('path', { d: fullPath, fill: 'none', stroke: props.palette.line, 'stroke-width': 3, 'stroke-dasharray': '8 8' }),
      createSvgElement('path', { d: feasiblePath, fill: 'none', stroke: props.palette.blue, 'stroke-width': 5 }),
    )
    const endpoint = toPoint(4, evaluateQuadratic(truth, 4))
    const vertex = quadraticMaximum({ ...truth, domain: [0, 7] })
    const vertexPoint = toPoint(vertex.input, vertex.value)
    svg.append(
      createSvgElement('line', { x1: endpoint.x, x2: endpoint.x, y1: endpoint.y, y2: 286, stroke: props.palette.red, 'stroke-width': 2, 'stroke-dasharray': '5 5' }),
      createSvgElement('circle', { cx: endpoint.x, cy: endpoint.y, r: 7, fill: props.palette.red }),
      createSvgElement('circle', { cx: vertexPoint.x, cy: vertexPoint.y, r: 6, fill: props.palette.paper, stroke: props.palette.muted, 'stroke-width': 2 }),
    )
    ;[
      [58, 310, '0'],
      [endpoint.x, 310, '4'],
      [vertexPoint.x, 310, '6'],
    ].forEach(([x, y, text]) => {
      const label = createSvgElement('text', { x, y, fill: text === '4' ? props.palette.red : props.palette.muted, 'font-size': 18, 'text-anchor': 'middle', 'font-family': 'Cambria, serif' })
      label.textContent = String(text)
      svg.append(label)
    })
    const domainLabel = createSvgElement('text', { x: 158, y: 330, fill: props.palette.blue, 'font-size': 16, 'font-weight': 700, 'font-family': 'Microsoft YaHei, sans-serif' })
    domainLabel.textContent = copy('feasibleDomainLabel')
    svg.append(domainLabel)
    container.append(svg)
  }

  function renderDomain(sheet: HTMLElement): void {
    const truth = resolveTruth(props.model, 'domainVariant')
    const maximum = quadraticMaximum(truth)
    const layout = createElement('section', 'domain-layout')
    const graphPanel = createElement('div', 'domain-graph-panel')
    graphPanel.append(editable('p', 'kicker', 'eyebrow'))
    renderDomainGraph(graphPanel, truth)
    const task = createElement('div', 'domain-task')
    task.append(editable('p', 'instruction', 'instruction'), editable('p', 'domainPrompt', 'muted'))
    const options = createElement('div', 'domain-options')
    const definitions = [
      ['vertex', 'optionVertex'],
      ['endpoint', 'optionEndpoint'],
      ['midpoint', 'optionMidpoint'],
    ] as const
    definitions.forEach(([value, labelKey]) => {
      const choice = button(labelKey, 'choice', `domain-${value}`, () => {
        state.domain = value
        state.feedbackKey = ''
        render(`domain-${value}`)
      })
      choice.dataset.selected = String(state.domain === value)
      choice.dataset.wrong = String(state.incorrect.includes('domain') && state.domain === value && value !== 'endpoint')
      choice.setAttribute('aria-pressed', String(state.domain === value))
      options.append(choice)
    })
    task.append(options)
    const submit = button('submitLabel', 'action', 'domain-submit', () => {
      if (state.domain !== 'endpoint') {
        state.attempts += 1
        state.incorrect = ['domain']
        state.feedbackKey = 'repairStatus'
        ctx.emit('domain.repair', { attempts: state.attempts, selection: state.domain })
        render('domain-submit')
        return
      }
      complete({ attempts: state.attempts + 1, maximum })
      render()
    })
    submit.disabled = !interactive() || !state.domain
    task.append(submit)
    if (state.completed || props.phase === 'domain_complete') {
      const conclusion = createElement('p', 'domain-conclusion')
      conclusion.textContent = formatTemplate(copy('conclusionTemplate'), {
        value: formatNumber(maximum.value),
        input: formatNumber(maximum.input),
      })
      task.append(conclusion)
    }
    task.append(statusElement('initialStatus'))
    layout.append(graphPanel, task)
    sheet.append(layout)
  }

  function renderTransferGeometry(container: HTMLElement, truth: QuadraticTruth): void {
    const maximum = quadraticMaximum(truth)
    const yValue = truth.linear - truth.quadratic * maximum.input
    const svg = createSvgElement('svg', { viewBox: '0 0 480 310', role: 'img', 'aria-label': copy('geometryAriaLabel') })
    svg.append(
      createSvgElement('line', { x1: 54, y1: 258, x2: 434, y2: 258, stroke: props.palette.ink, 'stroke-width': 2 }),
      createSvgElement('line', { x1: 54, y1: 258, x2: 54, y2: 32, stroke: props.palette.ink, 'stroke-width': 2 }),
      createSvgElement('line', { x1: 54, y1: 50, x2: 420, y2: 258, stroke: props.palette.muted, 'stroke-width': 2, 'stroke-dasharray': '7 7' }),
      createSvgElement('rect', { x: 54, y: 133, width: 214, height: 125, fill: props.palette.redSoft, stroke: props.palette.red, 'stroke-width': 3 }),
      createSvgElement('line', { x1: 268, y1: 133, x2: 420, y2: 258, stroke: props.palette.blue, 'stroke-width': 4 }),
      createSvgElement('circle', { cx: 268, cy: 133, r: 7, fill: props.palette.blue }),
    )
    const labels: Array<[number, number, string, string, string]> = [
      [160, 284, formatTemplate(copy('xValueTemplate'), { value: formatNumber(maximum.input) }), props.palette.blue, 'middle'],
      [280, 196, formatTemplate(copy('yValueTemplate'), { value: formatNumber(yValue) }), props.palette.blue, 'start'],
      [72, 86, copy('lineRelationLabel'), props.palette.muted, 'start'],
      [125, 188, copy('targetRegionLabel'), props.palette.red, 'start'],
    ]
    labels.forEach(([x, y, text, fill, anchor]) => {
      const label = createSvgElement('text', { x, y, fill, 'font-size': 17, 'font-family': 'Cambria, Microsoft YaHei, serif', 'text-anchor': anchor })
      label.textContent = text
      svg.append(label)
    })
    container.append(svg)
  }

  function renderTransfer(sheet: HTMLElement): void {
    const truth = resolveTruth(props.model, 'transfer')
    const maximum = quadraticMaximum(truth)
    const yValue = truth.linear - truth.quadratic * maximum.input
    const layout = createElement('section', 'transfer-layout')
    const geometry = createElement('div', 'transfer-geometry')
    geometry.append(editable('p', 'kicker', 'eyebrow'))
    renderTransferGeometry(geometry, truth)
    const task = createElement('div', 'transfer-task')
    task.append(editable('p', 'instruction', 'instruction'))
    const selects = createElement('div', 'transfer-selects')
    const formulaLabel = editable('label', 'formulaSlot')
    formulaLabel.append(selectControl(
      'transfer-formula',
      state.transfer.formula ?? '',
      [['formulaCorrect', 'formulaCorrect'], ['formulaTriangle', 'formulaTriangle'], ['formulaLinear', 'formulaLinear']],
      (value) => {
        state.transfer.formula = value
        state.feedbackKey = ''
        render('transfer-formula')
      },
      state.incorrect.includes('formula') && state.transfer.formula !== 'formulaCorrect',
    ))
    const resultLabel = editable('label', 'resultSlot')
    resultLabel.append(selectControl(
      'transfer-result',
      state.transfer.result ?? '',
      [['resultCorrect', 'resultCorrect'], ['resultVertex', 'resultVertex'], ['resultEndpoint', 'resultEndpoint']],
      (value) => {
        state.transfer.result = value
        state.feedbackKey = ''
        render('transfer-result')
      },
      state.incorrect.includes('result') && state.transfer.result !== 'resultCorrect',
    ))
    selects.append(formulaLabel, resultLabel)
    if (state.hintShown || props.phase === 'transfer_hint' || props.phase === 'transfer_complete') {
      selects.append(editable('p', 'hintText', 'hint-strip'))
    }
    task.append(selects)
    const footer = createElement('div')
    const actions = createElement('div', 'transfer-actions')
    const hint = button('hintLabel', 'action secondary', 'transfer-hint', () => {
      const count = Number(ctx.courseState?.get<number>(HINT_COUNT_KEY) ?? 0) + 1
      ctx.courseState?.set(HINT_COUNT_KEY, count)
      state.hintShown = true
      ctx.emit('transfer.hint', { hintCount: count })
      render('transfer-hint')
    })
    hint.disabled = !interactive() || state.hintShown
    const submit = button('submitLabel', 'action', 'transfer-submit', () => {
      const incorrect = [
        ...(state.transfer.formula === 'formulaCorrect' ? [] : ['formula']),
        ...(state.transfer.result === 'resultCorrect' ? [] : ['result']),
      ]
      if (incorrect.length > 0) {
        state.attempts += 1
        state.incorrect = incorrect
        state.feedbackKey = incorrect.includes('formula') ? 'repairFormulaStatus' : 'repairResultStatus'
        let hintCount = Number(ctx.courseState?.get<number>(HINT_COUNT_KEY) ?? 0)
        if (!state.hintShown) {
          hintCount += 1
          ctx.courseState?.set(HINT_COUNT_KEY, hintCount)
          state.hintShown = true
        }
        ctx.emit('transfer.repair', { attempts: state.attempts, incorrect, hintCount })
        render('transfer-submit')
        return
      }
      complete({
        attempts: state.attempts + 1,
        maximum: { input: maximum.input, value: maximum.value, pairedValue: yValue },
      })
      render()
    })
    submit.disabled = !interactive() || !state.transfer.formula || !state.transfer.result
    actions.append(hint, submit)
    footer.append(actions, statusElement('initialStatus'))
    task.append(footer)
    layout.append(geometry, task)
    sheet.append(layout)
  }

  function renderSummary(sheet: HTMLElement): void {
    const layout = createElement('section', 'summary-layout')
    const evidence = createElement('div', 'evidence-ribbon')
    ;[
      ['evidenceBaseLabel', 'evidenceBase'],
      ['evidenceDomainLabel', 'evidenceDomain'],
      ['evidenceTransferLabel', 'evidenceTransfer'],
    ].forEach(([labelKey, valueKey]) => {
      const article = createElement('article')
      article.append(editable('span', labelKey), editable('strong', valueKey, 'math'))
      evidence.append(article)
    })
    const workbench = createElement('div', 'method-workbench')
    workbench.append(editable('p', 'instruction', 'instruction'))
    const order = ['constraints', 'variables', 'relation', 'domain', 'interpret']
    const bankOrder = ['relation', 'constraints', 'interpret', 'variables', 'domain']
    const slots = createElement('div', 'method-slots')
    order.forEach((_, index) => {
      const slot = createElement('div', 'method-slot')
      const selected = state.summary[index]
      slot.dataset.filled = String(Boolean(selected))
      const number = createElement('b')
      number.textContent = String(index + 1).padStart(2, '0')
      slot.append(number)
      if (selected) slot.append(editable('span', `step.${selected}`))
      else slot.append(editable('span', 'emptySlot'))
      slots.append(slot)
    })
    const bank = createElement('div', 'method-bank')
    bankOrder.forEach((id) => {
      const choice = button(`step.${id}`, 'step-chip', `summary-${id}`, () => {
        if (state.summary.includes(id) || state.summary.length >= order.length) return
        state.summary.push(id)
        state.feedbackKey = ''
        render(`summary-${id}`)
      })
      choice.dataset.selected = String(state.summary.includes(id))
      choice.disabled = !interactive() || state.summary.includes(id)
      bank.append(choice)
    })
    workbench.append(slots, bank)
    const actions = createElement('div', 'summary-actions')
    const undo = button('undoLabel', 'action secondary', 'summary-undo', () => {
      state.summary.pop()
      state.feedbackKey = ''
      render('summary-undo')
    })
    undo.disabled = !interactive() || state.summary.length === 0
    const reset = button('resetLabel', 'action secondary', 'summary-reset', () => {
      state.summary = []
      state.feedbackKey = ''
      render('summary-reset')
    })
    reset.disabled = !interactive() || state.summary.length === 0
    const submit = button('submitLabel', 'action', 'summary-submit', () => {
      if (state.summary.join('|') !== order.join('|')) {
        state.attempts += 1
        state.feedbackKey = 'repairStatus'
        render('summary-submit')
        return
      }
      complete({ sequence: [...state.summary], attempts: state.attempts + 1 })
      render()
    })
    submit.disabled = !interactive() || state.summary.length !== order.length
    actions.append(undo, reset, submit, statusElement('initialStatus'))
    workbench.append(actions)
    layout.append(evidence, workbench)
    if (state.completed || props.phase === 'summary_complete') {
      const completion = createElement('div', 'completion-band')
      completion.append(editable('strong', 'completionMark'), editable('span', 'completeStatus'))
      layout.append(completion)
    }
    sheet.append(layout)
  }

  function render(focusKey = ''): void {
    if (destroyed) return
    ensurePhaseState()
    setPalette()
    applySize()
    root.setAttribute('aria-label', copy('ariaLabel'))
    root.setAttribute('aria-hidden', String(!visible))
    const style = createStyle(instanceClass)
    const sheet = createElement('div', 'lab-sheet')
    sheet.dataset.mode = props.mode
    if (props.mode === 'prediction') renderPrediction(sheet)
    if (props.mode === 'constraints') renderConstraints(sheet)
    if (props.mode === 'model') renderModel(sheet)
    if (props.mode === 'domain') renderDomain(sheet)
    if (props.mode === 'transfer') renderTransfer(sheet)
    if (props.mode === 'summary') renderSummary(sheet)
    if (
      props.mode !== 'summary'
      && copy('nextLabel')
      && (state.completed || isCompletePhase(props.mode, props.phase))
    ) {
      sheet.classList.add('has-next')
      const next = button('nextLabel', 'action component-next', 'course-next', () => {
        ctx.emit('navigation.next', { mode: props.mode })
      })
      next.disabled = runtimeMode !== 'preview' || suspended
      sheet.append(next)
    }
    root.replaceChildren(style, sheet)
    if (focusKey && runtimeMode === 'preview') {
      queueMicrotask(() => {
        if (destroyed) return
        root.querySelector<HTMLElement>(`[data-focus-key="${focusKey}"]`)?.focus({ preventScroll: true })
      })
    }
  }

  render()

  return {
    setMode(mode) {
      runtimeMode = mode
      render()
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
      applySize()
    },
    updateProps(nextProps) {
      props = nextProps
      render()
    },
    setVisible(nextVisible) {
      visible = nextVisible
      root.style.display = visible ? 'block' : 'none'
      root.setAttribute('aria-hidden', String(!visible))
    },
    suspend() {
      suspended = true
      render()
    },
    resume() {
      suspended = false
      render()
    },
    prepareCapture() {
      ensurePhaseState()
      render()
      root.dataset.captureReady = 'true'
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      root.classList.remove(instanceClass)
      root.replaceChildren()
    },
  }
}
