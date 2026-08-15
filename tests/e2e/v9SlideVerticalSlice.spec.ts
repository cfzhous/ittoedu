import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import sharp from 'sharp'
import { openCourseProjectArchive } from '../../src/renderer/project/courseProjectArchive'
import {
  V9_SLIDE_TEST_QUERY,
  V9_SLIDE_TEST_TEXT_ID,
} from '../../src/renderer/course/v9SlideVerticalSlice'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(tmpdir(), `ittoedu-v05-${process.pid}`)
const userDataDirectory = join(runDirectory, 'electron-profile')
const projectPath = join(runDirectory, 'v9-slide-roundtrip.h5lesson')
const evidenceDirectory = join(root, 'test-results', 'v05')
const screenshotPath = join(evidenceDirectory, 'v9-slide-reopened-1366x768.png')

interface LaunchedEditor {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
  externalRequests: string[]
}

async function launchEditor(): Promise<LaunchedEditor> {
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
    await app.context().addInitScript((query) => {
      if (location.protocol === 'courseware-editor:') {
        history.replaceState(null, '', query)
      }
    }, V9_SLIDE_TEST_QUERY)
    const page = await app.firstWindow()
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    const externalRequests: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('request', (request) => {
      if (/^https?:/iu.test(request.url())) externalRequests.push(request.url())
    })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('.app-shell').waitFor()
    await page.getByTestId('canvas-stage').locator('canvas').waitFor()
    await expect.poll(() => page.evaluate(() => location.search)).toBe(V9_SLIDE_TEST_QUERY)
    const initialStateButton = page.locator('.scene-state-card').filter({
      has: page.locator('.scene-state-card__name', { hasText: '初始' }),
    })
    await initialStateButton.click()
    await expect(initialStateButton).toHaveAttribute('aria-pressed', 'true')
    const retry = page.getByRole('button', { name: '重新载入画布', exact: true })
    if (await retry.count()) await retry.click()
    await expect(page.locator('.runtime-preview-loading')).toHaveCount(0)
    await page.evaluate(() => document.fonts.ready)
    return { app, page, pageErrors, consoleErrors, externalRequests }
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
    dialog.showOpenDialog = async (): Promise<Electron.OpenDialogReturnValue> => {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
      return {
        canceled: !values.open,
        filePaths: values.open ? [values.open] : [],
      }
    }
    dialog.showSaveDialog = async (): Promise<Electron.SaveDialogReturnValue> => ({
      canceled: !values.save,
      filePath: values.save ?? '',
    })
  }, paths)
}

async function resizeContent(
  app: ElectronApplication,
  page: Page,
  width: number,
  height: number,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    if (actual.width === width && actual.height === height) return
    const expected = await app.evaluate(({ BrowserWindow }, correction) => {
      const window = BrowserWindow.getAllWindows()[0]
      if (!window) throw new Error('Editor BrowserWindow is missing')
      const [outerWidth, outerHeight] = window.getSize()
      window.setSize(
        Math.max(1, outerWidth + correction.width),
        Math.max(1, outerHeight + correction.height),
        false,
      )
      const [contentWidth, contentHeight] = window.getContentSize()
      return { width: contentWidth, height: contentHeight }
    }, { width: width - actual.width, height: height - actual.height })
    await expect.poll(() => page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
    }))).toEqual(expected)
  }
  await expect.poll(() => page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }))).toEqual({ width, height })
}

function readTextFrame(path: string): {
  revision: number
  x: number
  y: number
  layerItemId: string
} {
  const archive = openCourseProjectArchive(readFileSync(path))
  expect(archive.project.schemaVersion).toBe(9)
  const surface = archive.project.surfaces.find((candidate) => candidate.type === 'slide')
  if (!surface || surface.type !== 'slide') throw new Error('Saved V9 Slide surface is missing')
  const item = surface.scenes[0]?.layerItems.find((candidate) => (
    candidate.layerItemId === V9_SLIDE_TEST_TEXT_ID
  ))
  if (!item || item.kind !== 'native' || item.content.nativeType !== 'text') {
    throw new Error('Saved V9 Native text is missing')
  }
  expect(item.content.data.text).toBe('V9 可移动文字')
  return {
    revision: archive.project.revision,
    x: item.frame.x,
    y: item.frame.y,
    layerItemId: item.layerItemId,
  }
}

async function waitForTextFrame(
  revision: number,
): Promise<ReturnType<typeof readTextFrame>> {
  await expect.poll(() => {
    if (!existsSync(projectPath)) return -1
    try {
      return readTextFrame(projectPath).revision
    } catch {
      return -1
    }
  }).toBe(revision)
  return readTextFrame(projectPath)
}

async function playerTextCentroid(page: Page): Promise<{ x: number; y: number }> {
  await expect(page.locator('.runtime-preview-loading')).toHaveCount(0)
  const image = await page.locator('.runtime-preview-frame').screenshot({
    scale: 'css',
  })
  const { data, info } = await sharp(image)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const top = Math.floor(info.height * 250 / 720)
  const bottom = Math.ceil(info.height * 550 / 720)
  let count = 0
  let totalX = 0
  let totalY = 0
  for (let y = top; y < bottom; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels
      const red = data[offset]!
      const green = data[offset + 1]!
      const blue = data[offset + 2]!
      if (red > 160 || green > 160 || blue > 160) continue
      count += 1
      totalX += x
      totalY += y
    }
  }
  expect(count, 'Player should render the V9 text in the center crop').toBeGreaterThan(20)
  return {
    x: totalX / count * 1280 / info.width,
    y: totalY / count * 720 / info.height,
  }
}

