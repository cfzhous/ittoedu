import type {
  ComponentManifest,
  ComponentPackageData,
  ExportPayload,
} from '../../src/shared/componentTypes'
import type { ProjectDocument } from '../../src/shared/projectTypes'
import type { PublishedLessonPayload } from '../../src/shared/publishedLessonTypes'
import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildPptx } from '../../src/renderer/export/buildPptx'
import { buildExportPayload } from '../../src/renderer/export/buildExportPayload'
import { buildStandaloneHtml } from '../../src/renderer/export/buildStandaloneHtml'
import { decodePublishedCode } from '../../src/player/publishedLesson'
import {
  pptxColor,
  pptxFontFace,
  pptxNodePosition,
  pptxRotation,
  pptxTransparency,
} from '../../src/renderer/export/pptxShared'
import {
  createShapeNode,
  createTextNode,
} from '../../src/renderer/project/createProject'
import { createProjectV8Fields } from '../helpers/projectV8'

const componentManifest: ComponentManifest = {
  schemaVersion: 4,
  runtimeApiVersion: 4,
  id: 'com.example.counter',
  name: '示例计数器',
  version: '1.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 320, height: 180 },
  minSize: { width: 160, height: 90 },
  preserveAspectRatio: true,
  assets: {
    icon: 'assets/icon.svg',
  },
  defaultProps: {
    initialValue: 0,
  },
  supportedScopes: ['scene'],
  renderMode: 'phaser',
}

const project: ProjectDocument = {
  schemaVersion: 8,
  id: 'project-1',
  title: '离线课件 </title><script>bad()</script>',
  createdAt: '2026-07-20T00:00:00.000Z',
  updatedAt: '2026-07-20T00:00:00.000Z',
  canvas: {
    width: 1280,
    height: 720,
  },
  scenes: [
    {
      id: 'scene-1',
      name: '第一页',
      backgroundColor: '#ffffff',
      backgroundAssetId: null,
      interactions: [{
        id: 'reveal-image',
        name: '激活后入场',
        enabled: true,
        trigger: { type: 'node.activated', nodeId: 'image-1' },
        conditions: [],
        actions: [{
          id: 'reveal-image-step',
          start: 'after-previous',
          delayMs: 180,
          action: {
            type: 'node.enter',
            nodeId: 'image-1',
            effect: 'slide',
            direction: 'right',
            durationMs: 640,
            easing: 'ease-out',
          },
        }],
      }],
      nodes: [
        {
          id: 'image-1',
          name: '图片',
          type: 'image',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          visible: true,
          playbackInitialVisibility: 'hidden',
          locked: false,
          assetId: 'asset-1',
          preserveAspectRatio: true,
          fit: 'contain',
          crop: { left: 0, top: 0, right: 0, bottom: 0 },
          cropX: 0.5,
          cropY: 0.5,
          flipX: false,
          flipY: false,
          cornerRadius: 0,
          feather: { amount: 0, mode: 'rectangle' },
          safeAreas: [],
        },
        {
          id: 'component-1',
          name: '计数器',
          type: 'external-component',
          x: 100,
          y: 100,
          width: 320,
          height: 180,
          rotation: 0,
          opacity: 1,
          visible: true,
          playbackInitialVisibility: 'inherit',
          locked: false,
          component: {
            packageId: componentManifest.id,
            version: componentManifest.version,
          },
          props: {},
        },
      ],
    },
  ],
  assets: {
    'asset-1': {
      id: 'asset-1',
      filename: 'image.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/asset-1.png',
      byteLength: 4,
    },
  },
  componentPackages: {
    'com.example.counter@1.0.0': {
      packageId: componentManifest.id,
      version: componentManifest.version,
      name: componentManifest.name,
      manifestPath: 'components/com.example.counter@1.0.0/manifest.json',
      runtimePath: 'components/com.example.counter@1.0.0/runtime.js',
    },
  },
  globalLayer: [],
  ...createProjectV8Fields(),
}

const runtimeSource =
  "window.CoursewareComponent.define({id:'com.example.counter',runtimeApiVersion:4,create(){return{destroy(){}}}})"

const componentPackage: ComponentPackageData = {
  manifest: componentManifest,
  runtimeSource,
  files: {
    'assets/icon.svg': new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    ),
  },
}

function decodePayloadFromHtml(html: string): PublishedLessonPayload {
  const match = html.match(/window\.__H5_LESSON_PAYLOAD__=("[A-Za-z0-9+/=]+");/)
  expect(match?.[1]).toBeDefined()
  const encoded = JSON.parse(match?.[1] ?? '""') as string
  const binary = atob(encoded)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes)) as PublishedLessonPayload
}

