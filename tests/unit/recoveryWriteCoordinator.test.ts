import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlankSlideCourse } from '@/renderer/course/courseLocationCommands'
import { updateCourseProject } from '@/renderer/course/courseStudioModel'
import { courseProjectRecoveryRevision } from '@/renderer/project/courseProjectLifecycle'
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

  it('已开始写入时取消会抑制过期成功回调', async () => {
    vi.useFakeTimers()
    let releaseWrite!: () => void
    let reportWriteStarted!: () => void
    const writeStarted = new Promise<void>((resolve) => {
      reportWriteStarted = resolve
    })
    const write = vi.fn(async () => {
      reportWriteStarted()
      await new Promise<void>((resolve) => {
        releaseWrite = resolve
      })
    })
    const onSuccess = vi.fn()
    const coordinator = new RecoveryWriteCoordinator({
      delayMs: 10,
      build: async (value: string) => `archive:${value}`,
      write,
      onSuccess,
    })

    coordinator.schedule(1, 'obsolete')
    await vi.advanceTimersByTimeAsync(10)
    await writeStarted
    coordinator.cancel()
    releaseWrite()
    await Promise.resolve()
    await Promise.resolve()

    expect(write).toHaveBeenCalledOnce()
    expect(onSuccess).not.toHaveBeenCalled()
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

  it('uses project id and revision so selection-only snapshots do not rewrite recovery', async () => {
    vi.useFakeTimers()
    const build = vi.fn(async (value: string) => value)
    const write = vi.fn(async () => {})
    const coordinator = new RecoveryWriteCoordinator({
      delayMs: 10,
      build,
      write,
    })
    const created = createBlankSlideCourse({
      id: 'recovery-rev',
      title: '恢复修订',
      now: '2026-08-17T03:00:00.000Z',
    })
    const revision = courseProjectRecoveryRevision(created.project)
    coordinator.schedule(revision, 'blank')
    coordinator.schedule(revision, 'selection-only')
    await vi.runAllTimersAsync()
    expect(build).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)

    const edited = updateCourseProject(created.project, (draft) => {
      draft.title = '已编辑'
    }, '2026-08-17T03:01:00.000Z')
    coordinator.schedule(courseProjectRecoveryRevision(edited), 'after-command')
    await vi.runAllTimersAsync()
    expect(build).toHaveBeenCalledTimes(2)
    expect(write).toHaveBeenCalledWith('after-command', 'after-command')
    coordinator.dispose()
  })
})
