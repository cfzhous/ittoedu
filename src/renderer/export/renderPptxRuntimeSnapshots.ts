import type { ExportPayload } from '../../shared/componentTypes'
import type { SceneDocument } from '../../shared/projectTypes'
import type { RuntimeLayer, RuntimeScope } from '../../shared/runtimeTypes'
import { PlayerApp } from '../../player/PlayerApp'
import {
  capturePlayerStage,
  createHiddenPlayerRoot,
  playerSupportsRuntimeCapture,
  settleCaptureFrames,
  sizeHiddenPlayerStage,
  waitForPlayerCaptureReady,
  waitForPlayerScene,
} from './playerCapture'
import { runtimeSnapshotKey } from './v3ExportSupport'

export interface PptxRuntimeSnapshotFailure {
  /** Runtime-level key used when prepare/create/navigation fails. */
  entryKey: string
  /** Layer key for a layer capture failure, otherwise the runtime-level key. */
  snapshotKey: string
  scope: RuntimeScope
  sceneId: string
  layer?: RuntimeLayer
  label: string
  error: unknown
}

export interface RenderPptxRuntimeSnapshotsOptions {
  onFailure?(failure: PptxRuntimeSnapshotFailure): void
}

function isolatedScene(
  scene: SceneDocument,
  scope: RuntimeScope,
): SceneDocument {
  return {
    ...structuredClone(scene),
    runtime: scope === 'scene' ? scene.runtime : undefined,
  }
}

function isolatedPayload(
  payload: ExportPayload,
  scope: RuntimeScope,
): ExportPayload {
  const inertComponents = Object.fromEntries(
    Object.entries(payload.components).map(([key, component]) => [
      key,
      {
        ...component,
        // Keep an authentic external-component node/root for runtime bindings,
        // but never execute the authored component while isolating a runtime
        // snapshot. The no-op definition deliberately matches every legacy/V4
        // manifest version and renderMode.
        runtimeSource: `CoursewareComponent.define({id:${JSON.stringify(
          component.manifest.id,
        )},runtimeApiVersion:${component.manifest.runtimeApiVersion},create:function(){return{destroy:function(){}}}});`,
      },
    ]),
  )
  return {
    project: {
      ...payload.project,
      globalRuntime: scope === 'global'
        ? payload.project.globalRuntime
        : undefined,
      // Preserve every global handle, including component proxies, so global
      // runtime node bindings observe the same geometry/type/visibility.
      globalLayer: payload.project.globalLayer.map((item) =>
        structuredClone(item)),
      scenes: payload.project.scenes.map((scene) => isolatedScene(scene, scope)),
    },
    assets: payload.assets,
    components: inertComponents,
  }
}

function setCaptureLayerVisibility(
  player: PlayerApp,
  root: HTMLElement,
  scope: RuntimeScope,
  layer: RuntimeLayer | null,
): () => void {
  const scene = player.game.scene.getScene('courseware-player')
  const targetName = layer ? `${scope}-${layer}` : null
  const restoreAuthoredNodes: Array<() => void> = []
  for (const name of [
    'global-underlay',
    'scene-underlay',
    'scene-nodes',
    'scene-overlay',
    'global-overlay',
  ]) {
    const object = scene.children.getByName(name)
    if (!object) continue
    const setVisible = Reflect.get(object, 'setVisible')
    if (typeof setVisible === 'function') {
      Reflect.apply(setVisible, object, [layer === null || name === targetName])
    }
    if (
      layer !== null &&
      (name === 'global-underlay' || name === 'global-overlay')
    ) {
      const children = Reflect.get(object, 'list')
      if (!Array.isArray(children)) continue
      for (const child of children) {
        if (
          typeof child !== 'object' ||
          child === null ||
          !String(Reflect.get(child, 'name') ?? '').startsWith('node:')
        ) {
          continue
        }
        const childSetVisible = Reflect.get(child, 'setVisible')
        if (typeof childSetVisible !== 'function') continue
        const previousVisible = Reflect.get(child, 'visible') !== false
        Reflect.apply(childSetVisible, child, [false])
        restoreAuthoredNodes.push(() => {
          Reflect.apply(childSetVisible, child, [previousVisible])
        })
      }
    }
  }

  for (const domLayer of root.querySelectorAll<HTMLElement>(
    '.lesson-runtime-layer',
  )) {
    const isTarget = layer !== null && domLayer.classList.contains(
      `lesson-runtime-layer--${scope}-${layer}`,
    )
    domLayer.style.display = layer === null || isTarget ? '' : 'none'
  }
  return () => {
    restoreAuthoredNodes.reverse().forEach((restore) => restore())
  }
}

