import { UserFacingError } from '../../shared/errors'
import {
  collectProjectHealth,
  summarizeProjectHealth,
  type ProjectHealthDiagnostic,
  type ProjectHealthSummary,
} from '../../shared/projectHealth'
import { detectLayoutMeasurementMode } from '../../shared/layoutMeasure'
import { compareStableStrings } from '../../shared/stableOrder'
import {
  collectExportPreflight,
  type ExportPreflightReport,
  type ExportPreflightTarget,
} from '../export/exportPreflight'
import { componentPackagesFromArchive } from '../components/componentPackageStore'
import {
  openProjectArchive,
  ProjectSchemaValidationError,
  UnsupportedProjectVersionError,
} from './projectArchive'

export const PROJECT_VALIDATION_REPORT_VERSION = 1 as const

export type ProjectValidationStatus = 'valid' | 'invalid' | 'unreadable'

export interface ProjectValidationFatalError {
  code:
    | 'archive-invalid'
    | 'input-unreadable'
    | 'schema-invalid'
    | 'unsupported-project-version'
    | 'usage-error'
    | 'validation-failed'
  title: string
  message: string
  suggestion?: string
}

export interface ProjectValidationReport {
  reportVersion: typeof PROJECT_VALIDATION_REPORT_VERSION
  status: ProjectValidationStatus
  input: { filename: string }
  measurement: {
    mode: ReturnType<typeof detectLayoutMeasurementMode>
    note: string
  }
  schema: {
    valid: boolean
    schemaVersion: number | null
    issues: ProjectValidationSchemaIssue[]
  }
  project: null | {
    id: string
    title: string
    sceneCount: number
    assetCount: number
    componentPackageCount: number
  }
  projectHealth: null | {
    items: ProjectHealthDiagnostic[]
    summary: ProjectHealthSummary
  }
  exportPreflight: null | Record<ExportPreflightTarget, ExportPreflightReport>
  summary: {
    error: number
    warning: number
    info: number
    total: number
    canExport: boolean
  }
  fatal: ProjectValidationFatalError | null
}

export interface ProjectValidationSchemaIssue {
  path: Array<string | number>
  code: string
  message: string
}

const EMPTY_SUMMARY = {
  error: 0,
  warning: 0,
  info: 0,
  total: 0,
  canExport: false,
} as const

function measurement(): ProjectValidationReport['measurement'] {
  const mode = detectLayoutMeasurementMode()
  return {
    mode,
    note: mode === 'browser-canvas'
      ? '文本与公式布局使用浏览器 Canvas 字形测量。'
      : 'Node 环境使用确定性字宽后备；布局诊断适合自动筛查，最终像素结果仍需真实导出或人工验收。',
  }
}

export function unreadableProjectValidationReport(
  filename: string,
  fatal: ProjectValidationFatalError,
  schema: ProjectValidationReport['schema'] = {
    valid: false,
    schemaVersion: null,
    issues: [],
  },
): ProjectValidationReport {
  return {
    reportVersion: PROJECT_VALIDATION_REPORT_VERSION,
    status: 'unreadable',
    input: { filename },
    measurement: measurement(),
    schema,
    project: null,
    projectHealth: null,
    exportPreflight: null,
    summary: { ...EMPTY_SUMMARY },
    fatal,
  }
}

function normalizeSchemaPath(path: readonly PropertyKey[]): Array<string | number> {
  return path.map((segment) => (
    typeof segment === 'string' || typeof segment === 'number'
      ? segment
      : String(segment)
  ))
}

