import { describe, expect, it } from 'vitest'
import * as courseAiPatchModule from '@/renderer/authoring/courseAiPatch'
import {
  parseSingleCourseAiPatch,
  preflightSingleCourseAiPatch,
  CourseAiPatchParseError,
  type CourseAiPatchPreflightResult,
} from '@/renderer/authoring/courseAiPatch'
import { deriveCourseProjectAuthoringInventorySnapshot } from '@/shared/courseProjectModel'
import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
  LayerItem,
} from '@/shared/courseProjectTypes'
import { createCourseProject } from '@/renderer/course/courseStudioModel'

const NOW = '2026-08-14T00:00:00.000Z'

function textLayer(
  layerItemId: string,
  label: string,
  text: string,
  locked = false,
): LayerItem {
  return {
    layerItemId,
    label,
    kind: 'native',
    frame: { mode: 'absolute', x: 0, y: 0, width: 320, height: 64 },
    order: 0,
    visible: true,
    locked,
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
        buttons: [{
          id: 'btn-prev',
          action: { type: 'scene.previous' },
          label: '上一场景',
          visible: true,
        }],
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

function makeSlideProject(): CourseProjectDocument {
  const project = createCourseProject({ id: 'patch-course', title: 'patch', now: NOW })
  const surface = project.surfaces[0]!
  if (surface.type !== 'slide') throw new Error('expected slide')
  surface.id = 'surface-slide'
  surface.title = '演示表面'
  surface.surfaceLayerItems = [
    { item: textLayer('surface-item', '表面图层', '表面文字'), visibility: { mode: 'all', locationIds: [] } },
    { item: textLayer('locked-surface', '锁定表面图层', '锁定表面', true), visibility: { mode: 'all', locationIds: [] } },
  ]
  const scene = surface.scenes[0]!
  scene.id = 'scene-1'
  scene.name = '场景 1'
  scene.layerItems = [
    textLayer('text-main', '文字图层', '二次函数'),
    textLayer('locked-scene', '锁定场景图层', '锁定文字', true),
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
    { item: textLayer('locked-global', '锁定全局图层', '锁定全局', true), visibility: { mode: 'all', locationIds: [] } },
  ]
  return project
}

function makeFlowProject(): CourseProjectDocument {
  const project = createCourseProject({ id: 'patch-flow', title: 'flow', now: NOW })
  const flow: CourseSurfaceDocument = {
    id: 'surface-flow',
    title: '流式讲义',
    type: 'flow',
    surfaceLayerItems: [],
    layout: { readingWidth: 760, wideContentWidth: 1120 },
    blocks: [
      { id: 'block-heading', type: 'heading', level: 1, text: '函数图像' },
      { id: 'block-para', type: 'paragraph', text: '正文段落' },
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
  const project = createCourseProject({ id: 'patch-spatial', title: 'spatial', now: NOW })
  project.surfaces = [{
    id: 'surface-spatial',
    title: '空间探索',
    type: 'spatial-2d',
    surfaceLayerItems: [],
    world: {
      bounds: { mode: 'finite', x: -1_000, y: -800, width: 2_000, height: 1_600 },
      layerItems: [
        textLayer('world-item', '空间文字', '世界坐标文字'),
        textLayer('locked-world', '锁定世界图层', '锁定世界', true),
      ],
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

function makeComponentProject(): CourseProjectDocument {
  const project = makeSlideProject()
  const surface = project.surfaces[0]!
  if (surface.type !== 'slide') throw new Error('expected slide')
  surface.surfaceLayerItems = [{
    item: componentLayer('comp-props', '组件图层', {
      prompt: '请选择',
      ['__proto__']: 'proto-value',
      ['constructor']: 'ctor-value',
      ['prototype']: 'proto-2',
    }),
    visibility: { mode: 'all', locationIds: [] },
  }]
  return project
}

function findAddress(
  project: CourseProjectDocument,
  predicate: (address: string) => boolean,
): string {
  const snapshot = deriveCourseProjectAuthoringInventorySnapshot(project)
  const address = Object.keys(snapshot.entries).find(predicate)
  if (!address) throw new Error('address not found')
  return address
}

function expectUnchanged(project: CourseProjectDocument, before: CourseProjectDocument): void {
  expect(project).toEqual(before)
  expect(project.revision).toBe(before.revision)
  expect(Object.isFrozen(project)).toBe(false)
}

function expectReject(
  project: CourseProjectDocument,
  value: unknown,
  code: string,
): CourseAiPatchPreflightResult {
  const before = structuredClone(project)
  const result = preflightSingleCourseAiPatch({ project, value })
  expect(result).toEqual({ ok: false, code, message: expect.any(String) })
  expect((result as { message: string }).message.length).toBeGreaterThan(0)
  expect(Object.keys(result).sort()).toEqual(['code', 'message', 'ok'])
  expectUnchanged(project, before)
  return result
}

function expectParseError(value: unknown, code: string): void {
  let caught: unknown
  try {
    parseSingleCourseAiPatch(value)
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(CourseAiPatchParseError)
  expect((caught as CourseAiPatchParseError).code).toBe(code)
  expect((caught as Error).message.length).toBeGreaterThan(0)
}

const validPatch = (project: CourseProjectDocument) => {
  const textAddress = findAddress(
    project,
    (address) => address.includes('/native/text-main') && address.endsWith('?field=content.data.text'),
  )
  return {
    op: 'replace',
    expectedRevision: project.revision,
    authoringAddress: textAddress,
    value: '新文字',
  } as const
}

describe('courseAiPatch（单目标 parser/preflight 纯接口，未挂载）', () => {
  describe('parseSingleCourseAiPatch', () => {
    it('接受精确字段并规范化返回单目标 replace Patch', () => {
      const project = makeSlideProject()
      const parsed = parseSingleCourseAiPatch({
        ...validPatch(project),
        expectedValue: '二次函数',
      })
      expect(parsed).toEqual({
        op: 'replace',
        expectedRevision: project.revision,
        authoringAddress: validPatch(project).authoringAddress,
        value: '新文字',
        expectedValue: '二次函数',
      })
    })

    it('expectedValue 缺省时不写入返回结构', () => {
      const project = makeSlideProject()
      const parsed = parseSingleCourseAiPatch(validPatch(project))
      expect(parsed).toEqual({
        op: 'replace',
        expectedRevision: project.revision,
        authoringAddress: validPatch(project).authoringAddress,
        value: '新文字',
      })
    })

    it('显式 value: undefined 属于“存在 value”并接受', () => {
      const project = makeSlideProject()
      const parsed = parseSingleCourseAiPatch({
        op: 'replace',
        expectedRevision: project.revision,
        authoringAddress: validPatch(project).authoringAddress,
        value: undefined,
      })
      expect(parsed.value).toBeUndefined()
    })

    it('拒绝根数组、operations、patches 为 batch-not-supported', () => {
      const project = makeSlideProject()
      const single = validPatch(project)
      const batchShapes: unknown[] = [
        [single],
        [single, single],
        { operations: [single] },
        { operations: [single, single] },
        { patches: [single] },
        { protocolVersion: 1, operations: [single, single] },
        { ...single, operations: [single] },
      ]
      for (const [index, value] of batchShapes.entries()) {
        expectParseError(value, 'batch-not-supported')
        expect(preflightSingleCourseAiPatch({ project, value }).ok).toBe(false)
        expect(
          (preflightSingleCourseAiPatch({ project, value }) as { code: string }).code,
        ).toBe('batch-not-supported')
        expect(index).toBeGreaterThanOrEqual(0)
      }
    })

    it('拒绝非对象、未知 key、非 replace、非法 revision、无效地址与缺少 value', () => {
      const project = makeSlideProject()
      const single = validPatch(project)
      const invalidShapes: Array<{ value: unknown; code: string }> = [
        { value: 'not-an-object', code: 'parse-invalid' },
        { value: 42, code: 'parse-invalid' },
        { value: null, code: 'parse-invalid' },
        { value: { ...single, staleRoot: true }, code: 'parse-invalid' },
        { value: { ...single, op: 'add' }, code: 'parse-invalid' },
        { value: { ...single, op: undefined }, code: 'parse-invalid' },
        { value: { ...single, expectedRevision: undefined }, code: 'parse-invalid' },
        { value: { ...single, expectedRevision: -1 }, code: 'parse-invalid' },
        { value: { ...single, expectedRevision: 0.5 }, code: 'parse-invalid' },
        { value: { ...single, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, code: 'parse-invalid' },
        { value: { ...single, expectedRevision: '5' }, code: 'parse-invalid' },
        { value: { ...single, authoringAddress: 'not-a-course-address' }, code: 'parse-invalid' },
        { value: { ...single, authoringAddress: '' }, code: 'parse-invalid' },
        { value: { ...single, authoringAddress: 'courseware://authoring/x/global/-/-/native/' }, code: 'parse-invalid' },
        { value: { ...single, authoringAddress: undefined }, code: 'parse-invalid' },
        { value: { op: 'replace', expectedRevision: 0, authoringAddress: single.authoringAddress }, code: 'parse-invalid' },
        { value: { op: ['replace'], expectedRevision: 0, authoringAddress: single.authoringAddress, value: 'x' }, code: 'parse-invalid' },
      ]
      for (const [index, item] of invalidShapes.entries()) {
        expectParseError(item.value, item.code)
        expect((index as number) >= 0).toBe(true)
      }
    })
  })

  describe('preflightSingleCourseAiPatch', () => {
    it('有效单目标 replace 得到确定 impact，project 完全不变', () => {
      const project = makeSlideProject()
      const before = structuredClone(project)
      const patchValue = {
        ...validPatch(project),
        expectedValue: '二次函数',
      }

      const result = preflightSingleCourseAiPatch({ project, value: patchValue })

      expect(result.ok).toBe(true)
      expectUnchanged(project, before)
      if (!result.ok) throw new Error('expected ok')
      expect(result.patch).toEqual({
        op: 'replace',
        expectedRevision: project.revision,
        authoringAddress: validPatch(project).authoringAddress,
        value: '新文字',
        expectedValue: '二次函数',
      })
      expect(result.impact).toEqual({
        project: { id: 'patch-course', revision: 0 },
        target: { label: '文字图层' },
        field: { label: '文字' },
        authoringAddress: validPatch(project).authoringAddress,
        currentValue: '二次函数',
        nextValue: '新文字',
      })
      expect(Object.keys(result.impact).sort()).toEqual([
        'authoringAddress',
        'currentValue',
        'field',
        'nextValue',
        'project',
        'target',
      ])
      expect(Object.isFrozen(result.impact)).toBe(true)
      expect(Object.isFrozen(result.impact.project)).toBe(true)
      expect(JSON.stringify(result.impact)).not.toContain('jsonPointer')
      expect(JSON.stringify(result.impact)).not.toContain('stablePath')
      expect(JSON.stringify(result.impact)).not.toContain('hitId')
    })

    it('expectedValue 与 canonical 当前值一致才通过；不符返回 expected-value-mismatch', () => {
      const project = makeSlideProject()
      const mismatched = preflightSingleCourseAiPatch({
        project,
        value: { ...validPatch(project), expectedValue: '错误期望' },
      })
      expect(mismatched).toMatchObject({ ok: false, code: 'expected-value-mismatch' })
      const matched = preflightSingleCourseAiPatch({
        project,
        value: { ...validPatch(project), expectedValue: '二次函数' },
      })
      expect(matched.ok).toBe(true)
    })

    it('stale revision 返回 stale-revision', () => {
      const project = makeSlideProject()
      expectReject(project, { ...validPatch(project), expectedRevision: project.revision + 1 }, 'stale-revision')
    })

    it('locked 的 global/surface/scene/spatial layer item 返回 target-locked', () => {
      const slide = makeSlideProject()
      const spatial = makeSpatialProject()

      const lockedSceneAddress = findAddress(
        slide,
        (address) => address.includes('/native/locked-scene') && address.endsWith('?field=content.data.text'),
      )
      const lockedSurfaceAddress = findAddress(
        slide,
        (address) => address.includes('/native/locked-surface') && address.endsWith('?field=content.data.text'),
      )
      const lockedGlobalAddress = findAddress(
        slide,
        (address) => address.includes('/native/locked-global') && address.endsWith('?field=content.data.text'),
      )
      const lockedWorldAddress = findAddress(
        spatial,
        (address) => address.includes('/native/locked-world') && address.endsWith('?field=content.data.text'),
      )

      for (const [project, address] of [
        [slide, lockedSceneAddress],
        [slide, lockedSurfaceAddress],
        [slide, lockedGlobalAddress],
        [spatial, lockedWorldAddress],
      ] as Array<[CourseProjectDocument, string]>) {
        expectReject(project, {
          op: 'replace',
          expectedRevision: project.revision,
          authoringAddress: address,
          value: '修改',
        }, 'target-locked')
      }
    })

    it('Flow block 没有 locked 字段，不虚构锁定状态', () => {
      const project = makeFlowProject()
      const blockAddress = findAddress(
        project,
        (address) => address.includes('/native/block-para') && address.endsWith('?field=text'),
      )
      const result = preflightSingleCourseAiPatch({
        project,
        value: {
          op: 'replace',
          expectedRevision: project.revision,
          authoringAddress: blockAddress,
          value: '修改正文',
        },
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.impact).toMatchObject({
          target: { label: '正文段落' },
          field: { label: 'paragraph' },
          currentValue: '正文段落',
          nextValue: '修改正文',
        })
      }
    })

    it('格式有效但不在当前工程的地址返回 target-missing', () => {
      const project = makeSlideProject()
      const textAddress = validPatch(project).authoringAddress
      const externalAddress = textAddress.replace('/native/text-main', '/native/no-such-item')
      expectReject(project, {
        op: 'replace',
        expectedRevision: project.revision,
        authoringAddress: externalAddress,
        value: '修改',
      }, 'target-missing')
    })

    it('prototype 相关指针段被安全拒绝为 target-missing，不崩溃不修改', () => {
      const project = makeComponentProject()
      const before = structuredClone(project)
      const protoAddress = findAddress(
        project,
        (address) => address.endsWith('?field=props%2F__proto__'),
      )
      const result = preflightSingleCourseAiPatch({
        project,
        value: {
          op: 'replace',
          expectedRevision: project.revision,
          authoringAddress: protoAddress,
          value: '污染值',
        },
      })
      expect(result.ok).toBe(false)
      expect(result).toMatchObject({ code: 'target-missing' })
      expectUnchanged(project, before)
    })

    it('preflight 对 parse 失败也返回稳定拒绝结果，不抛异常', () => {
      const project = makeSlideProject()
      for (const value of [null, 'x', [], { op: 'add', expectedRevision: 0, value: 1 }]) {
        const result = preflightSingleCourseAiPatch({ project, value })
        expect(result.ok).toBe(false)
        expect(typeof (result as { code: string }).code).toBe('string')
      }
    })
  })

  describe('batch 明确拒绝边界（D3）', () => {
    it('表驱动：所有 batch-like 输入稳定返回 batch-not-supported，project 完全不变', () => {
      const project = makeSlideProject()
      const single = validPatch(project)
      const pseudoBatchV1 = {
        protocolVersion: 1,
        batchId: 'batch-1',
        expectedRevision: project.revision,
        operations: [single, single],
      }
      const batchShapes: unknown[] = [
        // 根数组
        [single],
        [single, single],
        [],
        // operations / patches 容器（含多个 op）
        { operations: [single] },
        { operations: [single, single] },
        { patches: [single] },
        { patches: [single, single] },
        // 伪 CourseAuthoringPatchBatchV1
        pseudoBatchV1,
        { version: 1, patches: [single, single] },
        // 单目标对象里混入 batch 容器
        { ...single, operations: [single] },
        { ...single, patches: [] },
      ]

      for (const [index, value] of batchShapes.entries()) {
        const before = structuredClone(project)
        const result = preflightSingleCourseAiPatch({ project, value })
        expect(result, `batch case ${index}`).toEqual({
          ok: false,
          code: 'batch-not-supported',
          message: expect.any(String),
        })
        expect((result as { message: string }).message.length).toBeGreaterThan(0)
        expectUnchanged(project, before)
      }
    })

    it('公开 export 只有单目标 parser/preflight 与拒绝类型，无 batch 类型/parser', () => {
      // 运行时导出名称（type export 会被擦除）必须精确等于错误类 + 两个函数。
      const runtimeExports = Object.keys(courseAiPatchModule).sort()
      expect(runtimeExports).toEqual([
        'CourseAiPatchParseError',
        'parseSingleCourseAiPatch',
        'preflightSingleCourseAiPatch',
      ])
      expect(runtimeExports.some((name) => /batch/i.test(name))).toBe(false)
    })
  })
})
