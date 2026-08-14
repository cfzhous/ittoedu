import type {
  ComponentCreateContextV4Dom,
  ComponentDefinitionV4,
  ComponentInstanceLifecycle,
  ComponentManifest,
  ExportPayload,
} from '../../shared/componentTypes'
import type {
  ComponentLayerItem,
  FlowBlock,
  RuntimeLayerItem,
} from '../../shared/courseProjectTypes'
import type { PublishedCourseV2Payload } from '../../shared/publishedCourseTypes'
import type { ExternalComponentNode } from '../../shared/projectTypes'
import type {
  CourseStateStore as CourseStateStoreContract,
  RuntimePresentationApi,
} from '../../shared/runtimeTypes'
import type {
  SurfaceRuntimeDefinition,
  SurfaceRuntimeInstanceLifecycle,
  SurfaceRuntimeMode,
} from '../../shared/surfaceRuntimeTypes'
import { ComponentRegistry } from '../ComponentRegistry'
import { CourseEventBus } from '../CourseEventBus'
import type { DeclarativeCourseState } from '../DeclarativeCourseState'
import { decodePublishedCourseCode } from '../publishedCourse'
import type { RenderedNodeHandle } from '../renderNode'
import { SurfaceRuntimeAuthoringBridge } from '../SurfaceRuntimeAuthoring'
import { SurfaceRuntimeRegistry } from '../SurfaceRuntimeRegistry'
import type {
  SlideItemHost,
  SlideItemMountContext,
} from './slide/SlideSurfaceHost'
import type { SurfacePlayerServices } from './SurfaceHost'
import type { FlowRenderedComponent } from './flow/FlowSurfaceHost'
import type { ComponentMiniPhaserStage } from './componentMiniPhaserStage'

async function loadComponentPhaserSupport() {
  const [renderNodeModule, stageModule] = await Promise.all([
    import('../renderNode'),
    import('./componentMiniPhaserStage'),
  ])
  return {
    renderNode: renderNodeModule.renderNode,
    ComponentMiniPhaserStage: stageModule.ComponentMiniPhaserStage,
  }
}

export interface PublishedDynamicHostNavigation {
  goToScene(sceneId: string, stateId?: string): void | Promise<void>
  next(): void | Promise<void>
  previous(): void | Promise<void>
  replay(): void | Promise<void>
  restart(): void | Promise<void>
  setPresentationState(surfaceId: string, stateId: string): void | Promise<void>
  presentationState(surfaceId: string): {
    current: string | null
    states: Array<{ id: string; name: string; description?: string }>
  }
}

export interface PublishedDynamicHostEnvironment {
  payload: PublishedCourseV2Payload
  courseState: DeclarativeCourseState
  events: CourseEventBus
  navigation: PublishedDynamicHostNavigation
  reportDiagnostic?(surfaceId: string, itemId: string, error: Error): void
}

function componentKey(packageId: string, version: string): string {
  return `${packageId}@${version}`
}

function actionPort(navigation: PublishedDynamicHostNavigation) {
  const run = (operation: () => void | Promise<void>): boolean => {
    try {
      void operation()
      return true
    } catch {
      return false
    }
  }
  return Object.freeze({
    goToScene: (sceneId: string, stateId?: string) => run(() => navigation.goToScene(sceneId, stateId)),
    nextScene: () => run(() => navigation.next()),
    previousScene: () => run(() => navigation.previous()),
    replayScene: () => run(() => navigation.replay()),
    restartCourse: () => run(() => navigation.restart()),
  })
}

function courseStatePort(state: DeclarativeCourseState): CourseStateStoreContract {
  return {
    get: <T>(key: string) => state.get(key) as T | undefined,
    set: (key, value) => state.set(key, value as never),
    delete: (key) => state.delete(key),
    clear: () => {
      for (const key of Object.keys(state.snapshot())) state.delete(key)
    },
    snapshot: () => state.snapshot(),
  }
}

