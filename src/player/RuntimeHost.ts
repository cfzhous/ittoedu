import * as Phaser from 'phaser'
import { runtimeDocumentSchema } from '../shared/runtimeSchema'
import type {
  CourseEventBus as CourseEventBusContract,
  CourseStateStore as CourseStateStoreContract,
  RuntimeCreateContextV1,
  RuntimeCreateContextV2,
  RuntimeDocument,
  RuntimeEventDisposer,
  RuntimeEventListener,
  RuntimeExecutionMode,
  RuntimeHostActions,
  RuntimeInstanceLifecycle,
  RuntimeNavigationGuard,
  RuntimeNodeHandle,
  RuntimePresentationApi,
  RuntimeScope,
} from '../shared/runtimeTypes'
import { CourseStateStore } from './CourseStateStore'
import type { CourseEventBus } from './CourseEventBus'
import type { RuntimeRegistry } from './RuntimeRegistry'
import type { CaptureSurfaceSnapshotter } from './PreparedCanvasSnapshots'
import {
  RuntimeAuthoringTargetRegistry,
  type RuntimeAuthoringTargetsChangedHandler,
} from './RuntimeAuthoringTargetRegistry'

export interface RuntimeLayerTargets<T> {
  underlay: T
  overlay: T
}

export interface RuntimeMountEnvironment {
  phaser: RuntimeLayerTargets<Phaser.GameObjects.Container> & {
    scene: Phaser.Scene
  }
  dom: RuntimeLayerTargets<HTMLElement>
  resolveNode(nodeId: string): RuntimeNodeHandle | null
  presentation: RuntimePresentationApi
}

export interface RuntimeHostOptions {
  registry: RuntimeRegistry
  runtime: RuntimeDocument
  label: string
  scope: RuntimeScope
  mode: RuntimeExecutionMode
  sceneId?: string
  width: number
  height: number
  environment: RuntimeMountEnvironment
  actions: Readonly<RuntimeHostActions>
  events: CourseEventBus
  courseState: CourseStateStoreContract
  assetUrl(assetId: string): string
  registerNavigationGuard(guard: RuntimeNavigationGuard): RuntimeEventDisposer
  /** Optional isolated-player authoring sink. Ordinary preview/capture omits it. */
  authoring?: RuntimeAuthoringHostOptions
}

export interface RuntimeAuthoringHostOptions {
  onTargetsChanged: RuntimeAuthoringTargetsChangedHandler
}

class ScopedEventBus implements CourseEventBusContract {
  private readonly subscriptions = new Map<
    string,
    Map<RuntimeEventListener<unknown>, RuntimeEventDisposer>
  >()
  private disposed = false

  constructor(private readonly events: CourseEventBusContract) {}

  on<T = unknown>(
    eventName: string,
    listener: RuntimeEventListener<T>,
  ): RuntimeEventDisposer {
    if (this.disposed) throw new Error('运行时事件作用域已销毁')
    const stored = listener as RuntimeEventListener<unknown>
    let eventSubscriptions = this.subscriptions.get(eventName)
    if (!eventSubscriptions) {
      eventSubscriptions = new Map()
      this.subscriptions.set(eventName, eventSubscriptions)
    }
    eventSubscriptions.get(stored)?.()
    const baseDisposer = this.events.on(eventName, stored)
    let active = true
    const disposer = () => {
      if (!active) return
      active = false
      baseDisposer()
      eventSubscriptions?.delete(stored)
      if (eventSubscriptions?.size === 0) this.subscriptions.delete(eventName)
    }
    eventSubscriptions.set(stored, disposer)
    return disposer
  }

  off<T = unknown>(eventName: string, listener: RuntimeEventListener<T>): void {
    this.subscriptions
      .get(eventName)
      ?.get(listener as RuntimeEventListener<unknown>)
      ?.()
  }

  emit<T = unknown>(eventName: string, payload?: T): void {
    if (!this.disposed) this.events.emit(eventName, payload)
  }

  listenerCount(eventName?: string): number {
    if (eventName !== undefined) return this.subscriptions.get(eventName)?.size ?? 0
    let count = 0
    for (const subscriptions of this.subscriptions.values()) {
      count += subscriptions.size
    }
    return count
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const disposers = [...this.subscriptions.values()]
      .flatMap((subscriptions) => [...subscriptions.values()])
    this.subscriptions.clear()
    disposers.forEach((dispose) => dispose())
  }
}

interface IsolatedDomMount {
  host: HTMLDivElement
  root: HTMLDivElement
}

