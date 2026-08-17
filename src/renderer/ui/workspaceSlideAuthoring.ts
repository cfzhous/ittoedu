import type { ComponentPackageData } from '../../shared/componentTypes'
import type {
  ExternalComponentNode,
  ProjectDocument,
  SceneDocument,
  SceneNode,
  TextRun,
} from '../../shared/projectTypes'
import type { RuntimeDocument } from '../../shared/runtimeTypes'
import { renderTextNodeCanvas } from '../../shared/textLayout'
import type {
  NodeTransformEndEvent,
  NodeSelectionEvent,
  NodesTransformEndEvent,
} from '../phaser/EditorPhaserBridge'

export const WORKSPACE_SLIDE_PREVIEW_STATE_ID = 'state_workspace_preview'

export type WorkspaceSlideEditingScope = 'scene' | 'surface' | 'global'

/**
 * One completed canvas text transaction. The owning backend creates exactly
 * one revision and one history entry for the whole session, never per key.
 */
export interface WorkspaceTextEditCommitEvent {
  readonly nodeId: string
  readonly text: string
  readonly runs: readonly TextRun[]
  /** Stable V9 address; required for the injected backend commit path. */
  readonly authoringAddress?: string
  /** Project revision captured when the canvas session opened. */
  readonly revision?: number
}

export type WorkspaceTextEditField = 'content.text' | 'content.formula'

/** Commit key for one canvas text/formula session. Temporary node objects are not keys. */
export interface WorkspaceTextEditSessionKey {
  readonly sessionId: string
  readonly authoringAddress: string
  readonly revision: number
  readonly locationId: string
  readonly stateId: string | null
  readonly editingScope: WorkspaceSlideEditingScope
  readonly layerItemId: string
  readonly field: WorkspaceTextEditField
  readonly generation: number
}

export type WorkspaceTextEditSubmit = 'blur' | 'enter' | 'ctrl-enter'

export type WorkspaceTextEditBoundary =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'commit'; readonly submit: WorkspaceTextEditSubmit }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'reject-stale' }

export interface WorkspaceTextEditBoundaryEvent {
  readonly type:
    | 'compositionstart'
    | 'compositionend'
    | 'keydown'
    | 'blur'
    | 'cancel'
    | 'external-selection'
  readonly key?: string
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly isComposing?: boolean
}

export interface WorkspaceSlideAuthoringTarget {
  readonly source: WorkspaceSlideEditingScope
  readonly layerItemId: string
  readonly authoringAddress?: string
}

export interface WorkspaceRuntimeHitTarget {
  readonly layerItemId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
  readonly visible: boolean
  readonly locked: boolean
}

export interface WorkspaceSlidePreviewResources {
  readonly assets: ProjectDocument['assets']
  readonly assetFiles: Readonly<Record<string, Uint8Array>>
  readonly componentPackages: ProjectDocument['componentPackages']
  readonly designTokens: ProjectDocument['designTokens']
  readonly media: ProjectDocument['media']
}

/**
 * Ephemeral read/callback seam for the existing Workspace canvas. Workspace
 * never persists or mutates the supplied document; the owning backend handles
 * every selection and completed transform.
 */
export interface WorkspaceSlideAuthoringInput {
  /** Changes whenever a V9 document is opened/reopened, even if IDs repeat. */
  readonly sessionId: string
  /** Scope-local geometry proxies; this is the only mutable authoring scope. */
  readonly document: SceneDocument
  /** Unified read-only Native composition rendered by the isolated Player. */
  readonly previewDocument: SceneDocument
  readonly componentPackages: Record<string, ComponentPackageData>
  readonly previewResources: WorkspaceSlidePreviewResources
  readonly selectedNodeIds: readonly string[]
  /**
   * V9-only ownership map. Node ids are stable layerItemId values; callers
   * omit this on the legacy V8 path.
   */
  readonly authoringTargets?: ReadonlyMap<string, WorkspaceSlideAuthoringTarget>
  /** Runtime layers stay out of SceneNode lists; T10 mounts these as hit zones. */
  readonly runtimeHitTargets?: readonly WorkspaceRuntimeHitTarget[]
  /** Labels owned by the injected document backend, never by the V8 shell. */
  readonly sceneName: string
  readonly stateName: string
  readonly editingScope: WorkspaceSlideEditingScope
  /** Explains why legacy-only authoring commands are unavailable. */
  readonly unsupportedActionReason: string
  /** Global API-2 runtime projected into the carrier's globalRuntime slot. */
  readonly globalRuntime?: RuntimeDocument
  /** Global component layers projected into the carrier's globalLayer. */
  readonly globalCarrierLayerItems?: ReadonlyArray<{
    readonly node: ExternalComponentNode
    readonly layer: 'underlay' | 'overlay'
  }>
  /** `false` rejects a gesture that raced with a lifecycle boundary. */
  readonly onSelectionChange: (event: Readonly<NodeSelectionEvent>) => boolean
  readonly onTransformEnd: (event: Readonly<NodesTransformEndEvent>) => boolean
  /**
   * Commits one completed canvas text transaction (including the whole IME
   * composition and any paste/toolbar formatting of the session). Returning
   * `false` means the target context became stale and nothing was written.
   */
  readonly onTextEditCommit: (event: Readonly<WorkspaceTextEditCommitEvent>) => boolean
}

