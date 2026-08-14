import type {
  AudioInteractionAction,
  InteractionRule,
  NodeMotionAction,
  VideoInteractionAction,
} from '../shared/interactionTypes'
import type { CourseEventBus } from '../shared/runtimeTypes'
import {
  InteractionEngine,
  type InteractionBindableNodeHandle,
  type InteractionBindableRoot,
  type InteractionEngineErrorContext,
  type InteractionHostActions,
  type InteractionNodeMotionContext,
  type InteractionPresentationController,
} from './InteractionEngine'

export interface CourseGlobalInteractionControllerOptions {
  root: HTMLElement
  rules: readonly InteractionRule[]
  events: CourseEventBus
  currentSurfaceId(): string | null
  currentSceneId(): string | null
  presentation: InteractionPresentationController
  hostActions: Readonly<InteractionHostActions>
  executeAudioAction?(action: AudioInteractionAction): unknown
  onError?(error: unknown, context: InteractionEngineErrorContext): void
  enabled?: boolean
}

function selectorValue(value: string): string {
  const escape = globalThis.CSS?.escape
  return escape ? escape(value) : value.replace(/["\\]/g, '\\$&')
}

function elementIsHidden(element: Element): boolean {
  return Boolean(
    ('hidden' in element && (element as HTMLElement).hidden) ||
    (element as HTMLElement).style.display === 'none' ||
    (element as HTMLElement).style.visibility === 'hidden'
  )
}

function setElementVisible(element: Element, visible: boolean): void {
  if ('hidden' in element) (element as HTMLElement).hidden = !visible
  ;(element as HTMLElement).style.display = visible ? '' : 'none'
}

function nodeIdForMedia(target: Element): string | undefined {
  return target.closest<HTMLElement>('[data-layer-item-id]')?.dataset.layerItemId
}

/**
 * Course-owned InteractionRule executor. It remains alive while the active
 * surface changes, and only binds node/media handles from the current surface.
 */
export class CourseGlobalInteractionController {
  readonly #options: CourseGlobalInteractionControllerOptions
  readonly #visibility = new Map<string, boolean>()
  readonly #observer: MutationObserver | null
  #engine: InteractionEngine | null = null
  #enabled: boolean
  #destroyed = false

  constructor(options: CourseGlobalInteractionControllerOptions) {
    this.#options = options
    this.#enabled = options.enabled ?? true
    const Observer = options.root.ownerDocument.defaultView?.MutationObserver
    this.#observer = Observer ? new Observer(() => this.refreshBindings()) : null
    this.#observer?.observe(options.root, { childList: true, subtree: true })
    options.root.addEventListener('play', this.#handleMediaEvent, true)
    options.root.addEventListener('pause', this.#handleMediaEvent, true)
    options.root.addEventListener('ended', this.#handleMediaEvent, true)
    options.root.addEventListener('timeupdate', this.#handleMediaEvent, true)
    if (this.#enabled) this.#start()
  }

  setEnabled(enabled: boolean): void {
    if (this.#destroyed || this.#enabled === enabled) return
    this.#enabled = enabled
    if (enabled) this.#start()
    else this.#stop()
  }

  refreshBindings(): void {
    if (!this.#engine || this.#destroyed) return
    const handles = this.#currentLayerElements().map((element) => {
      const id = element.getAttribute('data-layer-item-id')!
      const authoredVisibility = this.#visibility.get(id)
      if (authoredVisibility !== undefined) setElementVisible(element, authoredVisibility)
      return this.#nodeHandle(id, element)
    })
    this.#engine.bindNodeHandles(handles)
  }

  /** Course restart discards interaction-owned visibility across all surfaces. */
  resetCourseState(): void {
    this.#visibility.clear()
  }

  destroy(): void {
    if (this.#destroyed) return
    this.#destroyed = true
    this.#stop()
    this.#observer?.disconnect()
    const { root } = this.#options
    root.removeEventListener('play', this.#handleMediaEvent, true)
    root.removeEventListener('pause', this.#handleMediaEvent, true)
    root.removeEventListener('ended', this.#handleMediaEvent, true)
    root.removeEventListener('timeupdate', this.#handleMediaEvent, true)
    this.#visibility.clear()
  }

  #start(): void {
    if (this.#engine || this.#destroyed || this.#options.rules.length === 0) return
    this.#engine = new InteractionEngine({
      scope: 'global',
      sceneId: '',
      currentSceneId: this.#options.currentSceneId,
      rules: this.#options.rules,
      events: this.#options.events,
      presentation: {
        current: () => this.#options.presentation.current(),
        states: () => this.#options.presentation.states(),
        setState: (stateId) => this.#settlePresentation(
          this.#options.presentation.setState(stateId),
        ),
        transitionTo: (stateId, transition) => this.#settlePresentation(
          this.#options.presentation.transitionTo(stateId, transition),
        ),
      },
      hostActions: {
        ...this.#options.hostActions,
        restartCourse: () => {
          this.resetCourseState()
          return this.#options.hostActions.restartCourse()
        },
      },
      executeAudioAction: this.#options.executeAudioAction,
      executeVideoAction: (action) => this.#executeVideoAction(action),
      executeNodeMotion: (action, context) => this.#executeNodeMotion(action, context),
      onError: this.#options.onError,
    })
    this.refreshBindings()
  }

  #stop(): void {
    this.#engine?.destroy()
    this.#engine = null
  }

  async #settlePresentation(
    result: boolean | PromiseLike<boolean>,
  ): Promise<boolean> {
    const settled = await Promise.resolve(result)
    this.refreshBindings()
    return settled
  }

  #currentLayerElements(): Element[] {
    const surfaceId = this.#options.currentSurfaceId()
    if (!surfaceId) return []
    return [...this.#options.root.querySelectorAll<Element>('[data-layer-item-id]')]
      .filter((element) => {
        const owner = element.closest<HTMLElement>('[data-surface-id]')
        return owner?.dataset.surfaceId === surfaceId
      })
  }

  #nodeHandle(id: string, element: Element): InteractionBindableNodeHandle {
    const controller = this
    const html = element as HTMLElement
    const input = {
      get enabled(): boolean {
        return element.getAttribute('data-hit-policy') !== 'pass-through' &&
          html.dataset.hitPolicy !== 'pass-through'
      },
      get cursor(): string | undefined { return html.style.cursor || undefined },
      set cursor(value: string | undefined) { html.style.cursor = value ?? '' },
    }
    const root: InteractionBindableRoot = {
      get active(): boolean { return controller.#enabled && !controller.#destroyed },
      get visible(): boolean { return !elementIsHidden(element) },
      input,
      setInteractive: ({ cursor } = {}) => {
        if (cursor) html.style.cursor = cursor
        return element
      },
      on: (eventName, listener) => {
        element.addEventListener(eventName, listener as EventListener)
        return element
      },
      off: (eventName, listener) => {
        element.removeEventListener(eventName, listener as EventListener)
        return element
      },
    }
    return { id, root }
  }

  #findCurrentLayer(nodeId: string): Element {
    const found = this.#currentLayerElements().find((element) => (
      element.getAttribute('data-layer-item-id') === nodeId
    ))
    if (!found) {
      throw new Error(`当前表面找不到互动图层：${nodeId}`)
    }
    return found
  }

  #executeVideoAction(action: VideoInteractionAction): boolean | PromiseLike<boolean> {
    const wrapper = this.#findCurrentLayer(action.nodeId)
    const video = wrapper.querySelector<HTMLVideoElement>('video')
    if (!video) throw new Error(`当前图层不是可控制的视频：${action.nodeId}`)
    const play = (): boolean | PromiseLike<boolean> => {
      const started = video.play()
      return started && typeof started.then === 'function'
        ? started.then(() => true)
        : true
    }
    switch (action.type) {
      case 'video.play': return play()
      case 'video.pause':
        video.pause()
        return true
      case 'video.restart':
        video.currentTime = 0
        return play()
      case 'video.stop':
        video.pause()
        video.currentTime = 0
        return true
      case 'video.toggle':
        if (video.paused) return play()
        video.pause()
        return true
      case 'video.seek':
        video.currentTime = action.seconds
        return true
    }
  }

  #executeNodeMotion(
    action: NodeMotionAction,
    context: InteractionNodeMotionContext,
  ): boolean | PromiseLike<boolean> {
    const wrapper = this.#findCurrentLayer(action.nodeId)
    const entering = action.type === 'node.enter'
    const previous = this.#visibility.get(action.nodeId)
    if (entering) {
      this.#visibility.set(action.nodeId, true)
      setElementVisible(wrapper, true)
    }
    const content = wrapper.querySelector('.slide-layer-content') ?? wrapper
    const translate = action.effect === 'slide'
      ? action.direction === 'left' ? 'translateX(-10%)'
        : action.direction === 'right' ? 'translateX(10%)'
          : action.direction === 'up' ? 'translateY(-10%)' : 'translateY(10%)'
      : undefined
    const hiddenFrame: Keyframe = {
      opacity: 0,
      ...(action.effect === 'scale' ? { transform: 'scale(.92)' } : {}),
      ...(translate ? { transform: translate } : {}),
    }
    const shownFrame: Keyframe = { opacity: 1, transform: 'none' }
    if (action.effect === 'none' || action.durationMs <= 0 || typeof content.animate !== 'function') {
      this.#visibility.set(action.nodeId, entering)
      setElementVisible(wrapper, entering)
      return true
    }
    const animation = content.animate(
      entering ? [hiddenFrame, shownFrame] : [shownFrame, hiddenFrame],
      { duration: action.durationMs, easing: action.easing, fill: 'none' },
    )
    return new Promise<boolean>((resolve) => {
      let settled = false
      const finish = (completed: boolean): void => {
        if (settled) return
        settled = true
        context.signal.removeEventListener('abort', abort)
        if (completed && !entering) {
          this.#visibility.set(action.nodeId, false)
          setElementVisible(wrapper, false)
        }
        resolve(completed)
      }
      const abort = (): void => {
        animation.cancel()
        if (previous === undefined) this.#visibility.delete(action.nodeId)
        else this.#visibility.set(action.nodeId, previous)
        if (previous !== undefined) setElementVisible(wrapper, previous)
        finish(false)
      }
      context.signal.addEventListener('abort', abort, { once: true })
      if (context.signal.aborted) {
        abort()
        return
      }
      void animation.finished.then(() => finish(true), () => finish(false))
    })
  }

  #handleMediaEvent = (event: Event): void => {
    if (!this.#enabled || this.#destroyed) return
    const target = event.target
    const Video = this.#options.root.ownerDocument.defaultView?.HTMLVideoElement
    if (!Video || !(target instanceof Video)) return
    const nodeId = nodeIdForMedia(target)
    if (!nodeId) return
    const wrapper = target.closest<Element>('[data-layer-item-id]')
    const owner = wrapper?.closest<HTMLElement>('[data-surface-id]')
    const surfaceId = this.#options.currentSurfaceId()
    if (!surfaceId || owner?.dataset.surfaceId !== surfaceId) return
    const payload = {
      surfaceId,
      sceneId: this.#options.currentSceneId(),
      nodeId,
      seconds: target.currentTime,
    }
    if (event.type === 'play') this.#options.events.emit('video:started', payload)
    else if (event.type === 'pause') this.#options.events.emit('video:paused', payload)
    else if (event.type === 'ended') this.#options.events.emit('video:ended', payload)
    else if (event.type === 'timeupdate') this.#options.events.emit('video:time', payload)
  }
}
