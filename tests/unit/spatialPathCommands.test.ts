import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  createCourseHistory,
  createCourseProject,
  redoCourseHistory,
  undoCourseHistory,
} from '@/renderer/course/courseStudioModel'
import { courseProjectDocumentSchema, courseSurfaceSchema } from '@/shared/courseProjectSchema'
import {
  addSpatialPath,
  addSpatialRelation,
  deleteSpatialPath,
  deleteSpatialRelation,
  updateSpatialPath,
  updateSpatialRelation,
} from '@/renderer/course/spatialPathCommands'
import { addSpatialWorldTextLayer } from '@/renderer/course/spatialEditorCommands'
import type {
  CourseProjectDocument,
  SpatialPathDocument,
  SpatialRelationDocument,
  SpatialSurfaceDocument,
} from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T02:00:00.000Z'

function spatialFixture(): {
  project: CourseProjectDocument
  surfaceId: string
} {
  let project = createCourseProject({ id: 'course-spatial-path', now: NOW })
  project = addCourseSurface(project, 'spatial-2d', { id: 'space', now: NOW })
  let history = createCourseHistory(project)
  history = addSpatialWorldTextLayer(history, 'space', '甲', {
    id: 'layer-a',
    x: 40,
    y: 60,
    now: NOW,
  })
  history = addSpatialWorldTextLayer(history, 'space', '乙', {
    id: 'layer-b',
    x: 160,
    y: 120,
    now: NOW,
  })
  return { project: history.present, surfaceId: 'space' }
}

function spatialSurfaceIn(
  project: CourseProjectDocument,
  surfaceId: string,
): SpatialSurfaceDocument {
  const surface = project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
  return surface
}

function pathIn(
  project: CourseProjectDocument,
  surfaceId: string,
  pathId: string,
): SpatialPathDocument | undefined {
  return spatialSurfaceIn(project, surfaceId).world.paths?.find((path) => path.id === pathId)
}

function relationIn(
  project: CourseProjectDocument,
  surfaceId: string,
  relationId: string,
): SpatialRelationDocument | undefined {
  return spatialSurfaceIn(project, surfaceId).world.relations?.find((relation) => relation.id === relationId)
}

describe('Spatial path schema increment', () => {
  it('materializes empty path/relation arrays for existing Spatial surface documents', () => {
    const existing = {
      id: 'surface-spatial-existing',
      title: '既有空间表面',
      type: 'spatial-2d',
      surfaceLayerItems: [],
      world: {
        bounds: { mode: 'infinite' as const },
        layerItems: [],
      },
      camera: {
        home: { x: 0, y: 0, zoom: 1 },
        frames: [{ id: 'camera-overview', name: '总览', x: 0, y: 0, zoom: 1 }],
      },
      semanticZoom: [],
    }

    const parsed = courseSurfaceSchema.parse(existing) as SpatialSurfaceDocument

    expect(parsed.world.paths).toEqual([])
    expect(parsed.world.relations).toEqual([])
  })

  it('accepts valid paths and relations and rejects dangling or duplicate ids', () => {
    const { project, surfaceId } = spatialFixture()
    const valid = structuredClone(project)
    const surface = spatialSurfaceIn(valid, surfaceId)
    surface.world.paths = [{
      id: 'path-1',
      name: '探索路线',
      layerItemIds: ['layer-a', 'layer-b'],
      style: { color: '#112233', width: 3, dash: 'dashed' },
    }]
    surface.world.relations = [{
      id: 'relation-1',
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'layer-b',
      label: '从甲到乙',
      kind: 'arrow',
    }]
    expect(courseProjectDocumentSchema.safeParse(valid).success).toBe(true)

    const danglingPath = structuredClone(project)
    const danglingPathSurface = spatialSurfaceIn(danglingPath, surfaceId)
    danglingPathSurface.world.paths = [{
      id: 'path-dangling',
      name: '悬空路径',
      layerItemIds: ['missing-layer'],
    }]
    expect(courseProjectDocumentSchema.safeParse(danglingPath).success).toBe(false)

    const duplicatePaths = structuredClone(project)
    const duplicatePathsSurface = spatialSurfaceIn(duplicatePaths, surfaceId)
    duplicatePathsSurface.world.paths = [
      { id: 'path-dup', name: '重复一', layerItemIds: ['layer-a'] },
      { id: 'path-dup', name: '重复二', layerItemIds: ['layer-b'] },
    ]
    expect(courseProjectDocumentSchema.safeParse(duplicatePaths).success).toBe(false)

    const duplicateRelations = structuredClone(project)
    const duplicateRelationsSurface = spatialSurfaceIn(duplicateRelations, surfaceId)
    duplicateRelationsSurface.world.relations = [
      { id: 'relation-dup', sourceLayerItemId: 'layer-a', targetLayerItemId: 'layer-b', kind: 'line' },
      { id: 'relation-dup', sourceLayerItemId: 'layer-b', targetLayerItemId: 'layer-a', kind: 'line' },
    ]
    expect(courseProjectDocumentSchema.safeParse(duplicateRelations).success).toBe(false)

    const sameEndpoints = structuredClone(project)
    const sameEndpointsSurface = spatialSurfaceIn(sameEndpoints, surfaceId)
    sameEndpointsSurface.world.relations = [{
      id: 'relation-self',
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'layer-a',
      kind: 'line',
    }]
    expect(courseProjectDocumentSchema.safeParse(sameEndpoints).success).toBe(false)

    const invalidStyle = structuredClone(project)
    const invalidStyleSurface = spatialSurfaceIn(invalidStyle, surfaceId)
    invalidStyleSurface.world.paths = [{
      id: 'path-style',
      name: '错误样式',
      layerItemIds: ['layer-a'],
      style: { color: 'red', dash: 'wavy' as never },
    }]
    expect(courseProjectDocumentSchema.safeParse(invalidStyle).success).toBe(false)
  })
})

