import * as Phaser from 'phaser'
import { componentRenderMode } from '../../../shared/componentCapabilities'
import type {
  ComponentEditableTextBounds,
  ComponentEditableTextRegion,
  ComponentPackageData,
  ComponentTextProperty,
} from '../../../shared/componentTypes'
import type {
  ComponentLifecycleFailure,
  GuardedComponentInstanceLifecycle,
} from '../../../shared/componentLifecycleGuard'
import {
  getComponentPropValue,
  mergeComponentProps,
  resolveComponentEditorProperties,
  resolveComponentEditorState,
} from '../../../shared/componentProps'
import type {
  ExternalComponentNode,
  RuntimeAssetMap,
} from '../../../shared/projectTypes'
import {
  createPhaserDomComponentMount,
} from '../../../shared/phaserDomComponentHost'
import type {
  PhaserDomComponentMount,
} from '../../../shared/phaserDomComponentHost'
import type { ComponentRegistry } from '../ComponentRegistry'
import { BaseNodeAdapter } from './NodeAdapter'

export interface ComponentCanvasTextTarget {
  nodeId: string
  key: string
  label?: string
  multiline?: boolean
  maxLength?: number
  bounds: ComponentEditableTextBounds
}

function pointInside(
  x: number,
  y: number,
  bounds: ComponentEditableTextBounds,
): boolean {
  return (
    x >= bounds.x &&
    y >= bounds.y &&
    x <= bounds.x + bounds.width &&
    y <= bounds.y + bounds.height
  )
}

export class ExternalComponentNodeAdapter extends BaseNodeAdapter<ExternalComponentNode> {
  private readonly contentRoot: Phaser.GameObjects.Container
  private lifecycle: GuardedComponentInstanceLifecycle | null = null
  private readonly errorGraphics: Phaser.GameObjects.Graphics
  private readonly errorText: Phaser.GameObjects.Text
  private readonly component: ComponentPackageData | undefined
  private domMount: PhaserDomComponentMount | null = null
  private readonly textRegions = new Set<ComponentEditableTextRegion>()

  constructor(
    scene: Phaser.Scene,
    node: ExternalComponentNode,
    component: ComponentPackageData | undefined,
    registry: ComponentRegistry,
    projectAssets: RuntimeAssetMap,
    scope: 'scene' | 'global' = 'scene',
  ) {
    super(scene, node)
    this.component = component
    this.contentRoot = scene.add.container(0, 0)
    this.errorGraphics = scene.add.graphics().setVisible(false)
    this.errorText = scene.add
      .text(16, 16, '', {
        color: '#991b1b',
        fontFamily: '"Microsoft YaHei", sans-serif',
        fontSize: '18px',
        wordWrap: { width: Math.max(32, node.width - 32) },
      })
      .setVisible(false)
    this.content.add([this.contentRoot, this.errorGraphics, this.errorText])

    if (!component) {
      this.showError('组件包不在工程中')
      return
    }

    try {
      if (componentRenderMode(component.manifest) !== 'phaser') {
        this.domMount = createPhaserDomComponentMount(scene, this.root, {
          className: 'lesson-component-mount--editor',
          interactive: false,
          instanceId: node.id,
          width: node.width,
          height: node.height,
        })
      }
      this.lifecycle = registry.createInstance(
        component,
        node,
        scene,
        this.contentRoot,
        'edit',
        projectAssets,
        scope,
        (failure) => this.handleLifecycleFailure(failure),
        this.domMount?.root,
        (region) => {
          this.textRegions.add(region)
          return () => this.textRegions.delete(region)
        },
      )
      this.lifecycle.setVisible?.(node.visible)
      this.redraw()
    } catch (error) {
      console.error('组件创建失败', error)
      this.showError(error instanceof Error ? error.message : '未知错误')
    }
  }

  private handleLifecycleFailure(failure: ComponentLifecycleFailure): void {
    console.error(`组件${failure.phase}失败`, failure.error)
    if (failure.phase !== 'destroy') {
      this.showError(`${failure.phase}: ${failure.message}`)
    }
  }

  private showError(message: string) {
    this.contentRoot.setVisible(false)
    // DOMElement visibility is synchronized from the Phaser proxy every
    // frame. Destroy the failed surface instead of setting a style that the
    // bridge could overwrite on its next POST_UPDATE pass.
    this.domMount?.destroy()
    this.domMount = null
    this.errorGraphics.setVisible(true)
    this.errorText
      .setVisible(true)
      .setText(`组件加载失败\n${this.node.name}\n${message}`)
    this.redrawError()
  }

  private redrawError() {
    this.errorGraphics.clear()
    this.errorGraphics.fillStyle(0xffeeee, 1)
    this.errorGraphics.fillRoundedRect(0, 0, this.width, this.height, 8)
    this.errorGraphics.lineStyle(3, 0xdc2626, 1)
    this.errorGraphics.strokeRoundedRect(1.5, 1.5, this.width - 3, this.height - 3, 8)
    this.errorText.setWordWrapWidth(Math.max(32, this.width - 32))
  }

