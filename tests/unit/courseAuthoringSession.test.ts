import { describe, expect, it, vi } from 'vitest'
import {
  COURSE_AUTHORING_STALE_SESSION_REASON,
  COURSE_AUTHORING_TEXT_COMPOSING_SWITCH_REASON,
  createCourseAuthoringSession,
  guardCourseAuthoringSessionCallback,
  isFreshCourseAuthoringSessionToken,
  rejectStaleCourseAuthoringSessionToken,
  selectionSnapshotFromSession,
  switchCourseAuthoringLocation,
  updateCourseAuthoringSessionItems,
} from '@/renderer/authoring/courseAuthoringSession'

describe('courseAuthoringSession', () => {
  it('clears item ids and bumps generation when switching location', () => {
    let session = createCourseAuthoringSession({
      locationId: 'loc-slide-a',
      surfaceType: 'slide',
      revision: 2,
      itemIds: ['layer-old-1', 'layer-old-2'],
    })

    session = updateCourseAuthoringSessionItems(session, ['layer-old-1'])
    expect(session.itemIds).toEqual(['layer-old-1'])
    expect(session.token.generation).toBe(0)

    const sameLocation = switchCourseAuthoringLocation(session, {
      locationId: 'loc-slide-a',
      surfaceType: 'slide',
      revision: 3,
    })
    expect(sameLocation).not.toHaveProperty('ok', false)
    if ('token' in sameLocation) {
      expect(sameLocation.token.generation).toBe(0)
      expect(sameLocation.token.revision).toBe(3)
      expect(sameLocation.itemIds).toEqual([])
    }

    const next = switchCourseAuthoringLocation(session, {
      locationId: 'loc-flow-b',
      surfaceType: 'flow',
      revision: 3,
    })
    expect(next).not.toHaveProperty('ok', false)
    if ('token' in next) {
      expect(next.token.locationId).toBe('loc-flow-b')
      expect(next.token.surfaceType).toBe('flow')
      expect(next.token.revision).toBe(3)
      expect(next.token.generation).toBe(1)
      expect(next.itemIds).toEqual([])

      const snapshot = selectionSnapshotFromSession(next, {
        scope: 'location',
        focus: 'block',
      })
      expect(snapshot.itemIds).toEqual([])
      expect(snapshot.sessionGeneration).toBe(1)
      expect(snapshot.itemIds).not.toContain('layer-old-1')
    }
  })

  it('rejects stale session token callbacks', () => {
    const session = createCourseAuthoringSession({
      locationId: 'loc-slide-a',
      surfaceType: 'slide',
      revision: 0,
    })
    const switched = switchCourseAuthoringLocation(session, {
      locationId: 'loc-slide-b',
      surfaceType: 'slide',
      revision: 1,
    })
    if (!('token' in switched)) throw new Error('expected session')

    expect(isFreshCourseAuthoringSessionToken(switched.token, {
      locationId: 'loc-slide-a',
      generation: 0,
    })).toBe(false)

    expect(rejectStaleCourseAuthoringSessionToken(switched.token, {
      locationId: 'loc-slide-a',
      generation: 0,
    })).toEqual({
      ok: false,
      reason: COURSE_AUTHORING_STALE_SESSION_REASON,
    })

    const callback = vi.fn(() => 'done')
    const guarded = guardCourseAuthoringSessionCallback(
      switched,
      { locationId: 'loc-slide-a', generation: 0 },
      callback,
    )
    expect(guarded).toEqual({
      ok: false,
      reason: COURSE_AUTHORING_STALE_SESSION_REASON,
    })
    expect(callback).not.toHaveBeenCalled()

    const fresh = guardCourseAuthoringSessionCallback(
      switched,
      { locationId: 'loc-slide-b', generation: 1 },
      callback,
    )
    expect(fresh).toBe('done')
    expect(callback).toHaveBeenCalledOnce()
  })

  it('refuses location switch while text composing', () => {
    const session = createCourseAuthoringSession({
      locationId: 'loc-flow-a',
      surfaceType: 'flow',
      revision: 0,
      itemIds: ['block-1'],
    })

    const blocked = switchCourseAuthoringLocation(session, {
      locationId: 'loc-flow-b',
      surfaceType: 'flow',
      revision: 0,
      composing: true,
    })
    expect(blocked).toEqual({
      ok: false,
      reason: COURSE_AUTHORING_TEXT_COMPOSING_SWITCH_REASON,
    })
  })

  it('projects global scope snapshot from any surface type session', () => {
    for (const surfaceType of ['slide', 'flow', 'spatial-2d'] as const) {
      const session = createCourseAuthoringSession({
        locationId: `loc-${surfaceType}`,
        surfaceType,
        revision: 4,
        itemIds: ['selected-item'],
      })
      const snapshot = selectionSnapshotFromSession(session, {
        scope: 'global',
        focus: 'overlay',
      })
      expect(snapshot.scope).toBe('global')
      expect(snapshot.surfaceKind).toBe(surfaceType)
      expect(snapshot.revision).toBe(4)
    }
  })
})
