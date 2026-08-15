import { evaluateAssessment } from '../../shared/assessmentEvaluators'
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
  RuntimeCreateContextDom,
  RuntimeDefinition,
  RuntimeInstanceLifecycle,
  RuntimePresentationApi,
} from '../../shared/runtimeTypes'
import type {
  SurfaceRuntimeDefinition,
  SurfaceRuntimeInstanceLifecycle,
  SurfaceRuntimeMode,
} from '../../shared/surfaceRuntimeTypes'
import { ComponentRegistry } from '../ComponentRegistry'
import { CourseEventBus } from '../CourseEventBus'
import { CourseStateStore } from '../CourseStateStore'
import type { DeclarativeCourseState } from '../DeclarativeCourseState'
import { decodePublishedCourseCode } from '../publishedCourse'
import { RuntimeRegistry } from '../RuntimeRegistry'
import type { RuntimeHost } from '../RuntimeHost'
import type { RenderedNodeHandle } from '../renderNode'
import { SurfaceRuntimeAuthoringBridge } from '../SurfaceRuntimeAuthoring'
import { SurfaceRuntimeRegistry } from '../SurfaceRuntimeRegistry'
import type {
  SlideItemHost,
  SlideItemMountContext,
} from './slide/SlideSurfaceHost'
import type { SurfacePlayerServices } from './SurfaceHost'
import type { FlowRenderedComponent } from './flow/FlowSurfaceHost'
import type { LegacyMiniPhaserStage } from './legacyMiniPhaserStage'

