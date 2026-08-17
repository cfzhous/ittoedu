import { describe, expect, it } from 'vitest'
import { componentContentSha256 } from '@/shared/componentContentIntegrity'
import type { ComponentPackageData } from '@/shared/componentTypes'
import type { CourseProjectDocument, LayerItem } from '@/shared/courseProjectTypes'
import { UserFacingError } from '@/shared/errors'
import type { EmbeddedComponentPackageMeta } from '@/shared/projectTypes'
import {
  addComponentLayer,
  addCourseSurface,
  addFlowBlock,
  commitCourseHistory,
  createCourseHistory,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { createBlankSlideCourse } from '@/renderer/course/courseLocationCommands'
import { componentPackageKey } from '@/renderer/project/archivePath'
import { replaceCourseComponentPackage } from '@/renderer/project/courseComponentPackage'

const NOW = '2026-08-17T06:20:00.000Z'
const PACKAGE_ID = 'component.quiz'

function quizPackage(
  version: string,
  extras: {
    defaultProps?: Record<string, unknown>
    supportedScopes?: Array<'scene' | 'global'>
    id?: string
    marker?: number
    contentSha256?: string
  } = {},
): ComponentPackageData {
  const manifest: ComponentPackageData['manifest'] = {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: extras.id ?? PACKAGE_ID,
    name: 'Quiz',
    version,
    entry: 'runtime.js',
    defaultSize: { width: 400, height: 240 },
    minSize: { width: 200, height: 120 },
    preserveAspectRatio: false,
    assets: {},
    defaultProps: extras.defaultProps ?? { prompt: '默认题干', hint: version },
    supportedScopes: extras.supportedScopes ?? ['scene', 'global'],
    renderMode: 'dom',
    editor: { properties: [{ key: 'prompt', label: '题干', type: 'text' }] },
  }
  const files = {
    'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
    'runtime.js': new Uint8Array([extras.marker ?? 1, 2, 3]),
  }
  const contentSha256 = extras.contentSha256 ?? componentContentSha256(files)
  return {
    manifest,
    runtimeSource: `runtime-${version}`,
    files,
    contentSha256,
    provenance: {
      sha256: contentSha256,
      importedAt: NOW,
      sourceLabel: `测试 ${version}`,
    },
  }
}

function packageMeta(data: ComponentPackageData): EmbeddedComponentPackageMeta {
  const base = `components/${data.manifest.id}@${data.manifest.version}`
  return {
    packageId: data.manifest.id,
    version: data.manifest.version,
    name: data.manifest.name,
    manifestPath: `${base}/manifest.json`,
    runtimePath: `${base}/${data.manifest.entry}`,
    contentSha256: data.contentSha256 ?? componentContentSha256(data.files),
    ...(data.provenance ?? {}),
  }
}

function componentItem(id: string, version: string, props: Record<string, unknown>): LayerItem {
  return {
    layerItemId: id,
    label: id,
    kind: 'component',
    frame: { mode: 'absolute', x: 80, y: 80, width: 320, height: 180 },
    order: 2,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: PACKAGE_ID, version },
    props: structuredClone(props),
  }
}

function seedProject(data: ComponentPackageData): {
  project: CourseProjectDocument
  componentFiles: Record<string, Record<string, Uint8Array>>
} {
  const created = createBlankSlideCourse({ id: 't09b-replace', title: '替换', now: NOW })
  let project = updateCourseProject(created.project, (draft) => {
    draft.componentPackages[data.manifest.id] = packageMeta(data)
    draft.assets.fallback = {
      id: 'fallback',
      filename: 'fallback.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/fallback.png',
      byteLength: 3,
      width: 8,
      height: 8,
    }
    draft.globalLayerItems.push({
      item: componentItem('global-quiz', data.manifest.version, { prompt: '全局题干' }),
      visibility: { mode: 'all', locationIds: [] },
    })
  }, NOW)
  const slide = project.surfaces.find((surface) => surface.type === 'slide')!
  project = addComponentLayer(project, {
    surfaceId: slide.id,
    sceneId: slide.scenes[0]!.id,
    packageId: data.manifest.id,
    version: data.manifest.version,
    label: '场景测验',
    props: { prompt: '场景题干' },
    id: 'scene-quiz',
    width: 320,
    height: 180,
    now: NOW,
  })
  project = addCourseSurface(project, 'flow', { id: 'flow-replace', title: '讲义', now: NOW })
  project = addFlowBlock(project, 'flow-replace', {
    id: 'flow-quiz',
    type: 'component',
    component: { packageId: data.manifest.id, version: data.manifest.version },
    props: { prompt: '讲义题干' },
    staticFallbackAssetId: 'fallback',
  }, NOW)
  project = addCourseSurface(project, 'spatial-2d', { id: 'spatial-replace', title: '空间', now: NOW })
  project = addComponentLayer(project, {
    surfaceId: 'spatial-replace',
    packageId: data.manifest.id,
    version: data.manifest.version,
    label: '空间测验',
    props: { prompt: '空间题干' },
    id: 'spatial-quiz',
    width: 320,
    height: 180,
    now: NOW,
  })
  return {
    project,
    componentFiles: {
      [componentPackageKey(data.manifest.id, data.manifest.version)]: {
        'runtime.js': Uint8Array.from(data.files['runtime.js']!),
      },
    },
  }
}

