import { constants as fsConstants } from 'node:fs'
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  editorProcessIsAlive,
  readCurrentCourseSelection,
} from '../src/main/courseSelectionBridge'
import { parseComponentPackageFiles } from '../src/renderer/components/importComponentPackage'
import { applyCourseAuthoringPatch, type CourseAuthoringPatch } from '../src/renderer/course/courseStudioModel'
import { buildPublishedCourseStandaloneHtml } from '../src/renderer/export/course/buildCoursePackages'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
  type CourseProjectArchiveData,
} from '../src/renderer/project/courseProjectArchive'

interface PatchCourseProjectOptions {
  projectPath: string
  patchPath: string
  htmlPath?: string
  playerBundlePath?: string
  /** Testable override; the CLI always reads the editor's well-known bridge. */
  selectionFilePath?: string
}

export interface PatchCourseProjectResult {
  projectPath: string
  htmlPath: string
  projectId: string
  previousRevision: number
  revision: number
  authoringAddress: string
}

function parseArgs(values: readonly string[]): PatchCourseProjectOptions {
  const result: Record<string, string> = {}
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) {
      throw new Error('用法：patch-course-project --project FILE --patch FILE [--html FILE] [--player-bundle FILE]')
    }
    result[key.slice(2)] = value
    index += 1
  }
  if (!result.project || !result.patch) {
    throw new Error('必须提供 --project 与 --patch。')
  }
  return {
    projectPath: result.project,
    patchPath: result.patch,
    ...(result.html ? { htmlPath: result.html } : {}),
    ...(result['player-bundle'] ? { playerBundlePath: result['player-bundle'] } : {}),
  }
}

function parsePatch(value: unknown): CourseAuthoringPatch {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Patch 必须是 JSON 对象。')
  }
  const candidate = value as Record<string, unknown>
  if (
    candidate.op !== 'replace' ||
    !Number.isSafeInteger(candidate.expectedRevision) ||
    (candidate.expectedRevision as number) < 0 ||
    typeof candidate.authoringAddress !== 'string' ||
    !candidate.authoringAddress
  ) {
    throw new Error('Patch 必须包含 op=replace、非负 expectedRevision 与 authoringAddress。')
  }
  return candidate as unknown as CourseAuthoringPatch
}

async function exists(path: string): Promise<boolean> {
  return access(path, fsConstants.F_OK).then(() => true, () => false)
}

function temporaryPath(target: string, label: string): string {
  return `${target}.${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`
}

async function moveReplacingWithRollback(
  stagedProject: string,
  projectPath: string,
  stagedHtml: string,
  htmlPath: string,
): Promise<void> {
  const projectBackup = temporaryPath(projectPath, 'backup')
  const htmlBackup = temporaryPath(htmlPath, 'backup')
  const htmlExisted = await exists(htmlPath)
  let htmlInstalled = false
  let projectBackedUp = false
  let projectInstalled = false
  try {
    if (htmlExisted) await rename(htmlPath, htmlBackup)
    await rename(stagedHtml, htmlPath)
    htmlInstalled = true
    await rename(projectPath, projectBackup)
    projectBackedUp = true
    await rename(stagedProject, projectPath)
    projectInstalled = true
    await rm(projectBackup, { force: true })
    if (htmlExisted) await rm(htmlBackup, { force: true })
  } catch (error) {
    if (projectInstalled) await rm(projectPath, { force: true }).catch(() => undefined)
    if (projectBackedUp) await rename(projectBackup, projectPath).catch(() => undefined)
    if (htmlInstalled) await rm(htmlPath, { force: true }).catch(() => undefined)
    if (htmlExisted) await rename(htmlBackup, htmlPath).catch(() => undefined)
    throw error
  } finally {
    await rm(stagedProject, { force: true }).catch(() => undefined)
    await rm(stagedHtml, { force: true }).catch(() => undefined)
  }
}

function publishSources(data: CourseProjectArchiveData) {
  return {
    project: data.project,
    assetFiles: data.assetFiles,
    components: Object.fromEntries(Object.entries(data.componentFiles).map(([key, files]) => [
      key,
      parseComponentPackageFiles(files),
    ])),
  }
}

