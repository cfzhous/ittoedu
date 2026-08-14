import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import {
  AUTHORING_ADDRESS_PROTOCOL_VERSION,
  type CurrentCourseSelectionState,
  type CurrentCourseSelectionUpdate,
} from '../shared/authoringAddress'
import { CURRENT_COURSE_SELECTION_FILE_NAME } from '../shared/constants'

export function currentCourseSelectionFilePath(): string {
  return join(tmpdir(), CURRENT_COURSE_SELECTION_FILE_NAME)
}

let selectionMutation: Promise<void> = Promise.resolve()

function normalizedUpdate(
  update: CurrentCourseSelectionUpdate,
): CurrentCourseSelectionUpdate {
  return {
    projectPath: update.projectPath === null ? null : resolve(update.projectPath),
    dirty: update.dirty,
    reference: update.reference === null ? null : structuredClone(update.reference),
  }
}

async function writeCurrentCourseSelection(
  update: CurrentCourseSelectionUpdate,
  filePath = currentCourseSelectionFilePath(),
): Promise<CurrentCourseSelectionState> {
  const state: CurrentCourseSelectionState = {
    protocolVersion: AUTHORING_ADDRESS_PROTOCOL_VERSION,
    editorProcessId: process.pid,
    updatedAt: new Date().toISOString(),
    ...normalizedUpdate(update),
  }
  const target = resolve(filePath)
  const temporary = join(dirname(target), `.${CURRENT_COURSE_SELECTION_FILE_NAME}.${randomUUID()}.tmp`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
  try {
    await rename(temporary, target)
  } catch (error) {
    // Windows does not consistently replace an existing destination with
    // rename. This file is only a transient observation channel, so a short
    // absent interval is preferable to exposing partially written JSON.
    await rm(target, { force: true })
    try {
      await rename(temporary, target)
    } catch {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
  }
  return state
}

export function publishCurrentCourseSelection(
  update: CurrentCourseSelectionUpdate,
  filePath = currentCourseSelectionFilePath(),
): Promise<CurrentCourseSelectionState> {
  const result = selectionMutation.then(() => writeCurrentCourseSelection(update, filePath))
  selectionMutation = result.then(() => undefined, () => undefined)
  return result
}

async function removeCurrentCourseSelection(
  filePath = currentCourseSelectionFilePath(),
): Promise<void> {
  await rm(resolve(filePath), { force: true })
}

export function clearCurrentCourseSelection(
  filePath = currentCourseSelectionFilePath(),
): Promise<void> {
  const result = selectionMutation.then(() => removeCurrentCourseSelection(filePath))
  selectionMutation = result.then(() => undefined, () => undefined)
  return result
}

export function clearCurrentCourseSelectionSync(
  filePath = currentCourseSelectionFilePath(),
): void {
  rmSync(resolve(filePath), { force: true })
}

export async function readCurrentCourseSelection(
  filePath = currentCourseSelectionFilePath(),
): Promise<CurrentCourseSelectionState | null> {
  let text: string
  try {
    text = await readFile(resolve(filePath), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  const candidate = JSON.parse(text) as Partial<CurrentCourseSelectionState>
  if (
    candidate.protocolVersion !== AUTHORING_ADDRESS_PROTOCOL_VERSION ||
    !Number.isSafeInteger(candidate.editorProcessId) ||
    typeof candidate.updatedAt !== 'string' ||
    (candidate.projectPath !== null && typeof candidate.projectPath !== 'string') ||
    typeof candidate.dirty !== 'boolean' ||
    (candidate.reference !== null && typeof candidate.reference !== 'object')
  ) {
    throw new Error('当前编辑器选择桥文件格式无效。')
  }
  return candidate as CurrentCourseSelectionState
}

export function editorProcessIsAlive(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false
  try {
    process.kill(processId, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}
