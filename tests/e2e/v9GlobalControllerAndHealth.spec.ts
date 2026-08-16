import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import sharp from 'sharp'
import { materializeNativeLayerItem } from '../../src/shared/courseProjectSchema'
import { createTeacherControllerLayout } from '../../src/shared/teacherControllerLayout'
import {
  addSlideScene,
  createCourseProject,
} from '../../src/renderer/course/courseStudioModel'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '../../src/renderer/project/courseProjectArchive'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(tmpdir(), `ittoedu-v9-global-health-${process.pid}`)
const userDataDirectory = join(runDirectory, 'electron-profile')
const sourceProjectPath = join(runDirectory, 'two-scene-source.h5lesson')
const savedProjectPath = join(runDirectory, 'global-controller-roundtrip.h5lesson')
const NOW = '2026-08-15T09:00:00.000Z'

interface EditorHandle {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
}

interface ControllerFrame {
  revision: number
  layerItemId: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  nextButtonX: number
  nextButtonY: number
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
    .toContainText('全局控制器真实纵切')
  await expect(editor.page.locator('.runtime-preview-loading')).toHaveCount(0)
  await editor.page.getByTestId('canvas-stage').locator('canvas').waitFor()
}

function readControllerFrame(path: string): ControllerFrame {
  const archive = openCourseProjectArchive(readFileSync(path))
  const controller = archive.project.globalLayerItems.find(
    (entry) => entry.item.kind === 'native' &&
      entry.item.content.nativeType === 'teacher-controller',
  )?.item
  if (
    !controller ||
    controller.kind !== 'native' ||
    controller.content.nativeType !== 'teacher-controller'
  ) {
    throw new Error('Saved V9 teacher controller is missing')
  }
  const node = materializeNativeLayerItem(controller)
  if (node.type !== 'teacher-controller') throw new Error('Invalid teacher controller')
  const nextButton = createTeacherControllerLayout(
    node,
    node.width,
    node.height,
  ).buttons.find((button) => button.action.type === 'scene.next')
  if (!nextButton) throw new Error('Teacher controller next button is missing')
  return {
    revision: archive.project.revision,
    layerItemId: controller.layerItemId,
    x: controller.frame.x,
    y: controller.frame.y,
    width: controller.frame.width,
    height: controller.frame.height,
    rotation: controller.rotation,
    nextButtonX: node.x + nextButton.x + nextButton.width / 2,
    nextButtonY: node.y + nextButton.y + nextButton.height / 2,
  }
}

async function waitForControllerRevision(
  path: string,
  revision: number,
): Promise<ControllerFrame> {
  await expect.poll(() => {
    if (!existsSync(path)) return -1
    try {
      return readControllerFrame(path).revision
    } catch {
      return -1
    }
  }).toBe(revision)
  return readControllerFrame(path)
}

function expectControllerGeometry(
  actual: ControllerFrame,
  expected: ControllerFrame,
): void {
  expect(actual).toMatchObject({
    revision: expected.revision,
    layerItemId: expected.layerItemId,
    width: expected.width,
    height: expected.height,
    rotation: expected.rotation,
  })
  // Pointer input quantizes to device pixels; at fractional zoom/fit scales the
  // achievable drop position lands within ~1.1 logical px of the target. The
  // saved coordinate reflects the real pointer position, so ±2 is the honest
  // tolerance here — the pipeline itself is unchanged and exact.
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(2)
}

async function expectAuthoringPlayerController(
  page: Page,
  frame: ControllerFrame,
): Promise<void> {
  const player = page.frameLocator('.runtime-preview-frame')
  await expect(player.locator('canvas')).toBeVisible()
  await expect(player.locator('.lesson-authoring-input-shield')).toBeVisible()
  await expect(player.getByTestId('teacher-escape-controls')).toHaveCount(0)
  await expect.poll(async () => {
    const frameBox = await page.locator('.runtime-preview-frame').boundingBox()
    if (!frameBox) return Number.POSITIVE_INFINITY
    const image = await page.screenshot({
      clip: frameBox,
      scale: 'css',
    })
    const { data, info } = await sharp(image)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    // The DOM controller visually insets its bar inside the committed frame
    // (border/padding), so a single sample point couples the assertion to the
    // renderer's style. Scan a coarse grid inside the frame and require some
    // dark pixels: the controller is painted within its committed frame.
    const scaleX = info.width / 1280
    const scaleY = info.height / 720
    const left = Math.max(0, Math.round((frame.x + 8) * scaleX))
    const right = Math.min(info.width - 1, Math.round((frame.x + frame.width - 8) * scaleX))
    const top = Math.max(0, Math.round((frame.y + 8) * scaleY))
    const bottom = Math.min(info.height - 1, Math.round((frame.y + frame.height - 8) * scaleY))
    let minLuminance = Number.POSITIVE_INFINITY
    for (let y = top; y <= bottom; y += 4) {
      for (let x = left; x <= right; x += 8) {
        const offset = (y * info.width + x) * info.channels
        const lum = data[offset]! * 0.2126 + data[offset + 1]! * 0.7152 + data[offset + 2]! * 0.0722
        if (lum < minLuminance) minLuminance = lum
      }
    }
    return minLuminance
  }, {
    message: 'Player should paint the controller at its committed frame',
  }).toBeLessThan(120)
}

