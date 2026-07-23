import * as Phaser from 'phaser'
import type {
  RuntimeAssetMap,
  VideoNode,
} from '../../../shared/projectTypes'
import { BaseNodeAdapter } from './NodeAdapter'
import {
  calculateVideoFrameLayout,
  resolveVideoPosterTime,
} from './videoPosterLayout'

const POSTER_LOAD_TIMEOUT_MS = 12_000
const SEEK_TOLERANCE_SECONDS = 0.05

interface FrameSource {
  element: CanvasImageSource
  width: number
  height: number
}

function sourceSignature(node: VideoNode): string {
  return [
    node.assetId,
    node.poster.mode,
    node.poster.assetId ?? '',
    node.poster.time,
  ].join('|')
}

/**
 * Static authoring representation of a video node. The adapter never calls
 * play(): an explicit poster image is preferred, otherwise it seeks a detached
 * video element and turns that frame into a Phaser canvas texture.
 */
export class VideoNodeAdapter extends BaseNodeAdapter<VideoNode> {
  private readonly placeholder: Phaser.GameObjects.Rectangle
  private readonly label: Phaser.GameObjects.Text
  private imageObject: Phaser.GameObjects.Image | null = null
  private frameSource: FrameSource | null = null
  private sourceElement: HTMLImageElement | HTMLVideoElement | null = null
  private cancelPendingLoad: (() => void) | null = null
  private generatedTextureKey: string | null = null
  private textureRevision = 0
  private loadGeneration = 0
  private disposed = false

  constructor(
    scene: Phaser.Scene,
    node: VideoNode,
    private readonly assets: RuntimeAssetMap,
  ) {
    super(scene, node)
    this.placeholder = scene.add
      .rectangle(0, 0, node.width, node.height, 0x111827)
      .setOrigin(0)
      .setStrokeStyle(2, 0x64748b)
    this.label = scene.add
      .text(node.width / 2, node.height / 2, '正在读取视频海报…', {
        color: '#dbeafe',
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: '20px',
        align: 'center',
        wordWrap: { width: Math.max(48, node.width - 32) },
      })
      .setOrigin(0.5)
    this.content.add([this.placeholder, this.label])
    this.redraw()
    this.loadPoster()
  }

  override update(node: VideoNode): void {
    const reload = sourceSignature(this.node) !== sourceSignature(node)
    if (reload) this.clearSource()
    super.update(node)
    if (reload) this.loadPoster()
  }

  override setEditMode(_enabled: boolean): void {
    // The editing surface is deliberately static even if a caller toggles its
    // general edit-mode flag while rebuilding a scene.
    if (this.sourceElement instanceof HTMLVideoElement) {
      try {
        this.sourceElement.pause()
      } catch {
        // A detached media backend may already have been released.
      }
    }
  }

  protected redraw(): void {
    if (!this.placeholder || !this.label) return
    this.placeholder.setSize(this.width, this.height)
    this.label
      .setPosition(this.width / 2, this.height / 2)
      .setWordWrapWidth(Math.max(48, this.width - 32), false)
    if (this.frameSource) this.renderFrame()
    this.resizeInteractionTarget()
  }

