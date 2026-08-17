import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, FrameLocator, Page } from 'playwright'
import {
  addCourseSurface,
  createCourseProject,
  updateCourseProject,
} from '../../src/renderer/course/courseStudioModel'
import { createCourseProjectArchive } from '../../src/renderer/project/courseProjectArchive'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(tmpdir(), `ittoedu-v9-mixed-trial-${process.pid}`)
const userDataDirectory = join(runDirectory, 'electron-profile')
const projectPath = join(runDirectory, 'mixed-trial.h5lesson')
const NOW = '2026-08-16T09:00:00.000Z'
const SLIDE_SURFACE_ID = 'slide:v9-mixed-trial-e2e'
const FLOW_SURFACE_ID = 'mixed-trial-flow'
const SPATIAL_SURFACE_ID = 'mixed-trial-spatial'

interface EditorHandle {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
}

interface MixedTrialFixture {
  slideLocationId: string
  flowLocationId: string
  spatialLocationId: string
}

let fixture: MixedTrialFixture

async function launchEditor(): Promise<EditorHandle> {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDirectory}`],
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      COURSEWARE_E2E_BACKGROUND: '1',
    },
  })
  try {
    const page = await app.firstWindow()
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('.app-shell').waitFor()
    await page.getByTestId('canvas-stage').locator('canvas').waitFor()
    await expect(page.locator('.runtime-preview-loading')).toHaveCount(0)
    return { app, page, pageErrors, consoleErrors }
  } catch (error) {
    await closeEditor(app)
    throw error
  }
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

async function openProject(editor: EditorHandle): Promise<void> {
  await editor.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async (): Promise<Electron.OpenDialogReturnValue> => ({
      canceled: false,
      filePaths: [path],
    })
  }, projectPath)
  await editor.page.getByRole('button', {
    name: '打开工程（Ctrl+O）',
    exact: true,
  }).click()
  await expect(editor.page.locator('.app-main')).not.toHaveAttribute('inert', '')
  await expect(editor.page.getByRole('button', { name: '重命名课件' }))
    .toContainText('Mixed 当前位置试运行')
  await expect(editor.page.locator('.runtime-preview-loading')).toHaveCount(0)
  await editor.page.getByTestId('spatial-workspace').waitFor()
}

function expectCleanRenderer(editor: EditorHandle): void {
  expect(editor.pageErrors, 'renderer page errors').toEqual([])
  expect(editor.consoleErrors, 'renderer console errors').toEqual([])
}

async function openCourseDirectory(frame: FrameLocator) {
  // TeacherControllerDom intentionally handles pointer input at its parent
  // surface. Its visual button children have pointer-events:none, so force
  // lets Playwright send the genuine pointer sequence to that parent hit area.
  await frame.getByRole('button', { name: '场景目录', exact: true }).click({ force: true })
  const dialog = frame.getByRole('dialog', { name: '课程内容', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  let project = createCourseProject({
    id: 'v9-mixed-trial-e2e',
    title: 'Mixed 当前位置试运行',
    now: NOW,
  })
  project = addCourseSurface(project, 'flow', {
    id: FLOW_SURFACE_ID,
    title: '讲义位置',
    now: NOW,
  })
  project = addCourseSurface(project, 'spatial-2d', {
    id: SPATIAL_SURFACE_ID,
    title: '空间位置',
    now: NOW,
  })

  const slide = project.locations.find((location) => location.kind === 'slide-scene')
  const flow = project.locations.find((location) => location.surfaceId === FLOW_SURFACE_ID)
  const spatial = project.locations.find((location) => location.surfaceId === SPATIAL_SURFACE_ID)
  if (!slide || !flow || !spatial) throw new Error('Mixed Trial fixture locations are missing')
  fixture = {
    slideLocationId: slide.id,
    flowLocationId: flow.id,
    spatialLocationId: spatial.id,
  }

  project = updateCourseProject(project, (draft) => {
    const draftSlide = draft.locations.find((location) => location.id === fixture.slideLocationId)
    const draftFlow = draft.locations.find((location) => location.id === fixture.flowLocationId)
    const draftSpatial = draft.locations.find((location) => location.id === fixture.spatialLocationId)
    if (!draftSlide || !draftFlow || !draftSpatial) throw new Error('Mixed Trial locations changed unexpectedly')
    // Keep the canonical navigation order obvious in the actual delivery UI.
    draftSlide.label = '幻灯片 · 开场'
    draftFlow.label = '讲义 · 要点'
    draftSpatial.label = '空间 · 总览'
    draft.startLocationId = fixture.spatialLocationId
  }, NOW)

  writeFileSync(projectPath, createCourseProjectArchive({
    project,
    assetFiles: {},
    componentFiles: {},
  }, { mtime: new Date(NOW) }))
})

test.afterAll(async () => {
  const resolvedRunDirectory = resolve(runDirectory)
  const resolvedTempRoot = resolve(tmpdir())
  if (!resolvedRunDirectory.startsWith(`${resolvedTempRoot}\\`)) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolvedRunDirectory}`)
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(resolvedRunDirectory, { recursive: true, force: true })
      return
    } catch (error) {
      if (attempt === 19) throw error
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
    }
  }
})

