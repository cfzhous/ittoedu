import type { ExportPayload } from '../shared/componentTypes'
import { PlayerApp, type PlayerAppOptions } from './PlayerApp'
import {
  assertExportPayload,
  decodeExportPayload,
  loadExportPayloadFromUrl,
} from './payload'

export function startPlayer(
  payloadOrEncoded: ExportPayload | string,
  root: HTMLElement | string = 'lesson-root',
  options: PlayerAppOptions = {},
): PlayerApp {
  const payload =
    typeof payloadOrEncoded === 'string'
      ? decodeExportPayload(payloadOrEncoded)
      : payloadOrEncoded
  assertExportPayload(payload)

  const rootElement =
    typeof root === 'string' ? document.getElementById(root) : root
  if (!rootElement) {
    throw new Error('找不到课件播放器容器')
  }

  return new PlayerApp(payload, rootElement, options)
}

function showBootstrapError(error: unknown): void {
  console.error('课件播放器启动失败', error)
  const root = document.getElementById('lesson-root')
  if (!root) {
    return
  }

  const message = document.createElement('div')
  message.className = 'lesson-player-error'
  message.textContent = '课件加载失败。请重新导出课件后再试。'
  root.replaceChildren(message)
}

function postEditorBridgeMessage(message: Record<string, unknown>): void {
  if (window.parent === window) return
  const token = window.__H5_LESSON_BRIDGE_TOKEN__
  window.parent.postMessage(
    typeof token === 'string' && token
      ? { ...message, token }
      : message,
    '*',
  )
}

function startAndExposePlayer(payload: ExportPayload | string): PlayerApp | null {
  try {
    const player = startPlayer(
      payload,
      'lesson-root',
      window.__H5_LESSON_PLAYER_OPTIONS__,
    )
    window.__H5_LESSON_PLAYER__ = player
    postEditorBridgeMessage({ type: 'courseware-player:ready' })
    return player
  } catch (error) {
    showBootstrapError(error)
    return null
  }
}

let pendingBridgeScene: {
  sceneId: string
  /** The command arrived before Phaser accepted navigation (usually boot). */
  retryOnMismatch: boolean
} | null = null
let pendingBridgeState: {
  sceneId: string | null
  stateId: string
  transition?: Parameters<PlayerApp['setPresentationState']>[1]
} | null = null
let lastForwardedBridgeSceneId: string | null = null
let holdBridgePresentationEvents = false
let heldBridgePresentationDetail: unknown = null

function applyPendingBridgeState(player: PlayerApp): void {
  const pending = pendingBridgeState
  if (!pending || pendingBridgeScene) return
  if (pending.sceneId && player.getCurrentSceneId() !== pending.sceneId) return
  // State application is synchronous once the target scene exists. Clear the
  // command even when the id is invalid, so it cannot leak into a later scene.
  player.setPresentationState(pending.stateId, pending.transition)
  pendingBridgeState = null
}

function handleEditorBridgeMessage(event: MessageEvent): void {
  if (window.parent === window || event.source !== window.parent) return
  const message = event.data as {
    type?: unknown
    sceneId?: unknown
    stateId?: unknown
    transition?: unknown
  } | null
  const player = window.__H5_LESSON_PLAYER__
  if (!message || !player || typeof message.type !== 'string') return
  if (
    message.type === 'courseware-editor:set-scene' &&
    typeof message.sceneId === 'string'
  ) {
    // A scene command starts a new synchronization transaction. Workspace sends
    // the desired state immediately afterwards when one is selected.
    pendingBridgeState = null
    if (player.getCurrentSceneId() === message.sceneId) {
      // Calling through also cancels a possible in-flight request for another
      // scene. No future scene-change event is guaranteed for this no-op.
      player.goToSceneById(message.sceneId)
      pendingBridgeScene = null
      applyPendingBridgeState(player)
      return
    }
    const accepted = player.goToSceneById(message.sceneId)
    pendingBridgeScene = {
      sceneId: message.sceneId,
      retryOnMismatch: !accepted,
    }
  } else if (
    message.type === 'courseware-editor:set-presentation-state' &&
    typeof message.stateId === 'string'
  ) {
    const transition = typeof message.transition === 'object' && message.transition !== null
      ? message.transition as Parameters<PlayerApp['setPresentationState']>[1]
      : undefined
    const sceneId = typeof message.sceneId === 'string'
      ? message.sceneId
      : pendingBridgeScene?.sceneId ?? player.getCurrentSceneId()
    pendingBridgeState = { sceneId, stateId: message.stateId, transition }
    applyPendingBridgeState(player)
  }
}

