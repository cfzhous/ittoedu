import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import type {
  ComponentManifest,
  ExportPayload,
} from '../../src/shared/componentTypes'
import type { ProjectDocument } from '../../src/shared/projectTypes'
import { bytesToDataUrl } from '../../src/renderer/export/base64'
import {
  buildWebPackage,
  buildWebPackageFiles,
} from '../../src/renderer/export/buildWebPackage'
import { createShapeNode } from '../../src/renderer/project/createProject'
import { createProjectV5Fields } from '../helpers/projectV5'

const assetId = '../../asset:hero'
const componentKey = '../../component:key'

const componentManifest: ComponentManifest = {
  schemaVersion: 1,
  runtimeApiVersion: 1,
  id: '../com.example/unsafe',
  name: '离线组件',
  version: '1.0.0',
  entry: '../runtime.js',
  thumbnail: '../../thumbnail.png',
  defaultSize: { width: 320, height: 180 },
  minSize: { width: 160, height: 90 },
  preserveAspectRatio: true,
  assets: {
    icon: '../../course.json',
  },
  defaultProps: {
    label: '本地互动',
  },
}

const motionWebNode = createShapeNode('rectangle', {
  id: 'motion-web-node',
  x: 240,
  y: 160,
  playbackInitialVisibility: 'hidden',
})

const project: ProjectDocument = {
  schemaVersion: 7,
  id: 'web-package-project',
  title: '网页包 </title><script>bad()</script>',
  createdAt: '2026-07-21T00:00:00.000Z',
  updatedAt: '2026-07-21T00:00:00.000Z',
  canvas: { width: 1280, height: 720 },
  scenes: [
    {
      id: 'scene-1',
      name: '场景 1',
      backgroundColor: '#ffffff',
      backgroundAssetId: null,
      nodes: [motionWebNode],
      interactions: [{
        id: 'motion-rule',
        name: '场景进入后显示',
        enabled: true,
        trigger: { type: 'scene.enter' },
        conditions: [],
        actions: [{
          id: 'motion-step',
          start: 'after-previous',
          delayMs: 220,
          action: {
            type: 'node.enter',
            nodeId: motionWebNode.id,
            effect: 'fade',
            durationMs: 480,
            easing: 'ease-out',
          },
        }],
      }],
    },
  ],
  assets: {
    [assetId]: {
      id: assetId,
      filename: '..\\..\\index.html',
      mimeType: 'image/png',
      kind: 'image',
      path: '../../index.html',
      byteLength: 512 * 1024,
    },
  },
  componentPackages: {
    [componentKey]: {
      packageId: componentManifest.id,
      version: componentManifest.version,
      name: componentManifest.name,
      manifestPath: '../../manifest.json',
      runtimePath: '../../runtime.js',
    },
  },
  globalLayer: [],
  ...createProjectV5Fields(),
}

const imageBytes = new Uint8Array(512 * 1024).map((_, index) => index % 251)
const runtimeSource =
  "window.CoursewareComponent.define({id:'../com.example/unsafe',runtimeApiVersion:1,create(){return{destroy(){}}}})"

function makePayload(): ExportPayload {
  return {
    project,
    assets: {
      [assetId]: {
        mimeType: 'image/png',
        dataUrl: bytesToDataUrl(imageBytes, 'image/png'),
      },
    },
    components: {
      [componentKey]: {
        manifest: componentManifest,
        runtimeSource,
        assets: {
          icon: {
            mimeType: 'image/svg+xml',
            dataUrl:
              'data:image/svg+xml,%3Csvg%20xmlns=%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E',
          },
        },
      },
    },
  }
}

function decodeJson<T>(bytes: Uint8Array): T {
  return JSON.parse(strFromU8(bytes)) as T
}

