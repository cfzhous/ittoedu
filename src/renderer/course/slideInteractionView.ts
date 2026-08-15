import { createDefaultScenePresentation } from '../../shared/presentation'
import type {
  CourseProjectDocument,
  SlidePresentation,
} from '../../shared/courseProjectTypes'
import type {
  SceneDocument,
  SceneNode,
  ScenePresentation,
  SoundDefinition,
} from '../../shared/projectTypes'
import type { InteractionRule } from '../../shared/interactionTypes'

/**
 * V8-shaped scene summaries consumed by the store-agnostic interaction
 * editors. V9 slide presentations are projected into the V8 ScenePresentation
 * shape; node overrides are never round-tripped here.
 */
export interface V9InteractionSceneSummary {
  readonly id: string
  readonly name: string
  readonly presentation: ScenePresentation
}

function v9PresentationToScenePresentation(
  presentation: SlidePresentation | undefined,
): ScenePresentation {
  if (!presentation || presentation.states.length === 0) {
    return createDefaultScenePresentation()
  }
  return {
    initialStateId: presentation.initialStateId,
    ...(presentation.thumbnailStateId === undefined
      ? {}
      : { thumbnailStateId: presentation.thumbnailStateId }),
    states: presentation.states.map((state) => ({
      id: state.id,
      name: state.name,
      nodeOverrides: {},
    })),
  }
}

export function v9SlideScenes(
  project: CourseProjectDocument,
): V9InteractionSceneSummary[] {
  const scenes: V9InteractionSceneSummary[] = []
  for (const surface of project.surfaces) {
    if (surface.type !== 'slide') continue
    for (const scene of surface.scenes) {
      scenes.push({
        id: scene.id,
        name: scene.name,
        presentation: v9PresentationToScenePresentation(scene.presentation),
      })
    }
  }
  return scenes
}

/** Builds the read-only V8-shaped scene document the interaction editors need. */
export function v9InteractionSceneDocument(
  sceneId: string,
  sceneName: string,
  nodes: readonly SceneNode[],
  interactions: readonly InteractionRule[],
  presentation: V9InteractionSceneSummary['presentation'] | undefined,
): SceneDocument {
  return {
    id: sceneId,
    name: sceneName,
    backgroundColor: '#ffffff',
    nodes: [...nodes],
    interactions: [...interactions],
    ...(presentation === undefined ? {} : { presentation }),
  }
}

export function v9InteractionSounds(
  project: CourseProjectDocument,
): Record<string, SoundDefinition> {
  return project.media.audio.sounds
}
