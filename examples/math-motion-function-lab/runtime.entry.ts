import {
  BASE_LINKED_GRAPH_MODEL,
  deriveAreaTruth,
  deriveLinkedGraphSnapshot,
  quadraticMaximum,
  sampleQuadraticPath,
  type LinkedGraphModel,
} from './mathModel'
import {
  createStructuredMode,
  isStructuredLabMode,
  type StructuredLabMode,
} from './structuredModes'

type RuntimeMode = 'edit' | 'preview' | 'capture'
type LabMode = 'linked-graph' | StructuredLabMode
type LabPhase = string

interface MotionContent {
  [key: string]: string
  ariaLabel: string
  kicker: string
  formulaHeading: string
  geometryHeading: string
  graphHeading: string
  areaRegionLabel: string
  timeLabel: string
  areaLabel: string
  apLabel: string
  bqLabel: string
  domainLabel: string
  dragInstruction: string
  keyboardHint: string
  checkpointLabel: string
  checkpointPending: string
  checkpointSeen: string
  exploreStatus: string
  endpointsStatus: string
  readyStatus: string
  wrongPeakStatus: string
  confirmLabel: string
  confirmedLabel: string
  provedStatus: string
  disabledHint: string
  suspendedHint: string
  pointA: string
  pointB: string
  pointC: string
  pointD: string
  pointP: string
  pointQ: string
  maximumLabel: string
}

interface MotionPalette {
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

export interface MotionFunctionLabProps {
  mode: LabMode
  phase: LabPhase
  model: LinkedGraphModel | {
    base: LinkedGraphModel
    domainVariant: { linear: number; quadratic: number; domain: [number, number] }
    transfer: { linear: number; quadratic: number; domain: [number, number] }
  }
  content: MotionContent
  palette: MotionPalette
  reducedMotion: boolean
}

interface ComponentContext {
  runtimeApiVersion: 4
  renderMode: 'dom'
  instanceId: string
  width: number
  height: number
  mode: RuntimeMode
  props: MotionFunctionLabProps
  scope: 'scene' | 'global'
  dom: { root: HTMLElement }
  courseState?: {
    get<T = unknown>(key: string): T | undefined
    set(key: string, value: unknown): void
  }
  emit(eventName: string, payload?: unknown): void
}

export interface MotionFunctionLabLifecycle {
  setMode(mode: RuntimeMode): void
  resize(width: number, height: number): void
  updateProps(props: MotionFunctionLabProps): void
  setVisible(visible: boolean): void
  suspend(): void
  resume(): void
  prepareCapture(): void
  destroy(): void
}

interface CoursewareComponentGlobal {
  CoursewareComponent: {
    define(definition: {
      id: string
      runtimeApiVersion: 4
      create(context: ComponentContext): MotionFunctionLabLifecycle
    }): void
  }
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const EPSILON = 0.051

function formatNumber(value: number): string {
  const rounded = Math.abs(value) < 1e-9 ? 0 : Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '')
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NAMESPACE, name)
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value))
  }
  return element
}

function replaceFormula(
  target: HTMLElement,
  parts: Array<{ text: string; tone?: 'blue' | 'red'; superscript?: boolean }>,
  ariaLabel: string,
): void {
  const fragment = document.createDocumentFragment()
  for (const part of parts) {
    const element = document.createElement(part.superscript ? 'sup' : 'span')
    element.textContent = part.text
    if (part.tone) element.dataset.tone = part.tone
    fragment.append(element)
  }
  target.replaceChildren(fragment)
  target.setAttribute('aria-label', ariaLabel)
}

