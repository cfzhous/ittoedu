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
import {
  materializeNativeLayerItem,
} from '../../src/shared/courseProjectSchema'
import { sceneNodeToCourseLayerItem } from '../../src/shared/courseProjectModel'
import {
  addSlideScene,
  createCourseProject,
  updateCourseProject,
} from '../../src/renderer/course/courseStudioModel'
import { createTextNode } from '../../src/renderer/project/createProject'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '../../src/renderer/project/courseProjectArchive'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(tmpdir(), `ittoedu-v9-surface-scope-${process.pid}`)
const userDataDirectory = join(runDirectory, 'electron-profile')
const sourceProjectPath = join(runDirectory, 'surface-scope-source.h5lesson')
const savedProjectPath = join(runDirectory, 'surface-scope-roundtrip.h5lesson')
const NOW = '2026-08-15T11:00:00.000Z'
const SHARED_TEXT_ID = 'surface-scope-shared-text'
const SHARED_TEXT_ORDER = 23
const INITIAL_NAME = '场景间共用提示'

interface EditorHandle {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
}

interface SharedTextSnapshot {
  revision: number
  layerItemId: string
  order: number
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
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
    await expect.poll(() => page.evaluate(() => location.search)).toBe('')
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

async function openProject(editor: EditorHandle, path: string): Promise<void> {
  await patchProjectDialogs(editor.app, { open: path })
  await editor.page.getByRole('button', {
    name: '打开工程（Ctrl+O）',
    exact: true,
  }).click()
  await expect(editor.page.locator('.app-main')).not.toHaveAttribute('inert', '')
  await expect(editor.page.getByRole('button', { name: '重命名课件' }))
    .toContainText('共用层真实纵切')
  await expect(editor.page.locator('.runtime-preview-loading')).toHaveCount(0)
  await editor.page.getByTestId('canvas-stage').locator('canvas').waitFor()
}

function readSharedText(path: string): SharedTextSnapshot {
  const archive = openCourseProjectArchive(readFileSync(path))
  expect(archive.project.schemaVersion).toBe(9)
  const surface = archive.project.surfaces.find((candidate) => candidate.type === 'slide')
  if (!surface || surface.type !== 'slide') throw new Error('Saved Slide surface is missing')
  const item = surface.surfaceLayerItems.find(
    (entry) => entry.item.layerItemId === SHARED_TEXT_ID,
  )?.item
  if (
    !item ||
    item.kind !== 'native' ||
    item.content.nativeType !== 'text'
  ) {
    throw new Error('Saved shared Native text is missing')
  }
  const node = materializeNativeLayerItem(item)
  if (node.type !== 'text') throw new Error('Saved shared item is not text')
  return {
    revision: archive.project.revision,
    layerItemId: item.layerItemId,
    order: item.order,
    name: node.name,
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
  }
}

async function waitForSharedText(path: string): Promise<SharedTextSnapshot> {
  await expect.poll(() => {
    if (!existsSync(path)) return false
    try {
      readSharedText(path)
      return true
    } catch {
      return false
    }
  }).toBe(true)
  return readSharedText(path)
}

function expectStableSharedText(
  actual: SharedTextSnapshot,
  expected: SharedTextSnapshot,
): void {
  expect(actual).toMatchObject({
    layerItemId: expected.layerItemId,
    order: expected.order,
    name: expected.name,
    width: expected.width,
    height: expected.height,
    rotation: expected.rotation,
  })
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(1)
}

async function expectPlayerRendersSharedText(page: Page): Promise<void> {
  const playerRoot = page.frameLocator('.runtime-preview-frame').locator('html')
  await expect.poll(() => playerRoot.evaluate((_, layerItemId) => {
    const handle = window.__H5_LESSON_PLAYER__?.playerScene.renderedNodes.find(
      (candidate) => candidate.id === layerItemId,
    )
    return handle
      ? {
          type: handle.type,
          visible: handle.root.visible,
          active: handle.root.active,
          alpha: handle.root.alpha,
        }
      : null
  }, SHARED_TEXT_ID)).toEqual({
    type: 'text',
    visible: true,
    active: true,
    alpha: 1,
  })
}

async function inspectSurfaceSharedText(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '图层' }).click()
  const sharedRow = page.getByTestId(
    `effective-layer-item-surface-${SHARED_TEXT_ID}`,
  )
  await expect(sharedRow).toHaveAttribute('data-layer-view-only', 'true')
  await expect(sharedRow).toHaveAttribute('data-layer-effective-visible', 'true')
  await expect(sharedRow).toContainText(INITIAL_NAME)
  await expect(sharedRow).toContainText('当前内容共用')
  await expect(sharedRow.getByRole('status')).toContainText(
    '会在当前内容的多个页面中出现；当前仅可查看影响范围',
  )
  await sharedRow.locator('.node-item__effective-select').click()
  await expect(page.locator('.status-bar')).toContainText(
    '该共用内容当前仅可查看影响范围',
  )
}

