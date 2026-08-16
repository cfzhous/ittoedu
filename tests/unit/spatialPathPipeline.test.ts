// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { addCourseSurface, createCourseProject, updateCourseProject } from '@/renderer/course/courseStudioModel'
import { buildPublishedCourseV2Payload } from '@/renderer/export/course/buildPublishedCourse'
import {
  buildCourseExportDifferenceReport,
  buildSpatialPrintHtml,
} from '@/renderer/export/course/printArtifacts'
import { publishedCourseV2Schema } from '@/shared/publishedCourseSchema'
import type {
  CourseProjectDocument,
  LayerItem,
  SpatialSurfaceDocument,
} from '@/shared/courseProjectTypes'
import {
  spatialCameraFromPose,
} from '@/player/surfaces/spatial/spatialModel'
import {
  renderSpatialSurface,
  renderSpatialSvgMarkup,
  SpatialSurfaceHost,
} from '@/player/surfaces/spatial/SpatialSurfaceHost'
import { SpatialWorkspace } from '@/renderer/ui/SpatialWorkspace'

const NOW = '2026-08-15T02:00:00.000Z'

function nativeTextLayer(layerItemId: string, x: number, y: number, order: number): LayerItem {
  return {
    layerItemId,
    label: layerItemId,
    kind: 'native',
    frame: { mode: 'absolute', x, y, width: 220, height: 100 },
    order,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    content: {
      nativeType: 'text',
      data: {
        text: layerItemId,
        runs: [],
        style: {
          fontFamily: 'sans-serif',
          fontSize: 24,
          color: '#172033',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          emphasis: false,
          highlightColor: null,
          align: 'left',
          verticalAlign: 'top',
          writingMode: 'horizontal',
          lineSpacing: 1.3,
          letterSpacing: 0,
          padding: 4,
          overflow: 'fixed',
          backgroundColor: '#ffffff',
          backgroundOpacity: 0,
          cornerRadius: 0,
        },
      },
    },
  }
}

function spatialWorldFixture(): SpatialSurfaceDocument['world'] {
  return {
    bounds: { mode: 'finite', x: 0, y: 0, width: 1000, height: 600 },
    layerItems: [
      nativeTextLayer('layer-a', 40, 60, 10),
      nativeTextLayer('layer-b', 160, 120, 20),
    ],
    paths: [{
      id: 'path-1',
      name: '探索路线',
      layerItemIds: ['layer-a', 'layer-b'],
      style: { color: '#112233', width: 3, dash: 'dashed' },
    }],
    relations: [{
      id: 'relation-1',
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'layer-b',
      label: '从甲到乙',
      kind: 'arrow',
    }],
  }
}

function spatialSurfaceFixture(): SpatialSurfaceDocument {
  return {
    id: 'space',
    title: '空间路径管线',
    type: 'spatial-2d',
    surfaceLayerItems: [],
    world: spatialWorldFixture(),
    camera: {
      home: { x: 400, y: 240, zoom: 1 },
      frames: [{ id: 'frame-1', name: '总览', x: 400, y: 240, zoom: 1 }],
    },
    semanticZoom: [],
  }
}

function spatialProjectFixture(): CourseProjectDocument {
  let project = createCourseProject({ id: 'course-spatial-pipeline', now: NOW })
  project = addCourseSurface(project, 'spatial-2d', { id: 'space', now: NOW })
  project = updateCourseProject(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === 'space')
    if (!surface || surface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    surface.world = spatialWorldFixture()
  }, NOW)
  return project
}

function publishedSpatialSurface(published: unknown): {
  type: 'spatial-2d'
  world: { paths?: Array<{ id: string; name: string }>; relations?: Array<{ id: string; kind: string }> }
} {
  const parsed = publishedCourseV2Schema.parse(published)
  const surface = parsed.surfaces.find((candidate) => candidate.type === 'spatial-2d')
  if (!surface || surface.type !== 'spatial-2d') throw new Error('expected published Spatial surface')
  return surface
}

afterEach(cleanup)

