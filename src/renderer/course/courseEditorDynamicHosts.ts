import { evaluateAssessment } from '../../shared/assessmentEvaluators'
import type {
  ComponentAuthoringTarget,
  ComponentCreateContextV4Dom,
  ComponentDefinitionV4,
  ComponentInstanceLifecycle,
  ComponentPackageData,
} from '../../shared/componentTypes'
import type { ExportPayload } from '../../shared/componentTypes'
import type { ComponentLayerItem, FlowBlock, RuntimeLayerItem } from '../../shared/courseProjectTypes'
import type { ExternalComponentNode } from '../../shared/projectTypes'
import type {
  CourseStateStore as CourseStateStoreContract,
  RuntimeCreateContextDom,
  RuntimeDefinition,
  RuntimeInstanceLifecycle,
  RuntimePresentationApi,
} from '../../shared/runtimeTypes'
import { ComponentAuthoringTargetRegistry } from '../../player/ComponentAuthoringTargetRegistry'
import { ComponentRegistry } from '../../player/ComponentRegistry'
import { CourseEventBus } from '../../player/CourseEventBus'
import { CourseStateStore } from '../../player/CourseStateStore'
import type { DeclarativeCourseState } from '../../player/DeclarativeCourseState'
import { RuntimeAuthoringTargetRegistry } from '../../player/RuntimeAuthoringTargetRegistry'
import { RuntimeRegistry } from '../../player/RuntimeRegistry'
import type { RuntimeHost } from '../../player/RuntimeHost'
import type { RenderedNodeHandle } from '../../player/renderNode'
import type { LegacyMiniPhaserStage } from '../../player/surfaces/legacyMiniPhaserStage'
import { SurfaceRuntimeAuthoringBridge } from '../../player/SurfaceRuntimeAuthoring'
import { SurfaceRuntimeRegistry } from '../../player/SurfaceRuntimeRegistry'
import type {
  SurfaceRuntimeDefinition,
  SurfaceRuntimeInstanceLifecycle,
  SurfaceRuntimeMode,
} from '../../shared/surfaceRuntimeTypes'
import type {
  SlideItemHost,
  SlideItemMountContext,
} from '../../player/surfaces/slide/SlideSurfaceHost'

async function loadLegacyPhaserSupport() {
  const [runtimeHostModule, renderNodeModule, stageModule] = await Promise.all([
    import('../../player/RuntimeHost'),
    import('../../player/renderNode'),
    import('../../player/surfaces/legacyMiniPhaserStage'),
  ])
  return {
    RuntimeHost: runtimeHostModule.RuntimeHost,
    renderNode: renderNodeModule.renderNode,
    LegacyMiniPhaserStage: stageModule.LegacyMiniPhaserStage,
  }
}
import type { FlowRenderedComponent } from '../../player/surfaces/flow/FlowSurfaceHost'
import type { SurfacePlayerServices } from '../../player/surfaces/SurfaceHost'

export interface CourseEditorDynamicNavigation {
  goToScene(sceneId: string, stateId?: string, entryPoint?: 'runtime' | 'component' | 'teacher-controller'): boolean
  next(entryPoint?: 'runtime' | 'component' | 'teacher-controller'): boolean
  previous(entryPoint?: 'runtime' | 'component' | 'teacher-controller'): boolean
  replay(): boolean
  restart(): boolean
  setPresentationState(surfaceId: string, stateId: string): boolean
  presentationState(surfaceId: string): {
    current: string | null
    states: Array<{ id: string; name: string; description?: string }>
  }
}

export interface CourseEditorDynamicEnvironment {
  courseState: DeclarativeCourseState
  events: CourseEventBus
  navigation: CourseEditorDynamicNavigation
  resolveProjectAsset(assetId: string): string | undefined
  resolveComponent(packageId: string, version: string): ComponentPackageData | undefined
  reportDiagnostic?(surfaceId: string, itemId: string, error: Error): void
}

