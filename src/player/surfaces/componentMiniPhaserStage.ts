import * as Phaser from 'phaser'

export interface ComponentMiniPhaserSceneRoots {
  scene: Phaser.Scene
  content: Phaser.GameObjects.Container
}

let nextSceneId = 1

function isHeadlessTestDocument(document: Document): boolean {
  return /jsdom/i.test(document.defaultView?.navigator.userAgent ?? '')
}

function canvasDataUrl(canvas: HTMLCanvasElement): string | null {
  try {
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

/** A compositor-owned Phaser scene for one Component API 4 layer item. */
export class ComponentMiniPhaserStage {
  readonly ready: Promise<ComponentMiniPhaserSceneRoots>

  readonly #canvasPlane: HTMLDivElement
  readonly #game: Phaser.Game
  #roots: ComponentMiniPhaserSceneRoots | null = null
  #rejectReady: ((cause: unknown) => void) | null = null
  #readySettled = false
  #destroyed = false

  constructor(container: HTMLElement, width: number, height: number, signal?: AbortSignal) {
    const document = container.ownerDocument
    container.style.position ||= 'relative'
    container.style.overflow = 'hidden'

    this.#canvasPlane = document.createElement('div')
    this.#canvasPlane.className = 'course-component-phaser-canvas'
    Object.assign(this.#canvasPlane.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
    })
    container.appendChild(this.#canvasPlane)

    let resolveReady!: (roots: ComponentMiniPhaserSceneRoots) => void
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
    class ComponentScene extends Phaser.Scene {
      constructor() {
        super({ key: `course-component-item-${nextSceneId++}` })
      }

      create(): void {
        if (stage.#destroyed) return
        const roots: ComponentMiniPhaserSceneRoots = {
          scene: this,
          content: this.add.container(0, 0).setName('component-item-content'),
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
        scene: new ComponentScene(),
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
      this.#canvasPlane.remove()
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
    this.#canvasPlane.style.visibility = visible ? '' : 'hidden'
  }

  setPaused(paused: boolean): void {
    if (this.#destroyed || !this.#roots) return
    if (paused && !this.#roots.scene.scene.isPaused()) this.#roots.scene.scene.pause()
    else if (!paused && this.#roots.scene.scene.isPaused()) this.#roots.scene.scene.resume()
  }

  /** Clone the live item and replace non-clonable Canvas bitmaps with PNG. */
  captureHtml(): string {
    const container = this.#canvasPlane.parentElement
    if (!container) return ''
    const clone = container.cloneNode(true) as HTMLElement
    const liveCanvases = [...container.querySelectorAll('canvas')]
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
      this.#rejectReady?.(new DOMException('Component Phaser mount was aborted', 'AbortError'))
    }
    this.#roots = null
    this.#game.destroy(true)
    this.#canvasPlane.remove()
  }
}
