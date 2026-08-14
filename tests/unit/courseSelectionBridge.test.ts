import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearCurrentCourseSelection,
  editorProcessIsAlive,
  publishCurrentCourseSelection,
  readCurrentCourseSelection,
} from '../../src/main/courseSelectionBridge'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('local current-course selection bridge', () => {
  it('atomically publishes and clears a stable AI reference without touching the project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'course-selection-'))
    roots.push(root)
    const file = join(root, 'selection.json')
    const state = await publishCurrentCourseSelection({
      projectPath: join(root, 'lesson.h5lesson'),
      dirty: true,
      reference: {
        protocolVersion: 1,
        projectId: 'course-1',
        projectRevision: 4,
        layoutRevision: 4,
        hitId: 'diagnostic-only',
        authoringAddress: 'courseware://authoring/course-1/scene/surface/scene/native/title?field=text',
        kind: 'text',
        label: '标题',
        currentValue: '抛物线',
      },
    }, file)

    expect(editorProcessIsAlive(state.editorProcessId)).toBe(true)
    expect((await readCurrentCourseSelection(file))?.reference?.authoringAddress)
      .toBe(state.reference?.authoringAddress)
    expect((await readCurrentCourseSelection(file))?.dirty).toBe(true)
    await clearCurrentCourseSelection(file)
    expect(await readCurrentCourseSelection(file)).toBeNull()
  })
})
