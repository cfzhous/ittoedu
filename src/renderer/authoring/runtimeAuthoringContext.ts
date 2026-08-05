import type { RuntimeAuthoringTarget } from '../../shared/runtimeTypes'

/** Keeps scene/global Runtime targets bound to the scope currently being edited. */
export function runtimeTargetMatchesEditingContext(
  target: Pick<RuntimeAuthoringTarget, 'scope' | 'sceneId'>,
  editingScope: 'scene' | 'global',
  activeSceneId: string,
): boolean {
  return editingScope === 'scene'
    ? target.scope === 'scene' && target.sceneId === activeSceneId
    : target.scope === 'global'
}
