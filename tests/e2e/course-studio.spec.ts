import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Locator, Page } from 'playwright'
import { APP_E2E_TEMP_DIRECTORY_NAME } from '../../src/shared/constants'
import { BACKGROUND_E2E_ENV } from '../../src/main/windowVisibility'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(
  tmpdir(),
  APP_E2E_TEMP_DIRECTORY_NAME,
  `course-studio-v9-${process.pid}`,
)
const userDataDirectory = join(runDirectory, 'electron-profile')
const projectPath = join(runDirectory, 'course-studio-roundtrip.h5lesson')
const spatialProjectPath = join(runDirectory, 'spatial-viewport-roundtrip.h5lesson')
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
const evidenceDirectory = join(root, 'output', 'playwright')
const mixedScreenshotPath = join(evidenceDirectory, 'course-studio-v9-mixed-e2e.png')
const spatialViewportScreenshotPath = join(evidenceDirectory, 'course-studio-v9-spatial-viewport.png')

interface LaunchedStudio {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
  externalRequests: string[]
}

interface DialogPaths {
  projectOpen?: string
  projectSave?: string
  htmlSave?: string
  pdfSave?: string
  pptxSave?: string
  docxSave?: string
}

interface ElementBox {
  x: number
  y: number
  width: number
  height: number
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

/**
 * Replaces only the native OS chooser. All authoring and export commands are
 * still initiated from the visible product UI and cross the real preload IPC.
 */
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

async function elementBox(locator: Locator): Promise<ElementBox> {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, 'visible element should have a browser layout box').not.toBeNull()
  return box!
}

async function viewportZoomPercent(page: Page): Promise<number> {
  const status = page.locator('.v9-editor-shell__status-viewport')
  await expect(status).toContainText(/\d+(?:\.\d+)?%/u)
  const match = (await status.textContent())?.match(/(\d+(?:\.\d+)?)%/u)
  if (!match) throw new Error('视口状态没有显示有效缩放比例。')
  return Number(match[1])
}

/** A real pointer drag through Chromium; it never mutates authored DOM styles. */
async function dragBy(page: Page, locator: Locator, dx: number, dy: number): Promise<void> {
  await locator.scrollIntoViewIfNeeded()
  const box = await elementBox(locator)
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 })
  await page.mouse.up()
}

/** A real pointer gesture through the visible Flow handle and drop slot. */
async function dragFlowBlock(page: Page, source: Locator, target: Locator): Promise<void> {
  await source.scrollIntoViewIfNeeded()
  const sourceBox = await elementBox(source)
  const start = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height / 2,
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  try {
    await page.mouse.move(start.x + 12, start.y + 12, { steps: 3 })
    await expect(target).toBeVisible()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const targetBox = await elementBox(target)
      await page.mouse.move(
        targetBox.x + targetBox.width / 2,
        targetBox.y + targetBox.height / 2,
        { steps: attempt === 0 ? 10 : 3 },
      )
      if (await target.getAttribute('data-flow-drop-active') === 'true') break
    }
    await expect(target).toHaveAttribute('data-flow-drop-active', 'true')
  } finally {
    await page.mouse.up()
  }
}

function expectBoxNear(actual: ElementBox, expected: ElementBox, tolerance = 3): void {
  expect(Math.abs(actual.x - expected.x), 'persisted x position').toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.y - expected.y), 'persisted y position').toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.width - expected.width), 'persisted width').toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.height - expected.height), 'persisted height').toBeLessThanOrEqual(tolerance)
}

function expectNonEmptyFile(path: string, minimumBytes: number): void {
  expect(existsSync(path), `${path} should exist`).toBe(true)
  expect(statSync(path).size, `${path} should not be empty`).toBeGreaterThan(minimumBytes)
}

function surfaceRow(page: Page, type: 'slide' | 'flow' | 'spatial-2d'): Locator {
  return page.locator('.course-surface-row').filter({
    has: page.locator(`.course-surface-badge.is-${type}`),
  })
}

async function chooseMoreAction(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: '更多操作' }).click()
  const menu = page.getByRole('menu', { name: '更多操作' })
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: label, exact: true }).click()
}

async function expectOperationSucceeded(
  page: Page,
  statusText: string,
  timeout = 60_000,
): Promise<void> {
  const success = page.locator('.course-status').filter({ hasText: statusText })
  const error = page.getByRole('alert')
  await expect(success.or(error)).toBeVisible({ timeout })
  if (await error.isVisible()) {
    throw new Error(`Visible product error while waiting for "${statusText}": ${await error.innerText()}`)
  }
  await expect(success).toBeVisible()
}

