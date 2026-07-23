;(() => {
  const currentScript = document.currentScript
  const rawToken = currentScript instanceof HTMLScriptElement
    ? currentScript.dataset.token ||
      (currentScript.src ? new URL(currentScript.src).hash.slice(1) : '')
    : ''
  const token = rawToken ? decodeURIComponent(rawToken) : ''
  if (!token || window.parent === window) return

  const reportFailure = (error) => {
    const message = error instanceof Error ? error.message : String(error)
    window.parent.postMessage({
      type: 'courseware-preview-bootstrap:error',
      token,
      message,
    }, '*')
    return message
  }

  let started = false
  const onMessage = (event) => {
    const message = event.data
    if (
      started ||
      event.source !== window.parent ||
      !message ||
      message.type !== 'courseware-preview-bootstrap:init' ||
      message.token !== token ||
      typeof message.encodedPayload !== 'string' ||
      typeof message.playerBundle !== 'string'
    ) {
      return
    }
    started = true
    window.removeEventListener('message', onMessage)
    // Bind every Player -> editor event to this exact iframe payload. The same
    // iframe contentWindow survives srcDoc navigations, so event.source alone
    // cannot distinguish a late message from the previous Player instance.
    window.__H5_LESSON_BRIDGE_TOKEN__ = token
    window.__H5_LESSON_PAYLOAD__ = message.encodedPayload
    const playerOptions = {}
    if (typeof message.initialSceneId === 'string' && message.initialSceneId.trim()) {
      playerOptions.initialSceneId = message.initialSceneId.trim()
    }
    if (typeof message.initialStateId === 'string' && message.initialStateId.trim()) {
      playerOptions.initialStateId = message.initialStateId.trim()
    }
    window.__H5_LESSON_PLAYER_OPTIONS__ = playerOptions
    try {
      ;(0, eval)(message.playerBundle)
    } catch (error) {
      const message = reportFailure(error)
      const root = document.getElementById('lesson-root')
      if (root) {
        root.innerHTML = ''
        const failure = document.createElement('div')
        failure.className = 'lesson-player-error'
        failure.textContent = `当前位置试运行启动失败：${message}`
        root.append(failure)
      }
    }
  }

  window.addEventListener('message', onMessage)
  window.parent.postMessage({
    type: 'courseware-preview-bootstrap:ready',
    token,
  }, '*')
})()
