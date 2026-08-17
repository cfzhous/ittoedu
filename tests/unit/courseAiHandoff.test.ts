import { describe, expect, it } from 'vitest'
import {
  buildCourseAiHandoff,
  type CourseAiHandoff,
  type CourseAiHandoffTarget,
} from '@/renderer/authoring/courseAiHandoff'
import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  LayerItem,
} from '@/shared/courseProjectTypes'
import { createCourseProject } from '@/renderer/course/courseStudioModel'

const NOW = '2026-08-14T00:00:00.000Z'

function textLayer(layerItemId: string, label: string, text: string): LayerItem {
  return {
    layerItemId,
    label,
    kind: 'native',
    frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 64 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    content: {
      nativeType: 'text',
      data: {
        text,
        runs: [],
        style: {
          fontFamily: 'sans-serif',
          fontSize: 42,
          color: '#1f2937',
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          emphasis: false,
          highlightColor: null,
          align: 'left',
          verticalAlign: 'top',
          writingMode: 'horizontal',
          lineSpacing: 6,
          letterSpacing: 0,
          padding: 0,
          overflow: 'auto-height',
          backgroundColor: '#ffffff',
          backgroundOpacity: 0,
          cornerRadius: 0,
        },
      },
    },
  }
}

function controllerLayer(layerItemId: string, label: string): LayerItem {
  return {
    layerItemId,
    label,
    kind: 'native',
    frame: { mode: 'absolute', x: 10, y: 600, width: 900, height: 64 },
    order: 1,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    content: {
      nativeType: 'teacher-controller',
      data: {
        title: '教师控制台',
        showSceneProgress: true,
        compact: false,
        collapsible: true,
        defaultCollapsed: false,
        buttons: [
          {
            id: 'btn-prev',
            action: { type: 'scene.previous' },
            label: '上一场景',
            visible: true,
          },
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
  }
}

function componentLayer(
  layerItemId: string,
  label: string,
  props: Record<string, unknown>,
): LayerItem {
  return {
    layerItemId,
    label,
    kind: 'component',
    frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 64 },
    order: 0,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: 'component.quiz', version: '4.0.0' },
    props,
  }
}

/** Slide surface + scene + scene text item + surface layer item + global controller. */
function makeSlideProject(): CourseProjectDocument {
  const project = createCourseProject({ id: 'handoff-course', title: 'handoff', now: NOW })
  const surface = project.surfaces[0]!
  if (surface.type !== 'slide') throw new Error('expected slide')
  surface.id = 'surface-slide'
  surface.title = '演示表面'
  surface.surfaceLayerItems = [{
    item: textLayer('surface-item', '表面图层', '表面图层文字'),
    visibility: { mode: 'all', locationIds: [] },
  }]
  const scene = surface.scenes[0]!
  scene.id = 'scene-1'
  scene.name = '场景 1'
  scene.layerItems = [
    textLayer('text-main', '文字图层', '二次函数'),
    textLayer('shared-id', '场景共享图层', '场景共享'),
  ]
  project.locations = [{
    id: 'loc-slide',
    label: '场景 1',
    kind: 'slide-scene',
    surfaceId: 'surface-slide',
    sceneId: 'scene-1',
  }]
  project.startLocationId = 'loc-slide'
  project.globalLayerItems = [
    { item: controllerLayer('controller-main', '教师控制器'), visibility: { mode: 'all', locationIds: [] } },
    { item: textLayer('shared-id', '全局共享图层', '全局共享'), visibility: { mode: 'all', locationIds: [] } },
  ]
  return project
}

function makeFlowProject(): CourseProjectDocument {
  const project = createCourseProject({ id: 'handoff-flow', title: 'flow', now: NOW })
  const flow: CourseSurfaceDocument = {
    id: 'surface-flow',
    title: '流式讲义',
    type: 'flow',
    surfaceLayerItems: [],
    layout: { readingWidth: 760, wideContentWidth: 1120 },
    blocks: [
      { id: 'block-heading', type: 'heading', level: 1, text: '函数图像' },
      { id: 'block-para', type: 'paragraph', text: '正文段落' },
      { id: 'block-list', type: 'list', ordered: false, items: [{ id: 'li-1', text: '第一项' }] },
      {
        id: 'block-section',
        type: 'section',
        title: '小节',
        collapsedByDefault: false,
        blocks: [{ id: 'block-nested', type: 'paragraph', text: '嵌套正文' }],
      },
    ],
  }
  project.surfaces = [flow]
  project.locations = [{
    id: 'loc-flow',
    label: '讲义开头',
    kind: 'flow-block',
    surfaceId: 'surface-flow',
    blockId: 'block-para',
  }]
  project.startLocationId = 'loc-flow'
  project.globalLayerItems = []
  return project
}

function makeSpatialProject(): CourseProjectDocument {
  const project = createCourseProject({ id: 'handoff-spatial', title: 'spatial', now: NOW })
  project.surfaces = [{
    id: 'surface-spatial',
    title: '空间探索',
    type: 'spatial-2d',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'finite', x: -1_000, y: -800, width: 2_000, height: 1_600 },
      layerItems: [textLayer('world-item', '空间文字', '世界坐标文字')],
    },
    camera: {
      home: { x: 0, y: 0, zoom: 1 },
      frames: [{ id: 'camera-overview', name: '总览', x: 0, y: 0, zoom: 0.5 }],
    },
    semanticZoom: [{
      id: 'zoom-detail',
      layerItemIds: ['world-item'],
      minZoom: 0.8,
      maxZoom: 4,
      visible: true,
    }],
  }]
  project.locations = [{
    id: 'loc-spatial',
    label: '空间总览',
    kind: 'spatial-camera',
    surfaceId: 'surface-spatial',
    cameraFrameId: 'camera-overview',
  }]
  project.startLocationId = 'loc-spatial'
  project.globalLayerItems = []
  return project
}