function presentationPort(
  surfaceId: string,
  navigation: PublishedDynamicHostNavigation,
): RuntimePresentationApi {
  return {
    current: () => navigation.presentationState(surfaceId).current,
    states: () => navigation.presentationState(surfaceId).states,
    setState: (stateId) => {
      void navigation.setPresentationState(surfaceId, stateId)
      return true
    },
    transitionTo: (stateId) => {
      void navigation.setPresentationState(surfaceId, stateId)
      return true
    },
  }
}

function componentFor(
  payload: PublishedCourseV2Payload,
  item: ComponentLayerItem,
) {
  return payload.components[componentKey(item.component.packageId, item.component.version)]
    ?? Object.values(payload.components).find((component) => (
      component.id === item.component.packageId && component.version === item.component.version
    ))
}

function publishedComponentManifest(
  component: NonNullable<ReturnType<typeof componentFor>>,
  item: ComponentLayerItem,
): ComponentManifest {
  return {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: component.id,
    name: component.name,
    version: component.version,
    entry: 'runtime.js',
    defaultSize: { width: item.frame.width, height: item.frame.height },
    minSize: { width: 1, height: 1 },
    preserveAspectRatio: false,
    assets: Object.fromEntries(Object.keys(component.assets).map((key) => [key, key])),
    defaultProps: {},
    supportedScopes: [...component.scopes],
    renderMode: component.renderMode,
  }
}

function componentNode(item: ComponentLayerItem): ExternalComponentNode {
  return {
    id: item.layerItemId,
    name: item.label,
    type: 'external-component',
    x: 0,
    y: 0,
    width: item.frame.width,
    height: item.frame.height,
    rotation: 0,
    opacity: item.opacity,
    visible: item.visible,
    locked: item.locked,
    playbackInitialVisibility: item.playbackInitialVisibility,
    component: structuredClone(item.component),
    props: structuredClone(item.props),
  }
}

class PublishedDomComponentHost implements SlideItemHost<ComponentLayerItem> {
  #instance: ComponentInstanceLifecycle | null = null
  #context: SlideItemMountContext<ComponentLayerItem> | null = null

  constructor(
    private readonly definition: ComponentDefinitionV4,
    private readonly environment: PublishedDynamicHostEnvironment,
  ) {}

  mount(context: SlideItemMountContext<ComponentLayerItem>): void {
    const component = componentFor(this.environment.payload, context.item)
    if (!component) throw new Error(`Published component ${context.item.component.packageId} is missing`)
    if (component.renderMode !== 'dom') {
      throw new Error(`Published component ${component.id} requires ${component.renderMode}; DOM item host cannot execute it`)
    }
    this.#context = context
    const capturePromises: Promise<unknown>[] = []
    const createContext: ComponentCreateContextV4Dom = {
      runtimeApiVersion: 4,
      renderMode: 'dom',
      instanceId: `${context.surfaceId}:${context.sceneId}:${context.item.layerItemId}`,
      width: context.item.frame.width,
      height: context.item.frame.height,
      mode: context.mode === 'inspect' ? 'edit' : 'preview',
      props: structuredClone(context.item.props),
      editorState: {},
      actions: actionPort(this.environment.navigation),
      scope: 'scene',
      events: this.environment.events,
      courseState: courseStatePort(this.environment.courseState),
      presentation: presentationPort(context.surfaceId, this.environment.navigation),
      capture: { waitUntil: (promise) => capturePromises.push(Promise.resolve(promise)) },
      assetUrl: (assetKey) => component.assets[assetKey]?.url ?? '',
      projectAssetUrl: (assetId) => this.environment.payload.assets[assetId]?.url ?? '',
      emit: (eventName, payload) => this.environment.events.emit(eventName, payload),
      dom: { root: context.container },
    }
    this.#instance = this.definition.create(createContext)
    if (!this.#instance || typeof this.#instance.destroy !== 'function') {
      throw new Error(`Published component ${component.id} returned an invalid lifecycle`)
    }
  }

  update(item: ComponentLayerItem): void {
    this.#instance?.updateProps?.(structuredClone(item.props))
    this.#instance?.resize?.(item.frame.width, item.frame.height)
  }