function withDirectionAwareTextAutoSize(
  node: SceneNode | undefined,
  patch: Partial<Pick<SceneNode, 'x' | 'y' | 'width' | 'height' | 'rotation'>>,
): typeof patch {
  const sizeChanged = node !== undefined && (
    (patch.width !== undefined && patch.width !== node.width) ||
    (patch.height !== undefined && patch.height !== node.height)
  )
  if (
    node?.type !== 'text' ||
    node.style.overflow !== 'auto-height' ||
    !sizeChanged
  ) {
    return patch
  }
  const candidate = { ...node, ...patch }
  const rendered = renderTextNodeCanvas(candidate, candidate.width)
  return {
    ...patch,
    width: rendered.width,
    height: rendered.height,
  }
}

export function completeWorkspaceTransformEvent(
  document: SceneDocument,
  patches: readonly (
    Pick<NodeTransformEndEvent, 'nodeId'> &
    Partial<Omit<NodeTransformEndEvent, 'nodeId'>>
  )[],
): NodesTransformEndEvent | null {
  const nodes = patches.map((patch): NodeTransformEndEvent | null => {
    const node = document.nodes.find((candidate) => candidate.id === patch.nodeId)
    if (!node) return null
    const normalized = withDirectionAwareTextAutoSize(node, patch)
    const candidate = { ...node, ...normalized }
    return {
      nodeId: node.id,
      x: candidate.x,
      y: candidate.y,
      width: candidate.width,
      height: candidate.height,
      rotation: candidate.rotation,
    }
  })
  return nodes.every((node): node is NodeTransformEndEvent => node !== null)
    ? { nodes }
    : null
}

/**
 * Builds a Player patch from the effective preview node while applying only
 * authoring geometry. Scope-local visibility must never leak into playback.
 */
export function workspacePreviewNodeWithTransform(
  input: WorkspaceSlideAuthoringInput,
  nodeId: string,
  patch: Partial<Pick<SceneNode, 'x' | 'y' | 'width' | 'height' | 'rotation'>> = {},
): SceneNode | null {
  const previewNode = input.previewDocument.nodes.find((node) => node.id === nodeId)
  return previewNode ? { ...previewNode, ...patch } as SceneNode : null
}

export type UnsupportedWorkspaceAuthoringAction =
  | 'run-current-location'
  | 'text-edit'
  | 'formula-edit'
  | 'drop'
  | 'runtime-edit'
  | 'component-edit'
  | 'animation-preview'
  | 'ai-reference'

/**
 * Capability gate for events that still belong exclusively to the legacy V8
 * backend. Keeping the decision here makes every caller choose one backend
 * before it can invoke a mutating command. Canvas text editing is served
 * through `onTextEditCommit`, and Runtime/Component author targets follow the
 * same unified-layer path as Native targets, so those canvas edits are allowed
 * in the injected V9 backend too; everything else keeps a single-backend
 * decision before it can invoke a mutating command.
 */
export function workspaceAuthoringActionAllowed(
  injected: WorkspaceSlideAuthoringInput | undefined,
  action: UnsupportedWorkspaceAuthoringAction,
): boolean {
  if (!injected) return true
  return (
    (action === 'text-edit' && injected.onTextEditCommit !== undefined) ||
    action === 'runtime-edit' ||
    action === 'component-edit'
  )
}

