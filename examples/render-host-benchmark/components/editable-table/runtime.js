(function () {
  function objectValue(value) {
    return value && typeof value === 'object' ? value : {}
  }

  function stringValue(value) {
    return typeof value === 'string' ? value : ''
  }

  function createCell(tag, text) {
    var cell = document.createElement(tag)
    cell.textContent = stringValue(text)
    return cell
  }

  window.CoursewareComponent.define({
    id: 'com.example.render-host-editable-table',
    runtimeApiVersion: 4,

    create: function (ctx) {
      if (ctx.renderMode !== 'dom') {
        throw new Error('V4 表格组件必须使用 renderMode=dom')
      }

      var root = ctx.dom.root
      var props = ctx.props
      var mode = ctx.mode
      var suspended = false
      var selectedIndex = -1
      var sorted = false
      var destroyed = false

      var style = document.createElement('style')
      style.textContent = [
        ':host{display:block;width:100%;height:100%;contain:layout paint style}',
        '.shell{box-sizing:border-box;width:100%;height:100%;padding:24px 28px;border-radius:24px;overflow:hidden;color:#f8fafc;font-family:Microsoft YaHei,sans-serif;background:var(--surface);border:2px solid color-mix(in srgb,var(--accent) 72%,transparent)}',
        '.head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:12px}',
        'h2{margin:0 0 6px;color:#ccfbf1;font-size:25px;line-height:1.25}',
        'p{margin:0;color:#99f6e4;font-size:14px;line-height:1.45}',
        '.actions{display:flex;gap:8px;flex:0 0 auto}',
        'button{padding:9px 13px;border:1px solid var(--accent);border-radius:999px;color:#f0fdfa;background:#115e59;font:700 13px Microsoft YaHei,sans-serif;cursor:pointer}',
        'button:focus-visible,tr:focus-visible{outline:3px solid #fef08a;outline-offset:2px}',
        'table{width:100%;border-collapse:separate;border-spacing:0 7px;font-size:15px}',
        'caption{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}',
        'th{padding:7px 12px;color:#5eead4;text-align:left;font-size:13px}',
        'th:last-child,td:last-child{text-align:center}',
        'td{padding:var(--cell-pad) 12px;background:#1e293b;border-top:1px solid #334155;border-bottom:1px solid #334155}',
        'td:first-child{border-left:1px solid #334155;border-radius:12px 0 0 12px;font-weight:700;color:#f0fdfa}',
        'td:last-child{border-right:1px solid #334155;border-radius:0 12px 12px 0;color:#fde68a;font-weight:800}',
        'tr[data-selected=true] td{background:var(--row-surface);border-color:var(--accent)}',
        'tbody tr{cursor:pointer}',
        'output{display:block;margin-top:8px;color:#a7f3d0;font-size:13px;font-weight:700}',
        '.suspended{opacity:.58;filter:saturate(.35)}'
      ].join('')

      var shell = document.createElement('section')
      shell.className = 'shell'
      var heading = document.createElement('div')
      heading.className = 'head'
      var headingText = document.createElement('div')
      var title = document.createElement('h2')
      var description = document.createElement('p')
      headingText.append(title, description)
      var actions = document.createElement('div')
      actions.className = 'actions'
      var sortButton = document.createElement('button')
      sortButton.type = 'button'
      sortButton.dataset.action = 'sort'
      var resetButton = document.createElement('button')
      resetButton.type = 'button'
      resetButton.dataset.action = 'reset'
      actions.append(sortButton, resetButton)
      heading.append(headingText, actions)

      var table = document.createElement('table')
      var caption = document.createElement('caption')
      var tableHead = document.createElement('thead')
      var tableBody = document.createElement('tbody')
      var status = document.createElement('output')
      table.append(caption, tableHead, tableBody)
      shell.append(heading, table, status)
      root.replaceChildren(style, shell)

      function content() {
        return objectValue(objectValue(props).content)
      }

      function rows() {
        var candidate = content().rows
        return Array.isArray(candidate)
          ? candidate.map(function (row) { return objectValue(row) })
          : []
      }

      function setStatus(key, replacements) {
        var value = stringValue(content()[key])
        Object.entries(replacements || {}).forEach(function (entry) {
          value = value.replaceAll('{' + entry[0] + '}', String(entry[1]))
        })
        status.textContent = value
      }

      function render() {
        var values = content()
        var headers = objectValue(values.headers)
        var displayRows = rows().map(function (row, index) {
          return { row: row, sourceIndex: index }
        })
        if (sorted) {
          displayRows.sort(function (left, right) {
            return Number(right.row.score || 0) - Number(left.row.score || 0)
          })
        }

        shell.style.setProperty('--accent', stringValue(props.accent) || '#14b8a6')
        shell.style.setProperty('--surface', stringValue(props.surface) || '#0f172a')
        shell.style.setProperty('--row-surface', stringValue(props.rowSurface) || '#134e4a')
        shell.style.setProperty('--cell-pad', props.compact === true ? '8px' : '12px')
        shell.setAttribute('aria-label', stringValue(values.ariaLabel))
        shell.classList.toggle('suspended', suspended)
        title.textContent = stringValue(values.title)
        description.textContent = stringValue(values.caption)
        caption.textContent = stringValue(values.caption)
        sortButton.textContent = stringValue(values.sortLabel)
        resetButton.textContent = stringValue(values.resetLabel)
        sortButton.disabled = suspended || mode === 'capture'
        resetButton.disabled = suspended || mode === 'capture'

        var headerRow = document.createElement('tr')
        headerRow.append(
          createCell('th', headers.route),
          createCell('th', headers.fit),
          createCell('th', headers.editability),
          createCell('th', headers.score)
        )
        tableHead.replaceChildren(headerRow)

        tableBody.replaceChildren.apply(tableBody, displayRows.map(function (entry) {
          var rowElement = document.createElement('tr')
          rowElement.tabIndex = mode === 'preview' && !suspended ? 0 : -1
          rowElement.dataset.sourceIndex = String(entry.sourceIndex)
          rowElement.dataset.selected = String(entry.sourceIndex === selectedIndex)
          rowElement.append(
            createCell('td', entry.row.route),
            createCell('td', entry.row.fit),
            createCell('td', entry.row.editability),
            createCell('td', entry.row.score)
          )
          return rowElement
        }))
      }

      function activateRow(rowElement) {
        if (suspended || mode !== 'preview') return
        selectedIndex = Number(rowElement.dataset.sourceIndex)
        var selected = rows()[selectedIndex] || {}
        render()
        setStatus('selectedStatusTemplate', { route: stringValue(selected.route) })
        ctx.emit('table:row-selected', { index: selectedIndex, route: selected.route })
      }

      function onClick(event) {
        if (!(event.target instanceof Element)) return
        var action = event.target.closest('[data-action]')
        if (action && action instanceof HTMLButtonElement) {
          if (suspended || mode !== 'preview') return
          if (action.dataset.action === 'sort') {
            sorted = true
            render()
            setStatus('sortedStatus')
            ctx.emit('table:sorted')
          } else {
            sorted = false
            selectedIndex = -1
            render()
            setStatus('resetStatus')
            ctx.emit('table:reset')
          }
          return
        }
        var row = event.target.closest('tbody tr')
        if (row instanceof HTMLTableRowElement) activateRow(row)
      }

      function onKeyDown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return
        if (!(event.target instanceof HTMLTableRowElement)) return
        event.preventDefault()
        activateRow(event.target)
      }

      shell.addEventListener('click', onClick)
      shell.addEventListener('keydown', onKeyDown)
      render()
      setStatus('readyStatus')
      ctx.capture.waitUntil(document.fonts && document.fonts.ready
        ? document.fonts.ready
        : Promise.resolve())

      return {
        setMode: function (nextMode) {
          mode = nextMode
          render()
        },
        resize: function () {
          render()
        },
        updateProps: function (nextProps) {
          props = nextProps
          selectedIndex = -1
          sorted = false
          render()
          setStatus('readyStatus')
        },
        setVisible: function (visible) {
          root.style.display = visible ? '' : 'none'
          root.style.pointerEvents = visible ? '' : 'none'
        },
        suspend: function () {
          suspended = true
          render()
          setStatus('suspendedStatus')
        },
        resume: function () {
          suspended = false
          render()
          setStatus('readyStatus')
        },
        prepareCapture: function () {
          sorted = false
          selectedIndex = 0
          render()
          var first = rows()[0] || {}
          setStatus('selectedStatusTemplate', { route: stringValue(first.route) })
        },
        destroy: function () {
          if (destroyed) return
          destroyed = true
          shell.removeEventListener('click', onClick)
          shell.removeEventListener('keydown', onKeyDown)
          root.replaceChildren()
        }
      }
    }
  })
})()
