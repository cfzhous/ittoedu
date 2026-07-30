import * as THREE from 'three'

type ComponentMode = 'edit' | 'preview' | 'capture'

interface ExperimentContent {
  ariaLabel: string
  canvasLabel: string
  eyebrow: string
  title: string
  instruction: string
  angleLabel: string
  frictionLabel: string
  forceToggleLabel: string
  releaseLabel: string
  resetLabel: string
  recordLabel: string
  recordsTitle: string
  recordEmpty: string
  recordTemplate: string
  accelerationLabel: string
  timeLabel: string
  readyStatus: string
  runningStatus: string
  stuckStatus: string
  completedStatus: string
  recordedStatus: string
  duplicateStatus: string
  comparisonStatus: string
  editStatus: string
  captureStatus: string
  suspendedStatus: string
  legendGravity: string
  legendNormal: string
  legendFriction: string
  legendComponent: string
}

interface ExperimentProps {
  content: ExperimentContent
  initialAngle: number
  initialFriction: number
  gravity: number
  trackLength: number
  showForceArrows: boolean
  accent: string
  blockColor: string
  surface: string
}

interface ComponentContext {
  runtimeApiVersion: 4
  renderMode: 'dom'
  instanceId: string
  width: number
  height: number
  mode: ComponentMode
  props: ExperimentProps
  dom: { root: HTMLElement }
  capture: { waitUntil(promise: Promise<unknown>): void }
  emit(eventName: string, payload?: unknown): void
}

interface ComponentLifecycle {
  setMode(mode: ComponentMode): void
  resize(width: number, height: number): void
  updateProps(props: ExperimentProps): void
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

interface RecordRow {
  angle: number
  friction: number
  acceleration: number
  time: number | null
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_match, key: string) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : ''
  ))
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose()
  }
  material.dispose()
}