function expectCleanRenderer(studio: LaunchedStudio): void {
  expect(studio.pageErrors, 'renderer page errors').toEqual([])
  expect(studio.consoleErrors, 'renderer console errors').toEqual([])
  expect(studio.externalRequests, 'editor and examples must remain offline').toEqual([])
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  mkdirSync(evidenceDirectory, { recursive: true })
})

test.afterAll(() => {
  rmSync(runDirectory, { recursive: true, force: true })
})

test('Spatial edit viewport fits, pans and restores one saved camera exactly', async () => {
  test.setTimeout(180_000)
  let studio = await launchStudio()
  let savedMinimapX = 0
  let savedZoomText = ''

  try {
    const { app, page } = studio
    await page.getByRole('button', { name: '+ 空间' }).click()
    await page.getByRole('tab', { name: '元素' }).click()
    await page.getByRole('button', { name: '添加文字' }).click()

    const canvas = page.getByTestId('course-spatial-canvas')
    await expect(canvas.locator('.course-spatial-stage')).toHaveAttribute(
      'data-logical-viewport',
      '1120x760',
    )
    await expect(canvas.locator(
      '.course-spatial-mount > .spatial-surface > svg:not(.spatial-minimap)',
    )).toHaveAttribute('viewBox', '0 0 1120 760')

    const viewportStatus = page.locator('.v9-editor-shell__status-viewport')
    await page.getByRole('button', { name: '适配全部内容' }).click()
    await expect.poll(async () => {
      const match = (await viewportStatus.textContent())?.match(/(\d+(?:\.\d+)?)%/u)
      return match ? Number(match[1]) : Number.NaN
    }).toBeGreaterThanOrEqual(5)
    const fittedZoom = (await viewportStatus.textContent())?.match(/(\d+(?:\.\d+)?)%/u)
    expect(fittedZoom).not.toBeNull()
    expect(Number(fittedZoom?.[1])).toBeLessThanOrEqual(3200)
    savedZoomText = `${fittedZoom?.[1]}%`
    const minimapViewport = canvas.locator('.spatial-minimap-viewport')
    const beforePan = Number(await minimapViewport.getAttribute('x'))
    const box = await elementBox(canvas)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(box.x + box.width / 2 + 72, box.y + box.height / 2 + 24, { steps: 4 })
    await page.mouse.up({ button: 'middle' })
    await expect.poll(async () => Math.abs(
      Number(await minimapViewport.getAttribute('x')) - beforePan,
    )).toBeGreaterThan(0.5)
    const afterMiddlePan = Number(await minimapViewport.getAttribute('x'))

    // A normal canvas click establishes keyboard focus; Space + left drag is
    // the second real edit-mode pan gesture and must not turn into marquee.
    await page.mouse.click(box.x + 12, box.y + 12)
    await page.keyboard.down('Space')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 48, box.y + box.height / 2, { steps: 4 })
    await page.mouse.up()
    await page.keyboard.up('Space')
    await expect.poll(async () => Math.abs(
      Number(await minimapViewport.getAttribute('x')) - afterMiddlePan,
    )).toBeGreaterThan(0.5)
    savedMinimapX = Number(await minimapViewport.getAttribute('x'))

    await page.getByRole('button', { name: /保存当前镜头/u }).click()
    const savedFrame = page.getByLabel('第 2 个镜头名称')
    await expect(savedFrame.locator('..')).toContainText(savedZoomText)
    await page.getByRole('button', { name: '回到首页镜头' }).click()
    await savedFrame.locator('..').getByRole('button', { name: '定位' }).click()
    await expect.poll(async () => Math.abs(
      Number(await minimapViewport.getAttribute('x')) - savedMinimapX,
    )).toBeLessThan(0.01)
    await page.screenshot({ path: spatialViewportScreenshotPath, fullPage: true })
    expectNonEmptyFile(spatialViewportScreenshotPath, 10_000)

    await patchDialogs(app, { projectSave: spatialProjectPath })
    await page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
    await expect(page.locator('.course-status')).toContainText(spatialProjectPath)
    expectNonEmptyFile(spatialProjectPath, 500)
    expectCleanRenderer(studio)
  } finally {
    await closeStudio(studio.app)
  }

  studio = await launchStudio()
  try {
    const { app, page } = studio
    await patchDialogs(app, { projectOpen: spatialProjectPath })
    await page.getByRole('button', { name: '打开课件' }).click()
    await surfaceRow(page, 'spatial-2d').click()
    const canvas = page.getByTestId('course-spatial-canvas')
    const savedFrame = page.getByLabel('第 2 个镜头名称')
    await expect(savedFrame.locator('..')).toContainText(savedZoomText)
    await savedFrame.locator('..').getByRole('button', { name: '定位' }).click()
    await expect.poll(async () => Math.abs(
      Number(await canvas.locator('.spatial-minimap-viewport').getAttribute('x')) - savedMinimapX,
    )).toBeLessThan(0.01)
    await expect(canvas.locator(
      '.course-spatial-mount > .spatial-surface > svg:not(.spatial-minimap)',
    )).toHaveAttribute('viewBox', '0 0 1120 760')
    expectCleanRenderer(studio)
  } finally {
    await closeStudio(studio.app)
  }
})

