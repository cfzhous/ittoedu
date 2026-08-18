import { describe, expect, it } from 'vitest'
import { strToU8 } from 'fflate'
import { parseComponentPackageFiles } from '@/renderer/components/importComponentPackage'
import {
  createImageNode,
  createProject,
} from '@/renderer/project/createProject'
import {
  createCourseProjectArchive,
  importProjectV8ArchiveAsCourseProject,
  inspectCourseProjectArchiveIdentity,
  migrateProjectV8ArchiveToCourseProjectV9,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import { migrateProjectV8DocumentToCourseProjectV9 } from '@/renderer/project/courseProjectMigration'
import { createProjectArchive } from '@/renderer/project/projectArchive'
import { LegacyComponentPackageMigrationConflictError } from '@/shared/courseProjectModel'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'
import type { ComponentManifest } from '@/shared/componentTypes'

const NOW = '2026-08-17T12:00:00.000Z'

function makeComponent(version = '4.0.0') {
  const manifest: ComponentManifest = {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    renderMode: 'dom',
    supportedScopes: ['scene'],
    id: 'com.example.migrate-counter',
    name: '迁移计数器',
    version,
    entry: 'runtime.js',
    thumbnail: 'thumbnail.png',
    defaultSize: { width: 480, height: 280 },
    minSize: { width: 160, height: 100 },
    preserveAspectRatio: true,
    assets: {},
    defaultProps: { initialValue: 0 },
  }
  const files = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'runtime.js': strToU8(`window.CoursewareComponent.define({
      id:'com.example.migrate-counter', runtimeApiVersion:4,
      create:function(){return{destroy:function(){}}}
    })`),
    'thumbnail.png': new Uint8Array([137, 80, 78, 71]),
  }
  return parseComponentPackageFiles(files)
}

describe('explicit V8 to V9 migration report', () => {
  it('returns a reviewable report and does not rewrite the source V8 document or zip', () => {
    const v8 = createProject({
      id: 'course-stable',
      title: '显式迁移',
      now: NOW,
      includeDefaultController: false,
      controls: 'none',
    })
    const assetBytes = new Uint8Array([10, 20, 30])
    v8.assets.legacy = {
      id: 'legacy',
      filename: 'legacy.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/legacy.bin',
      byteLength: assetBytes.byteLength,
      width: 1,
      height: 1,
    }
    v8.scenes[0]!.nodes.push(createImageNode({
      id: 'kept-image',
      assetId: 'legacy',
      width: 80,
      height: 80,
    }))
    const component = makeComponent()
    v8.componentPackages[component.key] = component.metadata
    const sourceProject = structuredClone(v8)
    const v8Bytes = createProjectArchive({
      project: v8,
      assetFiles: { legacy: assetBytes },
      componentFiles: { [component.key]: component.files },
    }, { mtime: NOW })
    const sourceBytes = v8Bytes.slice()

    const documentResult = migrateProjectV8DocumentToCourseProjectV9(v8)
    expect(v8).toEqual(sourceProject)
    expect(documentResult.project.schemaVersion).toBe(9)
    expect(documentResult.report).toMatchObject({
      sourceFormat: 'legacy-course',
      targetFormat: 'current-course',
      projectId: 'course-stable',
      title: '显式迁移',
      surfaceCount: 1,
      locationCount: 1,
      assetCount: 1,
      componentPackageCount: 1,
      droppedFields: [],
      warnings: [],
    })
    expect(documentResult.report.notes.some((note) => note.includes('另存为新文件'))).toBe(true)
    expect(documentResult.project.locations[0]).toMatchObject({
      id: v8.scenes[0]!.id,
      kind: 'slide-scene',
      sceneId: v8.scenes[0]!.id,
    })
    expect(
      documentResult.project.surfaces[0] && documentResult.project.surfaces[0].type === 'slide'
        ? documentResult.project.surfaces[0].scenes[0]?.layerItems.map((item) => item.layerItemId)
        : [],
    ).toContain('kept-image')
    expect(courseProjectDocumentSchema.parse(structuredClone(documentResult.project)))
      .toEqual(documentResult.project)

    expect(() => openCourseProjectArchive(v8Bytes)).toThrow(/显式迁移/)
    const imported = importProjectV8ArchiveAsCourseProject(v8Bytes)
    expect(imported.report).toEqual(documentResult.report)
    expect([...imported.assetFiles.legacy!]).toEqual([...assetBytes])
    expect(v8Bytes).toEqual(sourceBytes)
    expect(v8).toEqual(sourceProject)

    const migratedBytes = migrateProjectV8ArchiveToCourseProjectV9(v8Bytes, { mtime: NOW })
    const reopened = openCourseProjectArchive(migratedBytes)
    expect(inspectCourseProjectArchiveIdentity(migratedBytes).schemaVersion).toBe(9)
    expect(reopened.project.id).toBe('course-stable')
    expect([...reopened.assetFiles.legacy!]).toEqual([...assetBytes])
    expect(createCourseProjectArchive({
      project: imported.project,
      assetFiles: imported.assetFiles,
      componentFiles: imported.componentFiles,
    }, { mtime: NOW })).toEqual(migratedBytes)
  })

  it('refuses multiple versions of one component without changing source data', () => {
    const v8 = createProject({
      id: 'legacy-component-conflict',
      title: '组件版本冲突',
      now: NOW,
      includeDefaultController: false,
      controls: 'none',
    })
    const version4 = makeComponent('4.0.0')
    const version5 = makeComponent('5.0.0')
    v8.componentPackages[version4.key] = version4.metadata
    v8.componentPackages[version5.key] = version5.metadata
    const projectBefore = structuredClone(v8)
    const v8Bytes = createProjectArchive({
      project: v8,
      assetFiles: {},
      componentFiles: {
        [version4.key]: version4.files,
        [version5.key]: version5.files,
      },
    }, { mtime: NOW })
    const sourceBytes = v8Bytes.slice()

    expect(() => migrateProjectV8DocumentToCourseProjectV9(v8))
      .toThrow(LegacyComponentPackageMigrationConflictError)
    expect(() => migrateProjectV8DocumentToCourseProjectV9(v8))
      .toThrow(/旧工程.*多个版本/)
    expect(() => importProjectV8ArchiveAsCourseProject(v8Bytes))
      .toThrow(LegacyComponentPackageMigrationConflictError)

    expect(v8).toEqual(projectBefore)
    expect(v8Bytes).toEqual(sourceBytes)
  })
})