async function imageHasVisiblePixels(dataUrl: string): Promise<boolean> {
  if (dataUrl.startsWith('data:image/svg+xml')) return true
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image()
    candidate.onload = () => resolve(candidate)
    candidate.onerror = () => reject(new Error('运行时快照无法重新读取'))
    candidate.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth || image.width
  canvas.height = image.naturalHeight || image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('无法检查运行时快照像素')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
  const stride = Math.max(4, Math.floor(pixels.length / 250_000 / 4) * 4)
  for (let index = 3; index < pixels.length; index += stride) {
    if ((pixels[index] ?? 0) > 2) return true
  }
  return false
}

async function captureScope(
  payload: ExportPayload,
  scope: RuntimeScope,
  options: RenderPptxRuntimeSnapshotsOptions,
): Promise<Map<string, string>> {
  const width = payload.project.canvas.width
  const height = payload.project.canvas.height
  const root = createHiddenPlayerRoot(width, height)
  const snapshots = new Map<string, string>()
  let player: PlayerApp | null = null
  const reportFailure = (
    scene: SceneDocument,
    error: unknown,
    layer?: RuntimeLayer,
  ): void => {
    const entryKey = runtimeSnapshotKey(scope, scene.id)
    options.onFailure?.({
      entryKey,
      snapshotKey: layer
        ? runtimeSnapshotKey(scope, scene.id, layer)
        : entryKey,
      scope,
      sceneId: scene.id,
      ...(layer ? { layer } : {}),
      label: scope === 'global'
        ? '全局自由运行时'
        : `场景自由运行时“${scene.name}”`,
      error,
    })
  }
  const reportAllEnabled = (error: unknown): void => {
    for (const scene of payload.project.scenes) {
      const runtime = scope === 'global'
        ? payload.project.globalRuntime
        : scene.runtime
      if (runtime?.enabled) reportFailure(scene, error)
    }
  }
  try {
    try {
      player = new PlayerApp(isolatedPayload(payload, scope), root, {
        transparent: true,
        renderWidth: width,
        renderHeight: height,
        controls: false,
        mode: 'capture',
      })
      sizeHiddenPlayerStage(root, width, height)
      if (!playerSupportsRuntimeCapture(player)) {
        throw new Error('Player Runtime 尚未提供静态捕获就绪接口')
      }
    } catch (error) {
      reportAllEnabled(error)
      return snapshots
    }

    for (let index = 0; index < payload.project.scenes.length; index += 1) {
      const scene = payload.project.scenes[index]!
      const runtime = scope === 'global'
        ? payload.project.globalRuntime
        : scene.runtime
      try {
        if (index > 0 && !player.goToScene(index)) {
          throw new Error(`无法渲染第 ${index + 1} 个运行时静态图层`)
        }
        await waitForPlayerScene(player, index)
      } catch (error) {
        if (runtime?.enabled) reportFailure(scene, error)
        continue
      }
      if (!runtime?.enabled) continue

      try {
        await waitForPlayerCaptureReady(player)
      } catch (error) {
        reportFailure(scene, error)
        continue
      }
      for (const layer of ['underlay', 'overlay'] as const) {
        let restoreAuthoredNodes: () => void = () => undefined
        try {
          restoreAuthoredNodes = setCaptureLayerVisibility(
            player,
            root,
            scope,
            layer,
          )
          await settleCaptureFrames(30)
          const dataUrl = await capturePlayerStage(player, root, width, height)
          if (await imageHasVisiblePixels(dataUrl)) {
            snapshots.set(runtimeSnapshotKey(scope, scene.id, layer), dataUrl)
          }
        } catch (error) {
          reportFailure(scene, error, layer)
        } finally {
          restoreAuthoredNodes()
        }
      }
      try {
        setCaptureLayerVisibility(player, root, scope, null)()
      } catch (error) {
        console.warn(
          `PPTX ${scope} Runtime 快照图层复位失败`,
          error,
        )
      }
    }
    return snapshots
  } finally {
    try {
      player?.destroy()
    } catch (error) {
      console.warn(`PPTX ${scope} Runtime 快照 Player 清理失败`, error)
    }
    root.remove()
  }
}

/**
 * Runtime snapshots are rendered separately from native nodes on a transparent
 * player. This keeps ordinary PowerPoint text, images and shapes editable while
 * still preferring the real runtime result over an authored static fallback.
 */
export async function renderPptxRuntimeSnapshots(
  payload: ExportPayload,
  options: RenderPptxRuntimeSnapshotsOptions = {},
): Promise<Map<string, string>> {
  const snapshots = new Map<string, string>()
  if (payload.project.globalRuntime?.enabled) {
    const globalSnapshots = await captureScope(payload, 'global', options)
    globalSnapshots.forEach((value, key) => snapshots.set(key, value))
  }
  if (payload.project.scenes.some((scene) => scene.runtime?.enabled)) {
    const sceneSnapshots = await captureScope(payload, 'scene', options)
    sceneSnapshots.forEach((value, key) => snapshots.set(key, value))
  }
  return snapshots
}
