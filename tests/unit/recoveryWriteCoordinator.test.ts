import { strToU8, zipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecoveryWriteCoordinator } from '@/renderer/project/recoveryWriteCoordinator'

function abortFailure(): Error {
  return new DOMException('已取消', 'AbortError')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RecoveryWriteCoordinator', () => {
  it('将连续编辑合并成一次最新恢复写入', async () => {
    vi.useFakeTimers()
    const build = vi.fn(async (value: string) => `archive:${value}`)
    const write = vi.fn(async () => {})
    const coordinator = new RecoveryWriteCoordinator({
      delayMs: 1800,
      build,
      write,
    })

    coordinator.schedule(1, 'first')
    await vi.advanceTimersByTimeAsync(1200)
    coordinator.schedule(2, 'second')
    await vi.advanceTimersByTimeAsync(1799)
    expect(build).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(build).toHaveBeenCalledTimes(1)
    expect(build).toHaveBeenCalledWith('second', expect.any(AbortSignal))
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('archive:second', 'second')
    coordinator.dispose()
  })

  it('取消正在生成的过期结果，并串行写入最新修订', async () => {
    vi.useFakeTimers()
    const started: string[] = []
    const build = vi.fn((value: string, signal: AbortSignal) => {
      started.push(value)
      if (value === 'latest') return Promise.resolve(`archive:${value}`)
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(abortFailure()), { once: true })
      })
    })
    const write = vi.fn(async () => {})
    const coordinator = new RecoveryWriteCoordinator({
      delayMs: 25,
      build,
      write,
    })

    coordinator.schedule(1, 'obsolete')
    await vi.advanceTimersByTimeAsync(25)
    expect(started).toEqual(['obsolete'])
    coordinator.schedule(2, 'latest')
    await vi.advanceTimersByTimeAsync(25)
    await vi.runAllTimersAsync()

    expect(started).toEqual(['obsolete', 'latest'])
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith('archive:latest', 'latest')
    coordinator.dispose()
  })

  it('相同修订不重复打包或写入', async () => {
    vi.useFakeTimers()
    const build = vi.fn(async (value: string) => value)
    const write = vi.fn(async () => {})
    const coordinator = new RecoveryWriteCoordinator({
      delayMs: 10,
      build,
      write,
    })

    coordinator.schedule('revision-a', 'first snapshot')
    coordinator.schedule('revision-a', 'duplicate snapshot')
    await vi.runAllTimersAsync()
    coordinator.schedule('revision-a', 'duplicate after write')
    await vi.runAllTimersAsync()

    expect(build).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    coordinator.dispose()
  })

  it('只报告当前修订的错误，不把取消当成保存失败', async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    const coordinator = new RecoveryWriteCoordinator<string, string>({
      delayMs: 10,
      build: async (value, signal) => {
        if (value === 'obsolete') {
          return new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(abortFailure()), { once: true })
          })
        }
        throw new Error('disk unavailable')
      },
      write: async () => {},
      onError,
    })

    coordinator.schedule(1, 'obsolete')
    await vi.advanceTimersByTimeAsync(10)
    coordinator.schedule(2, 'latest')
    await vi.runAllTimersAsync()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ message: 'disk unavailable' })
    expect(onError.mock.calls[0]?.[1]).toBe('latest')
    coordinator.dispose()
  })

  it('把 V9 工程包写成恢复副本', async () => {
    vi.useFakeTimers()
    const v9Bytes = zipSync({
      'project.json': strToU8(JSON.stringify({
        schemaVersion: 9,
        locations: [],
        surfaces: [],
        globalLayerItems: [],
        startLocationId: 'loc_1',
      })),
    })
    const write = vi.fn(async () => {})
    const onError = vi.fn()
    const coordinator = new RecoveryWriteCoordinator({
      delayMs: 10,
      build: async () => v9Bytes,
      write,
      onError,
    })

    coordinator.schedule(1, {
      project: {
        schemaVersion: 9,
        locations: [],
        surfaces: [],
        globalLayerItems: [],
        startLocationId: 'loc_1',
      },
    })
    await vi.runAllTimersAsync()

    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith(v9Bytes, expect.objectContaining({
      project: expect.objectContaining({ schemaVersion: 9 }),
    }))
    expect(onError).not.toHaveBeenCalled()
    coordinator.dispose()
  })
})
