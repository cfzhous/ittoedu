import { describe, expect, it } from 'vitest'
import {
  GLOBAL_LAYER_ENTRY_ID,
  SHARED_CONTENT_SECTION_ID,
  buildCourseStructureViewModel,
  courseWorkspaceShowsSceneStateStrip,
  deriveCourseEditorLayout,
  deriveCourseEditorShellPolicy,
} from '@/renderer/course/courseEditorLayout'
import {
  addCourseSurface,
  addFlowBlock,
  addSpatialCameraFrame,
  createBlankFlowCourseProject,
  createBlankSpatialCourseProject,
  createCourseProject,
} from '@/renderer/course/courseStudioModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-17T00:00:00.000Z'

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('courseEditorLayout derivation', () => {
  it('maps the seven location-referenced surface combinations and ignores unused surfaces', () => {
    const slide = createCourseProject({ id: 'layout-slide', title: '演示', now: NOW })
    const flow = createBlankFlowCourseProject({ id: 'layout-flow', title: '讲义', now: NOW })
    const spatial = createBlankSpatialCourseProject({ id: 'layout-spatial', title: '画布', now: NOW })
    const slideFlow = addCourseSurface(slide, 'flow', { id: 'flow-b', now: NOW })
    const slideSpatial = addCourseSurface(slide, 'spatial-2d', { id: 'spatial-b', now: NOW })
    const flowSpatial = addCourseSurface(flow, 'spatial-2d', { id: 'spatial-c', now: NOW })
    const mixed = addCourseSurface(slideFlow, 'spatial-2d', { id: 'spatial-d', now: NOW })

    expect(deriveCourseEditorLayout(slide)).toMatchObject({
      layout: 'slide',
      referencedSurfaceTypes: ['slide'],
    })
    expect(deriveCourseEditorLayout(flow)).toMatchObject({
      layout: 'flow',
      referencedSurfaceTypes: ['flow'],
    })
    expect(deriveCourseEditorLayout(spatial)).toMatchObject({
      layout: 'spatial',
      referencedSurfaceTypes: ['spatial-2d'],
    })
    expect(deriveCourseEditorLayout(slideFlow)).toMatchObject({
      layout: 'mixed',
      referencedSurfaceTypes: ['slide', 'flow'],
    })
    expect(deriveCourseEditorLayout(slideSpatial)).toMatchObject({
      layout: 'mixed',
      referencedSurfaceTypes: ['slide', 'spatial-2d'],
    })
    expect(deriveCourseEditorLayout(flowSpatial)).toMatchObject({
      layout: 'mixed',
      referencedSurfaceTypes: ['flow', 'spatial-2d'],
    })
    expect(deriveCourseEditorLayout(mixed)).toMatchObject({
      layout: 'mixed',
      referencedSurfaceTypes: ['slide', 'flow', 'spatial-2d'],
    })

    const withOrphan = {
      locations: slide.locations,
      surfaces: [
        ...slide.surfaces,
        {
          id: 'orphan-flow',
          type: 'flow' as const,
          title: '未被引用',
          surfaceLayerItems: [],
          layout: { readingWidth: 760, wideContentWidth: 1120 },
          blocks: [],
        },
      ],
    }
    expect(deriveCourseEditorLayout(withOrphan)).toMatchObject({
      layout: 'slide',
      referencedSurfaceTypes: ['slide'],
    })
    expect(deriveCourseEditorLayout(roundTrip(mixed))).toEqual(deriveCourseEditorLayout(mixed))
  })

  it('returns a safe unavailable result instead of degrading', () => {
    expect(deriveCourseEditorLayout({ locations: [], surfaces: [] })).toMatchObject({
      layout: 'unavailable',
      referencedSurfaceTypes: [],
      unavailable: { reason: 'empty-locations' },
    })
    expect(deriveCourseEditorLayout({
      locations: [{
        id: 'loc-missing',
        label: '缺失',
        kind: 'slide-scene',
        surfaceId: 'missing-surface',
        sceneId: 'scene-1',
      }],
      surfaces: [],
    })).toMatchObject({
      layout: 'unavailable',
      unavailable: {
        reason: 'missing-surface',
        locationId: 'loc-missing',
        surfaceId: 'missing-surface',
      },
    })
    expect(deriveCourseEditorLayout({
      locations: [{
        id: 'loc-unknown',
        label: '未知',
        kind: 'slide-scene',
        surfaceId: 'odd',
        sceneId: 'scene-1',
      }],
      surfaces: [{
        id: 'odd',
        type: 'whiteboard' as never,
        title: '未知表面',
        surfaceLayerItems: [],
      } as never],
    })).toMatchObject({
      layout: 'unavailable',
      unavailable: {
        reason: 'unknown-surface-type',
        surfaceId: 'odd',
        surfaceType: 'whiteboard',
      },
    })
  })

  it('does not read projectMode and keeps global or surface shared items out of the type set', () => {
    const project = createCourseProject({ id: 'layout-mode', now: NOW })
    const withMode = {
      ...project,
      projectMode: 'mixed',
      courseMode: 'flow',
    }
    expect(deriveCourseEditorLayout(withMode)).toMatchObject({
      layout: 'slide',
      referencedSurfaceTypes: ['slide'],
    })
    expect(Object.prototype.hasOwnProperty.call(project, 'projectMode')).toBe(false)
    expect(project.globalLayerItems.length).toBeGreaterThan(0)
    expect(project.surfaces[0]?.surfaceLayerItems).toEqual([])
  })
})