describe('Spatial path commands', () => {
  it('adds one path as one history entry and keeps ids stable across clone/parse', () => {
    const { project, surfaceId } = spatialFixture()
    const history = createCourseHistory(project)

    const next = addSpatialPath(history, {
      surfaceId,
      name: '巡逻路线',
      layerItemIds: ['layer-a', 'layer-b'],
      style: { color: '#112233', width: 3, dash: 'dashed' },
      id: 'path-1',
      now: NOW,
    })

    expect(next.present.revision).toBe(project.revision + 1)
    expect(next.past).toEqual([project])
    expect(next.future).toEqual([])
    expect(pathIn(next.present, surfaceId, 'path-1')).toMatchObject({
      id: 'path-1',
      name: '巡逻路线',
      layerItemIds: ['layer-a', 'layer-b'],
      style: { color: '#112233', width: 3, dash: 'dashed' },
    })

    const parsed = courseProjectDocumentSchema.parse(next.present)
    expect(pathIn(parsed, surfaceId, 'path-1')?.id).toBe('path-1')

    const cloned = structuredClone(next.present)
    const reparsed = courseProjectDocumentSchema.parse(cloned)
    expect(pathIn(reparsed, surfaceId, 'path-1')).toMatchObject({
      id: 'path-1',
      layerItemIds: ['layer-a', 'layer-b'],
    })

    const undone = undoCourseHistory(next)
    const redone = redoCourseHistory(undone)
    expect(courseProjectDocumentSchema.safeParse(undone.present).success).toBe(true)
    expect(courseProjectDocumentSchema.safeParse(redone.present).success).toBe(true)
    expect(pathIn(undone.present, surfaceId, 'path-1')).toBeUndefined()
    expect(pathIn(redone.present, surfaceId, 'path-1')?.id).toBe('path-1')
  })

  it('rejects dangling layer ids and stale surface/entity ids atomically', () => {
    const { project, surfaceId } = spatialFixture()
    const history = createCourseHistory(project)

    expect(() => addSpatialPath(history, {
      surfaceId,
      name: '悬空路径',
      layerItemIds: ['missing-layer'],
      now: NOW,
    })).toThrow('路径引用了不存在的世界图层')
    expect(() => addSpatialPath(history, {
      surfaceId,
      name: '重复路径',
      layerItemIds: ['layer-a', 'layer-a'],
      now: NOW,
    })).toThrow('路径不能重复经过同一图层')
    expect(() => addSpatialPath(history, {
      surfaceId,
      name: '空路径',
      layerItemIds: [],
      now: NOW,
    })).toThrow('路径至少需要经过一个世界图层')
    expect(() => addSpatialPath(history, {
      surfaceId: 'stale-surface',
      name: '陈旧表面',
      layerItemIds: ['layer-a'],
      now: NOW,
    })).toThrow('找不到空间表面，请刷新后重试')
    expect(() => updateSpatialPath(history, surfaceId, 'missing-path', { name: '新名' }))
      .toThrow('找不到路径，请刷新后重试')
    expect(() => deleteSpatialPath(history, surfaceId, 'missing-path', NOW))
      .toThrow('找不到路径，请刷新后重试')

    expect(history.past).toEqual([])
    expect(history.present).toBe(project)
  })

  it('updates and deletes paths with exactly one history entry each and supports undo/redo', () => {
    const { project, surfaceId } = spatialFixture()
    let history = createCourseHistory(project)
    history = addSpatialPath(history, {
      surfaceId,
      name: '旧路线',
      layerItemIds: ['layer-a'],
      id: 'path-1',
      now: NOW,
    })

    const beforeUpdate = history.present
    history = updateSpatialPath(history, surfaceId, 'path-1', {
      name: '新路线',
      layerItemIds: ['layer-a', 'layer-b'],
      style: { color: '#abcdef', width: 5, dash: 'dotted' },
    }, NOW)

    expect(history.present.revision).toBe(beforeUpdate.revision + 1)
    expect(history.past).toEqual([project, beforeUpdate])
    expect(pathIn(history.present, surfaceId, 'path-1')).toMatchObject({
      name: '新路线',
      layerItemIds: ['layer-a', 'layer-b'],
      style: { color: '#abcdef', width: 5, dash: 'dotted' },
    })

    const noop = updateSpatialPath(history, surfaceId, 'path-1', { name: '新路线' }, NOW)
    expect(noop).toBe(history)

    const beforeDelete = history.present
    history = deleteSpatialPath(history, surfaceId, 'path-1', NOW)
    expect(history.present.revision).toBe(beforeDelete.revision + 1)
    expect(pathIn(history.present, surfaceId, 'path-1')).toBeUndefined()

    const undone = undoCourseHistory(history)
    const redone = redoCourseHistory(undone)
    expect(pathIn(undone.present, surfaceId, 'path-1')?.name).toBe('新路线')
    expect(pathIn(redone.present, surfaceId, 'path-1')).toBeUndefined()
    expect(courseProjectDocumentSchema.safeParse(undone.present).success).toBe(true)
    expect(courseProjectDocumentSchema.safeParse(redone.present).success).toBe(true)
  })
})