async function dragText(
  page: Page,
  frame: { x: number; y: number },
  delta: { x: number; y: number },
): Promise<void> {
  const stage = page.getByTestId('canvas-stage')
  const box = await stage.boundingBox()
  if (!box) throw new Error('Canvas stage has no bounds')
  const scaleX = box.width / 1280
  const scaleY = box.height / 720
  const start = {
    x: box.x + (frame.x + 120) * scaleX,
    y: box.y + (frame.y + 40) * scaleY,
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

function expectCleanRenderer(editor: LaunchedEditor): void {
  expect(editor.pageErrors, 'renderer page errors').toEqual([])
  expect(editor.consoleErrors, 'renderer console errors').toEqual([])
  expect(editor.externalRequests, 'editor must remain offline').toEqual([])
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  mkdirSync(evidenceDirectory, { recursive: true })
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

test('moves, undoes, redoes, saves and reopens one V9 text in the original App', async () => {
  test.slow()
  let editor = await launchEditor()
  try {
    await resizeContent(editor.app, editor.page, 1366, 768)
    await expect.poll(() => editor.page.title()).not.toContain(' * - ')
    const initialVisual = await playerTextCentroid(editor.page)

    await dragText(editor.page, { x: 440, y: 320 }, { x: 100, y: 67 })
    await expect.poll(() => editor.page.title()).toContain(' * - ')
    const movedVisual = await playerTextCentroid(editor.page)
    expect(Math.abs(movedVisual.x - initialVisual.x - 100)).toBeLessThanOrEqual(4)
    expect(Math.abs(movedVisual.y - initialVisual.y - 67)).toBeLessThanOrEqual(4)

    await editor.page.keyboard.press('Control+z')
    await expect.poll(() => editor.page.title()).not.toContain(' * - ')
    const undoneVisual = await playerTextCentroid(editor.page)
    expect(Math.abs(undoneVisual.x - initialVisual.x)).toBeLessThanOrEqual(4)
    expect(Math.abs(undoneVisual.y - initialVisual.y)).toBeLessThanOrEqual(4)
    await patchProjectDialogs(editor.app, { save: projectPath })
    await editor.page.keyboard.press('Control+s')
    const undone = await waitForTextFrame(1)
    expect(undone).toEqual({
      revision: 1,
      x: 440,
      y: 320,
      layerItemId: V9_SLIDE_TEST_TEXT_ID,
    })

    await editor.page.keyboard.press('Control+y')
    await expect.poll(() => editor.page.title()).toContain(' * - ')
    const redoneVisual = await playerTextCentroid(editor.page)
    expect(Math.abs(redoneVisual.x - movedVisual.x)).toBeLessThanOrEqual(4)
    expect(Math.abs(redoneVisual.y - movedVisual.y)).toBeLessThanOrEqual(4)
    await editor.page.keyboard.press('Control+s')
    const redone = await waitForTextFrame(2)
    expect(redone.layerItemId).toBe(V9_SLIDE_TEST_TEXT_ID)
    expect(Math.abs(redone.x - 540)).toBeLessThanOrEqual(2)
    expect(Math.abs(redone.y - 387)).toBeLessThanOrEqual(2)
    await expect.poll(() => editor.page.title()).not.toContain(' * - ')
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }

  editor = await launchEditor()
  try {
    await resizeContent(editor.app, editor.page, 1366, 768)
    await patchProjectDialogs(editor.app, { open: projectPath, save: projectPath })
    await editor.page.getByRole('button', {
      name: '打开工程（Ctrl+O）',
      exact: true,
    }).click()
    const statusBar = editor.page.locator('.status-bar')
    await expect(statusBar).toContainText('正在处理…')
    await expect(statusBar).not.toContainText('正在处理…')
    await expect.poll(() => editor.page.title()).not.toContain(' * - ')
    await expect(editor.page.locator('.runtime-preview-loading')).toHaveCount(0)

    await editor.page.screenshot({ path: screenshotPath, fullPage: false, scale: 'css' })

    const reopened = readTextFrame(projectPath)
    await dragText(editor.page, reopened, { x: 30, y: 20 })
    await expect.poll(() => editor.page.title()).toContain(' * - ')
    await editor.page.keyboard.press('Control+s')
    const movedAgain = await waitForTextFrame(3)
    expect(movedAgain.layerItemId).toBe(V9_SLIDE_TEST_TEXT_ID)
    expect(Math.abs(movedAgain.x - (reopened.x + 30))).toBeLessThanOrEqual(2)
    expect(Math.abs(movedAgain.y - (reopened.y + 20))).toBeLessThanOrEqual(2)
    await expect.poll(() => editor.page.title()).not.toContain(' * - ')
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})