globalThis.CoursewareComponent.define({
  id: 'com.alepha.physics.incline-motion-3d',
  runtimeApiVersion: 4,

  create(ctx) {
    if (ctx.renderMode !== 'dom') {
      throw new Error('Incline motion 3D component requires renderMode=dom')
    }

    let mode = ctx.mode
    let props = ctx.props
    let content = props.content
    let visible = true
    let suspended = false
    let destroyed = false
    let animationFrame = 0
    let previousFrame = 0
    let experimentRunning = false
    let experimentComplete = false
    let comparisonEmitted = false
    let elapsedSimulation = 0
    let targetSimulationTime = 0
    let acceleration = 0
    let angle = clamp(finiteNumber(props.initialAngle, 24), 10, 45)
    let friction = clamp(finiteNumber(props.initialFriction, 0.12), 0, 0.5)
    let forceVisible = Boolean(props.showForceArrows)
    let yaw = 0.55
    let pitch = 0.34
    let cameraDistance = 10.7
    let dragging = false
    let pointerId = -1
    let previousPointerX = 0
    let previousPointerY = 0
    const records: RecordRow[] = []

    const host = document.createElement('section')
    host.setAttribute('aria-label', content.ariaLabel)
    Object.assign(host.style, {
      position: 'absolute',
      inset: '0',
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) 330px',
      overflow: 'hidden',
      border: `1px solid ${props.accent}55`,
      borderRadius: '26px',
      boxSizing: 'border-box',
      color: '#e8f3fa',
      background: `linear-gradient(135deg, ${props.surface}, #0c2638)`,
      fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
      pointerEvents: 'auto',
    })

    const stage = document.createElement('div')
    Object.assign(stage.style, {
      position: 'relative',
      minWidth: '0',
      overflow: 'hidden',
      background: 'radial-gradient(circle at 52% 45%, rgba(56,189,248,.12), transparent 48%)',
    })

    const heading = document.createElement('div')
    Object.assign(heading.style, {
      position: 'absolute',
      zIndex: '3',
      left: '24px',
      top: '20px',
      maxWidth: '470px',
      pointerEvents: 'none',
    })
    const eyebrow = document.createElement('div')
    Object.assign(eyebrow.style, {
      marginBottom: '7px',
      color: props.accent,
      fontSize: '11px',
      fontWeight: '800',
      letterSpacing: '.18em',
    })
    const title = document.createElement('div')
    Object.assign(title.style, {
      color: '#f8fafc',
      fontSize: '24px',
      fontWeight: '800',
      lineHeight: '1.2',
    })
    const instruction = document.createElement('div')
    Object.assign(instruction.style, {
      marginTop: '7px',
      maxWidth: '430px',
      color: '#8da8bb',
      fontSize: '12px',
      lineHeight: '1.55',
    })
    heading.append(eyebrow, title, instruction)

    const metrics = document.createElement('div')
    Object.assign(metrics.style, {
      position: 'absolute',
      zIndex: '3',
      left: '24px',
      bottom: '18px',
      display: 'flex',
      gap: '10px',
      pointerEvents: 'none',
    })
    const accelerationMetric = document.createElement('div')
    const timeMetric = document.createElement('div')
    for (const metric of [accelerationMetric, timeMetric]) {
      Object.assign(metric.style, {
        minWidth: '126px',
        padding: '9px 12px',
        border: '1px solid rgba(125,211,252,.24)',
        borderRadius: '12px',
        background: 'rgba(5,18,31,.78)',
        color: '#d9edf8',
        fontSize: '12px',
        fontWeight: '700',
        boxSizing: 'border-box',
      })
    }
    metrics.append(accelerationMetric, timeMetric)

    const status = document.createElement('output')
    Object.assign(status.style, {
      position: 'absolute',
      zIndex: '3',
      right: '20px',
      bottom: '18px',
      maxWidth: '280px',
      padding: '9px 13px',
      border: '1px solid rgba(56,189,248,.3)',
      borderRadius: '999px',
      color: '#dff6ff',
      background: 'rgba(7,24,39,.82)',
      fontSize: '11px',
      fontWeight: '700',
      textAlign: 'right',
      pointerEvents: 'none',
    })

    const legend = document.createElement('div')
    Object.assign(legend.style, {
      position: 'absolute',
      zIndex: '3',
      right: '18px',
      top: '18px',
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: '6px',
      width: '270px',
      pointerEvents: 'none',
    })

    const legendItems = [
      ['#fb7185', () => content.legendGravity],
      ['#22d3ee', () => content.legendNormal],
      ['#a78bfa', () => content.legendFriction],
      ['#fbbf24', () => content.legendComponent],
    ] as const
    const legendLabels = legendItems.map(([colour, getLabel]) => {
      const item = document.createElement('span')
      Object.assign(item.style, {
        padding: '5px 8px',
        border: `1px solid ${colour}66`,
        borderRadius: '999px',
        color: '#d9eaf4',
        background: 'rgba(4,17,29,.76)',
        fontSize: '10px',
      })
      item.textContent = getLabel()
      legend.append(item)
      return { item, getLabel }
    })

    const controlPanel = document.createElement('aside')
    Object.assign(controlPanel.style, {
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      gap: '13px',
      padding: '22px',
      borderLeft: '1px solid rgba(148,163,184,.14)',
      background: 'rgba(9,30,45,.92)',
      boxSizing: 'border-box',
      overflow: 'hidden',
    })

    function makeRangeRow(): {
      wrapper: HTMLLabelElement
      label: HTMLSpanElement
      value: HTMLOutputElement
      input: HTMLInputElement
    } {
      const wrapper = document.createElement('label')
      Object.assign(wrapper.style, {
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '7px 12px',
        color: '#9bb2c3',
        fontSize: '12px',
        fontWeight: '700',
      })
      const label = document.createElement('span')
      const value = document.createElement('output')
      Object.assign(value.style, { color: props.accent, fontSize: '14px' })
      const input = document.createElement('input')
      input.type = 'range'
      Object.assign(input.style, {
        gridColumn: '1 / -1',
        width: '100%',
        accentColor: props.accent,
        cursor: 'pointer',
      })
      wrapper.append(label, value, input)
      return { wrapper, label, value, input }
    }

    const angleRow = makeRangeRow()
    angleRow.input.min = '10'
    angleRow.input.max = '45'
    angleRow.input.step = '1'
    const frictionRow = makeRangeRow()
    frictionRow.input.min = '0'
    frictionRow.input.max = '0.5'
    frictionRow.input.step = '0.01'

    const forceToggle = document.createElement('label')
    Object.assign(forceToggle.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      color: '#9bb2c3',
      fontSize: '12px',
      fontWeight: '700',
    })
    const forceToggleText = document.createElement('span')
    const forceCheckbox = document.createElement('input')
    forceCheckbox.type = 'checkbox'
    Object.assign(forceCheckbox.style, {
      width: '18px',
      height: '18px',
      accentColor: props.accent,
      cursor: 'pointer',
    })
    forceToggle.append(forceToggleText, forceCheckbox)

    const buttonGrid = document.createElement('div')
    Object.assign(buttonGrid.style, {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '9px',
    })

    function makeButton(primary = false): HTMLButtonElement {
      const button = document.createElement('button')
      button.type = 'button'
      Object.assign(button.style, {
        minHeight: primary ? '44px' : '38px',
        gridColumn: primary ? '1 / -1' : 'auto',
        border: primary ? '0' : '1px solid rgba(125,211,252,.28)',
        borderRadius: '12px',
        color: '#f8fafc',
        background: primary ? props.accent : '#142f42',
        fontFamily: 'inherit',
        fontSize: '12px',
        fontWeight: '800',
        cursor: 'pointer',
      })
      return button
    }

    const releaseButton = makeButton(true)
    const resetButton = makeButton()
    const recordButton = makeButton()
    buttonGrid.append(releaseButton, resetButton, recordButton)

    const recordSection = document.createElement('div')
    Object.assign(recordSection.style, {
      minHeight: '0',
      paddingTop: '12px',
      borderTop: '1px solid rgba(148,163,184,.14)',
    })
    const recordsTitle = document.createElement('div')
    Object.assign(recordsTitle.style, {
      marginBottom: '8px',
      color: '#dbeafe',
      fontSize: '12px',
      fontWeight: '800',
    })
    const recordList = document.createElement('ol')
    Object.assign(recordList.style, {
      display: 'grid',
      gap: '6px',
      margin: '0',
      padding: '0',
      listStyle: 'none',
      color: '#87a5b8',
      fontSize: '10px',
      lineHeight: '1.45',
    })
    recordSection.append(recordsTitle, recordList)
    controlPanel.append(
      angleRow.wrapper,
      frictionRow.wrapper,
      forceToggle,
      buttonGrid,
      recordSection,
    )

    stage.append(heading, metrics, status, legend)
    host.append(stage, controlPanel)
    ctx.dom.root.append(host)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.domElement.setAttribute('aria-label', content.canvasLabel)
    Object.assign(renderer.domElement.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block',
      cursor: 'grab',
      touchAction: 'none',
    })
    stage.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x071827, 0.045)
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    const world = new THREE.Group()
    const rampGroup = new THREE.Group()
    world.add(rampGroup)
    scene.add(world)

    const hemisphere = new THREE.HemisphereLight(0xd8f3ff, 0x102235, 1.7)
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.8)
    keyLight.position.set(3, 8, 6)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 2.2)
    rimLight.position.set(-5, 3, -4)
    scene.add(hemisphere, keyLight, rimLight)

    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d2a3d,
      roughness: 0.88,
      metalness: 0.05,
    })
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -2.32
    floor.receiveShadow = true
    scene.add(floor)

    const grid = new THREE.GridHelper(16, 20, 0x2b6b88, 0x163f55)
    grid.position.y = -2.3
    grid.material.transparent = true
    grid.material.opacity = 0.34
    scene.add(grid)

    const rampMaterial = new THREE.MeshStandardMaterial({
      color: 0x23627d,
      roughness: 0.38,
      metalness: 0.42,
    })
    const ramp = new THREE.Mesh(
      new THREE.BoxGeometry(finiteNumber(props.trackLength, 7.2), 0.22, 2.4),
      rampMaterial,
    )
    ramp.castShadow = true
    ramp.receiveShadow = true
    rampGroup.add(ramp)

    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.35,
      roughness: 0.35,
    })
    const railGeometry = new THREE.BoxGeometry(finiteNumber(props.trackLength, 7.2), 0.1, 0.09)
    for (const z of [-1.05, 1.05]) {
      const rail = new THREE.Mesh(railGeometry, railMaterial)
      rail.position.set(0, 0.18, z)
      rampGroup.add(rail)
    }

    const blockMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(props.blockColor),
      roughness: 0.42,
      metalness: 0.18,
    })
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.72, 1.1), blockMaterial)
    block.castShadow = true
    block.receiveShadow = true
    rampGroup.add(block)

    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xdff6ff })
    const markerGeometry = new THREE.BoxGeometry(0.04, 0.28, 2.55)
    for (let i = -3; i <= 3; i += 1) {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial)
      marker.position.set(i, 0.18, 0)
      marker.material = markerMaterial.clone()
      ;(marker.material as THREE.MeshBasicMaterial).opacity = i === 0 ? 0.75 : 0.34
      ;(marker.material as THREE.MeshBasicMaterial).transparent = true
      rampGroup.add(marker)
    }

    const arrowGravity = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(),
      1.6,
      0xfb7185,
      0.28,
      0.16,
    )
    const arrowNormal = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(),
      1.28,
      0x22d3ee,
      0.26,
      0.15,
    )
    const arrowFriction = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(),
      1.18,
      0xa78bfa,
      0.24,
      0.14,
    )
    const arrowComponent = new THREE.ArrowHelper(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(),
      1.38,
      0xfbbf24,
      0.26,
      0.15,
    )
    scene.add(arrowGravity, arrowNormal, arrowFriction, arrowComponent)

    const blockWorldPosition = new THREE.Vector3()
    const localNormal = new THREE.Vector3()
    const localUpSlope = new THREE.Vector3()
    const localDownSlope = new THREE.Vector3()
    const startPosition = (): number => finiteNumber(props.trackLength, 7.2) / 2 - 0.62
    const endPosition = (): number => -finiteNumber(props.trackLength, 7.2) / 2 + 0.62

    function updateCamera(): void {
      const horizontal = Math.cos(pitch) * cameraDistance
      camera.position.set(
        Math.sin(yaw) * horizontal,
        Math.sin(pitch) * cameraDistance + 0.55,
        Math.cos(yaw) * horizontal,
      )
      camera.lookAt(0, -0.2, 0)
    }

    function updateForces(): void {
      block.getWorldPosition(blockWorldPosition)
      const theta = THREE.MathUtils.degToRad(angle)
      localNormal.set(-Math.sin(theta), Math.cos(theta), 0)
      localUpSlope.set(Math.cos(theta), Math.sin(theta), 0)
      localDownSlope.copy(localUpSlope).multiplyScalar(-1)
      const origin = blockWorldPosition.clone().add(localNormal.clone().multiplyScalar(0.55))
      arrowGravity.position.copy(origin)
      arrowGravity.setDirection(new THREE.Vector3(0, -1, 0))
      arrowNormal.position.copy(origin)
      arrowNormal.setDirection(localNormal)
      arrowFriction.position.copy(origin)
      arrowFriction.setDirection(localUpSlope)
      arrowComponent.position.copy(origin)
      arrowComponent.setDirection(localDownSlope)
      for (const arrow of [arrowGravity, arrowNormal, arrowFriction, arrowComponent]) {
        arrow.visible = forceVisible
      }
      legend.style.display = forceVisible ? 'flex' : 'none'
    }

    function updateRamp(): void {
      rampGroup.rotation.z = THREE.MathUtils.degToRad(angle)
      updateForces()
    }

    function renderFrame(): void {
      if (destroyed) return
      updateCamera()
      updateForces()
      renderer.render(scene, camera)
    }

    function setStatus(message: string, tone: 'normal' | 'success' | 'warn' = 'normal'): void {
      status.textContent = message
      status.style.borderColor = tone === 'success'
        ? 'rgba(52,211,153,.48)'
        : tone === 'warn'
          ? 'rgba(251,191,36,.48)'
          : 'rgba(56,189,248,.3)'
      status.style.color = tone === 'success' ? '#a7f3d0' : tone === 'warn' ? '#fde68a' : '#dff6ff'
    }

    function renderMetrics(time: number | null = null): void {
      accelerationMetric.textContent = `${content.accelerationLabel}  ${acceleration.toFixed(2)} m/s²`
      timeMetric.textContent = `${content.timeLabel}  ${time === null ? '—' : `${time.toFixed(2)} s`}`
    }

    function renderRecords(): void {
      recordList.replaceChildren()
      if (records.length === 0) {
        const empty = document.createElement('li')
        empty.textContent = content.recordEmpty
        Object.assign(empty.style, {
          padding: '8px 10px',
          borderRadius: '10px',
          background: 'rgba(15,40,56,.7)',
        })
        recordList.append(empty)
        return
      }
      records.forEach((record, index) => {
        const row = document.createElement('li')
        row.textContent = fillTemplate(content.recordTemplate, {
          index: index + 1,
          angle: record.angle,
          friction: record.friction.toFixed(2),
          acceleration: record.acceleration.toFixed(2),
          time: record.time === null ? '—' : record.time.toFixed(2),
        })
        Object.assign(row.style, {
          padding: '8px 10px',
          border: '1px solid rgba(56,189,248,.16)',
          borderRadius: '10px',
          background: 'rgba(15,40,56,.72)',
          color: '#bed5e3',
        })
        recordList.append(row)
      })
    }

    function renderStaticContent(): void {
      host.setAttribute('aria-label', content.ariaLabel)
      renderer.domElement.setAttribute('aria-label', content.canvasLabel)
      eyebrow.textContent = content.eyebrow
      title.textContent = content.title
      instruction.textContent = content.instruction
      angleRow.label.textContent = content.angleLabel
      frictionRow.label.textContent = content.frictionLabel
      forceToggleText.textContent = content.forceToggleLabel
      releaseButton.textContent = content.releaseLabel
      resetButton.textContent = content.resetLabel
      recordButton.textContent = content.recordLabel
      recordsTitle.textContent = content.recordsTitle
      legendLabels.forEach(({ item, getLabel }) => { item.textContent = getLabel() })
      renderRecords()
      renderMetrics(experimentComplete && acceleration > 0 ? targetSimulationTime : null)
    }

    function resetPosition(updateStatus = true): void {
      experimentRunning = false
      experimentComplete = false
      elapsedSimulation = 0
      targetSimulationTime = 0
      acceleration = 0
      block.position.set(startPosition(), 0.57, 0)
      recordButton.disabled = true
      if (updateStatus) setStatus(mode === 'preview' ? content.readyStatus : (
        mode === 'edit' ? content.editStatus : content.captureStatus
      ))
      renderMetrics()
      renderFrame()
    }

    function calculateAcceleration(): number {
      const theta = THREE.MathUtils.degToRad(angle)
      const gravity = clamp(finiteNumber(props.gravity, 9.8), 1, 20)
      return gravity * (Math.sin(theta) - friction * Math.cos(theta))
    }

    function stopLoop(): void {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }

    function startLoop(): void {
      if (
        destroyed || suspended || !visible || !experimentRunning ||
        animationFrame !== 0
      ) return
      previousFrame = performance.now()
      animationFrame = window.requestAnimationFrame(tick)
    }

    function finishExperiment(time: number | null): void {
      experimentRunning = false
      experimentComplete = true
      stopLoop()
      recordButton.disabled = mode !== 'preview'
      if (time === null) {
        acceleration = 0
        setStatus(content.stuckStatus, 'warn')
      } else {
        block.position.x = endPosition()
        setStatus(content.completedStatus, 'success')
      }
      renderMetrics(time)
      renderFrame()
      ctx.emit('experiment.completed', {
        angle,
        friction,
        acceleration,
        time,
        moved: time !== null,
      })
    }

    function tick(now: number): void {
      animationFrame = 0
      if (!experimentRunning || suspended || !visible || destroyed) return
      const delta = Math.min(0.05, Math.max(0, (now - previousFrame) / 1000))
      previousFrame = now
      const playbackScale = 2.25
      elapsedSimulation = Math.min(targetSimulationTime, elapsedSimulation + delta * playbackScale)
      const distance = 0.5 * acceleration * elapsedSimulation * elapsedSimulation
      block.position.x = Math.max(endPosition(), startPosition() - distance)
      renderMetrics(elapsedSimulation)
      renderFrame()
      if (elapsedSimulation >= targetSimulationTime) {
        finishExperiment(targetSimulationTime)
        return
      }
      animationFrame = window.requestAnimationFrame(tick)
    }

    function release(): void {
      if (mode !== 'preview' || suspended) return
      stopLoop()
      experimentRunning = false
      experimentComplete = false
      elapsedSimulation = 0
      block.position.x = startPosition()
      acceleration = calculateAcceleration()
      ctx.emit('experiment.started', { angle, friction, acceleration })
      if (acceleration <= 0.03) {
        finishExperiment(null)
        return
      }
      const distance = startPosition() - endPosition()
      targetSimulationTime = Math.sqrt((2 * distance) / acceleration)
      experimentRunning = true
      recordButton.disabled = true
      setStatus(content.runningStatus)
      renderMetrics(0)
      startLoop()
    }

    function record(): void {
      if (mode !== 'preview' || !experimentComplete) return
      const row: RecordRow = {
        angle,
        friction,
        acceleration,
        time: acceleration > 0 ? targetSimulationTime : null,
      }
      const duplicate = records.some((entry) => (
        entry.angle === row.angle && Math.abs(entry.friction - row.friction) < 0.001
      ))
      if (duplicate) {
        setStatus(content.duplicateStatus, 'warn')
        return
      }
      if (records.length >= 2) records.shift()
      records.push(row)
      renderRecords()
      setStatus(fillTemplate(content.recordedStatus, { count: records.length }), 'success')
      ctx.emit('record.added', { ...row, count: records.length })
      if (records.length >= 2 && !comparisonEmitted) {
        comparisonEmitted = true
        setStatus(content.comparisonStatus, 'success')
        ctx.emit('comparison.ready', { records: records.map((entry) => ({ ...entry })) })
      }
    }

    function onAngleInput(): void {
      if (mode !== 'preview') return
      angle = Number(angleRow.input.value)
      angleRow.value.textContent = `${angle}°`
      updateRamp()
      resetPosition()
    }

    function onFrictionInput(): void {
      if (mode !== 'preview') return
      friction = Number(frictionRow.input.value)
      frictionRow.value.textContent = friction.toFixed(2)
      resetPosition()
    }

    function onForceToggle(): void {
      if (mode !== 'preview') return
      forceVisible = forceCheckbox.checked
      updateForces()
      renderFrame()
    }

    function onReset(): void {
      if (mode !== 'preview') return
      stopLoop()
      resetPosition()
      ctx.emit('experiment.reset')
    }

    function onPointerDown(event: PointerEvent): void {
      if (mode !== 'preview' || suspended || !visible) return
      dragging = true
      pointerId = event.pointerId
      previousPointerX = event.clientX
      previousPointerY = event.clientY
      renderer.domElement.setPointerCapture(event.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
    }

    function onPointerMove(event: PointerEvent): void {
      if (!dragging || event.pointerId !== pointerId) return
      yaw += (event.clientX - previousPointerX) * 0.008
      pitch = clamp(pitch + (event.clientY - previousPointerY) * 0.0055, 0.04, 1.05)
      previousPointerX = event.clientX
      previousPointerY = event.clientY
      renderFrame()
    }

    function finishPointer(event: PointerEvent): void {
      if (!dragging || event.pointerId !== pointerId) return
      dragging = false
      pointerId = -1
      renderer.domElement.style.cursor = 'grab'
    }

    function onWheel(event: WheelEvent): void {
      if (mode !== 'preview' || suspended || !visible) return
      event.preventDefault()
      cameraDistance = clamp(cameraDistance + event.deltaY * 0.008, 7.2, 15)
      renderFrame()
    }

    function resize(width: number, height: number): void {
      const controlWidth = width < 920 ? 290 : 330
      host.style.gridTemplateColumns = `minmax(0, 1fr) ${controlWidth}px`
      const stageWidth = Math.max(320, width - controlWidth)
      const stageHeight = Math.max(280, height)
      renderer.setSize(stageWidth, stageHeight, false)
      camera.aspect = stageWidth / stageHeight
      camera.updateProjectionMatrix()
      renderFrame()
    }

    function syncInputs(): void {
      angleRow.input.value = String(angle)
      frictionRow.input.value = String(friction)
      angleRow.value.textContent = `${angle}°`
      frictionRow.value.textContent = friction.toFixed(2)
      forceCheckbox.checked = forceVisible
    }

    function updateInteractionAvailability(): void {
      const active = mode === 'preview' && !suspended && visible
      angleRow.input.disabled = !active
      frictionRow.input.disabled = !active
      forceCheckbox.disabled = !active
      releaseButton.disabled = !active
      resetButton.disabled = !active
      recordButton.disabled = !active || !experimentComplete
      for (const button of [releaseButton, resetButton, recordButton]) {
        button.style.opacity = button.disabled ? '.46' : '1'
        button.style.cursor = button.disabled ? 'default' : 'pointer'
      }
    }

    angleRow.input.addEventListener('input', onAngleInput)
    frictionRow.input.addEventListener('input', onFrictionInput)
    forceCheckbox.addEventListener('change', onForceToggle)
    releaseButton.addEventListener('click', release)
    resetButton.addEventListener('click', onReset)
    recordButton.addEventListener('click', record)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('pointerup', finishPointer)
    renderer.domElement.addEventListener('pointercancel', finishPointer)
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

    syncInputs()
    renderStaticContent()
    updateRamp()
    resetPosition()
    updateInteractionAvailability()
    resize(ctx.width, ctx.height)
    ctx.capture.waitUntil(document.fonts?.ready ?? Promise.resolve())

    return {
      setMode(nextMode) {
        mode = nextMode
        stopLoop()
        experimentRunning = false
        if (mode === 'capture') {
          setStatus(content.captureStatus)
        } else if (mode === 'edit') {
          setStatus(content.editStatus)
        } else {
          setStatus(content.readyStatus)
        }
        updateInteractionAvailability()
        renderFrame()
      },
      resize,
      updateProps(nextProps) {
        props = nextProps
        content = props.content
        angle = clamp(finiteNumber(props.initialAngle, angle), 10, 45)
        friction = clamp(finiteNumber(props.initialFriction, friction), 0, 0.5)
        forceVisible = Boolean(props.showForceArrows)
        host.style.borderColor = `${props.accent}55`
        host.style.background = `linear-gradient(135deg, ${props.surface}, #0c2638)`
        eyebrow.style.color = props.accent
        angleRow.value.style.color = props.accent
        frictionRow.value.style.color = props.accent
        angleRow.input.style.accentColor = props.accent
        frictionRow.input.style.accentColor = props.accent
        forceCheckbox.style.accentColor = props.accent
        releaseButton.style.background = props.accent
        blockMaterial.color.set(props.blockColor)
        syncInputs()
        renderStaticContent()
        updateRamp()
        resetPosition()
        updateInteractionAvailability()
      },
      setVisible(nextVisible) {
        visible = nextVisible
        host.hidden = !visible
        host.style.pointerEvents = visible ? 'auto' : 'none'
        if (!visible) stopLoop()
        else if (experimentRunning && !suspended) startLoop()
        updateInteractionAvailability()
      },
      suspend() {
        suspended = true
        stopLoop()
        setStatus(content.suspendedStatus, 'warn')
        updateInteractionAvailability()
      },
      resume() {
        if (destroyed) return
        suspended = false
        setStatus(experimentRunning ? content.runningStatus : content.readyStatus)
        if (experimentRunning && visible) startLoop()
        updateInteractionAvailability()
      },
      prepareCapture() {
        stopLoop()
        experimentRunning = false
        angle = clamp(finiteNumber(props.initialAngle, 24), 10, 45)
        friction = clamp(finiteNumber(props.initialFriction, 0.12), 0, 0.5)
        forceVisible = Boolean(props.showForceArrows)
        syncInputs()
        updateRamp()
        resetPosition(false)
        setStatus(content.captureStatus)
        renderFrame()
      },
      destroy() {
        if (destroyed) return
        destroyed = true
        stopLoop()
        angleRow.input.removeEventListener('input', onAngleInput)
        frictionRow.input.removeEventListener('input', onFrictionInput)
        forceCheckbox.removeEventListener('change', onForceToggle)
        releaseButton.removeEventListener('click', release)
        resetButton.removeEventListener('click', onReset)
        recordButton.removeEventListener('click', record)
        renderer.domElement.removeEventListener('pointerdown', onPointerDown)
        renderer.domElement.removeEventListener('pointermove', onPointerMove)
        renderer.domElement.removeEventListener('pointerup', finishPointer)
        renderer.domElement.removeEventListener('pointercancel', finishPointer)
        renderer.domElement.removeEventListener('wheel', onWheel)
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            materials.forEach(disposeMaterial)
          }
        })
        for (const arrow of [arrowGravity, arrowNormal, arrowFriction, arrowComponent]) {
          arrow.dispose()
        }
        renderer.renderLists.dispose()
        renderer.dispose()
        renderer.forceContextLoss()
        host.remove()
      },
    }
  },
})

export {}