function expectUnchanged(project: CourseProjectDocument, before: CourseProjectDocument): void {
  expect(project).toEqual(before)
  expect(project.revision).toBe(before.revision)
  expect(Object.isFrozen(project)).toBe(false)
}

function expectReadonlyHandoff(handoff: CourseAiHandoff): void {
  expect(Object.isFrozen(handoff)).toBe(true)
  expect(Object.isFrozen(handoff.location)).toBe(true)
  expect(Object.isFrozen(handoff.target)).toBe(true)
  expect(Object.isFrozen(handoff.fields)).toBe(true)
  expect(handoff.fields.length === 0 || Object.isFrozen(handoff.fields[0]!)).toBe(true)
}

describe('courseAiHandoff（V9 稳定上下文纯接口，未挂载）', () => {
  it('Slide scene target 得到 source 正确、按地址排序的稳定字段', () => {
    const project = makeSlideProject()
    const before = structuredClone(project)
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-slide',
      source: 'scene',
      surfaceId: 'surface-slide',
      sceneId: 'scene-1',
      layerItemId: 'text-main',
    }

    const handoff = buildCourseAiHandoff({ project, target })

    expect(handoff).not.toBeNull()
    expectUnchanged(project, before)
    const result = handoff!
    expect(result.projectId).toBe('handoff-course')
    expect(result.projectRevision).toBe(project.revision)
    expect(result.location).toEqual({ id: 'loc-slide', label: '场景 1', kind: 'slide-scene' })
    expect(result.target).toEqual({ source: 'scene', stableId: 'text-main', label: '文字图层' })
    expect(result.fields.length).toBeGreaterThan(0)

    const textField = result.fields.find((field) =>
      field.authoringAddress.endsWith('?field=content.data.text'),
    )
    expect(textField).toBeDefined()
    expect(textField!.label).toBe('文字')
    expect(textField!.valueKind).toBe('string')
    expect(textField!.currentValue).toBe('二次函数')
    expect(textField!.authoringAddress).toBe(
      'courseware://authoring/handoff-course/scene/surface-slide/scene-1/native/text-main?field=content.data.text',
    )

    const addresses = result.fields.map((field) => field.authoringAddress)
    expect(addresses).toEqual([...addresses].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ))
    expect(addresses.every((address) =>
      address.startsWith('courseware://authoring/handoff-course/scene/surface-slide/scene-1/native/text-main?field='),
    )).toBe(true)
    expect(JSON.stringify(result)).not.toContain('hitId')
    expectReadonlyHandoff(result)
  })

  it('Flow block target 得到 source 正确、与 location 对应的稳定地址', () => {
    const project = makeFlowProject()
    const before = structuredClone(project)
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-flow',
      source: 'flow-block',
      surfaceId: 'surface-flow',
      blockId: 'block-para',
    }

    const handoff = buildCourseAiHandoff({ project, target })

    expect(handoff).not.toBeNull()
    expectUnchanged(project, before)
    const result = handoff!
    expect(result.location).toEqual({
      id: 'loc-flow',
      label: '讲义开头',
      kind: 'flow-block',
    })
    expect(result.target).toEqual({ source: 'flow-block', stableId: 'block-para', label: '正文段落' })
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0]).toMatchObject({
      label: 'paragraph',
      authoringAddress:
        'courseware://authoring/handoff-flow/surface/surface-flow/-/native/block-para?field=text',
      valueKind: 'string',
    })
    expect(result.fields[0]!.currentValue).toBe('正文段落')
    expectReadonlyHandoff(result)
  })

  it('嵌套 block 没有对应 location 时严格返回 null，不猜测选择', () => {
    const project = makeFlowProject()
    // section 内的嵌套块没有自己的 location（loc-flow 只对应 block-para）。
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-flow',
      source: 'flow-block',
      surfaceId: 'surface-flow',
      blockId: 'block-nested',
    }
    const handoff = buildCourseAiHandoff({ project, target })
    expect(handoff).toBeNull()
  })

  it('Spatial world target 得到 source 正确的稳定地址', () => {
    const project = makeSpatialProject()
    const before = structuredClone(project)
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-spatial',
      source: 'world',
      surfaceId: 'surface-spatial',
      layerItemId: 'world-item',
    }

    const handoff = buildCourseAiHandoff({ project, target })

    expect(handoff).not.toBeNull()
    expectUnchanged(project, before)
    const result = handoff!
    expect(result.location).toEqual({
      id: 'loc-spatial',
      label: '空间总览',
      kind: 'spatial-camera',
    })
    expect(result.target).toEqual({ source: 'world', stableId: 'world-item', label: '空间文字' })
    const textField = result.fields.find((field) =>
      field.authoringAddress.endsWith('?field=content.data.text'),
    )
    expect(textField).toBeDefined()
    expect(textField!.currentValue).toBe('世界坐标文字')
    expect(textField!.authoringAddress).toBe(
      'courseware://authoring/handoff-spatial/surface/surface-spatial/-/native/world-item?field=content.data.text',
    )
    expectReadonlyHandoff(result)
  })

  it('Surface layer target 得到 source 正确的稳定地址', () => {
    const project = makeSlideProject()
    const before = structuredClone(project)
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-slide',
      source: 'surface',
      surfaceId: 'surface-slide',
      layerItemId: 'surface-item',
    }

    const handoff = buildCourseAiHandoff({ project, target })

    expect(handoff).not.toBeNull()
    expectUnchanged(project, before)
    const result = handoff!
    expect(result.target).toEqual({ source: 'surface', stableId: 'surface-item', label: '表面图层' })
    const textField = result.fields.find((field) =>
      field.authoringAddress.endsWith('?field=content.data.text'),
    )
    expect(textField?.currentValue).toBe('表面图层文字')
    expect(textField!.authoringAddress).toBe(
      'courseware://authoring/handoff-course/surface/surface-slide/-/native/surface-item?field=content.data.text',
    )
    expectReadonlyHandoff(result)
  })

  it('Global controller target 得到 source 正确的稳定地址', () => {
    const project = makeSlideProject()
    const before = structuredClone(project)
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-slide',
      source: 'global',
      layerItemId: 'controller-main',
    }

    const handoff = buildCourseAiHandoff({ project, target })

    expect(handoff).not.toBeNull()
    expectUnchanged(project, before)
    const result = handoff!
    expect(result.location).toEqual({ id: 'loc-slide', label: '场景 1', kind: 'slide-scene' })
    expect(result.target).toEqual({ source: 'global', stableId: 'controller-main', label: '教师控制器' })
    const titleField = result.fields.find((field) =>
      field.authoringAddress.endsWith('?field=content.data.title'),
    )
    expect(titleField).toBeDefined()
    expect(titleField!.currentValue).toBe('教师控制台')
    expect(titleField!.authoringAddress).toBe(
      'courseware://authoring/handoff-course/global/-/-/native/controller-main?field=content.data.title',
    )
    const buttonField = result.fields.find((field) =>
      field.authoringAddress.endsWith('?field=content.data.buttons.0.label'),
    )
    expect(buttonField?.currentValue).toBe('上一场景')
    expectReadonlyHandoff(result)
  })

  it('同 ID 不同 source 不串线（global 与 scene 各自独立）', () => {
    const project = makeSlideProject()
    const before = structuredClone(project)

    const globalHandoff = buildCourseAiHandoff({
      project,
      target: { locationId: 'loc-slide', source: 'global', layerItemId: 'shared-id' },
    })
    const sceneHandoff = buildCourseAiHandoff({
      project,
      target: {
        locationId: 'loc-slide',
        source: 'scene',
        surfaceId: 'surface-slide',
        sceneId: 'scene-1',
        layerItemId: 'shared-id',
      },
    })

    expect(globalHandoff).not.toBeNull()
    expect(sceneHandoff).not.toBeNull()
    expectUnchanged(project, before)

    const globalText = globalHandoff!.fields.find((field) =>
      field.authoringAddress.endsWith('?field=content.data.text'),
    )
    const sceneText = sceneHandoff!.fields.find((field) =>
      field.authoringAddress.endsWith('?field=content.data.text'),
    )
    expect(globalText?.currentValue).toBe('全局共享')
    expect(sceneText?.currentValue).toBe('场景共享')
    expect(globalHandoff!.fields.every((field) =>
      field.authoringAddress.startsWith('courseware://authoring/handoff-course/global/'),
    )).toBe(true)
    expect(sceneHandoff!.fields.every((field) =>
      field.authoringAddress.startsWith('courseware://authoring/handoff-course/scene/surface-slide/scene-1/'),
    )).toBe(true)
  })

  it('world 目标不会被 surface source 命中（spatial surface 内不串线）', () => {
    const project = makeSpatialProject()
    const worldTarget: CourseAiHandoffTarget = {
      locationId: 'loc-spatial',
      source: 'world',
      surfaceId: 'surface-spatial',
      layerItemId: 'world-item',
    }
    const surfaceTarget: CourseAiHandoffTarget = {
      locationId: 'loc-spatial',
      source: 'surface',
      surfaceId: 'surface-spatial',
      layerItemId: 'world-item',
    }

    expect(buildCourseAiHandoff({ project, target: worldTarget })).not.toBeNull()
    expect(buildCourseAiHandoff({ project, target: surfaceTarget })).toBeNull()
  })

  it('调用两次结果深度相等，且结果不包含临时 hitId', () => {
    const project = makeSlideProject()
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-slide',
      source: 'scene',
      surfaceId: 'surface-slide',
      sceneId: 'scene-1',
      layerItemId: 'text-main',
    }
    const first = buildCourseAiHandoff({ project, target })
    const second = buildCourseAiHandoff({ project, target })
    expect(first).toEqual(second)
    expect(JSON.stringify(first)).not.toContain('hitId')
    expect(JSON.stringify(first)).not.toContain('jsonPointer')
  })

  it('保存重开等价 project 得到相同地址；revision 改变只改变 handoff revision', () => {
    const project = makeSlideProject()
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-slide',
      source: 'scene',
      surfaceId: 'surface-slide',
      sceneId: 'scene-1',
      layerItemId: 'text-main',
    }
    const original = buildCourseAiHandoff({ project, target })!

    const reopened = structuredClone(project)
    reopened.updatedAt = '2099-01-01T00:00:00.000Z'
    const reopenedHandoff = buildCourseAiHandoff({ project: reopened, target })!
    expect(reopenedHandoff.fields).toEqual(original.fields)
    expect(reopenedHandoff.location).toEqual(original.location)
    expect(reopenedHandoff.target).toEqual(original.target)

    const revised = structuredClone(project)
    revised.revision = project.revision + 5
    const revisedHandoff = buildCourseAiHandoff({ project: revised, target })!
    expect(revisedHandoff.fields).toEqual(original.fields)
    expect(revisedHandoff.location).toEqual(original.location)
    expect(revisedHandoff.target).toEqual(original.target)
    expect(revisedHandoff.projectId).toBe(original.projectId)
    expect(revisedHandoff.projectRevision).toBe(revised.revision)
    expect(original.projectRevision).toBe(project.revision)
  })

  it('缺失或不匹配的 location/target 安全返回 null，不猜测选择', () => {
    const slide = makeSlideProject()
    const flow = makeFlowProject()
    const spatial = makeSpatialProject()
    const cases: Array<{ project: CourseProjectDocument; target: CourseAiHandoffTarget }> = [
      // location 不存在
      { project: slide, target: { locationId: 'loc-missing', source: 'global', layerItemId: 'controller-main' } },
      // 全局 layerItemId 不存在
      { project: slide, target: { locationId: 'loc-slide', source: 'global', layerItemId: 'no-such-item' } },
      // scene 不存在
      {
        project: slide,
        target: {
          locationId: 'loc-slide', source: 'scene', surfaceId: 'surface-slide',
          sceneId: 'scene-9', layerItemId: 'text-main',
        },
      },
      // surface 不存在
      {
        project: slide,
        target: {
          locationId: 'loc-slide', source: 'scene', surfaceId: 'surface-missing',
          sceneId: 'scene-1', layerItemId: 'text-main',
        },
      },
      // scene 内 layerItemId 不存在
      {
        project: slide,
        target: {
          locationId: 'loc-slide', source: 'scene', surfaceId: 'surface-slide',
          sceneId: 'scene-1', layerItemId: 'no-such-item',
        },
      },
      // slide surface 不是 spatial，world 无意义
      {
        project: slide,
        target: { locationId: 'loc-slide', source: 'world', surfaceId: 'surface-slide', layerItemId: 'text-main' },
      },
      // 该 ID 在 scene 而不是 surfaceLayerItems，surface source 不得命中
      {
        project: slide,
        target: { locationId: 'loc-slide', source: 'surface', surfaceId: 'surface-slide', layerItemId: 'text-main' },
      },
      // slide surface 不是 flow，flow-block 无意义
      {
        project: slide,
        target: { locationId: 'loc-slide', source: 'flow-block', surfaceId: 'surface-slide', blockId: 'block-para' },
      },
      // flow-block 不存在
      {
        project: flow,
        target: { locationId: 'loc-flow', source: 'flow-block', surfaceId: 'surface-flow', blockId: 'block-missing' },
      },
      // location blockId 与 target blockId 不一致
      {
        project: flow,
        target: { locationId: 'loc-flow', source: 'flow-block', surfaceId: 'surface-flow', blockId: 'block-heading' },
      },
      // flow surface 没有 scene
      {
        project: flow,
        target: {
          locationId: 'loc-flow', source: 'scene', surfaceId: 'surface-flow',
          sceneId: 'scene-1', layerItemId: 'block-para',
        },
      },
      // spatial world layerItemId 不存在
      {
        project: spatial,
        target: { locationId: 'loc-spatial', source: 'world', surfaceId: 'surface-spatial', layerItemId: 'world-missing' },
      },
      // spatial surface 不是 slide
      {
        project: spatial,
        target: {
          locationId: 'loc-spatial', source: 'scene', surfaceId: 'surface-spatial',
          sceneId: 'scene-1', layerItemId: 'world-item',
        },
      },
    ]

    for (const [index, item] of cases.entries()) {
      const before = structuredClone(item.project)
      expect(buildCourseAiHandoff(item), `case ${index}`).toBeNull()
      expectUnchanged(item.project, before)
    }
  })

  it('prototype 相关 jsonPointer segment 被只读拒绝，不污染 currentValue', () => {
    const project = makeSlideProject()
    project.globalLayerItems = []
    const slide = project.surfaces[0]!
    if (slide.type !== 'slide') throw new Error('expected slide')
    slide.surfaceLayerItems = [{
      item: componentLayer('comp-props', '组件图层', {
        prompt: '请选择',
        // 危险键通过计算属性构造 own data property，模拟异常/恶意 props。
        ['__proto__']: 'proto-value',
        ['constructor']: 'ctor-value',
        ['prototype']: 'proto-2',
      }),
      visibility: { mode: 'all', locationIds: [] },
    }]
    const target: CourseAiHandoffTarget = {
      locationId: 'loc-slide',
      source: 'surface',
      surfaceId: 'surface-slide',
      layerItemId: 'comp-props',
    }

    const handoff = buildCourseAiHandoff({ project, target })

    expect(handoff).not.toBeNull()
    const promptField = handoff!.fields.find((field) =>
      field.authoringAddress.endsWith('?field=props%2Fprompt'),
    )
    expect(promptField?.currentValue).toBe('请选择')
    const dangerous = handoff!.fields.filter((field) =>
      ['props%2F__proto__', 'props%2Fconstructor', 'props%2Fprototype'].some((suffix) =>
        field.authoringAddress.endsWith(`?field=${suffix}`),
      ),
    )
    expect(dangerous).toHaveLength(3)
    for (const field of dangerous) {
      expect(field.currentValue).toBeUndefined()
      // 地址只出现在稳定 field 查询段，不进入任何路径段。
      expect(field.authoringAddress).toContain('?field=props%2F')
      expect(field.authoringAddress).not.toContain('__proto__/')
    }
    // 工程本体未被冻结、未被改写。
    expect(Object.isFrozen(project)).toBe(false)
    expect(Object.isFrozen(project.surfaces[0])).toBe(false)
    expect(JSON.stringify(handoff)).not.toContain('proto-value')
  })
})
