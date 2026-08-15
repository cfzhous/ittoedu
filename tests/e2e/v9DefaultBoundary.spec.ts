import { _electron as electron, expect, test } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import { strFromU8, unzipSync } from 'fflate'
import {
  addCourseSurface,
  createCourseProject,
  updateCourseProject,
} from '../../src/renderer/course/courseStudioModel'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '../../src/renderer/project/courseProjectArchive'
import { createProject } from '../../src/renderer/project/createProject'
import { createProjectArchive } from '../../src/renderer/project/projectArchive'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(tmpdir(), `ittoedu-v9-default-${process.pid}`)
const defaultProfile = join(runDirectory, 'default-profile')
const surfaceProfile = join(runDirectory, 'surface-profile')
const legacyRecoveryProfile = join(runDirectory, 'legacy-recovery-profile')
const legacyPath = join(runDirectory, 'legacy-source.h5lesson')
const recentSeedPath = join(runDirectory, 'recent-seed.h5lesson')
const importedPath = join(runDirectory, 'legacy-imported.h5lesson')
const recoveredLegacyPath = join(runDirectory, 'legacy-recovered.h5lesson')
const flowPath = join(runDirectory, 'flow-start.h5lesson')
const spatialPath = join(runDirectory, 'spatial-start.h5lesson')
const publishedHtmlPath = join(runDirectory, 'published-course.html')
const publishedWebPath = join(runDirectory, 'published-course.zip')
const publishedPptxPath = join(runDirectory, 'published-course.pptx')
const NOW = '2026-08-15T08:00:00.000Z'

interface EditorHandle {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
}

async function launchEditor(
  userDataDirectory: string,
  options: { waitForCanvas?: boolean } = {},
): Promise<EditorHandle> {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDirectory}`],
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      COURSEWARE_E2E_BACKGROUND: '1',
    },
  })
  const page = await app.firstWindow()
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.app-shell').waitFor()
  await expect.poll(() => page.evaluate(() => location.search)).toBe('')
  if (options.waitForCanvas) {
    await page.getByTestId('canvas-stage').locator('canvas').waitFor()
    await expect(page.locator('.runtime-preview-loading')).toHaveCount(0)
  }
  return { app, page, pageErrors, consoleErrors }
}

async function closeEditor(app: ElectronApplication): Promise<void> {
  const child = app.process()
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
    setTimeout(() => electronApp.exit(0), 0)
  }).catch(() => undefined)
  await Promise.race([
    app.close().catch(() => undefined),
    new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5_000)),
  ])
  if (child.exitCode === null) child.kill()
}

async function patchProjectDialogs(
  app: ElectronApplication,
  paths: { open?: string; save?: string },
): Promise<void> {
  await app.evaluate(({ dialog }, values) => {
    dialog.showOpenDialog = async (): Promise<Electron.OpenDialogReturnValue> => ({
      canceled: !values.open,
      filePaths: values.open ? [values.open] : [],
    })
    dialog.showSaveDialog = async (): Promise<Electron.SaveDialogReturnValue> => ({
      canceled: !values.save,
      filePath: values.save ?? '',
    })
  }, paths)
}

async function openProject(
  editor: EditorHandle,
  path: string,
): Promise<void> {
  await patchProjectDialogs(editor.app, { open: path })
  await editor.page.getByRole('button', {
    name: '打开工程（Ctrl+O）',
    exact: true,
  }).click()
  await expect(editor.page.locator('.app-main')).not.toHaveAttribute('inert', '')
}

function writeUnavailableLocationArchive(
  path: string,
  kind: 'flow-block' | 'spatial-camera',
): void {
  let project = createCourseProject({
    id: `default-boundary-${kind}`,
    title: kind === 'flow-block' ? '流程安全门禁' : '空间安全门禁',
    now: NOW,
  })
  project = addCourseSurface(
    project,
    kind === 'flow-block' ? 'flow' : 'spatial-2d',
    { id: `surface-${kind}`, now: NOW },
  )
  const location = project.locations.find((candidate) => candidate.kind === kind)
  if (!location) throw new Error(`Missing ${kind} location`)
  project = updateCourseProject(project, (draft) => {
    draft.startLocationId = location.id
  }, NOW)
  writeFileSync(path, createCourseProjectArchive({
    project,
    assetFiles: {},
    componentFiles: {},
  }, { mtime: new Date(NOW) }))
}

async function expectEditableMultiSurface(
  editor: EditorHandle,
  kind: 'flow-block' | 'spatial-camera',
): Promise<void> {
  if (kind === 'flow-block') {
    await expect(editor.page.locator('.flow-editor-surface')).toHaveCount(1)
    await expect(editor.page.getByTestId('scene-panel-flow-outline')).toHaveCount(1)
    await expect(editor.page.getByTestId('add-flow-surface')).toHaveCount(1)
  } else {
    await expect(editor.page.getByTestId('spatial-workspace')).toHaveCount(1)
    await expect(editor.page.getByTestId('scene-panel-spatial-frames')).toHaveCount(1)
    await expect(editor.page.getByTestId('add-spatial-surface')).toHaveCount(1)
  }
  await expect(editor.page.getByTestId('canvas-stage')).toHaveCount(0)
  await expect(editor.page.locator('.runtime-preview-loading')).toHaveCount(0)
  await expect(editor.page.getByTestId('workspace-course-location-gate')).toHaveCount(0)
  await expect(editor.page.getByTestId('scene-state-strip-course-location-gate')).toHaveCount(0)
  await expect(editor.page.getByTestId('add-scene')).toHaveCount(0)
  await expect(editor.page.getByTestId('global-layer-entry')).toHaveCount(0)
  await expect(editor.page.locator('.app-crash')).toHaveCount(0)
}

async function exerciseUnavailableShortcuts(editor: EditorHandle): Promise<void> {
  for (const shortcut of [
    'Control+a',
    'Control+c',
    'Control+d',
    'Delete',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
  ]) {
    await editor.page.keyboard.press(shortcut)
  }
  await expect.poll(() => editor.page.evaluate(() => (
    window.__COURSEWARE_EDITOR_DIRTY__
  ))).toBe(false)
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  const legacyBytes = createProjectArchive({
    project: createProject({
      id: 'legacy-default-boundary',
      title: '待导入旧课件',
      now: NOW,
    }),
    assetFiles: {},
    componentFiles: {},
  }, { mtime: new Date(NOW) })
  writeFileSync(legacyPath, legacyBytes)
  writeUnavailableLocationArchive(flowPath, 'flow-block')
  writeUnavailableLocationArchive(spatialPath, 'spatial-camera')
})

test.afterAll(() => {
  const resolvedRunDirectory = resolve(runDirectory)
  const resolvedTempRoot = resolve(tmpdir())
  if (!resolvedRunDirectory.startsWith(`${resolvedTempRoot}\\`)) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolvedRunDirectory}`)
  }
  rmSync(resolvedRunDirectory, { recursive: true, force: true })
})