describe('buildExportPayload', () => {
  it('内联工程图片、组件 runtime 和组件素材', () => {
    const payload = buildExportPayload({
      project,
      assetFiles: {
        'asset-1': new Uint8Array([137, 80, 78, 71]),
      },
      components: {
        'com.example.counter@1.0.0': componentPackage,
      },
    })

    expect(payload.assets['asset-1']).toEqual({
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,iVBORw==',
    })
    expect(payload.project.scenes[0]!.nodes[0]!.playbackInitialVisibility)
      .toBe('hidden')
    expect(payload.project.scenes[0]!.interactions[0]!.actions[0]).toEqual({
      id: 'reveal-image-step',
      start: 'after-previous',
      delayMs: 180,
      action: expect.objectContaining({
        type: 'node.enter',
        nodeId: 'image-1',
        effect: 'slide',
      }),
    })
    expect(
      payload.components['com.example.counter@1.0.0']?.runtimeSource,
    ).toBe(runtimeSource)
    expect(
      payload.components['com.example.counter@1.0.0']?.assets.icon?.dataUrl,
    ).toMatch(/^data:image\/svg\+xml;base64,/)
  })

  it('素材字节缺失时拒绝生成不完整 Payload', () => {
    expect(() =>
      buildExportPayload(project, {}, {
        'com.example.counter@1.0.0': componentPackage,
      }),
    ).toThrow('缺少二进制数据')
  })
})

describe('buildStandaloneHtml', () => {
  it('生成单文件 HTML，Payload 可解码且脚本终止符安全', () => {
    const payload = buildExportPayload(
      project,
      {
        'asset-1': new Uint8Array([137, 80, 78, 71]),
      },
      {
        'com.example.counter@1.0.0': componentPackage,
      },
    )
    const html = buildStandaloneHtml(
      payload,
      "window.__PLAYER_STARTED__=true;const marker='</script>';const info='https://example.invalid';",
    )

    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<div id="lesson-root"')
    expect(html).not.toContain('<script src=')
    expect(html).not.toContain('<link rel="stylesheet"')
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).not.toContain('<title>离线课件 </title>')
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;bad()&lt;/script&gt;')
    expect(html).toContain("<\\/script>")
    expect(html).toContain('connect-src data: blob:')
    expect(html).not.toMatch(/connect-src[^;]*(?:https?:|\*|'self')/i)

    const decoded = decodePayloadFromHtml(html)
    expect(decoded.format).toBe('h5lesson-published')
    expect(decoded.formatVersion).toBe(1)
    expect(decoded.title).toBe(project.title)
    expect(decoded.scenes[0]!.nodes[0]!.playbackInitialVisibility)
      .toBe('hidden')
    expect(decoded.scenes[0]!.interactions)
      .toEqual(project.scenes[0]!.interactions)
    expect(decoded.assets['asset-1']?.url).toMatch(/^data:image\/png;base64,/)
    expect(
      decodePublishedCode(
        decoded.components['com.example.counter@1.0.0']!.code,
      ),
    ).toBe(runtimeSource)
  })

  it('拒绝空 Player Runtime', () => {
    const payload: ExportPayload = {
      project: { ...project, assets: {}, componentPackages: {} },
      assets: {},
      components: {},
    }
    expect(() => buildStandaloneHtml(payload, '   ')).toThrow(
      'Player Runtime 为空',
    )
  })
})

describe('PowerPoint 对象映射', () => {
  it('换算画布坐标、颜色、透明度和旋转角度', () => {
    const position = pptxNodePosition(project.scenes[0]!.nodes[0]!, {
      x: 13.333 / 1280,
      y: 7.5 / 720,
    })
    expect(position.x).toBe(0)
    expect(position.y).toBe(0)
    expect(position.w).toBeCloseTo(100 * 13.333 / 1280, 12)
    expect(position.h).toBeCloseTo(100 * 7.5 / 720, 12)
    expect(pptxColor('#3af')).toBe('33AAFF')
    expect(pptxColor('invalid', 'ABCDEF')).toBe('ABCDEF')
    expect(pptxFontFace('"Microsoft YaHei", "PingFang SC", sans-serif'))
      .toBe('Microsoft YaHei')
    expect(pptxFontFace('"<>')).toBe('Microsoft YaHei')
    expect(pptxTransparency(0.35)).toBe(65)
    expect(pptxRotation(450)).toBe(90)
    expect(pptxRotation(-90)).toBe(270)
  })

  it('生成原生文字和图形，不退化为整页图片', async () => {
    const playbackHiddenShape = createShapeNode('rounded-rectangle', {
      id: 'shape-pptx',
      name: '信息卡片',
      x: 180,
      y: 120,
      playbackInitialVisibility: 'hidden',
    })
    const editableProject: ProjectDocument = {
      ...project,
      title: '可编辑 PPTX',
      assets: {},
      componentPackages: {},
      scenes: [{
        ...project.scenes[0]!,
        nodes: [
          playbackHiddenShape,
          createTextNode({
            id: 'text-pptx',
            name: '可编辑标题',
            text: 'PowerPoint 中可修改',
            style: {
              fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
            },
          }),
        ],
      }],
    }
    const bytes = await buildPptx({
      project: editableProject,
      assets: {},
      components: {},
    }, {})
    const archive = unzipSync(bytes)
    const slideXml = new TextDecoder().decode(
      archive['ppt/slides/slide1.xml'],
    )
    const parsed = new DOMParser().parseFromString(slideXml, 'application/xml')

    expect(parsed.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(slideXml).toContain('PowerPoint 中可修改')
    expect(slideXml.match(/<p:sp>/g)).toHaveLength(2)
    expect(slideXml).not.toContain('<p:pic>')
    expect(slideXml).not.toContain('<p:timing>')
    expect(slideXml).toContain('typeface="Microsoft YaHei"')
  })
})
