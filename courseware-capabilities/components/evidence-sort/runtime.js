window.CoursewareComponent.define({
  id: 'ittoedu.evidence-sort',
  runtimeApiVersion: 4,
  create(ctx) {
    const root = ctx.dom.root
    let props = ctx.props
    let mode = ctx.mode
    const positions = new Map()
    const movedKeys = new Set()
    const itemKeys = ['one', 'two', 'three', 'four', 'five', 'six']
    const columnKeys = ['left', 'middle', 'right']

    const valueAt = (path, fallback = '') => {
      const value = path.split('.').reduce((current, key) => current?.[key], props)
      return typeof value === 'string' ? value : fallback
    }
    const editable = (element, key, label) => {
      element.dataset.coursewareEditKey = key
      element.dataset.coursewareEditLabel = label
    }
    const move = (itemKey, delta) => {
      if (mode === 'edit') return
      const current = positions.get(itemKey) ?? 0
      positions.set(itemKey, Math.max(0, Math.min(columnKeys.length - 1, current + delta)))
      if ((positions.get(itemKey) ?? 0) !== 0) movedKeys.add(itemKey)
      else movedKeys.delete(itemKey)
      render()
      ctx.emit('classification.changed', {
        item: itemKey,
        column: columnKeys[positions.get(itemKey) ?? 0],
      })
      const stateKey = valueAt('completionStateKey').trim()
      const requiredMoves = Number.isFinite(Number(props.requiredMoves))
        ? Math.max(0, Math.min(6, Math.trunc(Number(props.requiredMoves))))
        : 0
      if (stateKey && requiredMoves > 0 && movedKeys.size >= requiredMoves) {
        ctx.courseState.set(stateKey, true)
      }
    }

    const render = () => {
      root.replaceChildren()
      root.style.cssText = 'width:100%;height:100%;padding:18px;overflow:auto;background:#f8fafc;color:#172033;font:16px/1.45 Inter,"Microsoft YaHei",sans-serif;pointer-events:auto'
      const heading = document.createElement('h2')
      heading.textContent = valueAt('title', '整理证据')
      heading.style.cssText = 'margin:0 0 14px;font-size:24px'
      editable(heading, 'title', '组件标题')
      root.appendChild(heading)

      const board = document.createElement('div')
      board.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start'
      columnKeys.forEach((columnKey, columnIndex) => {
        const column = document.createElement('section')
        column.dataset.column = columnKey
        column.style.cssText = 'min-height:310px;padding:12px;border:1px solid #cbd5e1;border-radius:14px;background:#fff'
        const label = document.createElement('h3')
        label.textContent = valueAt(`columns.${columnKey}`, columnKey)
        label.style.cssText = 'margin:0 0 10px;font-size:17px;color:#1d4ed8'
        editable(label, `columns.${columnKey}`, `${columnKey} 分组`)
        column.appendChild(label)

        itemKeys.filter((key) => (positions.get(key) ?? 0) === columnIndex).forEach((key) => {
          const card = document.createElement('article')
          card.tabIndex = 0
          card.dataset.item = key
          card.setAttribute('aria-label', `${valueAt(`items.${key}`, key)}；使用左右方向键移动`)
          card.style.cssText = 'margin:8px 0;padding:10px;border-radius:10px;background:#eff6ff;box-shadow:0 1px 2px rgba(15,23,42,.12);outline-offset:2px'
          editable(card, `items.${key}`, `证据 ${key}`)
          const text = document.createElement('p')
          text.textContent = valueAt(`items.${key}`, key)
          text.style.cssText = 'margin:0 0 8px'
          card.appendChild(text)
          const controls = document.createElement('div')
          controls.style.cssText = 'display:flex;justify-content:space-between;gap:8px'
          const left = document.createElement('button')
          left.type = 'button'
          left.textContent = '←'
          left.ariaLabel = '向左移动'
          left.disabled = columnIndex === 0 || mode === 'edit'
          left.addEventListener('click', () => move(key, -1))
          const right = document.createElement('button')
          right.type = 'button'
          right.textContent = '→'
          right.ariaLabel = '向右移动'
          right.disabled = columnIndex === columnKeys.length - 1 || mode === 'edit'
          right.addEventListener('click', () => move(key, 1))
          controls.append(left, right)
          card.appendChild(controls)
          card.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowLeft') { move(key, -1); event.preventDefault() }
            if (event.key === 'ArrowRight') { move(key, 1); event.preventDefault() }
          })
          column.appendChild(card)
        })
        board.appendChild(column)
      })
      root.appendChild(board)
    }

    itemKeys.forEach((key) => positions.set(key, 0))
    render()
    return {
      setMode(next) { mode = next; render() },
      updateProps(next) { props = next; render() },
      resize() {},
      setVisible(visible) { root.hidden = !visible },
      suspend() {},
      resume() {},
      prepareCapture() {},
      destroy() { root.replaceChildren() },
    }
  },
})
