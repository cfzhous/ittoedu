import { describe, expect, it, vi } from 'vitest'
import { createCourseProject } from '@/renderer/course/courseStudioModel'
import { buildPublishedCourseV2Payload } from '@/renderer/export/course/buildPublishedCourse'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type {
  CourseProjectDocument,
  ScopedLayerItem,
  SpatialSurfaceDocument,
} from '@/shared/courseProjectTypes'
import { startPublishedCourse } from '@/player/PublishedCourseApp'
import { CoursePlayer } from '@/player/surfaces/CoursePlayer'

function spatialSurfaceDocument(): SpatialSurfaceDocument {
  return {
    id: 'spatial-surface',
    title: '空间',
    type: 'spatial-2d',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'finite', x: -600, y: -400, width: 1200, height: 800 },
      layerItems: [],
    },
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [
        { id: 'frame-1', name: '镜头一', x: 100, y: 60, zoom: 1 },
        { id: 'frame-2', name: '镜头二', x: -300, y: 120, zoom: 1.5 },
        { id: 'frame-3', name: '镜头三', x: 500, y: -200, zoom: 2 },
      ],
    },
    semanticZoom: [],
  }
}

function teacherControllerLayer(): ScopedLayerItem {
  return {
    item: {
      layerItemId: 'course-teacher-controller',
      label: '教师控制器',
      frame: { mode: 'absolute', x: 110, y: 638, width: 900, height: 64 },
      order: 50,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      kind: 'native',
      content: {
        nativeType: 'teacher-controller',
        data: {
          title: '教师控制台',
          showSceneProgress: false,
          compact: false,
          collapsible: true,
          defaultCollapsed: false,
          buttons: [
            { id: 'previous', action: { type: 'scene.previous' }, label: '上一页', visible: true },
            { id: 'next', action: { type: 'scene.next' }, label: '下一页', visible: true },
            { id: 'replay', action: { type: 'scene.replay' }, label: '重播', visible: true },
            { id: 'restart', action: { type: 'course.restart' }, label: '重新开始', visible: true },
            { id: 'picker', action: { type: 'scene.open-picker' }, label: '场景目录', visible: true },
            { id: 'sound', action: { type: 'audio.toggle-mute' }, label: '声音', visible: true },
          ],
          style: {
            backgroundColor: '#172033',
            backgroundOpacity: 0.94,
            accentColor: '#e7b85c',
            textColor: '#f8fafc',
            cornerRadius: 16,
          },
          includeInStaticExports: false,
        },
      },
    },
    visibility: { mode: 'all', locationIds: [] },
  }
}

function spatialProject(): CourseProjectDocument {
  const project = createCourseProject({ id: 'published-spatial', title: '空间发布课件' })
  const spatial = spatialSurfaceDocument()
  project.surfaces = [spatial]
  project.locations = [
    {
      id: 'location-spatial-1',
      label: '镜头一',
      kind: 'spatial-camera',
      surfaceId: spatial.id,
      cameraFrameId: 'frame-1',
    },
    {
      id: 'location-spatial-2',
      label: '镜头二',
      kind: 'spatial-camera',
      surfaceId: spatial.id,
      cameraFrameId: 'frame-2',
    },
    {
      id: 'location-spatial-3',
      label: '镜头三',
      kind: 'spatial-camera',
      surfaceId: spatial.id,
      cameraFrameId: 'frame-3',
    },
  ]
  project.startLocationId = 'location-spatial-1'
  project.globalLayerItems = [teacherControllerLayer()]
  return courseProjectDocumentSchema.parse(project)
}

function publish(project: CourseProjectDocument) {
  return buildPublishedCourseV2Payload({
    project,
    assetFiles: {},
    components: {},
  })
}

function worldTransform(root: HTMLElement): string {
  return root.querySelector<SVGGElement>('[data-spatial-world]')?.getAttribute('transform') ?? ''
}

function expectSpatialCamera(root: HTMLElement, x: number, y: number, zoom: number): void {
  const transform = worldTransform(root)
  expect(transform).toContain(`scale(${zoom})`)
  expect(transform).toContain(`translate(${-x} ${-y})`)
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('PublishedCourseApp Spatial wiring', () => {
  it('passes the single-owner executor and playback options to the Spatial host', async () => {
    history.replaceState(null, '', '#')
    const project = spatialProject()
    project.playback.controls = 'canvas'
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(publish(project), root)

    expect(app.currentLocationId).toBe('location-spatial-1')
    expectSpatialCamera(root, 100, 60, 1)

    // Count course-player activations after boot. The next button must reach
    // the single course-level executor exactly once: one guarded navigation,
    // one surface activation, one camera-frame application.
    const activateSurface = vi.spyOn(CoursePlayer.prototype, 'activateSurface')
    root.querySelector<HTMLButtonElement>('[data-controller-button-id="next"]')!.click()
    await vi.waitFor(() => {
      expect(app.currentLocationId).toBe('location-spatial-2')
    })
    expectSpatialCamera(root, -300, 120, 1.5)
    await flushAsyncWork()
    expect(activateSurface).toHaveBeenCalledTimes(1)
    expect(app.currentLocationId).toBe('location-spatial-2')

    activateSurface.mockRestore()
    await app.destroy()
    root.remove()
    history.replaceState(null, '', '#')
  })

  it('restores the Spatial camera frame on replay and restart after a home jump', async () => {
    history.replaceState(null, '', '#')
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(publish(spatialProject()), root)

    expect(app.currentLocationId).toBe('location-spatial-1')
    expectSpatialCamera(root, 100, 60, 1)

    // Same-surface navigation changes only the camera frame, not the host.
    expect(await app.navigate('location-spatial-2')).toBe(true)
    expect(app.currentLocationId).toBe('location-spatial-2')
    expectSpatialCamera(root, -300, 120, 1.5)

    // Jump to the authored home camera without changing the current location.
    root.querySelector<HTMLButtonElement>('[data-camera-frame-id="home"]')!.click()
    expectSpatialCamera(root, 0, 0, 1)

    // Replay re-enters the current location's camera frame.
    await app.replay()
    expect(app.currentLocationId).toBe('location-spatial-2')
    expectSpatialCamera(root, -300, 120, 1.5)

    // Restart returns to the start location's camera frame.
    root.querySelector<HTMLButtonElement>('[data-camera-frame-id="home"]')!.click()
    expectSpatialCamera(root, 0, 0, 1)
    await app.restart()
    expect(app.currentLocationId).toBe('location-spatial-1')
    expectSpatialCamera(root, 100, 60, 1)

    await app.destroy()
    root.remove()
    history.replaceState(null, '', '#')
  })

  it('honors playback controls none for Spatial teacher controllers', async () => {
    history.replaceState(null, '', '#')
    const project = spatialProject()
    project.playback.controls = 'none'
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(publish(project), root)

    const wrapper = root.querySelector<HTMLElement>(
      '[data-layer-item-id="course-teacher-controller"]',
    )!
    expect(wrapper.hidden).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('[data-controller-button-id="next"]'))
      .not.toBeVisible()

    await app.destroy()
    root.remove()
    history.replaceState(null, '', '#')
  })

  it('seeds the Spatial teacher controller with the authored initial mute', async () => {
    history.replaceState(null, '', '#')
    const project = spatialProject()
    project.media.audio.defaultMuted = true
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await startPublishedCourse(publish(project), root)

    expect(root.querySelector<HTMLButtonElement>('[data-controller-button-id="sound"]'))
      .toHaveTextContent('声音 · 关')

    await app.destroy()
    root.remove()
    history.replaceState(null, '', '#')
  })
})
