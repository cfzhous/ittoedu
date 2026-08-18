import type { ComponentPackageData } from '../../shared/componentTypes'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import { FlowSurfaceHost } from '../../player/surfaces/flow/FlowSurfaceHost'
import { buildPublishedCourseV2Payload } from '../export/course/buildPublishedCourse'

/**
 * Workspace current-location try-run for Flow. Does not import Phaser or the
 * Slide preview iframe. Tests should import this module instead of Workspace.tsx.
 */
export async function mountFlowLocationTryRun(input: {
  container: HTMLElement
  project: CourseProjectDocument
  assetFiles?: Record<string, Uint8Array>
  components?: Record<string, ComponentPackageData>
  locationId: string
}) {
  const published = buildPublishedCourseV2Payload({
    project: input.project,
    assetFiles: input.assetFiles ?? {},
    components: input.components ?? {},
  })
  const host = new FlowSurfaceHost(published, {
    locationId: input.locationId,
    initialTocOpen: false,
  })
  await host.mount(input.container)
  await host.activate()
  return host
}
