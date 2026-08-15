import { _electron as electron, expect, test } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import {
  addSlidePresentationState,
  addSlideTextLayer,
  createCourseProject,
  updateCourseProject,
} from '../../src/renderer/course/courseStudioModel'
import { createCourseProjectArchive } from '../../src/renderer/project/courseProjectArchive'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(tmpdir(), `ittoedu-v9-trial-run-${process.pid}`)
const userDataDirectory = join(runDirectory, 'electron-profile')
const projectPath = join(runDirectory, 'trial-run.h5lesson')
const NOW = '2026-08-15T10:00:00.000Z'

interface EditorHandle {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
}

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

function expectCleanRenderer(editor: EditorHandle): void {
  expect(editor.pageErrors, 'renderer page errors').toEqual([])
  expect(editor.consoleErrors, 'renderer console errors').toEqual([])
}

test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  const initial = createCourseProject({
    id: 'v9-trial-run-e2e',
    title: '当前位置试运行纵切',
    now: NOW,
  })
  const surface = initial.surfaces[0]!
  if (surface.type !== 'slide') throw new Error('Initial Slide surface is missing')
  const sceneId = surface.scenes[0]!.id
  const withText = addSlideTextLayer(initial, surface.id, sceneId, '点我揭示', {
    id: 'trial-text',
    x: 120,
    y: 120,
    label: '揭示按钮',
    now: NOW,
  })
  const withState = addSlidePresentationState(withText, surface.id, sceneId, '揭示', {
    id: 'state_reveal',
    now: NOW,
  })
  const project = updateCourseProject(withState, (draft) => {
    const draftSurface = draft.surfaces[0]!
    if (draftSurface.type !== 'slide') throw new Error('Slide surface is missing')
    draftSurface.scenes[0]!.interactions.push({
      id: 'rule-reveal',
      enabled: true,
      trigger: { type: 'node.click', nodeId: 'trial-text' },
      conditions: [{ type: 'presentation.in', stateIds: ['state_initial'] }],
      actions: [{
        id: 'step-reveal',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'presentation.set', stateId: 'state_reveal' },
      }],
    })
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

test('trial-runs the current location, exits cleanly, and keeps authoring undoable', async () => {
  test.slow()
  const editor = await launchEditor()
  try {
    await editor.app.evaluate(({ dialog }, values) => {
      dialog.showOpenDialog = async (): Promise<Electron.OpenDialogReturnValue> => ({
        canceled: false,
        filePaths: [values.open],
      })
    }, { open: projectPath })
    await editor.page.getByRole('button', {
      name: '打开工程（Ctrl+O）',
      exact: true,
    }).click()
    await expect(editor.page.locator('.app-main')).not.toHaveAttribute('inert', '')
    await expect(editor.page.locator('.runtime-preview-loading')).toHaveCount(0)
    await editor.page.getByTestId('canvas-stage').locator('canvas').waitFor()
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    await editor.page.getByRole('button', {
      name: '当前位置试运行',
      exact: true,
    }).click()
    const trialFrame = editor.page.frameLocator('[data-testid="trial-run-frame"]')
    const surface = trialFrame.locator('.slide-surface')
    await expect(surface).toBeVisible()
    await expect(surface).toHaveAttribute('data-state-id', 'state_initial')

    await trialFrame.locator('[data-layer-item-id="trial-text"]').click()
    await expect(surface).toHaveAttribute('data-state-id', 'state_reveal')
    // The trial run is a throwaway snapshot: it must never dirty the project.
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    await editor.page.getByTestId('trial-run-exit').click()
    await expect(editor.page.getByTestId('trial-run-frame')).toHaveCount(0)
    await expect(editor.page.getByRole('button', {
      name: '编辑状态',
      exact: true,
    })).toHaveAttribute('aria-pressed', 'true')

    await editor.page.getByRole('tab', { name: '元素' }).click()
    await editor.page.getByTestId('add-text').click()
    const nodesTab = editor.page.getByTestId('nodes-tab')
    await expect(nodesTab.getByText('文本', { exact: true })).toBeVisible()
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await editor.page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
    await expect(nodesTab.getByText('文本', { exact: true })).toHaveCount(0)

    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})