/**
 * Applies exactly one revision-protected authoring patch to a closed V9 archive.
 * Both the archive and its default standalone HTML are staged and validated
 * before the authority file is replaced; any replacement failure rolls back.
 */
export async function patchCourseProjectFile(
  options: PatchCourseProjectOptions,
): Promise<PatchCourseProjectResult> {
  const projectPath = resolve(options.projectPath)
  if (extname(projectPath).toLocaleLowerCase('en-US') !== '.h5lesson') {
    throw new Error('只支持 Course Project V9 .h5lesson 工程。')
  }
  // A malformed selection bridge is a safety failure, not evidence that the
  // editor is closed. Refuse to guess before replacing an authority archive.
  const openEditor = await readCurrentCourseSelection(options.selectionFilePath)
  const sameOpenProject = openEditor && editorProcessIsAlive(openEditor.editorProcessId) &&
    resolve(openEditor.projectPath ?? '').toLocaleLowerCase('en-US') ===
      projectPath.toLocaleLowerCase('en-US')
  if (sameOpenProject) {
    throw new Error(
      `工程正在 Course Studio 中打开${openEditor.dirty ? '且有未保存修改' : ''}。` +
      '请在编辑器中使用“应用 AI Patch”，以便纳入 Undo/Redo；关闭工程后才可使用磁盘 Patch CLI。',
    )
  }
  const patchPath = resolve(options.patchPath)
  const htmlPath = options.htmlPath
    ? resolve(options.htmlPath)
    : resolve(dirname(projectPath), 'course.html')
  const playerBundlePath = resolve(options.playerBundlePath ?? 'dist-player/player.iife.js')
  const [archiveBytes, patchBytes, playerBundle] = await Promise.all([
    readFile(projectPath),
    readFile(patchPath, 'utf8'),
    readFile(playerBundlePath, 'utf8'),
  ])
  const opened = openCourseProjectArchive(new Uint8Array(archiveBytes))
  const patch = parsePatch(JSON.parse(patchBytes) as unknown)
  const previousRevision = opened.project.revision
  const project = applyCourseAuthoringPatch(opened.project, patch)
  const next: CourseProjectArchiveData = { ...opened, project }
  const nextArchive = createCourseProjectArchive(next, {
    mtime: new Date('1980-01-01T00:00:00.000Z'),
  })
  // Reopen the exact bytes that will be installed; do not validate a side model.
  const reopened = openCourseProjectArchive(nextArchive)
  if (reopened.project.revision !== previousRevision + 1) {
    throw new Error('Patch 后工程 revision 未按预期推进。')
  }
  const html = buildPublishedCourseStandaloneHtml(publishSources(reopened), playerBundle)
  if (!html.includes('window.__H5_COURSE_PAYLOAD__=') || /<(?:img|audio|video)[^>]+(?:src|poster)=["']https?:/i.test(html)) {
    throw new Error('Patch 后离线 HTML 未通过资源闭包检查。')
  }

  await Promise.all([mkdir(dirname(projectPath), { recursive: true }), mkdir(dirname(htmlPath), { recursive: true })])
  const stagedProject = temporaryPath(projectPath, 'patch')
  const stagedHtml = temporaryPath(htmlPath, 'patch')
  try {
    await Promise.all([writeFile(stagedProject, nextArchive), writeFile(stagedHtml, html, 'utf8')])
    // Confirm staging did not truncate either artifact before any destination move.
    if ((await stat(stagedProject)).size !== nextArchive.byteLength || (await stat(stagedHtml)).size === 0) {
      throw new Error('Patch 临时文件写入不完整。')
    }
    await moveReplacingWithRollback(stagedProject, projectPath, stagedHtml, htmlPath)
  } finally {
    await Promise.all([rm(stagedProject, { force: true }), rm(stagedHtml, { force: true })])
  }
  return {
    projectPath,
    htmlPath,
    projectId: project.id,
    previousRevision,
    revision: project.revision,
    authoringAddress: patch.authoringAddress,
  }
}

async function main(): Promise<void> {
  const result = await patchCourseProjectFile(parseArgs(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