async function saveAs(editor: EditorHandle, path: string): Promise<void> {
  await patchProjectDialogs(editor.app, { save: path })
  await editor.page.getByTitle('更多工程操作').click()
  await editor.page.getByRole('menuitem', { name: /另存为/ }).click()
  await expect.poll(() => existsSync(path)).toBe(true)
  await expect.poll(() => editor.page.evaluate(() => (
    window.__COURSEWARE_EDITOR_DIRTY__
  ))).toBe(false)
}

async function expectNoProtocolLeak(page: Page): Promise<void> {
  const visibleText = await page.locator('body').innerText()
  for (const forbidden of [
    'Project V8',
    'Project V9',
    'Native',
    'Runtime API',
    'Component API',
    'Layer Item ID',
  ]) {
    expect(visibleText).not.toContain(forbidden)
  }
}

function expectCleanRenderer(editor: EditorHandle): void {
  expect(editor.pageErrors, 'renderer page errors').toEqual([])
  expect(editor.consoleErrors, 'renderer console errors').toEqual([])
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  let project = createCourseProject({
    id: 'v9-surface-scope-e2e',
    title: '共用层真实纵切',
    now: NOW,
  })
  const surface = project.surfaces.find((candidate) => candidate.type === 'slide')
  if (!surface || surface.type !== 'slide') throw new Error('Initial Slide surface is missing')
  project = addSlideScene(project, surface.id, {
    id: 'surface-scope-scene-two',
    name: '共享验证场景',
    now: NOW,
  })
  project = updateCourseProject(project, (draft) => {
    const slide = draft.surfaces.find((candidate) => candidate.id === surface.id)
    if (!slide || slide.type !== 'slide') throw new Error('Initial Slide surface is missing')
    slide.surfaceLayerItems.push({
      item: sceneNodeToCourseLayerItem(createTextNode({
        id: SHARED_TEXT_ID,
        name: INITIAL_NAME,
        text: '这条提示在两个场景中共用',
        x: 180,
        y: 140,
        width: 440,
        height: 80,
        style: {
          color: '#111827',
          fontSize: 40,
          bold: true,
          overflow: 'fixed',
        },
      }), SHARED_TEXT_ORDER),
      visibility: { mode: 'all', locationIds: [] },
    })
  }, NOW)
  writeFileSync(sourceProjectPath, createCourseProjectArchive({
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

test('shows one shared surface text across scenes and a complete reopen', async () => {
  test.slow()
  const sourceBytes = readFileSync(sourceProjectPath)
  const initial = readSharedText(sourceProjectPath)
  expect(initial).toMatchObject({
    layerItemId: SHARED_TEXT_ID,
    order: SHARED_TEXT_ORDER,
    name: INITIAL_NAME,
    x: 180,
    y: 140,
  })

  let editor = await launchEditor()
  let firstSaved: SharedTextSnapshot
  try {
    await openProject(editor, sourceProjectPath)
    await expect(editor.page.locator('.toolbar__scene-index')).toHaveText('场景 1 / 2')
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    await expectNoProtocolLeak(editor.page)
    // P2-05 intentionally removes separate shared-layer author pages. A
    // non-controller surface item remains visible for impact inspection only.
    await expect(editor.page.getByTestId('global-layer-entry')).toHaveCount(0)
    await expect(editor.page.getByTestId('surface-layer-entry')).toHaveCount(0)
    await inspectSurfaceSharedText(editor.page)
    await expectPlayerRendersSharedText(editor.page)

    await editor.page.getByRole('group', {
      name: '场景 2：共享验证场景',
    }).getByRole('button', {
      name: /打开场景“共享验证场景”/,
    }).click()
    await expect(editor.page.locator('.toolbar__scene-index')).toHaveText('场景 2 / 2')
    await expectPlayerRendersSharedText(editor.page)
    await inspectSurfaceSharedText(editor.page)

    await saveAs(editor, savedProjectPath)
    firstSaved = await waitForSharedText(savedProjectPath)
    expect(firstSaved.revision).toBe(initial.revision)
    expectStableSharedText(firstSaved, {
      ...initial,
    })
    expect(readFileSync(sourceProjectPath)).toEqual(sourceBytes)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }

  editor = await launchEditor()
  try {
    await openProject(editor, savedProjectPath)
    await expect(editor.page.locator('.toolbar__scene-index')).toHaveText('场景 1 / 2')
    await expectNoProtocolLeak(editor.page)
    const reopened = readSharedText(savedProjectPath)
    expectStableSharedText(reopened, firstSaved)
    expect(reopened.revision).toBe(initial.revision)
    await expect(editor.page.getByTestId('global-layer-entry')).toHaveCount(0)
    await expect(editor.page.getByTestId('surface-layer-entry')).toHaveCount(0)
    await inspectSurfaceSharedText(editor.page)
    await expectPlayerRendersSharedText(editor.page)

    await editor.page.getByRole('group', {
      name: '场景 2：共享验证场景',
    }).getByRole('button', {
      name: /打开场景“共享验证场景”/,
    }).click()
    await expect(editor.page.locator('.toolbar__scene-index')).toHaveText('场景 2 / 2')
    await inspectSurfaceSharedText(editor.page)
    await expectPlayerRendersSharedText(editor.page)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})
