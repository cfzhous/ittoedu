CoursewareSurfaceRuntime.define({
  runtimeApiVersion: 3,
  create(ctx) {
    const root = ctx.dom.root
    let mode = ctx.mode
    let coefficient = 1
    const signs = new Set(['positive'])
    const magnitudesBySign = {
      positive: new Set([1]),
      negative: new Set(),
    }

    const content = (key, fallback = '') => {
      try { return ctx.content.get(key) } catch { return fallback }
    }
    const markContent = (element, key) => {
      element.dataset.coursewareContentKey = key
      return element
    }
    const stateSet = (key, value) => ctx.courseState.set(key, value)

    root.style.cssText = 'width:100%;height:100%;overflow:hidden;background:#071426;color:#e5eefc;font:16px/1.4 Inter,"Microsoft YaHei",sans-serif;pointer-events:auto'
    const shell = document.createElement('section')
    shell.style.cssText = 'display:grid;height:100%;grid-template-rows:auto minmax(0,1fr) auto;padding:18px 20px;gap:12px'
    const heading = markContent(document.createElement('h2'), 'prompt')
    heading.style.cssText = 'margin:0;font-size:22px;color:#f8fafc'
    const center = document.createElement('div')
    center.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:16px;min-height:0'
    const graph = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    graph.setAttribute('viewBox', '0 0 720 400')
    graph.setAttribute('role', 'img')
    graph.setAttribute('aria-label', '二次函数参数图像')
    graph.style.cssText = 'width:100%;height:100%;border-radius:14px;background:#0b1f36'
    const side = document.createElement('aside')
    side.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid #29435f;border-radius:14px;background:#10253d'
    const formula = document.createElement('output')
    formula.style.cssText = 'font:700 26px/1.2 Georgia,serif;color:#7dd3fc'
    const direction = document.createElement('output')
    const width = document.createElement('output')
    const status = markContent(document.createElement('p'), 'hint')
    status.style.cssText = 'margin:4px 0 0;color:#cbd5e1'
    const controls = document.createElement('div')
    controls.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:8px'
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = '-3'
    slider.max = '3'
    slider.step = '0.1'
    slider.value = String(coefficient)
    slider.setAttribute('aria-label', '系数 a')
    const reset = markContent(document.createElement('button'), 'resetLabel')
    reset.type = 'button'
    const footer = document.createElement('div')
    footer.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center'
    footer.append(slider, reset)
    side.append(formula, direction, width, status, controls)
    center.append(graph, side)
    shell.append(heading, center, footer)
    root.appendChild(shell)

    const svg = (tag, attributes = {}) => {
      const element = document.createElementNS('http://www.w3.org/2000/svg', tag)
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)))
      return element
    }
    const point = (x, y) => ({ x: 360 + x * 54, y: 200 - y * 35 })

    const draw = () => {
      graph.replaceChildren()
      const background = svg('image', {
        href: ctx.assets.url('gridBackground'),
        x: 0,
        y: 0,
        width: 720,
        height: 400,
        preserveAspectRatio: 'none',
        opacity: 0.2,
      })
      background.dataset.coursewareAssetKey = 'gridBackground'
      graph.appendChild(background)
      for (let x = -6; x <= 6; x += 1) {
        const px = point(x, 0).x
        graph.appendChild(svg('line', { x1: px, y1: 0, x2: px, y2: 400, stroke: '#17314c', 'stroke-width': 1 }))
      }
      for (let y = -5; y <= 5; y += 1) {
        const py = point(0, y).y
        graph.appendChild(svg('line', { x1: 0, y1: py, x2: 720, y2: py, stroke: '#17314c', 'stroke-width': 1 }))
      }
      graph.appendChild(svg('line', { x1: 0, y1: 200, x2: 720, y2: 200, stroke: '#94a3b8', 'stroke-width': 2 }))
      graph.appendChild(svg('line', { x1: 360, y1: 0, x2: 360, y2: 400, stroke: '#94a3b8', 'stroke-width': 2 }))
      const points = []
      for (let x = -3.5; x <= 3.5; x += 0.035) {
        const value = point(x, coefficient * x * x)
        if (value.y >= -30 && value.y <= 430) points.push(`${value.x.toFixed(2)},${value.y.toFixed(2)}`)
      }
      graph.appendChild(svg('polyline', {
        points: points.join(' '), fill: 'none', stroke: coefficient > 0 ? '#38bdf8' : '#fb7185',
        'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }))
    }

    const update = (next, record = true) => {
      if (!Number.isFinite(next)) return
      coefficient = Math.abs(next) < 0.05 ? (next < 0 ? -0.1 : 0.1) : Math.max(-3, Math.min(3, next))
      slider.value = String(coefficient)
      if (record) {
        const sign = coefficient > 0 ? 'positive' : 'negative'
        signs.add(sign)
        magnitudesBySign[sign].add(Math.round(Math.abs(coefficient) * 10) / 10)
      }
      const comparedSameSignMagnitude = Object.values(magnitudesBySign)
        .some((magnitudes) => magnitudes.size >= 2)
      const complete = signs.size >= 2 && comparedSameSignMagnitude
      stateSet('comparisonComplete', complete)
      formula.value = `y = ${coefficient.toFixed(1)}x²`
      const directionValueKey = coefficient > 0 ? 'upLabel' : 'downLabel'
      const widthValueKey = Math.abs(coefficient) > 1
        ? 'narrowLabel'
        : Math.abs(coefficient) < 1 ? 'wideLabel' : 'baselineLabel'
      const renderReading = (target, labelKey, valueKey, labelFallback, valueFallback) => {
        const label = markContent(document.createElement('span'), labelKey)
        label.textContent = content(labelKey, labelFallback)
        const separator = document.createTextNode('：')
        const value = markContent(document.createElement('strong'), valueKey)
        value.textContent = content(valueKey, valueFallback)
        target.replaceChildren(label, separator, value)
      }
      renderReading(direction, 'directionLabel', directionValueKey, '开口', coefficient > 0 ? '向上' : '向下')
      renderReading(width, 'widthLabel', widthValueKey, '宽窄', Math.abs(coefficient) > 1 ? '更窄' : Math.abs(coefficient) < 1 ? '更宽' : '基准')
      const statusKey = complete ? 'completeHint' : 'hint'
      status.dataset.coursewareContentKey = statusKey
      status.textContent = content(statusKey, complete ? '已完成两类比较' : '比较异号与同号不同绝对值')
      draw()
      ctx.emit('parameter.changed', { coefficient, complete, comparedSameSignMagnitude })
    }

    ;[-2, -0.5, 0.5, 2].forEach((value) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = String(value)
      button.style.cssText = 'padding:8px;border:1px solid #45627f;border-radius:8px;background:#163553;color:#f8fafc'
      button.addEventListener('click', () => update(value))
      controls.appendChild(button)
    })
    slider.addEventListener('input', () => update(Number(slider.value)))
    reset.addEventListener('click', () => {
      signs.clear(); signs.add('positive')
      magnitudesBySign.positive.clear(); magnitudesBySign.positive.add(1)
      magnitudesBySign.negative.clear()
      stateSet('comparisonComplete', false)
      update(1, false)
    })

    const applyMode = (nextMode) => {
      mode = nextMode
      const disabled = mode === 'inspect' || mode === 'capture'
      slider.disabled = disabled
      reset.disabled = disabled
      controls.querySelectorAll('button').forEach((button) => { button.disabled = disabled })
      root.dataset.runtimeMode = mode
    }
    heading.textContent = content('prompt', '改变 a，观察图像')
    reset.textContent = content('resetLabel', '重置实验')
    update(1, false)
    applyMode(mode)

    return {
      setMode: applyMode,
      updateContent() {
        heading.textContent = content('prompt', '改变 a，观察图像')
        reset.textContent = content('resetLabel', '重置实验')
        update(coefficient, false)
      },
      updateAssets() { draw() },
      resize() {},
      setVisible(visible) { root.hidden = !visible },
      suspend() {},
      resume() {},
      prepareCapture() { draw() },
      exportAuthoringCheckpoint() {
        return {
          coefficient,
          positiveMagnitudes: [...magnitudesBySign.positive],
          negativeMagnitudes: [...magnitudesBySign.negative],
        }
      },
      restoreAuthoringCheckpoint(checkpoint) {
        if (!checkpoint || typeof checkpoint !== 'object') return
        magnitudesBySign.positive.clear()
        magnitudesBySign.negative.clear()
        ;(Array.isArray(checkpoint.positiveMagnitudes) ? checkpoint.positiveMagnitudes : [1])
          .filter(Number.isFinite).forEach((value) => magnitudesBySign.positive.add(value))
        ;(Array.isArray(checkpoint.negativeMagnitudes) ? checkpoint.negativeMagnitudes : [])
          .filter(Number.isFinite).forEach((value) => magnitudesBySign.negative.add(value))
        signs.clear()
        if (magnitudesBySign.positive.size > 0) signs.add('positive')
        if (magnitudesBySign.negative.size > 0) signs.add('negative')
        update(Number.isFinite(checkpoint.coefficient) ? checkpoint.coefficient : 1, false)
      },
      destroy() { root.replaceChildren() },
    }
  },
})
