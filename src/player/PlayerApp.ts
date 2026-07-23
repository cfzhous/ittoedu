import * as Phaser from 'phaser'
import type { ExportPayload } from '../shared/componentTypes'
import { ComponentRegistry } from './ComponentRegistry'
import { createPlayerComponentHostActions } from './componentHostActions'
import { CourseRuntimeKernel } from './CourseRuntimeKernel'
import { PreparedCanvasSnapshots } from './PreparedCanvasSnapshots'
import { PlayerControls } from './PlayerControls'
import { PlayerKeyboardNavigation } from './PlayerKeyboardNavigation'
import { AudioManager } from './AudioManager'
import {
  SCENE_PICKER_OPEN_EVENT,
  ScenePickerOverlay,
  TEACHER_CONTROLLER_COLLAPSE_EVENT,
  type TeacherControllerCollapseEvent,
} from './ScenePickerOverlay'
import {
  PlayerScene,
  type PlayerRuntimeDomLayers,
} from './PlayerScene'
import type { RuntimeExecutionMode } from '../shared/runtimeTypes'
import type { RuntimePresentationTransition } from '../shared/runtimeTypes'

export interface PlayerAppOptions {
  transparent?: boolean
  renderWidth?: number
  renderHeight?: number
  controls?: boolean
  mode?: RuntimeExecutionMode
  /** Start directly at this authored scene instead of briefly rendering page 1. */
  initialSceneId?: string
  /** Optional named presentation state within `initialSceneId`. */
  initialStateId?: string
}