/**
 * Resolves the authoring-scope text node a canvas text session is editing.
 * `null` means the target is stale or not an editable text node, so the
 * session must not open.
 */
export function workspaceTextEditTargetNode(
  injected: WorkspaceSlideAuthoringInput,
  nodeId: string,
): SceneNode | null {
  const node = injected.document.nodes.find((candidate) => candidate.id === nodeId)
  return node?.type === 'text' && node.visible && !node.locked ? node : null
}

export function workspaceFormulaEditTargetNode(
  injected: WorkspaceSlideAuthoringInput,
  nodeId: string,
): SceneNode | null {
  const node = injected.document.nodes.find((candidate) => candidate.id === nodeId)
  return node?.type === 'formula' && node.visible && !node.locked ? node : null
}

export function workspaceAuthoringTargetForNode(
  injected: WorkspaceSlideAuthoringInput,
  nodeId: string,
): WorkspaceSlideAuthoringTarget | null {
  const mapped = injected.authoringTargets?.get(nodeId)
  if (mapped) return mapped
  const node = injected.document.nodes.find((candidate) => candidate.id === nodeId)
  if (!node) return null
  return {
    source: injected.editingScope,
    layerItemId: node.id,
  }
}

export function isWorkspaceTextEditSessionStale(
  session: WorkspaceTextEditSessionKey,
  current: Pick<
    WorkspaceTextEditSessionKey,
    'sessionId' | 'authoringAddress' | 'revision' | 'locationId' | 'stateId' | 'editingScope' | 'generation'
  >,
): boolean {
  return session.sessionId !== current.sessionId ||
    session.authoringAddress !== current.authoringAddress ||
    session.revision !== current.revision ||
    session.locationId !== current.locationId ||
    session.stateId !== current.stateId ||
    session.editingScope !== current.editingScope ||
    session.generation !== current.generation
}

/**
 * Classifies IME / blur / Enter / Ctrl+Enter / cancel / external selection.
 * Returning `reject-stale` means the caller must drop the draft and not write.
 */
export function resolveWorkspaceTextEditBoundary(input: {
  readonly session: WorkspaceTextEditSessionKey
  readonly current: Pick<
    WorkspaceTextEditSessionKey,
    'sessionId' | 'authoringAddress' | 'revision' | 'locationId' | 'stateId' | 'editingScope' | 'generation'
  >
  readonly event: WorkspaceTextEditBoundaryEvent
  readonly composing?: boolean
}): WorkspaceTextEditBoundary {
  if (isWorkspaceTextEditSessionStale(input.session, input.current)) {
    return { kind: 'reject-stale' }
  }
  const event = input.event
  if (event.type === 'compositionstart' || input.composing || event.isComposing) {
    return { kind: 'ignore' }
  }
  if (event.type === 'compositionend') return { kind: 'ignore' }
  if (event.type === 'cancel' || event.type === 'external-selection') {
    return { kind: 'cancel' }
  }
  if (event.type === 'blur') return { kind: 'commit', submit: 'blur' }
  if (event.type === 'keydown') {
    if (event.key === 'Escape') return { kind: 'cancel' }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      return { kind: 'commit', submit: 'ctrl-enter' }
    }
    if (event.key === 'Enter') return { kind: 'commit', submit: 'enter' }
  }
  return { kind: 'ignore' }
}

export function beginWorkspaceTextEditSession(input: {
  readonly injected: WorkspaceSlideAuthoringInput
  readonly nodeId: string
  readonly locationId: string
  readonly stateId: string | null
  readonly revision: number
  readonly authoringAddress: string
  readonly field?: WorkspaceTextEditField
  readonly generation: number
}): WorkspaceTextEditSessionKey | null {
  const field = input.field ?? 'content.text'
  const node = field === 'content.formula'
    ? workspaceFormulaEditTargetNode(input.injected, input.nodeId)
    : workspaceTextEditTargetNode(input.injected, input.nodeId)
  if (!node) return null
  const target = workspaceAuthoringTargetForNode(input.injected, input.nodeId)
  if (!target) return null
  return {
    sessionId: input.injected.sessionId,
    authoringAddress: input.authoringAddress,
    revision: input.revision,
    locationId: input.locationId,
    stateId: input.stateId,
    editingScope: input.injected.editingScope,
    layerItemId: target.layerItemId,
    field,
    generation: input.generation,
  }
}

