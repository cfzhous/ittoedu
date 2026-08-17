import type { CourseProjectDocument, CourseSurfaceDocument } from '../../shared/courseProjectTypes'
import {
  type CourseEditorLayoutSnapshot,
  deriveCourseEditorLayout,
} from './courseEditorLayout'
import {
  addCourseSurface,
  createBlankFlowCourseProject,
  createBlankSlideCourseProject,
  createBlankSpatialCourseProject,
  createCourseHistory,
  deleteCourseSurface,
  deleteFlowBlock,
  deleteSlideScene,
  type CourseProjectCreateInput,
  reorderCoursePageGroups,
} from './courseStudioModel'
import { deleteSpatialCameraFrame } from './spatialCameraCommands'

export interface CourseLocationCommandResult {
  readonly project: CourseProjectDocument
  readonly activatedLocationId: string
  readonly layout: CourseEditorLayoutSnapshot
}

export interface CourseLocationSelectionResult {
  readonly activatedLocationId: string
  readonly authoringScope: 'location' | 'global-layer'
  readonly layout: CourseEditorLayoutSnapshot
}

export type CoursePageSurfaceType = CourseSurfaceDocument['type']

function commandResult(
  project: CourseProjectDocument,
  activatedLocationId: string,
): CourseLocationCommandResult {
  return {
    project,
    activatedLocationId,
    layout: deriveCourseEditorLayout(project),
  }
}

function requireLocation(
  project: Pick<CourseProjectDocument, 'locations'>,
  locationId: string,
) {
  const location = project.locations.find((candidate) => candidate.id === locationId)
  if (!location) throw new Error(`找不到课程位置：${locationId}`)
  return location
}

function addedLocationId(
  previous: CourseProjectDocument,
  next: CourseProjectDocument,
): string {
  const previousIds = new Set(previous.locations.map((location) => location.id))
  const added = next.locations.find((location) => !previousIds.has(location.id))
  return added?.id ?? next.startLocationId
}

export function createBlankSlideCourse(
  input: CourseProjectCreateInput = {},
): CourseLocationCommandResult {
  const project = createBlankSlideCourseProject(input)
  return commandResult(project, project.startLocationId)
}

export function createBlankFlowCourse(
  input: CourseProjectCreateInput = {},
): CourseLocationCommandResult {
  const project = createBlankFlowCourseProject(input)
  return commandResult(project, project.startLocationId)
}

export function createBlankSpatialCourse(
  input: CourseProjectCreateInput = {},
): CourseLocationCommandResult {
  const project = createBlankSpatialCourseProject(input)
  return commandResult(project, project.startLocationId)
}

export function addCoursePage(
  project: CourseProjectDocument,
  type: CoursePageSurfaceType,
  options: { id?: string; title?: string; now?: string } = {},
): CourseLocationCommandResult {
  const next = addCourseSurface(project, type, options)
  return commandResult(next, addedLocationId(project, next))
}

export function deleteCourseLocation(
  project: CourseProjectDocument,
  locationId: string,
  options: { now?: string; activeLocationId?: string } = {},
): CourseLocationCommandResult {
  if (project.locations.length <= 1) {
    throw new Error('不可删除最后一个课程位置')
  }
  const location = requireLocation(project, locationId)
  const siblings = project.locations.filter((candidate) => candidate.surfaceId === location.surfaceId)
  const now = options.now

  let next: CourseProjectDocument
  if (siblings.length <= 1) {
    next = deleteCourseSurface(project, location.surfaceId, now)
  } else if (location.kind === 'slide-scene') {
    next = deleteSlideScene(project, location.surfaceId, location.sceneId, now)
  } else if (location.kind === 'flow-block') {
    next = deleteFlowBlock(project, location.surfaceId, location.blockId, now)
  } else {
    next = deleteSpatialCameraFrame(
      createCourseHistory(project),
      location.surfaceId,
      location.cameraFrameId,
      now,
    ).present
  }

  const preferred = options.activeLocationId ?? locationId
  const activatedLocationId = next.locations.some((candidate) => candidate.id === preferred)
    ? preferred
    : next.startLocationId
  return commandResult(next, activatedLocationId)
}

export function reorderCoursePages(
  project: CourseProjectDocument,
  surfaceIds: readonly string[],
  options: { now?: string; activeLocationId?: string } = {},
): CourseLocationCommandResult {
  const next = reorderCoursePageGroups(project, surfaceIds, options.now)
  const preferred = options.activeLocationId ?? project.startLocationId
  const activatedLocationId = next.locations.some((candidate) => candidate.id === preferred)
    ? preferred
    : next.startLocationId
  return commandResult(next, activatedLocationId)
}

export function selectCourseLocation(
  project: Pick<CourseProjectDocument, 'locations' | 'surfaces'>,
  locationId: string,
): CourseLocationSelectionResult {
  requireLocation(project, locationId)
  return {
    activatedLocationId: locationId,
    authoringScope: 'location',
    layout: deriveCourseEditorLayout(project),
  }
}

export function selectGlobalLayerScope(
  project: Pick<CourseProjectDocument, 'locations' | 'surfaces'>,
  currentLocationId: string,
): CourseLocationSelectionResult {
  requireLocation(project, currentLocationId)
  return {
    activatedLocationId: currentLocationId,
    authoringScope: 'global-layer',
    layout: deriveCourseEditorLayout(project),
  }
}
