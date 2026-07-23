import type * as Phaser from 'phaser'
import type {
  CourseEventBus,
  CourseStateStore,
  RuntimeCaptureContext,
  RuntimePresentationApi,
} from './runtimeTypes'

export type ComponentSchemaVersion = 1 | 2 | 3 | 4
export type ComponentRuntimeApiVersion = 1 | 2 | 3 | 4
export type ComponentScope = 'scene' | 'global'
export type ComponentRenderMode = 'phaser' | 'dom' | 'hybrid'

interface ComponentManifestBase {
  id: string
  name: string
  version: string
  description?: string
  entry: string
  thumbnail?: string
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }
  preserveAspectRatio: boolean
  assets: Record<string, string>
  defaultProps: Record<string, unknown>
}

export interface ComponentEditorPropertyBase {
  /** Dot-separated path inside node.props, for example `pages.intro.title`. */
  key: string
  label: string
  description?: string
  required?: boolean
}

export interface ComponentTextProperty extends ComponentEditorPropertyBase {
  type: 'text' | 'textarea'
  placeholder?: string
  maxLength?: number
}

export interface ComponentNumberProperty extends ComponentEditorPropertyBase {
  type: 'number'
  min?: number
  max?: number
  step?: number
  unit?: string
}

export interface ComponentBooleanProperty extends ComponentEditorPropertyBase {
  type: 'boolean'
}

export interface ComponentColorProperty extends ComponentEditorPropertyBase {
  type: 'color'
}

export interface ComponentSelectProperty extends ComponentEditorPropertyBase {
  type: 'select'
  options: Array<{ value: string; label: string }>
}

export interface ComponentImageProperty extends ComponentEditorPropertyBase {
  /** The stored prop value is a project AssetMeta.id. */
  type: 'image'
}

export type ComponentEditorProperty =
  | ComponentTextProperty
  | ComponentNumberProperty
  | ComponentBooleanProperty
  | ComponentColorProperty
  | ComponentSelectProperty
  | ComponentImageProperty

export interface ComponentEditorPage {
  id: string
  label: string
  description?: string
  /** Property keys shown while this internal page is selected in the editor. */
  propertyKeys: string[]
}

export interface ComponentEditorSchema {
  properties: ComponentEditorProperty[]
  /** Optional internal pages used to group fields and preview multi-page components. */
  pages?: ComponentEditorPage[]
  defaultPageId?: string
  /**
   * Prop path used only to persist the editor's currently inspected internal page.
   * A component should use ctx.editorState.pageId in edit mode and keep its playback
   * initial-page prop separate.
   */
  previewPageProp?: string
}

export interface ComponentVariant {
  id: string
  label: string
  description?: string
  /** Props applied when the author switches to this variant. */
  props: Record<string, unknown>
}

export interface ComponentPreset {
  id: string
  label: string
  description?: string
  variantId?: string
  /** Props merged after defaultProps and the referenced variant props. */
  props: Record<string, unknown>
  /** Optional internal page to show immediately after adding the preset. */
  previewPageId?: string
}

export interface ComponentManifestV1 extends ComponentManifestBase {
  schemaVersion: 1
  runtimeApiVersion: 1
}

export interface ComponentManifestV2 extends ComponentManifestBase {
  schemaVersion: 2
  runtimeApiVersion: 2
  editor?: ComponentEditorSchema
  variants?: ComponentVariant[]
  presets?: ComponentPreset[]
}

export interface ComponentManifestV3 extends ComponentManifestBase {
  schemaVersion: 3
  runtimeApiVersion: 3
  /** Every V3 component must explicitly declare where it can be mounted. */
  supportedScopes: ComponentScope[]
  editor?: ComponentEditorSchema
  variants?: ComponentVariant[]
  presets?: ComponentPreset[]
}

export interface ComponentManifestV4 extends ComponentManifestBase {
  schemaVersion: 4
  runtimeApiVersion: 4
  /** V4 components explicitly declare both their mount scopes and render surface. */
  supportedScopes: ComponentScope[]
  renderMode: ComponentRenderMode
  editor?: ComponentEditorSchema
  variants?: ComponentVariant[]
  presets?: ComponentPreset[]
}

export type ConfigurableComponentManifest =
  | ComponentManifestV2
  | ComponentManifestV3
  | ComponentManifestV4

export type ComponentManifest =
  | ComponentManifestV1
  | ComponentManifestV2
  | ComponentManifestV3
  | ComponentManifestV4

export interface ComponentHostActions {
  goToScene(sceneId: string, targetStateId?: string): boolean
  nextScene(): boolean
  previousScene(): boolean
  replayScene(): boolean
  restartCourse(): boolean
}

