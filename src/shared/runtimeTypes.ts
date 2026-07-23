import type * as Phaser from 'phaser'

export type RuntimeApiVersion = 1 | 2
export type RuntimeRenderMode = 'phaser' | 'dom' | 'hybrid'
export type RuntimeLayer = 'underlay' | 'overlay'
export type RuntimeScope = 'global' | 'scene'
export type RuntimeExecutionMode = 'preview' | 'capture'

export interface EditableTextMetadata {
  label?: string
  description?: string
  multiline?: boolean
  maxLength?: number
}

export interface EditableTextContent {
  /** Every authored, visible string must be stored here. */
  values: Record<string, string>
  metadata?: Record<string, EditableTextMetadata>
}

export interface RuntimeAssetBinding {
  /** Stable AssetMeta.id from the project asset table. */
  assetId: string
}

export interface RuntimeStaticFallback {
  assetId: string
  coverage: 'runtime-layer' | 'full-scene'
  layer: RuntimeLayer
}

interface RuntimeDocumentBase {
  enabled: boolean
  renderMode: RuntimeRenderMode
  source: string
  content: EditableTextContent
  assets: Record<string, RuntimeAssetBinding>
  /** Semantic binding key -> scene/global node id. Copying a scene rewrites ids. */
  nodeBindings?: Record<string, string>
  staticFallback?: RuntimeStaticFallback
}

export interface RuntimeDocumentV1 extends RuntimeDocumentBase {
  runtimeApiVersion: 1
}

export interface RuntimeDocumentV2 extends RuntimeDocumentBase {
  runtimeApiVersion: 2
}

export type RuntimeDocument = RuntimeDocumentV1 | RuntimeDocumentV2

export type CourseStateData =
  | null
  | undefined
  | string
  | number
  | boolean
  | bigint
  | CourseStateData[]
  | { [key: string]: CourseStateData }

export interface CourseStateStore {
  get<T = CourseStateData>(key: string): T | undefined
  set(key: string, value: unknown): void
  delete(key: string): void
  clear(): void
  snapshot(): Record<string, unknown>
}

export type RuntimeEventDisposer = () => void
export type RuntimeEventListener<T = unknown> = (
  payload: T,
) => void | Promise<void>

export interface CourseEventBus {
  on<T = unknown>(
    eventName: string,
    listener: RuntimeEventListener<T>,
  ): RuntimeEventDisposer
  off<T = unknown>(eventName: string, listener: RuntimeEventListener<T>): void
  emit<T = unknown>(eventName: string, payload?: T): void
  listenerCount(eventName?: string): number
  dispose(): void
}

export interface RuntimeHostActions {
  goToScene(sceneId: string, targetStateId?: string): boolean
  nextScene(): boolean
  previousScene(): boolean
  replayScene(): boolean
  restartCourse(): boolean
}

export interface RuntimeNodeHandle {
  readonly id: string
  readonly type: string
  readonly root: Phaser.GameObjects.GameObject
}

export interface RuntimePresentationStateInfo {
  id: string
  name: string
  description?: string
}

export interface RuntimePresentationTransition {
  /** Duration in milliseconds. Omit or use zero for an immediate switch. */
  duration?: number
  /** Any Phaser tween easing name, for example `Sine.easeInOut`. */
  ease?: string
}

/** Controls declarative, author-editable states of the current scene. */
export interface RuntimePresentationApi {
  current(): string | null
  states(): ReadonlyArray<Readonly<RuntimePresentationStateInfo>>
  setState(stateId: string): boolean
  transitionTo(
    stateId: string,
    transition?: RuntimePresentationTransition,
  ): boolean
}

export interface RuntimePhaserRoots {
  scene: Phaser.Scene
  /** Backwards-compatible default root. It points to the overlay root. */
  root: Phaser.GameObjects.Container
  underlay: Phaser.GameObjects.Container
  overlay: Phaser.GameObjects.Container
}

