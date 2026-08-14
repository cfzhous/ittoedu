import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { patchCourseProjectFile } from '../../scripts/patch-course-project'
import { createCourseProject } from '@/renderer/course/courseStudioModel'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '@/renderer/project/courseProjectArchive'
import { deriveCourseProjectAuthoringInventorySnapshot } from '@/shared/courseProjectModel'
import { publishCurrentCourseSelection } from '@/main/courseSelectionBridge'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true,
  })))
})

describe('closed Course Project patch command', () => {
  it('stages, reopens and atomically replaces one revision plus its offline HTML', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'course-patch-'))
    directories.push(directory)
    const projectPath = join(directory, 'project.h5lesson')
    const htmlPath = join(directory, 'course.html')
    const patchPath = join(directory, 'patch.json')
    const bundlePath = join(directory, 'player.iife.js')
    const selectionPath = join(directory, 'current-selection.json')
    const project = createCourseProject({
      id: 'patch-course',
      title: 'Patch course',
      now: '2026-08-14T00:00:00.000Z',
    })
    const inventory = deriveCourseProjectAuthoringInventorySnapshot(project)
    const authoringAddress = Object.entries(inventory.entries).find(([, entry]) => (
      entry.label === '教师控制器标题'
    ))?.[0]
    expect(authoringAddress).toBeTruthy()
    await Promise.all([
      writeFile(projectPath, createCourseProjectArchive({
        project,
        assetFiles: {},
        componentFiles: {},
      })),
      writeFile(bundlePath, 'window.__COURSE_PATCH_TEST_PLAYER__=true;', 'utf8'),
      writeFile(patchPath, JSON.stringify({
        op: 'replace',
        expectedRevision: 0,
        authoringAddress,
        expectedValue: '教师控制台',
        value: '精确修改后的控制器',
      }), 'utf8'),
    ])

    const result = await patchCourseProjectFile({
      projectPath,
      patchPath,
      htmlPath,
      playerBundlePath: bundlePath,
    })
    expect(result).toMatchObject({
      projectId: 'patch-course',
      previousRevision: 0,
      revision: 1,
      authoringAddress,
    })
    const reopened = openCourseProjectArchive(new Uint8Array(await readFile(projectPath)))
    expect(reopened.project.revision).toBe(1)
    const controller = reopened.project.globalLayerItems[0]?.item
    expect(controller?.kind === 'native' && controller.content.nativeType === 'teacher-controller'
      ? controller.content.data.title
      : null).toBe('精确修改后的控制器')
    const html = await readFile(htmlPath, 'utf8')
    expect(html).toContain('精确修改后的控制器')
    expect(html).toContain('window.__COURSE_PATCH_TEST_PLAYER__=true')

    const beforeProject = await readFile(projectPath)
    const beforeHtml = await readFile(htmlPath)
    await expect(patchCourseProjectFile({
      projectPath,
      patchPath,
      htmlPath,
      playerBundlePath: bundlePath,
    })).rejects.toThrow(/revision 0.*当前为 1/)
    expect(await readFile(projectPath)).toEqual(beforeProject)
    expect(await readFile(htmlPath)).toEqual(beforeHtml)

    await publishCurrentCourseSelection({
      projectPath,
      dirty: true,
      reference: null,
    }, selectionPath)
    await expect(patchCourseProjectFile({
      projectPath,
      patchPath,
      htmlPath,
      playerBundlePath: bundlePath,
      selectionFilePath: selectionPath,
    })).rejects.toThrow(/正在 Course Studio 中打开且有未保存修改.*应用 AI Patch/)
    expect(await readFile(projectPath)).toEqual(beforeProject)
    expect(await readFile(htmlPath)).toEqual(beforeHtml)
  })
})
