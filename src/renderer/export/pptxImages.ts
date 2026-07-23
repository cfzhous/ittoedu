import type { ExportPayload } from '../../shared/componentTypes'
import { renderImageNodeCanvas } from '../../shared/imageEffects'
import type {
  ImageNode,
  SceneNode,
} from '../../shared/projectTypes'
import {
  clamp,
  pptxComponentSnapshotKey,
  pptxColor,
  pptxNodePosition,
  pptxObjectName,
  pptxRotation,
  pptxTransparency,
  type CanvasScale,
  type PptxSlide,
} from './pptxShared'

const MAX_IMAGE_RENDER_RESOLUTION = 4
const MAX_IMAGE_RENDER_PIXELS = 8_000_000

export interface PptxImageCacheEntry {
  image: HTMLImageElement
  objectUrl?: string
}

async function loadImage(
  node: ImageNode,
  payload: ExportPayload,
  assetFiles: Record<string, Uint8Array>,
): Promise<PptxImageCacheEntry> {
  const embedded = payload.assets[node.assetId]
  const bytes = assetFiles[node.assetId]
  if (!embedded && !bytes) {
    throw new Error('图片素材 ' + node.assetId + ' 缺失')
  }

  const image = new Image()
  let objectUrl: string | undefined
  if (embedded?.dataUrl) {
    image.src = embedded.dataUrl
  } else if (bytes) {
    const copy = Uint8Array.from(bytes)
    objectUrl = URL.createObjectURL(new Blob([copy.buffer], {
      type: payload.project.assets[node.assetId]?.mimeType
        ?? 'application/octet-stream',
    }))
    image.src = objectUrl
  }

  try {
    await image.decode()
    return { image, objectUrl }
  } catch (error) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    throw error
  }
}

export function releasePptxImageCache(
  imageCache: Map<string, PptxImageCacheEntry>,
): void {
  imageCache.forEach(({ objectUrl }) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  })
  imageCache.clear()
}

export function addPptxMissingObject(
  slide: PptxSlide,
  node: SceneNode,
  scale: CanvasScale,
  message: string,
): void {
  slide.addText(message, {
    ...pptxNodePosition(node, scale),
    objectName: pptxObjectName(node),
    rotate: pptxRotation(node.rotation),
    margin: 4,
    align: 'center',
    valign: 'middle',
    fontFace: 'Microsoft YaHei',
    fontSize: Math.max(10, Math.min(
      18,
      node.height * 0.75 / 5,
    )),
    color: '991B1B',
    fill: {
      color: 'FFF1F2',
      transparency: pptxTransparency(node.opacity),
    },
    line: {
      color: 'EF4444',
      width: 1.5,
      transparency: pptxTransparency(node.opacity),
    },
    fit: 'shrink',
  })
}

export async function addPptxImageNode(
  slide: PptxSlide,
  node: ImageNode,
  payload: ExportPayload,
  assetFiles: Record<string, Uint8Array>,
  imageCache: Map<string, PptxImageCacheEntry>,
  scale: CanvasScale,
): Promise<void> {
  try {
    let source = imageCache.get(node.assetId)
    if (!source) {
      source = await loadImage(node, payload, assetFiles)
      imageCache.set(node.assetId, source)
    }
    const meta = payload.project.assets[node.assetId]
    const sourceWidth = source.image.naturalWidth
      || meta?.width
      || node.width
    const sourceHeight = source.image.naturalHeight
      || meta?.height
      || node.height
    const sourceResolution = Math.max(
      sourceWidth / Math.max(1, node.width),
      sourceHeight / Math.max(1, node.height),
    )
    const pixelLimitResolution = Math.sqrt(
      MAX_IMAGE_RENDER_PIXELS / Math.max(1, node.width * node.height),
    )
    const renderResolution = clamp(
      Math.min(sourceResolution, pixelLimitResolution),
      1,
      MAX_IMAGE_RENDER_RESOLUTION,
    )
    const canvas = renderImageNodeCanvas(
      source.image,
      sourceWidth,
      sourceHeight,
      node,
      node.width,
      node.height,
      renderResolution,
    )
    const data = canvas.toDataURL('image/png')
    canvas.width = 1
    canvas.height = 1

    slide.addImage({
      data,
      ...pptxNodePosition(node, scale),
      rotate: pptxRotation(node.rotation),
      transparency: pptxTransparency(node.opacity),
      objectName: pptxObjectName(node),
      altText: node.name + '（图片素材）',
    })
  } catch (error) {
    console.warn('PPTX 图片节点 ' + node.id + ' 导出失败', error)
    addPptxMissingObject(slide, node, scale, '图片素材缺失')
  }
}

export function addPptxComponentNode(
  slide: PptxSlide,
  node: Extract<SceneNode, { type: 'external-component' }>,
  sceneId: string,
  snapshots: Map<string, string>,
  scale: CanvasScale,
  snapshotKey = pptxComponentSnapshotKey(sceneId, node.id),
): void {
  const data = snapshots.get(snapshotKey)
  if (!data) {
    addPptxMissingObject(
      slide,
      node,
      scale,
      '互动组件：' + node.name,
    )
    return
  }

  slide.addImage({
    data,
    ...pptxNodePosition(node, scale),
    rotate: pptxRotation(node.rotation),
    transparency: pptxTransparency(node.opacity),
    objectName: pptxObjectName(node),
    altText: node.name + '（互动组件静态快照）',
  })
}
