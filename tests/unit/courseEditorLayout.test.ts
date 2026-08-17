// @vitest-environment node

// LAYOUT lane（A1-A3-LAYOUT-POLICY）最小断言：
// 只覆盖 courseEditorLayout.ts 的纯推导与纯壳层策略，
// 不接触 UI、Store、Schema 或任何持久化字段。

import { describe, expect, it } from 'vitest'
import type {
  CourseLocation,
  CourseProjectDocument,
  CourseSurfaceDocument,
} from '@/shared/courseProjectTypes'
import {
  deriveCourseEditorLayout,
  deriveCourseEditorShellPolicy,
  type CourseEditorShellPolicy,
} from '@/renderer/course/courseEditorLayout'

type LayoutFixture = Pick<CourseProjectDocument, 'locations' | 'surfaces'>

// ---- 最小 fixture builder：只构造推导所需的 locations / surfaces 字段 ----

function slideSurface(id: string): CourseSurfaceDocument {
  return {
    id,
    title: `Slide ${id}`,
    surfaceLayerItems: [],
    type: 'slide',
    canvas: { width: 1280, height: 720 },
    scenes: [],
  }
}

function flowSurface(id: string): CourseSurfaceDocument {
  return {
    id,
    title: `Flow ${id}`,
    surfaceLayerItems: [],
    type: 'flow',
    layout: { readingWidth: 720, wideContentWidth: 960 },
    blocks: [],
  }
}

function spatialSurface(id: string): CourseSurfaceDocument {
  return {
    id,
    title: `Spatial ${id}`,
    surfaceLayerItems: [],
    type: 'spatial-2d',
    world: { bounds: { mode: 'infinite' }, layerItems: [] },
    camera: { home: { x: 0, y: 0, zoom: 1 }, frames: [] },
    semanticZoom: [],
  }
}

function locationFor(
  surfaceId: string,
  kind: 'slide-scene' | 'flow-block' | 'spatial-camera' = 'slide-scene',
  id = `loc-${surfaceId}`,
): CourseLocation {
  switch (kind) {
    case 'slide-scene':
      return { id, label: id, kind, surfaceId, sceneId: `scene-${surfaceId}` }
    case 'flow-block':
      return { id, label: id, kind, surfaceId, blockId: `block-${surfaceId}` }
    case 'spatial-camera':
      return { id, label: id, kind, surfaceId, cameraFrameId: `camera-${surfaceId}` }
  }
}

function fixture(locations: CourseLocation[], surfaces: CourseSurfaceDocument[]): LayoutFixture {
  return { locations, surfaces }
}

/** 仅用于错误路径断言：构造一个运行时 type 不在映射表中的非法 surface。 */
function unknownTypeSurface(id: string): CourseSurfaceDocument {
  return { ...slideSurface(id), type: 'hologram' } as unknown as CourseSurfaceDocument
}

// ---- §3 固定表期望（用于 A2/A3 逐项断言） ----

const EXPECTED_SLIDE_POLICY = {
  layout: 'slide',
  primaryNavigation: 'slide-thumbnails',
  leftPanelLabel: '幻灯片',
  showCourseLocationNav: false,
  simpleSidebarTabs: ['elements', 'layers', 'properties'] as const,
} satisfies CourseEditorShellPolicy

const EXPECTED_FLOW_POLICY = {
  layout: 'flow',
  primaryNavigation: 'flow-outline',
  leftPanelLabel: '讲义大纲',
  showCourseLocationNav: false,
  simpleSidebarTabs: ['elements', 'layers', 'properties'] as const,
} satisfies CourseEditorShellPolicy

const EXPECTED_SPATIAL_POLICY = {
  layout: 'spatial',
  primaryNavigation: 'spatial-camera-list',
  leftPanelLabel: '镜头列表',
  showCourseLocationNav: false,
  simpleSidebarTabs: ['elements', 'layers', 'properties'] as const,
} satisfies CourseEditorShellPolicy

const EXPECTED_MIXED_POLICY = {
  layout: 'mixed',
  primaryNavigation: 'course-locations',
  leftPanelLabel: '课程流程',
  showCourseLocationNav: true,
  simpleSidebarTabs: ['elements', 'layers', 'properties'] as const,
} satisfies CourseEditorShellPolicy

