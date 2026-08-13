import { describe, expect, it } from 'vitest'
import { createProject } from '@/renderer/project/createProject'
import {
  createProjectArchiveAsync,
  openProjectArchiveAsync,
  type ProjectArchiveData,
} from '@/renderer/project/projectArchive'
import { saveProjectAsync } from '@/renderer/project/saveProject'

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
