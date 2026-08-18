import { migrateProjectV8ToCourseProjectV9 } from '@/shared/courseProjectModel'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import { createProject, type CreateProjectOptions } from './createProject'

/**
 * Default Course Project V9 factory for R3-CUT.
 *
 * Builds a valid V9 Slide document (including the default teacher controller)
 * without leaving a V8 `ProjectDocument` in the product store. The V8
 * `createProject()` helper is only a template for migration; callers must hold
 * the returned Course Project as the session truth.
 */
export function createBlankCourseProject(
  options: CreateProjectOptions = {},
): CourseProjectDocument {
  return migrateProjectV8ToCourseProjectV9(createProject(options))
}
