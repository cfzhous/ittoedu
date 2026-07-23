CoursewareRuntime.define({
  runtimeApiVersion: 1,

  create: function (ctx) {
    var currentSceneId = ''
    var statusKey = 'courseStarting'
    var statusValues = {}

    var panel = document.createElement('section')
    var title = document.createElement('strong')
    var progress = document.createElement('span')
    var state = document.createElement('span')
    var status = document.createElement('span')

    panel.setAttribute('aria-label', ctx.content.get('ariaLabel'))
    Object.assign(panel.style, {
      position: 'absolute',
      left: '24px',
      top: '22px',
      width: '620px',
      minHeight: '82px',
      display: 'grid',
      gridTemplateColumns: '180px 1fr',
      gap: '6px 16px',
      alignItems: 'center',
      padding: '12px 18px',
      border: '1px solid rgba(125, 211, 252, .55)',
      borderRadius: '18px',
      color: '#e0f2fe',
      background: 'linear-gradient(135deg, rgba(8, 47, 73, .94), rgba(15, 23, 42, .9))',
      boxShadow: '0 18px 40px rgba(2, 8, 23, .28)',
      pointerEvents: 'none'
    })
    Object.assign(title.style, {
      gridRow: '1 / span 2',
      color: '#7dd3fc',
      fontSize: '18px',
      letterSpacing: '.04em'
    })
    Object.assign(progress.style, { fontSize: '14px', fontWeight: '700' })
    Object.assign(state.style, { color: '#bae6fd', fontSize: '13px' })
    Object.assign(status.style, {
      gridColumn: '1 / -1',
      color: '#cbd5e1',
      fontSize: '12px'
    })
    panel.append(title, progress, state, status)
    ctx.dom.overlay.append(panel)

    function sceneName(sceneId) {
      var key = 'sceneName.' + sceneId
      var all = ctx.content.all()
      return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : ''
    }

    function format(template, values) {
      return Object.entries(values).reduce(function (result, entry) {
        return result.replaceAll('{' + entry[0] + '}', String(entry[1]))
      }, template)
    }

    function visitedScenes() {
      var value = ctx.courseState.get('visitedSceneIds')
      return Array.isArray(value) ? value : []
    }

    function render() {
      var visited = visitedScenes()
      var passed = ctx.courseState.get('challengePassed') === true
      title.textContent = ctx.content.get('hudTitle')
      progress.textContent = format(ctx.content.get('progressTemplate'), {
        current: visited.length,
        total: 3,
        scene: sceneName(currentSceneId)
      })
      state.textContent = format(
        passed
          ? ctx.content.get('challengeComplete')
          : ctx.content.get('challengePending'),
        { count: Number(ctx.courseState.get('globalControls.uses') || 0) }
      )
      status.textContent = format(ctx.content.get('status.' + statusKey), statusValues)
    }

    function setStatus(key, values) {
      statusKey = key
      statusValues = values || {}
      render()
    }

    if (!Array.isArray(ctx.courseState.get('visitedSceneIds'))) {
      ctx.courseState.set('visitedSceneIds', [])
    }

    var disposers = []
    disposers.push(ctx.events.on('course:start', function () {
      setStatus('courseStarted')
    }))
    disposers.push(ctx.events.on('course:restart', function () {
      setStatus('courseRestarted')
    }))
    disposers.push(ctx.events.on('scene:enter', function (event) {
      currentSceneId = event.sceneId
      var visited = visitedScenes()
      if (!visited.includes(currentSceneId)) {
        ctx.courseState.set('visitedSceneIds', visited.concat(currentSceneId))
      }
      setStatus('sceneEntered', { scene: sceneName(currentSceneId) })
    }))
    disposers.push(ctx.events.on('runtime:event', function (event) {
      if (event.eventName === 'intro:complete') {
        setStatus('introCompleted')
      }
      if (event.eventName === 'challenge:passed') {
        setStatus('challengePassed')
      }
    }))
    disposers.push(ctx.events.on('component:event', function (event) {
      if (event.eventName !== 'control:used') return
      var action = event.payload && typeof event.payload.action === 'string'
        ? event.payload.action
        : ''
      var all = ctx.content.all()
      var actionKey = 'action.' + action
      var actionLabel = Object.prototype.hasOwnProperty.call(all, actionKey)
        ? all[actionKey]
        : ''
      setStatus('componentUsed', { action: actionLabel })
    }))
    disposers.push(ctx.events.on('navigation:blocked', function () {
      setStatus('navigationBlocked')
    }))

    var removeGuard = ctx.navigation.guard(function (request) {
      if (
        request.toSceneId === 'scene_summary' &&
        ctx.courseState.get('challengePassed') !== true
      ) {
        setStatus('navigationBlocked')
        return false
      }
      return true
    })

    ctx.capture.waitUntil(document.fonts ? document.fonts.ready : Promise.resolve())
    render()

    return {
      destroy: function () {
        removeGuard()
        disposers.forEach(function (dispose) { dispose() })
        panel.remove()
      }
    }
  }
})