function archiveFailure(error: unknown): {
  fatal: ProjectValidationFatalError
  schema: ProjectValidationReport['schema']
} {
  if (error instanceof UserFacingError) {
    const cause = error.cause
    const code = cause instanceof UnsupportedProjectVersionError
      ? 'unsupported-project-version'
      : cause instanceof ProjectSchemaValidationError
        ? 'schema-invalid'
        : 'archive-invalid'
    const schemaVersion = cause instanceof UnsupportedProjectVersionError
      ? cause.schemaVersion
      : cause instanceof ProjectSchemaValidationError
        ? cause.schemaVersion
        : null
    const issues = cause instanceof ProjectSchemaValidationError
      ? cause.issues.map((issue) => ({
          path: normalizeSchemaPath(issue.path),
          code: issue.code,
          message: issue.message,
        }))
      : []
    return {
      fatal: {
        code,
        title: error.title,
        message: error.message,
        suggestion: error.suggestion,
      },
      schema: { valid: false, schemaVersion, issues },
    }
  }
  return {
    fatal: {
      code: 'validation-failed',
      title: '工程校验失败',
      message: error instanceof Error ? error.message : '发生未知错误。',
    },
    schema: { valid: false, schemaVersion: null, issues: [] },
  }
}

function combinedSummary(
  health: ProjectHealthSummary,
  reports: Record<ExportPreflightTarget, ExportPreflightReport>,
): ProjectValidationReport['summary'] {
  const summary = {
    error: health.error,
    warning: health.warning,
    info: health.info,
    total: health.total,
    canExport: true,
  }
  Object.values(reports).forEach((report) => {
    // Every target report intentionally carries Project Health findings for
    // the UI. The top-level CLI summary already counted those once above, so
    // only count target-specific preflight occurrences here.
    report.items
      .filter((item) => !item.code.startsWith('project-health:'))
      .forEach((item) => {
        summary[item.severity] += 1
        summary.total += 1
      })
  })
  summary.canExport = summary.error === 0
  return summary
}

/** Validates a complete Project V8 archive without launching Electron or exporting. */
export function validateProjectArchiveBytes(
  bytes: Uint8Array,
  filename: string,
): ProjectValidationReport {
  try {
    const archive = openProjectArchive(bytes)
    const components = componentPackagesFromArchive(
      archive.project,
      archive.componentFiles,
    )
    const healthItems = collectProjectHealth(archive.project, components)
    const healthSummary = summarizeProjectHealth(healthItems)
    const validationTime = new Date(archive.project.updatedAt)
    const now = Number.isNaN(validationTime.valueOf())
      ? new Date(0)
      : validationTime
    const resources = {
      assetFiles: archive.assetFiles,
      components,
    }
    const exportPreflight = {
      'single-html': collectExportPreflight(
        archive.project,
        'single-html',
        resources,
        now,
      ),
      'web-package': collectExportPreflight(
        archive.project,
        'web-package',
        resources,
        now,
      ),
      pdf: collectExportPreflight(archive.project, 'pdf', resources, now),
      pptx: collectExportPreflight(archive.project, 'pptx', resources, now),
    } satisfies Record<ExportPreflightTarget, ExportPreflightReport>
    const summary = combinedSummary(healthSummary, exportPreflight)

    return {
      reportVersion: PROJECT_VALIDATION_REPORT_VERSION,
      status: summary.canExport ? 'valid' : 'invalid',
      input: { filename },
      measurement: measurement(),
      schema: { valid: true, schemaVersion: 8, issues: [] },
      project: {
        id: archive.project.id,
        title: archive.project.title,
        sceneCount: archive.project.scenes.length,
        assetCount: Object.keys(archive.project.assets).length,
        componentPackageCount: Object.keys(archive.project.componentPackages).length,
      },
      projectHealth: { items: healthItems, summary: healthSummary },
      exportPreflight,
      summary,
      fatal: null,
    }
  } catch (error) {
    const failure = archiveFailure(error)
    return unreadableProjectValidationReport(
      filename,
      failure.fatal,
      failure.schema,
    )
  }
}

export function projectValidationExitCode(report: ProjectValidationReport): 0 | 1 | 2 {
  if (report.status === 'unreadable') return 2
  return report.summary.canExport ? 0 : 1
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => compareStableStrings(left, right))
      .map(([key, nested]) => [key, normalizeJson(nested)]),
  )
}

export function serializeProjectValidationReport(
  report: ProjectValidationReport,
): string {
  return `${JSON.stringify(normalizeJson(report))}\n`
}
