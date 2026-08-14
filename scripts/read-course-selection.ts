import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import {
  clearCurrentCourseSelection,
  editorProcessIsAlive,
  readCurrentCourseSelection,
} from '../src/main/courseSelectionBridge'

export async function readActiveCourseSelection(): Promise<unknown> {
  const state = await readCurrentCourseSelection()
  if (!state) throw new Error('当前没有正在运行的 Course Studio 选择。')
  if (!editorProcessIsAlive(state.editorProcessId)) {
    await clearCurrentCourseSelection()
    throw new Error('Course Studio 已关闭；过期选择已清理。')
  }
  if (!state.reference) {
    throw new Error('Course Studio 正在运行，但尚未点选可精确修改的字段。')
  }
  return state
}

async function main(): Promise<void> {
  process.stdout.write(`${JSON.stringify(await readActiveCourseSelection(), null, 2)}\n`)
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  })
}