test('starts on production V9, rejects normal legacy open, imports explicitly, and discards recovery safely', async () => {
  test.slow()
  const originalLegacyBytes = readFileSync(legacyPath)
  let editor = await launchEditor(defaultProfile, { waitForCanvas: true })
  let closedByLifecycle = false
  try {
    const title = editor.page.getByRole('button', { name: '重命名课件' })
    await expect(title).toContainText('未命名课件')
    await expect(title).not.toContainText('纵切测试')
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    const previewWindowPromise = editor.app.waitForEvent('window')
    await editor.page.getByRole('button', { name: '在独立窗口整课预览' }).click()
    const preview = await previewWindowPromise
    await preview.waitForLoadState('domcontentloaded')
    await preview.locator('#course-root').waitFor()
    await expect(preview.locator('.slide-surface')).toBeVisible()
    await expect(preview.locator('.course-nav')).toHaveCount(0)
    await preview.close()

    await patchProjectDialogs(editor.app, { save: publishedHtmlPath })
    await editor.page.getByLabel('导出课件').click()
    await editor.page.getByTestId('export-single-html').click()
    await expect.poll(() => existsSync(publishedHtmlPath)).toBe(true)
    const publishedHtml = readFileSync(publishedHtmlPath, 'utf8')
    expect(publishedHtml).toContain('window.__H5_COURSE_PAYLOAD__=')
    expect(publishedHtml).not.toContain('.course-nav')

    await patchProjectDialogs(editor.app, { save: publishedWebPath })
    await editor.page.getByLabel('导出课件').click()
    await editor.page.getByTestId('export-web-package').click()
    await expect.poll(() => existsSync(publishedWebPath)).toBe(true)
    const publishedWeb = unzipSync(readFileSync(publishedWebPath))
    expect(publishedWeb['index.html']).toBeDefined()
    expect(strFromU8(publishedWeb['player/player.css']!)).not.toContain('.course-nav')

    await patchProjectDialogs(editor.app, { save: publishedPptxPath })
    await editor.page.getByLabel('导出课件').click()
    await editor.page.getByTestId('export-pptx').click()
    await expect.poll(() => existsSync(publishedPptxPath)).toBe(true)
    const publishedPptx = unzipSync(readFileSync(publishedPptxPath))
    expect(publishedPptx['[Content_Types].xml']).toBeDefined()
    expect(publishedPptx['ppt/slides/slide1.xml']).toBeDefined()
    await editor.page.getByLabel('导出课件').click()
    // V9 print artifacts now supply the production PDF path; DOCX remains a
    // Flow-position export and is disabled while the current location is Slide.
    await expect(editor.page.getByTestId('export-pdf')).toBeEnabled()
    await expect(editor.page.getByTestId('export-docx')).toBeDisabled()
    await editor.page.keyboard.press('Escape')

    await openProject(editor, legacyPath)
    await expect(editor.page.getByRole('alert')).toContainText('导入旧版工程')
    await expect(title).toContainText('未命名课件')
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    expect((await editor.page.evaluate(() => window.desktopAPI?.listRecentProjects()))
      ?.some((entry) => entry.path === legacyPath)).toBe(false)

    // Simulate a recent entry persisted by an older release, then prove that
    // selecting it removes the incompatible source instead of repeatedly
    // surfacing it as a current-format project.
    await patchProjectDialogs(editor.app, { save: legacyPath })
    await editor.page.evaluate(async (bytes) => {
      await window.desktopAPI?.saveProject({
        suggestedName: 'legacy-source.h5lesson',
        bytes: Uint8Array.from(bytes),
      })
    }, [...originalLegacyBytes])
    await patchProjectDialogs(editor.app, { save: recentSeedPath })
    await editor.page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
    await expect.poll(() => existsSync(recentSeedPath)).toBe(true)
    await editor.page.getByRole('button', { name: '专业', exact: true }).click()
    await editor.page.getByTitle('打开最近工程').click()
    await editor.page.getByTitle(legacyPath).click()
    await expect(editor.page.getByRole('alert')).toContainText('导入旧版工程')
    await editor.page.getByTitle('打开最近工程').click()
    await expect(editor.page.getByTitle(legacyPath)).toHaveCount(0)
    await editor.page.getByRole('button', { name: '简洁', exact: true }).click()

    await patchProjectDialogs(editor.app, { open: legacyPath, save: importedPath })
    await editor.page.getByTitle('更多工程操作').click()
    await editor.page.getByRole('menuitem', { name: /导入旧版工程/ }).click()
    await expect(title).toContainText('待导入旧课件 *')
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await expect.poll(() => editor.page.evaluate(async () => Boolean(
      await window.desktopAPI?.readRecoveryProject()
    )), { timeout: 8_000 }).toBe(true)
    await editor.page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
    await expect.poll(() => existsSync(importedPath)).toBe(true)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    const imported = openCourseProjectArchive(readFileSync(importedPath))
    expect(imported.project.schemaVersion).toBe(9)
    expect(imported.project.title).toBe('待导入旧课件')
    expect(readFileSync(legacyPath)).toEqual(originalLegacyBytes)
    const recents = await editor.page.evaluate(() => window.desktopAPI?.listRecentProjects())
    expect(recents?.some((entry) => entry.path === legacyPath)).toBe(false)
    expect(recents?.some((entry) => entry.path === importedPath)).toBe(true)

    await title.click()
    const titleInput = editor.page.getByRole('textbox', { name: '课件名称' })
    await titleInput.fill('准备放弃的修改')
    await titleInput.press('Enter')
    await expect.poll(() => editor.page.evaluate(async () => Boolean(
      await window.desktopAPI?.readRecoveryProject()
    )), { timeout: 8_000 }).toBe(true)
    await title.click()
    await titleInput.fill('关闭前的更新')
    await titleInput.press('Enter')

    const applicationClosed = editor.app.waitForEvent('close')
    await editor.app.evaluate(({ BrowserWindow, dialog }) => {
      dialog.showMessageBoxSync = () => 1
      BrowserWindow.getAllWindows()[0]?.close()
    }).catch(() => undefined)
    await applicationClosed
    closedByLifecycle = true
  } finally {
    if (!closedByLifecycle) await closeEditor(editor.app)
  }

  editor = await launchEditor(defaultProfile, { waitForCanvas: true })
  try {
    await expect(editor.page.getByRole('button', { name: '恢复课件' })).toHaveCount(0)
    await expect.poll(() => editor.page.evaluate(async () => (
      await window.desktopAPI?.readRecoveryProject()
    ))).toBeNull()
    expect(editor.pageErrors).toEqual([])
    expect(editor.consoleErrors).toEqual([])
  } finally {
    await closeEditor(editor.app)
  }
})

