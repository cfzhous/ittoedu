import crypto from 'node:crypto'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'
import { app } from 'electron'
import type {
  RecentProjectEntry,
  RecoveryProjectInput,
  RecoveryProjectResult,
} from '../shared/ipcTypes'
import { DesktopOperationError } from './errors'

export const MAX_RECOVERY_PROJECT_BYTES = 256 * 1024 * 1024

const MAX_RECENT_PROJECTS = 12
const MAX_RECENT_FILE_BYTES = 128 * 1024
const RECENT_FILE_VERSION = 1
const RECOVERY_METADATA_VERSION = 1

interface RecentProjectsFile {
  version: typeof RECENT_FILE_VERSION
  projects: RecentProjectEntry[]
}

interface RecoveryArchiveIdentity {
  schemaVersion: number | null
  projectId: string | null
  revision: number | null
  updatedAt: string | null
}

interface RecoveryMetadataFile {
  version: typeof RECOVERY_METADATA_VERSION
  projectName: string
  projectPath?: string
  savedAt: number
  sha256: string
  projectId?: string
  revision?: number
  updatedAt?: string
  schemaVersion?: number
}

let persistenceQueue: Promise<void> = Promise.resolve()

function withPersistenceLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = persistenceQueue.then(operation, operation)
  persistenceQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function persistenceDirectory(): string {
  return path.join(app.getPath('userData'), 'project-data')
}

function recentProjectsPath(): string {
  return path.join(persistenceDirectory(), 'recent-projects.json')
}

function recoveryPackagePath(): string {
  return path.join(persistenceDirectory(), 'recovery.h5lesson')
}

function recoveryMetadataPath(): string {
  return path.join(persistenceDirectory(), 'recovery.json')
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved
}

function hasProjectExtension(value: string): boolean {
  return path.extname(value).toLocaleLowerCase('en-US') === '.h5lesson'
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  )
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function parseRecentProject(value: unknown): RecentProjectEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.path !== 'string' ||
    candidate.path.length === 0 ||
    candidate.path.length > 32_767 ||
    !path.isAbsolute(candidate.path) ||
    !hasProjectExtension(candidate.path) ||
    typeof candidate.name !== 'string' ||
    candidate.name.length === 0 ||
    candidate.name.length > 260 ||
    !isFiniteTimestamp(candidate.lastOpenedAt)
  ) {
    return null
  }
  return {
    path: path.resolve(candidate.path),
    name: path.basename(candidate.path),
    lastOpenedAt: candidate.lastOpenedAt,
  }
}

function parseOptionalIdentityField(
  value: unknown,
  kind: 'id' | 'revision' | 'updatedAt' | 'schemaVersion',
): string | number | undefined {
  if (value === undefined) return undefined
  if (kind === 'revision' || kind === 'schemaVersion') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
  }
  return typeof value === 'string' && value.length > 0 && value.length <= 260 ? value : undefined
}

function parseRecoveryMetadata(value: unknown): RecoveryMetadataFile | null {
  if (typeof value !== 'object' || value === null) return null
  const candidate = value as Record<string, unknown>
  if (
    candidate.version !== RECOVERY_METADATA_VERSION ||
    typeof candidate.projectName !== 'string' ||
    candidate.projectName.length === 0 ||
    candidate.projectName.length > 160 ||
    !isFiniteTimestamp(candidate.savedAt) ||
    typeof candidate.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(candidate.sha256)
  ) {
    return null
  }
  if (
    candidate.projectPath !== undefined &&
    (typeof candidate.projectPath !== 'string' ||
      candidate.projectPath.length === 0 ||
      candidate.projectPath.length > 32_767 ||
      !path.isAbsolute(candidate.projectPath) ||
      !hasProjectExtension(candidate.projectPath))
  ) {
    return null
  }
  const projectId = parseOptionalIdentityField(candidate.projectId, 'id')
  const revision = parseOptionalIdentityField(candidate.revision, 'revision')
  const updatedAt = parseOptionalIdentityField(candidate.updatedAt, 'updatedAt')
  const schemaVersion = parseOptionalIdentityField(candidate.schemaVersion, 'schemaVersion')
  return {
    version: RECOVERY_METADATA_VERSION,
    projectName: candidate.projectName,
    projectPath:
      typeof candidate.projectPath === 'string'
        ? path.resolve(candidate.projectPath)
        : undefined,
    savedAt: candidate.savedAt,
    sha256: candidate.sha256,
    ...(typeof projectId === 'string' ? { projectId } : {}),
    ...(typeof revision === 'number' ? { revision } : {}),
    ...(typeof updatedAt === 'string' ? { updatedAt } : {}),
    ...(typeof schemaVersion === 'number' ? { schemaVersion } : {}),
  }
}

