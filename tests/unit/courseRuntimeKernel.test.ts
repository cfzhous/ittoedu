import { describe, expect, it, vi } from 'vitest'
vi.mock('phaser', () => ({}))
import type { ExportPayload } from '@/shared/componentTypes'
import { CourseRuntimeKernel } from '@/player/CourseRuntimeKernel'
import { createProjectV8Fields } from '../helpers/projectV8'

function payload(): ExportPayload {
  return {
    project: {
      schemaVersion: 8,
      id: 'project-runtime-test',
      title: '运行时内核测试',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      canvas: { width: 1280, height: 720 },
      scenes: [
        {
          id: 'scene-one',
          name: '第一页',
          backgroundColor: '#ffffff',
          nodes: [],
          interactions: [],
        },
        {
          id: 'scene-two',
          name: '第二页',
          backgroundColor: '#ffffff',
          nodes: [],
          interactions: [],
        },
      ],
      assets: {},
      componentPackages: {},
      globalLayer: [],
      ...createProjectV8Fields(),
    },
    assets: {},
    components: {},
  }
}

const actions = Object.freeze({
  goToScene: () => false,
  nextScene: () => false,
  previousScene: () => false,
  replayScene: () => false,
  restartCourse: () => false,
})

describe('CourseRuntimeKernel', () => {
  it('统一执行允许、阻止和重定向导航，并发布阻止事件', () => {
    const kernel = new CourseRuntimeKernel(payload(), actions)
    const blocked = vi.fn()
    kernel.events.on('navigation:blocked', blocked)

    expect(kernel.resolveNavigation('scene-one')).toBe('scene-one')
    const removeRedirect = kernel.registerNavigationGuard(({ toSceneId }) =>
      toSceneId === 'scene-one' ? 'scene-two' : true,
    )
    expect(kernel.resolveNavigation('scene-one')).toBe('scene-two')
    removeRedirect()

    const removeBlock = kernel.registerNavigationGuard(() => false)
    expect(kernel.resolveNavigation('scene-two')).toBeNull()
    expect(blocked).toHaveBeenCalledWith(expect.objectContaining({
      toSceneId: 'scene-two',
    }))
    removeBlock()

    expect(kernel.resolveNavigation('missing')).toBeNull()
    expect(blocked).toHaveBeenLastCalledWith(expect.objectContaining({
      reason: '目标场景不存在',
    }))
    kernel.destroy()
  })

  it('课程状态跨普通操作保留，重开课件时清空并发布状态事件', () => {
    const kernel = new CourseRuntimeKernel(payload(), actions)
    const changes = vi.fn()
    kernel.events.on('state:change', changes)
    kernel.courseState.set('score', { value: 8 })
    expect(kernel.courseState.get('score')).toEqual({ value: 8 })
    expect(changes).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'course',
      type: 'set',
      key: 'score',
    }))

    kernel.resetForRestart()
    expect(kernel.courseState.get('score')).toBeUndefined()
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({
      scope: 'course',
      type: 'clear',
    }))
    kernel.destroy()
  })
})