function forwardPlayerEvent(event: Event): void {
  if (window.parent === window) return
  const custom = event as CustomEvent<unknown>
  const player = window.__H5_LESSON_PLAYER__
  if (
    event.type === 'courseware-presentation-change' &&
    holdBridgePresentationEvents
  ) {
    heldBridgePresentationDetail = custom.detail
    return
  }
  if (event.type === 'courseware-scene-change' && pendingBridgeScene && player) {
    const detail = custom.detail as { sceneId?: unknown } | null
    if (detail?.sceneId !== pendingBridgeScene.sceneId) {
      if (pendingBridgeScene.retryOnMismatch) {
        const accepted = player.goToSceneById(pendingBridgeScene.sceneId)
        if (accepted) {
          pendingBridgeScene.retryOnMismatch = false
          // Suppress the boot scene: the requested scene will emit next.
          return
        }
      }
      // A navigation guard may redirect the editor request. Accept the actual
      // scene instead of repeatedly forcing the blocked target.
      pendingBridgeScene = null
      pendingBridgeState = null
    } else {
      pendingBridgeScene = null
    }
  }
  const detail = custom.detail as { sceneId?: unknown } | null
  if (event.type === 'courseware-scene-change' && player) {
    // Apply the editor-requested state before announcing the scene. Otherwise
    // Workspace briefly receives the authored initial state, echoes it back,
    // and can overwrite the requested state after the Player already rendered
    // it. Presentation events raised by this synchronous apply are held until
    // the final scene payload has reached the editor.
    holdBridgePresentationEvents = true
    heldBridgePresentationDetail = null
    try {
      applyPendingBridgeState(player)
    } finally {
      holdBridgePresentationEvents = false
    }
    const sceneId = typeof detail?.sceneId === 'string'
      ? detail.sceneId
      : player.getCurrentSceneId()
    lastForwardedBridgeSceneId = sceneId
    const sceneDetail = {
      ...(typeof custom.detail === 'object' && custom.detail !== null
        ? custom.detail as Record<string, unknown>
        : {}),
      sceneId,
      presentationStateId: player.getCurrentPresentationStateId(),
    }
    postEditorBridgeMessage({
      type: 'courseware-player:scene-change',
      detail: sceneDetail,
    })
    if (heldBridgePresentationDetail !== null) {
      postEditorBridgeMessage({
        type: 'courseware-player:presentation-change',
        detail: heldBridgePresentationDetail,
      })
      heldBridgePresentationDetail = null
    }
    return
  }
  if (event.type === 'courseware-presentation-change') {
    // PlayerScene establishes (and runtime may change) the target state before
    // PlayerApp announces the new scene. The scene-change payload already carries
    // that final state, so suppress out-of-context presentation messages here.
    if (
      typeof detail?.sceneId === 'string' &&
      detail.sceneId !== lastForwardedBridgeSceneId
    ) {
      return
    }
  } else if (typeof detail?.sceneId === 'string') {
    lastForwardedBridgeSceneId = detail.sceneId
  }
  const type = event.type === 'courseware-scene-change'
    ? 'courseware-player:scene-change'
    : 'courseware-player:presentation-change'
  postEditorBridgeMessage({ type, detail: custom.detail })
}

function configuredPayloadUrl(): string | null {
  if (
    typeof window.__H5_LESSON_PAYLOAD_URL__ === 'string' &&
    window.__H5_LESSON_PAYLOAD_URL__.trim()
  ) {
    return window.__H5_LESSON_PAYLOAD_URL__
  }

  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="courseware-payload"]',
  )
  return meta?.content.trim() || null
}

function destroyExposedPlayer(event: PageTransitionEvent): void {
  // A persisted page can resume from the back-forward cache with the same
  // live WebGL/Phaser resources. A final unload or removed preview iframe must
  // deterministically release runtimes, component DOM mounts and GPU objects.
  if (event.persisted) return
  window.__H5_LESSON_PLAYER__?.destroy()
  delete window.__H5_LESSON_PLAYER__
  pendingBridgeScene = null
  pendingBridgeState = null
  heldBridgePresentationDetail = null
}

async function bootstrapPlayerFromUrl(
  payloadUrl: string,
  fallbackPayload?: ExportPayload,
): Promise<PlayerApp | null> {
  try {
    const payload = await loadExportPayloadFromUrl(payloadUrl)
    return startAndExposePlayer(payload)
  } catch (error) {
    if (fallbackPayload) {
      console.warn('course.json 无法直接载入，改用离线网页包数据', error)
      return startAndExposePlayer(fallbackPayload)
    }
    showBootstrapError(error)
    return null
  }
}

export function bootstrapPlayer(): PlayerApp | null {
  if (window.__H5_LESSON_PLAYER__) {
    return window.__H5_LESSON_PLAYER__
  }

  const payloadUrl = configuredPayloadUrl()
  const fallbackPayload = window.__H5_LESSON_PAYLOAD_FALLBACK__
  if (payloadUrl) {
    // Browsers generally block fetch(file://.../course.json). The generated
    // package therefore carries the same JSON object in a small local script,
    // while hosted packages still load the canonical course.json file.
    if (window.location.protocol === 'file:' && fallbackPayload) {
      return startAndExposePlayer(fallbackPayload)
    }
    void bootstrapPlayerFromUrl(payloadUrl, fallbackPayload)
    return null
  }

  const inlinePayload = window.__H5_LESSON_PAYLOAD__
  return inlinePayload ? startAndExposePlayer(inlinePayload) : null
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('message', handleEditorBridgeMessage)
  window.addEventListener('courseware-scene-change', forwardPlayerEvent)
  window.addEventListener('courseware-presentation-change', forwardPlayerEvent)
  window.addEventListener('pagehide', destroyExposedPlayer)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapPlayer, { once: true })
  } else {
    bootstrapPlayer()
  }
}

export { ComponentRegistry } from './ComponentRegistry'
export {
  decodeExportPayload,
  loadExportPayloadFromUrl,
  parseExportPayloadJson,
} from './payload'
export { PlayerApp } from './PlayerApp'
export { PlayerControls } from './PlayerControls'
export { PlayerScene } from './PlayerScene'
