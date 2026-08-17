import { describe, expect, it } from 'vitest'
import {
  addCourseSurface,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import {
  createFlowEditorSelection,
  selectFlowEditorBlock,
  selectFlowEditorBlocks,
} from '@/renderer/course/flowEditorSlice'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type { CourseLocation, FlowBlock } from '@/shared/courseProjectTypes'

const NOW = '2026-08-15T08:00:00.000Z'

function flowLocation(block: FlowBlock, surfaceId: string): CourseLocation[] {
  const locations: CourseLocation[] = [{
    id: block.id,
    label: block.type,
    kind: 'flow-block',
    surfaceId,
    blockId: block.id,
  }]
  if (block.type === 'section') {
    block.blocks.forEach((child) => {
      locations.push(...flowLocation(child, surfaceId))
    })
  }
  return locations
}

function createFlowProject() {
  let project = createCourseProject({ id: 'flow-slice', title: 'Flow 选择', now: NOW })
  project = addCourseSurface(project, 'flow', { id: 'flow', now: NOW })
  const blocks: FlowBlock[] = [
    { id: 'top-a', type: 'paragraph', text: '顶部段落 A' },
    {
      id: 'sec-1',
      type: 'section',
      title: '第一节',
      collapsedByDefault: false,
      blocks: [{ id: 'nested-a', type: 'paragraph', text: '嵌套段落 A' }],
    },
  ]
  project = updateCourseProject(project, (draft) => {
    const surface = draft.surfaces.find((candidate) => candidate.id === 'flow')
    if (!surface || surface.type !== 'flow') throw new Error('expected flow surface')
    surface.blocks = blocks
    const slideLocations = draft.locations.filter((location) => location.kind === 'slide-scene')
    draft.locations = [
      ...slideLocations,
      ...blocks.flatMap((block) => flowLocation(block, 'flow')),
    ]
    draft.startLocationId = 'top-a'
  }, NOW)
  return project
}

describe('Flow editor slice', () => {
  it('creates an editor-only selection from explicit fields', () => {
    const selection = createFlowEditorSelection('top-a', 'flow', 'top-a')
    expect(selection).toEqual({
      locationId: 'top-a',
      surfaceId: 'flow',
      selectedBlockId: 'top-a',
      selectedBlockIds: ['top-a'],
    })
    expect(Object.isFrozen(selection)).toBe(true)
    expect(() => createFlowEditorSelection('', 'flow', 'top-a')).toThrow('课程位置不能为空')
    expect(() => createFlowEditorSelection('top-a', '', 'top-a')).toThrow('Flow 表面不能为空')
    expect(() => createFlowEditorSelection('top-a', 'flow', '')).toThrow('所选 Flow 块不能为空')
  })

  it('selects a valid flow block from the project', () => {
    const project = createFlowProject()
    const selection = selectFlowEditorBlock(project, 'nested-a', 'nested-a')
    expect(selection).toEqual({
      locationId: 'nested-a',
      surfaceId: 'flow',
      selectedBlockId: 'nested-a',
      selectedBlockIds: ['nested-a'],
    })
    expect(Object.isFrozen(selection)).toBe(true)
  })

  it('rejects stale, non-flow, mismatched and duplicate ids with teacher-safe errors', () => {
    const project = createFlowProject()

    expect(() => selectFlowEditorBlock(project, 'ghost', 'ghost'))
      .toThrow('找不到课程位置')
    const slideLocation = project.locations.find((location) => location.kind === 'slide-scene')!
    expect(() => selectFlowEditorBlock(project, slideLocation.id, 'top-a'))
      .toThrow('当前课程位置不是 Flow 内容块')
    expect(selectFlowEditorBlock(project, 'top-a', 'nested-a')).toMatchObject({
      locationId: 'top-a',
      surfaceId: 'flow',
      selectedBlockId: 'nested-a',
      selectedBlockIds: ['nested-a'],
    })
    expect(() => selectFlowEditorBlock(project, 'top-a', 'ghost'))
      .toThrow('找不到 Flow 块')

    const duplicated = structuredClone(project) as typeof project
    const flowSurface = duplicated.surfaces.find((surface) => surface.id === 'flow')
    if (!flowSurface || flowSurface.type !== 'flow') throw new Error('expected flow surface')
    flowSurface.blocks.push({ id: 'top-a', type: 'paragraph', text: '重复块' })
    expect(() => selectFlowEditorBlock(duplicated, 'top-a', 'top-a'))
      .toThrow('Flow 块 ID 重复：top-a')

    const duplicatedLocation = structuredClone(project) as typeof project
    duplicatedLocation.locations.push({
      id: 'top-a',
      label: '重复位置',
      kind: 'flow-block',
      surfaceId: 'flow',
      blockId: 'top-a',
    })
    expect(() => selectFlowEditorBlock(duplicatedLocation, 'top-a', 'top-a'))
      .toThrow('课程位置 ID 重复：top-a')
  })

  it('supports the project-aware create overload and keeps the project untouched', () => {
    const project = createFlowProject()
    const before = courseProjectDocumentSchema.parse(JSON.parse(JSON.stringify(project)))
    const selection = createFlowEditorSelection(project, 'top-a', 'top-a')
    expect(selection).toEqual({
      locationId: 'top-a',
      surfaceId: 'flow',
      selectedBlockId: 'top-a',
      selectedBlockIds: ['top-a'],
    })
    expect(project).toEqual(before)
  })

  it('selects multiple blocks without promoting them to course locations', () => {
    const project = createFlowProject()
    const selection = selectFlowEditorBlocks(project, 'top-a', ['top-a', 'nested-a'])
    expect(selection.selectedBlockIds).toEqual(['top-a', 'nested-a'])
    expect(selection.selectedBlockId).toBe('nested-a')
    expect(selection.locationId).toBe('top-a')
    expect(project.locations.filter((location) => location.id === 'top-a')).toHaveLength(1)
  })
})