export interface ComponentEditorState {
  pageId?: string
  variantId?: string
}

/** V1-V3 compatibility context. Its renderer fields intentionally stay unchanged. */
export interface ComponentCreateContext {
  Phaser: typeof Phaser
  scene: Phaser.Scene
  root: Phaser.GameObjects.Container
  instanceId: string
  width: number
  height: number
  mode: 'edit' | 'preview'
  props: Record<string, unknown>
  editorState: Readonly<ComponentEditorState>
  actions: Readonly<ComponentHostActions>
  /** Present in the V3 player; optional keeps V1/V2 component code compatible. */
  scope?: ComponentScope
  /** Lifecycle-scoped in the player: subscriptions are removed on destroy. */
  events?: CourseEventBus
  /** Shared across ordinary scene navigation and reset by restartCourse(). */
  courseState?: CourseStateStore
  /** Player-only declarative scene-state controller. */
  presentation?: RuntimePresentationApi
  assetUrl(assetKey: string): string
  projectAssetUrl(assetId: string): string
  emit(eventName: string, payload?: unknown): void
}

interface ComponentCreateContextV4Base {
  runtimeApiVersion: 4
  renderMode: ComponentRenderMode
  instanceId: string
  width: number
  height: number
  mode: 'edit' | 'preview' | 'capture'
  props: Record<string, unknown>
  editorState: Readonly<ComponentEditorState>
  actions: Readonly<ComponentHostActions>
  scope: ComponentScope
  /** Lifecycle-scoped in the player: subscriptions are removed on destroy. */
  events?: CourseEventBus
  /** Shared across ordinary scene navigation and reset by restartCourse(). */
  courseState?: CourseStateStore
  /** Player-only declarative scene-state controller. */
  presentation?: RuntimePresentationApi
  /** Lets async assets participate in deterministic thumbnail/export capture. */
  capture: RuntimeCaptureContext
  assetUrl(assetKey: string): string
  projectAssetUrl(assetId: string): string
  emit(eventName: string, payload?: unknown): void
}

export interface ComponentPhaserSurface {
  Phaser: typeof Phaser
  scene: Phaser.Scene
  root: Phaser.GameObjects.Container
}

export interface ComponentDomSurface {
  root: HTMLElement
}

export interface ComponentCreateContextV4Phaser
  extends ComponentCreateContextV4Base {
  renderMode: 'phaser'
  phaser: ComponentPhaserSurface
}

export interface ComponentCreateContextV4Dom
  extends ComponentCreateContextV4Base {
  renderMode: 'dom'
  dom: ComponentDomSurface
}

export interface ComponentCreateContextV4Hybrid
  extends ComponentCreateContextV4Base {
  renderMode: 'hybrid'
  phaser: ComponentPhaserSurface
  dom: ComponentDomSurface
}

/**
 * V4 exposes only the renderer capabilities declared by manifest.renderMode.
 * Renderer roots are nested so DOM and Phaser never share an ambiguous `root`.
 */
export type ComponentCreateContextV4 =
  | ComponentCreateContextV4Phaser
  | ComponentCreateContextV4Dom
  | ComponentCreateContextV4Hybrid

export interface ComponentInstanceLifecycle {
  setMode?(mode: 'edit' | 'preview' | 'capture'): void
  resize?(width: number, height: number): void
  updateProps?(props: Record<string, unknown>): void
  setEditorState?(state: Readonly<ComponentEditorState>): void
  setVisible?(visible: boolean): void
  suspend?(): void
  resume?(): void
  prepareCapture?(): void | Promise<void>
  destroy(): void
}

export interface LegacyComponentDefinition {
  id: string
  runtimeApiVersion: 1 | 2 | 3
  create(context: ComponentCreateContext): ComponentInstanceLifecycle
}

export interface ComponentDefinitionV4 {
  id: string
  runtimeApiVersion: 4
  create(context: ComponentCreateContextV4): ComponentInstanceLifecycle
}

export type ComponentDefinition = LegacyComponentDefinition | ComponentDefinitionV4

export interface ComponentPackageData {
  manifest: ComponentManifest
  runtimeSource: string
  files: Record<string, Uint8Array>
  thumbnailUrl?: string
}

export interface ExportPayload {
  project: import('./projectTypes').ProjectDocument
  assets: Record<string, { mimeType: string; dataUrl: string }>
  components: Record<
    string,
    {
      manifest: ComponentManifest
      runtimeSource: string
      assets: Record<string, { mimeType: string; dataUrl: string }>
    }
  >
}
