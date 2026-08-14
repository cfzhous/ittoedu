import * as Phaser from 'phaser'
import type { RuntimeNodeHandle } from '../../shared/runtimeTypes'

export interface LegacyMiniPhaserSceneRoots {
  scene: Phaser.Scene
  /** Component content is attached here. */
  content: Phaser.GameObjects.Container
  /** Runtime API 2 preserves its two Phaser roots inside the item canvas. */
  underlay: Phaser.GameObjects.Container
  overlay: Phaser.GameObjects.Container
  /** Runtime API 2 DOM roots remain children of the compositor-owned item. */
  dom: {
    underlay: HTMLDivElement
    overlay: HTMLDivElement
  }
}

let nextSceneId = 1

function isHeadlessTestDocument(document: Document): boolean {
  return /jsdom/i.test(document.defaultView?.navigator.userAgent ?? '')
}

function plane(document: Document, className: string, zIndex: number): HTMLDivElement {
  const element = document.createElement('div')
  element.className = className
  Object.assign(element.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    zIndex: String(zIndex),
  })
  return element
}

function canvasDataUrl(canvas: HTMLCanvasElement): string | null {
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/**
 * A real Phaser scene scoped to exactly one V9 layer item. It intentionally has
 * no portal to document.body or the surface root: Canvas, Phaser's DOM plane,
 * and Runtime API 2 DOM roots are all descendants of the compositor container.
 */
export class LegacyMiniPhaserStage {
  readonly ready: Promise<LegacyMiniPhaserSceneRoots>

  readonly #container: HTMLElement
  readonly #canvasPlane: HTMLDivElement
  readonly #underlayDom: HTMLDivElement
  readonly #overlayDom: HTMLDivElement
  readonly #game: Phaser.Game
  #roots: LegacyMiniPhaserSceneRoots | null = null
  readonly #nodeProxies = new Map<string, {
    handle: RuntimeNodeHandle
    sync: () => void
    restore: () => void
  }>()
  #rejectReady: ((cause: unknown) => void) | null = null
  #readySettled = false
  #destroyed = false

  constructor(container: HTMLElement, width: number, height: number, signal?: AbortSignal) {
    this.#container = container
    const document = container.ownerDocument
    container.style.position ||= 'relative'
    container.style.overflow = 'hidden'

    this.#underlayDom = plane(document, 'course-legacy-runtime-dom-underlay', 0)
    this.#canvasPlane = plane(document, 'course-legacy-phaser-canvas', 1)
    this.#overlayDom = plane(document, 'course-legacy-runtime-dom-overlay', 2)
    this.#underlayDom.style.pointerEvents = 'none'
    this.#overlayDom.style.pointerEvents = 'none'
    container.append(this.#underlayDom, this.#canvasPlane, this.#overlayDom)

    let resolveReady!: (roots: LegacyMiniPhaserSceneRoots) => void
    let rejectReady!: (cause: unknown) => void
    this.ready = new Promise((resolve, reject) => {
      resolveReady = (roots) => {
        this.#readySettled = true
        this.#rejectReady = null
        resolve(roots)
      }
      rejectReady = (cause) => {
        this.#readySettled = true
        this.#rejectReady = null
        reject(cause)
      }
      this.#rejectReady = rejectReady
    })

    const stage = this
    class ItemScene extends Phaser.Scene {
      constructor() {
        super({ key: `course-legacy-item-${nextSceneId++}` })
      }

      create(): void {
        if (stage.#destroyed) return
        const underlay = this.add.container(0, 0).setName('legacy-item-underlay').setDepth(-100)
        const content = this.add.container(0, 0).setName('legacy-item-content').setDepth(0)
        const overlay = this.add.container(0, 0).setName('legacy-item-overlay').setDepth(100)
        const roots: LegacyMiniPhaserSceneRoots = {
          scene: this,
          content,
          underlay,
          overlay,
          dom: { underlay: stage.#underlayDom, overlay: stage.#overlayDom },
        }
        stage.#roots = roots
        resolveReady(roots)
      }
    }

    try {
      this.#game = new Phaser.Game({
        type: isHeadlessTestDocument(document) ? Phaser.HEADLESS : Phaser.AUTO,
        parent: this.#canvasPlane,
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
        transparent: true,
        backgroundColor: 'rgba(0,0,0,0)',
        scene: new ItemScene(),
        banner: false,
        audio: { noAudio: true },
        dom: { createContainer: true, pointerEvents: 'none' },
        render: { antialias: true, transparent: true },
        scale: {
          mode: Phaser.Scale.NONE,
          autoCenter: Phaser.Scale.NO_CENTER,
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
        },
      })
    } catch (cause) {
      rejectReady(cause)
      this.#underlayDom.remove()
      this.#canvasPlane.remove()
      this.#overlayDom.remove()
      throw cause
    }

    if (signal) {
      if (signal.aborted) this.destroy()
      else signal.addEventListener('abort', () => this.destroy(), { once: true })
    }
  }

  resize(width: number, height: number): void {
    if (this.#destroyed) return
    this.#game.scale.resize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)))
  }

  setInteractive(interactive: boolean): void {
    if (this.#destroyed) return
    this.#canvasPlane.style.pointerEvents = interactive ? 'auto' : 'none'
  }

  setVisible(visible: boolean): void {
    if (this.#destroyed) return
    for (const root of [this.#underlayDom, this.#canvasPlane, this.#overlayDom]) {
      root.style.visibility = visible ? '' : 'hidden'
    }
  }

  setPaused(paused: boolean): void {
    if (this.#destroyed || !this.#roots) return
    if (paused && !this.#roots.scene.scene.isPaused()) this.#roots.scene.scene.pause()
    else if (!paused && this.#roots.scene.scene.isPaused()) this.#roots.scene.scene.resume()
  }

  /**
   * Bridges a migrated Runtime API 2 node binding to the real V9 sibling
   * wrapper. The Phaser object is intentionally only a transform proxy: it
   * never duplicates the sibling's visual content into this item's canvas.
   */
  resolveSiblingNode(nodeId: string): RuntimeNodeHandle | null {
    const existing = this.#nodeProxies.get(nodeId)
    if (existing) return existing.handle
    const roots = this.#roots
    const surface = this.#container.closest<HTMLElement>('.slide-surface')
    if (!roots || !surface) return null
    const wrapper = [...surface.querySelectorAll<HTMLElement>('[data-layer-item-id]')]
      .find((candidate) => candidate.dataset.layerItemId === nodeId)
    if (!wrapper) return null

    const width = finiteCssNumber(wrapper.style.width, wrapper.getBoundingClientRect().width)
    const height = finiteCssNumber(wrapper.style.height, wrapper.getBoundingClientRect().height)
    const left = finiteCssNumber(wrapper.style.left, wrapper.offsetLeft)
    const top = finiteCssNumber(wrapper.style.top, wrapper.offsetTop)
    const angle = rotationDegrees(wrapper.style.transform)
    const alpha = finiteCssNumber(wrapper.style.opacity, 1)
    const originalStyle = {
      left: wrapper.style.left,
      top: wrapper.style.top,
      transform: wrapper.style.transform,
      opacity: wrapper.style.opacity,
      visibility: wrapper.style.visibility,
    }
    const root = roots.scene.add
      .container(left + width / 2, top + height / 2)
      .setName(`legacy-node-proxy:${nodeId}`)
      .setAngle(angle)
      .setAlpha(Math.max(0, Math.min(1, alpha)))
      .setVisible(wrapper.style.visibility !== 'hidden')
    root.setSize(width, height)

    const sync = (): void => {
      if (!root.active) return
      wrapper.style.left = `${root.x - width / 2}px`
      wrapper.style.top = `${root.y - height / 2}px`
      wrapper.style.transform = root.angle === 0 ? '' : `rotate(${root.angle}deg)`
      wrapper.style.opacity = String(Math.max(0, Math.min(1, root.alpha)))
      wrapper.style.visibility = root.visible ? '' : 'hidden'
    }
    roots.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, sync)
    const handle: RuntimeNodeHandle = {
      id: nodeId,
      type: wrapper.dataset.layerKind ?? 'v9-layer',
      root,
    }
    const restore = (): void => {
      Object.assign(wrapper.style, originalStyle)
    }
    this.#nodeProxies.set(nodeId, { handle, sync, restore })
    return handle
  }

  /** Flushes setters made synchronously inside Runtime create(). */
  syncSiblingNodes(): void {
    this.#nodeProxies.forEach(({ sync }) => sync())
  }

  /** Clone the live item and replace the non-clonable Canvas bitmap with PNG. */
  captureHtml(): string {
    const clone = this.#container.cloneNode(true) as HTMLElement
    const liveCanvases = [...this.#container.querySelectorAll('canvas')]
    const clonedCanvases = [...clone.querySelectorAll('canvas')]
    liveCanvases.forEach((canvas, index) => {
      const cloned = clonedCanvases[index]
      const url = canvasDataUrl(canvas)
      if (!cloned || !url) return
      const image = clone.ownerDocument.createElement('img')
      image.src = url
      image.alt = ''
      image.style.width = '100%'
      image.style.height = '100%'
      image.style.display = 'block'
      cloned.replaceWith(image)
    })
    return clone.innerHTML
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    if (!this.#readySettled) {
      this.#rejectReady?.(new DOMException('Legacy Phaser item mount was aborted', 'AbortError'))
    }
    if (this.#roots) {
      for (const { handle, sync, restore } of this.#nodeProxies.values()) {
        this.#roots.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, sync)
        const root = handle.root as Phaser.GameObjects.GameObject
        if (root.active) root.destroy()
        restore()
      }
    }
    this.#nodeProxies.clear()
    this.#roots = null
    this.#game.destroy(true)
    this.#underlayDom.remove()
    this.#canvasPlane.remove()
    this.#overlayDom.remove()
  }
}

function finiteCssNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function rotationDegrees(transform: string): number {
  const match = /^rotate\((-?(?:\d+\.?\d*|\.\d+))deg\)$/.exec(transform.trim())
  return match ? Number(match[1]) : 0
}
