export const RUNTIME_RENDER_MODES = ['phaser', 'dom', 'hybrid'] as const
export const RUNTIME_EXECUTION_MODES = ['preview', 'capture'] as const
export type RuntimeRenderMode = typeof RUNTIME_RENDER_MODES[number]
export type RuntimeLayer = 'underlay' | 'overlay'
export type RuntimeExecutionMode = typeof RUNTIME_EXECUTION_MODES[number]

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

export interface RuntimeDocument extends RuntimeDocumentBase {
  runtimeApiVersion: 2
}

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

export interface RuntimeCaptureContext {
  waitUntil(promise: Promise<unknown>): void
}