test('V9 teacher workflow authors, interacts, exports, saves and reopens a mixed course', async () => {
  test.setTimeout(360_000)
  let studio = await launchStudio()
  let persistedSlideBox: ElementBox
  let persistedSpatialZoom = 0

  try {
    const { app, page } = studio

    // One comprehensible V9 product shell; no migration or old-editor door.
    await expect(page.getByTestId('v9-editor-shell')).toBeVisible()
    await expect(page.getByRole('complementary', { name: '课程结构' })).toBeVisible()
    await expect(page.getByRole('main', { name: '课件编辑区' })).toBeVisible()
    await expect(page.getByRole('complementary', { name: '编辑面板' })).toBeVisible()
    await expect(page.locator('#root > [data-testid="course-studio-v9"]')).toHaveCount(1)
    await commitInput(page, '课程标题', 'V9 E2E 教师混合课程')

    // Slide: add Native text and edit it by double-clicking the canvas selection.
    await page.getByRole('button', { name: '添加文字' }).click()
    const slideCanvas = page.getByTestId('course-slide-canvas')
    const initialSlideLayer = slideCanvas.locator('.slide-layer-item').filter({ hasText: '双击编辑文字' })
    await expect(initialSlideLayer).toBeVisible()
    const slideLayerItemId = await initialSlideLayer.getAttribute('data-layer-item-id')
    expect(slideLayerItemId, 'new Native text should expose its stable V9 layer id').toBeTruthy()
    const slideLayer = slideCanvas.locator(
      `.slide-layer-item[data-layer-item-id="${slideLayerItemId}"]`,
    )
    await slideCanvas.locator('[data-course-transform-selection]').dblclick()
    const canvasTextEditor = page.getByRole('textbox', { name: '编辑双击编辑文字' })
    await expect(canvasTextEditor).toBeFocused()
    await canvasTextEditor.fill('可保存、可互动的 Slide 文字')
    await canvasTextEditor.press('Control+Enter')
    await expect(slideCanvas).toContainText('可保存、可互动的 Slide 文字')
    await expect(slideCanvas.locator('[data-course-transform-selection]')).toBeVisible()

    // Move, resize and rotate through the actual visible V9 transform affordances.
    const initialBox = await elementBox(slideLayer)
    await dragBy(page, slideCanvas.locator('[data-course-transform-action="move"]'), 88, 48)
    const movedBox = await elementBox(slideLayer)
    expect(movedBox.x).toBeGreaterThan(initialBox.x + 30)
    expect(movedBox.y).toBeGreaterThan(initialBox.y + 18)

    await dragBy(page, slideCanvas.locator('[data-course-transform-action="resize:se"]'), 72, 36)
    const resizedBox = await elementBox(slideLayer)
    expect(resizedBox.width).toBeGreaterThan(movedBox.width + 20)
    expect(resizedBox.height).toBeGreaterThan(movedBox.height + 10)

    await page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
    await expect(page.locator('.course-status')).toContainText('已撤销上一步')
    const undoBox = await elementBox(slideLayer)
    expect(undoBox.width).toBeLessThan(resizedBox.width - 15)
    await page.getByRole('button', { name: '重做（Ctrl+Y）' }).click()
    await expect(page.locator('.course-status')).toContainText('已重做上一步')
    const redoBox = await elementBox(slideLayer)
    expectBoxNear(redoBox, resizedBox)

    await dragBy(page, slideCanvas.locator('[data-course-transform-action="rotate"]'), 72, 48)
    await expect.poll(async () => slideLayer.getAttribute('style')).toMatch(/rotate\((?!0(?:\.0+)?deg)/u)
    persistedSlideBox = await elementBox(slideLayer)

    // Interaction: configure a Chinese click rule, then execute it in trial mode.
    await page.getByRole('tab', { name: '互动' }).click()
    await page.getByRole('button', { name: '添加：点击所选图层时' }).click()
    const interactionRule = page.getByRole('article', { name: /互动规则/u })
    await expect(interactionRule).toContainText('点击')
    await expect(interactionRule.getByLabel('动作 1 类型')).toHaveValue('node.exit')
    await page.getByLabel('互动名称 1').fill('点击文字后隐藏')
    await page.getByLabel('互动名称 1').press('Enter')
    await expect(page.getByRole('article', { name: '互动规则：点击文字后隐藏' })).toBeVisible()

    await page.getByRole('button', { name: '试运行', exact: true }).click()
    await expect(page.getByRole('button', { name: '试运行', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await slideLayer.click()
    await expect(slideLayer).toBeHidden()
    await page.getByRole('button', { name: '编辑当前帧', exact: true }).click()
    await expect(page.getByRole('button', { name: '编辑当前帧', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(slideLayer).toBeHidden()

    // Flow: all teacher entries are Chinese; list and section are structured editors.
    await page.getByRole('button', { name: '+ 讲义' }).click()
    await page.getByRole('tab', { name: '属性' }).click()
    await commitInput(page, '内容名称', '结构化课堂讲义')
    await page.getByRole('tab', { name: '元素' }).click()
    for (const name of [
      '添加标题', '添加正文', '添加引用', '添加列表', '添加分节', '添加分隔线',
      '添加提示', '添加表格', '添加公式', '添加代码', '添加图片', '添加音频',
    ]) {
      await expect(page.getByRole('button', { name, exact: true })).toBeAttached()
    }

    await page.getByRole('button', { name: '添加列表' }).click()
    const listEditor = page.getByRole('region', { name: '列表编辑器', exact: true })
    await listEditor.getByRole('textbox').nth(0).fill('观察图像变化')
    await listEditor.getByRole('button', { name: '添加列表项', exact: true }).click()
    await listEditor.getByRole('textbox').nth(1).fill('归纳函数规律')
    await listEditor.getByRole('button', { name: '增加列表项 2 缩进' }).click()
    const indentedListItem = listEditor.locator('[data-list-level="1"]')
    await expect(indentedListItem).toHaveCount(1)
    await expect(indentedListItem.getByRole('textbox')).toHaveValue('归纳函数规律')
    const flowCanvas = page.getByTestId('course-flow-canvas')
    const canvasListInputs = flowCanvas.locator('[data-flow-list-item-id] input')
    await expect(canvasListInputs.nth(0)).toHaveValue('观察图像变化')
    await expect(canvasListInputs.nth(1)).toHaveValue('归纳函数规律')

    await page.getByRole('tab', { name: '元素' }).click()
    await page.getByRole('button', { name: '添加分节' }).click()
    await page.getByLabel('分节标题').fill('课堂探究')
    await page.getByRole('button', { name: '添加到分节' }).click()
    await page.getByLabel('正文内容').fill('拖动图像并记录顶点位置。')
    await expect(flowCanvas).toContainText('课堂探究')
    await expect(flowCanvas).toContainText('拖动图像并记录顶点位置。')

    // Pointer drag uses the visible handle and document drop slot, not model injection.
    const listHandle = flowCanvas.getByRole('button', { name: /^拖动列表/u })
    const rootEndDrop = flowCanvas.locator(
      '[data-flow-drop-parent-id="root"][data-flow-drop-slot-index="3"]',
    )
    await dragFlowBlock(page, listHandle, rootEndDrop)
    const topLevelCards = flowCanvas.locator(
      '[data-flow-block-list-parent-id="root"] > .course-flow-card',
    )
    await expect(topLevelCards.nth(1)).toContainText('课堂探究')
    await expect(topLevelCards.nth(2).locator('[data-flow-list-item-id] input').nth(0))
      .toHaveValue('观察图像变化')

    // Spatial: add and transform content, zoom with a real wheel, save the camera.
    await page.getByRole('button', { name: '+ 空间' }).click()
    await page.getByRole('tab', { name: '属性' }).click()
    await commitInput(page, '内容名称', '空间关系探索')
    await page.getByRole('tab', { name: '元素' }).click()
    await page.getByRole('button', { name: '添加文字' }).click()
    const spatialCanvas = page.getByTestId('course-spatial-canvas')
    const spatialLayer = spatialCanvas.locator('[data-spatial-layer-record]').filter({ hasText: '双击编辑文字' })
    await expect(spatialLayer).toBeVisible()
    const spatialBefore = await elementBox(spatialLayer)
    await dragBy(page, spatialCanvas.locator('[data-course-transform-action="move"]'), 64, 32)
    const spatialAfter = await elementBox(spatialLayer)
    expect(spatialAfter.x).toBeGreaterThan(spatialBefore.x + 20)
    expect(spatialAfter.y).toBeGreaterThan(spatialBefore.y + 10)
    const zoomBeforeWheel = await viewportZoomPercent(page)
    await spatialCanvas.hover()
    await page.mouse.wheel(0, -240)
    await expect.poll(() => viewportZoomPercent(page)).toBeGreaterThan(zoomBeforeWheel)
    await page.getByRole('button', { name: '适配全部内容' }).click()
    await expect(page.locator('.course-status')).toContainText('已适配全部空间内容')
    const fittedSpatialZoom = await viewportZoomPercent(page)
    expect(fittedSpatialZoom).toBeGreaterThanOrEqual(5)
    expect(fittedSpatialZoom).toBeLessThanOrEqual(3200)
    persistedSpatialZoom = fittedSpatialZoom
    await expect(spatialCanvas.locator('.course-spatial-stage')).toHaveAttribute(
      'data-logical-viewport',
      '1120x760',
    )

    // A real middle-button gesture pans in edit mode even when it starts over content.
    const minimapViewport = spatialCanvas.locator('.spatial-minimap-viewport')
    const minimapBeforePan = Number(await minimapViewport.getAttribute('x'))
    const spatialBox = await elementBox(spatialCanvas)
    await page.mouse.move(spatialBox.x + spatialBox.width / 2, spatialBox.y + spatialBox.height / 2)
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(
      spatialBox.x + spatialBox.width / 2 + 72,
      spatialBox.y + spatialBox.height / 2 + 24,
      { steps: 4 },
    )
    await page.mouse.up({ button: 'middle' })
    await expect.poll(async () => Number(await minimapViewport.getAttribute('x')))
      .not.toBeCloseTo(minimapBeforePan)
    await page.getByRole('button', { name: /保存当前镜头/u }).click()
    const savedCameraName = page.getByLabel('第 2 个镜头名称')
    await expect(savedCameraName).toHaveValue('镜头 2')
    await expect(savedCameraName.locator('..')).toContainText(`${fittedSpatialZoom}%`)

    // Save and export through visible V9 commands and real desktop IPC.
    await patchDialogs(app, {
      projectSave: projectPath,
      htmlSave: htmlPath,
      pdfSave: pdfPath,
      pptxSave: pptxPath,
      docxSave: docxPath,
    })
    await page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
    await expect(page.locator('.course-status')).toContainText(projectPath)
    expectNonEmptyFile(projectPath, 500)

    await page.getByRole('button', { name: '导出 HTML' }).click()
    await expectOperationSucceeded(page, 'HTML 已导出')
    expectNonEmptyFile(htmlPath, 10_000)

    await chooseMoreAction(page, '导出 PPTX')
    await expectOperationSucceeded(page, 'PPTX 已导出')
    expectNonEmptyFile(pptxPath, 1_000)

    await chooseMoreAction(page, '导出 PDF')
    await expectOperationSucceeded(page, 'PDF 已导出')
    expectNonEmptyFile(pdfPath, 1_000)

    await surfaceRow(page, 'flow').click()
    await chooseMoreAction(page, '导出 DOCX')
    await expectOperationSucceeded(page, 'DOCX 已导出')
    expectNonEmptyFile(docxPath, 500)
    expectCleanRenderer(studio)
  } finally {
    await closeStudio(studio.app)
  }

  // Relaunch the actual desktop process and reopen bytes through the Open UI.
  studio = await launchStudio()
  try {
    const { app, page } = studio
    await patchDialogs(app, { projectOpen: projectPath })
    await page.getByRole('button', { name: '打开课件' }).click()
    await expect(page.getByLabel('课程标题')).toHaveValue('V9 E2E 教师混合课程')
    await expect(surfaceRow(page, 'slide')).toHaveCount(1)
    await expect(surfaceRow(page, 'flow')).toHaveCount(1)
    await expect(surfaceRow(page, 'spatial-2d')).toHaveCount(1)

    await surfaceRow(page, 'slide').click()
    const reopenedSlideLayer = page.getByTestId('course-slide-canvas')
      .locator('.slide-layer-item')
      .filter({ hasText: '可保存、可互动的 Slide 文字' })
    await expect(reopenedSlideLayer).toBeVisible()
    expectBoxNear(await elementBox(reopenedSlideLayer), persistedSlideBox)
    await expect.poll(async () => reopenedSlideLayer.getAttribute('style')).toMatch(/rotate\((?!0(?:\.0+)?deg)/u)

    // The rule was saved as V9 data and executes again after a fresh process.
    await page.getByRole('button', { name: '试运行', exact: true }).click()
    await reopenedSlideLayer.click()
    await expect(reopenedSlideLayer).toBeHidden()
    await page.getByRole('button', { name: '编辑当前帧', exact: true }).click()

    await surfaceRow(page, 'flow').click()
    const reopenedFlowCanvas = page.getByTestId('course-flow-canvas')
    const reopenedListInputs = reopenedFlowCanvas.locator('[data-flow-list-item-id] input')
    await expect(reopenedListInputs.nth(0)).toHaveValue('观察图像变化')
    await expect(reopenedListInputs.nth(1)).toHaveValue('归纳函数规律')
    await expect(reopenedListInputs.nth(1).locator('..')).toHaveAttribute('data-flow-list-level', '1')
    await expect(reopenedFlowCanvas).toContainText('课堂探究')
    await expect(reopenedFlowCanvas).toContainText('拖动图像并记录顶点位置。')

    await surfaceRow(page, 'spatial-2d').click()
    await expect(page.getByTestId('course-spatial-canvas')).toContainText('双击编辑文字')
    const reopenedCameraName = page.getByLabel('第 2 个镜头名称')
    await expect(reopenedCameraName).toHaveValue('镜头 2')
    await expect(reopenedCameraName.locator('..')).toContainText(`${persistedSpatialZoom}%`)
    expectCleanRenderer(studio)
  } finally {
    await closeStudio(studio.app)
  }
})

test('opens the repository Mixed course and crosses real Slide, Flow and Spatial surfaces', async () => {
  test.slow()
  expect(existsSync(mixedProjectPath), 'pretest:e2e must build the real Mixed case').toBe(true)
  const studio = await launchStudio()
  try {
    const { app, page } = studio
    await patchDialogs(app, { projectOpen: mixedProjectPath })
    await page.getByRole('button', { name: '打开课件' }).click()
    await expect(surfaceRow(page, 'slide').first()).toBeVisible()
    await expect(surfaceRow(page, 'flow')).toBeVisible()
    await expect(surfaceRow(page, 'spatial-2d')).toBeVisible()

    await surfaceRow(page, 'slide').first().click()
    await expect(page.getByTestId('course-slide-canvas')).toBeVisible()
    await expect(page.getByTestId('course-slide-canvas').locator('.slide-layer-item').first()).toBeVisible()
    await page.getByRole('button', { name: '试运行', exact: true }).click()
    await page.getByRole('button', { name: '编辑当前帧', exact: true }).click()

    await surfaceRow(page, 'flow').click()
    const flowCanvas = page.getByTestId('course-flow-canvas')
    await expect(flowCanvas).toBeVisible()
    await expect(flowCanvas.locator('[data-flow-block-id]').first()).toBeVisible()

    await surfaceRow(page, 'spatial-2d').click()
    const spatialCanvas = page.getByTestId('course-spatial-canvas')
    await expect(spatialCanvas).toBeVisible()
    await expect(spatialCanvas.locator('[data-spatial-layer-record]:visible').first()).toBeVisible()
    await spatialCanvas.hover()
    await page.mouse.wheel(0, -120)
    await expect(page.locator('.v9-editor-shell__status-viewport')).not.toHaveText('100%')

    await page.screenshot({ path: mixedScreenshotPath, fullPage: true })
    expectNonEmptyFile(mixedScreenshotPath, 10_000)
    expectCleanRenderer(studio)
  } finally {
    await closeStudio(studio.app)
  }
})
