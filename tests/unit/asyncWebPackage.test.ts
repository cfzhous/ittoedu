import { strFromU8, unzipSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProject } from '@/renderer/project/createProject'
import {
  buildWebPackageFilesFromProject,
  buildWebPackageFromProjectAsync,
} from '@/renderer/export/buildWebPackage'
import type { ExportPayload } from '@/shared/componentTypes'

afterEach(() => vi.restoreAllMocks())

function makeSources(byteLength: number) {
  const project = createProject({ includeDefaultController: false })
  const video = new Uint8Array(byteLength)
  video[0] = 17
  video[video.length - 1] = 29
  project.assets.video = {
    id: 'video',
    filename: '课堂视频.mp4',
    mimeType: 'video/mp4',
    kind: 'video',
    path: 'assets/video.mp4',
    byteLength,
    duration: 20,
  }
  return {
    project,
    assetFiles: { video },
    components: {},
  }
}

describe('asynchronous web package', () => {
  it('直接打包原始素材，不做 Base64 往返', () => {
    const sources = makeSources(1024)
    const atobSpy = vi.spyOn(globalThis, 'atob')
    const files = buildWebPackageFilesFromProject(
      sources,
      'window.__PLAYER__=true;',
    )
    const payload = JSON.parse(strFromU8(files['course.json']!)) as ExportPayload
    const assetPath = payload.assets.video?.dataUrl.replace(/^\.\//, '')

    expect(atobSpy).not.toHaveBeenCalled()
    expect(payload.assets.video?.dataUrl).toMatch(/^\.\/assets\//)
    expect(files[assetPath!]).toBe(sources.assetFiles.video)
  })

  it('大素材 ZIP 压缩在后台运行', async () => {
    const sources = makeSources(8 * 1024 * 1024)
    const events: string[] = []
    const archive = buildWebPackageFromProjectAsync(
      sources,
      'window.__PLAYER__=true;',
    ).then((bytes) => {
      events.push('archive')
      return bytes
    })
    const timer = new Promise<void>((resolve) => {
      setTimeout(() => {
        events.push('timer')
        resolve()
      }, 0)
    })
    const [bytes] = await Promise.all([archive, timer])
    expect(events[0]).toBe('timer')

    const files = unzipSync(bytes)
    const payload = JSON.parse(strFromU8(files['course.json']!)) as ExportPayload
    const assetPath = payload.assets.video!.dataUrl.replace(/^\.\//, '')
    expect(files[assetPath]?.byteLength).toBe(8 * 1024 * 1024)
  }, 30_000)
})