test('opens Flow and Spatial start locations in their production authoring workspaces', async () => {
  test.slow()
  const editor = await launchEditor(surfaceProfile, { waitForCanvas: true })
  try {
    for (const input of [
      { path: flowPath, kind: 'flow-block' as const },
      { path: spatialPath, kind: 'spatial-camera' as const },
    ]) {
      const before = openCourseProjectArchive(readFileSync(input.path))
      await openProject(editor, input.path)
      await expectEditableMultiSurface(editor, input.kind)
      const confirmedByOpen = (await editor.page.evaluate(
        () => window.desktopAPI?.listRecentProjects(),
      ))?.find((entry) => entry.path === input.path)
      expect(confirmedByOpen).toBeDefined()
      await exerciseUnavailableShortcuts(editor)
      await editor.page.keyboard.press('Control+s')
      await expect.poll(() => editor.page.evaluate(() => (
        window.__COURSEWARE_EDITOR_DIRTY__
      ))).toBe(false)
      const saved = openCourseProjectArchive(readFileSync(input.path))
      expect(saved.project).toEqual(before.project)
      const location = saved.project.locations.find(
        (candidate) => candidate.id === saved.project.startLocationId,
      )
      expect(location?.kind).toBe(input.kind)

      if (input.kind === 'flow-block') {
        const savedRecent = (await editor.page.evaluate(
          () => window.desktopAPI?.listRecentProjects(),
        ))?.find((entry) => entry.path === input.path)
        expect(savedRecent).toBeDefined()
        await editor.page.waitForTimeout(25)
        await editor.page.getByRole('button', { name: '专业', exact: true }).click()
        await editor.page.getByTitle('打开最近工程').click()
        await editor.page.getByTitle(input.path).click()
        await expectEditableMultiSurface(editor, input.kind)
        const reopenedRecent = (await editor.page.evaluate(
          () => window.desktopAPI?.listRecentProjects(),
        ))?.find((entry) => entry.path === input.path)
        expect(reopenedRecent?.lastOpenedAt).toBeGreaterThan(
          savedRecent?.lastOpenedAt ?? 0,
        )
        await editor.page.getByRole('button', { name: '简洁', exact: true }).click()
      }

      await openProject(editor, input.path)
      await expectEditableMultiSurface(editor, input.kind)
    }
    expect(editor.pageErrors).toEqual([])
    expect(editor.consoleErrors).toEqual([])
  } finally {
    await closeEditor(editor.app)
  }
})