function pointerEscape(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** Component API dot-path -> V9 inventory field. */
export function componentPropKeyToInventoryField(key: string): string {
  const parts = key.split('.')
  if (parts.length === 0 || parts.some((part) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) {
    throw new Error(`不安全的组件属性路径：${key}`)
  }
  return ['props', ...parts].map(pointerEscape).join('/')
}

function courseStatePort(state: DeclarativeCourseState): CourseStateStoreContract {
  return {
    get: <T>(key: string) => state.get(key) as T | undefined,
    set: (key, value) => state.set(key, value as never),
    delete: (key) => state.delete(key),
    clear: () => Object.keys(state.snapshot()).forEach((key) => state.delete(key)),
    snapshot: () => state.snapshot(),
  }
}

function actionPort(navigation: CourseEditorDynamicNavigation, source: 'runtime' | 'component') {
  return Object.freeze({
    goToScene: (sceneId: string, stateId?: string) => navigation.goToScene(sceneId, stateId, source),
    nextScene: () => navigation.next(source),
    previousScene: () => navigation.previous(source),
    replayScene: () => navigation.replay(),
    restartCourse: () => navigation.restart(),
  })
}

function presentationPort(
  surfaceId: string,
  navigation: CourseEditorDynamicNavigation,
): RuntimePresentationApi {
  return {
    current: () => navigation.presentationState(surfaceId).current,
    states: () => navigation.presentationState(surfaceId).states,
    setState: (stateId) => navigation.setPresentationState(surfaceId, stateId),
    transitionTo: (stateId) => navigation.setPresentationState(surfaceId, stateId),
  }
}

function mimeFromPath(path: string): string {
  const extension = path.split('.').at(-1)?.toLocaleLowerCase('en-US')
  return ({
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm',
  } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream'
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

class TargetOverlay {
  readonly root: HTMLDivElement
  #mode: 'playback' | 'inspect'

  constructor(
    container: HTMLElement,
    mode: 'playback' | 'inspect',
    private readonly reportHit: SlideItemMountContext['reportHit'],
    private readonly mapField: (key: string) => string = componentPropKeyToInventoryField,
  ) {
    this.#mode = mode
    this.root = container.ownerDocument.createElement('div')
    this.root.className = 'course-dynamic-authoring-targets'
    Object.assign(this.root.style, {
      position: 'absolute', inset: '0', zIndex: '2147483647', pointerEvents: 'none',
    })
    container.appendChild(this.root)
  }

  setMode(mode: 'playback' | 'inspect'): void {
    this.#mode = mode
    this.root.querySelectorAll<HTMLElement>('[data-dynamic-hit-id]').forEach((element) => {
      element.style.pointerEvents = mode === 'inspect' ? 'auto' : 'none'
    })
  }

  render(targets: readonly ComponentAuthoringTarget[]): void {
    this.root.replaceChildren(...targets.map((target) => {
      const element = this.root.ownerDocument.createElement('div')
      element.dataset.dynamicHitId = target.targetId
      element.dataset.dynamicField = this.mapField(target.key)
      element.ariaLabel = target.label
      Object.assign(element.style, {
        position: 'absolute',
        left: `${target.bounds.x}px`, top: `${target.bounds.y}px`,
        width: `${target.bounds.width}px`, height: `${target.bounds.height}px`,
        pointerEvents: this.#mode === 'inspect' ? 'auto' : 'none',
        cursor: target.kind === 'component-asset' ? 'pointer' : 'text',
        outline: this.#mode === 'inspect' ? '1px dashed rgba(37,99,235,.38)' : 'none',
      })
      const report = (event: Event) => {
        if (this.#mode !== 'inspect') return
        event.stopPropagation()
        this.reportHit({
          field: element.dataset.dynamicField,
          hitId: target.targetId,
          targetKind: target.kind === 'component-asset' ? 'asset' : 'text',
        })
      }
      element.addEventListener('pointerdown', report)
      element.addEventListener('dblclick', report)
      return element
    }))
  }

  destroy(): void { this.root.remove() }
}

type CheckpointLifecycle = Pick<
  ComponentInstanceLifecycle,
  'exportAuthoringCheckpoint' | 'restoreAuthoringCheckpoint'
>

function cloneFiniteJsonCheckpoint(value: unknown): unknown {
  const seen = new WeakSet<object>()
  const visit = (candidate: unknown): void => {
    if (candidate === null || typeof candidate === 'string' || typeof candidate === 'boolean') return
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return
    if (typeof candidate !== 'object') throw new TypeError('检查点只能包含有限 JSON 值')
    if (seen.has(candidate)) throw new TypeError('检查点不能包含循环引用')
    seen.add(candidate)
    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }
    if (Object.getPrototypeOf(candidate) !== Object.prototype && Object.getPrototypeOf(candidate) !== null) {
      throw new TypeError('检查点只能包含普通对象')
    }
    Object.values(candidate as Record<string, unknown>).forEach(visit)
  }
  visit(value)
  return structuredClone(value)
}

function exportCheckpoint(instance: CheckpointLifecycle | null): { available: boolean; value?: unknown } {
  if (!instance?.exportAuthoringCheckpoint) return { available: false }
  return { available: true, value: cloneFiniteJsonCheckpoint(instance.exportAuthoringCheckpoint()) }
}

interface LoadedComponentDefinition {
  definition: ComponentDefinitionV4
  pkg: ComponentPackageData
}

class EditorComponentHost implements SlideItemHost<ComponentLayerItem> {
  #instance: ComponentInstanceLifecycle | null = null
  #phaserHandle: RenderedNodeHandle | null = null
  #phaserStage: LegacyMiniPhaserStage | null = null
  #authoring: ComponentAuthoringTargetRegistry | null = null
  #overlay: TargetOverlay | null = null
  #item: ComponentLayerItem
  #mode: 'playback' | 'inspect' = 'playback'
  #active = false
  #assetUrls: string[] = []
  #capturePromises: Promise<unknown>[] = []
  #context: SlideItemMountContext<ComponentLayerItem> | null = null
  #definition: ComponentDefinitionV4
  #pkg: ComponentPackageData

  constructor(
    item: ComponentLayerItem,
    loaded: LoadedComponentDefinition,
    private readonly load: (item: ComponentLayerItem) => LoadedComponentDefinition,
    private readonly componentRegistry: ComponentRegistry,
    private readonly environment: CourseEditorDynamicEnvironment,
  ) {
    this.#item = structuredClone(item)
    this.#definition = loaded.definition
    this.#pkg = loaded.pkg
  }

  async mount(context: SlideItemMountContext<ComponentLayerItem>): Promise<void> {
    this.#context = context
    this.#mode = context.mode
    await this.#mountCurrent()
  }

  async #mountCurrent(checkpoint?: { available: boolean; value?: unknown }): Promise<void> {
    const context = this.#context
    if (!context) throw new Error('Component host is not mounted')
    if (this.#pkg.manifest.renderMode !== 'dom') {
      await this.#mountPhaserComponent(context)
      return
    }
    this.#overlay = new TargetOverlay(context.container, this.#mode, context.reportHit)
    this.#authoring = new ComponentAuthoringTargetRegistry({
      manifest: this.#pkg.manifest,
      node: componentNode(this.#item),
      scope: 'scene',
      sceneId: context.sceneId,
      domRoot: context.container,
      onTargetsChanged: (update) => this.#overlay?.render(update.targets),
    })
    const componentAssets = new Map<string, string>()
    for (const [key, path] of Object.entries(this.#pkg.manifest.assets)) {
      const bytes = this.#pkg.files[path]
      if (!bytes) continue
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mimeFromPath(path) }))
      this.#assetUrls.push(url)
      componentAssets.set(key, url)
    }
    const createContext: ComponentCreateContextV4Dom = {
      runtimeApiVersion: 4,
      renderMode: 'dom',
      instanceId: `${context.surfaceId}:${context.sceneId}:${this.#item.layerItemId}`,
      width: this.#item.frame.width,
      height: this.#item.frame.height,
      mode: this.#mode === 'inspect' ? 'edit' : 'preview',
      props: structuredClone(this.#item.props),
      editorState: {},
      editor: this.#authoring,
      actions: actionPort(this.environment.navigation, 'component'),
      scope: 'scene',
      events: this.environment.events,
      courseState: courseStatePort(this.environment.courseState),
      presentation: presentationPort(context.surfaceId, this.environment.navigation),
      capture: { waitUntil: (promise) => this.#capturePromises.push(Promise.resolve(promise)) },
      assetUrl: (key) => componentAssets.get(key) ?? '',
      projectAssetUrl: (assetId) => this.environment.resolveProjectAsset(assetId) ?? '',
      emit: (eventName, payload) => this.environment.events.emit(eventName, payload),
      dom: { root: context.container },
    }
    this.#instance = this.#definition.create(createContext)
    if (!this.#instance || typeof this.#instance.destroy !== 'function') throw new Error(`组件 ${this.#pkg.manifest.id} 返回了无效生命周期`)
    if (checkpoint?.available) {
      if (this.#instance.restoreAuthoringCheckpoint) {
        this.#instance.restoreAuthoringCheckpoint(cloneFiniteJsonCheckpoint(checkpoint.value))
      } else {
        this.#reportSavedStateFallback('新组件未实现 restoreAuthoringCheckpoint')
      }
    }
    this.#authoring.invalidate()
    if (this.#mode === 'inspect') this.#instance.suspend?.()
    else if (this.#active) this.#instance.resume?.()
  }

  async update(item: ComponentLayerItem): Promise<void> {
    const nextLoaded = this.load(item)
    const identityChanged = item.component.packageId !== this.#item.component.packageId ||
      item.component.version !== this.#item.component.version ||
      nextLoaded.pkg.runtimeSource !== this.#pkg.runtimeSource ||
      nextLoaded.pkg.contentSha256 !== this.#pkg.contentSha256
    let checkpoint: { available: boolean; value?: unknown } = { available: false }
    if (identityChanged) {
      try { checkpoint = exportCheckpoint(this.#instance) } catch (cause) {
        this.#reportSavedStateFallback(`检查点无效：${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    this.#item = structuredClone(item)
    if (identityChanged) {
      this.#cleanupInstance()
      this.#context?.container.replaceChildren()
      this.#definition = nextLoaded.definition
      this.#pkg = nextLoaded.pkg
      if (!checkpoint.available) this.#reportSavedStateFallback('旧组件未实现有效的 exportAuthoringCheckpoint')
      await this.#mountCurrent(checkpoint)
      return
    }
    if (this.#phaserHandle) {
      this.#phaserStage?.resize(item.frame.width, item.frame.height)
      this.#phaserHandle.update(componentNode(item))
      return
    }
    this.#instance?.updateProps?.(structuredClone(item.props))
    this.#instance?.resize?.(item.frame.width, item.frame.height)
    this.#authoring?.update(componentNode(item))
  }
  activate(): void {
    this.#active = true
    this.#instance?.setVisible?.(true)
    this.#phaserHandle?.setHostVisible?.(true)
    this.#phaserStage?.setVisible(true)
    if (this.#mode === 'inspect') {
      this.#instance?.suspend?.()
      this.#phaserHandle?.suspend?.()
      this.#phaserStage?.setPaused(true)
    } else {
      this.#instance?.resume?.()
      this.#phaserHandle?.resume?.()
      this.#phaserStage?.setPaused(false)
    }
  }
  suspend(): void {
    this.#active = false
    this.#instance?.suspend?.()
    this.#instance?.setVisible?.(false)
    this.#phaserHandle?.suspend?.()
    this.#phaserHandle?.setHostVisible?.(false)
    this.#phaserStage?.setPaused(true)
    this.#phaserStage?.setVisible(false)
  }
  resume(): void { this.activate() }
  setInspectionMode(mode: 'playback' | 'inspect'): void {
    this.#mode = mode
    this.#overlay?.setMode(mode)
    this.#instance?.setMode?.(mode === 'inspect' ? 'edit' : 'preview')
    this.#phaserHandle?.setInspectionMode?.(mode === 'inspect')
    this.#phaserStage?.setInteractive(mode === 'playback')
    if (mode === 'inspect') this.#instance?.suspend?.()
    if (mode === 'inspect') this.#phaserHandle?.suspend?.()
    if (mode === 'inspect') this.#phaserStage?.setPaused(true)
    else if (this.#active) {
      this.#instance?.resume?.()
      this.#phaserHandle?.resume?.()
      this.#phaserStage?.setPaused(false)
    }
    this.#authoring?.invalidate()
  }
  reset(): void {
    this.#instance?.updateProps?.(structuredClone(this.#item.props))
    this.#phaserHandle?.update(componentNode(this.#item))
  }
  async capture(): Promise<{ format: 'html'; content: string } | void> {
    await this.#instance?.prepareCapture?.()
    await this.#phaserHandle?.prepareCapture?.()
    await Promise.all(this.#capturePromises.splice(0))
    if (this.#phaserStage) return { format: 'html', content: this.#phaserStage.captureHtml() }
  }
  #reportSavedStateFallback(reason: string): void {
    const context = this.#context
    if (context) this.environment.reportDiagnostic?.(
      context.surfaceId,
      this.#item.layerItemId,
      new Error(`组件必须重新挂载；${reason}，已明确回到工程保存态。`),
    )
  }
  #cleanupInstance(): void {
    this.#instance?.destroy(); this.#instance = null
    this.#phaserHandle?.destroy(); this.#phaserHandle = null
    this.#phaserStage?.destroy(); this.#phaserStage = null
    this.#authoring?.destroy(); this.#authoring = null
    this.#overlay?.destroy(); this.#overlay = null
    this.#capturePromises.length = 0
    this.#assetUrls.splice(0).forEach((url) => URL.revokeObjectURL(url))
  }
  destroy(): void { this.#cleanupInstance(); this.#context = null }

  async #mountPhaserComponent(context: SlideItemMountContext<ComponentLayerItem>): Promise<void> {
    const { LegacyMiniPhaserStage, renderNode } = await loadLegacyPhaserSupport()
    this.#overlay = new TargetOverlay(context.container, this.#mode, context.reportHit)
    const componentAssets: Record<string, { mimeType: string; dataUrl: string }> = {}
    for (const [key, path] of Object.entries(this.#pkg.manifest.assets)) {
      const bytes = this.#pkg.files[path]
      if (!bytes) continue
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mimeFromPath(path) }))
      this.#assetUrls.push(url)
      componentAssets[key] = { mimeType: mimeFromPath(path), dataUrl: url }
    }
    const projectAssets = new Proxy<Record<string, { mimeType: string; dataUrl: string }>>({}, {
      get: (_target, property) => {
        if (typeof property !== 'string') return undefined
        const url = this.environment.resolveProjectAsset(property)
        return url ? { mimeType: 'application/octet-stream', dataUrl: url } : undefined
      },
    })
    const payload: ExportPayload = {
      project: {} as ExportPayload['project'],
      assets: projectAssets,
      components: {
        [`${this.#pkg.manifest.id}@${this.#pkg.manifest.version}`]: {
          manifest: this.#pkg.manifest,
          runtimeSource: this.#pkg.runtimeSource,
          assets: componentAssets,
        },
      },
    }
    const stage = new LegacyMiniPhaserStage(
      context.container,
      this.#item.frame.width,
      this.#item.frame.height,
      context.signal,
    )
    this.#phaserStage = stage
    const roots = await stage.ready
    if (context.signal.aborted) return
    this.#phaserHandle = renderNode(roots.scene, componentNode(this.#item), 0, {
      payload,
      registry: this.componentRegistry,
      actions: actionPort(this.environment.navigation, 'component'),
      scope: 'scene',
      parentRoot: roots.content,
      events: this.environment.events,
      courseState: courseStatePort(this.environment.courseState),
      presentation: presentationPort(context.surfaceId, this.environment.navigation),
      mode: 'preview',
      authoring: this.#mode === 'inspect',
      onComponentAuthoringTargetsChanged: (update) => this.#overlay?.render(update.targets),
      sceneId: context.sceneId,
      textureKey: (assetId) => assetId,
    })
    this.#phaserHandle.setInspectionMode?.(this.#mode === 'inspect')
    stage.setInteractive(this.#mode === 'playback')
    if (!this.#active || this.#mode === 'inspect') {
      this.#phaserHandle.suspend?.()
      stage.setPaused(true)
    }
  }
}

class EditorSurfaceRuntimeHost implements SlideItemHost<RuntimeLayerItem> {
  #instance: SurfaceRuntimeInstanceLifecycle | null = null
  #authoring: SurfaceRuntimeAuthoringBridge | null = null
  #item: RuntimeLayerItem
  #mode: SurfaceRuntimeMode = 'playback'
  #active = false
  #capturePromises: Promise<unknown>[] = []
  #context: SlideItemMountContext<RuntimeLayerItem> | null = null
  #definition: SurfaceRuntimeDefinition
  constructor(
    item: RuntimeLayerItem,
    definition: SurfaceRuntimeDefinition,
    private readonly load: (item: RuntimeLayerItem) => SurfaceRuntimeDefinition,
    private readonly environment: CourseEditorDynamicEnvironment,
  ) { this.#item = structuredClone(item); this.#definition = definition }
  mount(context: SlideItemMountContext<RuntimeLayerItem>): void {
    this.#context = context
    this.#mode = context.mode
    this.#mountCurrent()
  }
  #mountCurrent(checkpoint?: { available: boolean; value?: unknown }): void {
    const context = this.#context
    if (!context) throw new Error('Surface Runtime host is not mounted')
    this.#authoring = new SurfaceRuntimeAuthoringBridge({
      root: context.container,
      contentKeys: () => Object.keys(this.#item.runtime.content.values),
      assetKeys: () => Object.keys(this.#item.runtime.assets),
      reportHit: context.reportHit,
    }, this.#mode)
    this.#instance = this.#definition.create({
      runtimeApiVersion: 3, mode: this.#mode,
      width: this.#item.frame.width, height: this.#item.frame.height,
      content: { get: (key) => { const value = this.#item.runtime.content.values[key]; if (value === undefined) throw new Error(`Unknown content key ${key}`); return value }, all: () => Object.freeze({ ...this.#item.runtime.content.values }) },
      assets: { url: (key) => { const id = this.#item.runtime.assets[key]?.assetId; return id ? this.environment.resolveProjectAsset(id) ?? '' : '' }, projectUrl: (id) => this.environment.resolveProjectAsset(id) ?? '' },
      courseState: courseStatePort(this.environment.courseState),
      presentation: presentationPort(context.surfaceId, this.environment.navigation),
      actions: actionPort(this.environment.navigation, 'runtime'),
      events: this.environment.events,
      capture: { waitUntil: (promise) => this.#capturePromises.push(Promise.resolve(promise)) },
      dom: { root: context.container }, authoring: this.#authoring,
      emit: (name, payload) => this.environment.events.emit(name, payload),
    })
    if (!this.#instance || typeof this.#instance.destroy !== 'function') throw new Error(`Surface Runtime ${this.#item.layerItemId} 返回无效生命周期`)
    if (checkpoint?.available) {
      if (this.#instance.restoreAuthoringCheckpoint) {
        this.#instance.restoreAuthoringCheckpoint(cloneFiniteJsonCheckpoint(checkpoint.value))
      } else {
        this.#reportSavedStateFallback('新 Runtime 未实现 restoreAuthoringCheckpoint')
      }
    }
    this.#authoring.invalidate()
    if (this.#mode === 'inspect') this.#instance.suspend?.()
    else if (this.#active) this.#instance.resume?.()
  }
  update(item: RuntimeLayerItem): void {
    const executableChanged = item.runtime.protocol !== this.#item.runtime.protocol ||
      item.runtime.runtimeApiVersion !== this.#item.runtime.runtimeApiVersion ||
      item.runtime.source !== this.#item.runtime.source
    let checkpoint: { available: boolean; value?: unknown } = { available: false }
    if (executableChanged) {
      try { checkpoint = exportCheckpoint(this.#instance) } catch (cause) {
        this.#reportSavedStateFallback(`检查点无效：${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
    this.#item = structuredClone(item)
    if (executableChanged) {
      this.#cleanupInstance()
      this.#context?.container.replaceChildren()
      this.#definition = this.load(item)
      if (!checkpoint.available) this.#reportSavedStateFallback('旧 Runtime 未实现有效的 exportAuthoringCheckpoint')
      this.#mountCurrent(checkpoint)
      return
    }
    this.#instance?.updateContent?.(structuredClone(item.runtime.content.values))
    this.#instance?.updateAssets?.(structuredClone(item.runtime.assets))
    this.#instance?.resize?.(item.frame.width, item.frame.height)
    this.#authoring?.invalidate()
  }
  activate(): void { this.#active = true; this.#instance?.setVisible?.(true); this.#mode === 'inspect' ? this.#instance?.suspend?.() : this.#instance?.resume?.() }
  suspend(): void { this.#active = false; this.#instance?.suspend?.(); this.#instance?.setVisible?.(false) }
  resume(): void { this.activate() }
  setInspectionMode(mode: 'playback' | 'inspect'): void { this.#mode = mode; this.#authoring?.setMode(mode); this.#instance?.setMode?.(mode); mode === 'inspect' ? this.#instance?.suspend?.() : this.#active && this.#instance?.resume?.() }
  async capture(): Promise<void> { const mode = this.#mode; this.#instance?.setMode?.('capture'); await this.#instance?.prepareCapture?.(); await Promise.all(this.#capturePromises.splice(0)); this.#instance?.setMode?.(mode) }
  reset(): void {}
  #reportSavedStateFallback(reason: string): void {
    const context = this.#context
    if (context) this.environment.reportDiagnostic?.(
      context.surfaceId,
      this.#item.layerItemId,
      new Error(`Runtime 必须重新挂载；${reason}，已明确回到工程保存态。`),
    )
  }
  #cleanupInstance(): void {
    this.#instance?.destroy(); this.#instance = null
    this.#authoring?.destroy(); this.#authoring = null
    this.#capturePromises.length = 0
  }
  destroy(): void { this.#cleanupInstance(); this.#context = null }
}

class EditorLegacyRuntimeHost implements SlideItemHost<RuntimeLayerItem> {
  #instance: RuntimeInstanceLifecycle | null = null
  #runtimeHost: RuntimeHost | null = null
  #phaserStage: LegacyMiniPhaserStage | null = null
  #authoring: RuntimeAuthoringTargetRegistry | null = null
  #overlay: TargetOverlay | null = null
  #item: RuntimeLayerItem
  #mode: 'playback' | 'inspect' = 'playback'
  #active = false
  #context: SlideItemMountContext<RuntimeLayerItem> | null = null
  readonly #localState = new CourseStateStore()
  constructor(
    item: RuntimeLayerItem,
    private readonly definition: RuntimeDefinition,
    private readonly registry: RuntimeRegistry,
    private readonly environment: CourseEditorDynamicEnvironment,
  ) { this.#item = structuredClone(item) }
  async mount(context: SlideItemMountContext<RuntimeLayerItem>): Promise<void> {
    this.#context = context
    if (this.#item.runtime.renderMode !== 'dom') {
      await this.#mountPhaserRuntime(context)
      return
    }
    this.#mode = context.mode
    const underlay = context.container.ownerDocument.createElement('div')
    const overlay = context.container.ownerDocument.createElement('div')
    ;[underlay, overlay].forEach((root) => { Object.assign(root.style, { position: 'absolute', inset: '0' }); context.container.appendChild(root) })
    this.#overlay = new TargetOverlay(context.container, this.#mode, context.reportHit, (field) => field)
    this.#authoring = new RuntimeAuthoringTargetRegistry({
      scope: 'scene', sceneId: context.sceneId,
      width: this.#item.frame.width, height: this.#item.frame.height,
      content: this.#item.runtime.content, assets: this.#item.runtime.assets,
      domRoots: { underlay, overlay },
      onTargetsChanged: (update) => this.#overlay?.render(update.targets.map((target): ComponentAuthoringTarget => ({
        kind: target.kind === 'text' ? 'component-text' : 'component-asset',
        targetId: target.targetId, scope: 'scene', sceneId: context.sceneId,
        nodeId: this.#item.layerItemId, componentId: 'legacy-runtime',
        key: target.kind === 'text' ? `runtime/content/values/${pointerEscape(target.key)}` : `runtime/assets/${pointerEscape(target.key)}/assetId`,
        label: target.label ?? target.key, source: target.source,
        bounds: {
          x: target.bounds.x * this.#item.frame.width / 1280,
          y: target.bounds.y * this.#item.frame.height / 720,
          width: target.bounds.width * this.#item.frame.width / 1280,
          height: target.bounds.height * this.#item.frame.height / 720,
        }, rotation: 0,
        ...(target.kind === 'text' ? { multiline: target.multiline ?? false, ...(target.maxLength ? { maxLength: target.maxLength } : {}) } : {}),
      } as ComponentAuthoringTarget))),
    })
    const runtime = this.#item.runtime
    const createContext: RuntimeCreateContextDom = {
      runtimeApiVersion: 2, renderMode: 'dom', scope: 'scene', mode: 'preview', sceneId: context.sceneId,
      width: this.#item.frame.width, height: this.#item.frame.height,
      content: { get: (key) => { const value = this.#item.runtime.content.values[key]; if (value === undefined) throw new Error(`Unknown content key ${key}`); return value }, all: () => Object.freeze({ ...this.#item.runtime.content.values }) },
      assets: { url: (key) => { const id = this.#item.runtime.assets[key]?.assetId; return id ? this.environment.resolveProjectAsset(id) ?? '' : '' }, projectUrl: (id) => this.environment.resolveProjectAsset(id) ?? '' },
      presentation: presentationPort(context.surfaceId, this.environment.navigation), actions: actionPort(this.environment.navigation, 'runtime'), events: this.environment.events,
      localState: this.#localState, courseState: courseStatePort(this.environment.courseState), capture: { waitUntil: () => undefined },
      navigation: { guard: () => () => undefined }, assessment: { evaluate: evaluateAssessment }, evidence: { recordAction: () => undefined },
      authoring: this.definition.authoringApiVersion === 1 ? this.#authoring : undefined,
      emit: (name, payload) => this.environment.events.emit(name, payload), domRoot: overlay, dom: { root: overlay, underlay, overlay },
    }
    this.#instance = this.definition.create(createContext)
    if (!this.#instance || typeof this.#instance.destroy !== 'function') throw new Error(`Legacy Runtime ${runtime.protocol} 返回无效生命周期`)
    this.#authoring.invalidate()
    if (this.#mode === 'inspect') this.#instance.suspend?.()
  }
  async update(item: RuntimeLayerItem): Promise<void> {
    const mustRemount = this.#phaserStage && (
      item.runtime.source !== this.#item.runtime.source ||
      item.runtime.renderMode !== this.#item.runtime.renderMode ||
      item.runtime.enabled !== this.#item.runtime.enabled ||
      JSON.stringify(item.runtime.content) !== JSON.stringify(this.#item.runtime.content) ||
      JSON.stringify(item.runtime.assets) !== JSON.stringify(this.#item.runtime.assets) ||
      JSON.stringify(item.runtime.nodeBindings) !== JSON.stringify(this.#item.runtime.nodeBindings)
    )
    this.#item = structuredClone(item)
    if (this.#context) this.#context = { ...this.#context, item }
    if (mustRemount && this.#context) {
      this.#cleanupPhaserRuntime()
      this.#overlay?.destroy()
      this.#overlay = null
      this.#context.container.replaceChildren()
      await this.#mountPhaserRuntime(this.#context)
      return
    }
    this.#instance?.resize?.(item.frame.width, item.frame.height)
    this.#runtimeHost?.resize(item.frame.width, item.frame.height)
    this.#phaserStage?.resize(item.frame.width, item.frame.height)
    this.#authoring?.resize(item.frame.width, item.frame.height)
    this.#authoring?.invalidate()
    this.#runtimeHost?.invalidateAuthoringTargets()
  }
  activate(): void {
    this.#active = true
    this.#instance?.setVisible?.(true)
    this.#runtimeHost?.setVisible(true)
    this.#phaserStage?.setVisible(true)
    if (this.#mode === 'inspect') {
      this.#instance?.suspend?.()
      this.#runtimeHost?.suspend()
      this.#phaserStage?.setPaused(true)
    } else {
      this.#instance?.resume?.()
      this.#runtimeHost?.resume()
      this.#phaserStage?.setPaused(false)
    }
  }
  suspend(): void {
    this.#active = false
    this.#instance?.suspend?.()
    this.#instance?.setVisible?.(false)
    this.#runtimeHost?.suspend()
    this.#runtimeHost?.setVisible(false)
    this.#phaserStage?.setPaused(true)
    this.#phaserStage?.setVisible(false)
  }
  resume(): void { this.activate() }
  setInspectionMode(mode: 'playback' | 'inspect'): void {
    this.#mode = mode
    this.#overlay?.setMode(mode)
    this.#phaserStage?.setInteractive(mode === 'playback')
    if (mode === 'inspect') {
      this.#instance?.suspend?.()
      this.#runtimeHost?.suspend()
      this.#phaserStage?.setPaused(true)
    } else if (this.#active) {
      this.#instance?.resume?.()
      this.#runtimeHost?.resume()
      this.#phaserStage?.setPaused(false)
    }
    this.#authoring?.invalidate()
    this.#runtimeHost?.invalidateAuthoringTargets()
  }
  reset(): void { this.#localState.clear() }
  async capture(): Promise<{ format: 'html'; content: string } | void> {
    await this.#instance?.prepareCapture?.()
    await this.#runtimeHost?.waitForCaptureReady()
    if (this.#phaserStage) return { format: 'html', content: this.#phaserStage.captureHtml() }
  }
  destroy(): void {
    this.#instance?.destroy(); this.#instance = null
    this.#authoring?.destroy(); this.#authoring = null
    this.#overlay?.destroy(); this.#overlay = null
    this.#cleanupPhaserRuntime()
    this.#localState.clear()
    this.#context = null
  }

  async #mountPhaserRuntime(context: SlideItemMountContext<RuntimeLayerItem>): Promise<void> {
    const { LegacyMiniPhaserStage, RuntimeHost } = await loadLegacyPhaserSupport()
    this.#mode = context.mode
    this.#overlay = new TargetOverlay(context.container, this.#mode, context.reportHit, (field) => field)
    const stage = new LegacyMiniPhaserStage(
      context.container,
      this.#item.frame.width,
      this.#item.frame.height,
      context.signal,
    )
    this.#phaserStage = stage
    const roots = await stage.ready
    if (context.signal.aborted) return
    const runtime = this.#item.runtime
    if (runtime.protocol !== 'legacy-runtime-v2' || runtime.runtimeApiVersion !== 2) {
      throw new Error(`Legacy Runtime ${this.#item.layerItemId} 协议无效`)
    }
    this.#runtimeHost = new RuntimeHost({
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
      actions: actionPort(this.environment.navigation, 'runtime'),
      events: this.environment.events,
      courseState: courseStatePort(this.environment.courseState),
      assetUrl: (assetId) => this.environment.resolveProjectAsset(assetId) ?? '',
      registerNavigationGuard: () => () => undefined,
      authoring: {
        onTargetsChanged: (update) => this.#overlay?.render(update.targets.map((target): ComponentAuthoringTarget => ({
          kind: target.kind === 'text' ? 'component-text' : 'component-asset',
          targetId: target.targetId,
          scope: 'scene',
          sceneId: context.sceneId,
          nodeId: this.#item.layerItemId,
          componentId: 'legacy-runtime',
          key: target.kind === 'text'
            ? `runtime/content/values/${pointerEscape(target.key)}`
            : `runtime/assets/${pointerEscape(target.key)}/assetId`,
          label: target.label ?? target.key,
          source: target.source,
          bounds: {
            x: target.bounds.x * this.#item.frame.width / 1280,
            y: target.bounds.y * this.#item.frame.height / 720,
            width: target.bounds.width * this.#item.frame.width / 1280,
            height: target.bounds.height * this.#item.frame.height / 720,
          },
          rotation: 0,
          ...(target.kind === 'text' ? {
            multiline: target.multiline ?? false,
            ...(target.maxLength ? { maxLength: target.maxLength } : {}),
          } : {}),
        } as ComponentAuthoringTarget))),
      },
    })
    stage.syncSiblingNodes()
    stage.setInteractive(this.#mode === 'playback')
    if (!this.#active || this.#mode === 'inspect') {
      this.#runtimeHost.suspend()
      stage.setPaused(true)
    }
  }

  #cleanupPhaserRuntime(): void {
    this.#runtimeHost?.destroy()
    this.#runtimeHost = null
    this.#phaserStage?.destroy()
    this.#phaserStage = null
  }
}

export class CourseEditorDynamicHostRegistry {
  readonly #components = new ComponentRegistry()
  readonly #legacyRuntimes = new RuntimeRegistry()
  readonly #surfaceRuntimes = new SurfaceRuntimeRegistry()
  readonly #componentDefinitions = new Map<string, ComponentDefinitionV4>()
  readonly #componentSources = new Map<string, string>()
  readonly #legacyDefinitions = new Map<string, RuntimeDefinition>()
  readonly #surfaceDefinitions = new Map<string, SurfaceRuntimeDefinition>()
  readonly #flowHosts = new Set<{ host: SlideItemHost<ComponentLayerItem>; controller: AbortController }>()
  constructor(private readonly environment: CourseEditorDynamicEnvironment) {}

  #loadComponent = (item: ComponentLayerItem): LoadedComponentDefinition => {
    const key = `${item.component.packageId}@${item.component.version}`
    const pkg = this.environment.resolveComponent(item.component.packageId, item.component.version)
    if (!pkg) throw new Error(`工程缺少组件包 ${key}`)
    let definition = this.#componentDefinitions.get(key)
    if (!definition || this.#componentSources.get(key) !== pkg.runtimeSource) {
      definition = this.#components.executeRuntime(pkg.manifest, pkg.runtimeSource)
      this.#componentDefinitions.set(key, definition)
      this.#componentSources.set(key, pkg.runtimeSource)
    }
    return { definition, pkg }
  }

  #loadSurfaceRuntime = (item: RuntimeLayerItem): SurfaceRuntimeDefinition => {
    if (item.runtime.protocol !== 'surface-v1' || item.runtime.runtimeApiVersion !== 3) {
      throw new Error(`不支持用 Surface Runtime host 重挂 ${item.runtime.protocol}@${item.runtime.runtimeApiVersion}`)
    }
    const cacheKey = `${item.layerItemId}\u0000${item.runtime.source}`
    let definition = this.#surfaceDefinitions.get(cacheKey)
    if (!definition) {
      definition = this.#surfaceRuntimes.executeRuntime(item.runtime.source, item.layerItemId)
      this.#surfaceDefinitions.set(cacheKey, definition)
    }
    return definition
  }

  componentHost = (item: ComponentLayerItem): SlideItemHost<ComponentLayerItem> => {
    return new EditorComponentHost(
      item,
      this.#loadComponent(item),
      this.#loadComponent,
      this.#components,
      this.environment,
    )
  }

  runtimeHost = (item: RuntimeLayerItem): SlideItemHost<RuntimeLayerItem> => {
    if (item.runtime.protocol === 'surface-v1' && item.runtime.runtimeApiVersion === 3) {
      return new EditorSurfaceRuntimeHost(item, this.#loadSurfaceRuntime(item), this.#loadSurfaceRuntime, this.environment)
    }
    if (item.runtime.protocol === 'legacy-runtime-v2' && item.runtime.runtimeApiVersion === 2) {
      let definition = this.#legacyDefinitions.get(item.layerItemId)
      if (!definition) { definition = this.#legacyRuntimes.executeRuntime(item.runtime.source, item.layerItemId, 2); this.#legacyDefinitions.set(item.layerItemId, definition) }
      return new EditorLegacyRuntimeHost(item, definition, this.#legacyRuntimes, this.environment)
    }
    throw new Error(`不支持的 Runtime 协议 ${item.runtime.protocol}@${item.runtime.runtimeApiVersion}`)
  }

  renderFlowComponent(
    surfaceId: string,
    block: Extract<FlowBlock, { type: 'component' }>,
    dom: Document,
    mode: 'playback' | 'inspect',
    reportHit: (detail?: { field?: string; hitId?: string; targetKind?: 'text' | 'asset' }) => void,
  ): FlowRenderedComponent {
    const root = dom.createElement('div')
    root.className = 'course-flow-live-component'
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
        resolveAsset: (assetId) => this.environment.resolveProjectAsset(assetId),
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
          mode,
          reportHit,
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
        setInspectionMode: (nextMode) => run(() => host.setInspectionMode?.(nextMode)),
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

  #renderFlowFallback(
    root: HTMLElement,
    block: Extract<FlowBlock, { type: 'component' }>,
    error: Error,
  ): void {
    root.replaceChildren()
    root.dataset.hostError = 'true'
    const fallback = this.environment.resolveProjectAsset(block.staticFallbackAssetId)
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

  dispose(): void {
    for (const { host, controller } of this.#flowHosts) {
      controller.abort('course-editor-destroyed')
      void host.destroy?.()
    }
    this.#flowHosts.clear()
    this.#components.dispose(); this.#legacyRuntimes.dispose(); this.#surfaceRuntimes.dispose()
    this.#componentDefinitions.clear(); this.#componentSources.clear(); this.#legacyDefinitions.clear(); this.#surfaceDefinitions.clear()
  }
}
