import * as Phaser from 'phaser'
import type { TeacherControllerNode } from '../../../shared/projectTypes'
import {
  createTeacherControllerLayout,
  type TeacherControllerButtonLayout,
} from '../../../shared/teacherControllerLayout'
import { BaseNodeAdapter } from './NodeAdapter'

const FONT_FAMILY = '"Microsoft YaHei", "PingFang SC", sans-serif'

/**
 * Authoring-only rendering for the first-class teacher controller node.
 * It deliberately exposes no button input: the editor canvas selects and
 * transforms the node, while Player owns all delivery-time actions.
 */
export class TeacherControllerNodeAdapter extends BaseNodeAdapter<TeacherControllerNode> {
  private readonly graphics: Phaser.GameObjects.Graphics
  private readonly titleText: Phaser.GameObjects.Text
  private readonly progressText: Phaser.GameObjects.Text
  private readonly collapseZone: Phaser.GameObjects.Zone
  private readonly collapseText: Phaser.GameObjects.Text
  private readonly buttonTexts: Phaser.GameObjects.Text[] = []
  private collapsedPreview: boolean

  constructor(scene: Phaser.Scene, node: TeacherControllerNode) {
    super(scene, node)
    this.collapsedPreview = node.collapsible && node.defaultCollapsed
    this.graphics = scene.add.graphics()
    this.titleText = scene.add.text(0, 0, '', {
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
    })
    this.progressText = scene.add.text(0, 0, '', {
      fontFamily: FONT_FAMILY,
    })
    this.collapseZone = scene.add.zone(0, 0, 1, 1).setOrigin(0.5)
    this.collapseText = scene.add.text(0, 0, '', {
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5)
    this.collapseZone
      .setInteractive({ useHandCursor: true })
      .on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (
        pointer: Phaser.Input.Pointer,
      ) => {
        if (!this.node.collapsible) return
        pointer.event?.stopPropagation?.()
        this.collapsedPreview = !this.collapsedPreview
        this.redraw()
      })
    this.content.add([
      this.graphics,
      this.titleText,
      this.progressText,
      this.collapseZone,
      this.collapseText,
    ])
    this.redraw()
  }

  override update(node: TeacherControllerNode): void {
    if (
      node.defaultCollapsed !== this.node.defaultCollapsed ||
      node.collapsible !== this.node.collapsible
    ) {
      this.collapsedPreview = node.collapsible && node.defaultCollapsed
    }
    super.update(node)
  }

