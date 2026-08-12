type RuntimeMode = 'edit' | 'preview' | 'capture'
type LessonMode = 'prediction' | 'lab' | 'model' | 'lenz' | 'transfer'
type PredictionDirection = 'left' | 'zero' | 'right'
type TrialKind = 'slow' | 'fast' | 'hold' | 'recede'

interface CommonContent {
  ariaLabel: string
  canvasLabel: string
  eyebrow: string
  magnetNorth: string
  magnetSouth: string
  meterLabel: string
  fluxLabel: string
  voltageLabel: string
  timeLabel: string
  zeroLabel: string
  phaseApproach: string
  phaseHold: string
  phaseRecede: string
  directionLeft: string
  directionZero: string
  directionRight: string
  disabledHint: string
  captureHint: string
  suspendedHint: string
}

interface PredictionContent {
  title: string
  prompt: string
  instruction: string
  choiceLeft: string
  choiceZero: string
  choiceRight: string
  lockLabel: string
  incompleteStatus: string
  readyStatus: string
  lockedStatus: string
}

interface LabContent {
  title: string
  prompt: string
  instruction: string
  slowApproach: string
  fastApproach: string
  holdNear: string
  recede: string
  resetLabel: string
  recordPrefix: string
  recordSuffix: string
  slowResult: string
  fastResult: string
  holdResult: string
  recedeResult: string
  dragHint: string
  readyStatus: string
  evidenceStatus: string
  compareLabel: string
}

interface ModelContent {
  title: string
  prompt: string
  instruction: string
  formulaFlux: string
  formulaEmf: string
  closedCircuitNote: string
  slopeCallout: string
  zeroCallout: string
  fieldLabel: string
  areaLabel: string
  angleLabel: string
  verifyLabel: string
  needsExploreStatus: string
  repairStatus: string
  masteredStatus: string
}

interface LenzContent {
  title: string
  prompt: string
  instruction: string
  approachWorked: string
  recedeQuestion: string
  chooseLeft: string
  chooseRight: string
  submitLabel: string
  attemptStatus: string
  repairStatus: string
  masteredStatus: string
  principle: string
}

interface TransferContent {
  title: string
  prompt: string
  instruction: string
  case1Title: string
  case1Reason: string
  case2Title: string
  case2Reason: string
  case3Title: string
  case3Reason: string
  yesLabel: string
  noLabel: string
  checkLabel: string
  incompleteStatus: string
  repairStatus: string
  masteredStatus: string
  summaryLabel: string
}

interface InductionContent {
  common: CommonContent
  prediction: PredictionContent
  lab: LabContent
  model: ModelContent
  lenz: LenzContent
  transfer: TransferContent
}

interface InductionProps {
  mode: LessonMode
  content: InductionContent
  copper: string
  copperLight: string
  northColor: string
  southColor: string
  fluxColor: string
  voltageColor: string
  ink: string
  paper: string
  reducedMotion: boolean
}

interface ComponentContext {
  runtimeApiVersion: 4
  renderMode: 'dom'
  instanceId: string
  width: number
  height: number
  mode: RuntimeMode
  props: InductionProps
  scope: 'scene' | 'global'
  dom: { root: HTMLElement }
  assetUrl(assetKey: string): string
  capture: { waitUntil(promise: Promise<unknown>): void }
  emit(eventName: string, payload?: unknown): void
}

interface ComponentLifecycle {
  setMode(mode: RuntimeMode): void
  resize(width: number, height: number): void
  updateProps(props: InductionProps): void
  setVisible(visible: boolean): void
  suspend(): void
  resume(): void
  prepareCapture(): void
  destroy(): void
}

declare global {
  var CoursewareComponent: {
    define(definition: {
      id: string
      runtimeApiVersion: 4
      create(context: ComponentContext): ComponentLifecycle
    }): void
  }
}

const clamp = (value: number, minimum: number, maximum: number): number => (
  Math.min(maximum, Math.max(minimum, value))
)

const smoothStep = (value: number): number => {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  styles: Partial<CSSStyleDeclaration> = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  Object.assign(element.style, styles)
  return element
}

function loadImage(image: HTMLImageElement, source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleLoad = () => {
      image.removeEventListener('error', handleError)
      const decoding = typeof image.decode === 'function' ? image.decode() : Promise.resolve()
      decoding.catch(() => undefined).finally(resolve)
    }
    const handleError = () => {
      image.removeEventListener('load', handleLoad)
      reject(new Error(`Unable to load packaged component asset: ${source}`))
    }
    image.addEventListener('load', handleLoad, { once: true })
    image.addEventListener('error', handleError, { once: true })
    image.src = source
  })
}

