import { describe, expect, it, vi } from 'vitest'
import { createProject } from '@/renderer/project/createProject'
import { createRuntimePreviewPayloadResources } from '@/renderer/preview/runtimePreviewPayload'

describe('runtime preview Blob payload', () => {
  it('为大媒体使用 Blob URL，并在预览结束时全部回收', () => {
    const project = createProject({ includeDefaultController: false })
    const videoBytes = new Uint8Array(1024 * 1024)
    project.assets.video = {
      id: 'video',
      filename: 'lesson.mp4',
      mimeType: 'video/mp4',
      kind: 'video',
      path: 'assets/video.mp4',
      byteLength: videoBytes.byteLength,
      duration: 12,
    }
    const createdBlobs: Blob[] = []
    const revokeObjectURL = vi.fn()

    const resources = createRuntimePreviewPayloadResources({
      project,
      assetFiles: { video: videoBytes },
      components: {},
    }, {
      createObjectURL(blob) {
        createdBlobs.push(blob)
        return `blob:preview-${createdBlobs.length}`
      },
      revokeObjectURL,
    })

    expect(resources.payload.assets.video).toEqual({
      mimeType: 'video/mp4',
      dataUrl: 'blob:preview-1',
    })
    expect(resources.payload.assets.video?.dataUrl).not.toContain('base64')
    expect(createdBlobs[0]?.size).toBe(videoBytes.byteLength)
    resources.revoke()
    resources.revoke()
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-1')
  })

  it('创建中途失败时立即回收已创建的 URL', () => {
    const project = createProject({ includeDefaultController: false })
    project.assets.first = {
      id: 'first',
      filename: 'first.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/first.png',
      byteLength: 4,
    }
    project.assets.missing = {
      id: 'missing',
      filename: 'missing.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/missing.png',
      byteLength: 4,
    }
    const revokeObjectURL = vi.fn()

    expect(() => createRuntimePreviewPayloadResources({
      project,
      assetFiles: { first: new Uint8Array(4) },
      components: {},
    }, {
      createObjectURL: () => 'blob:preview-partial',
      revokeObjectURL,
    })).toThrow('素材“missing.png”缺少二进制数据')
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:preview-partial')
  })
})