function findComponent(
  project: CourseProjectDocument,
  layerItemId: string,
): Extract<LayerItem, { kind: 'component' }> {
  const global = project.globalLayerItems.find((entry) => entry.item.layerItemId === layerItemId)
  if (global?.item.kind === 'component') return global.item
  for (const surface of project.surfaces) {
    if (surface.type === 'slide') {
      const sceneItem = surface.scenes.flatMap((scene) => scene.layerItems)
        .find((item) => item.layerItemId === layerItemId)
      if (sceneItem?.kind === 'component') return sceneItem
    }
    if (surface.type === 'spatial-2d') {
      const worldItem = surface.world.layerItems.find((item) => item.layerItemId === layerItemId)
      if (worldItem?.kind === 'component') return worldItem
    }
  }
  throw new Error(`找不到组件实例：${layerItemId}`)
}

describe('replaceCourseComponentPackage', () => {
  it('replaces the same packageId sidecar and merges instance version/props in one history result', () => {
    const current = quizPackage('1.0.0', { marker: 1 })
    const replacement = quizPackage('2.0.0', {
      marker: 9,
      defaultProps: { prompt: '新默认', hint: '2.0.0', extra: '新增' },
    })
    const seeded = seedProject(current)
    const sourceProject = seeded.project
    const sourceFiles = seeded.componentFiles
    const history = createCourseHistory(sourceProject)

    const result = replaceCourseComponentPackage({
      project: sourceProject,
      componentFiles: sourceFiles,
      packageId: PACKAGE_ID,
      packageData: replacement,
      now: '2026-08-17T06:21:00.000Z',
    })
    const committed = commitCourseHistory(history, result.project)

    expect(result.previousVersion).toBe('1.0.0')
    expect(result.replacementVersion).toBe('2.0.0')
    expect(result.affectedInstances).toHaveLength(4)
    expect(committed.present.revision).toBe(sourceProject.revision + 1)
    expect(committed.past).toHaveLength(1)
    expect(committed.present.componentPackages[PACKAGE_ID]).toMatchObject({
      packageId: PACKAGE_ID,
      version: '2.0.0',
      contentSha256: replacement.contentSha256,
    })
    expect(result.componentFiles[componentPackageKey(PACKAGE_ID, '1.0.0')]).toBeUndefined()
    expect([...result.componentFiles[componentPackageKey(PACKAGE_ID, '2.0.0')]!['runtime.js']!])
      .toEqual([9, 2, 3])

    const scene = findComponent(committed.present, 'scene-quiz')
    expect(scene.component.version).toBe('2.0.0')
    expect(scene.props).toMatchObject({ prompt: '场景题干', hint: '2.0.0', extra: '新增' })
    expect(findComponent(committed.present, 'global-quiz').props).toMatchObject({
      prompt: '全局题干',
      extra: '新增',
    })
    const flow = committed.present.surfaces.find((surface) => surface.type === 'flow')
      ?.blocks.find((block) => block.id === 'flow-quiz')
    expect(flow).toMatchObject({
      type: 'component',
      component: { packageId: PACKAGE_ID, version: '2.0.0' },
      props: { prompt: '讲义题干', extra: '新增' },
    })
    expect(findComponent(committed.present, 'spatial-quiz').component.version).toBe('2.0.0')

    expect(sourceProject.componentPackages[PACKAGE_ID]?.version).toBe('1.0.0')
    expect(findComponent(sourceProject, 'scene-quiz').component.version).toBe('1.0.0')
    expect(sourceFiles[componentPackageKey(PACKAGE_ID, '1.0.0')]).toBeDefined()
    expect(sourceFiles[componentPackageKey(PACKAGE_ID, '2.0.0')]).toBeUndefined()
  })

  it('keeps existing instances when the replacement is rejected', () => {
    const current = quizPackage('1.0.0')
    const seeded = seedProject(current)
    const projectBefore = structuredClone(seeded.project)
    const filesBefore = structuredClone(seeded.componentFiles)

    expect(() => replaceCourseComponentPackage({
      project: seeded.project,
      componentFiles: seeded.componentFiles,
      packageId: PACKAGE_ID,
      packageData: quizPackage('2.0.0', { id: 'component.other' }),
    })).toThrow(UserFacingError)

    expect(() => replaceCourseComponentPackage({
      project: seeded.project,
      componentFiles: seeded.componentFiles,
      packageId: PACKAGE_ID,
      packageData: quizPackage('1.0.0', { marker: 8, contentSha256: 'deadbeef' }),
    })).toThrow(/同版本哈希不一致/)

    expect(() => replaceCourseComponentPackage({
      project: seeded.project,
      componentFiles: seeded.componentFiles,
      packageId: PACKAGE_ID,
      packageData: quizPackage('2.0.0', { supportedScopes: ['scene'] }),
    })).toThrow(/全局层/)

    expect(() => replaceCourseComponentPackage({
      project: createBlankSlideCourse({ id: 'empty-replace', now: NOW }).project,
      componentFiles: {},
      packageId: PACKAGE_ID,
      packageData: current,
    })).toThrow(/不存在可替换的组件包/)

    expect(seeded.project).toEqual(projectBefore)
    expect(Object.keys(seeded.componentFiles)).toEqual(Object.keys(filesBefore))
    expect([
      ...seeded.componentFiles[componentPackageKey(PACKAGE_ID, '1.0.0')]!['runtime.js']!,
    ]).toEqual([1, 2, 3])
    expect(seeded.componentFiles[componentPackageKey(PACKAGE_ID, '2.0.0')]).toBeUndefined()
    expect(findComponent(seeded.project, 'scene-quiz').component.version).toBe('1.0.0')
  })
})
