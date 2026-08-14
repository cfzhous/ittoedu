import { describe, expect, it } from 'vitest'
import type { AssetMeta, EmbeddedComponentPackageMeta } from '@/shared/projectTypes'
import {
  addCourseSurface,
  addFlowBlock,
  commitCourseHistory,
  createCourseHistory,
  createCourseProject,
  replaceFlowComponentBlock,
  replaceFlowComponentFallback,
  replaceFlowMediaAsset,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'

const HASH = 'a'.repeat(64)

function asset(id: string, kind: AssetMeta['kind']): AssetMeta {
  const extension = kind === 'image' ? 'png' : kind === 'audio' ? 'mp3' : 'mp4'
  const mimeType = kind === 'image' ? 'image/png' : kind === 'audio' ? 'audio/mpeg' : 'video/mp4'
  return {
    id,
    filename: `${id}.${extension}`,
    mimeType,
    kind,
    path: `assets/${id}.${extension}`,
    byteLength: 10,
    ...(kind === 'image' ? { width: 100, height: 80 } : { duration: 4 }),
  }
}

function component(packageId: string, version: string, name: string): EmbeddedComponentPackageMeta {
  return {
    packageId,
    version,
    name,
    manifestPath: `components/${packageId}/manifest.json`,
    runtimePath: `components/${packageId}/runtime.js`,
    contentSha256: HASH,
  }
}

function flowProject() {
  let project = createCourseProject({ id: 'flow-maturity', now: '2026-08-14T00:00:00.000Z' })
  project = addCourseSurface(project, 'flow', { id: 'flow-main', now: '2026-08-14T00:00:01.000Z' })
  project = updateCourseProject(project, (draft) => {
    draft.assets['image-a'] = asset('image-a', 'image')
    draft.assets['fallback-a'] = asset('fallback-a', 'image')
    draft.componentPackages['component.a'] = component('component.a', '1.0.0', '数轴')
    draft.componentPackages['component.b'] = component('component.b', '2.0.0', '函数实验器')
  }, '2026-08-14T00:00:02.000Z')
  project = addFlowBlock(project, 'flow-main', {
    id: 'media-main',
    type: 'media',
    assetId: 'image-a',
    mediaKind: 'image',
    layout: 'wide',
  }, '2026-08-14T00:00:03.000Z')
  project = addFlowBlock(project, 'flow-main', {
    id: 'component-main',
    type: 'component',
    component: { packageId: 'component.a', version: '1.0.0' },
    props: { title: '旧组件' },
    staticFallbackAssetId: 'fallback-a',
  }, '2026-08-14T00:00:04.000Z')
  return project
}

describe('Flow mature replacement operations', () => {
  it('uses teacher-facing block and component names in course navigation', () => {
    let project = flowProject()
    expect(project.locations.find((location) => (
      location.kind === 'flow-block' && location.blockId === 'component-main'
    ))?.label).toBe('数轴')

    project = addFlowBlock(project, 'flow-main', {
      id: 'empty-paragraph',
      type: 'paragraph',
      text: '',
    })
    expect(project.locations.find((location) => (
      location.kind === 'flow-block' && location.blockId === 'empty-paragraph'
    ))?.label).toBe('正文')

    project = replaceFlowComponentBlock(project, 'flow-main', 'component-main', {
      packageId: 'component.b',
      version: '2.0.0',
      props: {},
      staticFallbackAsset: asset('fallback-b', 'image'),
    })
    const replacementLabel = project.locations.find((location) => (
      location.kind === 'flow-block' && location.blockId === 'component-main'
    ))?.label
    expect(replacementLabel).toBe('函数实验器')
    expect(replacementLabel).not.toContain('component.b')
  })

  it('replaces media only with the same real asset kind in one revision/history entry', () => {
    const project = flowProject()
    const next = replaceFlowMediaAsset(
      project,
      'flow-main',
      'media-main',
      asset('image-b', 'image'),
      '2026-08-14T00:00:05.000Z',
    )
    expect(next.revision).toBe(project.revision + 1)
    const flow = next.surfaces.find((surface) => surface.id === 'flow-main')
    expect(flow?.type).toBe('flow')
    if (flow?.type !== 'flow') throw new Error('missing flow')
    expect(flow.blocks.find((block) => block.id === 'media-main')).toMatchObject({
      assetId: 'image-b',
      mediaKind: 'image',
    })
    expect(commitCourseHistory(createCourseHistory(project), next).past).toHaveLength(1)
    expect(() => replaceFlowMediaAsset(
      project,
      'flow-main',
      'media-main',
      asset('audio-b', 'audio'),
    )).toThrow('所选素材不是图片')
  })

  it('replaces a component, defaults and image fallback atomically', () => {
    const project = flowProject()
    const next = replaceFlowComponentBlock(project, 'flow-main', 'component-main', {
      packageId: 'component.b',
      version: '2.0.0',
      props: { title: '新组件', steps: 8 },
      staticFallbackAsset: asset('fallback-b', 'image'),
    }, '2026-08-14T00:00:05.000Z')
    expect(next.revision).toBe(project.revision + 1)
    const flow = next.surfaces.find((surface) => surface.id === 'flow-main')
    if (flow?.type !== 'flow') throw new Error('missing flow')
    expect(flow.blocks.find((block) => block.id === 'component-main')).toEqual({
      id: 'component-main',
      type: 'component',
      component: { packageId: 'component.b', version: '2.0.0' },
      props: { title: '新组件', steps: 8 },
      staticFallbackAssetId: 'fallback-b',
    })
    expect(commitCourseHistory(createCourseHistory(project), next).past).toHaveLength(1)
  })

  it('keeps live component identity while replacing only its static preview', () => {
    const project = flowProject()
    const next = replaceFlowComponentFallback(
      project,
      'flow-main',
      'component-main',
      asset('fallback-b', 'image'),
      '2026-08-14T00:00:05.000Z',
    )
    const flow = next.surfaces.find((surface) => surface.id === 'flow-main')
    if (flow?.type !== 'flow') throw new Error('missing flow')
    expect(flow.blocks.find((block) => block.id === 'component-main')).toMatchObject({
      component: { packageId: 'component.a', version: '1.0.0' },
      staticFallbackAssetId: 'fallback-b',
    })
    expect(() => replaceFlowComponentFallback(
      project,
      'flow-main',
      'component-main',
      asset('wrong-fallback', 'video'),
    )).toThrow('所选素材不是图片')
  })
})