  activate(): void { this.#instance?.setVisible?.(true); this.#instance?.resume?.() }
  suspend(): void { this.#instance?.suspend?.(); this.#instance?.setVisible?.(false) }
  resume(): void { this.activate() }
  reset(): void { this.#instance?.updateProps?.(structuredClone(this.#context?.item.props ?? {})) }
  setInspectionMode(mode: 'playback' | 'inspect'): void {
    this.#instance?.setMode?.(mode === 'inspect' ? 'edit' : 'preview')
  }
  async capture(): Promise<void> { await this.#instance?.prepareCapture?.() }
  destroy(): void { this.#instance?.destroy(); this.#instance = null; this.#context = null }
}

class PublishedPhaserComponentHost implements SlideItemHost<ComponentLayerItem> {
  #stage: ComponentMiniPhaserStage | null = null
  #handle: RenderedNodeHandle | null = null
  #item: ComponentLayerItem | null = null
  #context: SlideItemMountContext<ComponentLayerItem> | null = null
  #active = false
  #mode: 'playback' | 'inspect' = 'playback'

  constructor(
    private readonly registry: ComponentRegistry,
    private readonly environment: PublishedDynamicHostEnvironment,
  ) {}

  async mount(context: SlideItemMountContext<ComponentLayerItem>): Promise<void> {
    const { ComponentMiniPhaserStage, renderNode } = await loadComponentPhaserSupport()
    const component = componentFor(this.environment.payload, context.item)
    if (!component) throw new Error(`Published component ${context.item.component.packageId} is missing`)
    if (component.renderMode === 'dom') throw new Error(`Published component ${component.id} does not require Phaser`)
    this.#context = context
    this.#item = structuredClone(context.item)
    this.#mode = context.mode
    const manifest = publishedComponentManifest(component, context.item)
    const payload: ExportPayload = {
      project: {} as ExportPayload['project'],
      assets: Object.fromEntries(Object.entries(this.environment.payload.assets).map(([id, asset]) => [id, {
        mimeType: asset.mimeType,
        dataUrl: asset.url,
      }])),
      components: {
        [componentKey(component.id, component.version)]: {
          manifest,
          runtimeSource: decodePublishedCourseCode(component.code, `Component ${component.id}`),
          assets: Object.fromEntries(Object.entries(component.assets).map(([key, asset]) => [key, {
            mimeType: asset.mimeType,
            dataUrl: asset.url,
          }])),
        },
      },
    }
    const stage = new ComponentMiniPhaserStage(
      context.container,
      context.item.frame.width,
      context.item.frame.height,
      context.signal,
    )
    this.#stage = stage
    const roots = await stage.ready
    if (context.signal.aborted) return
    this.#handle = renderNode(roots.scene, componentNode(context.item), 0, {
      payload,
      registry: this.registry,
      actions: actionPort(this.environment.navigation),
      scope: 'scene',
      parentRoot: roots.content,
      events: this.environment.events,
      courseState: courseStatePort(this.environment.courseState),
      presentation: presentationPort(context.surfaceId, this.environment.navigation),
      mode: 'preview',
      authoring: context.mode === 'inspect',
      sceneId: context.sceneId,
      textureKey: (assetId) => assetId,
    })
    this.#handle.setInspectionMode?.(context.mode === 'inspect')
    stage.setInteractive(context.mode === 'playback')
    if (!this.#active || context.mode === 'inspect') {
      this.#handle.suspend?.()
      stage.setPaused(true)
    }
  }

  update(item: ComponentLayerItem): void {
    this.#item = structuredClone(item)
    if (this.#context) this.#context = { ...this.#context, item }
    this.#stage?.resize(item.frame.width, item.frame.height)
    this.#handle?.update(componentNode(item))
  }

  activate(): void {
    this.#active = true
    this.#handle?.setHostVisible?.(true)
    this.#stage?.setVisible(true)
    if (this.#mode === 'inspect') {
      this.#handle?.suspend?.()
      this.#stage?.setPaused(true)
    } else {
      this.#handle?.resume?.()
      this.#stage?.setPaused(false)
    }
  }
  suspend(): void {
    this.#active = false
    this.#handle?.suspend?.()
    this.#handle?.setHostVisible?.(false)
    this.#stage?.setPaused(true)
    this.#stage?.setVisible(false)
  }
  resume(): void { this.activate() }
  reset(): void { if (this.#item) this.#handle?.update(componentNode(this.#item)) }
  setInspectionMode(mode: 'playback' | 'inspect'): void {
    this.#mode = mode
    this.#handle?.setInspectionMode?.(mode === 'inspect')
    this.#stage?.setInteractive(mode === 'playback')
    if (mode === 'inspect') {
      this.#handle?.suspend?.()
      this.#stage?.setPaused(true)
    } else if (this.#active) {
      this.#handle?.resume?.()
      this.#stage?.setPaused(false)
    }
  }
  async capture(): Promise<{ format: 'html'; content: string } | void> {
    await this.#handle?.prepareCapture?.()
    if (this.#stage) return { format: 'html', content: this.#stage.captureHtml() }
  }
  destroy(): void {
    this.#handle?.destroy()
    this.#handle = null
    this.#stage?.destroy()
    this.#stage = null
    this.#item = null
    this.#context = null
    this.#active = false
  }
}

/** Official Surface Runtime V1 adapter: one compositor-owned DOM container. */
class PublishedSurfaceRuntimeHost implements SlideItemHost<RuntimeLayerItem> {
  #instance: SurfaceRuntimeInstanceLifecycle | null = null
  #authoring: SurfaceRuntimeAuthoringBridge | null = null
  #item: RuntimeLayerItem | null = null
  #mode: SurfaceRuntimeMode = 'playback'
  #active = false
  readonly #capturePromises: Promise<unknown>[] = []

  constructor(
    private readonly definition: SurfaceRuntimeDefinition,
    private readonly environment: PublishedDynamicHostEnvironment,
  ) {}

  mount(context: SlideItemMountContext<RuntimeLayerItem>): void {
    const runtime = context.item.runtime
    if (runtime.protocol !== 'surface-v1' || runtime.runtimeApiVersion !== 3) {
      throw new Error(`Runtime ${context.item.layerItemId} is not Surface Runtime V1`)
    }
    if (runtime.renderMode !== 'dom') {
      throw new Error(`Surface Runtime ${context.item.layerItemId} requires unsupported ${runtime.renderMode}`)
    }
    this.#item = context.item
    this.#mode = context.mode === 'inspect' ? 'inspect' : 'playback'
    this.#authoring = new SurfaceRuntimeAuthoringBridge({
      root: context.container,
      contentKeys: () => Object.keys(this.#item?.runtime.content.values ?? {}),
      assetKeys: () => Object.keys(this.#item?.runtime.assets ?? {}),
      reportHit: context.reportHit,
    }, this.#mode)
    try {
      this.#instance = this.definition.create({
        runtimeApiVersion: 3,
        mode: this.#mode,
        width: context.item.frame.width,
        height: context.item.frame.height,
        content: {
          get: (key) => {
            const value = this.#item?.runtime.content.values[key]
            if (value === undefined) throw new Error(`Unknown Surface Runtime content key ${key}`)
            return value
          },
          all: () => Object.freeze({ ...this.#item?.runtime.content.values }),
        },
        assets: {
          url: (bindingKey) => {
            const assetId = this.#item?.runtime.assets[bindingKey]?.assetId
            return assetId ? this.environment.payload.assets[assetId]?.url ?? '' : ''
          },
          projectUrl: (assetId) => this.environment.payload.assets[assetId]?.url ?? '',
        },
        courseState: courseStatePort(this.environment.courseState),
        presentation: presentationPort(context.surfaceId, this.environment.navigation),
        actions: actionPort(this.environment.navigation),
        events: this.environment.events,
        capture: {
          waitUntil: (promise) => this.#capturePromises.push(Promise.resolve(promise)),
        },
        dom: { root: context.container },
        authoring: this.#authoring,
        emit: (eventName, payload) => this.environment.events.emit(eventName, payload),
      })
    } catch (cause) {
      this.#authoring.destroy()
      this.#authoring = null
      this.#item = null
      throw cause
    }
    if (!this.#instance || typeof this.#instance.destroy !== 'function') {
      this.#authoring.destroy()
      this.#authoring = null
      throw new Error(`Surface Runtime ${context.item.layerItemId} returned an invalid lifecycle`)
    }
    this.#authoring.invalidate()
    if (this.#mode === 'inspect') this.#instance.suspend?.()
  }

  update(item: RuntimeLayerItem): void {
    this.#item = item
    this.#instance?.resize?.(item.frame.width, item.frame.height)
    this.#authoring?.invalidate()
  }

  activate(): void {
    this.#active = true
    this.#instance?.setVisible?.(true)
    if (this.#mode === 'inspect') this.#instance?.suspend?.()
    else this.#instance?.resume?.()
  }

  suspend(): void {
    this.#active = false
    this.#instance?.suspend?.()
    this.#instance?.setVisible?.(false)
  }

  resume(): void { this.activate() }

  setInspectionMode(mode: 'playback' | 'inspect'): void {
    const nextMode: SurfaceRuntimeMode = mode
    if (nextMode === this.#mode) return
    this.#mode = nextMode
    this.#authoring?.setMode(nextMode)
    this.#instance?.setMode?.(nextMode)
    if (nextMode === 'inspect') this.#instance?.suspend?.()
    else if (this.#active) this.#instance?.resume?.()
  }

  async capture(): Promise<void> {
    const previousMode = this.#mode
    this.#instance?.setMode?.('capture')
    await this.#instance?.prepareCapture?.()
    await Promise.all(this.#capturePromises.splice(0))
    this.#instance?.setMode?.(previousMode)
    this.#authoring?.invalidate()
  }

  destroy(): void {
    this.#instance?.destroy()
    this.#instance = null
    this.#authoring?.destroy()
    this.#authoring = null
    this.#item = null
    this.#capturePromises.length = 0
    this.#active = false
  }
}

/** Owns executable registries and returns per-item adapters for Slide Host. */
export class PublishedDynamicHostRegistry {
  readonly #components = new ComponentRegistry()
  readonly #surfaceRuntimes = new SurfaceRuntimeRegistry()
  readonly #componentDefinitions = new Map<string, ComponentDefinitionV4>()
  readonly #surfaceRuntimeDefinitions = new Map<string, SurfaceRuntimeDefinition>()
  readonly #flowHosts = new Set<{
    host: SlideItemHost<ComponentLayerItem>
    controller: AbortController
  }>()

  constructor(private readonly environment: PublishedDynamicHostEnvironment) {}

  componentHost = (item: ComponentLayerItem): SlideItemHost<ComponentLayerItem> => {
    const component = componentFor(this.environment.payload, item)
    const key = componentKey(item.component.packageId, item.component.version)
    if (!component) throw new Error(`Published component ${key} is missing`)
    let definition = this.#componentDefinitions.get(key)
    if (!definition) {
      definition = this.#components.executeRuntime(
        component.id,
        decodePublishedCourseCode(component.code, `Component ${key}`),
      )
      this.#componentDefinitions.set(key, definition)
    }
    return component.renderMode === 'dom'
      ? new PublishedDomComponentHost(definition, this.environment)
      : new PublishedPhaserComponentHost(this.#components, this.environment)
  }

  runtimeHost = (item: RuntimeLayerItem): SlideItemHost<RuntimeLayerItem> => {
    if (item.runtime.protocol === 'surface-v1' && item.runtime.runtimeApiVersion === 3) {
      if (item.runtime.renderMode !== 'dom') {
        throw new Error(`Surface Runtime ${item.layerItemId} requires unsupported ${item.runtime.renderMode}`)
      }
      let definition = this.#surfaceRuntimeDefinitions.get(item.runtime.source)
      if (!definition) {
        definition = this.#surfaceRuntimes.executeRuntime(item.runtime.source, item.layerItemId)
        this.#surfaceRuntimeDefinitions.set(item.runtime.source, definition)
      }
      return new PublishedSurfaceRuntimeHost(definition, this.environment)
    }
    throw new Error(`Runtime ${item.layerItemId} has no installed ${item.runtime.protocol} executor`)
  }

  /** Mounts a DOM Component used by a semantic Flow block into its own node. */
  renderFlowComponent(
    surfaceId: string,
    block: Extract<FlowBlock, { type: 'component' }>,
    dom: Document,
  ): FlowRenderedComponent {
    const root = dom.createElement('div')
    root.className = 'published-flow-component'
    root.dataset.flowComponentId = block.component.packageId
    root.style.position = 'relative'
    root.style.width = '100%'
    root.style.minHeight = '360px'
    const item: ComponentLayerItem = {
      layerItemId: block.id,
      label: block.component.packageId,
      frame: { mode: 'absolute', x: 0, y: 0, width: 760, height: 360 },
      order: 0,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      kind: 'component',
      component: structuredClone(block.component),
      props: structuredClone(block.props),
      staticFallbackAssetId: block.staticFallbackAssetId,
    }
    try {
      const host = this.componentHost(item)
      const controller = new AbortController()
      const record = { host, controller }
      this.#flowHosts.add(record)
      let destroyed = false
      let failed = false
      const services: SurfacePlayerServices = {
        navigate: () => undefined,
        getCourseState: (key) => this.environment.courseState.get(key),
        setCourseState: (key, value) => this.environment.courseState.set(key, value as never),
        resolveAsset: (assetId) => this.environment.payload.assets[assetId]?.url,
        reportDiagnostic: (diagnostic) => this.environment.reportDiagnostic?.(
          diagnostic.surfaceId,
          block.id,
          diagnostic.cause instanceof Error ? diagnostic.cause : new Error(diagnostic.message),
        ),
      }
      const ready = Promise.resolve().then(() => {
        if (destroyed) return
        return host.mount({
          surfaceId,
          sceneId: block.id,
          item,
          container: root,
          services,
          signal: controller.signal,
          mode: 'playback',
          reportHit: () => undefined,
        })
      }).catch((cause: unknown) => {
        if (destroyed) return
        failed = true
        const error = cause instanceof Error ? cause : new Error(String(cause))
        this.environment.reportDiagnostic?.(surfaceId, block.id, error)
        this.#renderFlowFallback(root, block, error)
      })
      const run = (operation: () => void | Promise<void>): void => {
        void ready.then(() => {
          if (!destroyed && !failed) return operation()
        }).catch((cause: unknown) => {
          const error = cause instanceof Error ? cause : new Error(String(cause))
          this.environment.reportDiagnostic?.(surfaceId, block.id, error)
        })
      }
      return {
        node: root,
        activate: () => run(() => host.activate?.()),
        suspend: () => run(() => host.suspend?.()),
        resume: () => run(() => host.resume?.()),
        reset: () => run(() => host.reset?.('surface')),
        destroy: () => {
          if (destroyed) return
          destroyed = true
          controller.abort('flow-component-destroyed')
          this.#flowHosts.delete(record)
          void ready.then(() => host.destroy?.())
        },
      }
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      this.environment.reportDiagnostic?.(surfaceId, block.id, error)
      this.#renderFlowFallback(root, block, error)
      return { node: root }
    }
  }

  dispose(): void {
    for (const { host, controller } of this.#flowHosts) {
      controller.abort('published-course-destroyed')
      void host.destroy?.()
    }
    this.#flowHosts.clear()
    this.#components.dispose()
    this.#surfaceRuntimes.dispose()
    this.#componentDefinitions.clear()
    this.#surfaceRuntimeDefinitions.clear()
  }

  #renderFlowFallback(
    root: HTMLElement,
    block: Extract<FlowBlock, { type: 'component' }>,
    error: Error,
  ): void {
    root.replaceChildren()
    root.dataset.hostError = 'true'
    const fallback = this.environment.payload.assets[block.staticFallbackAssetId]?.url
    if (fallback) {
      const image = root.ownerDocument.createElement('img')
      image.src = fallback
      const componentName = this.environment.payload.components[
        componentKey(block.component.packageId, block.component.version)
      ]?.name
      image.alt = `${componentName || '互动组件'}的静态预览`
      root.appendChild(image)
    }
    const message = root.ownerDocument.createElement('p')
    message.textContent = '互动组件暂时无法运行。'
    root.appendChild(message)
  }
}
