import type { InteractionRule } from '../../shared/interactionTypes'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import { updateCourseProject } from './courseStudioModel'

/**
 * Replaces one Slide scene's complete interaction list as one V9 transaction.
 * The shared Course Project Schema remains the final authority for every rule.
 */
export function replaceSlideSceneInteractions(
  project: CourseProjectDocument,
  surfaceId: string,
  sceneId: string,
  rules: readonly InteractionRule[],
  now?: string,
): CourseProjectDocument {
  return updateCourseProject(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === surfaceId)
    if (!surface || surface.type !== 'slide') {
      throw new Error('当前互动只能写入幻灯片表面。')
    }
    const scene = surface.scenes.find((candidate) => candidate.id === sceneId)
    if (!scene) throw new Error('当前幻灯片场景已不存在。')
    scene.interactions = structuredClone([...rules])
  }, now)
}
