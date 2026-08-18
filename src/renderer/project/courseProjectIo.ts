import { UserFacingError } from '@/shared/errors'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import {
  createCourseProjectArchive,
  createCourseProjectArchiveAsync,
  detectCourseProjectArchiveFormat,
  importProjectV8ArchiveAsCourseProject,
  importProjectV8ArchiveAsCourseProjectAsync,
  openCourseProjectArchive,
  openCourseProjectArchiveAsync,
  type CourseProjectArchiveData,
  type CourseProjectV8ImportReport,
  type CourseProjectV8ImportResult,
  type CreateCourseProjectArchiveOptions,
} from './courseProjectArchive'

export type DefaultCourseProjectOpenResult =
  | { kind: 'v9'; archive: CourseProjectArchiveData }
  | { kind: 'v8'; pending: CourseProjectV8ImportResult }

function refuseUnsupportedOrCorrupt(
  kind: 'corrupted' | 'unsupported',
  reason: string,
  schemaVersion: number | null,
): never {
  if (kind === 'corrupted') {
    throw new UserFacingError(
      '课程工程文件损坏',
      reason,
      '请重新选择有效的课程工程，或从备份恢复。不要把损坏文件另存覆盖原件。',
    )
  }
  throw new UserFacingError(
    '课程工程版本不支持',
    reason,
    schemaVersion === null
      ? '请使用能打开该文件的编辑器版本，或从备份恢复。当前不会尝试静默转换。'
      : `请使用支持格式版本 ${schemaVersion} 的编辑器打开，或先做受支持的显式迁移。当前不会静默改写该文件。`,
  )
}

/**
 * Default product open: V9 loads as V9; V8 is never sent to `openProjectArchive`
 * and is never silently converted. Caller must show the V8 import report and
 * only then keep the migrated document.
 */
export function openDefaultCourseProject(
  bytes: Uint8Array,
): DefaultCourseProjectOpenResult {
  const probe = detectCourseProjectArchiveFormat(bytes)
  if (probe.kind === 'v9') {
    return { kind: 'v9', archive: openCourseProjectArchive(bytes) }
  }
  if (probe.kind === 'v8') {
    return { kind: 'v8', pending: importProjectV8ArchiveAsCourseProject(bytes) }
  }
  refuseUnsupportedOrCorrupt(probe.kind, probe.reason, probe.identity.schemaVersion)
}

export async function openDefaultCourseProjectAsync(
  bytes: Uint8Array,
  options: { signal?: AbortSignal } = {},
): Promise<DefaultCourseProjectOpenResult> {
  const probe = detectCourseProjectArchiveFormat(bytes)
  if (probe.kind === 'v9') {
    return { kind: 'v9', archive: await openCourseProjectArchiveAsync(bytes, options) }
  }
  if (probe.kind === 'v8') {
    return {
      kind: 'v8',
      pending: await importProjectV8ArchiveAsCourseProjectAsync(bytes, options),
    }
  }
  refuseUnsupportedOrCorrupt(probe.kind, probe.reason, probe.identity.schemaVersion)
}

export function saveCourseProjectDocument(
  data: CourseProjectArchiveData,
  options: CreateCourseProjectArchiveOptions = {},
): Uint8Array {
  return createCourseProjectArchive(data, options)
}

export async function saveCourseProjectDocumentAsync(
  data: CourseProjectArchiveData,
  options: CreateCourseProjectArchiveOptions = {},
): Promise<Uint8Array> {
  return createCourseProjectArchiveAsync(data, options)
}

export function formatCourseProjectV8ImportReport(
  report: CourseProjectV8ImportReport,
): string {
  const lines = [
    `来源：旧版工程（${report.sourceFormat}）`,
    `目标：当前课程工程（${report.targetFormat}）`,
    `课件：${report.title}`,
    `页面 ${report.locationCount}、表面 ${report.surfaceCount}、素材 ${report.assetCount}、组件 ${report.componentPackageCount}`,
  ]
  if (report.droppedFields.length > 0) {
    lines.push(`未完整迁入的字段：${report.droppedFields.join('、')}`)
  }
  if (report.warnings.length > 0) {
    lines.push('需要处理：', ...report.warnings.map((warning) => `- ${warning}`))
  }
  if (report.notes.length > 0) {
    lines.push('说明：', ...report.notes.map((note) => `- ${note}`))
  }
  lines.push('原文件不会被改写。导入后请另存为新的课程工程。')
  return lines.join('\n')
}

export function courseProjectTitle(project: CourseProjectDocument): string {
  return project.title
}
