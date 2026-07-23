import type { ComponentHostActions } from '../shared/componentTypes'

export interface PlayerComponentActionTarget {
  goToSceneById(sceneId: string, targetStateId?: string): boolean
  nextScene(): boolean
  previousScene(): boolean
  replayScene(): boolean
  restartCourse(): boolean
}

/** Creates the stable, deliberately narrow host surface exposed to components. */
export function createPlayerComponentHostActions(
  target: PlayerComponentActionTarget,
): Readonly<ComponentHostActions> {
  return Object.freeze({
    goToScene: (sceneId: string, targetStateId?: string) =>
      target.goToSceneById(sceneId, targetStateId),
    nextScene: () => target.nextScene(),
    previousScene: () => target.previousScene(),
    replayScene: () => target.replayScene(),
    restartCourse: () => target.restartCourse(),
  })
}