function createStyle(instanceClass: string): HTMLStyleElement {
  const style = document.createElement('style')
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
      font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif;
      container-type: size;
      user-select: none;
      -webkit-font-smoothing: antialiased;
    }
    .${instanceClass} * { box-sizing: border-box; }
    .${instanceClass} .motion-sheet {
      display: grid;
      grid-template-columns: minmax(274px, 0.43fr) minmax(520px, 1fr);
      gap: clamp(22px, 3cqw, 42px);
      width: 100%;
      height: 100%;
      padding: 2px 4px 0;
      overflow: hidden;
    }
    .${instanceClass} .formula-column {
      min-width: 0;
      padding: 2px clamp(18px, 2.2cqw, 30px) 0 0;
      border-right: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
      display: flex;
      flex-direction: column;
    }
    .${instanceClass} .kicker {
      margin: 0 0 5px;
      color: var(--blue);
      font-size: clamp(11px, 1.1cqw, 14px);
      font-weight: 700;
      letter-spacing: 0.14em;
    }
    .${instanceClass} h3 {
      margin: 0;
      font-size: clamp(16px, 1.45cqw, 20px);
      line-height: 1.25;
      font-weight: 700;
      letter-spacing: 0.02em;
    }
    .${instanceClass} .relation-list {
      display: grid;
      gap: clamp(7px, 1cqh, 12px);
      margin: clamp(14px, 2.4cqh, 23px) 0 0;
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
      font-size: clamp(20px, 2.15cqw, 29px);
      line-height: 1.12;
    }
    .${instanceClass} .relation-row {
      display: grid;
      grid-template-columns: minmax(0, max-content) 1fr;
      align-items: center;
      gap: 13px;
      white-space: nowrap;
    }
    .${instanceClass} .relation-row::after {
      content: "";
      min-width: 24px;
      border-top: 1px dashed var(--line);
      transform: translateY(2px);
    }
    .${instanceClass} [data-tone="blue"] { color: var(--blue); }
    .${instanceClass} [data-tone="red"] { color: var(--red); }
    .${instanceClass} .area-formula {
      margin-top: clamp(18px, 3.2cqh, 30px);
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
      font-size: clamp(30px, 3.55cqw, 47px);
      line-height: 1.1;
      white-space: nowrap;
    }
    .${instanceClass} .area-formula sup {
      font-size: 0.52em;
      vertical-align: 0.72em;
    }
    .${instanceClass} .live-equation {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-top: clamp(10px, 2cqh, 18px);
      padding-top: clamp(9px, 1.6cqh, 15px);
      border-top: 1px solid var(--line);
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
    }
    .${instanceClass} .live-equation strong {
      color: var(--red);
      font-size: clamp(23px, 2.6cqw, 35px);
      font-weight: 500;
    }
    .${instanceClass} .live-equation span {
      color: var(--muted);
      font-size: clamp(14px, 1.45cqw, 18px);
    }
    .${instanceClass} .checkpoints {
      margin-top: auto;
      padding-top: 10px;
    }
    .${instanceClass} .checkpoint-title {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: clamp(10px, 1cqw, 12px);
      letter-spacing: 0.05em;
    }
    .${instanceClass} .checkpoint-list {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      margin-top: 7px;
    }
    .${instanceClass} .checkpoint {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      color: var(--muted);
      font-size: clamp(10px, 1cqw, 12px);
    }
    .${instanceClass} .checkpoint::before {
      content: "";
      width: 7px;
      height: 7px;
      flex: 0 0 auto;
      border: 1px solid var(--line);
      border-radius: 50%;
      background: var(--paper);
    }
    .${instanceClass} .checkpoint[data-seen="true"] { color: var(--blue); }
    .${instanceClass} .checkpoint[data-seen="true"]::before {
      border-color: var(--blue);
      background: var(--blue);
      box-shadow: 0 0 0 2px var(--blue-soft);
    }
    .${instanceClass} .confirm-button {
      width: 100%;
      min-height: 42px;
      margin-top: clamp(10px, 1.6cqh, 15px);
      padding: 9px 14px;
      border: 1px solid var(--blue);
      border-radius: 2px;
      color: #fff;
      background: var(--blue);
      font: 700 clamp(12px, 1.1cqw, 14px)/1.35 "Microsoft YaHei", sans-serif;
      letter-spacing: 0.03em;
      cursor: pointer;
    }
    .${instanceClass} .confirm-button:disabled {
      border-color: var(--line);
      color: var(--muted);
      background: color-mix(in srgb, var(--paper) 82%, var(--line));
      cursor: not-allowed;
    }
    .${instanceClass} .confirm-button:focus-visible,
    .${instanceClass} input[type="range"]:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--focus) 35%, transparent);
      outline-offset: 3px;
    }
    .${instanceClass} .visual-column {
      display: grid;
      grid-template-rows: minmax(205px, 1.18fr) minmax(175px, 0.92fr);
      gap: clamp(8px, 1.5cqh, 15px);
      min-width: 0;
      min-height: 0;
    }
    .${instanceClass} .visual-section {
      position: relative;
      min-width: 0;
      min-height: 0;
    }
    .${instanceClass} .section-heading {
      position: absolute;
      z-index: 2;
      top: 0;
      left: 0;
      margin: 0;
      color: var(--muted);
      font-size: clamp(10px, 0.95cqw, 12px);
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .${instanceClass} svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .${instanceClass} .diagram-text {
      font-family: "Cambria Math", Cambria, "Times New Roman", serif;
      fill: var(--ink);
      font-size: 16px;
    }
    .${instanceClass} .diagram-text[data-tone="blue"] { fill: var(--blue); }
    .${instanceClass} .diagram-text[data-tone="red"] { fill: var(--red); }
    .${instanceClass} .diagram-text[data-tone="muted"] { fill: var(--muted); }
    .${instanceClass} .geometry-outline,
    .${instanceClass} .graph-axis { stroke: var(--ink); stroke-width: 1.5; fill: none; }
    .${instanceClass} .area-region {
      fill: var(--red-soft);
      fill-opacity: 0.76;
      stroke: var(--red);
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .${instanceClass} .variable-line { stroke: var(--blue); stroke-width: 2.4; }
    .${instanceClass} .guide-line { stroke: var(--line); stroke-width: 1.2; stroke-dasharray: 4 4; }
    .${instanceClass} .active-guide { stroke: var(--red); stroke-width: 1.1; stroke-dasharray: 4 4; }
    .${instanceClass} .motion-point { fill: var(--blue); stroke: var(--paper); stroke-width: 2; }
    .${instanceClass} .graph-curve { fill: none; stroke: var(--red); stroke-width: 2.6; }
    .${instanceClass} .graph-point { fill: var(--red); stroke: var(--paper); stroke-width: 2.4; }
    .${instanceClass} .control-row {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 42px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 15px;
    }
    .${instanceClass} input[type="range"] {
      width: 100%;
      height: 22px;
      margin: 0;
      accent-color: var(--blue);
      cursor: ew-resize;
    }
    .${instanceClass} input[type="range"]:disabled { cursor: not-allowed; opacity: 0.58; }
    .${instanceClass} .time-readout {
      min-width: 74px;
      color: var(--red);
      font: 500 clamp(19px, 2cqw, 26px)/1 "Cambria Math", Cambria, serif;
      text-align: right;
      white-space: nowrap;
    }
    .${instanceClass} .keyboard-hint {
      position: absolute;
      left: 42px;
      bottom: 27px;
      color: var(--muted);
      font-size: clamp(11px, 0.92cqw, 12px);
      line-height: 1.2;
    }
    .${instanceClass} .sr-status {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .${instanceClass}[data-reduced-motion="true"] * {
      scroll-behavior: auto !important;
      transition: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      .${instanceClass} * { scroll-behavior: auto !important; transition: none !important; }
    }
    @container (max-width: 920px) {
      .${instanceClass} .motion-sheet { grid-template-columns: minmax(240px, 0.42fr) minmax(420px, 1fr); gap: 18px; }
      .${instanceClass} .formula-column { padding-right: 16px; }
      .${instanceClass} .relation-list { font-size: 19px; }
      .${instanceClass} .area-formula { font-size: 30px; }
      .${instanceClass} .visual-column { grid-template-rows: 1.12fr 0.88fr; }
    }
  `
  return style
}

function linkedGraphModelFromProps(props: MotionFunctionLabProps): LinkedGraphModel {
  return 'base' in props.model ? props.model.base : props.model
}

function createLinkedGraphLab(ctx: ComponentContext): MotionFunctionLabLifecycle {
  if (ctx.renderMode !== 'dom') {
    throw new Error('motion-function-lab requires renderMode=dom')
  }
  if (ctx.scope !== 'scene') {
    throw new Error('motion-function-lab supports scene scope only')
  }

  const instanceClass = `motion-function-lab-${ctx.instanceId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const root = ctx.dom.root
  root.replaceChildren()
  root.classList.add(instanceClass)
  root.setAttribute('role', 'group')

  let props = ctx.props
  let model = linkedGraphModelFromProps(props) ?? BASE_LINKED_GRAPH_MODEL
  let runtimeMode = ctx.mode
  let width = ctx.width
  let height = ctx.height
  let visible = true
  let suspended = false
  let destroyed = false
  let dragging = false
  let frameHandle = 0
  let pendingTime: number | null = null
  let t = model.tMin
  let mastered = props.phase === 'proved'
  let statusOverride = ''
  const visited = new Set<number>([model.tMin])

  const style = createStyle(instanceClass)
  const sheet = document.createElement('div')
  sheet.className = 'motion-sheet'
  const formulaColumn = document.createElement('section')
  formulaColumn.className = 'formula-column'
  const kicker = document.createElement('p')
  kicker.className = 'kicker'
  const formulaHeading = document.createElement('h3')
  const relations = document.createElement('div')
  relations.className = 'relation-list'
  const apFormula = document.createElement('div')
  apFormula.className = 'relation-row'
  const bqFormula = document.createElement('div')
  bqFormula.className = 'relation-row'
  const domainFormula = document.createElement('div')
  domainFormula.className = 'relation-row'
  relations.append(apFormula, bqFormula, domainFormula)
  const areaFormula = document.createElement('div')
  areaFormula.className = 'area-formula'
  const liveEquation = document.createElement('div')
  liveEquation.className = 'live-equation'
  const liveTime = document.createElement('span')
  const liveArea = document.createElement('strong')
  liveEquation.append(liveTime, liveArea)
  const checkpoints = document.createElement('div')
  checkpoints.className = 'checkpoints'
  const checkpointTitle = document.createElement('div')
  checkpointTitle.className = 'checkpoint-title'
  const checkpointTitleText = document.createElement('span')
  const checkpointStatusText = document.createElement('span')
  checkpointTitle.append(checkpointTitleText, checkpointStatusText)
  const checkpointList = document.createElement('div')
  checkpointList.className = 'checkpoint-list'
  const checkpointElements = [0, 2, 4].map((value) => {
    const item = document.createElement('div')
    item.className = 'checkpoint'
    item.dataset.checkpoint = String(value)
    checkpointList.append(item)
    return item
  })
  checkpoints.append(checkpointTitle, checkpointList)
  const confirmButton = document.createElement('button')
  confirmButton.type = 'button'
  confirmButton.className = 'confirm-button'
  formulaColumn.append(
    kicker,
    formulaHeading,
    relations,
    areaFormula,
    liveEquation,
    checkpoints,
    confirmButton,
  )

  const visualColumn = document.createElement('div')
  visualColumn.className = 'visual-column'
  const geometrySection = document.createElement('section')
  geometrySection.className = 'visual-section'
  const geometryHeading = document.createElement('p')
  geometryHeading.className = 'section-heading'
  const geometrySvg = svgElement('svg', {
    viewBox: '0 0 650 220',
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  })
  const areaRegion = svgElement('polygon', { class: 'area-region' })
  const rectangleOutline = svgElement('path', {
    class: 'geometry-outline',
    d: 'M42 182 L586 182 L586 24 L42 24 Z',
  })
  const apSegment = svgElement('line', { class: 'variable-line', x1: 42, y1: 182, y2: 182 })
  const bqSegment = svgElement('line', {
    class: 'variable-line',
    x1: 586,
    x2: 586,
    y1: 182,
    'stroke-dasharray': '5 4',
  })
  const pGuide = svgElement('line', { class: 'guide-line', y1: 182, y2: 210 })
  const qGuide = svgElement('line', { class: 'guide-line', x1: 586, x2: 621 })
  const pPoint = svgElement('circle', { class: 'motion-point', r: 6.5, cy: 182 })
  const qPoint = svgElement('circle', { class: 'motion-point', r: 6.5, cx: 586 })
  const geometryTexts = {
    a: svgElement('text', { class: 'diagram-text', x: 27, y: 199 }),
    b: svgElement('text', { class: 'diagram-text', x: 592, y: 199 }),
    c: svgElement('text', { class: 'diagram-text', x: 592, y: 25 }),
    d: svgElement('text', { class: 'diagram-text', x: 27, y: 25 }),
    p: svgElement('text', { class: 'diagram-text', 'data-tone': 'blue', y: 174 }),
    q: svgElement('text', { class: 'diagram-text', 'data-tone': 'blue', x: 598 }),
    ap: svgElement('text', { class: 'diagram-text', 'data-tone': 'blue', y: 211, 'text-anchor': 'middle' }),
    bq: svgElement('text', { class: 'diagram-text', 'data-tone': 'blue', x: 642, 'text-anchor': 'end' }),
    area: svgElement('text', { class: 'diagram-text', 'data-tone': 'red', x: 58, y: 49 }),
  }
  geometrySvg.append(
    areaRegion,
    rectangleOutline,
    apSegment,
    bqSegment,
    pGuide,
    qGuide,
    pPoint,
    qPoint,
    geometryTexts.a,
    geometryTexts.b,
    geometryTexts.c,
    geometryTexts.d,
    geometryTexts.p,
    geometryTexts.q,
    geometryTexts.ap,
    geometryTexts.bq,
    geometryTexts.area,
  )
  geometrySection.append(geometryHeading, geometrySvg)

  const graphSection = document.createElement('section')
  graphSection.className = 'visual-section'
  const graphHeading = document.createElement('p')
  graphHeading.className = 'section-heading'
  const graphSvg = svgElement('svg', {
    viewBox: '0 0 650 196',
    role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
  })
  const graphXAxis = svgElement('line', { class: 'graph-axis', x1: 42, y1: 126, x2: 625, y2: 126 })
  const graphYAxis = svgElement('line', { class: 'graph-axis', x1: 42, y1: 126, x2: 42, y2: 18 })
  const graphPath = svgElement('path', { class: 'graph-curve' })
  const graphVerticalGuide = svgElement('line', { class: 'active-guide', y2: 126 })
  const graphHorizontalGuide = svgElement('line', { class: 'active-guide', x1: 42 })
  const graphPoint = svgElement('circle', { class: 'graph-point', r: 6.3 })
  const graphMaximumLabel = svgElement('text', {
    class: 'diagram-text',
    'data-tone': 'red',
    x: 365,
    y: 36,
  })
  const graphAxisTimeLabel = svgElement('text', {
    class: 'diagram-text',
    x: 631,
    y: 132,
  })
  const graphAxisAreaLabel = svgElement('text', {
    class: 'diagram-text',
    x: 29,
    y: 16,
  })
  graphSvg.append(
    graphXAxis,
    graphYAxis,
    graphPath,
    graphVerticalGuide,
    graphHorizontalGuide,
    graphPoint,
    graphMaximumLabel,
    graphAxisTimeLabel,
    graphAxisAreaLabel,
  )
  const graphTickGroup = svgElement('g')
  graphSvg.append(graphTickGroup)
  const controlRow = document.createElement('div')
  controlRow.className = 'control-row'
  const timeSlider = document.createElement('input')
  timeSlider.type = 'range'
  timeSlider.step = '0.1'
  const timeReadout = document.createElement('output')
  timeReadout.className = 'time-readout'
  const keyboardHint = document.createElement('span')
  keyboardHint.className = 'keyboard-hint'
  controlRow.append(timeSlider, timeReadout)
  graphSection.append(graphHeading, graphSvg, keyboardHint, controlRow)
  visualColumn.append(geometrySection, graphSection)

  const liveRegion = document.createElement('p')
  liveRegion.className = 'sr-status'
  liveRegion.setAttribute('aria-live', 'polite')
  liveRegion.setAttribute('aria-atomic', 'true')
  sheet.append(formulaColumn, visualColumn)
  root.append(style, sheet, liveRegion)

  function setPalette(): void {
    const palette = props.palette
    root.style.setProperty('--paper', palette.paper)
    root.style.setProperty('--ink', palette.ink)
    root.style.setProperty('--muted', palette.muted)
    root.style.setProperty('--line', palette.line)
    root.style.setProperty('--blue', palette.blue)
    root.style.setProperty('--blue-soft', palette.blueSoft)
    root.style.setProperty('--red', palette.red)
    root.style.setProperty('--red-soft', palette.redSoft)
    root.style.setProperty('--focus', palette.focus)
    root.dataset.reducedMotion = String(Boolean(props.reducedMotion))
  }

  function graphCoordinates(input: number, area: number): { x: number; y: number } {
    const maximum = quadraticMaximum(deriveAreaTruth(model))
    const graphMaximum = Math.max(1, maximum.value * 1.12)
    return {
      x: 42 + ((input - model.tMin) / (model.tMax - model.tMin)) * 568,
      y: 126 - (area / graphMaximum) * 100,
    }
  }

  function buildGraph(): void {
    const truth = deriveAreaTruth(model)
    const path = sampleQuadraticPath(truth)
      .map(({ input, value }, index) => {
        const point = graphCoordinates(input, value)
        return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      })
      .join(' ')
    graphPath.setAttribute('d', path)
    graphTickGroup.replaceChildren()
    const span = model.tMax - model.tMin
    const integerTickCount = Math.min(8, Math.max(2, Math.round(span)))
    for (let index = 0; index <= integerTickCount; index += 1) {
      const value = model.tMin + span * (index / integerTickCount)
      const point = graphCoordinates(value, 0)
      const tick = svgElement('line', {
        class: 'guide-line',
        x1: point.x,
        x2: point.x,
        y1: 122,
        y2: 130,
      })
      const label = svgElement('text', {
        class: 'diagram-text',
        'data-tone': Math.abs(value - quadraticMaximum(truth).input) < EPSILON ? 'red' : 'muted',
        x: point.x,
        y: 148,
        'text-anchor': 'middle',
      })
      label.textContent = formatNumber(value)
      graphTickGroup.append(tick, label)
    }
  }

  function updateStaticContent(): void {
    const content = props.content
    const truth = deriveAreaTruth(model)
    const maximum = quadraticMaximum(truth)
    root.setAttribute('aria-label', content.ariaLabel)
    kicker.textContent = content.kicker
    formulaHeading.textContent = content.formulaHeading
    geometryHeading.textContent = content.geometryHeading
    graphHeading.textContent = content.graphHeading
    checkpointTitleText.textContent = content.checkpointLabel
    keyboardHint.textContent = content.keyboardHint
    geometryTexts.a.textContent = content.pointA
    geometryTexts.b.textContent = content.pointB
    geometryTexts.c.textContent = content.pointC
    geometryTexts.d.textContent = content.pointD
    geometryTexts.p.textContent = content.pointP
    geometryTexts.q.textContent = content.pointQ
    geometryTexts.area.textContent = content.areaRegionLabel
    graphMaximumLabel.textContent = content.maximumLabel
    graphAxisTimeLabel.textContent = 't'
    graphAxisAreaLabel.textContent = 'S(t)'
    timeSlider.min = String(model.tMin)
    timeSlider.max = String(model.tMax)
    timeSlider.setAttribute('aria-label', content.dragInstruction)
    timeSlider.setAttribute('aria-valuemin', String(model.tMin))
    timeSlider.setAttribute('aria-valuemax', String(model.tMax))
    replaceFormula(apFormula, [
      { text: `${content.apLabel} = ` },
      { text: `${formatNumber(model.pSpeed)}t`, tone: 'blue' },
    ], `${content.apLabel} 等于 ${formatNumber(model.pSpeed)}t`)
    replaceFormula(bqFormula, [
      { text: `${content.bqLabel} = ` },
      { text: `${formatNumber(model.rectangleHeight)} − ${formatNumber(model.qSpeed)}t`, tone: 'blue' },
    ], `${content.bqLabel} 等于 ${formatNumber(model.rectangleHeight)} 减 ${formatNumber(model.qSpeed)}t`)
    replaceFormula(domainFormula, [
      { text: `${formatNumber(model.tMin)} ≤ t ≤ ${formatNumber(model.tMax)}`, tone: 'blue' },
    ], `${content.domainLabel}：${formatNumber(model.tMin)} 小于等于 t 小于等于 ${formatNumber(model.tMax)}`)
    replaceFormula(areaFormula, [
      { text: 'S(t) = ' },
      { text: `${formatNumber(truth.linear)}t`, tone: 'blue' },
      { text: ' − ' },
      { text: `${formatNumber(truth.quadratic)}t`, tone: 'red' },
      { text: '2', tone: 'red', superscript: true },
    ], `S t 等于 ${formatNumber(truth.linear)}t 减 ${formatNumber(truth.quadratic)}t 的平方`)
    checkpointElements.forEach((element, index) => {
      const value = [model.tMin, maximum.input, model.tMax][index] ?? 0
      element.dataset.checkpoint = String(value)
      element.textContent = `t = ${formatNumber(value)}`
    })
    buildGraph()
  }

  function markCheckpoint(value: number): void {
    const maximum = quadraticMaximum(deriveAreaTruth(model))
    for (const checkpoint of [model.tMin, maximum.input, model.tMax]) {
      if (Math.abs(value - checkpoint) <= EPSILON) visited.add(checkpoint)
    }
  }

  function allCheckpointsSeen(): boolean {
    const maximum = quadraticMaximum(deriveAreaTruth(model))
    return [model.tMin, maximum.input, model.tMax].every((value) => visited.has(value))
  }

  function resolvedStatus(): string {
    const content = props.content
    if (mastered || props.phase === 'proved') return content.provedStatus
    if (suspended) return content.suspendedHint
    if (runtimeMode !== 'preview') return content.disabledHint
    if (statusOverride) return statusOverride
    const maximum = quadraticMaximum(deriveAreaTruth(model))
    const endpointsSeen = visited.has(model.tMin) && visited.has(model.tMax)
    if (allCheckpointsSeen()) return content.readyStatus
    if (endpointsSeen && !visited.has(maximum.input)) return content.endpointsStatus
    return content.exploreStatus
  }

  function render(): void {
    if (destroyed) return
    const snapshot = deriveLinkedGraphSnapshot(model, t)
    const truth = deriveAreaTruth(model)
    const maximum = quadraticMaximum(truth)
    const pX = 42 + (snapshot.p.x / model.rectangleWidth) * 544
    const qY = 182 - (snapshot.q.y / model.rectangleHeight) * 158
    areaRegion.setAttribute('points', `42,182 ${pX},182 586,${qY}`)
    apSegment.setAttribute('x2', String(pX))
    bqSegment.setAttribute('y2', String(qY))
    pGuide.setAttribute('x1', String(pX))
    pGuide.setAttribute('x2', String(pX))
    qGuide.setAttribute('y1', String(qY))
    qGuide.setAttribute('y2', String(qY))
    pPoint.setAttribute('cx', String(pX))
    qPoint.setAttribute('cy', String(qY))
    geometryTexts.p.setAttribute('x', String(Math.max(48, pX - 5)))
    geometryTexts.q.setAttribute('y', String(qY < 45 ? qY + 25 : qY - 9))
    geometryTexts.ap.setAttribute('x', String(42 + (pX - 42) / 2))
    geometryTexts.ap.textContent = `${props.content.apLabel} = ${formatNumber(snapshot.ap)}`
    geometryTexts.bq.setAttribute('y', String(qY + (182 - qY) / 2 + 5))
    geometryTexts.bq.textContent = `${props.content.bqLabel} = ${formatNumber(snapshot.bq)}`
    const graphPointCoordinates = graphCoordinates(snapshot.t, snapshot.area)
    graphPoint.setAttribute('cx', String(graphPointCoordinates.x))
    graphPoint.setAttribute('cy', String(graphPointCoordinates.y))
    graphVerticalGuide.setAttribute('x1', String(graphPointCoordinates.x))
    graphVerticalGuide.setAttribute('x2', String(graphPointCoordinates.x))
    graphVerticalGuide.setAttribute('y1', String(graphPointCoordinates.y))
    graphHorizontalGuide.setAttribute('x2', String(graphPointCoordinates.x))
    graphHorizontalGuide.setAttribute('y1', String(graphPointCoordinates.y))
    graphHorizontalGuide.setAttribute('y2', String(graphPointCoordinates.y))
    const maximumCoordinates = graphCoordinates(maximum.input, maximum.value)
    graphMaximumLabel.setAttribute('x', String(Math.min(515, maximumCoordinates.x + 14)))
    graphMaximumLabel.setAttribute('y', String(Math.max(26, maximumCoordinates.y - 7)))
    graphMaximumLabel.setAttribute(
      'visibility',
      mastered || props.phase === 'proved' ? 'visible' : 'hidden',
    )
    timeSlider.value = String(snapshot.t)
    timeSlider.setAttribute('aria-valuenow', formatNumber(snapshot.t))
    timeSlider.setAttribute(
      'aria-valuetext',
      `${props.content.timeLabel} ${formatNumber(snapshot.t)}，${props.content.areaLabel} ${formatNumber(snapshot.area)}`,
    )
    timeReadout.value = `t = ${formatNumber(snapshot.t)}`
    liveTime.textContent = `${props.content.timeLabel} = ${formatNumber(snapshot.t)}`
    liveArea.textContent = `S = ${formatNumber(snapshot.area)}`
    const status = resolvedStatus()
    liveRegion.textContent = `${status}。${props.content.timeLabel} ${formatNumber(snapshot.t)}，${props.content.areaLabel} ${formatNumber(snapshot.area)}`
    const checkpointTargets = [model.tMin, maximum.input, model.tMax]
    checkpointElements.forEach((element, index) => {
      const target = checkpointTargets[index] ?? 0
      const seen = visited.has(target)
      element.dataset.seen = String(seen)
      element.title = seen ? props.content.checkpointSeen : props.content.checkpointPending
    })
    const seenCount = checkpointTargets.filter((value) => visited.has(value)).length
    checkpointStatusText.textContent = `${seenCount} / 3`
    const interactive = runtimeMode === 'preview' && !suspended && !mastered
    const canNavigate = Boolean(props.content.nextLabel)
      && (mastered || props.phase === 'proved')
      && runtimeMode === 'preview'
      && !suspended
    timeSlider.disabled = !interactive
    confirmButton.disabled = canNavigate ? false : !interactive || !allCheckpointsSeen()
    confirmButton.textContent = canNavigate
      ? props.content.nextLabel
      : mastered || props.phase === 'proved'
        ? props.content.confirmedLabel
        : props.content.confirmLabel
  }

  function setTime(value: number, announce = true): void {
    t = Math.min(model.tMax, Math.max(model.tMin, value))
    markCheckpoint(t)
    statusOverride = ''
    render()
    if (!announce) liveRegion.textContent = ''
  }

  function flushPendingTime(): void {
    if (frameHandle !== 0) {
      cancelAnimationFrame(frameHandle)
      frameHandle = 0
    }
    if (pendingTime !== null) {
      const value = pendingTime
      pendingTime = null
      setTime(value)
    }
  }

  const handleSliderInput = (): void => {
    const value = Number(timeSlider.value)
    if (!Number.isFinite(value)) return
    if (!dragging) {
      setTime(value)
      return
    }
    pendingTime = value
    if (frameHandle === 0) {
      frameHandle = requestAnimationFrame(() => {
        frameHandle = 0
        if (pendingTime === null) return
        const next = pendingTime
        pendingTime = null
        setTime(next)
      })
    }
  }
  const handlePointerDown = (event: PointerEvent): void => {
    event.stopPropagation()
    dragging = true
    timeSlider.focus({ preventScroll: true })
  }
  const handlePointerUp = (event: PointerEvent): void => {
    event.stopPropagation()
    dragging = false
    flushPendingTime()
  }
  const handleSliderClick = (event: MouseEvent): void => {
    event.stopPropagation()
    timeSlider.focus({ preventScroll: true })
  }
  const handleSliderKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation()
    if (timeSlider.disabled) return
    const step = Number(timeSlider.step) || 0.1
    const keyboardTargets: Partial<Record<string, number>> = {
      ArrowLeft: t - step,
      ArrowDown: t - step,
      ArrowRight: t + step,
      ArrowUp: t + step,
      PageDown: t - step * 10,
      PageUp: t + step * 10,
      Home: model.tMin,
      End: model.tMax,
    }
    const target = keyboardTargets[event.key]
    if (target === undefined) return
    event.preventDefault()
    setTime(Math.round(target * 10) / 10)
  }
  const attemptMastery = (): void => {
    if (confirmButton.disabled || destroyed) return
    if ((mastered || props.phase === 'proved') && props.content.nextLabel) {
      ctx.emit('navigation.next', { mode: 'linked-graph' })
      return
    }
    const maximum = quadraticMaximum(deriveAreaTruth(model))
    const snapshot = deriveLinkedGraphSnapshot(model, t)
    if (Math.abs(t - maximum.input) > 0.11 || Math.abs(snapshot.area - maximum.value) > 0.11) {
      statusOverride = props.content.wrongPeakStatus
      render()
      return
    }
    mastered = true
    statusOverride = ''
    render()
    ctx.emit('linked.mastered', {
      t: snapshot.t,
      area: snapshot.area,
      maximum,
      visited: [model.tMin, maximum.input, model.tMax],
    })
  }
  const handleConfirm = (event: MouseEvent): void => {
    event.stopPropagation()
    attemptMastery()
  }
  const handleConfirmKeyDown = (event: KeyboardEvent): void => {
    event.stopPropagation()
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    attemptMastery()
  }

  timeSlider.addEventListener('input', handleSliderInput)
  timeSlider.addEventListener('pointerdown', handlePointerDown)
  timeSlider.addEventListener('pointerup', handlePointerUp)
  timeSlider.addEventListener('pointercancel', handlePointerUp)
  timeSlider.addEventListener('click', handleSliderClick)
  timeSlider.addEventListener('keydown', handleSliderKeyDown)
  confirmButton.addEventListener('click', handleConfirm)
  confirmButton.addEventListener('keydown', handleConfirmKeyDown)

  function applyPhase(): void {
    const truth = deriveAreaTruth(model)
    const maximum = quadraticMaximum(truth)
    if (props.phase === 'proved') {
      mastered = true
      visited.add(model.tMin)
      visited.add(maximum.input)
      visited.add(model.tMax)
      t = maximum.input
    }
  }

  function applySize(): void {
    root.style.width = `${Math.max(1, width)}px`
    root.style.height = `${Math.max(1, height)}px`
  }

  setPalette()
  applyPhase()
  applySize()
  updateStaticContent()
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
      render()
    },
    updateProps(nextProps) {
      props = nextProps
      model = linkedGraphModelFromProps(props) ?? BASE_LINKED_GRAPH_MODEL
      setPalette()
      applyPhase()
      updateStaticContent()
      t = Math.min(model.tMax, Math.max(model.tMin, t))
      render()
    },
    setVisible(nextVisible) {
      visible = nextVisible
      root.style.display = visible ? 'block' : 'none'
      root.setAttribute('aria-hidden', String(!visible))
    },
    suspend() {
      suspended = true
      dragging = false
      flushPendingTime()
      render()
    },
    resume() {
      suspended = false
      render()
    },
    prepareCapture() {
      flushPendingTime()
      applyPhase()
      render()
      root.dataset.captureReady = 'true'
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (frameHandle !== 0) cancelAnimationFrame(frameHandle)
      frameHandle = 0
      pendingTime = null
      timeSlider.removeEventListener('input', handleSliderInput)
      timeSlider.removeEventListener('pointerdown', handlePointerDown)
      timeSlider.removeEventListener('pointerup', handlePointerUp)
      timeSlider.removeEventListener('pointercancel', handlePointerUp)
      timeSlider.removeEventListener('click', handleSliderClick)
      timeSlider.removeEventListener('keydown', handleSliderKeyDown)
      confirmButton.removeEventListener('click', handleConfirm)
      confirmButton.removeEventListener('keydown', handleConfirmKeyDown)
      root.classList.remove(instanceClass)
      root.replaceChildren()
    },
  }
}

