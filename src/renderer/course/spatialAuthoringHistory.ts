import { courseProjectDocumentSchema } from '../../shared/courseProjectSchema'
import type { CourseProjectDocument } from '../../shared/courseProjectTypes'
import {
  copySpatialSessionCamera,
  type SpatialEditorLayerScope,
  type SpatialSessionCamera,
} from './spatialEditorView'

export const SPATIAL_REJECT_LOCKED = 'locked'
export const SPATIAL_REJECT_STALE_REVISION = 'stale-revision'
export const SPATIAL_REJECT_WRONG_OWNER = 'wrong-owner'

export interface SpatialAuthoringSelection {
  readonly locationId: string
  readonly surfaceId: string
  readonly selectionIds: readonly string[]
}

export interface SpatialAuthoringHistory {
  readonly present: CourseProjectDocument
  readonly past: readonly CourseProjectDocument[]
  readonly future: readonly CourseProjectDocument[]
}

export interface SpatialAuthoringTarget {
  readonly sessionId: string
  readonly revision: number
  readonly generation: number
  readonly authoringAddress: string
  readonly scope: SpatialEditorLayerScope
  readonly coordinateSpace: 'world' | 'viewport'
  readonly layerItemId: string
}

export interface SpatialCommandOptions {
  readonly now?: string
  readonly expectedRevision?: number
}

export interface SpatialAuthoringSession {
  readonly sessionId: string
  readonly history: SpatialAuthoringHistory
  readonly selection: SpatialAuthoringSelection
  readonly scope: SpatialEditorLayerScope
  readonly generation: number
  readonly sessionCamera: SpatialSessionCamera
  /** G1: dashed camera frames are on by default. Session-only. */
  readonly showCameraFrames: boolean
}

export interface SpatialCommandResult {
  readonly ok: boolean
  readonly reason?: string
  readonly nextSession?: SpatialAuthoringSession
  readonly historyEntry?: boolean
  readonly selection?: SpatialAuthoringSelection
}

export class SpatialCommandError extends Error {
  readonly reason: string

  constructor(reason: string, message?: string) {
    super(message ?? reason)
    this.name = 'SpatialCommandError'
    this.reason = reason
  }
}

export function createSpatialAuthoringHistory(
  project: CourseProjectDocument,
): SpatialAuthoringHistory {
  return Object.freeze({
    present: project,
    past: Object.freeze([] as CourseProjectDocument[]),
    future: Object.freeze([] as CourseProjectDocument[]),
  })
}

export function commitSpatialAuthoringHistory(
  history: SpatialAuthoringHistory,
  next: CourseProjectDocument,
  limit = 100,
): SpatialAuthoringHistory {
  return Object.freeze({
    present: next,
    past: Object.freeze([...history.past, history.present].slice(-limit)),
    future: Object.freeze([] as CourseProjectDocument[]),
  })
}

export function undoSpatialAuthoringHistory(
  history: SpatialAuthoringHistory,
): SpatialAuthoringHistory {
  const previous = history.past.at(-1)
  if (!previous) return history
  return Object.freeze({
    present: previous,
    past: Object.freeze(history.past.slice(0, -1)),
    future: Object.freeze([history.present, ...history.future]),
  })
}

export function redoSpatialAuthoringHistory(
  history: SpatialAuthoringHistory,
): SpatialAuthoringHistory {
  const next = history.future[0]
  if (!next) return history
  return Object.freeze({
    present: next,
    past: Object.freeze([...history.past, history.present]),
    future: Object.freeze(history.future.slice(1)),
  })
}

export function commitSpatialProjectMutation(
  project: CourseProjectDocument,
  mutate: (draft: CourseProjectDocument) => void,
  now = new Date().toISOString(),
): CourseProjectDocument {
  const draft = structuredClone(project)
  mutate(draft)
  draft.revision = project.revision + 1
  draft.updatedAt = now
  return courseProjectDocumentSchema.parse(draft)
}

export function freezeSpatialSelection(
  selection: SpatialAuthoringSelection,
): SpatialAuthoringSelection {
  return Object.freeze({
    locationId: selection.locationId,
    surfaceId: selection.surfaceId,
    selectionIds: Object.freeze([...selection.selectionIds]),
  })
}

export function freezeSpatialHistory(
  history: SpatialAuthoringHistory,
): SpatialAuthoringHistory {
  if (Object.isFrozen(history) && Object.isFrozen(history.past) && Object.isFrozen(history.future)) {
    return history
  }
  return Object.freeze({
    present: history.present,
    past: Object.freeze([...history.past]),
    future: Object.freeze([...history.future]),
  })
}

export function freezeSpatialSession(
  session: SpatialAuthoringSession,
): SpatialAuthoringSession {
  return Object.freeze({
    sessionId: session.sessionId,
    history: freezeSpatialHistory(session.history),
    selection: freezeSpatialSelection(session.selection),
    scope: session.scope,
    generation: session.generation,
    sessionCamera: copySpatialSessionCamera(session.sessionCamera),
    showCameraFrames: session.showCameraFrames,
  })
}

export function succeedSpatialCommand(
  next: SpatialAuthoringSession,
  historyEntry: boolean,
): SpatialCommandResult {
  const session = freezeSpatialSession(next)
  return {
    ok: true,
    nextSession: session,
    historyEntry,
    selection: session.selection,
  }
}

export function rejectSpatialCommand(
  session: SpatialAuthoringSession,
  reason: string,
): SpatialCommandResult {
  const current = freezeSpatialSession(session)
  return {
    ok: false,
    reason,
    nextSession: current,
    historyEntry: false,
    selection: current.selection,
  }
}

export function rejectSpatialIfStale(
  session: SpatialAuthoringSession,
  expectedRevision?: number,
): SpatialCommandResult | null {
  if (
    expectedRevision !== undefined &&
    expectedRevision !== session.history.present.revision
  ) {
    return rejectSpatialCommand(session, SPATIAL_REJECT_STALE_REVISION)
  }
  return null
}

export function catchSpatialCommand(
  session: SpatialAuthoringSession,
  error: unknown,
): SpatialCommandResult {
  if (error instanceof SpatialCommandError) return rejectSpatialCommand(session, error.reason)
  if (error instanceof Error) return rejectSpatialCommand(session, error.message)
  return rejectSpatialCommand(session, '命令失败')
}

const authoringGenerations = new Map<string, number>()

export function spatialAuthoringGeneration(sessionId: string): number {
  return authoringGenerations.get(sessionId) ?? 0
}

export function resetSpatialAuthoringGeneration(sessionId: string, generation = 0): void {
  authoringGenerations.set(sessionId, generation)
}

export function bumpSpatialGeneration(session: SpatialAuthoringSession): number {
  const generation = session.generation + 1
  authoringGenerations.set(session.sessionId, generation)
  return generation
}

export function replaceSpatialSession(
  session: SpatialAuthoringSession,
  patch: Partial<SpatialAuthoringSession>,
): SpatialAuthoringSession {
  return freezeSpatialSession({
    sessionId: patch.sessionId ?? session.sessionId,
    history: patch.history ?? session.history,
    selection: patch.selection ?? session.selection,
    scope: patch.scope ?? session.scope,
    generation: patch.generation ?? session.generation,
    sessionCamera: patch.sessionCamera ?? session.sessionCamera,
    showCameraFrames: patch.showCameraFrames ?? session.showCameraFrames,
  })
}
