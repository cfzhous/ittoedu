import { describe, expect, it } from 'vitest'
import {
  createBlankFlowCourse,
  createBlankSlideCourse,
  createBlankSpatialCourse,
} from '@/renderer/course/courseLocationCommands'
import { createProject } from '@/renderer/project/createProject'
import { openCourseProjectArchiveAsync } from '@/renderer/project/courseProjectArchive'
import {
  createProjectArchiveAsync,
  openProjectArchiveAsync,
  type ProjectArchiveData,
} from '@/renderer/project/projectArchive'
import { saveCourseProjectAsync, saveProjectAsync } from '@/renderer/project/saveProject'

function makeLargeArchiveData(byteLength = 12 * 1024 * 1024): ProjectArchiveData {
  const project = createProject({ includeDefaultController: false, controls: 'none' })
  const bytes = new Uint8Array(byteLength)
  project.assets.largeVideo = {
    id: 'largeVideo',
    filename: 'large-video.mp4',
    mimeType: 'video/mp4',
    kind: 'video',
    path: 'assets/large-video.mp4',
    byteLength,
    duration: 60,
  }
  return {
    project,
    assetFiles: { largeVideo: bytes },
    componentFiles: {},
  }
}

async function recordTimerBefore<T>(operation: Promise<T>): Promise<T> {
  const events: string[] = []
  const timer = new Promise<void>((resolve) => {
    setTimeout(() => {
      events.push('timer')
      resolve()
    }, 0)
  })
  const observed = operation.then((value) => {
    events.push('archive')
    return value
  })
  const [result] = await Promise.all([observed, timer])
  expect(events[0]).toBe('timer')
  return result
}

describe('asynchronous project archive', () => {
  it('压缩和解压大素材时保持事件循环可响应', async () => {
    const source = makeLargeArchiveData()
    const bytes = await recordTimerBefore(createProjectArchiveAsync(source, {
      mtime: '2026-07-22T00:00:00.000Z',
    }))
    const restored = await recordTimerBefore(openProjectArchiveAsync(bytes))

    expect(restored.project.id).toBe(source.project.id)
    expect(restored.assetFiles.largeVideo?.byteLength).toBe(12 * 1024 * 1024)
  }, 30_000)

  it('可取消过期的后台压缩', async () => {
    const controller = new AbortController()
    const operation = createProjectArchiveAsync(makeLargeArchiveData(), {
      signal: controller.signal,
    })
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('异步保存更新时间戳但不修改输入工程', async () => {
    const source = makeLargeArchiveData(1024)
    const originalUpdatedAt = source.project.updatedAt
    const saved = await saveProjectAsync(source, '2026-07-22T01:02:03.000Z')

    expect(source.project.updatedAt).toBe(originalUpdatedAt)
    expect(saved.project.updatedAt).toBe('2026-07-22T01:02:03.000Z')
    expect((await openProjectArchiveAsync(saved.bytes)).project.updatedAt).toBe(
      '2026-07-22T01:02:03.000Z',
    )
  })
})

describe('asynchronous Course Project V9 blank archives', () => {
  it('saves and reopens T03 blank Slide/Flow/Spatial courses without writing V8', async () => {
    const cases = [
      createBlankSlideCourse({ id: 'async-slide', title: '异步演示', now: '2026-08-17T02:00:00.000Z' }),
      createBlankFlowCourse({ id: 'async-flow', title: '异步讲义', now: '2026-08-17T02:00:00.000Z' }),
      createBlankSpatialCourse({ id: 'async-spatial', title: '异步画布', now: '2026-08-17T02:00:00.000Z' }),
    ]
    for (const created of cases) {
      const saved = await saveCourseProjectAsync({
        project: created.project,
        assetFiles: {},
        componentFiles: {},
      }, '2026-08-17T02:03:00.000Z')
      expect(created.project.updatedAt).toBe('2026-08-17T02:00:00.000Z')
      expect(saved.project.schemaVersion).toBe(9)
      expect(saved.project.updatedAt).toBe('2026-08-17T02:03:00.000Z')
      const reopened = await openCourseProjectArchiveAsync(saved.bytes)
      expect(reopened.project.schemaVersion).toBe(9)
      expect(reopened.project.id).toBe(created.project.id)
      expect(reopened.project).not.toHaveProperty('projectMode')
    }
  })
})
