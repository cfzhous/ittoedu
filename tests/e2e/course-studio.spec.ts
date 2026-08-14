import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Page } from 'playwright'
import {
  APP_E2E_TEMP_DIRECTORY_NAME,
} from '../../src/shared/constants'
import {
  BACKGROUND_E2E_ENV,
} from '../../src/main/windowVisibility'
import { openCourseProjectArchive } from '../../src/renderer/project/courseProjectArchive'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(
  tmpdir(),
  APP_E2E_TEMP_DIRECTORY_NAME,
  `course-studio-v9-${process.pid}`,
)
const userDataDirectory = join(runDirectory, 'electron-profile')
const projectPath = join(runDirectory, 'course-studio-roundtrip.h5lesson')
const htmlPath = join(runDirectory, 'course-studio.html')
const pdfPath = join(runDirectory, 'course-studio.pdf')
const pptxPath = join(runDirectory, 'course-studio.pptx')
const docxPath = join(runDirectory, 'course-studio-flow.docx')
const mixedProjectPath = join(
  root,
  'examples',
  'course-project-v9',
  'ecosystem-mixed',
  'project.h5lesson',
)
const screenshotPath = join(root, 'test-results', 'course-studio-v9-mixed.png')

interface LaunchedStudio {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
  externalRequests: string[]
}