describe('deriveCourseEditorLayout — A1 课型推导', () => {
  it('单 Slide surface → slide', () => {
    expect(
      deriveCourseEditorLayout(
        fixture([locationFor('surface-slide')], [slideSurface('surface-slide')]),
      ),
    ).toBe('slide')
  })

  it('多 Slide surface → slide', () => {
    expect(
      deriveCourseEditorLayout(
        fixture(
          [locationFor('surface-slide-a'), locationFor('surface-slide-b')],
          [slideSurface('surface-slide-a'), slideSurface('surface-slide-b')],
        ),
      ),
    ).toBe('slide')
  })

  it('单 Flow surface → flow', () => {
    expect(
      deriveCourseEditorLayout(
        fixture([locationFor('surface-flow', 'flow-block')], [flowSurface('surface-flow')]),
      ),
    ).toBe('flow')
  })

  it('多 Flow surface → flow', () => {
    expect(
      deriveCourseEditorLayout(
        fixture(
          [locationFor('surface-flow-a', 'flow-block'), locationFor('surface-flow-b', 'flow-block')],
          [flowSurface('surface-flow-a'), flowSurface('surface-flow-b')],
        ),
      ),
    ).toBe('flow')
  })

  it('单 Spatial surface → spatial', () => {
    expect(
      deriveCourseEditorLayout(
        fixture(
          [locationFor('surface-spatial', 'spatial-camera')],
          [spatialSurface('surface-spatial')],
        ),
      ),
    ).toBe('spatial')
  })

  it('多 Spatial surface → spatial', () => {
    expect(
      deriveCourseEditorLayout(
        fixture(
          [
            locationFor('surface-spatial-a', 'spatial-camera'),
            locationFor('surface-spatial-b', 'spatial-camera'),
          ],
          [spatialSurface('surface-spatial-a'), spatialSurface('surface-spatial-b')],
        ),
      ),
    ).toBe('spatial')
  })

  it('Slide+Flow → mixed', () => {
    expect(
      deriveCourseEditorLayout(
        fixture(
          [locationFor('surface-slide'), locationFor('surface-flow', 'flow-block')],
          [slideSurface('surface-slide'), flowSurface('surface-flow')],
        ),
      ),
    ).toBe('mixed')
  })

  it('Slide+Spatial → mixed', () => {
    expect(
      deriveCourseEditorLayout(
        fixture(
          [locationFor('surface-slide'), locationFor('surface-spatial', 'spatial-camera')],
          [slideSurface('surface-slide'), spatialSurface('surface-spatial')],
        ),
      ),
    ).toBe('mixed')
  })

  it('Flow+Spatial → mixed', () => {
    expect(
      deriveCourseEditorLayout(
        fixture(
          [locationFor('surface-flow', 'flow-block'), locationFor('surface-spatial', 'spatial-camera')],
          [flowSurface('surface-flow'), spatialSurface('surface-spatial')],
        ),
      ),
    ).toBe('mixed')
  })

  it('三种全有 → mixed', () => {
    expect(
      deriveCourseEditorLayout(
        fixture(
          [
            locationFor('surface-slide'),
            locationFor('surface-flow', 'flow-block'),
            locationFor('surface-spatial', 'spatial-camera'),
          ],
          [slideSurface('surface-slide'), flowSurface('surface-flow'), spatialSurface('surface-spatial')],
        ),
      ),
    ).toBe('mixed')
  })

  it('重复 location（同 id 或不同 id 引用同一 surface）不改变类型结果', () => {
    const sameId = fixture(
      [locationFor('surface-slide'), locationFor('surface-slide')],
      [slideSurface('surface-slide')],
    )
    expect(deriveCourseEditorLayout(sameId)).toBe('slide')

    const differentId = fixture(
      [locationFor('surface-slide'), locationFor('surface-slide', 'slide-scene', 'loc-slide-2')],
      [slideSurface('surface-slide')],
    )
    expect(deriveCourseEditorLayout(differentId)).toBe('slide')
  })

  it('未被任何 location 引用的异类 surface 不触发 mixed', () => {
    // 只引用 slide；孤立的 flow surface 不得影响结果
    expect(
      deriveCourseEditorLayout(
        fixture(
          [locationFor('surface-slide')],
          [slideSurface('surface-slide'), flowSurface('surface-orphan-flow')],
        ),
      ),
    ).toBe('slide')
  })

  it('location 引用缺失 surface 时抛出可读 Error，即使存在孤立 surface', () => {
    expect(() =>
      deriveCourseEditorLayout(
        fixture([locationFor('surface-missing')], [slideSurface('surface-orphan')]),
      ),
    ).toThrowError(/missing surface/)
  })

  it('没有任何可解析 location 时抛出可读 Error', () => {
    expect(() => deriveCourseEditorLayout(fixture([], [slideSurface('surface-slide')]))).toThrowError(
      /no resolvable location/,
    )
  })

  it('运行时未知 surface type 时抛出可读 Error', () => {
    expect(() =>
      deriveCourseEditorLayout(
        fixture([locationFor('surface-unknown')], [unknownTypeSurface('surface-unknown')]),
      ),
    ).toThrowError(/unknown type/)
  })

  it('调用前后输入深度相等，revision 等字段（若带入）不变', () => {
    const input = {
      revision: 42,
      locations: [locationFor('surface-slide'), locationFor('surface-flow', 'flow-block')],
      surfaces: [slideSurface('surface-slide'), flowSurface('surface-flow')],
    }
    const before = JSON.stringify(input)
    const layout = deriveCourseEditorLayout(input)
    const policy = deriveCourseEditorShellPolicy(input)
    expect(layout).toBe('mixed')
    expect(policy.layout).toBe('mixed')
    expect(JSON.stringify(input)).toBe(before)
    expect(input.revision).toBe(42)
  })
})