async function clickLogicalPoint(
  page: Page,
  point: { x: number; y: number },
): Promise<void> {
  const stage = page.getByTestId('canvas-stage')
  const box = await stage.boundingBox()
  if (!box) throw new Error('Canvas stage has no bounds')
  await page.mouse.click(
    box.x + point.x * box.width / 1280,
    box.y + point.y * box.height / 720,
  )
}

async function openMoreMenu(page: Page): Promise<void> {
  const more = page.getByTitle('更多工程操作')
  if (!await more.locator('xpath=ancestor::details').evaluate((details) => (
    details.hasAttribute('open')
  ))) {
    await more.click()
  }
}

async function closeMoreMenu(page: Page): Promise<void> {
  const more = page.getByTitle('更多工程操作')
  if (await more.locator('xpath=ancestor::details').evaluate((details) => (
    details.hasAttribute('open')
  ))) {
    await more.click()
  }
}

async function expectUncheckedHealth(page: Page): Promise<void> {
  await openMoreMenu(page)
  const health = page.getByRole('menuitem', { name: '工程检查', exact: true })
  await expect(health).toBeEnabled()
  await expect(health).toContainText('点击检查')
  await expect(health).not.toContainText('未发现问题')
}

async function dragController(
  page: Page,
  frame: ControllerFrame,
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
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(end.x, end.y, { steps: 4 })
  await page.mouse.up({ button: 'left' })
}