export interface RuntimeDomRoots {
  /** Backwards-compatible default root. It points to the overlay root. */
  root: HTMLElement
  underlay: HTMLElement
  overlay: HTMLElement
}

export interface RuntimeNavigationRequest {
  fromSceneId?: string
  toSceneId: string
}

/** `false` blocks, a scene id redirects, and `true`/`void` allows. */
export type RuntimeNavigationGuardResult = boolean | string | void
export type RuntimeNavigationGuard = (
  request: Readonly<RuntimeNavigationRequest>,
) => RuntimeNavigationGuardResult

export interface RuntimeNavigationApi {
  guard(guard: RuntimeNavigationGuard): RuntimeEventDisposer
}

export interface RuntimeContentReader {
  get(key: string): string
  all(): Readonly<Record<string, string>>
}

export interface RuntimeAssetResolver {
  url(bindingKey: string): string
  projectUrl(assetId: string): string
}

export interface RuntimeNodeResolver {
  get(nodeId: string): RuntimeNodeHandle | null
}

export interface RuntimeCaptureContext {
  waitUntil(promise: Promise<unknown>): void
}

interface RuntimeCreateContextBase {
  scope: RuntimeScope
  mode: RuntimeExecutionMode
  sceneId?: string
  width: number
  height: number

  content: RuntimeContentReader
  assets: RuntimeAssetResolver
  presentation: RuntimePresentationApi
  actions: Readonly<RuntimeHostActions>
  events: CourseEventBus
  localState: CourseStateStore
  courseState: CourseStateStore
  capture: RuntimeCaptureContext
  navigation: RuntimeNavigationApi
  emit(eventName: string, payload?: unknown): void
}

/** API 1 compatibility context. Both render surfaces are always exposed. */
export interface RuntimeCreateContextV1 extends RuntimeCreateContextBase {
  runtimeApiVersion: 1
  Phaser: typeof Phaser
  phaser: RuntimePhaserRoots
  domRoot: HTMLElement
  dom: RuntimeDomRoots
  nodes: RuntimeNodeResolver
}

interface RuntimeCreateContextV2Base extends RuntimeCreateContextBase {
  runtimeApiVersion: 2
  renderMode: RuntimeRenderMode
}

export interface RuntimeCreateContextV2Phaser
  extends RuntimeCreateContextV2Base {
  renderMode: 'phaser'
  Phaser: typeof Phaser
  phaser: RuntimePhaserRoots
  nodes: RuntimeNodeResolver
}

export interface RuntimeCreateContextV2Dom extends RuntimeCreateContextV2Base {
  renderMode: 'dom'
  domRoot: HTMLElement
  dom: RuntimeDomRoots
}

export interface RuntimeCreateContextV2Hybrid
  extends RuntimeCreateContextV2Base {
  renderMode: 'hybrid'
  Phaser: typeof Phaser
  phaser: RuntimePhaserRoots
  domRoot: HTMLElement
  dom: RuntimeDomRoots
  nodes: RuntimeNodeResolver
}

/** API 2 exposes only the render surfaces declared by RuntimeDocument.renderMode. */
export type RuntimeCreateContextV2 =
  | RuntimeCreateContextV2Phaser
  | RuntimeCreateContextV2Dom
  | RuntimeCreateContextV2Hybrid

export type RuntimeCreateContext = RuntimeCreateContextV1 | RuntimeCreateContextV2

export interface RuntimeInstanceLifecycle {
  resize?(width: number, height: number): void
  setVisible?(visible: boolean): void
  suspend?(): void
  resume?(): void
  prepareCapture?(): void | Promise<void>
  destroy(): void
}

export interface RuntimeDefinitionV1 {
  runtimeApiVersion: 1
  create(context: RuntimeCreateContextV1): RuntimeInstanceLifecycle
}

export interface RuntimeDefinitionV2 {
  runtimeApiVersion: 2
  create(context: RuntimeCreateContextV2): RuntimeInstanceLifecycle
}

export type RuntimeDefinition = RuntimeDefinitionV1 | RuntimeDefinitionV2