/** V9 accepts the complete visible Native/Component selection, including locked items. */
export function workspaceSelectionAllowed(
  injected: WorkspaceSlideAuthoringInput | undefined,
  event: Readonly<NodeSelectionEvent>,
): boolean {
  if (!injected) return true
  if (event.nodeIds.length === 0) return true
  if (new Set(event.nodeIds).size !== event.nodeIds.length) return false
  const nodesById = new Map(injected.document.nodes.map((node) => [node.id, node]))
  return event.nodeIds.every((nodeId) => {
    const node = nodesById.get(nodeId)
    return Boolean(node && node.visible)
  })
}

/** Validates one complete Native/Component transform before it reaches the V9 command. */
export function workspaceTransformAllowed(
  injected: WorkspaceSlideAuthoringInput | undefined,
  event: Readonly<NodesTransformEndEvent>,
): boolean {
  if (!injected) return true
  if (event.nodes.length === 0) return false
  const nodeIds = event.nodes.map((node) => node.nodeId)
  if (new Set(nodeIds).size !== nodeIds.length) return false
  const nodesById = new Map(injected.document.nodes.map((node) => [node.id, node]))
  return event.nodes.every((transform) => {
    const node = nodesById.get(transform.nodeId)
    return Boolean(
      node &&
      node.visible &&
      !node.locked &&
      Number.isFinite(transform.x) &&
      Number.isFinite(transform.y) &&
      Number.isFinite(transform.width) && transform.width > 0 &&
      Number.isFinite(transform.height) && transform.height > 0 &&
      Number.isFinite(transform.rotation) &&
      transform.rotation >= -36_000 && transform.rotation <= 36_000
    )
  })
}

export function workspaceCanvasLabel(
  input: WorkspaceSlideAuthoringInput,
): string {
  return input.editingScope === 'global'
    ? `全局层 · ${input.document.nodes.length} 个元素`
    : input.editingScope === 'surface'
      ? `当前内容共用 · ${input.document.nodes.length} 个元素`
    : `${input.sceneName} · ${input.stateName}`
}

/**
 * Player reconstruction key. Frame/content values are patched through the
 * inspection channel; only topology and executable component identity rebuild
 * the isolated carrier. Global dynamic layers mount in the carrier's global
 * plane, so their identity must also invalidate the reconstruction.
 */
export function workspaceSlidePreviewStructuralKey(
  input: WorkspaceSlideAuthoringInput,
): string {
  return JSON.stringify({
    sceneId: input.previewDocument.id,
    nodes: input.previewDocument.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      ...(node.type === 'external-component'
        ? {
            packageId: node.component.packageId,
            version: node.component.version,
          }
        : {}),
    })),
    interactions: input.previewDocument.interactions,
    ...(input.previewDocument.runtime
      ? {
          runtime: {
            enabled: input.previewDocument.runtime.enabled,
            renderMode: input.previewDocument.runtime.renderMode,
            source: input.previewDocument.runtime.source,
          },
        }
      : {}),
    globalRuntime: input.globalRuntime
      ? {
          enabled: input.globalRuntime.enabled,
          renderMode: input.globalRuntime.renderMode,
          source: input.globalRuntime.source,
        }
      : null,
    globalCarrierLayers: (input.globalCarrierLayerItems ?? []).map((item) => ({
      id: item.node.id,
      packageId: item.node.component.packageId,
      version: item.node.component.version,
    })),
  })
}

/** Metadata values are cloned by V9 transactions, so compare their content. */
export function workspaceSlidePreviewResourceKey(
  resources: WorkspaceSlidePreviewResources,
): string {
  return JSON.stringify({
    assets: resources.assets,
    componentPackages: resources.componentPackages,
    designTokens: resources.designTokens,
    media: resources.media,
  })
}

export interface WorkspaceSlidePreviewGenerationIdentity {
  readonly sessionId: string
  readonly structuralKey: string
  readonly resourceKey: string
  readonly assetFiles: WorkspaceSlidePreviewResources['assetFiles']
  readonly componentPackages: WorkspaceSlideAuthoringInput['componentPackages']
}

export function workspaceSlidePreviewGenerationIdentity(
  input: WorkspaceSlideAuthoringInput,
): WorkspaceSlidePreviewGenerationIdentity {
  return {
    sessionId: input.sessionId,
    structuralKey: workspaceSlidePreviewStructuralKey(input),
    resourceKey: workspaceSlidePreviewResourceKey(input.previewResources),
    assetFiles: input.previewResources.assetFiles,
    componentPackages: input.componentPackages,
  }
}

