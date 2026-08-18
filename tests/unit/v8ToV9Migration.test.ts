import { describe, expect, it } from 'vitest'
import { createImageNode, createProject } from '@/renderer/project/createProject'
import {
  createCourseProjectArchive,
  detectCourseProjectArchiveFormat,
  importProjectV8ArchiveAsCourseProject,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import { migrateProjectV8DocumentToCourseProjectV9 } from '@/renderer/project/courseProjectMigration'
import { createProjectArchive } from '@/renderer/project/projectArchive'
import { courseProjectDocumentSchema } from '@/shared/courseProjectSchema'

const NOW = '2026-08-17T13:00:00.000Z'
const ASSET_BYTES = new Uint8Array([137, 80, 78, 71, 9, 8, 7])

describe('explicit V8 to V9 migration gate', () => {
  it('migrates a minimal V8 project with a reviewable report and V9 validate', () => {
    const source = createProject({
      id: 'r1z-v8-source',
      title: 'R1-Z 最小旧工程',
      now: NOW,
      includeDefaultController: false,
      controls: 'none',
    })
    source.assets.badge = {
      id: 'badge',
      filename: 'badge.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/badge.bin',
      byteLength: ASSET_BYTES.byteLength,
      width: 2,
      height: 2,
    }
    source.scenes[0]!.nodes.push(createImageNode({
      id: 'badge-node',
      assetId: 'badge',
      width: 120,
      height: 80,
    }))
    const frozen = structuredClone(source)
    const v8Bytes = createProjectArchive({
      project: source,
      assetFiles: { badge: ASSET_BYTES },
      componentFiles: {},
    }, { mtime: NOW })
    const frozenBytes = v8Bytes.slice()

    expect(detectCourseProjectArchiveFormat(v8Bytes)).toMatchObject({
      kind: 'v8',
      identity: { schemaVersion: 8, projectId: 'r1z-v8-source' },
    })
    expect(() => openCourseProjectArchive(v8Bytes)).toThrow(/显式迁移/)

    const migrated = migrateProjectV8DocumentToCourseProjectV9(source)
    expect(source).toEqual(frozen)
    expect(migrated.project.schemaVersion).toBe(9)
    expect(courseProjectDocumentSchema.parse(structuredClone(migrated.project)))
      .toEqual(migrated.project)
    expect(migrated.report).toMatchObject({
      sourceFormat: 'legacy-course',
      targetFormat: 'current-course',
      projectId: 'r1z-v8-source',
      title: 'R1-Z 最小旧工程',
      surfaceCount: 1,
      locationCount: 1,
      assetCount: 1,
      componentPackageCount: 0,
      droppedFields: [],
      warnings: [],
    })
    expect(migrated.report.notes.some((note) => note.includes('另存为新文件'))).toBe(true)
    expect(migrated.project.assets.badge?.id).toBe('badge')
    const slide = migrated.project.surfaces[0]
    if (slide?.type !== 'slide') throw new Error('expected slide surface')
    expect(slide.scenes[0]?.layerItems.map((item) => item.layerItemId)).toContain('badge-node')

    const imported = importProjectV8ArchiveAsCourseProject(v8Bytes)
    expect(v8Bytes).toEqual(frozenBytes)
    expect(source).toEqual(frozen)
    expect(imported.report).toEqual(migrated.report)
    expect(courseProjectDocumentSchema.parse(structuredClone(imported.project)))
      .toEqual(imported.project)
    expect([...imported.assetFiles.badge!]).toEqual([...ASSET_BYTES])

    const v9Bytes = createCourseProjectArchive({
      project: imported.project,
      assetFiles: imported.assetFiles,
      componentFiles: imported.componentFiles,
    }, { mtime: NOW })
    expect(detectCourseProjectArchiveFormat(v9Bytes).kind).toBe('v9')
    expect(openCourseProjectArchive(v9Bytes).project.id).toBe('r1z-v8-source')
  })
})