describe('course structure view model', () => {
  it('always exposes a fixed shared-content global-layer entry that is not a location', () => {
    const project = createCourseProject({ id: 'vm-global', now: NOW })
    const view = buildCourseStructureViewModel(project)
    expect(view.sharedContent).toMatchObject({
      id: SHARED_CONTENT_SECTION_ID,
      kind: 'shared-content',
      label: '共享内容',
      entries: [{
        id: GLOBAL_LAYER_ENTRY_ID,
        kind: 'global-layer',
        label: '全局层',
        rangeLabel: '全课',
        isLocation: false,
        writesHistory: false,
      }],
    })
    expect(view.pageTree.nodes.some((node) => node.id === GLOBAL_LAYER_ENTRY_ID)).toBe(false)
    expect(project.locations.some((location) => location.id === GLOBAL_LAYER_ENTRY_ID)).toBe(false)
    expect(deriveCourseEditorShellPolicy(project)).toMatchObject({
      showSharedContent: true,
      allowAddSlidePage: true,
      allowAddFlowPage: true,
      allowAddSpatialPage: true,
      compactPageTree: true,
      primaryNavigation: 'slide-thumbnails',
    })
  })

  it('uses a compact Slide scene list and groups Flow headings and Spatial cameras under pages', () => {
    const slide = createCourseProject({ id: 'vm-slide', title: '演示课', now: NOW })
    const slideView = buildCourseStructureViewModel(slide)
    expect(slideView.pageTree.compact).toBe(true)
    expect(slideView.pageTree.nodes).toEqual([expect.objectContaining({
      kind: 'slide-scene',
      label: '场景 1',
      locationId: slide.startLocationId,
      children: [],
    })])

    let flow = createBlankFlowCourseProject({ id: 'vm-flow', title: '讲义课', now: NOW })
    const flowSurface = flow.surfaces[0]
    if (flowSurface?.type !== 'flow') throw new Error('expected flow')
    flow = addFlowBlock(flow, flowSurface.id, {
      type: 'paragraph',
      id: 'flow-body',
      text: '普通段落不应出现在课程树',
    }, NOW)
    flow = addFlowBlock(flow, flowSurface.id, {
      type: 'heading',
      id: 'flow-h2',
      level: 2,
      text: '第二节',
    }, NOW)
    const flowView = buildCourseStructureViewModel(flow)
    expect(flowView.pageTree.compact).toBe(false)
    expect(flowView.pageTree.nodes).toHaveLength(1)
    expect(flowView.pageTree.nodes[0]).toMatchObject({
      kind: 'flow-page',
      label: '讲义课',
      surfaceId: flowSurface.id,
    })
    expect(flowView.pageTree.nodes[0]?.children.map((node) => ({
      kind: node.kind,
      label: node.label,
    }))).toEqual([
      { kind: 'flow-heading', label: '新讲义' },
      { kind: 'flow-heading', label: '第二节' },
    ])
    expect(flow.locations.some((location) =>
      location.kind === 'flow-block' && location.blockId === 'flow-body',
    )).toBe(true)

    let spatial = createBlankSpatialCourseProject({ id: 'vm-spatial', title: '画布课', now: NOW })
    const spatialSurface = spatial.surfaces[0]
    if (spatialSurface?.type !== 'spatial-2d') throw new Error('expected spatial')
    spatial = addSpatialCameraFrame(spatial, spatialSurface.id, { x: 80, y: 40, zoom: 1 }, {
      id: 'camera-detail',
      name: '细节',
      now: NOW,
    })
    const spatialView = buildCourseStructureViewModel(spatial)
    expect(spatialView.pageTree.nodes).toHaveLength(1)
    expect(spatialView.pageTree.nodes[0]).toMatchObject({
      kind: 'spatial-page',
      label: '画布课',
      surfaceId: spatialSurface.id,
    })
    expect(spatialView.pageTree.nodes[0]?.children).toEqual([expect.objectContaining({
      kind: 'spatial-camera-group',
      label: '本页镜头',
      locationId: null,
      children: [
        expect.objectContaining({ kind: 'spatial-camera', label: '总览' }),
        expect.objectContaining({ kind: 'spatial-camera', label: '细节' }),
      ],
    })])
    expect(spatial.locations).toHaveLength(2)
  })

  it('keeps Mixed pages in location order under one tree', () => {
    let project = createCourseProject({ id: 'vm-mixed', title: '混合课', now: NOW })
    project = addCourseSurface(project, 'flow', { id: 'mixed-flow', now: NOW })
    project = addCourseSurface(project, 'spatial-2d', { id: 'mixed-spatial', now: NOW })
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
    const view = buildCourseStructureViewModel(project)
    expect(view.layout.layout).toBe('mixed')
    expect(view.pageTree.compact).toBe(false)
    expect(view.pageTree.nodes.map((node) => node.kind)).toEqual([
      'slide-page',
      'flow-page',
      'spatial-page',
    ])
    expect(view.shell).toMatchObject({
      primaryNavigation: 'course-page-tree',
      leftPanelLabel: '课程结构',
      showSharedContent: true,
      allowAddSlidePage: true,
      allowAddFlowPage: true,
      allowAddSpatialPage: true,
    })
  })

  it('shows the scene-state strip only on Slide, legacy, or unavailable workspaces', () => {
    expect(courseWorkspaceShowsSceneStateStrip('slide')).toBe(true)
    expect(courseWorkspaceShowsSceneStateStrip('legacy')).toBe(true)
    expect(courseWorkspaceShowsSceneStateStrip('unavailable')).toBe(true)
    expect(courseWorkspaceShowsSceneStateStrip('flow')).toBe(false)
    expect(courseWorkspaceShowsSceneStateStrip('spatial')).toBe(false)
  })
})
