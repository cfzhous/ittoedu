import type { ComponentPackageData } from '../../shared/componentTypes'
import type { SceneDocument } from '../../shared/projectTypes'
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
