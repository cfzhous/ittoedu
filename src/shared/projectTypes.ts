export type TextAlign = 'left' | 'center' | 'right'
export type VerticalAlign = 'top' | 'middle' | 'bottom'
export type WritingMode = 'horizontal' | 'vertical-rl' | 'vertical-lr'
export type TextOverflowMode = 'auto-height' | 'fixed' | 'shrink'
export type ImageFit = 'contain' | 'cover' | 'stretch'
export type AssetKind = 'image' | 'audio' | 'video'
export type AudioChannel = 'music' | 'narration' | 'sfx' | 'ui' | 'video'
export type FeatherMode = 'rectangle' | 'ellipse'
export type ShapeLineStyle = 'solid' | 'dashed' | 'dotted'
export type ArrowHead = 'none' | 'triangle' | 'stealth' | 'circle' | 'diamond'

export const SHAPE_TYPES = [
  'rectangle',
  'rounded-rectangle',
  'ellipse',
  'triangle',
  'diamond',
  'line',
  'arrow-left',
  'arrow-right',
  'arrow-up',
  'arrow-down',
  'arrow-left-right',
  'elbow-arrow',
  'brace-left',
  'brace-right',
  'brace-top',
  'brace-bottom',
  'brace-pair-horizontal',
  'brace-pair-vertical',
  'bracket-left',
  'bracket-right',
  'emphasis-dot',
  'emphasis-triangle',
] as const

export type ShapeType = (typeof SHAPE_TYPES)[number]

export const STROKE_ONLY_SHAPE_TYPES = [
  'line',
  'elbow-arrow',
  'brace-left',
  'brace-right',
  'brace-top',
  'brace-bottom',
  'brace-pair-horizontal',
  'brace-pair-vertical',
  'bracket-left',
  'bracket-right',
] as const satisfies readonly ShapeType[]

const strokeOnlyShapeTypes = new Set<ShapeType>(STROKE_ONLY_SHAPE_TYPES)

export function isStrokeOnlyShapeType(shapeType: ShapeType): boolean {
  return strokeOnlyShapeTypes.has(shapeType)
}

export type NodeType =
  | 'text'
  | 'image'
  | 'video'
  | 'shape'
  | 'teacher-controller'
  | 'external-component'

export interface SoundDefinition {
  id: string
  name: string
  assetId: string
  channel: Exclude<AudioChannel, 'video'>
  defaultVolume: number
  defaultLoop: boolean
}

export interface ProjectAudioSettings {
  defaultMuted: boolean
  masterVolume: number
  channelVolumes: Record<AudioChannel, number>
  sounds: Record<string, SoundDefinition>
  narrationDucking: {
    enabled: boolean
    musicVolume: number
    fadeMs: number
  }
}

export interface ProjectMediaSettings {
  audio: ProjectAudioSettings
}

export interface ProjectPlaybackSettings {
  /** `canvas` uses authorable controller nodes; `footer` preserves the V1-V4 shell. */
  controls: 'canvas' | 'footer' | 'none'
  keyboardNavigation: boolean
}

export interface ProjectDocument {
  schemaVersion: 7
  id: string
  title: string
  createdAt: string
  updatedAt: string
  canvas: {
    width: 1280
    height: 720
  }
  scenes: SceneDocument[]
  assets: Record<string, AssetMeta>
  componentPackages: Record<string, EmbeddedComponentPackageMeta>
  globalRuntime?: RuntimeDocument
  globalLayer: GlobalLayerItem[]
  /** Persistent, course-wide declarative mappings for global-layer nodes. */
  globalInteractions: import('./interactionTypes').InteractionRule[]
  media: ProjectMediaSettings
  playback: ProjectPlaybackSettings
}

export interface SceneDocument {
  id: string
  name: string
  backgroundColor: string
  backgroundAssetId?: string | null
  nodes: SceneNode[]
  /** Optional on legacy in-memory documents; editor loading supplies a default. */
  presentation?: ScenePresentation
  runtime?: RuntimeDocument
  interactions: import('./interactionTypes').InteractionRule[]
}

/**
 * A stable, authorable visual state of a scene. The scene's `nodes` remain the
 * canonical base. A state only stores the fields that differ from that base.
 */
export interface ScenePresentationState {
  id: string
  name: string
  description?: string
  backgroundColor?: string
  /** `null` explicitly clears the base background asset. */
  backgroundAssetId?: string | null
  nodeOverrides: Record<string, SceneNodeOverride>
  /** Optional state-specific z-order, from back to front. */
  nodeOrder?: string[]
}

export interface ScenePresentation {
  initialStateId: string
  thumbnailStateId?: string
  states: ScenePresentationState[]
}

export interface BaseNode {
  id: string
  name: string
  type: NodeType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
  /** Playback may start hidden while remaining visible/selectable on authoring and static canvases. */
  playbackInitialVisibility: 'inherit' | 'hidden'
}

export interface TextRunStyle {
  color?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  highlightColor?: string | null
}

export interface TextRun {
  start: number
  end: number
  style: TextRunStyle
}

