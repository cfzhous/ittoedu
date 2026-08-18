import type { ComponentPackageData } from '../../shared/componentTypes'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import { SpatialSurfaceHost } from '../../player/surfaces/spatial/SpatialSurfaceHost'
import { buildPublishedCourseV2Payload } from '../export/course/buildPublishedCourse'

/**
 * Workspace current-location try-run. Does not import Phaser or the Slide
 * preview iframe. Tests should import this module instead of Workspace.tsx.
 */
export async function mountSpatialLocationTryRun(input: {
  container: HTMLElement
  project: CourseProjectDocument
  assetFiles?: Record<string, Uint8Array>
  components?: Record<string, ComponentPackageData>
  locationId: string
  playbackPathId?: string | null
  width?: number
  height?: number
}) {
  const host = SpatialSurfaceHost.fromPublishedCourse(
    buildPublishedCourseV2Payload({
      project: input.project,
      assetFiles: input.assetFiles ?? {},
      components: input.components ?? {},
    }),
    {
      width: input.width ?? Math.max(1, input.container.clientWidth || 800),
      height: input.height ?? Math.max(1, input.container.clientHeight || 450),
    },
    {
      locationId: input.locationId,
      playbackPathId: input.playbackPathId ?? null,
    },
  )
  await host.mount(input.container)
  await host.activate()
  return host
}
