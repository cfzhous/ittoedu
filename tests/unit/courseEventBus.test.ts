import { describe, expect, it, vi } from 'vitest'
import { CourseEventBus } from '@/player/CourseEventBus'

describe('CourseEventBus', () => {
  it('支持订阅、发布、off 和幂等 disposer，并可统计订阅数', () => {
    const bus = new CourseEventBus()
    const first = vi.fn()
    const second = vi.fn()

    const disposeFirst = bus.on('scene:enter', first)
    bus.on('scene:enter', second)
    bus.on('course:start', vi.fn())
    expect(bus.listenerCount('scene:enter')).toBe(2)
    expect(bus.listenerCount()).toBe(3)

    bus.emit('scene:enter', { sceneId: 'scene-1' })
    expect(first).toHaveBeenCalledWith({ sceneId: 'scene-1' })
    expect(second).toHaveBeenCalledTimes(1)

    disposeFirst()
    disposeFirst()
    bus.emit('scene:enter', { sceneId: 'scene-2' })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)

    bus.off('scene:enter', second)
    expect(bus.listenerCount('scene:enter')).toBe(0)
    expect(bus.listenerCount()).toBe(1)
  })

  it('隔离同步 listener 异常并继续通知其余监听器', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bus = new CourseEventBus()
    const healthy = vi.fn()
    bus.on('runtime:event', () => {
      throw new Error('broken listener')
    })
    bus.on('runtime:event', healthy)

    expect(() => bus.emit('runtime:event', { ok: true })).not.toThrow()
    expect(healthy).toHaveBeenCalledWith({ ok: true })
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('runtime:event'),
      expect.objectContaining({ message: 'broken listener' }),
    )
    consoleError.mockRestore()
  })

  it('隔离异步 listener 拒绝而不产生未处理 rejection', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bus = new CourseEventBus()
    bus.on('capture', async () => {
      throw new Error('async failure')
    })

    bus.emit('capture')
    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('capture'),
        expect.objectContaining({ message: 'async failure' }),
      )
    })
    consoleError.mockRestore()
  })

  it('dispose 清空监听并阻止后续订阅', () => {
    const bus = new CourseEventBus()
    const listener = vi.fn()
    bus.on('scene:leave', listener)
    bus.dispose()
    bus.dispose()

    expect(bus.listenerCount()).toBe(0)
    bus.emit('scene:leave')
    expect(listener).not.toHaveBeenCalled()
    expect(() => bus.on('scene:leave', listener)).toThrow('已销毁')
  })
})