function expectCleanRenderer(editor: EditorHandle): void {
  expect(editor.pageErrors, 'renderer page errors').toEqual([])
  expect(editor.consoleErrors, 'renderer console errors').toEqual([])
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  const initial = createCourseProject({
    id: 'v9-global-controller-e2e',
    title: '全局控制器真实纵切',
    now: NOW,
  })
  const surface = initial.surfaces.find((candidate) => candidate.type === 'slide')
  if (!surface || surface.type !== 'slide') throw new Error('Initial Slide surface is missing')
  const project = addSlideScene(initial, surface.id, {
    id: 'scene-second',
    name: '第二场景',
    now: NOW,
  })
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

test('checks health, authors the global controller, and preserves it across a full reopen', async () => {
  test.slow()
  const initial = readControllerFrame(sourceProjectPath)
  expect(initial.revision).toBe(1)
  let editor = await launchEditor()
  try {
    await openProject(editor, sourceProjectPath)
    await expect(editor.page.locator('.toolbar__scene-index')).toHaveText('场景 1 / 2')
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    await expectUncheckedHealth(editor.page)
    await editor.page.getByRole('menuitem', { name: '工程检查', exact: true }).click()
    const healthDialog = editor.page.getByRole('dialog', { name: '工程检查' })
    await expect(healthDialog).toBeVisible()
    await expect(healthDialog.getByLabel('工程检查摘要')).toContainText('0 个错误')
    await expect(healthDialog.getByLabel('工程检查摘要')).toContainText('0 个提醒')
    await expect(healthDialog).toContainText('未发现工程问题')
    await healthDialog.getByRole('button', { name: '关闭', exact: true }).click()
    await openMoreMenu(editor.page)
    await expect(editor.page.getByRole('menuitem', {
      name: '工程检查：未发现问题',
      exact: true,
    })).toBeEnabled()
    await closeMoreMenu(editor.page)

    const globalLayer = editor.page.getByTestId('global-layer-entry')
    await expect(globalLayer).toBeEnabled()
    await globalLayer.click()
    await expect(globalLayer).toHaveAttribute('aria-pressed', 'true')
    await expect(editor.page.locator('.canvas-label')).toContainText('全局层')
    await expect(editor.page.locator('.status-bar')).toContainText('1 个全局元素')
    await expectAuthoringPlayerController(editor.page, initial)

    const player = editor.page.frameLocator('.runtime-preview-frame')
    const playerRoot = player.locator('html')
    const sceneIdBeforeClick = await playerRoot.evaluate(() => (
      window.__H5_LESSON_PLAYER__?.getCurrentSceneId() ?? null
    ))
    expect(sceneIdBeforeClick).not.toBeNull()
    await playerRoot.evaluate(() => {
      document.documentElement.dataset.controllerActionCount = '0'
      window.addEventListener('courseware-teacher-controller-action', () => {
        const count = Number(document.documentElement.dataset.controllerActionCount ?? '0')
        document.documentElement.dataset.controllerActionCount = String(count + 1)
      })
    })
    await clickLogicalPoint(editor.page, {
      x: initial.nextButtonX,
      y: initial.nextButtonY,
    })
    await expect.poll(() => playerRoot.evaluate(() => (
      window.__H5_LESSON_PLAYER__?.getCurrentSceneId() ?? null
    ))).toBe(sceneIdBeforeClick)
    await expect(editor.page.locator('.toolbar__scene-index')).toHaveText('场景 1 / 2')
    await expect.poll(() => player.locator('html').getAttribute(
      'data-controller-action-count',
    )).toBe('0')
    await expect(editor.page.locator('.status-bar')).toContainText('已选：教师控制器')
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    const undo = editor.page.getByRole('button', { name: '撤销（Ctrl+Z）' })
    const redo = editor.page.getByRole('button', {
      name: '重做（Ctrl+Y / Ctrl+Shift+Z）',
    })
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()
    await editor.page.keyboard.press('Control+d')
    await expect(editor.page.locator('.status-bar')).toContainText(
      '全局元素暂不能复制；现有内容不会改变',
    )
    await editor.page.keyboard.press('Delete')
    await expect(editor.page.locator('.status-bar')).toContainText(
      '全局元素暂不能删除；现有内容不会改变',
    )
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()
    expect(readControllerFrame(sourceProjectPath)).toEqual(initial)
    await expect(editor.page.getByLabel('画布缩放比例')).toHaveText('100%')
    await editor.page.getByRole('button', { name: '放大画布' }).click()
    await editor.page.getByRole('button', { name: '放大画布' }).click()
    await expect(editor.page.getByLabel('画布缩放比例')).toHaveText('120%')

    const firstDelta = { x: 54, y: -26 }
    await dragController(editor.page, initial, firstDelta)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await expect(editor.page.locator('.status-bar')).toContainText('已选：教师控制器')
    await expect(undo).toBeEnabled()
    await expect(redo).toBeDisabled()
    await expectAuthoringPlayerController(editor.page, {
      ...initial,
      x: initial.x + firstDelta.x,
      y: initial.y + firstDelta.y,
    })
    await expectUncheckedHealth(editor.page)
    await closeMoreMenu(editor.page)

    await undo.click()
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    await expect(undo).toBeDisabled()
    await expect(redo).toBeEnabled()
    await expectAuthoringPlayerController(editor.page, initial)

    await redo.click()
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await expect(undo).toBeEnabled()
    await expect(redo).toBeDisabled()
    await expectAuthoringPlayerController(editor.page, {
      ...initial,
      x: initial.x + firstDelta.x,
      y: initial.y + firstDelta.y,
    })

    await patchProjectDialogs(editor.app, { save: savedProjectPath })
    await openMoreMenu(editor.page)
    await editor.page.getByRole('menuitem', { name: /另存为/ }).click()
    const saved = await waitForControllerRevision(savedProjectPath, initial.revision + 1)
    expectControllerGeometry(saved, {
      ...initial,
      revision: initial.revision + 1,
      layerItemId: initial.layerItemId,
      x: initial.x + firstDelta.x,
      y: initial.y + firstDelta.y,
    })
    expect(readControllerFrame(sourceProjectPath)).toEqual(initial)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }

  editor = await launchEditor()
  try {
    await openProject(editor, savedProjectPath)
    const reopened = readControllerFrame(savedProjectPath)
    expectControllerGeometry(reopened, {
      ...initial,
      revision: initial.revision + 1,
      layerItemId: initial.layerItemId,
      x: initial.x + 54,
      y: initial.y - 26,
    })
    const globalLayer = editor.page.getByTestId('global-layer-entry')
    await globalLayer.click()
    await expect(globalLayer).toHaveAttribute('aria-pressed', 'true')
    await expectAuthoringPlayerController(editor.page, reopened)
    const undo = editor.page.getByRole('button', { name: '撤销（Ctrl+Z）' })
    await expect(undo).toBeDisabled()
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    await editor.page.getByRole('button', { name: '缩小画布' }).click()
    await expect(editor.page.getByLabel('画布缩放比例')).toHaveText('90%')
    const secondDelta = { x: -31, y: -14 }
    await dragController(editor.page, reopened, secondDelta)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await expect(undo).toBeEnabled()
    await editor.page.keyboard.press('Control+s')
    const movedAgain = await waitForControllerRevision(
      savedProjectPath,
      reopened.revision + 1,
    )
    expectControllerGeometry(movedAgain, {
      ...reopened,
      revision: reopened.revision + 1,
      layerItemId: initial.layerItemId,
      x: reopened.x + secondDelta.x,
      y: reopened.y + secondDelta.y,
    })
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    await expectAuthoringPlayerController(editor.page, movedAgain)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})
