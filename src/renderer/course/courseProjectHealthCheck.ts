import type { ComponentPackageData } from '../../shared/componentTypes'
import { buildPublishedCourseV2Payload } from '../export/course/buildPublishedCourse'
import {
  createCourseProjectArchiveAsync,
  type CourseProjectArchiveData,
} from '../project/courseProjectArchive'

export interface CourseProjectHealthCheckSummary {
  readonly error: number
  readonly warning: number
  readonly info: number
  readonly canExport: boolean
}

export interface CourseProjectHealthCheckDiagnostic {
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
}

/**
 * A document-owned view model that can be passed directly to the health panel.
 * The original failure is intentionally non-enumerable so diagnostic exports
 * and UI rendering cannot accidentally disclose internal project details.
 */
export interface CourseProjectHealthCheckResult {
  readonly summary: CourseProjectHealthCheckSummary
  readonly diagnostics: readonly CourseProjectHealthCheckDiagnostic[]
  readonly description: string
  readonly footer: string
  readonly cause?: unknown
}

function successResult(): CourseProjectHealthCheckResult {
  return {
    summary: { error: 0, warning: 0, info: 0, canExport: true },
    diagnostics: [],
    description: '工程内容完整，可以继续保存、预览和导出。',
    footer: '已检查工程结构、素材内容和交付所需内容。',
  }
}

function failureResult(cause: unknown): CourseProjectHealthCheckResult {
  const result: CourseProjectHealthCheckResult = {
    summary: { error: 1, warning: 0, info: 0, canExport: false },
    diagnostics: [{
      severity: 'error',
      message: '工程内容不完整，或部分内容之间的关联已失效。请检查素材和课件内容后重试。',
    }],
    description: '工程检查发现了需要处理的问题。',
    footer: '修复后请重新检查，再继续预览或导出。',
  }
  Object.defineProperty(result, 'cause', {
    value: cause,
    enumerable: false,
    configurable: false,
    writable: false,
  })
  return result
}

/**
 * Runs the same persisted-archive and delivery compilation checks used by the
 * real save/export paths. It never exposes implementation errors to teachers.
 */
export async function checkCourseProjectHealth(
  archive: CourseProjectArchiveData,
  componentPackages: Readonly<Record<string, ComponentPackageData>>,
): Promise<CourseProjectHealthCheckResult> {
  try {
    await createCourseProjectArchiveAsync(archive)
    buildPublishedCourseV2Payload({
      project: archive.project,
      assetFiles: archive.assetFiles,
      components: componentPackages,
    })
    return successResult()
  } catch (cause) {
    return failureResult(cause)
  }
}