function peekProjectIdentityFromArchive(bytes: Uint8Array): RecoveryArchiveIdentity | null {
  try {
    const files = unzipSync(bytes, {
      filter(file) {
        return file.name === 'project.json'
      },
    })
    const raw = files['project.json']
    if (!raw) return null
    const value = JSON.parse(strFromU8(raw)) as unknown
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    const schemaVersion = typeof record.schemaVersion === 'number' &&
      Number.isInteger(record.schemaVersion)
      ? record.schemaVersion
      : null
    return {
      schemaVersion,
      projectId: typeof record.id === 'string' && record.id.length > 0 ? record.id : null,
      revision: typeof record.revision === 'number' && Number.isInteger(record.revision)
        ? record.revision
        : null,
      updatedAt: typeof record.updatedAt === 'string' && record.updatedAt.length > 0
        ? record.updatedAt
        : null,
    }
  } catch {
    return null
  }
}

function officialIsNewerThanRecovery(
  official: RecoveryArchiveIdentity,
  recovery: RecoveryArchiveIdentity,
): boolean {
  if (official.schemaVersion !== 9 || recovery.schemaVersion !== 9) return false
  if (!official.projectId || !recovery.projectId || official.projectId !== recovery.projectId) {
    return false
  }
  if (
    official.revision !== null &&
    recovery.revision !== null &&
    official.revision > recovery.revision
  ) {
    return true
  }
  if (
    official.revision !== null &&
    recovery.revision !== null &&
    official.revision < recovery.revision
  ) {
    return false
  }
  if (official.updatedAt && recovery.updatedAt) {
    const officialTime = Date.parse(official.updatedAt)
    const recoveryTime = Date.parse(recovery.updatedAt)
    return Number.isFinite(officialTime) &&
      Number.isFinite(recoveryTime) &&
      officialTime > recoveryTime
  }
  return false
}

async function peekOfficialIdentity(projectPath: string): Promise<RecoveryArchiveIdentity | null> {
  try {
    const stats = await fs.stat(projectPath)
    if (!stats.isFile() || stats.size <= 0 || stats.size > MAX_RECOVERY_PROJECT_BYTES) {
      return null
    }
    const bytes = new Uint8Array(await fs.readFile(projectPath))
    if (!hasZipSignature(bytes)) return null
    return peekProjectIdentityFromArchive(bytes)
  } catch {
    return null
  }
}