describe('buildWebPackage', () => {
  it('生成可离线解压的结构，并把工程和组件素材写成独立文件', () => {
    const payload = makePayload()
    const originalDataUrl = payload.assets[assetId]!.dataUrl
    const zipBytes = buildWebPackage(
      payload,
      "window.__WEB_PLAYER_STARTED__=true;",
    )
    const files = unzipSync(zipBytes)
    const paths = Object.keys(files)

    expect([...zipBytes.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(paths).toEqual(
      expect.arrayContaining([
        'index.html',
        'course.json',
        'course-data.js',
        'player/player.iife.js',
        'player/player.css',
        'assets/000-index.png',
      ]),
    )

    const componentAssetPath = paths.find((entry) =>
      entry.startsWith('components/') && entry.endsWith('/assets/000-course.svg'),
    )
    const componentRuntimePath = paths.find((entry) =>
      entry.startsWith('components/') && entry.endsWith('/runtime.js'),
    )
    const componentManifestPath = paths.find((entry) =>
      entry.startsWith('components/') && entry.endsWith('/manifest.json'),
    )
    expect(componentAssetPath).toBeDefined()
    expect(componentRuntimePath).toBeDefined()
    expect(componentManifestPath).toBeDefined()

    expect([...files['assets/000-index.png']!]).toEqual([...imageBytes])
    expect(strFromU8(files[componentAssetPath!]!)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    )
    expect(strFromU8(files[componentRuntimePath!]!)).toBe(runtimeSource)
    expect(strFromU8(files['player/player.iife.js']!)).toContain(
      '__WEB_PLAYER_STARTED__',
    )
    expect(strFromU8(files['player/player.css']!)).toContain('.lesson-shell')
    expect(payload.assets[assetId]!.dataUrl).toBe(originalDataUrl)
  })

  it('course.json 只保存相对 URL，不再内嵌大 Data URL', () => {
    const payload = makePayload()
    const files = buildWebPackageFiles(payload, 'window.__PLAYER__=true;')
    const courseText = strFromU8(files['course.json']!)
    const fallbackText = strFromU8(files['course-data.js']!)
    const course = decodeJson<ExportPayload>(files['course.json']!)

    expect(courseText).not.toMatch(/data:[^,]*;base64,/i)
    expect(fallbackText).not.toMatch(/data:[^,]*;base64,/i)
    expect(courseText.length).toBeLessThan(payload.assets[assetId]!.dataUrl.length / 10)
    expect(course.assets[assetId]).toEqual({
      mimeType: 'image/png',
      dataUrl: './assets/000-index.png',
    })
    expect(course.project.scenes[0]!.nodes[0]!.playbackInitialVisibility)
      .toBe('hidden')
    expect(course.project.scenes[0]!.interactions)
      .toEqual(project.scenes[0]!.interactions)

    const packagedComponent = course.components[componentKey]!
    expect(packagedComponent.runtimeSource).toBe(runtimeSource)
    expect(packagedComponent.assets.icon?.dataUrl).toMatch(
      /^\.\/components\/[^/]+\/assets\/000-course\.svg$/,
    )
    expect(packagedComponent.manifest.entry).toBe('runtime.js')
    expect(packagedComponent.manifest.thumbnail).toBeUndefined()
    expect(packagedComponent.manifest.assets.icon).toBe('assets/000-course.svg')
  })

  it('生成的所有 ZIP 与素材 URL 路径均不可穿越包根目录', () => {
    const files = buildWebPackageFiles(makePayload(), 'window.__PLAYER__=true;')
    const course = decodeJson<ExportPayload>(files['course.json']!)

    for (const archivePath of Object.keys(files)) {
      expect(archivePath).not.toMatch(/^(?:[A-Za-z]:|\/|\\)/)
      expect(archivePath).not.toContain('\\')
      expect(archivePath.split('/')).not.toContain('..')
      expect(archivePath.split('/')).not.toContain('.')
    }

    const urls = [
      ...Object.values(course.assets).map((asset) => asset.dataUrl),
      ...Object.values(course.components).flatMap((component) =>
        Object.values(component.assets).map((asset) => asset.dataUrl),
      ),
    ]
    for (const url of urls) {
      expect(url).toMatch(/^\.\/[A-Za-z0-9._/-]+$/)
      expect(url.split('/')).not.toContain('..')
    }
  })

  it('index 仅引用包内资源，并声明 course.json 与双击离线回退脚本', () => {
    const files = buildWebPackageFiles(makePayload(), 'window.__PLAYER__=true;')
    const html = strFromU8(files['index.html']!)

    expect(html).toContain('name="courseware-payload" content="./course.json"')
    expect(html).toContain('src="./course-data.js"')
    expect(html).toContain('src="./player/player.iife.js"')
    expect(html).toContain('href="./player/player.css"')
    expect(html).not.toMatch(/https?:\/\//i)
    expect(html).not.toContain('<title>网页包 </title>')
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;bad()&lt;/script&gt;')
  })

  it('拒绝空播放器和非 Data URL 素材', () => {
    expect(() => buildWebPackageFiles(makePayload(), '   ')).toThrow(
      'Player Runtime 为空',
    )

    const payload = makePayload()
    payload.assets[assetId] = {
      mimeType: 'image/png',
      dataUrl: '../../outside.png',
    }
    expect(() => buildWebPackageFiles(payload, 'window.__PLAYER__=true;')).toThrow(
      '不是可打包的 Data URL',
    )
  })
})