  override destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.loadGeneration += 1
    this.clearSource()
    this.removeGeneratedTexture()
    super.destroy()
  }

  private loadPoster(): void {
    const generation = ++this.loadGeneration
    this.showStatus('正在读取视频海报…', false)

    const posterAsset = this.node.poster.mode === 'image' && this.node.poster.assetId
      ? this.assets[this.node.poster.assetId]
      : undefined
    if (posterAsset) {
      this.loadPosterImage(posterAsset.url, generation)
      return
    }

    const videoAsset = this.assets[this.node.assetId]
    if (!videoAsset) {
      this.showStatus(
        this.node.poster.mode === 'image'
          ? '海报与视频素材均缺失\n请重新选择素材'
          : '视频素材缺失\n请重新选择视频',
        true,
      )
      return
    }
    this.loadVideoFrame(videoAsset.url, generation)
  }

  private loadPosterImage(url: string, generation: number): void {
    const image = new Image()
    this.sourceElement = image
    const timeout = globalThis.setTimeout(() => {
      this.failLoad(generation, '视频海报读取超时\n请检查图片素材')
    }, POSTER_LOAD_TIMEOUT_MS)
    const cleanup = () => {
      globalThis.clearTimeout(timeout)
      image.onload = null
      image.onerror = null
    }
    this.cancelPendingLoad = cleanup
    image.onload = () => {
      if (!this.isCurrentLoad(generation)) return
      cleanup()
      this.cancelPendingLoad = null
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        this.failLoad(generation, '视频海报尺寸无效\n请更换图片素材')
        return
      }
      this.frameSource = {
        element: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
      }
      this.showFrame()
    }
    image.onerror = () => {
      this.failLoad(generation, '视频海报加载失败\n请检查图片素材')
    }
    image.src = url
  }

  private loadVideoFrame(url: string, generation: number): void {
    const video = document.createElement('video')
    video.autoplay = false
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'
    this.sourceElement = video

    let targetTime = 0
    const tryCapture = () => {
      if (
        !this.isCurrentLoad(generation) ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.seeking ||
        Math.abs(video.currentTime - targetTime) > SEEK_TOLERANCE_SECONDS
      ) {
        return
      }
      if (video.videoWidth <= 0 || video.videoHeight <= 0) {
        this.failLoad(generation, '无法读取视频画面尺寸\n请检查视频编码')
        return
      }
      this.cancelPendingLoad?.()
      this.cancelPendingLoad = null
      this.frameSource = {
        element: video,
        width: video.videoWidth,
        height: video.videoHeight,
      }
      this.showFrame()
    }
    const onMetadata = () => {
      if (!this.isCurrentLoad(generation)) return
      targetTime = resolveVideoPosterTime(this.node.poster.time, video.duration)
      try {
        video.currentTime = targetTime
      } catch {
        this.failLoad(generation, '无法定位视频海报时间\n请检查视频编码')
        return
      }
      tryCapture()
    }
    const onError = () => {
      this.failLoad(generation, '视频加载失败\n请检查格式或编码')
    }
    const timeout = globalThis.setTimeout(() => {
      this.failLoad(generation, '视频海报生成超时\n请检查视频格式')
    }, POSTER_LOAD_TIMEOUT_MS)
    const cleanup = () => {
      globalThis.clearTimeout(timeout)
      video.removeEventListener('loadedmetadata', onMetadata)
      video.removeEventListener('loadeddata', tryCapture)
      video.removeEventListener('seeked', tryCapture)
      video.removeEventListener('error', onError)
    }
    this.cancelPendingLoad = cleanup
    video.addEventListener('loadedmetadata', onMetadata)
    video.addEventListener('loadeddata', tryCapture)
    video.addEventListener('seeked', tryCapture)
    video.addEventListener('error', onError)
    video.src = url
    try {
      video.load()
    } catch {
      this.failLoad(generation, '视频初始化失败\n请检查素材文件')
    }
  }

  private renderFrame(): void {
    const source = this.frameSource
    if (!source || this.disposed) return
    const outputWidth = Math.max(1, Math.round(this.width))
    const outputHeight = Math.max(1, Math.round(this.height))
    const canvas = document.createElement('canvas')
    canvas.width = outputWidth
    canvas.height = outputHeight
    const context = canvas.getContext('2d')
    if (!context) {
      this.showStatus('无法创建视频海报画布', true)
      return
    }
    context.fillStyle = '#111827'
    context.fillRect(0, 0, outputWidth, outputHeight)
    const layout = calculateVideoFrameLayout(
      source.width,
      source.height,
      outputWidth,
      outputHeight,
      this.node.fit,
    )
    try {
      context.drawImage(
        source.element,
        layout.sourceX,
        layout.sourceY,
        layout.sourceWidth,
        layout.sourceHeight,
        layout.destinationX,
        layout.destinationY,
        layout.destinationWidth,
        layout.destinationHeight,
      )
    } catch {
      this.showStatus('视频海报绘制失败\n请检查素材编码', true)
      return
    }

    const nextKey = `video-poster-${this.nodeId}-${++this.textureRevision}`
    this.scene.textures.addCanvas(nextKey, canvas)
    const previousKey = this.generatedTextureKey
    this.generatedTextureKey = nextKey
    if (!this.imageObject) {
      this.imageObject = this.scene.add.image(0, 0, nextKey).setOrigin(0)
      this.content.addAt(this.imageObject, 0)
    } else {
      this.imageObject.setTexture(nextKey)
    }
    this.imageObject.setDisplaySize(this.width, this.height).setVisible(true)
    this.placeholder.setVisible(false)
    this.label.setVisible(false)
    if (previousKey && this.scene.textures.exists(previousKey)) {
      this.scene.textures.remove(previousKey)
    }
  }

  private showFrame(): void {
    this.renderFrame()
  }

  private failLoad(generation: number, message: string): void {
    if (!this.isCurrentLoad(generation)) return
    this.cancelPendingLoad?.()
    this.cancelPendingLoad = null
    this.showStatus(message, true)
  }

  private showStatus(message: string, error: boolean): void {
    this.imageObject?.setVisible(false)
    this.placeholder
      .setVisible(true)
      .setFillStyle(error ? 0x2b1720 : 0x111827)
      .setStrokeStyle(2, error ? 0xdc2626 : 0x64748b)
    this.label
      .setVisible(true)
      .setColor(error ? '#fecaca' : '#dbeafe')
      .setText(message)
  }

  private isCurrentLoad(generation: number): boolean {
    return !this.disposed && generation === this.loadGeneration
  }

  private clearSource(): void {
    this.loadGeneration += 1
    this.cancelPendingLoad?.()
    this.cancelPendingLoad = null
    this.frameSource = null
    this.imageObject?.setVisible(false)
    const source = this.sourceElement
    this.sourceElement = null
    if (source instanceof HTMLImageElement) {
      source.onload = null
      source.onerror = null
      return
    }
    if (source instanceof HTMLVideoElement) {
      try {
        source.pause()
        source.removeAttribute('src')
        source.load()
      } catch {
        // Releasing a detached video element is best-effort.
      }
    }
  }

  private removeGeneratedTexture(): void {
    if (
      this.generatedTextureKey &&
      this.scene.textures.exists(this.generatedTextureKey)
    ) {
      this.scene.textures.remove(this.generatedTextureKey)
    }
    this.generatedTextureKey = null
  }
}