test('restores an old recovery copy only through the explicit migration boundary', async () => {
  test.slow()
  const legacyBytes = readFileSync(legacyPath)
  let editor = await launchEditor(legacyRecoveryProfile, { waitForCanvas: true })
  try {
    await editor.page.evaluate(async (bytes) => {
      await window.desktopAPI?.writeRecoveryProject({
        projectName: '旧版恢复副本',
        bytes: Uint8Array.from(bytes),
      })
    }, [...legacyBytes])
  } finally {
    await closeEditor(editor.app)
  }

  editor = await launchEditor(legacyRecoveryProfile)
  try {
    const recoveryButton = editor.page.getByRole('button', { name: '恢复课件' })
    await expect(recoveryButton).toBeVisible()
    await recoveryButton.click()
    await expect(recoveryButton).toHaveCount(0)
    await expect(editor.page.getByRole('button', { name: '重命名课件' }))
      .toContainText('待导入旧课件 *')
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await expect.poll(
      () => editor.page.evaluate(async () => {
        const recovery = await window.desktopAPI?.readRecoveryProject()
        return recovery ? [...recovery.bytes] : null
      }),
      { timeout: 8_000 },
    ).not.toBeNull()

    const currentRecovery = await editor.page.evaluate(async () => {
      const recovery = await window.desktopAPI?.readRecoveryProject()
      return recovery ? [...recovery.bytes] : null
    })
    expect(currentRecovery).not.toBeNull()
    expect(openCourseProjectArchive(Uint8Array.from(currentRecovery!)).project.schemaVersion)
      .toBe(9)

    await patchProjectDialogs(editor.app, { save: recoveredLegacyPath })
    await editor.page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
    await expect.poll(() => existsSync(recoveredLegacyPath)).toBe(true)
    const recovered = openCourseProjectArchive(readFileSync(recoveredLegacyPath))
    expect(recovered.project.schemaVersion).toBe(9)
    expect(recovered.project.title).toBe('待导入旧课件')
    await expect.poll(() => editor.page.evaluate(async () => (
      await window.desktopAPI?.readRecoveryProject()
    ))).toBeNull()
    expect(editor.pageErrors).toEqual([])
    expect(editor.consoleErrors).toEqual([])
  } finally {
    await closeEditor(editor.app)
  }
})
