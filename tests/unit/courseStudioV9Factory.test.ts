import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addComponentLayer,
  addCourseSurface,
  addImageLayer,
  addNativeVisualLayer,
  addSlideScene,
  addSlideTextLayer,
  addVideoLayer,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-14T00:00:00.000Z'

describe('direct Course Project V9 factories', () => {
  it('creates a complete V9 project without a Project V8 construction path', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/renderer/course/courseStudioModel.ts'),
      'utf8',
    )
    expect(source).not.toContain('migrateProjectV8ToCourseProjectV9')
    expect(source).not.toContain('../project/createProject')
    expect(source).not.toMatch(/\bcreateProject\s*\(/u)
    expect(source).not.toContain("stableId('scratch')")

    const project = createCourseProject({ id: 'direct-v9', title: '二次函数', now: NOW })
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)
    expect(project).toMatchObject({
      schemaVersion: 9,
      id: 'direct-v9',
      revision: 0,
      title: '二次函数',
      createdAt: NOW,
      updatedAt: NOW,
      startLocationId: project.locations[0]!.id,
      playback: { controls: 'canvas', keyboardNavigation: true },
    })
    const slide = project.surfaces[0]
    expect(slide).toMatchObject({
      id: 'slide:direct-v9',
      type: 'slide',
      canvas: { width: 1280, height: 720 },
      scenes: [{
        name: '场景 1',
        presentation: {
          initialStateId: 'state_initial',
          thumbnailStateId: 'state_initial',
          states: [{ id: 'state_initial', name: '初始', layerItemOverrides: {} }],
        },
      }],
    })
    const controller = project.globalLayerItems[0]?.item
    expect(controller).toMatchObject({
      kind: 'native',
      label: '教师控制器',
      frame: { mode: 'absolute', x: 190, y: 638, width: 900, height: 64 },
      content: {
        nativeType: 'teacher-controller',
        data: { title: '教师控制台', includeInStaticExports: false },
      },
    })
  })

  it('gives every newly created Slide scene an editable initial review state', () => {
    let project = createCourseProject({ id: 'direct-scenes', now: NOW })
    project = addCourseSurface(project, 'slide', { id: 'slide-second', now: NOW })
    project = addSlideScene(project, 'slide-second', {
      id: 'scene-second',
      name: '新场景',
      now: NOW,
    })
    const slide = project.surfaces.find((surface) => surface.id === 'slide-second')
    if (slide?.type !== 'slide') throw new Error('expected Slide surface')
    expect(slide.scenes).toHaveLength(2)
    expect(slide.scenes.every((scene) => (
      scene.presentation?.initialStateId === 'state_initial' &&
      scene.presentation.states[0]?.name === '初始'
    ))).toBe(true)
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
  })

  it('constructs text, formula, shape, image and video as native V9 layers and saves them', () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71])
    const videoBytes = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112])
    let project = updateCourseProject(
      createCourseProject({ id: 'direct-native-layers', now: NOW }),
      (draft) => {
        draft.assets.image = {
          id: 'image',
          filename: 'image.png',
          mimeType: 'image/png',
          kind: 'image',
          path: 'assets/image.bin',
          byteLength: imageBytes.byteLength,
          width: 640,
          height: 360,
        }
        draft.assets.video = {
          id: 'video',
          filename: 'video.mp4',
          mimeType: 'video/mp4',
          kind: 'video',
          path: 'assets/video.bin',
          byteLength: videoBytes.byteLength,
          width: 1280,
          height: 720,
          duration: 12,
        }
      },
      NOW,
    )
    const slide = project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected Slide surface')
    const sceneId = slide.scenes[0]!.id
    project = addSlideTextLayer(project, slide.id, sceneId, '可编辑标题', {
      id: 'text-direct',
      now: NOW,
    })
    project = addNativeVisualLayer(project, {
      surfaceId: slide.id,
      sceneId,
      nativeType: 'formula',
      id: 'formula-direct',
      now: NOW,
    })
    project = addNativeVisualLayer(project, {
      surfaceId: slide.id,
      sceneId,
      nativeType: 'shape',
      id: 'shape-direct',
      x: 80,
      y: 96,
      now: NOW,
    })
    project = addImageLayer(project, {
      surfaceId: slide.id,
      sceneId,
      assetId: 'image',
      id: 'image-direct',
      width: 480,
      height: 270,
      now: NOW,
    })
    project = addVideoLayer(project, {
      surfaceId: slide.id,
      sceneId,
      assetId: 'video',
      id: 'video-direct',
      autoplay: true,
      muted: true,
      now: NOW,
    })

    const current = project.surfaces[0]
    if (current?.type !== 'slide') throw new Error('expected Slide surface')
    const items = Object.fromEntries(current.scenes[0]!.layerItems.map((item) => [
      item.layerItemId,
      item,
    ]))
    expect(items['text-direct']).toMatchObject({
      kind: 'native',
      frame: { mode: 'absolute', x: 120, y: 120, width: 400, height: 80 },
      content: { nativeType: 'text', data: { text: '可编辑标题', runs: [] } },
    })
    expect(items['formula-direct']).toMatchObject({
      kind: 'native',
      content: { nativeType: 'formula', data: { formulaId: 'formula:formula-direct' } },
    })
    expect(items['shape-direct']).toMatchObject({
      kind: 'native',
      frame: { x: 80, y: 96 },
      content: { nativeType: 'shape', data: { shapeType: 'rounded-rectangle' } },
    })
    expect(items['image-direct']).toMatchObject({
      kind: 'native',
      frame: { width: 480, height: 270 },
      content: { nativeType: 'image', data: { assetId: 'image', fit: 'contain' } },
    })
    expect(items['video-direct']).toMatchObject({
      kind: 'native',
      content: {
        nativeType: 'video',
        data: { assetId: 'video', autoplay: true, muted: true, endTime: null },
      },
    })
    expect(courseProjectDocumentSchema.parse(project)).toEqual(project)

    const archived = createCourseProjectArchive({
      project,
      assetFiles: { image: imageBytes, video: videoBytes },
      componentFiles: {},
    }, { mtime: NOW })
    const reopened = openCourseProjectArchive(archived)
    expect(reopened.project).toEqual(project)
    expect(reopened.project.schemaVersion).toBe(9)
  })

  it('stores a teacher-facing static preview with a Spatial component layer', () => {
    let project = createCourseProject({ id: 'spatial-component-fallback', now: NOW })
    project = addCourseSurface(project, 'spatial-2d', { id: 'spatial-main', now: NOW })
    project = updateCourseProject(project, (draft) => {
      draft.componentPackages['component.internal.quiz'] = {
        packageId: 'component.internal.quiz',
        version: '4.0.0',
        name: '课堂小测',
        manifestPath: 'components/component.internal.quiz/manifest.json',
        runtimePath: 'components/component.internal.quiz/runtime.js',
        contentSha256: 'a'.repeat(64),
      }
      draft.assets['quiz-preview'] = {
        id: 'quiz-preview',
        filename: 'quiz-preview.svg',
        mimeType: 'image/svg+xml',
        kind: 'image',
        path: 'assets/quiz-preview.svg',
        byteLength: 16,
        width: 320,
        height: 180,
      }
    }, NOW)
    project = addComponentLayer(project, {
      surfaceId: 'spatial-main',
      packageId: 'component.internal.quiz',
      version: '4.0.0',
      label: '课堂小测',
      props: {},
      staticFallbackAssetId: 'quiz-preview',
      width: 320,
      height: 180,
      now: NOW,
    })
    const spatial = project.surfaces.find((surface) => surface.id === 'spatial-main')
    if (spatial?.type !== 'spatial-2d') throw new Error('expected Spatial surface')
    expect(spatial.world.layerItems[0]).toMatchObject({
      kind: 'component',
      label: '课堂小测',
      staticFallbackAssetId: 'quiz-preview',
    })
    expect(courseProjectDocumentSchema.safeParse(project).success).toBe(true)
  })
})