function createRuntimeDomLayer(
  className: string,
  logicalWidth: number,
  logicalHeight: number,
  zIndex: number,
): HTMLDivElement {
  const layer = document.createElement('div')
  layer.className = `lesson-runtime-layer ${className}`
  Object.assign(layer.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${logicalWidth}px`,
    height: `${logicalHeight}px`,
    overflow: 'visible',
    pointerEvents: 'none',
    transformOrigin: '0 0',
    zIndex: String(zIndex),
  })
  return layer
}

export class PlayerApp {
  readonly game: Phaser.Game

  private readonly controls: PlayerControls | null
  private readonly keyboardNavigation: PlayerKeyboardNavigation | null
  readonly audio: AudioManager
  private readonly disposeAudioToggle: () => void
  private readonly componentRegistry = new ComponentRegistry()
  private readonly preparedCanvasSnapshots = new PreparedCanvasSnapshots()
  private readonly playerScene: PlayerScene
  private readonly runtimeKernel: CourseRuntimeKernel
  private readonly stage: HTMLElement
  private readonly runtimeDomLayers: PlayerRuntimeDomLayers
  private readonly scenePicker: ScenePickerOverlay | null
  private readonly scenePickerEventDisposers: Array<() => void> = []
  private readonly captureMode: boolean
  private readonly resizeObserver: ResizeObserver | null
  private alignmentFrame: number | null = null
  private capturePreparation: Promise<void> | null = null
  private destroyed = false

  constructor(
    private readonly payload: ExportPayload,
    private readonly root: HTMLElement,
    options: PlayerAppOptions = {},
  ) {
    if (payload.project.scenes.length === 0) {
      throw new Error('课件至少需要一个场景')
    }
    this.captureMode = options.mode === 'capture'
    const requestedInitialSceneIndex = options.initialSceneId
      ? payload.project.scenes.findIndex((scene) => scene.id === options.initialSceneId)
      : 0
    const initialSceneIndex = requestedInitialSceneIndex >= 0
      ? requestedInitialSceneIndex
      : 0
    const initialStateId = !options.initialSceneId || requestedInitialSceneIndex >= 0
      ? options.initialStateId
      : undefined
    const initialScene = payload.project.scenes[initialSceneIndex]!

    this.registerComponentRuntimes()

    const shell = document.createElement('main')
    shell.className = 'lesson-shell'

    const stage = document.createElement('section')
    stage.className = 'lesson-stage'
    stage.setAttribute('aria-label', '课件画布')
    this.stage = stage

    const canvasHost = document.createElement('div')
    canvasHost.className = 'lesson-canvas-host'
    Object.assign(canvasHost.style, {
      position: 'absolute',
      inset: '0',
      zIndex: '2',
    })
    const logicalWidth = payload.project.canvas.width
    const logicalHeight = payload.project.canvas.height
    this.runtimeDomLayers = {
      global: {
        underlay: createRuntimeDomLayer(
          'lesson-runtime-layer--global-underlay',
          logicalWidth,
          logicalHeight,
          0,
        ),
        overlay: createRuntimeDomLayer(
          'lesson-runtime-layer--global-overlay',
          logicalWidth,
          logicalHeight,
          4,
        ),
      },
      scene: {
        underlay: createRuntimeDomLayer(
          'lesson-runtime-layer--scene-underlay',
          logicalWidth,
          logicalHeight,
          1,
        ),
        overlay: createRuntimeDomLayer(
          'lesson-runtime-layer--scene-overlay',
          logicalWidth,
          logicalHeight,
          3,
        ),
      },
    }
    stage.append(
      canvasHost,
      this.runtimeDomLayers.global.underlay,
      this.runtimeDomLayers.scene.underlay,
      this.runtimeDomLayers.scene.overlay,
      this.runtimeDomLayers.global.overlay,
    )
    if (!options.transparent) {
      stage.style.backgroundColor = initialScene.backgroundColor
    }

    const controlsMode = options.controls === false
      ? 'none'
      : (payload.project.playback?.controls ?? 'footer')
    const footer = controlsMode === 'footer'
      ? document.createElement('footer')
      : null
    if (footer) footer.className = 'lesson-footer'

    shell.append(stage)
    if (footer) shell.append(footer)
    root.replaceChildren(shell)

    this.controls = footer
      ? new PlayerControls(
        footer,
        payload.project.scenes.length,
        (targetIndex) => this.goToScene(targetIndex),
        () => { this.replayScene() },
      )
      : null
    const hostActions = createPlayerComponentHostActions(this)
    this.runtimeKernel = new CourseRuntimeKernel(payload, hostActions, {
      mode: options.mode,
    })
    this.audio = new AudioManager(
      payload.project,
      (assetId) => {
        const asset = payload.assets[assetId]
        if (!asset) throw new Error(`工程声音素材“${assetId}”不存在`)
        return asset.dataUrl
      },
      this.runtimeKernel.events,
      {
        mode: options.mode,
        unlockTarget: typeof window === 'undefined' ? undefined : window,
      },
    )
    this.disposeAudioToggle = this.runtimeKernel.events.on('audio:toggle-mute', () => {
      this.audio.toggleMuted()
    })
    this.keyboardNavigation = !this.captureMode && options.controls !== false &&
      (payload.project.playback?.keyboardNavigation ?? true)
      ? new PlayerKeyboardNavigation(
          payload.project.scenes.length,
          (targetIndex) => this.goToScene(targetIndex),
        )
      : null
    this.playerScene = new PlayerScene(
      payload,
      this.componentRegistry,
      (index) => {
        this.scenePicker?.close()
        this.controls?.setIndex(index)
        this.keyboardNavigation?.setIndex(index)
        window.dispatchEvent(new CustomEvent('courseware-scene-change', {
          detail: {
            sceneId: this.payload.project.scenes[index]?.id,
            sceneIndex: index,
            presentationStateId: this.playerScene.getCurrentPresentationStateId(),
          },
        }))
      },
      options.transparent ?? false,
      hostActions,
      this.runtimeKernel,
      this.audio,
      !this.captureMode,
      this.captureMode || controlsMode === 'canvas',
      this.runtimeDomLayers,
      (color) => {
        if (!options.transparent) this.stage.style.backgroundColor = color
      },
      {
        sceneIndex: initialSceneIndex,
        ...(initialStateId ? { stateId: initialStateId } : {}),
      },
    )

    this.scenePicker = this.captureMode
      ? null
      : new ScenePickerOverlay({
          stage,
          scenes: payload.project.scenes,
          onSelect: (sceneId) => {
            this.goToSceneById(sceneId)
          },
        })
    if (this.scenePicker) {
      this.scenePickerEventDisposers.push(
        this.runtimeKernel.events.on(SCENE_PICKER_OPEN_EVENT, () => {
          this.scenePicker?.open(this.getCurrentSceneId())
        }),
        this.runtimeKernel.events.on<TeacherControllerCollapseEvent>(
          TEACHER_CONTROLLER_COLLAPSE_EVENT,
          (event) => {
            if (event?.collapsed) this.scenePicker?.close()
          },
        ),
      )
    }

    const renderWidth = Math.max(
      1,
      Math.ceil(options.renderWidth ?? payload.project.canvas.width),
    )
    const renderHeight = Math.max(
      1,
      Math.ceil(options.renderHeight ?? payload.project.canvas.height),
    )

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: canvasHost,
      width: renderWidth,
      height: renderHeight,
      backgroundColor: 'rgba(0,0,0,0)',
      scene: this.playerScene,
      banner: false,
      dom: {
        createContainer: true,
        // The container itself passes through input. API 4 component hosts can
        // opt individual descendants back into pointer interaction.
        pointerEvents: 'none',
      },
      audio: {
        noAudio: true,
      },
      render: {
        antialias: true,
        // Scene color lives on the stage so a declared DOM underlay is really
        // behind the Canvas instead of being covered by an opaque clear pass.
        transparent: true,
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: renderWidth,
        height: renderHeight,
        expandParent: true,
      },
    })

    this.resizeObserver = this.captureMode || typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => this.scheduleRuntimeLayerAlignment())
    this.resizeObserver?.observe(stage)
    this.resizeObserver?.observe(this.game.canvas)
    if (this.captureMode) {
      this.alignRuntimeDomLayers()
    } else {
      window.addEventListener('resize', this.scheduleRuntimeLayerAlignment)
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
      // visibilitychange is not replayed for a document that was already
      // hidden before PlayerApp construction. PlayerScene caches this state
      // until Phaser finishes mounting its first runtimes/components.
      this.handleVisibilityChange()
      this.scheduleRuntimeLayerAlignment()
    }
  }

  goToScene(index: number, targetStateId?: string): boolean {
    if (this.destroyed) {
      return false
    }
    this.scenePicker?.close()
    return this.playerScene.showScene(index, false, targetStateId)
  }

  goToSceneById(sceneId: string, targetStateId?: string): boolean {
    if (this.destroyed) return false
    const index = this.payload.project.scenes.findIndex(
      (scene) => scene.id === sceneId,
    )
    return index >= 0 && this.goToScene(index, targetStateId)
  }

  previous(): boolean {
    return this.previousScene()
  }

  next(): boolean {
    return this.nextScene()
  }

  previousScene(): boolean {
    return this.goToScene(this.playerScene.getCurrentSceneIndex() - 1)
  }

  nextScene(): boolean {
    return this.goToScene(this.playerScene.getCurrentSceneIndex() + 1)
  }

  replayScene(): boolean {
    if (this.destroyed) return false
    this.scenePicker?.close()
    return this.playerScene.replayScene()
  }

  restartCourse(): boolean {
    if (this.destroyed) return false
    this.scenePicker?.close()
    return this.playerScene.restartCourse()
  }

  getCurrentSceneIndex(): number {
    return this.playerScene.getCurrentSceneIndex()
  }

  getCurrentSceneId(): string | null {
    const index = this.playerScene.getCurrentSceneIndex()
    return this.payload.project.scenes[index]?.id ?? null
  }

  getCurrentPresentationStateId(): string | null {
    return this.playerScene.getCurrentPresentationStateId()
  }

  setPresentationState(
    stateId: string,
    transition?: RuntimePresentationTransition,
  ): boolean {
    return this.playerScene.setPresentationState(stateId, transition)
  }

  async waitForCaptureReady(): Promise<void> {
    if (this.capturePreparation) return this.capturePreparation
    const preparation = (async (): Promise<void> => {
      // Freeze runtime/component updates before authors render their explicit
      // deterministic capture frame. The suspended state is cached by
      // PlayerScene, so a capture-time navigation cannot mount a running child.
      if (this.captureMode) this.playerScene.suspendRuntimes()
      this.preparedCanvasSnapshots.reset()
      await this.playerScene.waitForCaptureReady((roots) => {
        this.preparedCanvasSnapshots.captureRoots(roots)
      })
    })()
    this.capturePreparation = preparation
    try {
      await preparation
    } finally {
      if (this.capturePreparation === preparation) {
        this.capturePreparation = null
      }
    }
  }

  getPreparedCanvasSnapshot(
    source: HTMLCanvasElement,
  ): HTMLCanvasElement | undefined {
    return this.preparedCanvasSnapshots.get(source)
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.resizeObserver?.disconnect()
    if (!this.captureMode) {
      window.removeEventListener('resize', this.scheduleRuntimeLayerAlignment)
      document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    }
    if (this.alignmentFrame !== null) cancelAnimationFrame(this.alignmentFrame)
    this.alignmentFrame = null
    this.controls?.destroy()
    this.keyboardNavigation?.destroy()
    this.scenePickerEventDisposers.splice(0).forEach((dispose) => dispose())
    this.scenePicker?.destroy()
    this.disposeAudioToggle()
    this.audio.destroy()
    this.game.destroy(true)
    this.runtimeKernel.destroy()
    this.componentRegistry.dispose()
    this.capturePreparation = null
    this.preparedCanvasSnapshots.clear()
    this.root.replaceChildren()
  }

  private registerComponentRuntimes(): void {
    this.componentRegistry.install()
    for (const component of Object.values(this.payload.components)) {
      try {
        this.componentRegistry.executeRuntime(
          component.manifest,
          component.runtimeSource,
        )
      } catch (error) {
        console.error(`组件“${component.manifest.name}”注册失败`, error)
      }
    }
  }

  private readonly scheduleRuntimeLayerAlignment = (): void => {
    if (this.destroyed || this.alignmentFrame !== null) return
    this.alignmentFrame = requestAnimationFrame(() => {
      this.alignmentFrame = null
      this.alignRuntimeDomLayers()
    })
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.destroyed || this.captureMode) return
    const visible = document.visibilityState !== 'hidden'
    if (visible) {
      this.playerScene.resumeRuntimes()
      this.playerScene.setDocumentVisible(true)
    } else {
      this.playerScene.setDocumentVisible(false)
      this.playerScene.suspendRuntimes()
    }
  }

  private alignRuntimeDomLayers(): void {
    if (this.captureMode) {
      const logicalWidth = this.payload.project.canvas.width
      const logicalHeight = this.payload.project.canvas.height
      for (const layer of [
        this.runtimeDomLayers.global.underlay,
        this.runtimeDomLayers.scene.underlay,
        this.runtimeDomLayers.scene.overlay,
        this.runtimeDomLayers.global.overlay,
      ]) {
        Object.assign(layer.style, {
          left: '0',
          top: '0',
          width: `${logicalWidth}px`,
          height: `${logicalHeight}px`,
          transform: 'none',
          transformOrigin: '0 0',
        })
      }
      return
    }
    const canvas = this.game.canvas
    const canvasRect = canvas.getBoundingClientRect()
    const stageRect = this.stage.getBoundingClientRect()
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return
    const scaleX = canvasRect.width / this.payload.project.canvas.width
    const scaleY = canvasRect.height / this.payload.project.canvas.height
    const translateX = canvasRect.left - stageRect.left
    const translateY = canvasRect.top - stageRect.top
    const transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`
    for (const layer of [
      this.runtimeDomLayers.global.underlay,
      this.runtimeDomLayers.scene.underlay,
      this.runtimeDomLayers.scene.overlay,
      this.runtimeDomLayers.global.overlay,
    ]) {
      layer.style.transform = transform
    }
  }
}
