import type { CourseProjectDocument, CourseLocation } from '../../shared/courseProjectTypes'
import type { TeacherControllerAction } from '../../shared/projectTypes'
import {
  DeclarativeCourseState,
  type CourseNavigationEntryPoint,
} from '../../player/DeclarativeCourseState'

export interface CourseStudioSessionCallbacks {
  getActiveSurfaceId(): string
  getActiveSceneId(surfaceId: string): string | undefined
  activateLocation(location: CourseLocation): void
  setPresentationState(surfaceId: string, stateId: string): boolean
  presentationState(surfaceId: string): {
    current: string | null
    states: Array<{ id: string; name: string; description?: string }>
  }
  resetPlayback?(scope: 'surface' | 'course', target: CourseLocation): void
  onBlocked(message: string): void
}

export interface CourseStudioSessionRestore {
  locationId?: string
  stateValues?: Readonly<Record<string, unknown>>
}

function locationForScene(
  project: CourseProjectDocument,
  sceneId: string,
  stateId?: string,
): CourseLocation | undefined {
  const scene = project.surfaces
    .filter((surface) => surface.type === 'slide')
    .flatMap((surface) => surface.scenes)
    .find((candidate) => candidate.id === sceneId)
  const effectiveStateId = stateId ?? scene?.presentation?.initialStateId
  const exact = effectiveStateId === undefined ? undefined : project.locations.find((location) => (
    location.kind === 'slide-scene' &&
    location.sceneId === sceneId &&
    location.stateId === effectiveStateId
  ))
  if (exact) return exact
  const base = project.locations.find((location) => (
    location.kind === 'slide-scene' &&
    location.sceneId === sceneId &&
    location.stateId === undefined
  )) ?? project.locations.find((location) => (
    location.kind === 'slide-scene' && location.sceneId === sceneId
  ))
  return base
}

/** One V9 editor playback session: state, guard chain and navigation authority. */
export class CourseStudioPlaybackSession {
  readonly state: DeclarativeCourseState
  #currentLocationId: string

  constructor(
    readonly project: CourseProjectDocument,
    private readonly callbacks: CourseStudioSessionCallbacks,
    restore: CourseStudioSessionRestore = {},
  ) {
    this.state = new DeclarativeCourseState(project)
    for (const [key, value] of Object.entries(restore.stateValues ?? {})) {
      try { this.state.set(key, value as never) } catch { /* changed declarations keep their defaults */ }
    }
    this.#currentLocationId = restore.locationId && project.locations.some((location) => location.id === restore.locationId)
      ? restore.locationId
      : project.startLocationId
  }

  get currentLocationId(): string { return this.#currentLocationId }

  setInspectionMode(inspecting: boolean): void {
    this.state.setFrozen(inspecting)
  }

  authorActivate(location: CourseLocation): void {
    this.#currentLocationId = location.id
    this.callbacks.activateLocation(location)
  }

  navigate(
    location: CourseLocation,
    entryPoint: CourseNavigationEntryPoint,
  ): boolean {
    const decision = this.state.requestNavigation({
      entryPoint,
      fromLocationId: this.#currentLocationId,
      toLocationId: location.id,
    })
    if (!decision.allowed) {
      this.callbacks.onBlocked(decision.blockedBy.map((item) => item.message).join('\n'))
      return false
    }
    this.#currentLocationId = location.id
    this.callbacks.activateLocation(location)
    return true
  }

  goToScene(
    sceneId: string,
    stateId?: string,
    entryPoint: 'runtime' | 'component' | 'teacher-controller' = 'runtime',
  ): boolean {
    const location = locationForScene(this.project, sceneId, stateId)
    if (!location) return false
    const navigated = this.navigate(location, entryPoint)
    if (
      navigated &&
      stateId !== undefined &&
      location.kind === 'slide-scene' &&
      location.stateId !== stateId
    ) {
      this.setPresentationState(location.surfaceId, stateId)
    }
    return navigated
  }

  next(entryPoint: 'runtime' | 'component' | 'teacher-controller' = 'runtime'): boolean {
    const index = this.project.locations.findIndex((location) => location.id === this.#currentLocationId)
    const next = this.project.locations[index + 1]
    return next ? this.navigate(next, entryPoint) : false
  }

  previous(entryPoint: 'runtime' | 'component' | 'teacher-controller' = 'runtime'): boolean {
    const index = this.project.locations.findIndex((location) => location.id === this.#currentLocationId)
    const previous = this.project.locations[index - 1]
    return previous ? this.navigate(previous, entryPoint) : false
  }

  replay(): boolean {
    const current = this.project.locations.find((location) => location.id === this.#currentLocationId)
    if (current) this.callbacks.resetPlayback?.('surface', current)
    return current ? this.navigate(current, 'replay') : false
  }

  restart(): boolean {
    const frozen = this.state.isFrozen()
    if (frozen) return false
    const decision = this.state.restart()
    const location = this.project.locations.find((candidate) => candidate.id === decision.toLocationId)
    if (!location) return false
    this.callbacks.resetPlayback?.('course', location)
    this.#currentLocationId = location.id
    this.callbacks.activateLocation(location)
    return true
  }

  beforeTeacherAction(action: TeacherControllerAction): boolean {
    if (action.type === 'scene.go') return this.goToScene(action.sceneId, action.targetStateId, 'teacher-controller')
    if (action.type === 'scene.next') return this.next('teacher-controller')
    if (action.type === 'scene.previous') return this.previous('teacher-controller')
    if (action.type === 'scene.replay') return this.replay()
    if (action.type === 'course.restart') return this.restart()
    return true
  }

  setPresentationState(surfaceId: string, stateId: string): boolean {
    const accepted = this.callbacks.setPresentationState(surfaceId, stateId)
    if (!accepted) return false
    const sceneId = this.callbacks.getActiveSceneId(surfaceId)
    if (sceneId) this.syncPresentationLocation(surfaceId, sceneId, stateId)
    return true
  }

  /** Synchronizes course scope/progress after the live Slide host changes state itself. */
  syncPresentationLocation(surfaceId: string, sceneId: string, stateId: string): void {
    const location = locationForScene(this.project, sceneId, stateId)
    if (location?.surfaceId === surfaceId) this.#currentLocationId = location.id
  }

  presentationState(surfaceId: string) {
    return this.callbacks.presentationState(surfaceId)
  }
}
