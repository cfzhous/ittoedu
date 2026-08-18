import {
  LegacyComponentPackageMigrationConflictError,
  ProjectV8MigrationCompatibilityError,
  migrateProjectV8ToCourseProjectV9,
} from '@/shared/courseProjectModel'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import { UserFacingError } from '@/shared/errors'
import type { ProjectDocument } from '@/shared/projectTypes'

const EXPECTED_V8_ROOT_KEYS = new Set([
  'schemaVersion',
  'id',
  'title',
  'createdAt',
  'updatedAt',
  'canvas',
  'scenes',
  'assets',
  'componentPackages',
  'globalRuntime',
  'globalLayer',
  'globalInteractions',
  'designTokens',
  'media',
  'playback',
])

export interface CourseProjectV8ImportReport {
  sourceFormat: 'legacy-course'
  targetFormat: 'current-course'
  projectId: string
  title: string
  surfaceCount: number
  locationCount: number
  assetCount: number
  componentPackageCount: number
  droppedFields: readonly string[]
  warnings: readonly string[]
  notes: readonly string[]
}

export interface CourseProjectV8MigrationResult {
  project: CourseProjectDocument
  report: CourseProjectV8ImportReport
}

function slideLayerItemIds(
  migrated: CourseProjectDocument,
  sceneId: string,
): Set<string> {
  const ids = new Set<string>()
  for (const surface of migrated.surfaces) {
    if (surface.type !== 'slide') continue
    for (const scene of surface.scenes) {
      if (scene.id !== sceneId) continue
      for (const item of scene.layerItems) ids.add(item.layerItemId)
    }
  }
  return ids
}

function migratedSceneIds(migrated: CourseProjectDocument): Set<string> {
  const ids = new Set<string>()
  for (const location of migrated.locations) {
    if (location.kind === 'slide-scene') ids.add(location.id)
  }
  for (const surface of migrated.surfaces) {
    if (surface.type !== 'slide') continue
    for (const scene of surface.scenes) ids.add(scene.id)
  }
  return ids
}

function collectDroppedFields(
  source: ProjectDocument,
  migrated: CourseProjectDocument,
): string[] {
  const dropped: string[] = []
  for (const key of Object.keys(source)) {
    if (!EXPECTED_V8_ROOT_KEYS.has(key)) dropped.push(`root.${key}`)
  }

  const sceneIds = migratedSceneIds(migrated)
  for (const scene of source.scenes) {
    if (!sceneIds.has(scene.id)) dropped.push(`scenes.${scene.id}`)
    const layerIds = slideLayerItemIds(migrated, scene.id)
    for (const node of scene.nodes) {
      if (!layerIds.has(node.id)) dropped.push(`scenes.${scene.id}.nodes.${node.id}`)
    }
    if (scene.runtime) {
      const hasRuntime = [...layerIds].some((id) => id.includes('legacy-runtime'))
        || migrated.surfaces.some((surface) => (
          surface.type === 'slide'
          && surface.scenes.some((candidate) => (
            candidate.id === scene.id
            && candidate.layerItems.some((item) => item.kind === 'runtime')
          ))
        ))
      if (!hasRuntime) dropped.push(`scenes.${scene.id}.runtime`)
    }
  }

  for (const assetId of Object.keys(source.assets)) {
    if (!Object.prototype.hasOwnProperty.call(migrated.assets, assetId)) {
      dropped.push(`assets.${assetId}`)
    }
  }

  const migratedPackageIds = new Set(Object.keys(migrated.componentPackages))
  for (const meta of Object.values(source.componentPackages)) {
    if (!migratedPackageIds.has(meta.packageId)) {
      dropped.push(`componentPackages.${meta.packageId}`)
    }
  }

  const globalIds = new Set(
    migrated.globalLayerItems.map((entry) => entry.item.layerItemId),
  )
  for (const entry of source.globalLayer) {
    if (!globalIds.has(entry.node.id)) dropped.push(`globalLayer.${entry.node.id}`)
  }
  if (source.globalRuntime) {
    const hasRuntime = migrated.globalLayerItems.some((entry) => entry.item.kind === 'runtime')
    if (!hasRuntime) dropped.push('globalRuntime')
  }

  return dropped
}

export function buildCourseProjectV8ImportReport(
  source: ProjectDocument,
  migrated: CourseProjectDocument,
): CourseProjectV8ImportReport {
  const droppedFields = collectDroppedFields(source, migrated)
  const warnings: string[] = []
  if (Object.keys(source.assets).length !== Object.keys(migrated.assets).length) {
    warnings.push('部分素材未能带入新工程，请核对媒体是否完整。')
  }
  if (
    Object.keys(source.componentPackages).length !==
    Object.keys(migrated.componentPackages).length
  ) {
    warnings.push('部分互动组件未能带入新工程，请核对组件是否完整。')
  }
  if (droppedFields.length > 0) {
    warnings.push(`以下字段未能带入新工程：${droppedFields.join('、')}。`)
  }
  return {
    sourceFormat: 'legacy-course',
    targetFormat: 'current-course',
    projectId: migrated.id,
    title: migrated.title,
    surfaceCount: migrated.surfaces.length,
    locationCount: migrated.locations.length,
    assetCount: Object.keys(migrated.assets).length,
    componentPackageCount: Object.keys(migrated.componentPackages).length,
    droppedFields,
    warnings,
    notes: [
      '已从旧版课件转换为当前课程工程。',
      '导入后请另存为新文件，原文件不会被改写。',
      '之后保存、最近工程和恢复都只使用当前格式。',
    ],
  }
}

/**
 * Explicit Project V8 → Course Project V9 conversion.
 * Calls the frozen R1-A model migrator and always returns a reviewable report.
 * It never writes files or opens the default V8 product path.
 */
export function migrateProjectV8DocumentToCourseProjectV9(
  source: ProjectDocument,
): CourseProjectV8MigrationResult {
  let project: CourseProjectDocument
  try {
    project = migrateProjectV8ToCourseProjectV9(source)
  } catch (error) {
    if (
      error instanceof ProjectV8MigrationCompatibilityError
      || error instanceof LegacyComponentPackageMigrationConflictError
      || error instanceof UserFacingError
    ) {
      throw error
    }
    const detail = error instanceof Error ? error.message : '旧版工程转换失败。'
    throw new UserFacingError(
      '旧工程无法迁移',
      detail,
      '请检查工程是否完整，或先在原编辑器中保存后再导入。不会静默丢弃无法转换的字段。',
      { cause: error },
    )
  }
  return {
    project,
    report: buildCourseProjectV8ImportReport(source, project),
  }
}
