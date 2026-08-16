import type { CourseLocation, CourseProjectDocument } from '@/shared/courseProjectTypes'
import {
  buildPublishedCourseV2Payload,
  type CoursePublishSources,
} from '@/renderer/export/course/buildPublishedCourse'
import { COURSE_PLAYER_CSS } from '@/renderer/export/course/buildCoursePackages'

/**
 * Where a trial run starts: the author's current location, plus the current
 * presentation state whenever the location itself does not pin one.
 */
export interface TrialRunStart {
  readonly locationId: string
  readonly stateId?: string
}

/**
 * Locations whose kind owns a meaningful "current position" for a trial
 * run. Flow and Spatial locations start from their selected block/camera;
 * slide-scene keeps its existing state-carrying behavior.
 */
export function trialRunSupportedForLocation(location: CourseLocation): boolean {
  switch (location.kind) {
    case 'slide-scene':
    case 'flow-block':
    case 'spatial-camera':
      return true
    default:
      return false
  }
}

export interface TrialRunSelection {
  readonly locationId: string
  /** `null` means the author is editing the base (initial) scene state. */
  readonly stateId: string | null
}

/**
 * Resolves the trial-run entry from the live authoring selection. Every doubt
 * falls back to a plain location entry: unknown selection → start location,
 * missing/foreign state → the location's own initial state.
 */
export function resolveTrialRunStart(
  project: Pick<CourseProjectDocument, 'locations' | 'startLocationId' | 'surfaces'>,
  selection: TrialRunSelection,
): TrialRunStart {
  const selected = project.locations.find((entry) => entry.id === selection.locationId)
  const location =
    selected ??
    project.locations.find((entry) => entry.id === project.startLocationId) ??
    project.locations[0]
  if (!location) throw new Error('课件还没有任何位置，无法试运行')
  // The stateId is only meaningful relative to the selected location's scene;
  // a fallback location never inherits it.
  if (
    !selected ||
    location.kind !== 'slide-scene' ||
    selection.stateId === null ||
    location.stateId !== undefined
  ) {
    return { locationId: location.id }
  }
  const surface = project.surfaces.find((entry) => entry.id === location.surfaceId)
  const scene = surface?.type === 'slide'
    ? surface.scenes.find((entry) => entry.id === location.sceneId)
    : undefined
  const stateExists = scene?.presentation?.states.some(
    (entry) => entry.id === selection.stateId,
  ) === true
  return stateExists
    ? { locationId: location.id, stateId: selection.stateId }
    : { locationId: location.id }
}

export interface TrialRunOverlayResource {
  readonly url: string
  revoke(): void
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * The trial run is a full Published Course V2 snapshot running in its own
 * overlay iframe. It never writes the Project, history, revision, selection
 * or viewport of the editor; once the frame unloads, `revoke` releases the
 * Blob URLs.
 *
 * blob: documents inherit the editor window CSP, which forbids inline scripts
 * but allows blob: script sources. The standalone document therefore loads its
 * payload and player bundle as external blob: scripts instead of inlining them
 * the way `buildPublishedCourseStandaloneHtml` does.
 */
export function createTrialRunOverlay(
  sources: CoursePublishSources,
  start: TrialRunStart,
  playerBundle: string,
): TrialRunOverlayResource {
  const payload = buildPublishedCourseV2Payload(sources)
  const serialized = JSON.stringify(payload)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  const blobUrls: string[] = []
  const createBlobUrl = (content: string, type: string): string => {
    const url = URL.createObjectURL(new Blob([content], { type }))
    blobUrls.push(url)
    return url
  }
  try {
    const payloadUrl = createBlobUrl(
      `window.__H5_COURSE_PAYLOAD__=${serialized};`,
      'text/javascript',
    )
    const playerUrl = createBlobUrl(playerBundle, 'text/javascript')
    const params = new URLSearchParams()
    params.set('location', start.locationId)
    if (start.stateId !== undefined) params.set('state', start.stateId)
    const title = escapeHtml(payload.title)
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src blob: 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src data: blob:; worker-src blob:">
<title>${title}</title>
<style>${COURSE_PLAYER_CSS}</style>
</head>
<body>
<div id="course-root" aria-label="${title}"></div>
<script src="${payloadUrl}"></script>
<script src="${playerUrl}"></script>
</body>
</html>
`
    const htmlUrl = createBlobUrl(html, 'text/html')
    return {
      url: `${htmlUrl}#${params.toString()}`,
      revoke() {
        for (const url of blobUrls) URL.revokeObjectURL(url)
      },
    }
  } catch (error) {
    for (const url of blobUrls) URL.revokeObjectURL(url)
    throw error
  }
}
