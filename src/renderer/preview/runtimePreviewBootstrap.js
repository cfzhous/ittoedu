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

  const assetUrlPrefix = 'courseware-preview-asset:'
  const assetUrls = []
  const revokeAssetUrls = () => {
    for (const url of assetUrls.splice(0)) URL.revokeObjectURL(url)
  }

  const encodePayload = (payload) => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload))
    const chunkSize = 24_576
    let output = ''
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, bytes.length)
      let binary = ''
      for (let index = offset; index < end; index += 1) {
        binary += String.fromCharCode(bytes[index])
      }
      output += window.btoa(binary)
    }
    return output
  }

  const materializePayloadAssets = (payload, assetTransfers) => {
    const transfers = new Map()
    for (const candidate of assetTransfers) {
      if (
        !candidate ||
        typeof candidate.placeholder !== 'string' ||
        !/^courseware-preview-asset:\d+$/.test(candidate.placeholder) ||
        typeof candidate.mimeType !== 'string' ||
        !candidate.mimeType ||
        candidate.mimeType.length > 256 ||
        !(candidate.bytes instanceof ArrayBuffer) ||
        transfers.has(candidate.placeholder)
      ) {
        throw new Error('编辑器发送了无效的沙箱素材。')
      }
      const url = URL.createObjectURL(new Blob([candidate.bytes], {
        type: candidate.mimeType,
      }))
      assetUrls.push(url)
      transfers.set(candidate.placeholder, {
        mimeType: candidate.mimeType,
        url,
      })
    }

    const used = new Set()
    const replaceAssets = (record) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) return
      for (const asset of Object.values(record)) {
        if (!asset || typeof asset !== 'object') continue
        const placeholder = asset.dataUrl
        if (
          typeof placeholder !== 'string' ||
          !placeholder.startsWith(assetUrlPrefix)
        ) {
          continue
        }
        const transfer = transfers.get(placeholder)
        if (!transfer || asset.mimeType !== transfer.mimeType) {
          throw new Error(`沙箱素材“${placeholder}”缺少匹配的二进制数据。`)
        }
        asset.dataUrl = transfer.url
        used.add(placeholder)
      }
    }

    replaceAssets(payload.assets)
    if (
      payload.components &&
      typeof payload.components === 'object' &&
      !Array.isArray(payload.components)
    ) {
      for (const component of Object.values(payload.components)) {
        replaceAssets(component && typeof component === 'object'
          ? component.assets
          : null)
      }
    }
    if (used.size !== transfers.size) {
      throw new Error('编辑器发送了未被工程引用的沙箱素材。')
    }
    return payload
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
      !message.payload ||
      typeof message.payload !== 'object' ||
      Array.isArray(message.payload) ||
      !Array.isArray(message.assetTransfers) ||
      typeof message.playerBundle !== 'string'
    ) {
      return
    }
    started = true
    window.removeEventListener('message', onMessage)
    // Bind every Player -> editor event to this exact iframe payload. The same
    // iframe contentWindow survives srcDoc navigations, so event.source alone
    // cannot distinguish a late message from the previous Player instance.
    try {
      window.__H5_LESSON_BRIDGE_TOKEN__ = token
      window.__H5_LESSON_PAYLOAD__ = encodePayload(
        materializePayloadAssets(message.payload, message.assetTransfers),
      )
      window.addEventListener('pagehide', revokeAssetUrls, { once: true })
      const playerOptions = {}
      if (
        typeof message.initialSceneId === 'string' &&
        message.initialSceneId.trim()
      ) {
        playerOptions.initialSceneId = message.initialSceneId.trim()
      }
      if (
        typeof message.initialStateId === 'string' &&
        message.initialStateId.trim()
      ) {
        playerOptions.initialStateId = message.initialStateId.trim()
      } else if (message.initialStateId === null) {
        playerOptions.initialStateId = null
      }
      // The editor's central Stage owns the full 1280 x 720 viewport. Suppress
      // the legacy shell footer in both edit and run mode without disabling
      // teacher-controller nodes authored directly on the canvas.
      playerOptions.shellControls = false
      if (message.hostMode === 'authoring' || message.hostMode === 'playback') {
        playerOptions.hostMode = message.hostMode
      }
      if (
        message.hostMode === 'authoring' &&
        (message.editingScope === 'scene' || message.editingScope === 'global')
      ) {
        playerOptions.authoringScope = message.editingScope
      }
      window.__H5_LESSON_PLAYER_OPTIONS__ = playerOptions
      ;(0, eval)(message.playerBundle)
    } catch (error) {
      revokeAssetUrls()
      const message = reportFailure(error)
      const root = document.getElementById('lesson-root')
      if (root) {
        root.innerHTML = ''
        const failure = document.createElement('div')
        failure.className = 'lesson-player-error'
        failure.textContent = `统一画布启动失败：${message}`
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
