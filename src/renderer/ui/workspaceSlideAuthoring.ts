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
}

export interface WorkspaceSlidePreviewResources {
  readonly assets: ProjectDocument['assets']
  readonly assetFiles: Readonly<Record<string, Uint8Array>>
  readonly componentPackages: ProjectDocument['componentPackages']
  readonly designTokens: ProjectDocument['designTokens']
  readonly media: ProjectDocument['media']
}

/** Explicit source provenance for a V9 canvas proxy. */
export interface WorkspaceSlideAuthoringTarget {
  readonly source: WorkspaceSlideEditingScope
  readonly layerItemId: string
}

/**
 * A one-shot, in-memory request to reveal an already-selected controller in
 * the current workspace. It is deliberately separate from the Course Project
 * data model: locating never copies, recreates, or persists a layer.
 */
export interface WorkspaceControllerLocateRequest {
  readonly layerItemId: string
  /** Increments even when the teacher locates the same controller twice. */
  readonly requestId: number
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
  /** Optional V9-only focus/reveal request for a global controller proxy. */
  readonly controllerLocateRequest?: WorkspaceControllerLocateRequest | null
  /**
   * V9-only ownership map for document nodes. Legacy callers omit it and
   * retain their existing single-document behavior.
   */
  readonly authoringTargets?: ReadonlyMap<string, WorkspaceSlideAuthoringTarget>
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

function isGlobalTeacherControllerTarget(
  injected: WorkspaceSlideAuthoringInput,
  nodeId: string,
): boolean {
  const target = injected.authoringTargets?.get(nodeId)
  if (target?.source !== 'global') return false
  return injected.document.nodes.some((node) => (
    node.id === nodeId && node.type === 'teacher-controller'
  ))
}

function hasMixedGlobalTeacherControllerTargets(
  injected: WorkspaceSlideAuthoringInput | undefined,
  nodeIds: readonly string[],
): boolean {
  if (!injected?.authoringTargets) return false
  const ids = new Set(nodeIds)
  const hasGlobalController = [...ids].some((nodeId) => (
    isGlobalTeacherControllerTarget(injected, nodeId)
  ))
  return hasGlobalController && [...ids].some((nodeId) => {
    const target = injected.authoringTargets?.get(nodeId)
    return target !== undefined && target.source !== 'global'
  })
}

/** Detects a forbidden mixed selection before the Workspace mutates its UI. */
export function workspaceSelectionHasMixedGlobalTeacherController(
  injected: WorkspaceSlideAuthoringInput | undefined,
  event: Readonly<NodeSelectionEvent>,
): boolean {
  if (!injected) return false
  const nodeIds = event.additive
    ? [...new Set([...injected.selectedNodeIds, ...event.nodeIds])]
    : event.nodeIds
  return hasMixedGlobalTeacherControllerTargets(injected, nodeIds)
}

/** Detects a forbidden mixed transform before preview or persistence. */
export function workspaceTransformHasMixedGlobalTeacherController(
  injected: WorkspaceSlideAuthoringInput | undefined,
  event: Readonly<NodesTransformEndEvent>,
): boolean {
  return hasMixedGlobalTeacherControllerTargets(
    injected,
    event.nodes.map((node) => node.nodeId),
  )
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
  }) && !workspaceSelectionHasMixedGlobalTeacherController(injected, event)
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
  }) && !workspaceTransformHasMixedGlobalTeacherController(injected, event)
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