describe('deriveCourseEditorShellPolicy — A2/A3 纯壳层策略', () => {
  const POLICY_CASES: ReadonlyArray<{ name: string; input: LayoutFixture; expected: CourseEditorShellPolicy }> = [
    {
      name: 'slide',
      input: fixture([locationFor('surface-slide')], [slideSurface('surface-slide')]),
      expected: EXPECTED_SLIDE_POLICY,
    },
    {
      name: 'flow',
      input: fixture([locationFor('surface-flow', 'flow-block')], [flowSurface('surface-flow')]),
      expected: EXPECTED_FLOW_POLICY,
    },
    {
      name: 'spatial',
      input: fixture(
        [locationFor('surface-spatial', 'spatial-camera')],
        [spatialSurface('surface-spatial')],
      ),
      expected: EXPECTED_SPATIAL_POLICY,
    },
    {
      name: 'mixed',
      input: fixture(
        [locationFor('surface-slide'), locationFor('surface-flow', 'flow-block')],
        [slideSurface('surface-slide'), flowSurface('surface-flow')],
      ),
      expected: EXPECTED_MIXED_POLICY,
    },
  ]

  it.each(POLICY_CASES)('$name 的策略对象逐项等于 §3 固定表', ({ input, expected }) => {
    expect(deriveCourseEditorShellPolicy(input)).toEqual(expected)
  })

  it('Mixed 切换当前 location（顺序/标识变化）不改变策略；只有 surfaces 组成变化才会重算', () => {
    const mixedA = fixture(
      [locationFor('surface-slide'), locationFor('surface-flow', 'flow-block')],
      [slideSurface('surface-slide'), flowSurface('surface-flow')],
    )
    const mixedB = fixture(
      [
        locationFor('surface-flow', 'flow-block', 'loc-B-flow'),
        locationFor('surface-slide', 'slide-scene', 'loc-B-slide'),
      ],
      [slideSurface('surface-slide'), flowSurface('surface-flow')],
    )
    const singleSlide = fixture([locationFor('surface-slide')], [slideSurface('surface-slide')])

    expect(deriveCourseEditorShellPolicy(mixedA)).toEqual(deriveCourseEditorShellPolicy(mixedB))
    expect(deriveCourseEditorShellPolicy(mixedB)).toEqual(EXPECTED_MIXED_POLICY)
    expect(deriveCourseEditorShellPolicy(singleSlide)).toEqual(EXPECTED_SLIDE_POLICY)
  })

  it('返回结果中不存在 projectMode、surfaceMode、ai、runtime 等额外字段', () => {
    const policy = deriveCourseEditorShellPolicy(
      fixture(
        [locationFor('surface-slide'), locationFor('surface-flow', 'flow-block')],
        [slideSurface('surface-slide'), flowSurface('surface-flow')],
      ),
    )
    expect(policy).not.toHaveProperty('projectMode')
    expect(policy).not.toHaveProperty('surfaceMode')
    expect(policy).not.toHaveProperty('ai')
    expect(policy).not.toHaveProperty('runtime')
    expect(Object.keys(policy).sort()).toEqual(
      [
        'layout',
        'leftPanelLabel',
        'primaryNavigation',
        'showCourseLocationNav',
        'simpleSidebarTabs',
      ].sort(),
    )
  })

  it('simpleSidebarTabs 顺序固定且不可被一次调用污染后续调用', () => {
    const mixedInput = fixture(
      [locationFor('surface-slide'), locationFor('surface-flow', 'flow-block')],
      [slideSurface('surface-slide'), flowSurface('surface-flow')],
    )

    const first = deriveCourseEditorShellPolicy(mixedInput)
    expect(first.simpleSidebarTabs).toEqual(['elements', 'layers', 'properties'])

    // 尝试污染共享常量；冻结数组在严格模式下拒绝写入（失败被吞掉也无妨，
    // 关键是后续调用必须仍然返回固定顺序）。
    const mutable = first.simpleSidebarTabs as unknown as string[]
    try {
      mutable[1] = 'polluted'
    } catch {
      // 冻结数组在严格模式下抛 TypeError，属预期。
    }

    expect(first.simpleSidebarTabs).toEqual(['elements', 'layers', 'properties'])
    expect(Object.isFrozen(first.simpleSidebarTabs)).toBe(true)

    const second = deriveCourseEditorShellPolicy(mixedInput)
    expect(second.simpleSidebarTabs).toEqual(['elements', 'layers', 'properties'])
    expect(Object.isFrozen(second.simpleSidebarTabs)).toBe(true)
  })
})
