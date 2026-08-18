import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseComponentPackageFiles } from '@/renderer/components/importComponentPackage'
import {
  createImageNode,
  createProject,
} from '@/renderer/project/createProject'
import {
  createCourseProjectArchive,
  detectCourseProjectArchiveFormat,
  importProjectV8ArchiveAsCourseProject,
  inspectCourseProjectArchiveIdentity,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import {
  shouldMarkCourseProjectDirty,
  shouldOfferCourseProjectRecovery,
} from '@/renderer/project/courseProjectLifecycle'
import { createProjectArchive, openProjectArchive } from '@/renderer/project/projectArchive'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type { ComponentManifest } from '@/shared/componentTypes'
import { UserFacingError } from '@/shared/errors'

const NOW = '2026-08-17T12:00:00.000Z'

function makeComponentFiles(): Record<string, Uint8Array> {
  const manifest: ComponentManifest = {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    renderMode: 'phaser',
    supportedScopes: ['scene', 'global'],
    id: 'com.example.archive-chart',
    name: '归档图表',
    version: '1.2.3',
    entry: 'runtime.js',
    thumbnail: 'thumbnail.png',
    defaultSize: { width: 480, height: 280 },
    minSize: { width: 160, height: 100 },
    preserveAspectRatio: true,
    assets: {},
    defaultProps: { value: 1 },
  }
  return {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'runtime.js': strToU8(
      "window.CoursewareComponent.define({id:'com.example.archive-chart',runtimeApiVersion:4,create:function(){return {destroy:function(){}}}})",
    ),
    'thumbnail.png': new Uint8Array([137, 80, 78, 71]),
  }
}

function makeV8ArchiveBytes() {
  const project = createProject({
    id: 'legacy-archive',
    title: '旧版归档',
    now: NOW,
    includeDefaultController: false,
    controls: 'none',
  })
  const imageBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
  project.assets.diagram = {
    id: 'diagram',
    filename: 'diagram.png',
    mimeType: 'image/png',
    kind: 'image',
    path: 'assets/diagram.bin',
    byteLength: imageBytes.byteLength,
    width: 2,
    height: 2,
  }
  project.scenes[0]!.nodes.push(createImageNode({
    id: 'image_node',
    assetId: 'diagram',
    width: 200,
    height: 200,
  }))
  const packageFiles = makeComponentFiles()
  const component = parseComponentPackageFiles(packageFiles)
  project.componentPackages[component.key] = component.metadata
  return {
    bytes: createProjectArchive({
      project,
      assetFiles: { diagram: imageBytes },
      componentFiles: { [component.key]: packageFiles },
    }, { mtime: NOW }),
    imageBytes,
    component,
    packageFiles,
  }
}

function makeV9ArchiveData() {
  const imported = importProjectV8ArchiveAsCourseProject(makeV8ArchiveBytes().bytes)
  return imported
}

describe('Course Project V9 archive', () => {
  it('round-trips schema, asset bytes and embedded component files', () => {
    const data = makeV9ArchiveData()
    const bytes = createCourseProjectArchive(data, { mtime: NOW })
    const reopened = openCourseProjectArchive(bytes)

    expect(courseProjectDocumentSchema.parse(reopened.project)).toEqual(data.project)
    expect(reopened.project.schemaVersion).toBe(9)
    expect([...reopened.assetFiles.diagram!]).toEqual([...data.assetFiles.diagram!])
    const componentKey = Object.keys(data.componentFiles)[0]!
    expect(Object.keys(reopened.componentFiles[componentKey]!).sort()).toEqual(
      Object.keys(data.componentFiles[componentKey]!).sort(),
    )
    expect([...reopened.componentFiles[componentKey]!['runtime.js']!]).toEqual(
      [...data.componentFiles[componentKey]!['runtime.js']!],
    )
    expect(createCourseProjectArchive(reopened, { mtime: NOW })).toEqual(bytes)
    expect(inspectCourseProjectArchiveIdentity(bytes)).toMatchObject({
      schemaVersion: 9,
      projectId: 'legacy-archive',
      title: '旧版归档',
    })
  })

  it('detects V8, V9, corrupted and unsupported archives; V9 zip must not use V8 open', () => {
    const v8 = makeV8ArchiveBytes()
    const v9Bytes = createCourseProjectArchive(makeV9ArchiveData(), { mtime: NOW })

    expect(detectCourseProjectArchiveFormat(v8.bytes)).toMatchObject({
      kind: 'v8',
      identity: { schemaVersion: 8, projectId: 'legacy-archive' },
    })
    expect(detectCourseProjectArchiveFormat(v9Bytes)).toMatchObject({
      kind: 'v9',
      identity: { schemaVersion: 9, projectId: 'legacy-archive' },
    })
    expect(detectCourseProjectArchiveFormat(new Uint8Array([1, 2, 3, 4]))).toMatchObject({
      kind: 'corrupted',
    })
    expect(detectCourseProjectArchiveFormat(new Uint8Array())).toMatchObject({
      kind: 'corrupted',
      reason: expect.stringMatching(/空/),
    })

    const unsupported = zipSync({
      'project.json': strToU8(JSON.stringify({
        schemaVersion: 10,
        id: 'future',
        title: '不支持',
      })),
    })
    expect(detectCourseProjectArchiveFormat(unsupported)).toMatchObject({
      kind: 'unsupported',
      identity: { schemaVersion: 10, projectId: 'future' },
    })
    expect(() => openCourseProjectArchive(unsupported)).toThrow(/版本不支持|格式版本为 10/)

    expect(() => openCourseProjectArchive(v8.bytes)).toThrow(/显式迁移/)
    expect(() => openCourseProjectArchive(v8.bytes)).toThrow(UserFacingError)

    expect(() => openProjectArchive(v9Bytes)).toThrow(/V9/)
    expect(() => openCourseProjectArchive(v9Bytes)).not.toThrow()

    const missingAsset = unzipSync(v9Bytes)
    delete missingAsset['assets/diagram.bin']
    expect(() => openCourseProjectArchive(zipSync(missingAsset))).toThrow(/缺少素材/)

    expect(shouldMarkCourseProjectDirty('document')).toBe(true)
    expect(shouldMarkCourseProjectDirty('selection')).toBe(false)
    expect(shouldOfferCourseProjectRecovery({
      recovery: {
        schemaVersion: 8,
        projectId: 'legacy-archive',
        revision: 0,
        updatedAt: null,
        title: null,
      },
      official: null,
    })).toBe('ignore-legacy-default')
    expect(shouldOfferCourseProjectRecovery({
      recovery: inspectCourseProjectArchiveIdentity(v9Bytes),
      official: null,
    })).toBe('offer')
  })
})
