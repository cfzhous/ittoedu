import * as Phaser from 'phaser'
import type { ShapeNode } from '../../../shared/projectTypes'
import { renderShapeGraphics } from '../../../shared/phaserShapeRenderer'
import { BaseNodeAdapter } from './NodeAdapter'

export class ShapeNodeAdapter extends BaseNodeAdapter<ShapeNode> {
  private readonly graphics: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, node: ShapeNode) {
    super(scene, node)
    this.graphics = scene.add.graphics()
    this.content.add(this.graphics)
    this.redraw()
  }

  protected redraw(): void {
    if (!this.graphics) return
    renderShapeGraphics(this.graphics, this.node, {
      width: this.width,
      height: this.height,
    })
    this.resizeInteractionTarget()
  }
}

/** @deprecated Kept as an import-compatible alias during the V1→V2 transition. */
export const RectangleNodeAdapter = ShapeNodeAdapter
