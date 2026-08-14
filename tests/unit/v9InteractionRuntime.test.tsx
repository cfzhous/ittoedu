import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'
import { CourseGlobalInteractionController } from '@/player/CourseGlobalInteractionController'
import { PublishedCourseApp } from '@/player/PublishedCourseApp'
import { SlideSurfaceHost } from '@/player/surfaces/slide/SlideSurfaceHost'
import CourseStudioApp from '@/renderer/course/CourseStudioApp'
import {
  addSlideTextLayer,
  addSlideScene,
  addCourseSurface,
  addVideoLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { buildPublishedCourseV2Payload } from '@/renderer/export/course/buildPublishedCourse'
import { replaceSlideSceneInteractions } from '@/renderer/course/v9InteractionModel'
import type { CourseProjectDocument, SlideSurfaceDocument } from '@/shared/courseProjectTypes'

vi.mock('@/renderer/export/loadPlayerBundle', () => ({
  loadPlayerBundle: () => 'mock player bundle',
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function mountedServices() {
  return {
    navigate: vi.fn(),
    getCourseState: vi.fn(),
    setCourseState: vi.fn(),
    resolveAsset: (id: string) => `asset://${id}`,
    reportDiagnostic: vi.fn(),
  }
}

function slideOf(project: CourseProjectDocument): SlideSurfaceDocument {
  const slide = project.surfaces.find((surface) => surface.type === 'slide')
  if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
  return slide
}

function projectWithTextTargets(): CourseProjectDocument {
  let project = createCourseProject({ id: 'v9-interaction-runtime', now: '2026-08-14T00:00:00.000Z' })
  const slide = slideOf(project)
  const sceneId = slide.scenes[0]!.id
  project = addSlideTextLayer(project, slide.id, sceneId, '触发按钮', {
    id: 'trigger-layer',
    now: '2026-08-14T00:00:01.000Z',
  })
  project = addSlideTextLayer(project, slide.id, sceneId, '待隐藏内容', {
    id: 'target-layer',
    now: '2026-08-14T00:00:02.000Z',
  })
  return updateCourseProject(project, (draft) => {
    const current = draft.surfaces.find((surface) => surface.id === slide.id)
    if (!current || current.type !== 'slide') throw new Error('expected Slide surface')
    const scene = current.scenes[0]!
    scene.presentation!.states.push({
      id: 'review-result',
      name: '复核结果',
      layerItemOverrides: {},
    })
    scene.interactions = [{
      id: 'scene-click-hide',
      name: '点击后隐藏',
      enabled: true,
      trigger: { type: 'node.click', nodeId: 'trigger-layer' },
      conditions: [],
      actions: [{
        id: 'hide-target',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'node.exit',
          nodeId: 'target-layer',
          effect: 'none',
          durationMs: 0,
          easing: 'linear',
        },
      }],
    }]
    draft.globalInteractions = [{
      id: 'global-click-review',
      name: '全局切换复核画面',
      enabled: true,
      trigger: { type: 'node.click', nodeId: 'trigger-layer' },
      conditions: [{ type: 'scene.in', sceneIds: [scene.id] }],
      actions: [{
        id: 'show-review-result',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'presentation.set', stateId: 'review-result' },
      }],
    }]
  }, '2026-08-14T00:00:03.000Z')
}

describe('native V9 interaction runtime', () => {
  it('executes scene and global rules against stable layer wrappers', async () => {
    const project = projectWithTextTargets()
    const slide = slideOf(project)
    const events = new CourseEventBus()
    const container = document.createElement('div')
    const host = new SlideSurfaceHost(slide, {
      globalLayerItems: project.globalLayerItems,
      interactionEvents: events,
    })
    await host.mount({
      surfaceId: slide.id,
      container,
      services: mountedServices(),
      signal: new AbortController().signal,
    })
    const global = new CourseGlobalInteractionController({
      root: container,
      rules: project.globalInteractions,
      events,
      currentSurfaceId: () => slide.id,
      currentSceneId: () => host.sceneId,
      presentation: {
        current: () => host.stateId ?? null,
        states: () => host.document.scenes.find((scene) => scene.id === host.sceneId)
          ?.presentation?.states ?? [],
        setState: (stateId) => host.setPresentationState(stateId).then(() => true),
        transitionTo: (stateId) => host.setPresentationState(stateId).then(() => true),
      },
      hostActions: {
        goToScene: () => false,
        nextScene: () => false,
        previousScene: () => false,
        replayScene: () => false,
        restartCourse: () => false,
      },
    })
    await host.activate()

    const trigger = container.querySelector<HTMLElement>('[data-layer-item-id="trigger-layer"]')!
    const target = container.querySelector<HTMLElement>('[data-layer-item-id="target-layer"]')!
    trigger.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))

    await vi.waitFor(() => {
      expect(target).toHaveAttribute('hidden')
      expect(host.stateId).toBe('review-result')
    })
    global.destroy()
    await host.destroy()
    events.dispose()
  })

  it('routes native video start, timed and ended events through play, pause and restart actions', async () => {
    let project = createCourseProject({ id: 'v9-video-rules', now: '2026-08-14T00:00:00.000Z' })
    const first = slideOf(project)
    project = updateCourseProject(project, (draft) => {
      draft.assets['lesson-video-asset'] = {
        id: 'lesson-video-asset',
        filename: 'lesson.mp4',
        mimeType: 'video/mp4',
        kind: 'video',
        path: 'assets/lesson-video.bin',
        byteLength: 8,
        width: 1280,
        height: 720,
        duration: 20,
      }
    })
    project = addVideoLayer(project, {
      surfaceId: first.id,
      sceneId: first.scenes[0]!.id,
      assetId: 'lesson-video-asset',
      id: 'lesson-video',
      now: '2026-08-14T00:00:01.000Z',
    })
    project = updateCourseProject(project, (draft) => {
      const slide = draft.surfaces.find((surface) => surface.id === first.id)
      if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
      slide.scenes[0]!.interactions = [
        {
          id: 'play-on-entry', name: '进入后播放', enabled: true,
          trigger: { type: 'scene.enter' }, conditions: [],
          actions: [{ id: 'play', start: 'after-previous', delayMs: 0, action: { type: 'video.play', nodeId: 'lesson-video' } }],
        },
        {
          id: 'pause-at-five', name: '五秒暂停', enabled: true,
          trigger: { type: 'video.time', nodeId: 'lesson-video', seconds: 5 }, conditions: [],
          actions: [{ id: 'pause', start: 'after-previous', delayMs: 0, action: { type: 'video.pause', nodeId: 'lesson-video' } }],
        },
        {
          id: 'restart-at-end', name: '结束后重播', enabled: true,
          trigger: { type: 'video.ended', nodeId: 'lesson-video' }, conditions: [],
          actions: [{ id: 'restart', start: 'after-previous', delayMs: 0, action: { type: 'video.restart', nodeId: 'lesson-video' } }],
        },
      ]
    })
    const slide = slideOf(project)
    const events = new CourseEventBus()
    const container = document.createElement('div')
    const host = new SlideSurfaceHost(slide, { interactionEvents: events })
    await host.mount({
      surfaceId: slide.id,
      container,
      services: mountedServices(),
      signal: new AbortController().signal,
    })
    const video = container.querySelector<HTMLVideoElement>('[data-layer-item-id="lesson-video"] video')!
    const play = vi.fn(async () => undefined)
    const pause = vi.fn()
    Object.defineProperty(video, 'play', { configurable: true, value: play })
    Object.defineProperty(video, 'pause', { configurable: true, value: pause })
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 })

    await host.activate()
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    video.currentTime = 5.2
    video.dispatchEvent(new Event('timeupdate'))
    await vi.waitFor(() => expect(pause).toHaveBeenCalledTimes(1))
    video.currentTime = 20
    video.dispatchEvent(new Event('ended'))
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    expect(video.currentTime).toBe(0)

    await host.destroy()
    events.dispose()
  })

  it('can reveal an initially hidden layer from the scene-entry frame', async () => {
    let project = projectWithTextTargets()
    const initial = slideOf(project)
    project = updateCourseProject(project, (draft) => {
      const slide = draft.surfaces.find((surface) => surface.id === initial.id)
      if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
      const target = slide.scenes[0]!.layerItems.find((item) => item.layerItemId === 'target-layer')!
      target.playbackInitialVisibility = 'hidden'
      slide.scenes[0]!.interactions = [{
        id: 'reveal-on-entry', name: '进入后显示', enabled: true,
        trigger: { type: 'scene.enter' }, conditions: [],
        actions: [{
          id: 'reveal', start: 'after-previous', delayMs: 0,
          action: {
            type: 'node.enter', nodeId: 'target-layer', effect: 'none',
            durationMs: 0, easing: 'linear',
          },
        }],
      }]
    })
    const slide = slideOf(project)
    const events = new CourseEventBus()
    const container = document.createElement('div')
    const host = new SlideSurfaceHost(slide, { interactionEvents: events })
    await host.mount({
      surfaceId: slide.id,
      container,
      services: mountedServices(),
      signal: new AbortController().signal,
    })
    const target = container.querySelector<HTMLElement>('[data-layer-item-id="target-layer"]')!
    expect(target).toHaveAttribute('hidden')
    await host.activate()
    await vi.waitFor(() => expect(target).not.toHaveAttribute('hidden'))
    await host.destroy()
    events.dispose()
  })

  it('runs a rule authored in Course Studio during the same V9 trial session', async () => {
    const view = render(<CourseStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: '添加文字' }))
    await waitFor(() => expect(view.container.querySelector('.slide-native-text')).toHaveTextContent('双击编辑文字'))
    fireEvent.click(screen.getByRole('tab', { name: '互动' }))
    fireEvent.click(screen.getByRole('button', { name: '添加：点击所选图层时' }))
    fireEvent.click(screen.getByRole('button', { name: '试运行' }))

    const wrapper = view.container.querySelector<HTMLElement>('.slide-layer-item:has(.slide-native-text)')!
    await waitFor(() => expect(wrapper).not.toHaveAttribute('hidden'))
    wrapper.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await waitFor(() => expect(wrapper).toHaveAttribute('hidden'))
  })

  it('preserves authored rules through Published Course V2 and executes them in the real player', async () => {
    let project = createCourseProject({ id: 'published-v9-rule', now: '2026-08-14T00:00:00.000Z' })
    project.globalLayerItems = []
    const slide = slideOf(project)
    const sceneId = slide.scenes[0]!.id
    project = addSlideTextLayer(project, slide.id, sceneId, '发布后点击我', {
      id: 'published-trigger',
      now: '2026-08-14T00:00:01.000Z',
    })
    project = replaceSlideSceneInteractions(project, slide.id, sceneId, [{
      id: 'published-hide',
      name: '发布后隐藏',
      enabled: true,
      trigger: { type: 'node.click', nodeId: 'published-trigger' },
      conditions: [],
      actions: [{
        id: 'published-hide-action',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'node.exit',
          nodeId: 'published-trigger',
          effect: 'none',
          durationMs: 0,
          easing: 'linear',
        },
      }],
    }])
    const payload = buildPublishedCourseV2Payload({ project, assetFiles: {}, components: {} })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await PublishedCourseApp.create(payload, root)
    const wrapper = root.querySelector<HTMLElement>('[data-layer-item-id="published-trigger"]')!
    wrapper.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await vi.waitFor(() => expect(wrapper).toHaveAttribute('hidden'))
    await app.destroy()
  })

  it('routes next-scene and course-restart actions through published V9 navigation authority', async () => {
    let project = createCourseProject({ id: 'published-v9-navigation', now: '2026-08-14T00:00:00.000Z' })
    project.globalLayerItems = []
    const initial = slideOf(project)
    const firstSceneId = initial.scenes[0]!.id
    project = addSlideTextLayer(project, initial.id, firstSceneId, '进入下一场景', {
      id: 'go-next',
      now: '2026-08-14T00:00:01.000Z',
    })
    project = addSlideScene(project, initial.id, {
      id: 'second-scene',
      name: '第二场景',
      now: '2026-08-14T00:00:02.000Z',
    })
    project = addSlideTextLayer(project, initial.id, 'second-scene', '重新开始课程', {
      id: 'restart-course',
      now: '2026-08-14T00:00:03.000Z',
    })
    project = updateCourseProject(project, (draft) => {
      const slide = draft.surfaces.find((surface) => surface.id === initial.id)
      if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
      slide.scenes[0]!.interactions = [{
        id: 'next-rule', enabled: true, trigger: { type: 'node.click', nodeId: 'go-next' }, conditions: [],
        actions: [{ id: 'next-action', start: 'after-previous', delayMs: 0, action: { type: 'scene.next' } }],
      }]
      slide.scenes[1]!.interactions = [{
        id: 'restart-rule', enabled: true, trigger: { type: 'node.click', nodeId: 'restart-course' }, conditions: [],
        actions: [{ id: 'restart-action', start: 'after-previous', delayMs: 0, action: { type: 'course.restart' } }],
      }]
    })
    const payload = buildPublishedCourseV2Payload({ project, assetFiles: {}, components: {} })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await PublishedCourseApp.create(payload, root)
    const firstLocation = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === firstSceneId
    ))!
    const secondLocation = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === 'second-scene'
    ))!
    root.querySelector<HTMLElement>('[data-layer-item-id="go-next"]')!
      .dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await vi.waitFor(() => expect(app.currentLocationId).toBe(secondLocation.id))
    root.querySelector<HTMLElement>('[data-layer-item-id="restart-course"]')!
      .dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await vi.waitFor(() => expect(app.currentLocationId).toBe(firstLocation.id))
    await app.destroy()
  })

  it('uses the authored initial frame and a saved frame even when the scene has only one base location', async () => {
    let project = createCourseProject({ id: 'published-base-location-state', now: '2026-08-14T00:00:00.000Z' })
    const slide = slideOf(project)
    const scene = slide.scenes[0]!
    project = updateCourseProject(project, (draft) => {
      const currentSlide = draft.surfaces.find((surface) => surface.id === slide.id)
      if (!currentSlide || currentSlide.type !== 'slide') throw new Error('expected Slide surface')
      currentSlide.scenes[0]!.presentation = {
        initialStateId: 'state-b',
        states: [
          { id: 'state-a', name: '画面 A', layerItemOverrides: {} },
          { id: 'state-b', name: '画面 B', layerItemOverrides: {} },
        ],
      }
    })
    const baseLocation = project.locations.find((location) => (
      location.kind === 'slide-scene' && location.sceneId === scene.id
    ))!
    const sharedLayerId = project.globalLayerItems[0]!.item.layerItemId
    project = updateCourseProject(project, (draft) => {
      draft.globalLayerItems[0]!.visibility = {
        mode: 'include',
        locationIds: [baseLocation.id],
      }
    })
    const payload = buildPublishedCourseV2Payload({ project, assetFiles: {}, components: {} })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await PublishedCourseApp.create(payload, root)

    await app.setPresentationState(slide.id, 'state-a')
    expect(app.presentationState(slide.id).current).toBe('state-a')
    expect(await app.goToScene(scene.id)).toBe(true)
    expect(app.presentationState(slide.id).current).toBe('state-b')
    expect(app.currentLocationId).toBe(baseLocation.id)

    expect(await app.goToScene(scene.id, 'state-a')).toBe(true)
    expect(app.presentationState(slide.id).current).toBe('state-a')
    expect(app.currentLocationId).toBe(baseLocation.id)
    expect(root.querySelector<HTMLElement>(`[data-layer-item-id="${sharedLayerId}"]`)?.hidden).toBe(false)
    await app.destroy()
  })

  it('keeps course-global node rules alive after navigating from Slide to Flow', async () => {
    let project = addCourseSurface(
      createCourseProject({ id: 'published-mixed-global', now: '2026-08-14T00:00:00.000Z' }),
      'flow',
      { id: 'mixed-flow', now: '2026-08-14T00:00:01.000Z' },
    )
    const globalNodeId = project.globalLayerItems[0]!.item.layerItemId
    const slideLocation = project.locations.find((location) => location.kind === 'slide-scene')!
    const flowLocation = project.locations.find((location) => location.kind === 'flow-block')!
    project = updateCourseProject(project, (draft) => {
      draft.startLocationId = slideLocation.id
      draft.globalInteractions = [{
        id: 'mixed-global-previous',
        name: '跨表面返回',
        enabled: true,
        trigger: { type: 'node.click', nodeId: globalNodeId },
        conditions: [],
        actions: [{
          id: 'mixed-previous-action',
          start: 'after-previous',
          delayMs: 0,
          action: { type: 'scene.previous' },
        }],
      }]
    })
    const payload = buildPublishedCourseV2Payload({ project, assetFiles: {}, components: {} })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await PublishedCourseApp.create(payload, root)
    await app.navigate(flowLocation.id)
    const flowWrapper = [...root.querySelectorAll<HTMLElement>(`[data-layer-item-id="${globalNodeId}"]`)]
      .find((element) => element.closest<HTMLElement>('[data-surface-id]')?.dataset.surfaceId === 'mixed-flow')
    expect(flowWrapper).toBeDefined()
    flowWrapper!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await vi.waitFor(() => expect(app.currentLocationId).toBe(slideLocation.id))
    await app.destroy()
  })

  it('executes V9 published course audio and routes its ended event back into scene rules', async () => {
    const createdAudio: HTMLAudioElement[] = []
    vi.stubGlobal('Audio', vi.fn(function (source: string) {
      const audio = document.createElement('audio')
      audio.src = source
      Object.defineProperty(audio, 'play', {
        configurable: true,
        value: vi.fn(() => {
          audio.dispatchEvent(new Event('play'))
          return Promise.resolve()
        }),
      })
      Object.defineProperty(audio, 'pause', {
        configurable: true,
        value: vi.fn(() => audio.dispatchEvent(new Event('pause'))),
      })
      createdAudio.push(audio)
      return audio
    }))

    let project = createCourseProject({ id: 'published-v9-audio', now: '2026-08-14T00:00:00.000Z' })
    project.globalLayerItems = []
    const initial = slideOf(project)
    const sceneId = initial.scenes[0]!.id
    project = addSlideTextLayer(project, initial.id, sceneId, '声音结束后隐藏', {
      id: 'audio-result',
      now: '2026-08-14T00:00:01.000Z',
    })
    project = updateCourseProject(project, (draft) => {
      draft.assets['lesson-sound-asset'] = {
        id: 'lesson-sound-asset',
        filename: 'lesson.mp3',
        mimeType: 'audio/mpeg',
        kind: 'audio',
        path: 'assets/lesson-sound.bin',
        byteLength: 4,
        duration: 1,
      }
      draft.media.audio.sounds['lesson-sound'] = {
        id: 'lesson-sound',
        name: '课堂提示音',
        assetId: 'lesson-sound-asset',
        channel: 'narration',
        defaultVolume: 0.8,
        defaultLoop: false,
      }
      draft.globalInteractions = [{
        id: 'global-hide-after-audio', name: '全局接收声音结束', enabled: true,
        trigger: { type: 'audio.ended', soundId: 'lesson-sound' },
        conditions: [],
        actions: [{
          id: 'hide-audio-result', start: 'after-previous', delayMs: 0,
          action: {
            type: 'node.exit', nodeId: 'audio-result', effect: 'none',
            durationMs: 0, easing: 'linear',
          },
        }],
      }]
      const slide = draft.surfaces.find((surface) => surface.id === initial.id)
      if (!slide || slide.type !== 'slide') throw new Error('expected Slide surface')
      slide.scenes[0]!.interactions = [{
        id: 'play-audio-on-entry', name: '进入后播放声音', enabled: true,
        trigger: { type: 'scene.enter' }, conditions: [],
        actions: [{
          id: 'play-audio', start: 'after-previous', delayMs: 0,
          action: { type: 'audio.play', soundId: 'lesson-sound' },
        }],
      }]
    })
    const payload = buildPublishedCourseV2Payload({
      project,
      assetFiles: { 'lesson-sound-asset': new Uint8Array([1, 2, 3, 4]) },
      components: {},
    })
    const root = document.createElement('div')
    document.body.appendChild(root)
    const app = await PublishedCourseApp.create(payload, root)
    await vi.waitFor(() => expect(createdAudio).toHaveLength(1))
    createdAudio[0]!.dispatchEvent(new Event('ended'))
    const result = root.querySelector<HTMLElement>('[data-layer-item-id="audio-result"]')!
    await vi.waitFor(() => expect(result).toHaveAttribute('hidden'))
    await app.destroy()
  })
})
