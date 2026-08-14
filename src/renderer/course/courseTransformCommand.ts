import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import {
  updateLayerItems,
  type CourseLayerItemLocation,
} from './courseStudioModel'
import type { CourseTransformItem } from './courseTransformGeometry'

export interface CourseTransformTarget extends CourseLayerItemLocation {}

/**
 * Converts one completed pointer/keyboard gesture into one V9 project revision.
 * Preview geometry never enters this function; callers invoke it only on commit.
 */
export function commitCourseTransform(
  project: CourseProjectDocument,
  targets: readonly CourseTransformTarget[],
  transformedItems: readonly CourseTransformItem[],
  now?: string,
): CourseProjectDocument {
  if (transformedItems.length === 0) return project
  const targetById = new Map(targets.map((target) => [target.layerItemId, target]))
  if (targetById.size !== targets.length) throw new Error('变换目标包含重复图层。')
  if (transformedItems.length !== targetById.size) throw new Error('变换结果与当前选择不一致。')

  return updateLayerItems(project, transformedItems.map((transformed) => {
    const target = targetById.get(transformed.layerItemId)
    if (!target) throw new Error(`变换结果包含未选中的图层：${transformed.layerItemId}`)
    return {
      ...target,
      update(item) {
        if (item.locked) throw new Error(`图层“${item.label}”已锁定，不能变换。`)
        item.frame = structuredClone(transformed.frame)
        item.rotation = transformed.rotation
      },
    }
  }), now)
}
