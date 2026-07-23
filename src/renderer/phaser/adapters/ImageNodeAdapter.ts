import * as Phaser from 'phaser'
import type { ImageNode, RuntimeAssetMap } from '../../../shared/projectTypes'
import { renderImageNodeCanvas } from '../../../shared/imageEffects'
import { BaseNodeAdapter } from './NodeAdapter'

export class ImageNodeAdapter extends BaseNodeAdapter<ImageNode> {
  private readonly placeholder: Phaser.GameObjects.Rectangle
  private readonly label: Phaser.GameObjects.Text
  private imageObject: Phaser.GameObjects.Image | null = null
  private sourceImage: HTMLImageElement | null = null
  private textureRevision = 0
  private generatedTextureKey: string | null = null
  private disposed = false

  constructor(
    scene: Phaser.Scene,
    node: ImageNode,
    assets: RuntimeAssetMap,
  ) {
    super(scene, node)
    this.placeholder = scene.add
      .rectangle(0, 0, node.width, node.height, 0xe7eaf0)
      .setOrigin(0)
      .setStrokeStyle(2, 0x9aa3b2)
    this.label = scene.add
      .text(node.width / 2, node.height / 2, '图片加载中…', {
        color: '#5f6877',
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: '24px',
      })
      .setOrigin(0.5)
    this.content.add([this.placeholder, this.label])
    this.redraw()

    const asset = assets[node.assetId]
    if (asset) {
      this.loadImage(asset.url)
    } else {
      this.label.setText('图片素材缺失')
      this.placeholder.setFillStyle(0xffeeee)
    }
  }

  private loadImage(url: string) {
    const image = new Image()
    image.onload = () => {
      if (this.disposed) return
      const textureKey = `asset-${this.node.assetId}`
      if (!this.scene.textures.exists(textureKey)) {
        this.scene.textures.addImage(textureKey, image)
      }
      this.sourceImage = image
      this.imageObject = this.scene.add.image(0, 0, textureKey).setOrigin(0)
      this.content.addAt(this.imageObject, 0)
      this.placeholder.setVisible(false)
      this.label.setVisible(false)
      this.redraw()
    }
    image.onerror = () => {
      if (this.disposed) return
      this.label.setText('图片加载失败')
      this.placeholder.setFillStyle(0xffeeee)
    }
    image.src = url
  }

  protected redraw(): void {
    this.placeholder?.setSize(this.width, this.height)
    this.label?.setPosition(this.width / 2, this.height / 2)
    if (this.imageObject && this.sourceImage) {
      const canvas = renderImageNodeCanvas(
        this.sourceImage,
        this.sourceImage.naturalWidth,
        this.sourceImage.naturalHeight,
        this.node,
        this.width,
        this.height,
      )
      const nextKey = `image-effect-${this.nodeId}-${++this.textureRevision}`
      this.scene.textures.addCanvas(nextKey, canvas)
      const previousKey = this.generatedTextureKey
      this.generatedTextureKey = nextKey
      this.imageObject.setTexture(nextKey).setDisplaySize(this.width, this.height)
      if (previousKey && this.scene.textures.exists(previousKey)) {
        this.scene.textures.remove(previousKey)
      }
    }
    this.resizeInteractionTarget()
  }

  override destroy(): void {
    this.disposed = true
    if (this.generatedTextureKey && this.scene.textures.exists(this.generatedTextureKey)) {
      this.scene.textures.remove(this.generatedTextureKey)
    }
    super.destroy()
  }
}
