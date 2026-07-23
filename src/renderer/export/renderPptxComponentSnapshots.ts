import type { ExportPayload } from '../../shared/componentTypes'
import type {
  ExternalComponentNode,
  GlobalLayerItem,
  SceneDocument,
} from '../../shared/projectTypes'
import { PlayerApp } from '../../player/PlayerApp'
import {
  pptxComponentSnapshotKey,
  pptxGlobalComponentSnapshotKey,
} from './pptxShared'
import { isGlobalLayerItemVisibleForScene } from './v3ExportSupport'
import { materializeScene } from '../../shared/presentation'
import {
  capturePlayerStage,
  createHiddenPlayerRoot,
  sizeHiddenPlayerStage,
  waitForPlayerCaptureReady,
  waitForPlayerScene,
} from './playerCapture'

type GlobalComponentLayerItem = GlobalLayerItem & {
  node: ExternalComponentNode
}

interface ComponentSnapshotEntry {
  renderIndex: number
  sceneId: string
  node: ExternalComponentNode
  renderSceneId: string
  snapshotKey: string
  globalItem?: GlobalComponentLayerItem
}

export interface PptxComponentSnapshotFailure {
  snapshotKey: string
  sceneId: string
  nodeId: string
  label: string
  error: unknown
}

export interface RenderPptxComponentSnapshotsOptions {
  onFailure?(failure: PptxComponentSnapshotFailure): void
}

async function cropSnapshot(
  dataUrl: string,
  width: number,
  height: number,
  sourceWidth: number,
  sourceHeight: number,
): Promise<string> {
  if (
    Math.ceil(width) === Math.ceil(sourceWidth) &&
    Math.ceil(height) === Math.ceil(sourceHeight)
  ) {
    return dataUrl
  }
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const candidate = new Image()
    candidate.onload = () => resolve(candidate)
    candidate.onerror = () => reject(new Error('组件合成快照无法重新读取'))
    candidate.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width))
  canvas.height = Math.max(1, Math.ceil(height))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建组件快照裁剪画布')
  context.drawImage(image, 0, 0)
  return canvas.toDataURL('image/png')
}

function isolatedScene(
  entry: ComponentSnapshotEntry,
): SceneDocument {
  return {
    id: entry.renderSceneId,
    name: entry.node.name,
    backgroundColor: '#000000',
    backgroundAssetId: null,
    interactions: [],
    nodes: entry.globalItem
      ? []
      : [
          {
            ...entry.node,
            props: structuredClone(entry.node.props),
            x: 0,
            y: 0,
            rotation: 0,
            opacity: 1,
            visible: true,
          },
        ],
  }
}

function isolatedGlobalLayer(entry: ComponentSnapshotEntry): GlobalLayerItem[] {
  if (!entry.globalItem) return []
  return [{
    ...entry.globalItem,
    node: {
      ...entry.node,
      id: `pptx-global-component-${entry.renderIndex}-${entry.node.id}`,
      props: structuredClone(entry.node.props),
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      visible: true,
    },
    visibility: {
      mode: 'include' as const,
      sceneIds: [entry.renderSceneId],
    },
  }]
}

/**
 * External components are executable Phaser, DOM or Hybrid content and cannot
 * be represented as editable DrawingML. Render each visible instance through
 * the real Player compositor so it remains an independent PowerPoint picture.
 */
export async function renderPptxComponentSnapshots(
  payload: ExportPayload,
  options: RenderPptxComponentSnapshotsOptions = {},
): Promise<Map<string, string>> {
  const entries: ComponentSnapshotEntry[] = []
  for (const scene of payload.project.scenes) {
    for (const node of materializeScene(scene).nodes) {
      if (node.type === 'external-component' && node.visible) {
        const index = entries.length
        entries.push({
          renderIndex: index,
          sceneId: scene.id,
          node,
          renderSceneId: `pptx-component-${index}-${scene.id}`,
          snapshotKey: pptxComponentSnapshotKey(scene.id, node.id),
        })
      }
    }
    for (const item of payload.project.globalLayer) {
      if (
        item.node.type === 'external-component' &&
        item.node.visible &&
        isGlobalLayerItemVisibleForScene(item, scene.id)
      ) {
        const index = entries.length
        const globalItem: GlobalComponentLayerItem = {
          ...item,
          node: item.node,
        }
        entries.push({
          renderIndex: index,
          sceneId: scene.id,
          node: item.node,
          renderSceneId: `pptx-global-component-${index}-${scene.id}`,
          snapshotKey: pptxGlobalComponentSnapshotKey(
            scene.id,
            item.node.id,
          ),
          globalItem,
        })
      }
    }
  }
  if (entries.length === 0) return new Map()

  const renderWidth = Math.max(
    1,
    ...entries.map(({ node }) => Math.ceil(node.width)),
  )
  const renderHeight = Math.max(
    1,
    ...entries.map(({ node }) => Math.ceil(node.height)),
  )
  const snapshots = new Map<string, string>()
  for (const entry of entries) {
    // A Player eagerly mounts every persistent global component. Keeping one
    // entry per Player bounds WebGL contexts, subscriptions and timers to one
    // authored instance, and also prevents one component's courseState writes
    // from influencing a later snapshot.
    const isolatedPayload: ExportPayload = {
      project: {
        ...payload.project,
        globalRuntime: undefined,
        globalInteractions: [],
        globalLayer: isolatedGlobalLayer(entry),
        scenes: [isolatedScene(entry)],
      },
      assets: payload.assets,
      components: payload.components,
    }
    let root: HTMLDivElement | null = null
    let player: PlayerApp | null = null
    try {
      root = createHiddenPlayerRoot(renderWidth, renderHeight)
      player = new PlayerApp(isolatedPayload, root, {
        transparent: true,
        renderWidth,
        renderHeight,
        controls: false,
        // Host entrance effects must never leak an intermediate frame into a
        // static PowerPoint component snapshot.
        mode: 'capture',
      })
      sizeHiddenPlayerStage(root, renderWidth, renderHeight)
      await waitForPlayerScene(player, 0)
      await waitForPlayerCaptureReady(player)
      const composed = await capturePlayerStage(
        player,
        root,
        renderWidth,
        renderHeight,
      )
      snapshots.set(
        entry.snapshotKey,
        await cropSnapshot(
          composed,
          entry.node.width,
          entry.node.height,
          renderWidth,
          renderHeight,
        ),
      )
    } catch (error) {
      options.onFailure?.({
        snapshotKey: entry.snapshotKey,
        sceneId: entry.sceneId,
        nodeId: entry.node.id,
        label: entry.node.name,
        error,
      })
    } finally {
      try {
        player?.destroy()
      } catch (error) {
        console.warn(
          `PPTX 组件“${entry.node.name}”快照 Player 清理失败`,
          error,
        )
      }
      root?.remove()
    }
  }
  return snapshots
}
