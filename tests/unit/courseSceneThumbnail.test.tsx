import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import CourseSceneThumbnail from '@/renderer/course/CourseSceneThumbnail'
import {
  addSlideTextLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'

afterEach(cleanup)

describe('CourseSceneThumbnail', () => {
  it('renders the authored thumbnail state without running dynamic content', () => {
    const initial = createCourseProject({ id: 'thumbnail-course', now: '2026-08-14T00:00:00.000Z' })
    const surface = initial.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('expected initial Slide surface')
    const scene = surface.scenes[0]!
    const withText = addSlideTextLayer(initial, surface.id, scene.id, '缩略图文字', {
      id: 'thumbnail-text',
      now: '2026-08-14T00:00:01.000Z',
    })
    const project = updateCourseProject(withText, (draft) => {
      const draftSurface = draft.surfaces[0]!
      if (draftSurface.type !== 'slide') throw new Error('expected Slide surface')
      const draftScene = draftSurface.scenes[0]!
      const state = draftScene.presentation!.states[0]!
      state.backgroundColor = '#123456'
      state.layerItemOverrides['thumbnail-text'] = {
        frame: { x: 240, y: 180 },
        rotation: 12,
        opacity: 0.6,
      }
    }, '2026-08-14T00:00:02.000Z')
    const nextSurface = project.surfaces[0]!
    if (nextSurface.type !== 'slide') throw new Error('expected Slide surface')

    render(<CourseSceneThumbnail scene={nextSurface.scenes[0]!} width={160} />)

    expect(screen.getByRole('img', { name: '场景 1缩略图' })).toBeInTheDocument()
    expect(screen.getByText('缩略图文字')).toBeInTheDocument()
    const item = document.querySelector<HTMLElement>('[data-layer-item-id="thumbnail-text"]')
    expect(item).toHaveStyle({ left: '240px', top: '180px', opacity: '0.6' })
    expect(item?.style.transform).toBe('rotate(12deg)')
  })

  it('uses an explicit static marker for Runtime and Component items', () => {
    const project = createCourseProject({ id: 'dynamic-thumbnail', now: '2026-08-14T00:00:00.000Z' })
    const surface = project.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('expected Slide surface')
    surface.scenes[0]!.layerItems.push({
      layerItemId: 'runtime-item',
      label: '互动实验',
      kind: 'runtime',
      frame: { mode: 'absolute', x: 10, y: 20, width: 300, height: 200 },
      order: 0,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      runtime: {
        protocol: 'surface-v1',
        runtimeApiVersion: 3,
        enabled: true,
        renderMode: 'dom',
        source: 'CoursewareSurfaceRuntime.define(() => ({ mount() {} }))',
        content: { values: {} },
        assets: {},
      },
    })

    render(<CourseSceneThumbnail scene={surface.scenes[0]!} />)
    expect(screen.getByText('互动')).toBeInTheDocument()
  })

  it('includes visible shared and course-wide layers from the real scene compositor', () => {
    let project = createCourseProject({ id: 'shared-thumbnail', now: '2026-08-14T00:00:00.000Z' })
    const initialSurface = project.surfaces[0]!
    if (initialSurface.type !== 'slide') throw new Error('expected Slide surface')
    const sceneId = initialSurface.scenes[0]!.id
    project = addSlideTextLayer(project, initialSurface.id, sceneId, '场景内容', {
      id: 'scene-text',
      now: '2026-08-14T00:00:01.000Z',
    })
    project = updateCourseProject(project, (draft) => {
      const surface = draft.surfaces[0]!
      if (surface.type !== 'slide') throw new Error('expected Slide surface')
      const sceneText = surface.scenes[0]!.layerItems.find((item) => item.layerItemId === 'scene-text')!
      const firstSharedOrder = Math.max(
        ...surface.scenes[0]!.layerItems.map((item) => item.order),
        ...surface.surfaceLayerItems.map(({ item }) => item.order),
        ...draft.globalLayerItems.map(({ item }) => item.order),
      ) + 1
      const shared = structuredClone(sceneText)
      shared.layerItemId = 'shared-text'
      shared.label = '当前内容共用'
      if (shared.kind === 'native' && shared.content.nativeType === 'text') {
        shared.content.data.text = '共享背景文字'
      }
      shared.order = firstSharedOrder
      surface.surfaceLayerItems.push({ item: shared, visibility: { mode: 'all', locationIds: [] } })

      const global = structuredClone(sceneText)
      global.layerItemId = 'global-text'
      global.label = '全课程共用'
      if (global.kind === 'native' && global.content.nativeType === 'text') {
        global.content.data.text = '全课程标识'
      }
      global.order = firstSharedOrder + 1
      draft.globalLayerItems.push({ item: global, visibility: { mode: 'all', locationIds: [] } })
    }, '2026-08-14T00:00:02.000Z')
    const surface = project.surfaces[0]!
    if (surface.type !== 'slide') throw new Error('expected Slide surface')
    const locationId = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.surfaceId === surface.id && location.sceneId === sceneId
    ))!.id

    render(
      <CourseSceneThumbnail
        scene={surface.scenes[0]!}
        sharedLayerItems={[...project.globalLayerItems, ...surface.surfaceLayerItems]}
        locationId={locationId}
      />,
    )

    expect(screen.getByText('场景内容')).toBeInTheDocument()
    expect(screen.getByText('共享背景文字')).toBeInTheDocument()
    expect(screen.getByText('全课程标识')).toBeInTheDocument()
  })
})
