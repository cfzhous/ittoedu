import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonToBase64 } from '../../src/renderer/export/base64'
import type { ExportPayload } from '../../src/shared/componentTypes'
import {
  decodeExportPayload,
  loadExportPayloadFromUrl,
  parseExportPayloadJson,
} from '../../src/player/payload'
import { createProjectV8Fields } from '../helpers/projectV8'

const payload: ExportPayload = {
  project: {
    schemaVersion: 8,
    id: 'unicode-project',
    title: '中文课件 🎓',
    createdAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    canvas: { width: 1280, height: 720 },
    scenes: [
      {
        id: 'scene-1',
        name: '第一页',
        backgroundColor: '#ffffff',
        backgroundAssetId: null,
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

describe('Player Payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('按 UTF-8 解码完整 Base64 JSON', () => {
    expect(decodeExportPayload(jsonToBase64(payload))).toEqual(payload)
  })

  it('为损坏的 Base64 提供可理解的错误', () => {
    expect(() => decodeExportPayload('not-valid-%%%')).toThrow(
      '课件 Payload 无法解码',
    )
  })

  it('解析网页包 course.json，并允许素材使用相对 URL', () => {
    const packagePayload: ExportPayload = {
      ...payload,
      assets: {
        cover: {
          mimeType: 'image/png',
          dataUrl: './assets/000-cover.png',
        },
      },
    }

    expect(parseExportPayloadJson(JSON.stringify(packagePayload))).toEqual(
      packagePayload,
    )
  })

  it('明确拒绝旧 Project V7 Payload，而不是在播放器内迁移', () => {
    const legacy = structuredClone(payload) as unknown as {
      project: { schemaVersion: number }
    }
    legacy.project.schemaVersion = 7

    expect(() => parseExportPayloadJson(JSON.stringify(legacy))).toThrow(
      '版本不受支持',
    )
  })

  it('通过相对 URL 载入 course.json', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(loadExportPayloadFromUrl('./course.json')).resolves.toEqual(
      payload,
    )
    expect(fetchMock).toHaveBeenCalledWith('./course.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
  })

  it('course.json 缺失时返回可理解的网页包错误', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => '',
      }),
    )

    await expect(loadExportPayloadFromUrl('./course.json')).rejects.toThrow(
      '确认网页包已经完整解压',
    )
  })
})
