import type { ComponentPackageData } from '../../shared/componentTypes'
import type { ProjectDocument, SceneDocument } from '../../shared/projectTypes'
import type {
  NodeSelectionEvent,
  NodesMoveEndEvent,
} from '../phaser/EditorPhaserBridge'

/**
 * Ephemeral read/callback seam for the existing Workspace canvas. Workspace
 * never persists or mutates the supplied document; the owning backend handles
 * every selection and completed move.
 */
export interface WorkspaceSlideAuthoringInput {
  readonly document: SceneDocument
  readonly componentPackages: Record<string, ComponentPackageData>
  readonly selectedNodeIds: readonly string[]
  readonly onSelectionChange: (event: Readonly<NodeSelectionEvent>) => void
  readonly onMoveEnd: (event: Readonly<NodesMoveEndEvent>) => void
}

/** Selects exactly one backend. Inputs are never combined or copied. */
export function resolveWorkspaceSlideAuthoringInput(
  fallback: WorkspaceSlideAuthoringInput,
  injected: WorkspaceSlideAuthoringInput | undefined,
): WorkspaceSlideAuthoringInput {
  return injected ?? fallback
}

/**
 * Builds the isolated Player's read-only compatibility payload. The V8 Store
 * remains untouched; only the active scene's visual data is replaced by the
 * owning backend's projected SceneDocument.
 */
export function createWorkspaceSlidePreviewProject(
  project: ProjectDocument,
  activeSceneId: string,
  injected: WorkspaceSlideAuthoringInput | undefined,
): ProjectDocument {
  if (!injected) return project
  if (!project.scenes.some((scene) => scene.id === activeSceneId)) {
    throw new Error(`Player 预览场景不存在：${activeSceneId}`)
  }
  const projected = injected.document
  return {
    ...project,
    scenes: project.scenes.map((scene) => scene.id === activeSceneId
      ? {
          ...scene,
          backgroundColor: projected.backgroundColor,
          backgroundAssetId: projected.backgroundAssetId ?? null,
          nodes: structuredClone(projected.nodes),
          interactions: structuredClone(projected.interactions),
        }
      : scene),
  }
}
