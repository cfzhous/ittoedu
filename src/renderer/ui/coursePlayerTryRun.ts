import type { ComponentPackageData } from '../../shared/componentTypes'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import {
  createPublishedCourseSession,
  type PublishedCourseSession,
} from '../../player/surfaces/publishedDynamicHosts'
import { buildPublishedCourseV2Payload } from '../export/course/buildPublishedCourse'

export async function mountPublishedCourseTryRun(input: {
  container: HTMLElement
  project: CourseProjectDocument
  assetFiles: Readonly<Record<string, Uint8Array>>
  components: Readonly<Record<string, ComponentPackageData>>
  locationId?: string | null
  width?: number
  height?: number
}): Promise<PublishedCourseSession> {
  const published = buildPublishedCourseV2Payload({
    project: input.project,
    assetFiles: input.assetFiles,
    components: input.components,
  })
  const rect = input.container.getBoundingClientRect()
  const session = createPublishedCourseSession(published, {
    viewport: {
      width: Math.max(1, input.width || rect.width || 1280),
      height: Math.max(1, input.height || rect.height || 720),
    },
  })
  await session.mount(input.container)
  if (input.locationId) {
    try {
      await session.goToLocation(input.locationId)
    } catch {
      // Navigator already started at the course start location.
    }
  }
  return session
}
