import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../shared/constants'
import type { ComponentPackageData } from '../../shared/componentTypes'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import {
  createPublishedCourseSession,
  type PublishedCourseSession,
} from '../../player/surfaces/publishedDynamicHosts'
import { buildPublishedCourseV2Payload } from '../export/course/buildPublishedCourse'

function measureHostSize(container: HTMLElement): { width: number; height: number } {
  // Use the layout box, not getBoundingClientRect. Try-run mounts inside the
  // already CSS-scaled 1280×720 stage stack; a transformed rect would double-scale.
  const width = container.clientWidth
  const height = container.clientHeight
  return {
    width: width > 1 ? width : CANVAS_WIDTH,
    height: height > 1 ? height : CANVAS_HEIGHT,
  }
}

async function waitForHostSize(container: HTMLElement): Promise<{ width: number; height: number }> {
  let size = measureHostSize(container)
  if (size.width >= 8 && size.height >= 8) return size
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    resolve()
  })
  return measureHostSize(container)
}

/**
 * Letterbox a 1280×720 published Slide stage into its host. Without this the
 * adapter stays at CSS 1280×720 while the try-run / whole-course host fills
 * the viewport, which reads as a white or clipped page.
 */
export function fitPublishedCourseStage(container: HTMLElement): void {
  const { width, height } = measureHostSize(container)
  const scale = Math.min(width / CANVAS_WIDTH, height / CANVAS_HEIGHT)
  const left = (width - CANVAS_WIDTH * scale) / 2
  const top = (height - CANVAS_HEIGHT * scale) / 2
  for (const adapter of container.querySelectorAll<HTMLElement>('.slide-published-adapter')) {
    adapter.style.position = 'absolute'
    adapter.style.transformOrigin = '0 0'
    adapter.style.transform = `scale(${scale})`
    adapter.style.left = `${left}px`
    adapter.style.top = `${top}px`
    adapter.dataset.stageFitScale = String(scale)
  }
}

export function attachPublishedCourseStageFit(container: HTMLElement): () => void {
  fitPublishedCourseStage(container)
  if (typeof ResizeObserver !== 'function') return () => undefined
  const observer = new ResizeObserver(() => fitPublishedCourseStage(container))
  observer.observe(container)
  return () => observer.disconnect()
}

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
  const measured = await waitForHostSize(input.container)
  const session = createPublishedCourseSession(published, {
    viewport: {
      width: Math.max(1, input.width || measured.width),
      height: Math.max(1, input.height || measured.height),
    },
  })
  await session.mount(input.container)
  fitPublishedCourseStage(input.container)
  if (input.locationId) {
    try {
      await session.goToLocation(input.locationId)
    } catch {
      // Navigator already started at the course start location.
    }
  }
  fitPublishedCourseStage(input.container)
  return session
}