describe('Spatial path/relation published payload pipeline', () => {
  it('copies authored paths and relations into Published Course V2 and validates them', () => {
    const project = spatialProjectFixture()
    const published = buildPublishedCourseV2Payload({
      project,
      assetFiles: {},
      components: {},
    })

    const surface = publishedSpatialSurface(published)
    expect(surface.world.paths).toMatchObject([{
      id: 'path-1',
      name: '探索路线',
      layerItemIds: ['layer-a', 'layer-b'],
      style: { color: '#112233', width: 3, dash: 'dashed' },
    }])
    expect(surface.world.relations).toMatchObject([{
      id: 'relation-1',
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'layer-b',
      kind: 'arrow',
    }])
    expect(publishedCourseV2Schema.parse(published)).toEqual(published)
  })

  it('keeps the same path/relation validation semantics for published payloads', () => {
    const project = spatialProjectFixture()
    const published = buildPublishedCourseV2Payload({
      project,
      assetFiles: {},
      components: {},
    })

    const duplicate = structuredClone(published)
    const duplicateSurface = duplicate.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (!duplicateSurface || duplicateSurface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    duplicateSurface.world.paths = [
      { id: 'path-dup', name: '重复一', layerItemIds: ['layer-a'] },
      { id: 'path-dup', name: '重复二', layerItemIds: ['layer-b'] },
    ]
    expect(publishedCourseV2Schema.safeParse(duplicate).success).toBe(false)

    const dangling = structuredClone(published)
    const danglingSurface = dangling.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (!danglingSurface || danglingSurface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    danglingSurface.world.paths = [{
      id: 'path-dangling',
      name: '悬空路径',
      layerItemIds: ['missing-layer'],
    }]
    expect(publishedCourseV2Schema.safeParse(dangling).success).toBe(false)

    const invalidStyle = structuredClone(published)
    const invalidStyleSurface = invalidStyle.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (!invalidStyleSurface || invalidStyleSurface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    invalidStyleSurface.world.paths = [{
      id: 'path-style',
      name: '错误样式',
      layerItemIds: ['layer-a'],
      style: { color: 'red', dash: 'wavy' as never },
    }]
    expect(publishedCourseV2Schema.safeParse(invalidStyle).success).toBe(false)

    const selfRelation = structuredClone(published)
    const selfRelationSurface = selfRelation.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (!selfRelationSurface || selfRelationSurface.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    selfRelationSurface.world.relations = [{
      id: 'relation-self',
      sourceLayerItemId: 'layer-a',
      targetLayerItemId: 'layer-a',
      kind: 'line',
    }]
    expect(publishedCourseV2Schema.safeParse(selfRelation).success).toBe(false)
  })

  it('still parses old published payloads without spatial paths or relations', () => {
    const project = spatialProjectFixture()
    const published = buildPublishedCourseV2Payload({
      project,
      assetFiles: {},
      components: {},
    })
    const legacy = structuredClone(published) as {
      surfaces: Array<{ type: string; world?: { paths?: unknown; relations?: unknown } }>
    }
    const legacySurface = legacy.surfaces.find((surface) => surface.type === 'spatial-2d')
    if (!legacySurface?.world) throw new Error('expected Spatial surface')
    delete legacySurface.world.paths
    delete legacySurface.world.relations

    const parsed = publishedCourseV2Schema.parse(legacy)
    const surface = parsed.surfaces.find((candidate) => candidate.type === 'spatial-2d')
    if (!surface || surface.type !== 'spatial-2d') throw new Error('expected published Spatial surface')
    expect(surface.world.paths).toEqual([])
    expect(surface.world.relations).toEqual([])
  })
})

describe('Spatial path/relation rendering pipeline', () => {
  it('renders stable path/relation ids and authored styles in static SVG markup and DOM', () => {
    const spatial = spatialSurfaceFixture()
    const camera = spatialCameraFromPose(spatial.camera.home, { width: 1280, height: 720 })

    const markup = renderSpatialSvgMarkup(spatial, camera)
    expect(markup).toContain('data-spatial-path-id="path-1"')
    expect(markup).toContain('data-spatial-relation-id="relation-1"')
    expect(markup).toContain('stroke="#112233"')
    expect(markup).toContain('stroke-width="3"')
    expect(markup).toContain('stroke-dasharray="8 6"')
    expect(markup).toContain('marker-end')

    const root = renderSpatialSurface(spatial, camera, {
      domDocument: document,
      showControls: false,
      showMinimap: false,
    })
    const path = root.querySelector<SVGPolylineElement>('[data-spatial-path-id="path-1"]')
    const relation = root.querySelector<SVGLineElement>('[data-spatial-relation-id="relation-1"]')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('stroke')).toBe('#112233')
    expect(path?.getAttribute('stroke-width')).toBe('3')
    expect(path?.getAttribute('points')).toBe('150,110 270,170')
    expect(relation).not.toBeNull()
    expect(relation?.getAttribute('marker-end')).toContain('url(#spatial-relation-0-relation-1)')
  })

  it('renders the same stable ids in the editor SpatialWorkspace world group', () => {
    const spatial = spatialSurfaceFixture()
    const { container } = render(createElement(SpatialWorkspace, {
      spatial,
      viewportSize: { width: 1280, height: 720 },
      selectedLayerItemIds: [],
      onSelect: () => undefined,
      onTransformEnd: () => undefined,
    }))

    const path = container.querySelector<SVGPolylineElement>('[data-spatial-path-id="path-1"]')
    const relation = container.querySelector<SVGLineElement>('[data-spatial-relation-id="relation-1"]')
    expect(path).not.toBeNull()
    expect(path?.getAttribute('points')).toBe('150,110 270,170')
    expect(path?.getAttribute('stroke')).toBe('#112233')
    expect(path?.getAttribute('stroke-width')).toBe('3')
    expect(relation).not.toBeNull()
    expect(relation?.getAttribute('marker-end')).toContain('url(#spatial-relation-0-relation-1)')
    expect(container.querySelector('[data-spatial-paths-relations]')).not.toBeNull()
  })

  it('includes paths and relations in Spatial host capture and print-artifact HTML', async () => {
    const spatial = spatialSurfaceFixture()
    const host = new SpatialSurfaceHost(structuredClone(spatial), { width: 1280, height: 720 }, {
      showControls: false,
      showMinimap: false,
      interactiveCamera: false,
    })
    const capture = await host.capture({ purpose: 'export', width: 1280, height: 720 })
    expect(capture.content).toContain('data-spatial-path-id="path-1"')
    expect(capture.content).toContain('data-spatial-relation-id="relation-1"')

    const artifact = buildSpatialPrintHtml(spatial, { includeBookmarkIds: [] })
    expect(artifact.html).toContain('data-spatial-path-id="path-1"')
    expect(artifact.html).toContain('data-spatial-relation-id="relation-1"')
  })

  it('reports Spatial paths/relations as omitted by PPTX and DOCX, not preserved', () => {
    const differences = buildCourseExportDifferenceReport([{ id: 'space', kind: 'spatial-2d' }])
    expect(differences).toContainEqual(expect.objectContaining({
      target: 'pptx',
      disposition: 'omitted',
      detail: expect.stringContaining('Spatial paths and relations are omitted'),
    }))
    expect(differences).toContainEqual(expect.objectContaining({
      target: 'docx',
      disposition: 'omitted',
      detail: expect.stringContaining('Spatial paths and relations are omitted'),
    }))
  })
})