async function atomicWrite(filePath: string, data: Uint8Array | string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`,
  )
  try {
    await fs.writeFile(temporaryPath, data, { flag: 'wx' })
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function readJsonFile(filePath: string, maxBytes: number): Promise<unknown> {
  try {
    const stats = await fs.stat(filePath)
    if (!stats.isFile() || stats.size <= 0 || stats.size > maxBytes) return null
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    return null
  }
}

async function readRecentProjectsUnsafe(): Promise<RecentProjectEntry[]> {
  const raw = await readJsonFile(recentProjectsPath(), MAX_RECENT_FILE_BYTES)
  if (typeof raw !== 'object' || raw === null) return []
  const file = raw as Record<string, unknown>
  if (file.version !== RECENT_FILE_VERSION || !Array.isArray(file.projects)) return []

  const unique = new Map<string, RecentProjectEntry>()
  for (const item of file.projects) {
    const parsed = parseRecentProject(item)
    if (!parsed) continue
    const key = canonicalPath(parsed.path)
    const existing = unique.get(key)
    if (!existing || parsed.lastOpenedAt > existing.lastOpenedAt) unique.set(key, parsed)
  }
  return [...unique.values()]
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .slice(0, MAX_RECENT_PROJECTS)
}

async function filterExistingProjects(
  projects: RecentProjectEntry[],
): Promise<RecentProjectEntry[]> {
  const checked = await Promise.all(
    projects.map(async (project) => {
      try {
        const stats = await fs.stat(project.path)
        return stats.isFile() && hasProjectExtension(project.path) ? project : null
      } catch {
        return null
      }
    }),
  )
  return checked.filter((project): project is RecentProjectEntry => project !== null)
}

async function writeRecentProjectsUnsafe(projects: RecentProjectEntry[]): Promise<void> {
  const file: RecentProjectsFile = {
    version: RECENT_FILE_VERSION,
    projects: projects.slice(0, MAX_RECENT_PROJECTS),
  }
  await atomicWrite(recentProjectsPath(), `${JSON.stringify(file, null, 2)}\n`)
}

async function readAndPruneRecentProjectsUnsafe(): Promise<RecentProjectEntry[]> {
  const stored = await readRecentProjectsUnsafe()
  const existing = await filterExistingProjects(stored)
  if (existing.length !== stored.length) await writeRecentProjectsUnsafe(existing)
  return existing
}

export function listRecentProjects(): Promise<RecentProjectEntry[]> {
  return withPersistenceLock(() => readAndPruneRecentProjectsUnsafe())
}

export function recordRecentProject(filePath: string): Promise<void> {
  return withPersistenceLock(async () => {
    const resolved = path.resolve(filePath)
    if (!path.isAbsolute(resolved) || !hasProjectExtension(resolved)) return
    try {
      const stats = await fs.stat(resolved)
      if (!stats.isFile()) return
    } catch {
      return
    }

    const existing = await readAndPruneRecentProjectsUnsafe()
    const key = canonicalPath(resolved)
    const next: RecentProjectEntry[] = [
      {
        path: resolved,
        name: path.basename(resolved),
        lastOpenedAt: Date.now(),
      },
      ...existing.filter((project) => canonicalPath(project.path) !== key),
    ]
    await writeRecentProjectsUnsafe(next)
  })
}

export function removeRecentProject(filePath: string): Promise<void> {
  return withPersistenceLock(async () => {
    const requestedKey = canonicalPath(path.resolve(filePath))
    const existing = await readAndPruneRecentProjectsUnsafe()
    const next = existing.filter(
      (project) => canonicalPath(project.path) !== requestedKey,
    )
    if (next.length !== existing.length) await writeRecentProjectsUnsafe(next)
  })
}

export function resolveRecentProjectPath(requestedPath: string): Promise<string> {
  return withPersistenceLock(async () => {
    const projects = await readAndPruneRecentProjectsUnsafe()
    const requestedKey = canonicalPath(requestedPath)
    const approved = projects.find(
      (project) => canonicalPath(project.path) === requestedKey,
    )
    if (!approved) {
      throw new DesktopOperationError(
        'RECENT_PROJECT_NOT_ALLOWED',
        '最近工程打开失败',
        '该文件不在最近工程列表中，或文件已经被移动。',
        '请使用“打开工程”重新选择该文件。',
      )
    }
    return approved.path
  })
}

export function writeRecoveryProject(input: RecoveryProjectInput): Promise<void> {
  return withPersistenceLock(async () => {
    if (
      input.bytes.byteLength === 0 ||
      input.bytes.byteLength > MAX_RECOVERY_PROJECT_BYTES
    ) {
      throw new DesktopOperationError(
        'RECOVERY_SIZE_INVALID',
        '自动恢复保存失败',
        input.bytes.byteLength === 0
          ? '恢复工程包为空。'
          : '恢复工程包超过 256 MB 限制。',
        '请删除未使用的大图片或组件资源，然后手动保存工程。',
      )
    }
    if (!hasZipSignature(input.bytes)) {
      throw new DesktopOperationError(
        'RECOVERY_ARCHIVE_INVALID',
        '自动恢复保存失败',
        '恢复数据不是有效的课件工程包。',
        '请立即手动保存工程；若问题持续出现，请重新启动编辑器。',
      )
    }

    const identity = peekProjectIdentityFromArchive(input.bytes)
    if (identity?.schemaVersion === 8) {
      throw new DesktopOperationError(
        'RECOVERY_BACKEND_UNSUPPORTED',
        '自动恢复保存失败',
        '旧版课件不能作为默认恢复副本。',
        '请通过“导入旧版工程”显式迁移后另存，再继续编辑。',
      )
    }

    const savedAt = Date.now()
    const digest = crypto.createHash('sha256').update(input.bytes).digest('hex')
    const metadata: RecoveryMetadataFile = {
      version: RECOVERY_METADATA_VERSION,
      projectName: input.projectName,
      projectPath: input.projectPath ? path.resolve(input.projectPath) : undefined,
      savedAt,
      sha256: digest,
      ...(identity?.projectId ? { projectId: identity.projectId } : {}),
      ...(identity?.revision !== null && identity?.revision !== undefined
        ? { revision: identity.revision }
        : {}),
      ...(identity?.updatedAt ? { updatedAt: identity.updatedAt } : {}),
      ...(identity?.schemaVersion !== null && identity?.schemaVersion !== undefined
        ? { schemaVersion: identity.schemaVersion }
        : {}),
    }

    try {
      await atomicWrite(recoveryPackagePath(), input.bytes)
      await atomicWrite(
        recoveryMetadataPath(),
        `${JSON.stringify(metadata, null, 2)}\n`,
      )
    } catch (error) {
      throw new DesktopOperationError(
        'RECOVERY_WRITE_FAILED',
        '自动恢复保存失败',
        '编辑器未能写入本地恢复数据。',
        '请检查磁盘空间并立即手动保存工程。',
        { cause: error },
      )
    }
  })
}

export function readRecoveryProject(): Promise<RecoveryProjectResult | null> {
  return withPersistenceLock(async () => {
    const packagePath = recoveryPackagePath()
    let stats
    try {
      stats = await fs.stat(packagePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      return null
    }
    if (
      !stats.isFile() ||
      stats.size <= 0 ||
      stats.size > MAX_RECOVERY_PROJECT_BYTES
    ) {
      await clearRecoveryProjectUnsafe()
      return null
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await fs.readFile(packagePath))
    } catch {
      return null
    }
    if (!hasZipSignature(bytes)) {
      await clearRecoveryProjectUnsafe()
      return null
    }

    const digest = crypto.createHash('sha256').update(bytes).digest('hex')
    const rawMetadata = await readJsonFile(recoveryMetadataPath(), MAX_RECENT_FILE_BYTES)
    const metadata = parseRecoveryMetadata(rawMetadata)
    const matchingMetadata = metadata?.sha256 === digest ? metadata : null
    const identity = peekProjectIdentityFromArchive(bytes)
    if (identity?.schemaVersion === 8) {
      return null
    }
    if (matchingMetadata?.projectPath && identity?.schemaVersion === 9) {
      const official = await peekOfficialIdentity(matchingMetadata.projectPath)
      if (official && officialIsNewerThanRecovery(official, identity)) {
        await clearRecoveryProjectUnsafe()
        return null
      }
    }
    return {
      projectName: matchingMetadata?.projectName ?? '恢复的课件.h5lesson',
      projectPath: matchingMetadata?.projectPath,
      savedAt: matchingMetadata?.savedAt ?? stats.mtimeMs,
      bytes,
    }
  })
}

async function clearRecoveryProjectUnsafe(): Promise<void> {
  await Promise.all([
    fs.unlink(recoveryPackagePath()).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    }),
    fs.unlink(recoveryMetadataPath()).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    }),
  ])
}

export function clearRecoveryProject(): Promise<void> {
  return withPersistenceLock(async () => {
    try {
      await clearRecoveryProjectUnsafe()
    } catch (error) {
      throw new DesktopOperationError(
        'RECOVERY_CLEAR_FAILED',
        '恢复数据清理失败',
        '编辑器未能清理已经处理的恢复数据。',
        '请重新启动编辑器后再试。',
        { cause: error },
      )
    }
  })
}
