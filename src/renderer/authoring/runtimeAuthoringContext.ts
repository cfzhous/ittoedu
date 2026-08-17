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

/**
 * Persistable Runtime authoring identity. Session-local `targetId` / DOM hit
 * handles are never a save address; only the declared content or asset key is.
 */
export function runtimePersistedAuthoringField(
  target: Pick<RuntimeAuthoringTarget, 'key'>,
): string {
  return target.key
}

export function isEphemeralRuntimeHitIdentity(value: string): boolean {
  return /^(?:registered|dom|hit)[:/]/i.test(value) || /hitId/i.test(value)
}

export const RUNTIME_SAME_SCENE_LIMIT_MESSAGE =
  '编辑器宿主每个场景或共用层只投射第一个已启用的 Runtime API 2 层；其余 Runtime 仍保存在工程中，并由 Published Player 播放。'

export function runtimeSameSceneLimitMessage(): string {
  return RUNTIME_SAME_SCENE_LIMIT_MESSAGE
}