async function launchStudio(): Promise<LaunchedStudio> {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDirectory}`],
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      [BACKGROUND_E2E_ENV]: '1',
    },
  })
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
  await page.getByTestId('course-studio-v9').waitFor()
  return { app, page, pageErrors, consoleErrors, externalRequests }
}

async function closeStudio(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
    setTimeout(() => electronApp.exit(0), 0)
  }).catch(() => undefined)
  await app.close().catch(() => undefined)
}

interface DialogPaths {
  projectOpen?: string
  projectSave?: string
  htmlSave?: string
  pdfSave?: string
  pptxSave?: string
  docxSave?: string
}

async function patchDialogs(app: ElectronApplication, paths: DialogPaths): Promise<void> {
  await app.evaluate(({ dialog }, values) => {
    dialog.showOpenDialog = async (): Promise<Electron.OpenDialogReturnValue> => ({
      canceled: !values.projectOpen,
      filePaths: values.projectOpen ? [values.projectOpen] : [],
    })
    dialog.showSaveDialog = async (...args:
      | [Electron.BaseWindow, Electron.SaveDialogOptions]
      | [Electron.SaveDialogOptions]
    ): Promise<Electron.SaveDialogReturnValue> => {
      const options = args.length === 1 ? args[0] : args[1]
      const title = options.title ?? ''
      const filePath = title.includes('HTML')
        ? values.htmlSave
        : title.includes('PDF')
          ? values.pdfSave
          : title.includes('PowerPoint')
            ? values.pptxSave
            : title.includes('Word')
              ? values.docxSave
              : values.projectSave
      return { canceled: !filePath, filePath: filePath ?? '' }
    }
  }, paths)
}

async function commitInput(page: Page, label: string, value: string): Promise<void> {
  const input = page.getByLabel(label)
  await input.fill(value)
  await input.press('Enter')
  await expect(input).toHaveValue(value)
}

function expectNonEmptyFile(path: string, minimumBytes: number): void {
  expect(existsSync(path), `${path} should exist`).toBe(true)
  expect(statSync(path).size, `${path} should not be empty`).toBeGreaterThan(minimumBytes)
}

function surfaceRow(page: Page, type: 'slide' | 'flow' | 'spatial-2d') {
  return page.locator('.course-surface-row').filter({
    has: page.locator(`.course-surface-badge.is-${type}`),
  })
}

function expectCleanRenderer(studio: LaunchedStudio): void {
  expect(studio.pageErrors, 'renderer page errors').toEqual([])
  expect(studio.consoleErrors, 'renderer console errors').toEqual([])
  expect(studio.externalRequests, 'editor must remain offline').toEqual([])
}

test.describe.configure({ mode: 'serial' })
test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  mkdirSync(join(root, 'test-results'), { recursive: true })
})
test.afterAll(() => {
  rmSync(runDirectory, { recursive: true, force: true })
})

test('Course Studio V9 authors, exports, saves and reopens a mixed project', async () => {
  test.slow()
  let studio = await launchStudio()
  try {
    const { app, page } = studio
    await expect(page.getByTestId('course-studio-v9')).toBeVisible()
    await expect(page.getByTestId('legacy-v8-product-route')).toHaveCount(0)
    await commitInput(page, '课程标题', 'V9 E2E 混合课程')

    // The initial surface is Slide. Author a stable Native text layer.
    await page.getByRole('button', { name: '+ 文字' }).click()
    const authoredText = page.getByTestId('course-slide-canvas').locator('.slide-native-text').filter({ hasText: '双击编辑文字' })
    await authoredText.dblclick()
    const preciseTextInput = page.getByRole('textbox', { name: '文字内容', exact: true })
    await expect(preciseTextInput).toBeFocused()
    await preciseTextInput.fill('可保存的 Slide 文字')
    await preciseTextInput.press('Enter')
    await expect(preciseTextInput).toHaveValue('可保存的 Slide 文字')
    await expect(page.getByTestId('course-slide-canvas')).toContainText('可保存的 Slide 文字')

    // Undo/redo must operate on the V9 document rather than a legacy store.
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('course-slide-canvas')).not.toContainText('可保存的 Slide 文字')
    await page.keyboard.press('Control+y')
    await expect(page.getByTestId('course-slide-canvas')).toContainText('可保存的 Slide 文字')

    // Playback -> inspect keeps the exact Slide host DOM instance alive.
    const slideHost = page.getByTestId('course-slide-canvas').locator('.slide-surface')
    await slideHost.evaluate((element) => { (element as HTMLElement).dataset.e2eStableHost = 'true' })
    await page.getByRole('button', { name: '试运行', exact: true }).click()
    await expect(page.getByRole('button', { name: '试运行', exact: true })).toHaveClass(/is-active/u)
    const reviewLayer = slideHost.locator('.slide-layer-item').filter({ hasText: '可保存的 Slide 文字' })
    // These playback mutations mirror what a legacy Runtime ctx.nodes bridge
    // can do to the same live layer wrapper.
    await reviewLayer.evaluate((element) => {
      const layer = element as HTMLElement
      layer.style.left = '246px'
      layer.style.top = '138px'
      layer.style.width = '420px'
      layer.style.height = '96px'
      layer.style.transform = 'rotate(13deg)'
      layer.style.opacity = '0.63'
      layer.style.visibility = 'hidden'
    })
    await expect(reviewLayer).toHaveCSS('left', '246px')
    await expect(reviewLayer).toHaveCSS('opacity', '0.63')
    await page.getByRole('button', { name: '编辑当前帧', exact: true }).click()
    await expect(page.getByRole('button', { name: '编辑当前帧', exact: true })).toHaveClass(/is-active/u)
    await expect(page.locator('.slide-surface[data-e2e-stable-host="true"]')).toHaveCount(1)
    await expect(reviewLayer).toHaveCSS('left', '246px')
    await expect(reviewLayer).toHaveCSS('opacity', '0.63')

    // A teacher can explicitly persist the structured part of this inspected
    // frame as a named review state; transient internals remain session-only.
    await page.evaluate(() => { window.prompt = () => '讲评复核态' })
    await expect(reviewLayer).toHaveCSS('left', '246px')
    await expect(page.getByTestId('course-slide-canvas').locator('.course-slide-mount > .slide-surface')).toHaveCount(1)
    await page.getByRole('button', { name: '保存为命名复核态' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.locator('.course-status')).toContainText('已保存命名复核态')
    await expect(page.getByRole('group', { name: '命名复核态' })).toContainText('讲评复核态')
    await patchDialogs(app, { projectSave: projectPath })
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.locator('.course-status')).toContainText(projectPath)
    const reviewProject = openCourseProjectArchive(readFileSync(projectPath)).project
    const reviewSurface = reviewProject.surfaces.find((surface) => surface.type === 'slide')
    if (!reviewSurface || reviewSurface.type !== 'slide') throw new Error('saved review Slide missing')
    const savedReview = reviewSurface.scenes[0]!.presentation?.states.find((state) => state.name === '讲评复核态')
    const savedTextId = reviewSurface.scenes[0]!.layerItems.find((item) => (
      item.kind === 'native' && item.content.nativeType === 'text' && item.content.data.text === '可保存的 Slide 文字'
    ))?.layerItemId
    expect(savedReview?.layerItemOverrides[savedTextId ?? '']).toMatchObject({
      frame: { x: 246, y: 138, width: 420, height: 96 },
      rotation: 13,
      opacity: 0.63,
      visible: false,
    })
    await page.getByRole('button', { name: '初始 · 初始' }).click()
    await expect(reviewLayer).toHaveCSS('left', '120px')
    await page.getByRole('button', { name: '讲评复核态', exact: true }).click()
    await expect(reviewLayer).toHaveCSS('left', '246px')
    await page.getByRole('button', { name: '设为初始' }).click()
    await expect(page.getByRole('group', { name: '命名复核态' })).toContainText('讲评复核态 · 初始')

    // Flow supports real nested authoring, not a flattened page surrogate.
    await page.getByRole('button', { name: '+ Flow' }).click()
    await commitInput(page, '表面名称', 'Flow E2E')
    await page.getByLabel('Flow 块类型').selectOption('section')
    await page.getByRole('button', { name: '+ 内容块' }).click()
    await page.getByRole('button', { name: '+ 在分节中插入正文' }).click()
    const nestedText = page.locator('.course-flow-card.is-selected textarea')
    await nestedText.fill('嵌套 Flow 内容')
    await nestedText.press('Control+Enter')
    await expect(page.getByTestId('course-flow-canvas')).toContainText('嵌套 Flow 内容')

    // Spatial authoring persists a node, semantic zoom rule and named camera.
    await page.getByRole('button', { name: '+ Spatial' }).click()
    await commitInput(page, '表面名称', 'Spatial E2E')
    await page.getByRole('button', { name: '+ 文字' }).click()
    await page.locator('.course-layer-list button').filter({ hasText: '可移动文字' }).click()
    await page.getByRole('button', { name: '+ 为所选图层添加规则' }).click()
    await expect(page.locator('.course-semantic-rule')).toHaveCount(1)
    const spatialCanvas = page.getByTestId('course-spatial-canvas')
    await spatialCanvas.dispatchEvent('wheel', { deltaY: -240 })
    await expect(page.locator('.course-center__tools')).toContainText('112%')
    await page.getByRole('button', { name: '+ 保存当前镜头' }).click()
    await expect(page.locator('.course-outline__children').filter({ hasText: '112%' })).toBeVisible()

    await patchDialogs(app, {
      projectSave: projectPath,
      htmlSave: htmlPath,
      pdfSave: pdfPath,
      pptxSave: pptxPath,
      docxSave: docxPath,
    })
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.locator('.course-status')).toContainText(projectPath)
    expectNonEmptyFile(projectPath, 500)

    await page.getByRole('button', { name: 'HTML', exact: true }).click()
    await expect(page.locator('.course-status')).toContainText('HTML 已导出')
    expectNonEmptyFile(htmlPath, 10_000)
    await page.getByRole('button', { name: 'PPTX', exact: true }).click()
    await expect(page.locator('.course-status')).toContainText('PPTX 已导出')
    expectNonEmptyFile(pptxPath, 1_000)
    await page.getByRole('button', { name: 'PDF', exact: true }).click()
    await expect(page.locator('.course-status')).toContainText('PDF 已导出', { timeout: 30_000 })
    expectNonEmptyFile(pdfPath, 1_000)

    await surfaceRow(page, 'flow').click()
    await page.getByRole('button', { name: 'DOCX', exact: true }).click()
    await expect(page.locator('.course-status')).toContainText('DOCX 已导出')
    expectNonEmptyFile(docxPath, 500)
    expectCleanRenderer(studio)
  } finally {
    await closeStudio(studio.app)
  }

  // Close the process, relaunch, and read the bytes through the real main IPC.
  studio = await launchStudio()
  try {
    await patchDialogs(studio.app, { projectOpen: projectPath })
    await studio.page.getByRole('button', { name: '打开 V9' }).click()
    await expect(studio.page.getByLabel('课程标题')).toHaveValue('V9 E2E 混合课程')
    await expect(surfaceRow(studio.page, 'slide')).toHaveCount(1)
    await expect(surfaceRow(studio.page, 'flow')).toHaveCount(1)
    await expect(surfaceRow(studio.page, 'spatial-2d')).toHaveCount(1)
    await surfaceRow(studio.page, 'slide').click()
    await expect(studio.page.getByRole('group', { name: '命名复核态' })).toContainText('讲评复核态 · 初始')
    const reopenedReviewLayer = studio.page.getByTestId('course-slide-canvas')
      .locator('.slide-layer-item')
      .filter({ hasText: '可保存的 Slide 文字' })
    await expect(reopenedReviewLayer).toBeHidden()
    await expect(reopenedReviewLayer).toHaveCSS('left', '246px')
    await expect(reopenedReviewLayer).toHaveCSS('top', '138px')
    await expect(reopenedReviewLayer).toHaveCSS('width', '420px')
    await expect(reopenedReviewLayer).toHaveCSS('height', '96px')
    await expect(reopenedReviewLayer).toHaveCSS('opacity', '0.63')
    await expect.poll(() => reopenedReviewLayer.evaluate((element) => (element as HTMLElement).style.transform))
      .toBe('rotate(13deg)')
    await surfaceRow(studio.page, 'flow').click()
    await expect(studio.page.getByTestId('course-flow-canvas')).toContainText('嵌套 Flow 内容')
    await surfaceRow(studio.page, 'spatial-2d').click()
    await expect(studio.page.locator('.course-semantic-rule')).toHaveCount(1)
    expectCleanRenderer(studio)
  } finally {
    await closeStudio(studio.app)
  }
})

test('opens the real Mixed course and crosses Slide, Flow and Spatial surfaces', async () => {
  test.slow()
  expect(existsSync(mixedProjectPath), 'pretest:e2e must build the real Mixed case').toBe(true)
  const studio = await launchStudio()
  try {
    await patchDialogs(studio.app, { projectOpen: mixedProjectPath })
    await studio.page.getByRole('button', { name: '打开 V9' }).click()
    await expect(surfaceRow(studio.page, 'slide').first()).toBeVisible()
    await expect(surfaceRow(studio.page, 'flow')).toBeVisible()
    await expect(surfaceRow(studio.page, 'spatial-2d')).toBeVisible()

    await surfaceRow(studio.page, 'slide').first().click()
    await expect(studio.page.getByTestId('course-slide-canvas')).toBeVisible()
    await studio.page.getByRole('button', { name: '试运行', exact: true }).click()
    await studio.page.getByRole('button', { name: '编辑当前帧', exact: true }).click()

    await surfaceRow(studio.page, 'flow').click()
    await expect(studio.page.getByTestId('course-flow-canvas')).toContainText('箭头')

    await surfaceRow(studio.page, 'spatial-2d').click()
    const spatialCanvas = studio.page.getByTestId('course-spatial-canvas')
    await expect(spatialCanvas).toBeVisible()
    await spatialCanvas.dispatchEvent('wheel', { deltaY: -240 })
    const namedCamera = studio.page.getByRole('button', { name: /蜓蜓幼虫邻域/u })
    if (await namedCamera.count()) await namedCamera.click()

    await studio.page.screenshot({ path: screenshotPath, fullPage: true })
    expectNonEmptyFile(screenshotPath, 10_000)
    expectCleanRenderer(studio)
  } finally {
    await closeStudio(studio.app)
  }
})