async function loadLegacyPhaserSupport() {
  const [runtimeHostModule, renderNodeModule, stageModule] = await Promise.all([
    import('../RuntimeHost'),
    import('../renderNode'),
    import('./legacyMiniPhaserStage'),
  ])
  return {
    RuntimeHost: runtimeHostModule.RuntimeHost,
    renderNode: renderNodeModule.renderNode,
    LegacyMiniPhaserStage: stageModule.LegacyMiniPhaserStage,
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
  #stage: LegacyMiniPhaserStage | null = null
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
    const { LegacyMiniPhaserStage, renderNode } = await loadLegacyPhaserSupport()
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
    const stage = new LegacyMiniPhaserStage(
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

class PublishedDomRuntimeHost implements SlideItemHost<RuntimeLayerItem> {
  #instance: RuntimeInstanceLifecycle | null = null
  #localState = new CourseStateStore()

  constructor(
    private readonly definition: RuntimeDefinition,
    private readonly environment: PublishedDynamicHostEnvironment,
  ) {}

  mount(context: SlideItemMountContext<RuntimeLayerItem>): void {
    const runtime = context.item.runtime
    if (runtime.protocol !== 'legacy-runtime-v2' || runtime.runtimeApiVersion !== 2) {
      throw new Error(`Runtime ${context.item.layerItemId} uses an unsupported published protocol`)
    }
    if (runtime.renderMode !== 'dom') {
      throw new Error(`Runtime ${context.item.layerItemId} requires ${runtime.renderMode}; DOM item host cannot execute it`)
    }
    const underlay = context.container.ownerDocument.createElement('div')
    const overlay = context.container.ownerDocument.createElement('div')
    underlay.className = 'published-runtime-underlay'
    overlay.className = 'published-runtime-overlay'
    for (const root of [underlay, overlay]) {
      root.style.position = 'absolute'
      root.style.inset = '0'
      context.container.appendChild(root)
    }
    const createContext: RuntimeCreateContextDom = {
      runtimeApiVersion: 2,
      renderMode: 'dom',
      scope: 'scene',
      mode: 'preview',
      sceneId: context.sceneId,
      width: context.item.frame.width,
      height: context.item.frame.height,
      content: {
        get: (key) => {
          const value = runtime.content.values[key]
          if (value === undefined) throw new Error(`Unknown Runtime content key ${key}`)
          return value
        },
        all: () => Object.freeze({ ...runtime.content.values }),
      },
      assets: {
        url: (bindingKey) => {
          const assetId = runtime.assets[bindingKey]?.assetId
          return assetId ? this.environment.payload.assets[assetId]?.url ?? '' : ''
        },
        projectUrl: (assetId) => this.environment.payload.assets[assetId]?.url ?? '',
      },
      presentation: presentationPort(context.surfaceId, this.environment.navigation),
      actions: actionPort(this.environment.navigation),
      events: this.environment.events,
      localState: this.#localState,
      courseState: courseStatePort(this.environment.courseState),
      capture: { waitUntil: () => undefined },
      navigation: { guard: () => () => undefined },
      assessment: { evaluate: evaluateAssessment },
      evidence: { recordAction: () => undefined },
      emit: (eventName, payload) => this.environment.events.emit(eventName, payload),
      domRoot: overlay,
      dom: { root: overlay, underlay, overlay },
    }
    this.#instance = this.definition.create(createContext)
    if (!this.#instance || typeof this.#instance.destroy !== 'function') {
      throw new Error(`Runtime ${context.item.layerItemId} returned an invalid lifecycle`)
    }
  }

  update(item: RuntimeLayerItem): void { this.#instance?.resize?.(item.frame.width, item.frame.height) }
  activate(): void { this.#instance?.setVisible?.(true); this.#instance?.resume?.() }
  suspend(): void { this.#instance?.suspend?.(); this.#instance?.setVisible?.(false) }
  resume(): void { this.activate() }
  reset(): void { this.#localState.clear() }
  async capture(): Promise<void> { await this.#instance?.prepareCapture?.() }
  destroy(): void { this.#instance?.destroy(); this.#instance = null; this.#localState.clear() }
}

class PublishedPhaserRuntimeHost implements SlideItemHost<RuntimeLayerItem> {
  #stage: LegacyMiniPhaserStage | null = null
  #host: RuntimeHost | null = null
  #item: RuntimeLayerItem
  #context: SlideItemMountContext<RuntimeLayerItem> | null = null
  #active = false
  #mode: 'playback' | 'inspect' = 'playback'

  constructor(
    item: RuntimeLayerItem,
    private readonly registry: RuntimeRegistry,
    private readonly environment: PublishedDynamicHostEnvironment,
  ) { this.#item = structuredClone(item) }

  async mount(context: SlideItemMountContext<RuntimeLayerItem>): Promise<void> {
    this.#context = context
    this.#mode = context.mode
    await this.#mountCurrent(context)
  }

  async #mountCurrent(context: SlideItemMountContext<RuntimeLayerItem>): Promise<void> {
    const { LegacyMiniPhaserStage, RuntimeHost } = await loadLegacyPhaserSupport()
    const runtime = this.#item.runtime
    if (runtime.protocol !== 'legacy-runtime-v2' || runtime.runtimeApiVersion !== 2) {
      throw new Error(`Runtime ${this.#item.layerItemId} uses an unsupported published protocol`)
    }
    if (runtime.renderMode === 'dom') throw new Error(`Runtime ${this.#item.layerItemId} does not require Phaser`)
    const stage = new LegacyMiniPhaserStage(
      context.container,
      this.#item.frame.width,
      this.#item.frame.height,
      context.signal,
    )
    this.#stage = stage
    const roots = await stage.ready
    if (context.signal.aborted) return
    this.#host = new RuntimeHost({
      registry: this.registry,
      runtime: {
        runtimeApiVersion: 2,
        enabled: runtime.enabled,
        renderMode: runtime.renderMode,
        source: runtime.source,
        content: structuredClone(runtime.content),
        assets: structuredClone(runtime.assets),
        ...(runtime.nodeBindings ? { nodeBindings: structuredClone(runtime.nodeBindings) } : {}),
      },
      label: this.#item.label,
      scope: 'scene',
      mode: 'preview',
      sceneId: context.sceneId,
      width: this.#item.frame.width,
      height: this.#item.frame.height,
      environment: {
        phaser: { scene: roots.scene, underlay: roots.underlay, overlay: roots.overlay },
        dom: roots.dom,
        resolveNode: (nodeId) => stage.resolveSiblingNode(nodeId),
        presentation: presentationPort(context.surfaceId, this.environment.navigation),
      },
      actions: actionPort(this.environment.navigation),
      events: this.environment.events,
      courseState: courseStatePort(this.environment.courseState),
      assetUrl: (assetId) => this.environment.payload.assets[assetId]?.url ?? '',
      registerNavigationGuard: () => () => undefined,
    })
    stage.syncSiblingNodes()
    stage.setInteractive(this.#mode === 'playback')
    if (!this.#active || this.#mode === 'inspect') {
      this.#host.suspend()
      stage.setPaused(true)
    }
  }

  async update(item: RuntimeLayerItem): Promise<void> {
    const mustRemount = item.runtime.source !== this.#item.runtime.source ||
      item.runtime.renderMode !== this.#item.runtime.renderMode ||
      item.runtime.enabled !== this.#item.runtime.enabled ||
      JSON.stringify(item.runtime.content) !== JSON.stringify(this.#item.runtime.content) ||
      JSON.stringify(item.runtime.assets) !== JSON.stringify(this.#item.runtime.assets) ||
      JSON.stringify(item.runtime.nodeBindings) !== JSON.stringify(this.#item.runtime.nodeBindings)
    this.#item = structuredClone(item)
    if (this.#context) this.#context = { ...this.#context, item }
    if (mustRemount && this.#context) {
      this.#cleanup()
      this.#context.container.replaceChildren()
      await this.#mountCurrent(this.#context)
      return
    }
    this.#stage?.resize(item.frame.width, item.frame.height)
    this.#host?.resize(item.frame.width, item.frame.height)
  }

  activate(): void {
    this.#active = true
    this.#host?.setVisible(true)
    this.#stage?.setVisible(true)
    if (this.#mode === 'inspect') {
      this.#host?.suspend()
      this.#stage?.setPaused(true)
    } else {
      this.#host?.resume()
      this.#stage?.setPaused(false)
    }
  }
  suspend(): void {
    this.#active = false
    this.#host?.suspend()
    this.#host?.setVisible(false)
    this.#stage?.setPaused(true)
    this.#stage?.setVisible(false)
  }
  resume(): void { this.activate() }
  reset(): void {}
  setInspectionMode(mode: 'playback' | 'inspect'): void {
    this.#mode = mode
    this.#stage?.setInteractive(mode === 'playback')
    if (mode === 'inspect') {
      this.#host?.suspend()
      this.#stage?.setPaused(true)
    } else if (this.#active) {
      this.#host?.resume()
      this.#stage?.setPaused(false)
    }
  }
  async capture(): Promise<{ format: 'html'; content: string } | void> {
    await this.#host?.waitForCaptureReady()
    if (this.#stage) return { format: 'html', content: this.#stage.captureHtml() }
  }
  destroy(): void {
    this.#cleanup()
    this.#context = null
    this.#active = false
  }
  #cleanup(): void {
    this.#host?.destroy()
    this.#host = null
    this.#stage?.destroy()
    this.#stage = null
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
  readonly #runtimes = new RuntimeRegistry()
  readonly #surfaceRuntimes = new SurfaceRuntimeRegistry()
  readonly #componentDefinitions = new Map<string, ComponentDefinitionV4>()
  readonly #runtimeDefinitions = new Map<string, RuntimeDefinition>()
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
        { expectedVersion: component.version },
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
    if (item.runtime.runtimeApiVersion !== 2 || item.runtime.protocol !== 'legacy-runtime-v2') {
      throw new Error(`Runtime ${item.layerItemId} has no installed ${item.runtime.protocol} executor`)
    }
    if (item.runtime.renderMode !== 'dom') {
      return new PublishedPhaserRuntimeHost(item, this.#runtimes, this.environment)
    }
    let definition = this.#runtimeDefinitions.get(item.layerItemId)
    if (!definition) {
      definition = this.#runtimes.executeRuntime(item.runtime.source, item.layerItemId, 2)
      this.#runtimeDefinitions.set(item.layerItemId, definition)
    }
    return new PublishedDomRuntimeHost(definition, this.environment)
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
    this.#runtimes.dispose()
    this.#surfaceRuntimes.dispose()
    this.#componentDefinitions.clear()
    this.#runtimeDefinitions.clear()
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
      image.alt = `互动组件 ${block.component.packageId} 的静态后备`
      root.appendChild(image)
    }
    const message = root.ownerDocument.createElement('p')
    message.textContent = `互动组件无法运行：${error.message}`
    root.appendChild(message)
  }
}
