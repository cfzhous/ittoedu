import type { CourseSurfaceType } from '../../shared/courseProjectTypes'

export type CourseAuthoringSurfaceType = Extract<
  CourseSurfaceType,
  'slide' | 'flow' | 'spatial-2d'
>

export interface CourseAuthoringSessionToken {
  readonly locationId: string
  readonly surfaceType: CourseAuthoringSurfaceType
  readonly revision: number
  readonly generation: number
}

export interface CourseAuthoringSession {
  readonly token: CourseAuthoringSessionToken
  readonly itemIds: readonly string[]
}

export const COURSE_AUTHORING_STALE_SESSION_REASON =
  '编辑会话已过期，请重新选择当前页面'

export const COURSE_AUTHORING_TEXT_COMPOSING_SWITCH_REASON =
  '文字尚未提交，请先完成或取消编辑后再切换页面'

export function createCourseAuthoringSession(input: {
  readonly locationId: string
  readonly surfaceType: CourseAuthoringSurfaceType
  readonly revision: number
  readonly itemIds?: readonly string[]
}): CourseAuthoringSession {
  return freezeSession({
    token: createSessionToken(input, 0),
    itemIds: input.itemIds ?? [],
  })
}

export function createSessionToken(
  input: {
    readonly locationId: string
    readonly surfaceType: CourseAuthoringSurfaceType
    readonly revision: number
  },
  generation: number,
): CourseAuthoringSessionToken {
  if (!input.locationId.trim()) throw new TypeError('locationId 不能为空')
  if (!Number.isInteger(input.revision) || input.revision < 0) {
    throw new TypeError('revision 必须是非负整数')
  }
  if (!Number.isInteger(generation) || generation < 0) {
    throw new TypeError('generation 必须是非负整数')
  }
  return Object.freeze({
    locationId: input.locationId,
    surfaceType: input.surfaceType,
    revision: input.revision,
    generation,
  })
}

export function updateCourseAuthoringSessionItems(
  session: CourseAuthoringSession,
  itemIds: readonly string[],
): CourseAuthoringSession {
  return freezeSession({
    token: session.token,
    itemIds: Object.freeze([...itemIds]),
  })
}

export function updateCourseAuthoringSessionRevision(
  session: CourseAuthoringSession,
  revision: number,
): CourseAuthoringSession {
  if (!Number.isInteger(revision) || revision < 0) {
    throw new TypeError('revision 必须是非负整数')
  }
  return freezeSession({
    token: Object.freeze({ ...session.token, revision }),
    itemIds: session.itemIds,
  })
}

export function canSwitchCourseAuthoringLocation(input: {
  readonly composing?: boolean
}): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (input.composing) {
    return { ok: false, reason: COURSE_AUTHORING_TEXT_COMPOSING_SWITCH_REASON }
  }
  return { ok: true }
}

export function switchCourseAuthoringLocation(
  session: CourseAuthoringSession,
  input: {
    readonly locationId: string
    readonly surfaceType: CourseAuthoringSurfaceType
    readonly revision: number
    readonly composing?: boolean
  },
): CourseAuthoringSession | { readonly ok: false; readonly reason: string } {
  const guard = canSwitchCourseAuthoringLocation(input)
  if (!guard.ok) return guard

  if (
    session.token.locationId === input.locationId &&
    session.token.surfaceType === input.surfaceType
  ) {
    return freezeSession({
      token: createSessionToken(input, session.token.generation),
      itemIds: [],
    })
  }

  return freezeSession({
    token: createSessionToken(input, session.token.generation + 1),
    itemIds: [],
  })
}

export function isFreshCourseAuthoringSessionToken(
  current: CourseAuthoringSessionToken,
  expected: Pick<CourseAuthoringSessionToken, 'locationId' | 'generation'>,
): boolean {
  return current.locationId === expected.locationId &&
    current.generation === expected.generation
}

export function rejectStaleCourseAuthoringSessionToken(
  current: CourseAuthoringSessionToken,
  expected: Pick<CourseAuthoringSessionToken, 'locationId' | 'generation'>,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  if (isFreshCourseAuthoringSessionToken(current, expected)) {
    return { ok: true }
  }
  return { ok: false, reason: COURSE_AUTHORING_STALE_SESSION_REASON }
}

export function guardCourseAuthoringSessionCallback<T>(
  session: CourseAuthoringSession,
  expected: Pick<CourseAuthoringSessionToken, 'locationId' | 'generation'>,
  run: () => T,
): T | { readonly ok: false; readonly reason: string } {
  const guard = rejectStaleCourseAuthoringSessionToken(session.token, expected)
  if (!guard.ok) return guard
  return run()
}

export function selectionSnapshotFromSession(
  session: CourseAuthoringSession,
  input: {
    readonly scope: 'location' | 'global'
    readonly focus: 'none' | 'text' | 'block' | 'overlay' | 'layer'
  },
): {
  readonly locationId: string
  readonly revision: number
  readonly sessionGeneration: number
  readonly surfaceKind: CourseAuthoringSurfaceType
  readonly scope: 'location' | 'global'
  readonly focus: 'none' | 'text' | 'block' | 'overlay' | 'layer'
  readonly itemIds: readonly string[]
} {
  return Object.freeze({
    locationId: session.token.locationId,
    revision: session.token.revision,
    sessionGeneration: session.token.generation,
    surfaceKind: session.token.surfaceType,
    scope: input.scope,
    focus: input.focus,
    itemIds: session.itemIds,
  })
}

function freezeSession(session: CourseAuthoringSession): CourseAuthoringSession {
  return Object.freeze({
    token: Object.freeze({ ...session.token }),
    itemIds: Object.freeze([...session.itemIds]),
  })
}
