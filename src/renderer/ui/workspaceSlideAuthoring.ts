import type { ComponentPackageData } from '../../shared/componentTypes'
import type { ProjectDocument, SceneDocument, SceneNode } from '../../shared/projectTypes'
import { renderTextNodeCanvas } from '../../shared/textLayout'
import type {
  NodeTransformEndEvent,
  NodeSelectionEvent,
  NodesTransformEndEvent,
} from '../phaser/EditorPhaserBridge'

export const WORKSPACE_SLIDE_PREVIEW_STATE_ID = 'state_workspace_preview'

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
  readonly document: SceneDocument
  readonly componentPackages: Record<string, ComponentPackageData>
  readonly previewResources: WorkspaceSlidePreviewResources
  readonly selectedNodeIds: readonly string[]
  /** Labels owned by the injected document backend, never by the V8 shell. */
  readonly sceneName: string
  readonly stateName: string
  readonly editingScope: 'scene' | 'global'
  /** Explains why legacy-only authoring commands are unavailable. */
  readonly unsupportedActionReason: string
  /** `false` rejects a gesture that raced with a lifecycle boundary. */
  readonly onSelectionChange: (event: Readonly<NodeSelectionEvent>) => boolean
  readonly onTransformEnd: (event: Readonly<NodesTransformEndEvent>) => boolean
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
 * before it can invoke a mutating command.
 */
export function workspaceAuthoringActionAllowed(
  injected: WorkspaceSlideAuthoringInput | undefined,
  _action: UnsupportedWorkspaceAuthoringAction,
): boolean {
  return !injected
}

/** V9 accepts the complete visible Native selection, including locked items. */
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
    return Boolean(node && node.type !== 'external-component' && node.visible)
  })
}

/** Validates one complete Native transform before it reaches the V9 command. */
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
      node.type !== 'external-component' &&
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
    : `${input.sceneName} · ${input.stateName}`
}

/**
 * Player reconstruction key. Frame/content values are patched through the
 * inspection channel; only topology and executable component identity rebuild
 * the isolated carrier.
 */
export function workspaceSlidePreviewStructuralKey(
  input: WorkspaceSlideAuthoringInput,
): string {
  return JSON.stringify({
    sceneId: input.document.id,
    nodes: input.document.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      ...(node.type === 'external-component'
        ? {
            packageId: node.component.packageId,
            version: node.component.version,
          }
        : {}),
    })),
    interactions: input.document.interactions,
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
  return injected?.document.id ?? legacySceneId
}

export function workspaceSlidePreviewAssetFiles(
  injected: WorkspaceSlideAuthoringInput | undefined,
  legacyAssetFiles: Readonly<Record<string, Uint8Array>>,
): Readonly<Record<string, Uint8Array>> {
  return injected?.previewResources.assetFiles ?? legacyAssetFiles
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
 */
export function createWorkspaceSlidePreviewProject(
  project: ProjectDocument,
  _activeSceneId: string,
  injected: WorkspaceSlideAuthoringInput | undefined,
): ProjectDocument {
  if (!injected) return project
  const projected = injected.document
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
    globalLayer: [],
    globalInteractions: [],
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