describe('Spatial relation commands', () => {
  it('adds, updates and deletes relations with one history entry each', () => {
    const { project, surfaceId } = spatialFixture()
    let history = createCourseHistory(project)
    history = addSpatialRelation(history, {
      surfaceId,
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'layer-b',
      kind: 'arrow',
      label: '从甲到乙',
      id: 'relation-1',
      now: NOW,
    })

    expect(history.present.revision).toBe(project.revision + 1)
    expect(history.past).toEqual([project])
    expect(relationIn(history.present, surfaceId, 'relation-1')).toMatchObject({
      id: 'relation-1',
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'layer-b',
      kind: 'arrow',
      label: '从甲到乙',
    })

    const parsed = courseProjectDocumentSchema.parse(history.present)
    expect(relationIn(parsed, surfaceId, 'relation-1')?.id).toBe('relation-1')

    history = updateSpatialRelation(history, surfaceId, 'relation-1', {
      kind: 'bidirectional',
      targetLayerItemId: 'layer-b',
    }, NOW)
    expect(relationIn(history.present, surfaceId, 'relation-1')).toMatchObject({
      id: 'relation-1',
      kind: 'bidirectional',
    })

    const beforeDelete = history.present
    history = deleteSpatialRelation(history, surfaceId, 'relation-1', NOW)
    expect(history.present.revision).toBe(beforeDelete.revision + 1)
    expect(relationIn(history.present, surfaceId, 'relation-1')).toBeUndefined()

    const undone = undoCourseHistory(history)
    const redone = redoCourseHistory(undone)
    expect(relationIn(undone.present, surfaceId, 'relation-1')?.kind).toBe('bidirectional')
    expect(relationIn(redone.present, surfaceId, 'relation-1')).toBeUndefined()
    expect(courseProjectDocumentSchema.safeParse(undone.present).success).toBe(true)
    expect(courseProjectDocumentSchema.safeParse(redone.present).success).toBe(true)
  })

  it('rejects dangling or same endpoints and stale relation ids atomically', () => {
    const { project, surfaceId } = spatialFixture()
    const history = createCourseHistory(project)

    expect(() => addSpatialRelation(history, {
      surfaceId,
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'missing-layer',
      kind: 'line',
      now: NOW,
    })).toThrow('关系连线引用了不存在的世界图层')
    expect(() => addSpatialRelation(history, {
      surfaceId,
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'layer-a',
      kind: 'line',
      now: NOW,
    })).toThrow('关系连线的起点和终点不能是同一个图层')
    expect(() => updateSpatialRelation(history, surfaceId, 'missing-relation', { kind: 'line' }))
      .toThrow('找不到关系连线，请刷新后重试')
    expect(() => deleteSpatialRelation(history, surfaceId, 'missing-relation', NOW))
      .toThrow('找不到关系连线，请刷新后重试')

    expect(history.past).toEqual([])
    expect(history.present).toBe(project)
  })
})
