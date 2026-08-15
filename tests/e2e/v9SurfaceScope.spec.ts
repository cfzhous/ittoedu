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
const UPDATED_NAME = '所有场景共用提示'

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

async function dragSharedText(
  page: Page,
  frame: SharedTextSnapshot,
  delta: { x: number; y: number },
): Promise<void> {
  const stage = page.getByTestId('canvas-stage')
  const box = await stage.boundingBox()
  if (!box) throw new Error('Canvas stage has no bounds')
  const scaleX = box.width / 1280
  const scaleY = box.height / 720
  const start = {
    x: box.x + (frame.x + frame.width / 2) * scaleX,
    y: box.y + (frame.y + frame.height / 2) * scaleY,
  }
  const end = {
    x: start.x + delta.x * scaleX,
    y: start.y + delta.y * scaleY,
  }
  await page.mouse.move(start.x, start.y)
  await expect.poll(() => stage.locator('canvas').evaluate((canvas) => (
    getComputedStyle(canvas).cursor
  ))).toBe('move')
  // Alt is the product's explicit free-move modifier. It keeps this coordinate
  // regression independent from alignment-guide snapping while still using
  // the real Phaser pointer path at the requested zoom.
  await page.keyboard.down('Alt')
  try {
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(end.x, end.y, { steps: 4 })
    await page.mouse.up({ button: 'left' })
  } finally {
    await page.keyboard.up('Alt')
  }
}

async function enterSurfaceScope(page: Page): Promise<void> {
  const entry = page.getByTestId('surface-layer-entry')
  await expect(entry).toBeEnabled()
  await entry.click()
  await expect(entry).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.canvas-label')).toContainText('当前内容共用')
  await expect(page.locator('.status-bar')).toContainText('1 个共用元素')
  await expect(page.locator('.runtime-preview-loading')).toHaveCount(0)
}

async function setZoom(page: Page, expected: '120%' | '90%'): Promise<void> {
  const zoom = page.getByLabel('画布缩放比例')
  await expect(zoom).toHaveText('100%')
  if (expected === '120%') {
    await page.getByRole('button', { name: '放大画布' }).click()
    await page.getByRole('button', { name: '放大画布' }).click()
  } else {
    await page.getByRole('button', { name: '缩小画布' }).click()
  }
  await expect(zoom).toHaveText(expected)
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

test('authors one shared surface text across scenes and a complete reopen', async () => {
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
    await enterSurfaceScope(editor.page)
    await expectPlayerRendersSharedText(editor.page)

    const undo = editor.page.getByRole('button', { name: '撤销（Ctrl+Z）' })
    const redo = editor.page.getByRole('button', {
      name: '重做（Ctrl+Y / Ctrl+Shift+Z）',
    })
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()
    await setZoom(editor.page, '120%')

    // Reuse the pixel-grid-aligned deltas from the controller zoom regression.
    // This keeps the archive assertion at ±1 logical px without masking
    // CSS-to-pointer rounding behind a wider tolerance.
    const firstDelta = { x: 54, y: -26 }
    await dragSharedText(editor.page, initial, firstDelta)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await expect(editor.page.locator('.status-bar')).toContainText(`已选：${INITIAL_NAME}`)
    await expect(undo).toBeEnabled()
    await expect(redo).toBeDisabled()

    await undo.click()
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    await expect(undo).toBeDisabled()
    await expect(redo).toBeEnabled()
    await expectPlayerRendersSharedText(editor.page)

    await redo.click()
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await expect(undo).toBeEnabled()
    await expect(redo).toBeDisabled()
    await expectPlayerRendersSharedText(editor.page)

    await editor.page.getByRole('tab', { name: '属性' }).click()
    const properties = editor.page.getByTestId('properties-tab')
    await expect(properties).toContainText('修改会应用到当前内容内的所有场景')
    const name = properties.getByLabel('名称', { exact: true })
    await name.fill(UPDATED_NAME)
    await name.press('Enter')
    await expect(name).toHaveValue(UPDATED_NAME)

    await editor.page.getByRole('group', {
      name: '场景 2：共享验证场景',
    }).getByRole('button', {
      name: /打开场景“共享验证场景”/,
    }).click()
    await expect(editor.page.locator('.toolbar__scene-index')).toHaveText('场景 2 / 2')
    await expectPlayerRendersSharedText(editor.page)
    await enterSurfaceScope(editor.page)
    await editor.page.getByRole('tab', { name: '图层' }).click()
    await expect(editor.page.getByText(UPDATED_NAME, { exact: true })).toBeVisible()

    await saveAs(editor, savedProjectPath)
    firstSaved = await waitForSharedText(savedProjectPath)
    expect(firstSaved.revision).toBeGreaterThan(initial.revision)
    expectStableSharedText(firstSaved, {
      ...initial,
      revision: firstSaved.revision,
      name: UPDATED_NAME,
      x: initial.x + firstDelta.x,
      y: initial.y + firstDelta.y,
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
    await enterSurfaceScope(editor.page)
    await expectPlayerRendersSharedText(editor.page)
    await editor.page.getByRole('tab', { name: '图层' }).click()
    await editor.page.getByText(UPDATED_NAME, { exact: true }).click()
    await editor.page.getByRole('tab', { name: '属性' }).click()
    await expect(editor.page.getByTestId('properties-tab').getByLabel('名称', {
      exact: true,
    })).toHaveValue(UPDATED_NAME)

    await setZoom(editor.page, '90%')
    const secondDelta = { x: -31, y: -14 }
    await dragSharedText(editor.page, reopened, secondDelta)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await editor.page.keyboard.press('Control+s')
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    const movedAgain = await waitForSharedText(savedProjectPath)
    expect(movedAgain.revision).toBe(reopened.revision + 1)
    expectStableSharedText(movedAgain, {
      ...reopened,
      revision: reopened.revision + 1,
      x: reopened.x + secondDelta.x,
      y: reopened.y + secondDelta.y,
    })
    await expectPlayerRendersSharedText(editor.page)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})