export function workspaceOverlayHitTargets(
  targets: readonly WorkspaceRuntimeHitTarget[] | undefined,
): readonly WorkspaceRuntimeHitTarget[] {
  return targets ?? []
}

export function workspaceSlidePreviewStateId(
  injected: WorkspaceSlideAuthoringInput | undefined,
  legacyStateId: string | null,
): string | null {
  return injected ? WORKSPACE_SLIDE_PREVIEW_STATE_ID : legacyStateId
}

export function workspaceSlidePreviewSceneId(
  injected: WorkspaceSlideAuthoringInput | undefined,
  legacySceneId: string,
): string {
  return injected?.previewDocument.id ?? legacySceneId
}

export function workspaceSlidePreviewAssetFiles(
  injected: WorkspaceSlideAuthoringInput | undefined,
  legacyAssetFiles: Readonly<Record<string, Uint8Array>>,
): Readonly<Record<string, Uint8Array>> {
  return injected?.previewResources.assetFiles ?? legacyAssetFiles
}

/** V9 is flattened into one isolated carrier scene; V8 keeps real scopes. */
export function workspaceSlideCarrierScope(
  injected: WorkspaceSlideAuthoringInput | undefined,
  editingScope: WorkspaceSlideEditingScope,
): 'scene' | 'global' {
  return injected || editingScope === 'surface' ? 'scene' : editingScope
}

/** Selects exactly one backend. Inputs are never combined or copied. */
export function resolveWorkspaceSlideAuthoringInput(
  fallback: WorkspaceSlideAuthoringInput,
  injected: WorkspaceSlideAuthoringInput | undefined,
): WorkspaceSlideAuthoringInput {
  return injected ?? fallback
}

/**
 * Builds the isolated Player's read-only compatibility payload. Injected V9
 * authoring never inherits V8 scenes, globals, controller, runtime or assets.
 * V9 runtime/component layers enter the same carrier path as Native layers:
 * the scene runtime slot and global layer carry the projected dynamic content,
 * while every layer keeps its own host ownership in the V9 project.
 */
export function createWorkspaceSlidePreviewProject(
  project: ProjectDocument,
  _activeSceneId: string,
  injected: WorkspaceSlideAuthoringInput | undefined,
): ProjectDocument {
  if (!injected) return project
  const projected = injected.previewDocument
  return {
    schemaVersion: 8,
    id: `workspace-preview-${injected.sessionId}`,
    title: injected.sceneName,
    createdAt: '2000-01-01T00:00:00.000Z',
    updatedAt: '2000-01-01T00:00:00.000Z',
    canvas: { width: 1280, height: 720 },
    scenes: [{
      id: projected.id,
      name: projected.name,
      backgroundColor: projected.backgroundColor,
      backgroundAssetId: projected.backgroundAssetId ?? null,
      nodes: structuredClone(projected.nodes),
      ...(projected.runtime
        ? { runtime: structuredClone(projected.runtime) }
        : {}),
      presentation: {
        initialStateId: WORKSPACE_SLIDE_PREVIEW_STATE_ID,
        thumbnailStateId: WORKSPACE_SLIDE_PREVIEW_STATE_ID,
        states: [{
          id: WORKSPACE_SLIDE_PREVIEW_STATE_ID,
          name: injected.stateName,
          nodeOverrides: {},
        }],
      },
      interactions: structuredClone(projected.interactions),
    }],
    assets: structuredClone(injected.previewResources.assets),
    componentPackages: structuredClone(
      injected.previewResources.componentPackages,
    ),
    globalLayer: (injected.globalCarrierLayerItems ?? []).map((item) => ({
      node: structuredClone(item.node),
      layer: item.layer,
      visibility: { mode: 'all', sceneIds: [] },
    })),
    globalInteractions: [],
    ...(injected.globalRuntime
      ? { globalRuntime: structuredClone(injected.globalRuntime) }
      : {}),
    designTokens: structuredClone(injected.previewResources.designTokens),
    media: structuredClone(injected.previewResources.media),
    playback: {
      controls: 'none',
      keyboardNavigation: false,
      presenter: {
        enabled: false,
        strategy: 'scene-navigation',
        additionalBindings: [],
      },
    },
  }
}