export function createMotionFunctionLab(ctx: ComponentContext): MotionFunctionLabLifecycle {
  let currentProps = ctx.props
  let currentMode = ctx.mode
  let width = ctx.width
  let height = ctx.height
  let visible = true
  let suspended = false

  const createInner = (): MotionFunctionLabLifecycle => {
    const nextContext = {
      ...ctx,
      width,
      height,
      mode: currentMode,
      props: currentProps,
    }
    if (currentProps.mode === 'linked-graph') return createLinkedGraphLab(nextContext)
    if (isStructuredLabMode(currentProps.mode)) {
      return createStructuredMode(
        nextContext as Parameters<typeof createStructuredMode>[0],
      ) as unknown as MotionFunctionLabLifecycle
    }
    throw new Error(`不支持的动点课程模式：${String(currentProps.mode)}`)
  }

  let inner = createInner()

  return {
    setMode(mode) {
      currentMode = mode
      inner.setMode(mode)
    },
    resize(nextWidth, nextHeight) {
      width = nextWidth
      height = nextHeight
      inner.resize(nextWidth, nextHeight)
    },
    updateProps(nextProps) {
      const changedMode = nextProps.mode !== currentProps.mode
      currentProps = nextProps
      if (!changedMode) {
        inner.updateProps(nextProps)
        return
      }
      inner.destroy()
      inner = createInner()
      if (!visible) inner.setVisible(false)
      if (suspended) inner.suspend()
    },
    setVisible(nextVisible) {
      visible = nextVisible
      inner.setVisible(nextVisible)
    },
    suspend() {
      suspended = true
      inner.suspend()
    },
    resume() {
      suspended = false
      inner.resume()
    },
    prepareCapture() {
      inner.prepareCapture()
    },
    destroy() {
      inner.destroy()
    },
  }
}

;(globalThis as unknown as CoursewareComponentGlobal).CoursewareComponent.define({
  id: 'com.alepha.math.motion-function-lab',
  runtimeApiVersion: 4,
  create: createMotionFunctionLab,
})