function createIsolatedDomMount(
  parent: HTMLElement,
  label: string,
): IsolatedDomMount {
  const host = document.createElement('div')
  host.className = 'lesson-runtime-mount'
  host.dataset.runtimeLabel = label
  Object.assign(host.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
  })
  const shadow = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { position: absolute; inset: 0; display: block; pointer-events: none; }
    *, *::before, *::after { box-sizing: border-box; }
    .courseware-runtime-root {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
      font-family: Inter, "Microsoft YaHei", "PingFang SC", sans-serif;
    }
    .courseware-runtime-error {
      position: absolute;
      left: 16px;
      top: 16px;
      max-width: min(520px, calc(100% - 32px));
      padding: 10px 14px;
      border: 1px solid #ef6464;
      border-radius: 8px;
      color: #fecaca;
      background: rgba(63, 20, 26, .94);
      font: 14px/1.5 Inter, "Microsoft YaHei", sans-serif;
      pointer-events: none;
    }
  `
  const root = document.createElement('div')
  root.className = 'courseware-runtime-root'
  shadow.append(style, root)
  parent.append(host)
  return { host, root }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorOf(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

type RuntimeCommonContext = Omit<
  RuntimeCreateContextV1,
  'runtimeApiVersion' | 'Phaser' | 'phaser' | 'domRoot' | 'dom' | 'nodes'
>

export class RuntimeHost {
  private readonly localState: CourseStateStore
  private readonly scopedEvents: ScopedEventBus
  private underlayMount: Phaser.GameObjects.Container | null = null
  private overlayMount: Phaser.GameObjects.Container | null = null
  private underlayDom: IsolatedDomMount | null = null
  private overlayDom: IsolatedDomMount | null = null
  private readonly looseObjects: Phaser.GameObjects.GameObject[] = []
  private readonly guardDisposers = new Set<RuntimeEventDisposer>()
  private readonly capturePromises = new Set<Promise<unknown>>()
  private authoringRegistry: RuntimeAuthoringTargetRegistry | null = null
  private lifecycle: RuntimeInstanceLifecycle | null = null
  private failure: Error | null = null
  private destroyed = false

  constructor(private readonly options: RuntimeHostOptions) {
    const runtime = runtimeDocumentSchema.parse(options.runtime)
    this.scopedEvents = new ScopedEventBus(options.events)
    this.localState = new CourseStateStore((change) => {
      options.events.emit('state:change', {
        scope: options.scope,
        sceneId: options.sceneId,
        ...change,
      })
    })

    if (!runtime.enabled) return
    const exposesPhaser = runtime.runtimeApiVersion === 1 || runtime.renderMode !== 'dom'
    const exposesDom = runtime.runtimeApiVersion === 1 || runtime.renderMode !== 'phaser'
    if (exposesPhaser) this.createPhaserMounts()
    if (exposesDom) this.createDomMounts()

    const { scene } = options.environment.phaser
    const displayListBeforeCreate = new Set(scene.children.list)
    try {
      const definition = options.registry.executeRuntime(
        runtime.source,
        options.label,
        runtime.runtimeApiVersion,
      )
      if (definition.authoringApiVersion === 1 && options.authoring) {
        this.authoringRegistry = new RuntimeAuthoringTargetRegistry({
          scope: options.scope,
          sceneId: options.sceneId,
          width: options.width,
          height: options.height,
          content: runtime.content,
          assets: runtime.assets,
          ...(exposesDom ? { domRoots: this.domRoots() } : {}),
          onTargetsChanged: options.authoring.onTargetsChanged,
        })
      }
      const contentValues = Object.freeze({ ...runtime.content.values })
      const commonContext: RuntimeCommonContext = {
        scope: options.scope,
        mode: options.mode,
        sceneId: options.sceneId,
        width: options.width,
        height: options.height,
        content: {
          get(key: string): string {
            if (!Object.prototype.hasOwnProperty.call(contentValues, key)) {
              throw new Error(`运行时文字“${key}”不存在`)
            }
            return contentValues[key] ?? ''
          },
          all(): Readonly<Record<string, string>> {
            return contentValues
          },
        },
        assets: {
          url(bindingKey: string): string {
            const binding = runtime.assets[bindingKey]
            if (!binding) throw new Error(`运行时素材绑定“${bindingKey}”不存在`)
            return options.assetUrl(binding.assetId)
          },
          projectUrl(assetId: string): string {
            return options.assetUrl(assetId)
          },
        },
        presentation: options.environment.presentation,
        actions: options.actions,
        events: this.scopedEvents,
        localState: this.localState,
        courseState: options.courseState,
        capture: {
          waitUntil: (promise: Promise<unknown>) => {
            const tracked = Promise.resolve(promise)
            this.capturePromises.add(tracked)
            // Capture may be requested well after create(). Observe early
            // rejections now while preserving the rejected promise so the
            // eventual export barrier still fails deterministically.
            void tracked.catch(() => undefined)
          },
        },
        navigation: {
          guard: (guard) => {
            const baseDisposer = options.registerNavigationGuard(guard)
            let active = true
            const disposer = () => {
              if (!active) return
              active = false
              this.guardDisposers.delete(disposer)
              baseDisposer()
            }
            this.guardDisposers.add(disposer)
            return disposer
          },
        },
        ...(this.authoringRegistry
          ? { authoring: this.authoringRegistry }
          : {}),
        emit: (eventName, payload) => {
          options.events.emit('runtime:event', {
            scope: options.scope,
            sceneId: options.sceneId,
            eventName,
            payload,
          })
        },
      }
      const nodes: RuntimeCreateContextV1['nodes'] = {
        get: (bindingOrNodeId: string) => options.environment.resolveNode(
          runtime.nodeBindings?.[bindingOrNodeId] ?? bindingOrNodeId,
        ),
      }

      let lifecycle: RuntimeInstanceLifecycle
      if (runtime.runtimeApiVersion === 1) {
        if (definition.runtimeApiVersion !== 1) {
          throw new Error(
            `运行时 API 不匹配：文档为 1，源码为 ${definition.runtimeApiVersion}`,
          )
        }
        const phaser = this.phaserRoots()
        const dom = this.domRoots()
        const context: RuntimeCreateContextV1 = {
          ...commonContext,
          runtimeApiVersion: 1,
          Phaser,
          phaser,
          domRoot: dom.root,
          dom,
          nodes,
        }
        lifecycle = definition.create(context)
      } else {
        if (definition.runtimeApiVersion !== 2) {
          throw new Error(
            `运行时 API 不匹配：文档为 2，源码为 ${definition.runtimeApiVersion}`,
          )
        }

        let context: RuntimeCreateContextV2
        if (runtime.renderMode === 'phaser') {
          context = {
            ...commonContext,
            runtimeApiVersion: 2,
            renderMode: 'phaser',
            Phaser,
            phaser: this.phaserRoots(),
            nodes,
          }
        } else if (runtime.renderMode === 'dom') {
          const dom = this.domRoots()
          context = {
            ...commonContext,
            runtimeApiVersion: 2,
            renderMode: 'dom',
            domRoot: dom.root,
            dom,
          }
        } else {
          const dom = this.domRoots()
          context = {
            ...commonContext,
            runtimeApiVersion: 2,
            renderMode: 'hybrid',
            Phaser,
            phaser: this.phaserRoots(),
            domRoot: dom.root,
            dom,
            nodes,
          }
        }
        lifecycle = definition.create(context)
      }
      if (!lifecycle || typeof lifecycle.destroy !== 'function') {
        throw new Error('运行时 create() 必须返回含 destroy() 的生命周期对象')
      }
      this.lifecycle = lifecycle
      this.looseObjects.push(
        ...scene.children.list.filter(
          (object) => !displayListBeforeCreate.has(object),
        ),
      )
    } catch (error) {
      this.recordFailure(error)
      console.error(`运行时“${options.label}”启动失败`, error)
      for (const dispose of [...this.guardDisposers]) dispose()
      this.guardDisposers.clear()
      this.scopedEvents.dispose()
      this.authoringRegistry?.destroy()
      this.authoringRegistry = null
      this.underlayMount?.removeAll(true)
      this.overlayMount?.removeAll(true)
      for (const object of scene.children.list.slice()) {
        if (!displayListBeforeCreate.has(object) && object.active) {
          object.destroy()
        }
      }
      const message = document.createElement('div')
      message.className = 'courseware-runtime-error'
      message.textContent = `互动运行时加载失败：${messageOf(error)}`
      this.ensureOverlayDom().root.append(message)
    }
  }

  async waitForCaptureReady(
    snapshotSurfaces?: CaptureSurfaceSnapshotter,
  ): Promise<void> {
    if (this.destroyed) return
    if (this.failure) {
      throw new Error(
        `运行时“${this.options.label}”此前执行失败，不能生成可靠快照：${this.failure.message}`,
        { cause: this.failure },
      )
    }
    try {
      // Resource promises registered during create/update must settle before
      // prepareCapture performs the final WebGL/Canvas draw. Otherwise a slow
      // task can outlive a preserveDrawingBuffer=false frame.
      await this.drainCapturePromises()
      await this.lifecycle?.prepareCapture?.()
      // A hook may synchronously register additional finite work. Such a task
      // must resolve only after it has committed any asynchronous final draw.
      await this.drainCapturePromises()
      const roots = [this.underlayDom?.root, this.overlayDom?.root]
        .filter((root): root is HTMLDivElement => Boolean(root))
      if (roots.length > 0) snapshotSurfaces?.(roots)
    } catch (error) {
      throw this.recordFailure(error)
    }
  }

  resize(width: number, height: number): void {
    if (this.destroyed) return
    this.authoringRegistry?.resize(width, height)
    if (typeof this.lifecycle?.resize !== 'function') return
    try {
      this.lifecycle.resize(width, height)
    } catch (error) {
      this.recordFailure(error)
      console.error(`运行时“${this.options.label}”调整尺寸失败`, error)
    }
  }

  setVisible(visible: boolean): void {
    if (this.destroyed) return
    this.underlayMount?.setVisible(visible)
    this.overlayMount?.setVisible(visible)
    if (this.underlayDom) {
      this.underlayDom.host.style.visibility = visible ? '' : 'hidden'
    }
    if (this.overlayDom) {
      this.overlayDom.host.style.visibility = visible ? '' : 'hidden'
    }
    if (typeof this.lifecycle?.setVisible !== 'function') return
    try {
      this.lifecycle.setVisible(visible)
    } catch (error) {
      this.recordFailure(error)
      console.error(`运行时“${this.options.label}”切换可见性失败`, error)
    }
  }

  suspend(): void {
    if (this.destroyed || typeof this.lifecycle?.suspend !== 'function') return
    try {
      this.lifecycle.suspend()
    } catch (error) {
      this.recordFailure(error)
      console.error(`运行时“${this.options.label}”暂停失败`, error)
    }
  }

  resume(): void {
    if (this.destroyed || typeof this.lifecycle?.resume !== 'function') return
    try {
      this.lifecycle.resume()
    } catch (error) {
      this.recordFailure(error)
      console.error(`运行时“${this.options.label}”恢复失败`, error)
    }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    try {
      this.lifecycle?.destroy()
    } catch (error) {
      console.error(`运行时“${this.options.label}”销毁失败`, error)
    }
    this.lifecycle = null
    this.authoringRegistry?.destroy()
    this.authoringRegistry = null
    for (const dispose of [...this.guardDisposers]) dispose()
    this.guardDisposers.clear()
    this.scopedEvents.dispose()
    this.localState.clear()
    for (const object of this.looseObjects) {
      if (object.active) object.destroy()
    }
    this.looseObjects.length = 0
    if (this.underlayMount?.active) this.underlayMount.destroy(true)
    if (this.overlayMount?.active) this.overlayMount.destroy(true)
    this.underlayMount = null
    this.overlayMount = null
    this.underlayDom?.host.remove()
    this.overlayDom?.host.remove()
    this.underlayDom = null
    this.overlayDom = null
    this.capturePromises.clear()
  }

  private recordFailure(error: unknown): Error {
    const normalized = errorOf(error)
    this.failure ??= normalized
    return this.failure
  }

  private async drainCapturePromises(): Promise<void> {
    while (this.capturePromises.size > 0) {
      const pending = [...this.capturePromises]
      try {
        await Promise.all(pending)
      } finally {
        pending.forEach((promise) => this.capturePromises.delete(promise))
      }
    }
  }

  private createPhaserMounts(): void {
    if (this.underlayMount && this.overlayMount) return
    const { scene, underlay, overlay } = this.options.environment.phaser
    this.underlayMount = scene.add
      .container(0, 0)
      .setName(`${this.options.label}:phaser-underlay`)
    this.overlayMount = scene.add
      .container(0, 0)
      .setName(`${this.options.label}:phaser-overlay`)
    underlay.add(this.underlayMount)
    overlay.add(this.overlayMount)
  }

  private createDomMounts(): void {
    if (this.underlayDom && this.overlayDom) return
    this.underlayDom = createIsolatedDomMount(
      this.options.environment.dom.underlay,
      `${this.options.label}:dom-underlay`,
    )
    this.overlayDom = createIsolatedDomMount(
      this.options.environment.dom.overlay,
      `${this.options.label}:dom-overlay`,
    )
  }

  private ensureOverlayDom(): IsolatedDomMount {
    if (!this.overlayDom) {
      this.overlayDom = createIsolatedDomMount(
        this.options.environment.dom.overlay,
        `${this.options.label}:dom-overlay`,
      )
    }
    return this.overlayDom
  }

  private phaserRoots(): RuntimeCreateContextV1['phaser'] {
    if (!this.underlayMount || !this.overlayMount) {
      throw new Error('运行时未声明 Phaser 渲染能力')
    }
    return {
      scene: this.options.environment.phaser.scene,
      root: this.overlayMount,
      underlay: this.underlayMount,
      overlay: this.overlayMount,
    }
  }

  private domRoots(): RuntimeCreateContextV1['dom'] {
    if (!this.underlayDom || !this.overlayDom) {
      throw new Error('运行时未声明 DOM 渲染能力')
    }
    return {
      root: this.overlayDom.root,
      underlay: this.underlayDom.root,
      overlay: this.overlayDom.root,
    }
  }
}
