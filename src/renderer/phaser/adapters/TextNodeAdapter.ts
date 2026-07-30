import * as Phaser from 'phaser'
import type { TextNode } from '../../../shared/projectTypes'
import { renderTextNodeCanvas } from '../../../shared/textLayout'
import { BaseNodeAdapter } from './NodeAdapter'

export class TextNodeAdapter extends BaseNodeAdapter<TextNode> {
  private readonly textObject: Phaser.GameObjects.Image
  private textureRevision = 0
  private generatedTextureKey: string | null = null

  constructor(scene: Phaser.Scene, node: TextNode) {
    super(scene, node)
    const initialKey = `text-placeholder-${node.id}`
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    scene.textures.addCanvas(initialKey, canvas)
    this.generatedTextureKey = initialKey
    this.textObject = scene.add.image(0, 0, initialKey).setOrigin(0)
    this.content.add(this.textObject)
    this.redraw()
  }

  protected redraw(): void {
    if (!this.textObject) return
    const topLeft = this.getBounds()
    const rendered = renderTextNodeCanvas(
      { ...this.node, width: this.width, height: this.height },
      this.width,
    )
    this.width = rendered.width
    this.height = rendered.height
    const nextKey = `text-render-${this.nodeId}-${++this.textureRevision}`
    this.scene.textures.addCanvas(nextKey, rendered.canvas)
    const previousKey = this.generatedTextureKey
    this.generatedTextureKey = nextKey
    this.textObject
      .setTexture(nextKey)
      .setDisplaySize(rendered.width, rendered.height)
    if (previousKey && this.scene.textures.exists(previousKey)) {
      this.scene.textures.remove(previousKey)
    }
    this.resizeInteractionTarget()
    this.setPosition(topLeft.x, topLeft.y)
  }

  override setEditMode(enabled: boolean): void {
    this.textObject.setVisible(!enabled)
    this.interactionTarget.setVisible(!enabled)
  }

  previewText(value: string, runs = this.node.runs): void {
    this.node = { ...this.node, text: value, runs }
    this.redraw()
  }

  override destroy(): void {
    if (this.generatedTextureKey && this.scene.textures.exists(this.generatedTextureKey)) {
      this.scene.textures.remove(this.generatedTextureKey)
    }
    super.destroy()
  }
}
