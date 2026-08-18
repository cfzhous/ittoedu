import { describe, expect, it } from 'vitest'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import {
  addCourseFlowPage,
  addCourseScene,
  addCourseSpatialPage,
  COURSE_LAST_LOCATION_REASON,
  deleteCourseLocation,
  reorderCourseSurfaces,
} from '@/renderer/course/courseLocationCommands'
import { appendBlankFlowPage } from '@/renderer/project/createFlowCourseProject'
import { createBlankCourseProject } from '@/renderer/project/createCourseProject'
import { createBlankFlowCourseProject } from '@/renderer/project/createFlowCourseProject'
import { createBlankSpatialCourseProject } from '@/renderer/project/createSpatialCourseProject'

const NOW = '2026-08-17T12:00:00.000Z'

function slideSurfaceId(project: CourseProjectDocument): string {
  const surface = project.surfaces.find((candidate) => candidate.type === 'slide')
  if (!surface) throw new Error('expected slide surface')
  return surface.id
}

function slideSceneLocationIds(project: CourseProjectDocument): string[] {
  return project.locations.flatMap((location) =>
    location.kind === 'slide-scene' ? [location.id] : [],
  )
}

describe('courseLocationCommands', () => {
  it('keeps old scene locations when addCourseScene runs twice on the same Slide surface', () => {
    let project = createBlankCourseProject({ now: NOW })
    const surfaceId = slideSurfaceId(project)
    const firstSceneLocationId = project.startLocationId

    const first = addCourseScene(project, { surfaceId, now: NOW, expectedRevision: project.revision })
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.reason)
    project = first.project
    expect(slideSceneLocationIds(project)).toEqual([
      firstSceneLocationId,
      first.activatedLocationId,
    ])

    const second = addCourseScene(project, {
      surfaceId,
      now: NOW,
      expectedRevision: project.revision,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error(second.reason)
    project = second.project

    expect(slideSceneLocationIds(project)).toEqual([
      firstSceneLocationId,
      first.activatedLocationId,
      second.activatedLocationId,
    ])
    expect(project.locations.some((location) => location.id === firstSceneLocationId)).toBe(true)
    expect(second.activatedLocationId).not.toBe(firstSceneLocationId)
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })

  it('preserves existing locations after adding Flow and Spatial pages', () => {
    let project = createBlankCourseProject({ now: NOW })
    const originalLocationIds = project.locations.map((location) => location.id)

    const flowAdded = addCourseFlowPage(project, { now: NOW, expectedRevision: project.revision })
    expect(flowAdded.ok).toBe(true)
    if (!flowAdded.ok) throw new Error(flowAdded.reason)
    project = flowAdded.project
    expect(project.locations.map((location) => location.id)).toEqual([
      ...originalLocationIds,
      flowAdded.activatedLocationId,
    ])

    const spatialAdded = addCourseSpatialPage(project, {
      now: NOW,
      expectedRevision: project.revision,
    })
    expect(spatialAdded.ok).toBe(true)
    if (!spatialAdded.ok) throw new Error(spatialAdded.reason)
    project = spatialAdded.project
    expect(project.locations.map((location) => location.id)).toEqual([
      ...originalLocationIds,
      flowAdded.activatedLocationId,
      spatialAdded.activatedLocationId,
    ])
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
  })

  it('rejects deleting the last reachable location', () => {
    const project = createBlankSpatialCourseProject({ now: NOW })
    expect(project.locations).toHaveLength(1)

    const deleted = deleteCourseLocation(project, project.startLocationId, {
      expectedRevision: project.revision,
    })
    expect(deleted.ok).toBe(false)
    if (deleted.ok) throw new Error('expected delete failure')
    expect(deleted.reason).toContain('不能删除最后')
    expect(deleted.project).toBe(project)
  })

  it('rejects stale expectedRevision', () => {
    const project = createBlankCourseProject({ now: NOW })
    const result = addCourseScene(project, {
      surfaceId: slideSurfaceId(project),
      expectedRevision: project.revision + 1,
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected stale failure')
    expect(result.reason).toBe('stale-revision')
  })

  it('addCourseFlowPage succeeds where appendBlankFlowPage alone lacks mixedPrintPlan sync', () => {
    const flow = createBlankFlowCourseProject({ now: NOW })
    expect(() => appendBlankFlowPage(flow)).toThrow()

    const added = addCourseFlowPage(flow, { now: NOW, expectedRevision: flow.revision })
    expect(added.ok).toBe(true)
    if (!added.ok) throw new Error(added.reason)
    expect(added.project.surfaces.filter((surface) => surface.type === 'flow')).toHaveLength(2)
    expect(added.project.mixedPrintPlan?.entries).toHaveLength(2)
    expect(courseProjectDocumentSchema.parse(added.project)).toEqual(added.project)
  })

  it('uses Chinese reason for last-location guard constant', () => {
    expect(COURSE_LAST_LOCATION_REASON).toMatch(/不能删除最后/)
  })

  it('reorders mixed surfaces, grouped locations, and mixedPrintPlan in one revision', () => {
    let project = createBlankCourseProject({ now: NOW })
    const startLocationId = project.startLocationId
    const flowAdded = addCourseFlowPage(project, { now: NOW, expectedRevision: project.revision })
    expect(flowAdded.ok).toBe(true)
    if (!flowAdded.ok) throw new Error(flowAdded.reason)
    project = flowAdded.project
    const spatialAdded = addCourseSpatialPage(project, {
      now: NOW,
      expectedRevision: project.revision,
    })
    expect(spatialAdded.ok).toBe(true)
    if (!spatialAdded.ok) throw new Error(spatialAdded.reason)
    project = spatialAdded.project

    const originalSurfaceIds = project.surfaces.map((surface) => surface.id)
    expect(originalSurfaceIds).toHaveLength(3)
    const reversed = [...originalSurfaceIds].reverse()
    const groupedBefore = new Map<string, string[]>()
    for (const location of project.locations) {
      const entries = groupedBefore.get(location.surfaceId) ?? []
      entries.push(location.id)
      groupedBefore.set(location.surfaceId, entries)
    }

    const reordered = reorderCourseSurfaces(project, reversed, {
      now: NOW,
      expectedRevision: project.revision,
      activeLocationId: startLocationId,
    })
    expect(reordered.ok).toBe(true)
    if (!reordered.ok) throw new Error(reordered.reason)
    expect(reordered.project.revision).toBe(project.revision + 1)
    expect(reordered.activatedLocationId).toBe(startLocationId)
    expect(reordered.project.surfaces.map((surface) => surface.id)).toEqual(reversed)
    expect(reordered.project.locations.map((location) => location.id)).toEqual(
      reversed.flatMap((surfaceId) => groupedBefore.get(surfaceId) ?? []),
    )
    expect(reordered.project.mixedPrintPlan?.entries.map((entry) => entry.surfaceId)).toEqual(reversed)
    expect(courseProjectDocumentSchema.parse(reordered.project)).toEqual(reordered.project)
  })

  it('rejects incomplete or unknown surface reorder lists', () => {
    const project = createBlankCourseProject({ now: NOW })
    const empty = reorderCourseSurfaces(project, [], { expectedRevision: project.revision })
    expect(empty.ok).toBe(false)
    if (empty.ok) throw new Error('expected empty reorder failure')
    expect(empty.reason).toBe('页面排序必须包含全部页面')
    expect(empty.project).toBe(project)

    const unknown = reorderCourseSurfaces(project, ['missing-surface'], {
      expectedRevision: project.revision,
    })
    expect(unknown.ok).toBe(false)
    if (unknown.ok) throw new Error('expected unknown reorder failure')
    expect(unknown.reason).toBe('页面排序包含未知页面')
  })
})
