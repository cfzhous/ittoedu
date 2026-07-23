import * as Phaser from 'phaser'

export interface PhaserDomComponentMountOptions {
  className?: string
  interactive: boolean
  instanceId: string
  width: number
  height: number
}

export interface PhaserDomComponentMount {
  /** Isolated author-controlled surface passed to Component API 4. */
  readonly root: HTMLElement
  readonly host: HTMLElement
  readonly gameObject: Phaser.GameObjects.DOMElement
  resize(width: number, height: number): void
  setInteractive(interactive: boolean): void
  setSelected(selected: boolean): void
  sync(): void
  destroy(): void
}

function worldAlpha(root: Phaser.GameObjects.Container): number {
  let alpha = root.alpha
  let parent = root.parentContainer
  while (parent) {
    alpha *= parent.alpha
    parent = parent.parentContainer
  }
  return Math.max(0, Math.min(1, alpha))
}

function worldVisible(root: Phaser.GameObjects.Container): boolean {
  if (!root.active || !root.visible) return false
  let parent = root.parentContainer
  while (parent) {
    if (!parent.active || !parent.visible) return false
    parent = parent.parentContainer
  }
  return true
}

function worldDepth(root: Phaser.GameObjects.Container): number {
  let depth = root.depth
  let parent = root.parentContainer
  while (parent) {
    depth += parent.depth
    parent = parent.parentContainer
  }
  return depth
}

/**
 * Hosts a Component API 4 DOM surface in Phaser's dedicated DOM plane while a
 * lightweight Phaser container remains the authoritative authored frame. The
 * proxy keeps the existing editor selection, motion and interaction systems
 * intact without pretending DOM can interleave with individual canvas objects.
 */
export function createPhaserDomComponentMount(
  scene: Phaser.Scene,
  frameRoot: Phaser.GameObjects.Container,
  options: PhaserDomComponentMountOptions,
): PhaserDomComponentMount {
  if (!scene.sys.game.domContainer) {
    throw new Error('组件 DOM 宿主未启用；Phaser 配置必须设置 dom.createContainer')
  }

  const host = document.createElement('div')
  host.className = [
    'lesson-component-mount',
    options.className ?? '',
  ].filter(Boolean).join(' ')
  host.dataset.componentInstanceId = options.instanceId
  host.setAttribute('data-courseware-component-root', '')
  Object.assign(host.style, {
    boxSizing: 'border-box',
    display: 'block',
    overflow: 'visible',
    width: `${options.width}px`,
    height: `${options.height}px`,
    pointerEvents: options.interactive ? 'auto' : 'none',
  })

  const shadow = host.attachShadow({ mode: 'open' })
  const reset = document.createElement('style')
  reset.textContent = `
    :host { display: block; box-sizing: border-box; contain: layout style; }
    *, *::before, *::after { box-sizing: border-box; }
    [data-component-surface] { width: 100%; height: 100%; position: relative; }
  `
  const root = document.createElement('div')
  root.setAttribute('data-component-surface', '')
  shadow.append(reset, root)

  const gameObject = scene.add
    .dom(0, 0, host)
    .setOrigin(0.5)
    .setName(`component-dom:${options.instanceId}`)
  gameObject.pointerEvents = options.interactive ? 'auto' : 'none'

  let destroyed = false
  const sync = (): void => {
    if (destroyed || !gameObject.active) return
    const transform = frameRoot.getWorldTransformMatrix().decomposeMatrix()
    gameObject
      .setPosition(transform.translateX, transform.translateY)
      .setRotation(transform.rotation)
      .setScale(transform.scaleX, transform.scaleY)
      .setAlpha(worldAlpha(frameRoot))
      .setVisible(worldVisible(frameRoot))
      .setDepth(worldDepth(frameRoot))
  }
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync)
  sync()

  return {
    root,
    host,
    gameObject,
    resize(width, height): void {
      host.style.width = `${Math.max(0, width)}px`
      host.style.height = `${Math.max(0, height)}px`
      gameObject.updateSize()
      sync()
    },
    setInteractive(interactive): void {
      host.style.pointerEvents = interactive ? 'auto' : 'none'
      gameObject.pointerEvents = interactive ? 'auto' : 'none'
    },
    setSelected(selected): void {
      host.style.outline = selected ? '2px solid #2563eb' : 'none'
      host.style.outlineOffset = selected ? '2px' : '0'
    },
    sync,
    destroy(): void {
      if (destroyed) return
      destroyed = true
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync)
      if (gameObject.active) gameObject.destroy()
      host.remove()
    },
  }
}