  protected redraw(): void {
    this.domMount?.resize(this.width, this.height)
    this.lifecycle?.resize?.(this.width, this.height)
    if (this.errorGraphics?.visible) this.redrawError()
    this.resizeInteractionTarget()
    this.domMount?.sync()
  }

  override update(node: ExternalComponentNode): void {
    super.update(node)
    if (!this.component) return
    const props = mergeComponentProps(this.component.manifest, node.props)
    this.lifecycle?.updateProps?.(props)
    this.lifecycle?.setEditorState?.(
      resolveComponentEditorState(this.component.manifest, props),
    )
    this.lifecycle?.setVisible?.(node.visible)
    this.domMount?.sync()
  }

  override setPosition(x: number, y: number): void {
    super.setPosition(x, y)
    this.domMount?.sync()
  }

  override setDepth(depth: number): void {
    super.setDepth(depth)
    this.domMount?.sync()
  }

  override setSelected(selected: boolean): void {
    this.domMount?.setSelected(selected)
  }

  /**
   * Finds only text fields explicitly exposed by the component schema. DOM
   * components opt in with data-courseware-edit-key; Phaser components use
   * ctx.editor.registerTextRegion(). Nothing is inferred from visible text.
   */
  findEditableTextAt(
    worldX: number,
    worldY: number,
  ): ComponentCanvasTextTarget | null {
    if (!this.component || this.component.manifest.schemaVersion === 1) return null

    const angle = -Phaser.Math.DegToRad(this.node.rotation)
    const dx = worldX - (this.node.x + this.width / 2)
    const dy = worldY - (this.node.y + this.height / 2)
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle) + this.width / 2
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + this.height / 2
    const fields = new Map<string, ComponentTextProperty>(
      resolveComponentEditorProperties(
        this.component.manifest,
        this.node.props,
      )
        .filter((field): field is ComponentTextProperty => (
          field.type === 'text' || field.type === 'textarea'
        ))
        .map((field) => [field.key, field]),
    )
    const effectiveProps = mergeComponentProps(
      this.component.manifest,
      this.node.props,
    )
    const allowed = (key: string): boolean => (
      fields.has(key) &&
      typeof getComponentPropValue(effectiveProps, key) === 'string'
    )

    const domRoot = this.domMount?.root
    if (domRoot) {
      const rootRect = domRoot.getBoundingClientRect()
      if (rootRect.width > 0 && rootRect.height > 0) {
        const candidates = [
          ...domRoot.querySelectorAll<HTMLElement>('[data-courseware-edit-key]'),
        ]
        for (let index = candidates.length - 1; index >= 0; index -= 1) {
          const element = candidates[index]!
          const key = element.dataset.coursewareEditKey?.trim()
          if (!key || !allowed(key)) continue
          const rect = element.getBoundingClientRect()
          const bounds = {
            x: ((rect.left - rootRect.left) / rootRect.width) * this.width,
            y: ((rect.top - rootRect.top) / rootRect.height) * this.height,
            width: (rect.width / rootRect.width) * this.width,
            height: (rect.height / rootRect.height) * this.height,
          }
          if (!pointInside(localX, localY, bounds)) continue
          const field = fields.get(key)!
          return {
            nodeId: this.node.id,
            key,
            label: element.dataset.coursewareEditLabel || field.label,
            multiline: element.dataset.coursewareEditMultiline === 'true' ||
              field.type === 'textarea',
            maxLength: field.maxLength,
            bounds,
          }
        }
      }
    }

    for (const region of [...this.textRegions].reverse()) {
      if (!allowed(region.key)) continue
      let bounds: ComponentEditableTextBounds
      try {
        bounds = region.getBounds()
      } catch (error) {
        console.warn('组件可编辑文字区域读取失败', error)
        continue
      }
      if (
        !Number.isFinite(bounds.x) ||
        !Number.isFinite(bounds.y) ||
        !Number.isFinite(bounds.width) ||
        !Number.isFinite(bounds.height) ||
        bounds.width <= 0 ||
        bounds.height <= 0 ||
        !pointInside(localX, localY, bounds)
      ) {
        continue
      }
      const field = fields.get(region.key)!
      return {
        nodeId: this.node.id,
        key: region.key,
        label: region.label || field.label,
        multiline: region.multiline ?? field.type === 'textarea',
        maxLength: region.maxLength ?? field.maxLength,
        bounds,
      }
    }
    return null
  }

  override destroy(): void {
    this.lifecycle?.destroy()
    this.lifecycle = null
    this.domMount?.destroy()
    this.domMount = null
    super.destroy()
  }
}
