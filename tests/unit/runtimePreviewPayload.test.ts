import { describe, expect, it } from 'vitest'
import { createProject } from '@/renderer/project/createProject'
import { createRuntimePreviewPayloadResources } from '@/renderer/preview/runtimePreviewPayload'

describe('runtime preview Blob payload', () => {
  it('始终把大媒体作为 transferable bytes 交给 sandbox', () => {
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
    const resources = createRuntimePreviewPayloadResources({
      project,
      assetFiles: { video: videoBytes },
      components: {},
    })

    expect(resources.payload.assets.video).toEqual({
      mimeType: 'video/mp4',
      dataUrl: 'courseware-preview-asset:0',
    })
    expect(resources.assetTransfers).toHaveLength(1)
    expect(resources.assetTransfers[0]?.bytes.byteLength).toBe(videoBytes.byteLength)
    resources.revoke()
    resources.revoke()
  })

  it('创建中途失败时不返回半成品传输列表', () => {
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
    expect(() => createRuntimePreviewPayloadResources({
      project,
      assetFiles: { first: new Uint8Array(4) },
      components: {},
    })).toThrow('素材“missing.png”缺少二进制数据')
  })

  it('为隔离画布传输素材，由 iframe 在自身来源创建 Blob URL', () => {
    const project = createProject({ includeDefaultController: false })
    project.assets.image = {
      id: 'image',
      filename: 'pixel.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/pixel.png',
      byteLength: 3,
    }
    const resources = createRuntimePreviewPayloadResources({
      project,
      assetFiles: { image: new Uint8Array([0, 1, 2]) },
      components: {},
    })

    expect(resources.payload.assets.image).toEqual({
      mimeType: 'image/png',
      dataUrl: 'courseware-preview-asset:0',
    })
    expect(resources.assetTransfers).toHaveLength(1)
    expect(resources.assetTransfers[0]).toMatchObject({
      placeholder: 'courseware-preview-asset:0',
      mimeType: 'image/png',
    })
    expect([...new Uint8Array(resources.assetTransfers[0]!.bytes)])
      .toEqual([0, 1, 2])
    resources.revoke()
  })
})