export interface TextNode extends BaseNode {
  type: 'text'
  text: string
  runs: TextRun[]
  style: {
    fontFamily: string
    fontSize: number
    color: string
    bold: boolean
    italic: boolean
    underline: boolean
    strike: boolean
    highlightColor: string | null
    align: TextAlign
    verticalAlign: VerticalAlign
    writingMode: WritingMode
    lineSpacing: number
    letterSpacing: number
    padding: number
    overflow: TextOverflowMode
    backgroundColor: string
    backgroundOpacity: number
    cornerRadius: number
  }
}

export interface ImageNode extends BaseNode {
  type: 'image'
  assetId: string
  preserveAspectRatio: boolean
  fit: ImageFit
  /** Normalized insets into the source image. Opposing sides total less than 1. */
  crop: {
    left: number
    top: number
    right: number
    bottom: number
  }
  /** Alignment/focal point used after the source crop is applied. */
  cropX: number
  cropY: number
  flipX: boolean
  flipY: boolean
  cornerRadius: number
  feather: {
    amount: number
    mode: FeatherMode
  }
}

export interface VideoNode extends BaseNode {
  type: 'video'
  assetId: string
  fit: ImageFit
  autoplay: boolean
  loop: boolean
  muted: boolean
  volume: number
  playbackRate: number
  showControls: boolean
  clickToToggle: boolean
  startTime: number
  endTime: number | null
  poster: {
    mode: 'video-frame' | 'image'
    time: number
    assetId?: string
  }
  backgroundAudioMode: 'none' | 'duck' | 'pause' | 'stop'
}

export interface ShapeNode extends BaseNode {
  type: 'shape'
  shapeType: ShapeType
  style: {
    fillColor: string
    fillOpacity: number
    borderColor: string
    borderOpacity: number
    borderWidth: number
    lineStyle: ShapeLineStyle
    cornerRadius: number
    startArrow: ArrowHead
    endArrow: ArrowHead
  }
}

/** @deprecated V1 rectangles migrate to ShapeNode automatically. */
export type RectangleNode = ShapeNode

export interface ExternalComponentNode extends BaseNode {
  type: 'external-component'
  component: {
    packageId: string
    version: string
  }
  props: Record<string, unknown>
}

export type TeacherControllerAction =
  | { type: 'scene.previous' }
  | { type: 'scene.next' }
  | { type: 'scene.replay' }
  | { type: 'course.restart' }
  | { type: 'scene.open-picker' }
  | {
      type: 'scene.go'
      sceneId: string
      targetStateId?: string
    }
  | { type: 'audio.toggle-mute' }
  | { type: 'player.fullscreen.toggle' }

/** @deprecated Project V5 compatibility name. */
export type TeacherControlAction = TeacherControllerAction

export interface TeacherControllerButton {
  id: string
  action: TeacherControllerAction
  label: string
  visible: boolean
}

/** A first-class, authorable controller that lives inside the canvas global layer. */
export interface TeacherControllerNode extends BaseNode {
  type: 'teacher-controller'
  title: string
  showSceneProgress: boolean
  compact: boolean
  collapsible: boolean
  defaultCollapsed: boolean
  buttons: TeacherControllerButton[]
  style: {
    backgroundColor: string
    backgroundOpacity: number
    accentColor: string
    textColor: string
    cornerRadius: number
  }
  /** Static exports normally omit delivery-only controls. */
  includeInStaticExports: boolean
}

export interface GlobalLayerVisibility {
  mode: 'all' | 'include' | 'exclude'
  sceneIds: string[]
}

export interface GlobalLayerItem {
  node: SceneNode
  layer: RuntimeLayer
  visibility: GlobalLayerVisibility
}

/** @deprecated Project V3 compatibility type. Use GlobalLayerVisibility. */
export type GlobalComponentVisibility = GlobalLayerVisibility

/** @deprecated Project V3 compatibility type. Use GlobalLayerItem. */
export interface GlobalComponentInstance extends Omit<GlobalLayerItem, 'node'> {
  node: ExternalComponentNode
}

export type SceneNode =
  | TextNode
  | ImageNode
  | VideoNode
  | ShapeNode
  | TeacherControllerNode
  | ExternalComponentNode

type DistributiveNodeOverride<T> = T extends ExternalComponentNode
  ? DeepPartial<Omit<T, 'id' | 'type' | 'component'>>
  : T extends SceneNode
    ? DeepPartial<Omit<T, 'id' | 'type'>>
  : never

export type SceneNodeOverride = DistributiveNodeOverride<SceneNode>

export interface AssetMeta {
  id: string
  filename: string
  mimeType: string
  kind: AssetKind
  path: string
  byteLength: number
  width?: number
  height?: number
  duration?: number
}

export interface EmbeddedComponentPackageMeta {
  packageId: string
  version: string
  name: string
  manifestPath: string
  runtimePath: string
  thumbnailPath?: string
  /** Explicit authoring provenance; imported third-party packages default to read-only. */
  editableCopy?: boolean
  sourcePackageId?: string
}

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T

export interface RuntimeAsset {
  meta: AssetMeta
  bytes: Uint8Array
  url: string
}

export type RuntimeAssetMap = Record<string, RuntimeAsset>
import type { RuntimeDocument, RuntimeLayer } from './runtimeTypes'
