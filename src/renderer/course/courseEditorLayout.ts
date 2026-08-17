// LAYOUT lane（A1-A3-LAYOUT-POLICY）：课型推导与壳层纯策略。
//
// 纯策略：只从 project.locations 实际引用到的 surface 推导课型，
// 不读取/写回任何持久化字段，不 import React/Store/DOM/CSS。
// 推导结果不进入 Course Project、不进 history/revision/dirty、不新增 migration。

import type {
  CourseProjectDocument,
  CourseSurfaceDocument,
} from '../../shared/courseProjectTypes'

/** 课程编辑布局：唯一映射表的纯课推导结果。 */
export type CourseEditorLayout = 'slide' | 'flow' | 'spatial' | 'mixed'

/** 教师壳层主导航入口。 */
export type CourseEditorPrimaryNavigation =
  | 'slide-thumbnails'
  | 'flow-outline'
  | 'spatial-camera-list'
  | 'course-locations'

/** 教师壳层策略：只描述导航与左栏/右栏入口，不决定 JSX、CSS 或折叠状态。 */
export interface CourseEditorShellPolicy {
  readonly layout: CourseEditorLayout
  readonly primaryNavigation: CourseEditorPrimaryNavigation
  readonly leftPanelLabel: '幻灯片' | '讲义大纲' | '镜头列表' | '课程流程'
  readonly showCourseLocationNav: boolean
  readonly simpleSidebarTabs: readonly ['elements', 'layers', 'properties']
}

/**
 * V9 surface type → CourseEditorLayout 唯一映射。
 * 值类型带 undefined 是刻意为之：输入来自运行时数据，
 * 未知 type 必须显式失败而不是静默降级。
 */
const SURFACE_TYPE_TO_LAYOUT: Readonly<Record<string, CourseEditorLayout | undefined>> = {
  slide: 'slide',
  flow: 'flow',
  'spatial-2d': 'spatial',
}

/**
 * 简洁模式只描述三个稳定入口，永不包含开发/组件/互动/AI 入口。
 * 冻结共享常量：调用方不得修改返回值。
 */
const SIMPLE_SIDEBAR_TABS: readonly ['elements', 'layers', 'properties'] = Object.freeze([
  'elements',
  'layers',
  'properties',
])

const SHELL_POLICY_BY_LAYOUT: Readonly<
  Record<CourseEditorLayout, Omit<CourseEditorShellPolicy, 'layout'>>
> = {
  slide: {
    primaryNavigation: 'slide-thumbnails',
    leftPanelLabel: '幻灯片',
    showCourseLocationNav: false,
    simpleSidebarTabs: SIMPLE_SIDEBAR_TABS,
  },
  flow: {
    primaryNavigation: 'flow-outline',
    leftPanelLabel: '讲义大纲',
    showCourseLocationNav: false,
    simpleSidebarTabs: SIMPLE_SIDEBAR_TABS,
  },
  spatial: {
    primaryNavigation: 'spatial-camera-list',
    leftPanelLabel: '镜头列表',
    showCourseLocationNav: false,
    simpleSidebarTabs: SIMPLE_SIDEBAR_TABS,
  },
  mixed: {
    primaryNavigation: 'course-locations',
    leftPanelLabel: '课程流程',
    showCourseLocationNav: true,
    simpleSidebarTabs: SIMPLE_SIDEBAR_TABS,
  },
}

/**
 * 课型推导：按 location 顺序解析被引用 surface 的 type，映射后去重。
 * - 一个唯一类型返回对应纯课；两个及以上唯一类型返回 mixed。
 * - 孤立 surface（未被任何 location 引用）不影响结果。
 * - location 引用缺失 surface / 无可解析 location / 运行时未知 type 时抛出可读 Error。
 * - 不 catch、不写回输入、无持久化副作用。
 */
export function deriveCourseEditorLayout(
  project: Pick<CourseProjectDocument, 'locations' | 'surfaces'>,
): CourseEditorLayout {
  const surfacesById = new Map<string, CourseSurfaceDocument>()
  for (const surface of project.surfaces) {
    surfacesById.set(surface.id, surface)
  }

  if (project.locations.length === 0) {
    throw new Error(
      'Cannot derive course layout: project.locations has no resolvable location (empty array)',
    )
  }

  const uniqueLayouts: CourseEditorLayout[] = []
  for (const location of project.locations) {
    const surface = surfacesById.get(location.surfaceId)
    if (surface === undefined) {
      throw new Error(
        `Cannot derive course layout: location "${location.id}" references missing surface "${location.surfaceId}"`,
      )
    }
    const layout = SURFACE_TYPE_TO_LAYOUT[surface.type]
    if (layout === undefined) {
      throw new Error(
        `Cannot derive course layout: surface "${surface.id}" has unknown type "${surface.type}"`,
      )
    }
    if (!uniqueLayouts.includes(layout)) {
      uniqueLayouts.push(layout)
    }
  }

  if (uniqueLayouts.length === 1) {
    return uniqueLayouts[0]
  }
  return 'mixed'
}

/**
 * 壳层纯策略：复用 deriveCourseEditorLayout 的唯一课型判断，
 * 再按 §3 固定表返回主导航、左栏标签与 Mixed 导航显隐。
 */
export function deriveCourseEditorShellPolicy(
  project: Pick<CourseProjectDocument, 'locations' | 'surfaces'>,
): CourseEditorShellPolicy {
  const layout = deriveCourseEditorLayout(project)
  return {
    layout,
    ...SHELL_POLICY_BY_LAYOUT[layout],
  }
}