globalThis.CoursewareComponent.define({
  id: 'com.ittoedu.physics.induction-lab',
  runtimeApiVersion: 4,

  create(ctx) {
    if (ctx.renderMode !== 'dom') {
      throw new Error('Induction lab component requires renderMode=dom')
    }
    if (ctx.scope !== 'scene') {
      throw new Error('Induction lab component supports scene scope only')
    }

    let runtimeMode = ctx.mode
    let props = ctx.props
    let lessonMode = props.mode
    let visible = true
    let suspended = false
    let destroyed = false
    let width = ctx.width
    let height = ctx.height
    let animationFrame = 0
    let animationStart = 0
    let animationDuration = 0
    let animationFrom = 0
    let animationTo = 0
    let animationSignal = 0
    let animationKind: TrialKind | null = null
    let dragging = false
    let dragPointerId = -1
    const initialMagnetPosition = lessonMode === 'model' || lessonMode === 'lenz' ? 1 : 0
    let magnetPosition = initialMagnetPosition
    let previousMagnetPosition = initialMagnetPosition
    let previousDragTime = 0
    let dragPointerOffset = 0
    let dragStartPosition = 0
    let needleValue = 0
    let timeline = 0.5
    let fieldScale = 1
    let areaScale = 1
    let angleDegrees = 0
    let modelTimelineTouched = false
    let modelParameterTouched = false
    let statusText = ''
    let emittedEvidenceComplete = false
    let emittedModelSlopeTask = false
    let emittedModelMastered = false
    let emittedLenzAttempt = false
    let emittedLenzMastered = false
    let emittedTransferMastered = false
    let predictionLocked = false
    const predictions: Partial<Record<'approach' | 'hold' | 'recede', PredictionDirection>> = {}
    const trials = new Set<TrialKind>()
    const timeoutHandles = new Set<number>()
    let lenzChoice: 'left' | 'right' | null = null
    const transferChoices: Array<boolean | null> = [null, null, null]

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const shouldReduceMotion = (): boolean => Boolean(props.reducedMotion || prefersReducedMotion?.matches)
    const canInteract = (): boolean => runtimeMode === 'preview' && visible && !suspended && !destroyed
    const emit = (eventName: string, payload?: unknown): void => {
      if (!canInteract()) return
      ctx.emit(eventName, payload)
    }

    const host = createElement('section', {
      position: 'absolute',
      inset: '0',
      display: 'grid',
      gridTemplateRows: 'minmax(0, 1fr)',
      overflow: 'hidden',
      boxSizing: 'border-box',
      color: props.ink,
      background: props.paper,
      border: '1px solid rgba(70, 58, 45, .16)',
      borderRadius: '22px',
      fontFamily: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif',
      boxShadow: '0 22px 70px rgba(58, 46, 34, .11)',
    })
    host.setAttribute('aria-label', props.content.common.ariaLabel)

    const topGrid = createElement('div', {
      minHeight: '0',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, 29%)',
      gridTemplateRows: '58% 42%',
    })
    const apparatusStage = createElement('div', {
      position: 'relative',
      minWidth: '0',
      minHeight: '0',
      overflow: 'hidden',
      background: '#f4efe7',
      borderRight: '1px solid rgba(82, 68, 53, .12)',
    })
    apparatusStage.setAttribute('role', 'img')
    apparatusStage.setAttribute('aria-label', props.content.common.canvasLabel)

    const apparatusViewport = createElement('div', {
      position: 'absolute',
      left: '0',
      top: '50%',
      width: '100%',
      aspectRatio: '1672 / 585',
      transform: 'translateY(-50%)',
    })

    const apparatusImage = createElement('img', {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'fill',
      userSelect: 'none',
      pointerEvents: 'none',
    }) as HTMLImageElement
    apparatusImage.alt = ''
    apparatusImage.draggable = false

    const needle = createElement('div', {
      position: 'absolute',
      zIndex: '3',
      left: '85.03%',
      top: '31.9%',
      width: '2px',
      height: '15.9%',
      borderRadius: '999px',
      transformOrigin: '50% 100%',
      background: props.voltageColor,
      boxShadow: '0 0 2px rgba(100, 20, 20, .28)',
      pointerEvents: 'none',
    })

    const magnet = createElement('div', {
      position: 'absolute',
      zIndex: '4',
      left: '2.2%',
      top: '46.8%',
      width: '25.4%',
      aspectRatio: '1402 / 324',
      transform: 'translateY(-50%)',
      cursor: 'ew-resize',
      touchAction: 'none',
      outline: 'none',
      userSelect: 'none',
      filter: 'drop-shadow(0 8px 8px rgba(57, 43, 29, .20))',
    })
    magnet.tabIndex = 0
    magnet.setAttribute('role', 'slider')
    magnet.setAttribute('aria-valuemin', '0')
    magnet.setAttribute('aria-valuemax', '100')
    magnet.setAttribute('aria-orientation', 'horizontal')

    const magnetImage = createElement('img', {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      pointerEvents: 'none',
      userSelect: 'none',
    }) as HTMLImageElement
    magnetImage.alt = ''
    magnetImage.draggable = false
    const southLabel = createElement('span', {
      position: 'absolute',
      left: '23%',
      top: '50%',
      transform: 'translate(-50%, -53%)',
      color: '#f7f3ec',
      fontSize: 'clamp(12px, 1.45vw, 20px)',
      fontWeight: '800',
      letterSpacing: '.04em',
      textShadow: '0 1px 2px rgba(0,0,0,.4)',
      pointerEvents: 'none',
    })
    const northLabel = createElement('span', {
      position: 'absolute',
      left: '76%',
      top: '50%',
      transform: 'translate(-50%, -53%)',
      color: '#fff8ef',
      fontSize: 'clamp(12px, 1.45vw, 20px)',
      fontWeight: '800',
      letterSpacing: '.04em',
      textShadow: '0 1px 2px rgba(0,0,0,.4)',
      pointerEvents: 'none',
    })
    magnet.append(magnetImage, southLabel, northLabel)

    const axisGuide = createElement('div', {
      position: 'absolute',
      zIndex: '1',
      left: '2.2%',
      right: '49.8%',
      top: '46.8%',
      borderTop: '1px dashed rgba(52, 47, 42, .19)',
      pointerEvents: 'none',
    })
    const meterCaption = createElement('span', {
      position: 'absolute',
      zIndex: '4',
      right: '4.2%',
      top: '9.5%',
      padding: '4px 8px',
      color: '#5e574e',
      background: 'rgba(247, 243, 235, .84)',
      border: '1px solid rgba(75, 62, 49, .12)',
      borderRadius: '999px',
      fontSize: '10px',
      fontWeight: '700',
      pointerEvents: 'none',
    })
    apparatusViewport.append(apparatusImage, axisGuide, needle, magnet, meterCaption)
    apparatusStage.append(apparatusViewport)

    const controlPanel = createElement('aside', {
      minHeight: '0',
      overflow: 'auto',
      padding: '18px 18px 14px',
      boxSizing: 'border-box',
      background: 'linear-gradient(155deg, rgba(255,255,255,.64), rgba(235,228,216,.86))',
      borderBottom: '1px solid rgba(82, 68, 53, .12)',
    })
    const controlContent = createElement('div', {
      display: 'grid',
      gap: '11px',
      alignContent: 'start',
    })
    controlPanel.append(controlContent)

    const chartPanel = createElement('section', {
      position: 'relative',
      gridColumn: '1 / -1',
      minHeight: '0',
      overflow: 'hidden',
      background: 'rgba(255, 253, 248, .86)',
      borderTop: '1px solid rgba(82, 68, 53, .12)',
    })
    const chartCanvas = createElement('canvas', {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
    }) as HTMLCanvasElement
    chartCanvas.setAttribute('aria-label', `${props.content.common.fluxLabel} / ${props.content.common.voltageLabel}`)
    const chartOverlay = createElement('div', {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
    })
    chartPanel.append(chartCanvas, chartOverlay)

    topGrid.append(apparatusStage, controlPanel, chartPanel)
    host.append(topGrid)
    ctx.dom.root.append(host)

    const imageReady = Promise.all([
      loadImage(apparatusImage, ctx.assetUrl('apparatus')),
      loadImage(magnetImage, ctx.assetUrl('magnet')),
    ]).then(() => {
      if (!destroyed) drawAll()
    })
    ctx.capture.waitUntil(imageReady)

    function setEditableText(element: HTMLElement, key: string, label: string, multiline = false): void {
      element.dataset.coursewareEditKey = key
      element.dataset.coursewareEditLabel = label
      if (multiline) element.dataset.coursewareEditMultiline = 'true'
    }

    function makeHeading(titleText: string, promptText: string, instructionText: string, prefix: string): void {
      const eyebrow = createElement('div', {
        color: '#766757',
        fontSize: '9px',
        fontWeight: '800',
        letterSpacing: '.15em',
      })
      eyebrow.textContent = props.content.common.eyebrow
      setEditableText(eyebrow, 'content.common.eyebrow', '英文眉标')
      const title = createElement('h2', {
        margin: '0',
        color: props.ink,
        fontSize: '20px',
        lineHeight: '1.18',
        fontWeight: '800',
        letterSpacing: '-.02em',
      })
      title.textContent = titleText
      setEditableText(title, `content.${prefix}.title`, '环节标题')
      const prompt = createElement('p', {
        margin: '0',
        color: '#302b26',
        fontSize: '12px',
        fontWeight: '700',
        lineHeight: '1.55',
      })
      prompt.textContent = promptText
      setEditableText(prompt, `content.${prefix}.prompt`, '核心问题', true)
      const instruction = createElement('p', {
        margin: '0',
        color: '#756b61',
        fontSize: '10px',
        lineHeight: '1.55',
      })
      instruction.textContent = instructionText
      setEditableText(instruction, `content.${prefix}.instruction`, '操作指导', true)
      controlContent.append(eyebrow, title, prompt, instruction)
    }

    function makeButton(
      label: string,
      editKey: string,
      editLabel: string,
      primary = false,
    ): HTMLButtonElement {
      const button = createElement('button', {
        minHeight: '34px',
        padding: '7px 10px',
        border: primary ? '1px solid #2d2925' : '1px solid rgba(66, 55, 44, .24)',
        borderRadius: '9px',
        color: primary ? '#fffdf8' : '#39332d',
        background: primary ? '#2d2925' : 'rgba(255, 253, 248, .72)',
        fontFamily: 'inherit',
        fontSize: '10px',
        fontWeight: '800',
        lineHeight: '1.2',
        cursor: 'pointer',
        transition: shouldReduceMotion() ? 'none' : 'background .16s ease, border-color .16s ease, transform .16s ease',
      })
      button.type = 'button'
      button.textContent = label
      setEditableText(button, editKey, editLabel)
      button.disabled = !canInteract()
      return button
    }

    function makeStatus(textValue: string): HTMLOutputElement {
      const output = createElement('output', {
        display: 'block',
        minHeight: '31px',
        padding: '8px 10px',
        boxSizing: 'border-box',
        color: '#5f554b',
        background: 'rgba(255, 253, 248, .72)',
        borderLeft: `3px solid ${props.copper}`,
        borderRadius: '3px 8px 8px 3px',
        fontSize: '9px',
        lineHeight: '1.55',
      }) as HTMLOutputElement
      output.textContent = textValue
      output.setAttribute('aria-live', 'polite')
      return output
    }

    function setButtonSelected(button: HTMLButtonElement, selected: boolean): void {
      button.setAttribute('aria-pressed', String(selected))
      Object.assign(button.style, selected ? {
        color: '#2f2a25',
        borderColor: props.copper,
        background: `${props.copperLight}33`,
        boxShadow: `inset 0 0 0 1px ${props.copper}44`,
      } : {
        color: '#39332d',
        borderColor: 'rgba(66, 55, 44, .24)',
        background: 'rgba(255, 253, 248, .72)',
        boxShadow: 'none',
      })
    }

    function renderPredictionControls(): void {
      const content = props.content.prediction
      makeHeading(content.title, content.prompt, content.instruction, 'prediction')
      const phases: Array<['approach' | 'hold' | 'recede', string]> = [
        ['approach', props.content.common.phaseApproach],
        ['hold', props.content.common.phaseHold],
        ['recede', props.content.common.phaseRecede],
      ]
      const choiceLabels: Array<[PredictionDirection, string, string, string]> = [
        ['left', content.choiceLeft, 'content.prediction.choiceLeft', '预测选项：左'],
        ['zero', content.choiceZero, 'content.prediction.choiceZero', '预测选项：零'],
        ['right', content.choiceRight, 'content.prediction.choiceRight', '预测选项：右'],
      ]
      const predictionGrid = createElement('div', { display: 'grid', gap: '7px' })
      for (const [phaseId, phaseLabel] of phases) {
        const row = createElement('div', {
          display: 'grid',
          gridTemplateColumns: '58px repeat(3, 1fr)',
          gap: '5px',
          alignItems: 'center',
        })
        const label = createElement('span', {
          color: '#5d554d',
          fontSize: '9px',
          fontWeight: '800',
        })
        label.textContent = phaseLabel
        row.append(label)
        for (const [choiceId, choiceLabel, editKey, editLabel] of choiceLabels) {
          const button = makeButton(choiceLabel, editKey, editLabel)
          button.style.minHeight = '28px'
          button.style.padding = '5px 6px'
          button.disabled = !canInteract() || predictionLocked
          setButtonSelected(button, predictions[phaseId] === choiceId)
          button.addEventListener('click', () => {
            if (!canInteract()) return
            predictions[phaseId] = choiceId
            statusText = Object.keys(predictions).length === 3 ? content.readyStatus : content.incompleteStatus
            renderControls()
            drawAll()
          })
          row.append(button)
        }
        predictionGrid.append(row)
      }
      const lockButton = makeButton(
        content.lockLabel,
        'content.prediction.lockLabel',
        '锁定预测按钮',
        true,
      )
      lockButton.disabled = !canInteract() || predictionLocked || Object.keys(predictions).length < 3
      lockButton.addEventListener('click', () => {
        if (!canInteract() || predictionLocked || Object.keys(predictions).length < 3) return
        predictionLocked = true
        statusText = content.lockedStatus
        emit('prediction.locked', { predictions: { ...predictions } })
        renderControls()
      })
      controlContent.append(predictionGrid, lockButton, makeStatus(statusText || content.incompleteStatus))
    }

    function resultForTrial(kind: TrialKind): string {
      const content = props.content.lab
      if (kind === 'slow') return content.slowResult
      if (kind === 'fast') return content.fastResult
      if (kind === 'hold') return content.holdResult
      return content.recedeResult
    }

    function recordTrial(kind: TrialKind): void {
      const wasNew = !trials.has(kind)
      trials.add(kind)
      statusText = resultForTrial(kind)
      if (wasNew) emit('trial.recorded', { kind, completed: trials.size, total: 4 })
      if (trials.size === 4 && !emittedEvidenceComplete) {
        emittedEvidenceComplete = true
        statusText = props.content.lab.evidenceStatus
        emit('evidence.complete', { trials: Array.from(trials) })
      }
      renderControls()
      drawAll()
    }

    function startTrial(kind: TrialKind): void {
      if (!canInteract()) return
      const targets: Record<TrialKind, { from: number; to: number; duration: number; signal: number }> = {
        slow: { from: 0, to: 1, duration: 1550, signal: -0.45 },
        fast: { from: 0, to: 1, duration: 640, signal: -0.92 },
        hold: { from: 1, to: 1, duration: 420, signal: 0 },
        recede: { from: 1, to: 0, duration: 920, signal: 0.72 },
      }
      const spec = targets[kind]
      animationKind = kind
      animationFrom = spec.from
      animationTo = spec.to
      animationDuration = shouldReduceMotion() ? 0 : spec.duration
      animationSignal = spec.signal
      animationStart = performance.now()
      magnetPosition = spec.from
      previousMagnetPosition = spec.from
      if (animationDuration === 0) {
        magnetPosition = spec.to
        needleValue = kind === 'hold' ? 0 : spec.signal
        updateApparatus()
        drawAll()
        needleValue = 0
        animationKind = null
        recordTrial(kind)
        updateApparatus()
        return
      }
      requestTick()
    }

    function renderLabControls(): void {
      const content = props.content.lab
      makeHeading(content.title, content.prompt, content.instruction, 'lab')
      const grid = createElement('div', {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '7px',
      })
      const actions: Array<[TrialKind, string, string, string]> = [
        ['slow', content.slowApproach, 'content.lab.slowApproach', '慢速接近按钮'],
        ['fast', content.fastApproach, 'content.lab.fastApproach', '快速接近按钮'],
        ['hold', content.holdNear, 'content.lab.holdNear', '近处停住按钮'],
        ['recede', content.recede, 'content.lab.recede', '远离线圈按钮'],
      ]
      for (const [kind, label, editKey, editLabel] of actions) {
        const button = makeButton(label, editKey, editLabel)
        if (trials.has(kind)) setButtonSelected(button, true)
        button.addEventListener('click', () => startTrial(kind))
        grid.append(button)
      }
      const progress = createElement('div', {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        color: '#70675e',
        fontSize: '9px',
        fontWeight: '800',
      })
      const progressText = createElement('span')
      progressText.textContent = `${content.recordPrefix} ${trials.size} / ${content.recordSuffix}`
      const resetButton = makeButton(
        content.resetLabel,
        'content.lab.resetLabel',
        '重置证据按钮',
      )
      resetButton.style.minHeight = '28px'
      resetButton.addEventListener('click', () => {
        if (!canInteract()) return
        trials.clear()
        emittedEvidenceComplete = false
        magnetPosition = 0
        needleValue = 0
        statusText = content.readyStatus
        renderControls()
        drawAll()
      })
      progress.append(progressText, resetButton)
      const dragHint = createElement('div', {
        color: '#766e65',
        fontSize: '9px',
        lineHeight: '1.4',
      })
      dragHint.textContent = content.dragHint
      const compareButton = makeButton(
        content.compareLabel,
        'content.lab.compareLabel',
        '对照预测按钮',
        true,
      )
      compareButton.disabled = !canInteract() || trials.size < 4
      compareButton.addEventListener('click', () => emit('prediction.compare', { trials: Array.from(trials) }))
      controlContent.append(grid, progress, dragHint, compareButton, makeStatus(statusText || content.readyStatus))
    }

    function makeRange(
      labelText: string,
      minimum: number,
      maximum: number,
      step: number,
      value: number,
      onInput: (next: number) => void,
      format: (next: number) => string,
    ): HTMLLabelElement {
      const label = createElement('label', {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '4px 8px',
        color: '#675f57',
        fontSize: '9px',
        fontWeight: '700',
      })
      const textLabel = createElement('span')
      textLabel.textContent = labelText
      const output = createElement('output', { color: props.copper, fontVariantNumeric: 'tabular-nums' })
      output.textContent = format(value)
      const input = createElement('input', {
        gridColumn: '1 / -1',
        width: '100%',
        accentColor: props.copper,
        cursor: 'pointer',
      }) as HTMLInputElement
      input.type = 'range'
      input.min = String(minimum)
      input.max = String(maximum)
      input.step = String(step)
      input.value = String(value)
      input.disabled = !canInteract()
      input.addEventListener('input', () => {
        if (!canInteract()) return
        const next = Number(input.value)
        output.textContent = format(next)
        onInput(next)
      })
      label.append(textLabel, output, input)
      return label
    }

    function renderModelControls(): void {
      const content = props.content.model
      makeHeading(content.title, content.prompt, content.instruction, 'model')
      const formulas = createElement('div', {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '6px',
      })
      for (const [text, key] of [
        [content.formulaFlux, 'content.model.formulaFlux'],
        [content.formulaEmf, 'content.model.formulaEmf'],
      ] as const) {
        const formula = createElement('div', {
          padding: '7px 8px',
          color: '#2c2926',
          background: 'rgba(255,255,255,.66)',
          border: '1px solid rgba(67,55,44,.12)',
          borderRadius: '8px',
          fontFamily: 'Cambria Math, Georgia, serif',
          fontSize: '11px',
          fontWeight: '700',
          textAlign: 'center',
        })
        formula.textContent = text
        setEditableText(formula, key, '公式')
        formulas.append(formula)
      }
      const ranges = createElement('div', { display: 'grid', gap: '7px' })
      ranges.append(
        makeRange(props.content.common.timeLabel, 0, 1, 0.01, timeline, (next) => {
          timeline = next
          modelTimelineTouched = true
          if (!emittedModelSlopeTask) {
            emittedModelSlopeTask = true
            emit('model.slope-task', { timeline })
          }
          magnetPosition = timeline < 0.36 ? timeline / 0.36 : timeline <= 0.64 ? 1 : (1 - timeline) / 0.36
          needleValue = voltageAt(timeline)
          drawAll()
        }, (next) => next.toFixed(2)),
        makeRange(content.fieldLabel, 0.6, 1.4, 0.1, fieldScale, (next) => {
          fieldScale = next
          modelParameterTouched = true
          drawAll()
        }, (next) => next.toFixed(1)),
        makeRange(content.areaLabel, 0.7, 1.3, 0.1, areaScale, (next) => {
          areaScale = next
          modelParameterTouched = true
          drawAll()
        }, (next) => next.toFixed(1)),
        makeRange(content.angleLabel, 0, 75, 5, angleDegrees, (next) => {
          angleDegrees = next
          modelParameterTouched = true
          drawAll()
        }, (next) => `${next}°`),
      )
      const callout = createElement('div', {
        padding: '7px 9px',
        color: '#8f3236',
        background: `${props.voltageColor}12`,
        borderLeft: `3px solid ${props.voltageColor}`,
        borderRadius: '3px 8px 8px 3px',
        fontSize: '10px',
        fontWeight: '800',
      })
      callout.textContent = content.slopeCallout
      setEditableText(callout, 'content.model.slopeCallout', '模型核心句')
      const verifyButton = makeButton(
        content.verifyLabel,
        'content.model.verifyLabel',
        '验证关系按钮',
        true,
      )
      verifyButton.addEventListener('click', () => {
        if (!canInteract()) return
        if (!modelTimelineTouched || !modelParameterTouched) {
          statusText = content.needsExploreStatus
          emit('model.repair', { reason: 'exploration-incomplete' })
        } else if (timeline < 0.38 || timeline > 0.62) {
          statusText = content.repairStatus
          emit('model.repair', { reason: 'cursor-outside-hold', timeline })
        } else {
          statusText = content.masteredStatus
          if (!emittedModelMastered) {
            emittedModelMastered = true
            emit('model.mastered', { timeline, fieldScale, areaScale, angleDegrees })
          }
        }
        renderControls()
      })
      controlContent.append(formulas, ranges, callout, verifyButton, makeStatus(statusText || content.zeroCallout))
    }

    function renderLenzControls(): void {
      const content = props.content.lenz
      makeHeading(content.title, content.prompt, content.instruction, 'lenz')
      const worked = createElement('div', {
        padding: '9px 10px',
        color: '#3e3934',
        background: `${props.fluxColor}0f`,
        border: `1px solid ${props.fluxColor}26`,
        borderRadius: '9px',
        fontSize: '9px',
        lineHeight: '1.5',
      })
      worked.textContent = content.approachWorked
      const question = createElement('div', {
        color: '#4b443d',
        fontSize: '10px',
        fontWeight: '800',
        lineHeight: '1.5',
      })
      question.textContent = content.recedeQuestion
      const choiceGrid = createElement('div', {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '7px',
      })
      for (const [choice, label, editKey, editLabel] of [
        ['left', content.chooseLeft, 'content.lenz.chooseLeft', '向左按钮'],
        ['right', content.chooseRight, 'content.lenz.chooseRight', '向右按钮'],
      ] as const) {
        const button = makeButton(label, editKey, editLabel)
        setButtonSelected(button, lenzChoice === choice)
        button.addEventListener('click', () => {
          if (!canInteract()) return
          lenzChoice = choice
          statusText = content.attemptStatus
          if (!emittedLenzAttempt) {
            emittedLenzAttempt = true
            emit('lenz.recede-attempt', { choice })
          }
          renderControls()
          drawAll()
        })
        choiceGrid.append(button)
      }
      const submit = makeButton(
        content.submitLabel,
        'content.lenz.submitLabel',
        '检查方向按钮',
        true,
      )
      submit.disabled = !canInteract() || lenzChoice === null
      submit.addEventListener('click', () => {
        if (!canInteract() || lenzChoice === null) return
        if (lenzChoice === 'right') {
          statusText = content.masteredStatus
          if (!emittedLenzMastered) {
            emittedLenzMastered = true
            emit('lenz.mastered', { choice: lenzChoice })
          }
        } else {
          statusText = content.repairStatus
          emit('lenz.repair', { choice: lenzChoice })
        }
        renderControls()
      })
      const principle = createElement('div', {
        padding: '8px 10px',
        color: '#fffaf2',
        background: '#302b26',
        borderRadius: '9px',
        fontSize: '11px',
        fontWeight: '800',
        textAlign: 'center',
        letterSpacing: '.04em',
      })
      principle.textContent = content.principle
      setEditableText(principle, 'content.lenz.principle', '楞次定律核心句')
      controlContent.append(worked, question, choiceGrid, submit, principle, makeStatus(statusText || content.attemptStatus))
    }

    function renderTransferControls(): void {
      const content = props.content.transfer
      makeHeading(content.title, content.prompt, content.instruction, 'transfer')
      const compactNote = createElement('div', {
        padding: '9px 10px',
        color: '#3f3933',
        background: 'rgba(255,255,255,.58)',
        border: '1px solid rgba(70,58,45,.12)',
        borderRadius: '9px',
        fontFamily: 'Cambria Math, Georgia, serif',
        fontSize: '12px',
        textAlign: 'center',
      })
      compactNote.textContent = props.content.model.formulaFlux
      const check = makeButton(
        content.checkLabel,
        'content.transfer.checkLabel',
        '检查三组判断按钮',
        true,
      )
      check.disabled = !canInteract() || transferChoices.some((choice) => choice === null)
      check.addEventListener('click', () => {
        if (!canInteract()) return
        if (transferChoices.some((choice) => choice === null)) {
          statusText = content.incompleteStatus
        } else {
          const correct = transferChoices[0] === true && transferChoices[1] === true && transferChoices[2] === false
          if (correct) {
            statusText = content.masteredStatus
            if (!emittedTransferMastered) {
              emittedTransferMastered = true
              emit('transfer.mastered', { answers: [...transferChoices] })
            }
          } else {
            statusText = content.repairStatus
            emit('transfer.repair', { answers: [...transferChoices] })
          }
        }
        renderControls()
        drawAll()
      })
      const summary = makeButton(
        content.summaryLabel,
        'content.transfer.summaryLabel',
        '完成概念重建按钮',
      )
      summary.disabled = !canInteract() || !emittedTransferMastered
      summary.addEventListener('click', () => emit('transfer.summary', { mastered: true }))
      controlContent.append(compactNote, check, summary, makeStatus(statusText || content.incompleteStatus))
    }

    function renderTransferCards(): void {
      chartOverlay.replaceChildren()
      const content = props.content.transfer
      const cases = [
        [content.case1Title, content.case1Reason],
        [content.case2Title, content.case2Reason],
        [content.case3Title, content.case3Reason],
      ] as const
      Object.assign(chartOverlay.style, {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '10px',
        padding: '12px 16px',
        boxSizing: 'border-box',
        pointerEvents: 'auto',
      })
      cases.forEach(([titleText, reasonText], index) => {
        const card = createElement('article', {
          minWidth: '0',
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          gap: '5px',
          padding: '10px 11px',
          boxSizing: 'border-box',
          background: 'rgba(255,255,255,.72)',
          border: '1px solid rgba(65,54,43,.14)',
          borderRadius: '11px',
          boxShadow: '0 8px 20px rgba(62,47,33,.05)',
        })
        const title = createElement('h3', {
          margin: '0',
          color: '#322e2a',
          fontSize: '11px',
          lineHeight: '1.35',
        })
        title.textContent = titleText
        const reason = createElement('p', {
          margin: '0',
          color: '#716960',
          fontSize: '9px',
          lineHeight: '1.45',
        })
        reason.textContent = reasonText
        const choices = createElement('div', {
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
        })
        for (const [answer, label, editKey, editLabel] of [
          [true, content.yesLabel, 'content.transfer.yesLabel', '有感应按钮'],
          [false, content.noLabel, 'content.transfer.noLabel', '无感应按钮'],
        ] as const) {
          const button = makeButton(label, editKey, editLabel)
          button.style.minHeight = '27px'
          setButtonSelected(button, transferChoices[index] === answer)
          button.addEventListener('click', () => {
            if (!canInteract()) return
            transferChoices[index] = answer
            renderControls()
            renderTransferCards()
          })
          choices.append(button)
        }
        card.append(title, reason, choices)
        chartOverlay.append(card)
      })
    }

    function renderControls(): void {
      controlContent.replaceChildren()
      const useFullHeightControls = lessonMode === 'model' || lessonMode === 'lenz'
      topGrid.style.gridTemplateColumns = useFullHeightControls
        ? 'minmax(0, 1fr) minmax(320px, 30%)'
        : 'minmax(0, 1fr) minmax(260px, 29%)'
      apparatusStage.style.gridColumn = '1'
      apparatusStage.style.gridRow = '1'
      controlPanel.style.gridColumn = '2'
      controlPanel.style.gridRow = useFullHeightControls ? '1 / -1' : '1'
      controlPanel.style.padding = useFullHeightControls ? '14px 16px 12px' : '18px 18px 14px'
      controlContent.style.gap = useFullHeightControls ? '7px' : '11px'
      chartPanel.style.gridColumn = useFullHeightControls ? '1' : '1 / -1'
      chartPanel.style.gridRow = '2'
      host.setAttribute('aria-label', props.content.common.ariaLabel)
      meterCaption.textContent = props.content.common.meterLabel
      southLabel.textContent = props.content.common.magnetSouth
      northLabel.textContent = props.content.common.magnetNorth
      chartCanvas.setAttribute('aria-label', `${props.content.common.fluxLabel} / ${props.content.common.voltageLabel}`)
      chartOverlay.replaceChildren()
      Object.assign(chartOverlay.style, { display: 'block', padding: '0', pointerEvents: 'none' })
      if (lessonMode === 'prediction') renderPredictionControls()
      else if (lessonMode === 'lab') renderLabControls()
      else if (lessonMode === 'model') renderModelControls()
      else if (lessonMode === 'lenz') renderLenzControls()
      else renderTransferControls()
      if (lessonMode === 'transfer') renderTransferCards()
      updateInteractionState()
    }

    function updateInteractionState(): void {
      const enabled = canInteract()
      host.style.pointerEvents = visible && !suspended ? 'auto' : 'none'
      host.querySelectorAll('button, input').forEach((element) => {
        const input = element as HTMLButtonElement | HTMLInputElement
        if (!enabled) input.disabled = true
      })
      magnet.tabIndex = enabled && (lessonMode === 'lab' || lessonMode === 'model') ? 0 : -1
      magnet.style.cursor = enabled && lessonMode === 'lab' ? 'ew-resize' : 'default'
      if (runtimeMode === 'edit') host.title = props.content.common.disabledHint
      else if (runtimeMode === 'capture') host.title = props.content.common.captureHint
      else if (suspended) host.title = props.content.common.suspendedHint
      else host.removeAttribute('title')
    }

    function fluxAt(t: number): number {
      const baseline = 0.09
      let coupling = 0
      if (t < 0.36) coupling = smoothStep(t / 0.36)
      else if (t <= 0.64) coupling = 1
      else coupling = smoothStep((1 - t) / 0.36)
      const geometry = Math.max(0, Math.cos(angleDegrees * Math.PI / 180))
      return (baseline + (1 - baseline) * coupling) * fieldScale * areaScale * geometry
    }

    function voltageAt(t: number): number {
      const epsilon = 0.002
      const derivative = (fluxAt(clamp(t + epsilon, 0, 1)) - fluxAt(clamp(t - epsilon, 0, 1))) / (2 * epsilon)
      return clamp(-derivative / 4.25, -1, 1)
    }

    function drawLine(
      context: CanvasRenderingContext2D,
      points: Array<[number, number]>,
      color: string,
      widthValue: number,
      dashed = false,
    ): void {
      context.save()
      context.beginPath()
      points.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.strokeStyle = color
      context.lineWidth = widthValue
      context.lineJoin = 'round'
      context.lineCap = 'round'
      if (dashed) context.setLineDash([5, 5])
      context.stroke()
      context.restore()
    }

    function drawAxis(
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      color: string,
    ): void {
      context.save()
      context.strokeStyle = 'rgba(68, 58, 48, .22)'
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(x, y + h / 2)
      context.lineTo(x + w, y + h / 2)
      context.moveTo(x, y)
      context.lineTo(x, y + h)
      context.stroke()
      context.fillStyle = color
      context.font = '700 11px "Microsoft YaHei", sans-serif'
      context.fillText(label, x + 7, y + 13)
      context.restore()
    }

    function drawPredictionChart(context: CanvasRenderingContext2D, w: number, h: number): void {
      const common = props.content.common
      const left = 52
      const right = 24
      const usable = w - left - right
      const labels = [common.phaseApproach, common.phaseHold, common.phaseRecede]
      context.fillStyle = '#6f675e'
      context.font = '700 10px "Microsoft YaHei", sans-serif'
      labels.forEach((label, index) => {
        const x = left + usable * ((index + 0.5) / 3)
        context.fillText(label, x - context.measureText(label).width / 2, 20)
        context.strokeStyle = 'rgba(70,60,50,.16)'
        context.setLineDash([4, 5])
        context.beginPath()
        context.moveTo(x, 31)
        context.lineTo(x, h - 20)
        context.stroke()
      })
      context.setLineDash([])
      drawAxis(context, left, 32, usable, Math.max(42, h - 52), common.voltageLabel, props.voltageColor)
      drawLine(context, [[left, h / 2 + 12], [left + usable, h / 2 + 12]], 'rgba(69,59,50,.22)', 1, true)
    }

    function drawLabChart(context: CanvasRenderingContext2D, w: number, h: number): void {
      const common = props.content.common
      const left = 52
      const right = 24
      const usable = w - left - right
      const top = 18
      const chartHeight = h - 34
      drawAxis(context, left, top, usable, chartHeight, common.voltageLabel, props.voltageColor)
      const order: TrialKind[] = ['slow', 'fast', 'hold', 'recede']
      const labels = [props.content.lab.slowApproach, props.content.lab.fastApproach, props.content.lab.holdNear, props.content.lab.recede]
      const amplitudes = [-0.38, -0.84, 0, 0.68]
      order.forEach((kind, index) => {
        const segmentLeft = left + usable * index / 4
        const segmentRight = left + usable * (index + 1) / 4
        const centerY = top + chartHeight / 2
        context.fillStyle = trials.has(kind) ? '#625950' : '#a49b91'
        context.font = '700 9px "Microsoft YaHei", sans-serif'
        const label = labels[index]
        context.fillText(label, (segmentLeft + segmentRight) / 2 - context.measureText(label).width / 2, h - 7)
        const points: Array<[number, number]> = []
        for (let step = 0; step <= 40; step += 1) {
          const local = step / 40
          const pulse = Math.sin(Math.PI * local) ** 2
          const x = segmentLeft + (segmentRight - segmentLeft) * local
          const y = centerY - amplitudes[index] * pulse * chartHeight * 0.36
          points.push([x, y])
        }
        drawLine(
          context,
          points,
          trials.has(kind) ? props.voltageColor : 'rgba(79,68,58,.18)',
          trials.has(kind) ? 2.3 : 1,
          !trials.has(kind),
        )
        if (index < 3) {
          context.strokeStyle = 'rgba(69,59,49,.1)'
          context.beginPath()
          context.moveTo(segmentRight, top + 8)
          context.lineTo(segmentRight, top + chartHeight - 8)
          context.stroke()
        }
      })
    }

    function drawModelChart(context: CanvasRenderingContext2D, w: number, h: number): void {
      const common = props.content.common
      const left = 58
      const right = 28
      const usable = w - left - right
      const gap = 10
      const each = (h - 30 - gap) / 2
      const top1 = 12
      const top2 = top1 + each + gap
      drawAxis(context, left, top1, usable, each, common.fluxLabel, props.fluxColor)
      drawAxis(context, left, top2, usable, each, common.voltageLabel, props.voltageColor)
      const fluxPoints: Array<[number, number]> = []
      const voltagePoints: Array<[number, number]> = []
      const maximumFlux = Math.max(0.2, fieldScale * areaScale)
      for (let step = 0; step <= 220; step += 1) {
        const t = step / 220
        const x = left + usable * t
        const flux = fluxAt(t) / maximumFlux
        const voltage = voltageAt(t)
        fluxPoints.push([x, top1 + each * 0.88 - flux * each * 0.72])
        voltagePoints.push([x, top2 + each / 2 - voltage * each * 0.37])
      }
      drawLine(context, fluxPoints, props.fluxColor, 2.3)
      drawLine(context, voltagePoints, props.voltageColor, 2.3)
      const cursorX = left + usable * timeline
      context.save()
      context.strokeStyle = '#302b27'
      context.lineWidth = 1
      context.setLineDash([3, 3])
      context.beginPath()
      context.moveTo(cursorX, 8)
      context.lineTo(cursorX, h - 16)
      context.stroke()
      context.setLineDash([])
      context.fillStyle = '#302b27'
      context.beginPath()
      context.arc(cursorX, h - 13, 4, 0, Math.PI * 2)
      context.fill()
      context.restore()
      const holdStart = left + usable * 0.36
      const holdWidth = usable * 0.28
      context.fillStyle = 'rgba(182,106,44,.07)'
      context.fillRect(holdStart, 7, holdWidth, h - 21)
      context.fillStyle = '#72675c'
      context.font = '700 9px "Microsoft YaHei", sans-serif'
      const holdLabel = common.phaseHold
      context.fillText(holdLabel, holdStart + holdWidth / 2 - context.measureText(holdLabel).width / 2, h - 4)
    }

    function drawLenzChart(context: CanvasRenderingContext2D, w: number, h: number): void {
      const left = 60
      const right = 34
      const usable = w - left - right
      const center = h / 2
      const content = props.content.lenz
      context.fillStyle = 'rgba(49,95,154,.07)'
      context.fillRect(left, 14, usable * 0.48, h - 28)
      context.fillStyle = 'rgba(173,62,66,.07)'
      context.fillRect(left + usable * 0.52, 14, usable * 0.48, h - 28)
      context.strokeStyle = 'rgba(69,59,49,.18)'
      context.beginPath()
      context.moveTo(left, center)
      context.lineTo(left + usable, center)
      context.stroke()
      const drawArrow = (x1: number, x2: number, color: string): void => {
        const direction = Math.sign(x2 - x1)
        context.strokeStyle = color
        context.fillStyle = color
        context.lineWidth = 4
        context.beginPath()
        context.moveTo(x1, center)
        context.lineTo(x2, center)
        context.stroke()
        context.beginPath()
        context.moveTo(x2, center)
        context.lineTo(x2 - direction * 12, center - 7)
        context.lineTo(x2 - direction * 12, center + 7)
        context.closePath()
        context.fill()
      }
      drawArrow(left + usable * 0.42, left + usable * 0.13, props.fluxColor)
      drawArrow(left + usable * 0.58, left + usable * (lenzChoice === 'left' ? 0.64 : 0.88), props.voltageColor)
      context.fillStyle = '#574e46'
      context.font = '700 10px "Microsoft YaHei", sans-serif'
      context.fillText(content.approachWorked, left + 10, 30)
      context.fillText(content.recedeQuestion, left + usable * 0.53, 30)
    }

    function drawCharts(): void {
      const rectangle = chartPanel.getBoundingClientRect()
      const cssWidth = Math.max(1, rectangle.width)
      const cssHeight = Math.max(1, rectangle.height)
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const targetWidth = Math.round(cssWidth * ratio)
      const targetHeight = Math.round(cssHeight * ratio)
      if (chartCanvas.width !== targetWidth || chartCanvas.height !== targetHeight) {
        chartCanvas.width = targetWidth
        chartCanvas.height = targetHeight
      }
      const context = chartCanvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, cssWidth, cssHeight)
      context.fillStyle = 'rgba(255,253,248,.86)'
      context.fillRect(0, 0, cssWidth, cssHeight)
      if (lessonMode === 'prediction') drawPredictionChart(context, cssWidth, cssHeight)
      else if (lessonMode === 'lab') drawLabChart(context, cssWidth, cssHeight)
      else if (lessonMode === 'model') drawModelChart(context, cssWidth, cssHeight)
      else if (lessonMode === 'lenz') drawLenzChart(context, cssWidth, cssHeight)
    }

    function updateApparatus(): void {
      const minimumLeft = 2.2
      const maximumLeft = 22.2
      const left = minimumLeft + (maximumLeft - minimumLeft) * clamp(magnetPosition, 0, 1)
      magnet.style.left = `${left}%`
      magnet.setAttribute('aria-valuenow', String(Math.round(magnetPosition * 100)))
      const phaseLabel = magnetPosition > 0.8 ? props.content.common.phaseHold : props.content.common.phaseApproach
      magnet.setAttribute('aria-valuetext', phaseLabel)
      needle.style.background = props.voltageColor
      needle.style.transform = `translateX(-50%) rotate(${clamp(needleValue, -1, 1) * 30}deg)`
    }

    function drawAll(): void {
      if (destroyed) return
      updateApparatus()
      drawCharts()
    }

    function requestTick(): void {
      if (animationFrame || destroyed || !visible || suspended) return
      animationFrame = requestAnimationFrame(tick)
    }

    function pauseActiveAnimation(): void {
      if (!animationKind || animationStart <= 0 || animationDuration <= 0) return
      const now = performance.now()
      const progress = clamp((now - animationStart) / animationDuration, 0, 1)
      const eased = smoothStep(progress)
      magnetPosition = animationFrom + (animationTo - animationFrom) * eased
      animationFrom = magnetPosition
      animationDuration = Math.max(1, animationDuration * (1 - progress))
      animationStart = 0
      needleValue = 0
      updateApparatus()
    }

    function tick(now: number): void {
      animationFrame = 0
      if (destroyed || !visible || suspended) return
      if (animationKind) {
        const progress = clamp((now - animationStart) / Math.max(1, animationDuration), 0, 1)
        const eased = smoothStep(progress)
        magnetPosition = animationFrom + (animationTo - animationFrom) * eased
        needleValue = animationKind === 'hold' ? 0 : animationSignal * Math.sin(Math.PI * progress)
        drawAll()
        if (progress < 1) {
          requestTick()
        } else {
          const completedKind = animationKind
          animationKind = null
          needleValue = 0
          updateApparatus()
          recordTrial(completedKind)
        }
      }
    }

    function magnetPositionFromPointer(event: PointerEvent): number {
      const rectangle = apparatusViewport.getBoundingClientRect()
      const desiredLeft = (event.clientX - rectangle.left - dragPointerOffset) / Math.max(1, rectangle.width)
      return clamp((desiredLeft - 0.022) / 0.2, 0, 1)
    }

    function beginDrag(event: PointerEvent): void {
      if (!canInteract() || lessonMode !== 'lab') return
      dragging = true
      dragPointerId = event.pointerId
      dragStartPosition = magnetPosition
      previousMagnetPosition = magnetPosition
      previousDragTime = performance.now()
      dragPointerOffset = event.clientX - magnet.getBoundingClientRect().left
      magnet.setPointerCapture(event.pointerId)
      event.preventDefault()
    }

    function updateDrag(event: PointerEvent): void {
      if (!dragging || event.pointerId !== dragPointerId || !canInteract()) return
      const now = performance.now()
      const next = magnetPositionFromPointer(event)
      const delta = next - previousMagnetPosition
      const elapsed = Math.max(16, now - previousDragTime)
      needleValue = clamp(-delta / elapsed * 1750, -1, 1)
      magnetPosition = next
      previousMagnetPosition = next
      previousDragTime = now
      drawAll()
      event.preventDefault()
    }

    function endDrag(event: PointerEvent): void {
      if (!dragging || event.pointerId !== dragPointerId) return
      dragging = false
      dragPointerId = -1
      needleValue = 0
      updateApparatus()
      if (canInteract()) {
        const direction = magnetPosition >= dragStartPosition ? 'approach' : 'recede'
        emit('trial.recorded', { kind: 'manual', direction, position: magnetPosition })
      }
    }

    function handleMagnetKey(event: KeyboardEvent): void {
      if (!canInteract() || lessonMode !== 'lab') return
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
      const previous = magnetPosition
      if (event.key === 'ArrowLeft') magnetPosition = clamp(magnetPosition - 0.08, 0, 1)
      else if (event.key === 'ArrowRight') magnetPosition = clamp(magnetPosition + 0.08, 0, 1)
      else if (event.key === 'Home') magnetPosition = 0
      else magnetPosition = 1
      needleValue = clamp(-(magnetPosition - previous) * 4.5, -1, 1)
      drawAll()
      const handle = window.setTimeout(() => {
        timeoutHandles.delete(handle)
        if (destroyed) return
        needleValue = 0
        updateApparatus()
      }, shouldReduceMotion() ? 0 : 180)
      timeoutHandles.add(handle)
      event.preventDefault()
    }

    function handleChartPointer(event: PointerEvent): void {
      if (!canInteract() || lessonMode !== 'model') return
      const rectangle = chartPanel.getBoundingClientRect()
      timeline = clamp((event.clientX - rectangle.left - 58) / Math.max(1, rectangle.width - 86), 0, 1)
      modelTimelineTouched = true
      if (!emittedModelSlopeTask) {
        emittedModelSlopeTask = true
        emit('model.slope-task', { timeline })
      }
      magnetPosition = timeline < 0.36 ? timeline / 0.36 : timeline <= 0.64 ? 1 : (1 - timeline) / 0.36
      needleValue = voltageAt(timeline)
      drawAll()
      event.preventDefault()
    }

    magnet.addEventListener('pointerdown', beginDrag)
    magnet.addEventListener('pointermove', updateDrag)
    magnet.addEventListener('pointerup', endDrag)
    magnet.addEventListener('pointercancel', endDrag)
    magnet.addEventListener('keydown', handleMagnetKey)
    chartPanel.addEventListener('pointerdown', handleChartPointer)
    chartPanel.addEventListener('pointermove', (event) => {
      if ((event.buttons & 1) === 1) handleChartPointer(event)
    })

    function resetLessonState(nextMode: LessonMode): void {
      if (animationFrame) cancelAnimationFrame(animationFrame)
      animationFrame = 0
      timeoutHandles.forEach((handle) => window.clearTimeout(handle))
      timeoutHandles.clear()
      animationKind = null
      lessonMode = nextMode
      magnetPosition = nextMode === 'model' || nextMode === 'lenz' ? 1 : 0
      needleValue = 0
      timeline = 0.5
      fieldScale = 1
      areaScale = 1
      angleDegrees = 0
      modelTimelineTouched = false
      modelParameterTouched = false
      lenzChoice = null
      statusText = ''
      trials.clear()
      delete predictions.approach
      delete predictions.hold
      delete predictions.recede
      transferChoices.fill(null)
      emittedEvidenceComplete = false
      emittedModelSlopeTask = false
      emittedModelMastered = false
      emittedLenzAttempt = false
      emittedLenzMastered = false
      emittedTransferMastered = false
      predictionLocked = false
    }

    renderControls()
    drawAll()

    return {
      setMode(nextMode) {
        runtimeMode = nextMode
        if (runtimeMode === 'capture') {
          timeline = 0.5
          magnetPosition = lessonMode === 'prediction' || lessonMode === 'lab' ? 0.76 : 1
          needleValue = 0
        }
        renderControls()
        drawAll()
      },

      resize(nextWidth, nextHeight) {
        width = nextWidth
        height = nextHeight
        host.dataset.componentWidth = String(width)
        host.dataset.componentHeight = String(height)
        drawAll()
      },

      updateProps(nextProps) {
        const nextLessonMode = nextProps.mode
        props = nextProps
        if (nextLessonMode !== lessonMode) resetLessonState(nextLessonMode)
        host.style.color = props.ink
        host.style.background = props.paper
        renderControls()
        drawAll()
      },

      setVisible(nextVisible) {
        if (!nextVisible) pauseActiveAnimation()
        visible = nextVisible
        host.style.display = visible ? 'grid' : 'none'
        if (!visible && animationFrame) {
          cancelAnimationFrame(animationFrame)
          animationFrame = 0
        } else if (visible) {
          drawAll()
          if (animationKind) {
            animationStart = performance.now()
            requestTick()
          }
        }
        updateInteractionState()
      },

      suspend() {
        if (suspended) return
        pauseActiveAnimation()
        suspended = true
        if (animationFrame) cancelAnimationFrame(animationFrame)
        animationFrame = 0
        timeoutHandles.forEach((handle) => window.clearTimeout(handle))
        timeoutHandles.clear()
        updateInteractionState()
      },

      resume() {
        if (!suspended) return
        suspended = false
        animationStart = performance.now()
        updateInteractionState()
        drawAll()
        if (animationKind) requestTick()
      },

      prepareCapture() {
        const task = imageReady.then(() => new Promise<void>((resolve) => {
          if (destroyed) {
            resolve()
            return
          }
          timeline = 0.5
          magnetPosition = lessonMode === 'prediction' || lessonMode === 'lab' ? 0.72 : 1
          needleValue = 0
          renderControls()
          drawAll()
          requestAnimationFrame(() => {
            drawAll()
            resolve()
          })
        }))
        ctx.capture.waitUntil(task)
      },

      destroy() {
        if (destroyed) return
        destroyed = true
        if (animationFrame) cancelAnimationFrame(animationFrame)
        animationFrame = 0
        magnet.removeEventListener('pointerdown', beginDrag)
        magnet.removeEventListener('pointermove', updateDrag)
        magnet.removeEventListener('pointerup', endDrag)
        magnet.removeEventListener('pointercancel', endDrag)
        magnet.removeEventListener('keydown', handleMagnetKey)
        host.remove()
      },
    }
  },
})

export {}