test('trial-runs a V9 Mixed course from Spatial with controller progress, audio and directory navigation', async ({}, testInfo) => {
  test.slow()
  const editor = await launchEditor()
  try {
    await openProject(editor)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    // The selected Spatial camera is the actual authoring position, so trial
    // must enter it rather than falling back to the first Slide location.
    await editor.page.getByTestId('workspace-spatial-trial-run').click()
    const trial = editor.page.frameLocator('[data-testid="trial-run-frame"]')
    const spatialSurface = trial.locator('.spatial-surface')
    await expect(spatialSurface).toBeVisible()
    await expect(spatialSurface).toHaveAttribute('data-surface-id', SPATIAL_SURFACE_ID)

    const spatialController = spatialSurface.locator('.spatial-screen-teacher-controller')
    await expect(spatialController.locator('.slide-teacher-controller-progress'))
      .toHaveText('3 / 3 · 空间 · 总览')
    await expect(spatialController.getByRole('button', { name: '声音 · 开', exact: true }))
      .toBeVisible()
    await spatialController.getByRole('button', { name: '声音 · 开', exact: true })
      .click({ force: true })
    await expect(spatialController.getByRole('button', { name: '声音 · 关', exact: true }))
      .toBeVisible()

    let directory = await openCourseDirectory(trial)
    const entries = directory.locator('.lesson-scene-picker__item')
    await expect(entries).toHaveCount(3)
    const directoryEntries = await entries.evaluateAll((nodes) => nodes.map((node) => ({
      locationId: (node as HTMLElement).dataset.locationId,
      kind: (node as HTMLElement).dataset.kind,
      text: (node.textContent ?? '').replace(/\s+/g, ' ').trim(),
    })))
    expect(directoryEntries).toEqual([
      { locationId: fixture.slideLocationId, kind: 'slide-scene', text: '01幻灯片幻灯片 · 开场' },
      { locationId: fixture.flowLocationId, kind: 'flow-block', text: '02讲义讲义 · 要点' },
      { locationId: fixture.spatialLocationId, kind: 'spatial-camera', text: '03空间空间 · 总览' },
    ])

    await directory.locator(`[data-location-id="${fixture.slideLocationId}"]`).click()
    const slideSurface = trial.locator(
      `.course-surface-host[data-surface-id="${SLIDE_SURFACE_ID}"] .slide-surface`,
    )
    await expect(slideSurface).toBeVisible()
    await expect(trial.locator(`.course-surface-host[data-surface-id="${SPATIAL_SURFACE_ID}"]`))
      .toBeHidden()

    directory = await openCourseDirectory(trial)
    await directory.locator(`[data-location-id="${fixture.flowLocationId}"]`).click()
    const flowSurface = trial.locator(
      `.course-surface-host[data-surface-id="${FLOW_SURFACE_ID}"] .flow-surface-stack`,
    )
    await expect(flowSurface).toBeVisible()

    directory = await openCourseDirectory(trial)
    await directory.locator(`[data-location-id="${fixture.spatialLocationId}"]`).click()
    await expect(spatialSurface).toBeVisible()
    await expect(spatialController.locator('.slide-teacher-controller-progress'))
      .toHaveText('3 / 3 · 空间 · 总览')
    await expect(spatialController.getByRole('button', { name: '声音 · 关', exact: true }))
      .toBeVisible()

    const screenshotPath = testInfo.outputPath('mixed-trial-spatial.png')
    await spatialSurface.screenshot({ path: screenshotPath })
    expect(existsSync(screenshotPath), 'Mixed Trial screenshot').toBe(true)
    await testInfo.attach('mixed-trial-spatial', {
      path: screenshotPath,
      contentType: 'image/png',
    })

    // A trial run is a throwaway published snapshot, never a course mutation.
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})