  protected redraw(): void {
    if (!this.graphics || !this.titleText || !this.progressText) return
    const layout = createTeacherControllerLayout(
      this.node,
      this.width,
      this.height,
    )
    const { palette } = layout

    this.graphics.clear()
    if (!this.collapsedPreview) {
      this.graphics.fillStyle(palette.background, palette.backgroundAlpha)
      this.graphics.fillRoundedRect(
        0,
        0,
        layout.width,
        layout.height,
        layout.cornerRadius,
      )
      this.graphics.lineStyle(1.5, palette.accent, 0.72)
      this.graphics.strokeRoundedRect(
        0.75,
        0.75,
        Math.max(1, layout.width - 1.5),
        Math.max(1, layout.height - 1.5),
        Math.max(0, layout.cornerRadius - 0.75),
      )
      this.graphics.fillStyle(palette.accent, 0.92)
      this.graphics.fillRoundedRect(
        layout.padding,
        layout.padding,
        3,
        Math.max(4, layout.height - layout.padding * 2),
        1.5,
      )

      for (const button of layout.buttons) this.drawButton(button, layout)
    }

    if (layout.collapse) {
      const collapse = layout.collapse
      this.graphics.fillStyle(palette.background, Math.max(0.88, palette.backgroundAlpha))
      this.graphics.fillRoundedRect(
        collapse.x,
        collapse.y,
        collapse.width,
        collapse.height,
        Math.min(collapse.width, collapse.height) / 2,
      )
      this.graphics.lineStyle(1.5, palette.accent, 0.82)
      this.graphics.strokeRoundedRect(
        collapse.x + 0.75,
        collapse.y + 0.75,
        Math.max(1, collapse.width - 1.5),
        Math.max(1, collapse.height - 1.5),
        Math.max(0, Math.min(collapse.width, collapse.height) / 2 - 0.75),
      )
      this.collapseZone
        .setPosition(
          collapse.x + collapse.width / 2,
          collapse.y + collapse.height / 2,
        )
        .setSize(collapse.width, collapse.height)
        .setVisible(true)
      if (this.collapseZone.input) {
        this.collapseZone.input.enabled = true
        const hitArea = this.collapseZone.input.hitArea
        if (hitArea instanceof Phaser.Geom.Rectangle) {
          hitArea.setSize(collapse.width, collapse.height)
        }
      }
      this.collapseText
        .setText(this.collapsedPreview ? '展' : '收')
        .setColor(palette.textCss)
        .setFontSize(Math.max(9, Math.min(13, collapse.height * 0.4)))
        .setPosition(
          collapse.x + collapse.width / 2,
          collapse.y + collapse.height / 2,
        )
        .setVisible(true)
    } else {
      this.collapsedPreview = false
      this.collapseZone.setVisible(false)
      if (this.collapseZone.input) this.collapseZone.input.enabled = false
      this.collapseText.setVisible(false)
    }

    this.titleText
      .setVisible(!this.collapsedPreview)
      .setText(this.node.title)
      .setColor(palette.textCss)
      .setFontSize(layout.titleFontSize)
      .setPosition(layout.title.x + 12, layout.title.y + layout.title.height / 2)
      .setOrigin(0, 0.5)
      .setWordWrapWidth(Math.max(8, layout.title.width - 12), false)

    if (layout.progress && !this.collapsedPreview) {
      this.progressText
        .setVisible(true)
        .setText('场景 1 / N · 当前状态')
        .setColor(palette.accentCss)
        .setAlpha(0.84)
        .setFontSize(layout.progressFontSize)
        .setPosition(
          layout.progress.x + 12,
          layout.progress.y + layout.progress.height / 2,
        )
        .setOrigin(0, 0.5)
        .setWordWrapWidth(Math.max(8, layout.progress.width - 12), false)
    } else {
      this.progressText.setVisible(false)
    }

    this.syncButtonLabels(layout.buttons, layout.buttonFontSize, palette.textCss)
    this.resizeInteractionTarget()
  }

  private drawButton(
    button: TeacherControllerButtonLayout,
    layout: ReturnType<typeof createTeacherControllerLayout>,
  ): void {
    const radius = Math.min(10, button.height / 3, button.width / 3)
    this.graphics.fillStyle(layout.palette.button, 0.94)
    this.graphics.fillRoundedRect(
      button.x,
      button.y,
      button.width,
      button.height,
      radius,
    )
    this.graphics.lineStyle(1, layout.palette.accent, 0.38)
    this.graphics.strokeRoundedRect(
      button.x + 0.5,
      button.y + 0.5,
      Math.max(1, button.width - 1),
      Math.max(1, button.height - 1),
      Math.max(0, radius - 0.5),
    )
  }

  private syncButtonLabels(
    buttons: TeacherControllerButtonLayout[],
    fontSize: number,
    color: string,
  ): void {
    while (this.buttonTexts.length < buttons.length) {
      const text = this.scene.add.text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        align: 'center',
      })
      this.buttonTexts.push(text)
      this.content.add(text)
    }
    while (this.buttonTexts.length > buttons.length) {
      this.buttonTexts.pop()?.destroy()
    }

    buttons.forEach((button, index) => {
      this.buttonTexts[index]!
        .setText(button.label)
        .setColor(color)
        .setFontSize(fontSize)
        .setPosition(
          button.x + button.width / 2,
          button.y + button.height / 2,
        )
        .setOrigin(0.5)
        .setWordWrapWidth(Math.max(8, button.width - 8), false)
        .setVisible(!this.collapsedPreview)
    })
  }
}
