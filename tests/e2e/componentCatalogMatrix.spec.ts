import { _electron as electron, chromium, expect, test } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  Browser,
  ElectronApplication,
  Locator,
  Page,
} from 'playwright'
import { unzipSync } from 'fflate'
import {
  BACKGROUND_E2E_ENV,
  BACKGROUND_E2E_WINDOW_ORIGIN,
} from '../../src/main/windowVisibility'

const root = resolve(__dirname, '..', '..')
const catalogRoot = resolve(root, '..', 'courseware-components')
const artifactDirectory = join(root, 'artifacts', 'component-catalog-matrix')
const outputDirectory = join(root, 'output', 'playwright', 'component-catalog-matrix')
const matrixLessonPath = join(
  artifactDirectory,
  'component-catalog-v8-matrix.h5lesson',
)
const matrixHtmlPath = join(
  artifactDirectory,
  'component-catalog-v8-matrix.html',
)
const matrixWebPackagePath = join(
  artifactDirectory,
  'component-catalog-v8-matrix-web.zip',
)
const matrixProjectPath = join(
  artifactDirectory,
  'component-catalog-v8-matrix.project.json',
)
const importedRoundtripPath = join(
  outputDirectory,
  'catalog-ui-roundtrip.h5lesson',
)
const exportedHtmlPath = join(outputDirectory, 'catalog-matrix-ui.html')
const exportedWebPackagePath = join(outputDirectory, 'catalog-matrix-ui-web.zip')
const exportedWebDirectory = join(outputDirectory, 'catalog-matrix-ui-web')
const exportedPdfPath = join(outputDirectory, 'catalog-matrix-ui.pdf')
const exportedPptxPath = join(outputDirectory, 'catalog-matrix-ui.pptx')
const runtimeEvidencePath = join(
  artifactDirectory,
  'matrix-runtime-evidence.json',
)
const backgroundE2e = process.env[BACKGROUND_E2E_ENV] ?? '1'
const expectedPackageCount = 4
const pressureRounds = 25
const expectedPressureNavigations = expectedPackageCount * pressureRounds
const matrixFixtureAvailable = [
  matrixProjectPath,
  matrixLessonPath,
  matrixHtmlPath,
  matrixWebPackagePath,
  join(catalogRoot, 'catalog.json'),
].every(existsSync)

interface MatrixProject {
  schemaVersion: number
  scenes: Array<{
    id: string
    name: string
    nodes: Array<{
      id: string
      type: string
      component?: { packageId: string; version: string }
    }>
  }>
  componentPackages: Record<string, {
    packageId: string
    version: string
    contentSha256: string
    sha256?: string
    importedAt?: string
    sourceLabel?: string
  }>
}

interface LaunchedEditor {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
  consoleWarnings: string[]
  externalRequests: string[]
}

interface PlayerVerification {
  externalRequests: string[]
  pageErrors: string[]
  maxMounted: number
  minMounted: number
  navigationCount: number
}

const matrixProject: MatrixProject = matrixFixtureAvailable
  ? JSON.parse(readFileSync(matrixProjectPath, 'utf8')) as MatrixProject
  : { schemaVersion: 8, scenes: [], componentPackages: {} }
const matrixCases = matrixProject.scenes.map((scene, index) => {
  const node = scene.nodes.find((candidate) => candidate.type === 'external-component')
  if (!node?.component) throw new Error(`矩阵场景 ${scene.id} 缺少组件节点`)
  return {
    index,
    sceneId: scene.id,
    sceneName: scene.name,
    nodeId: node.id,
    packageId: node.component.packageId,
    version: node.component.version,
    sha256: matrixProject.componentPackages[node.component.packageId]?.sha256,
    baseText: `矩阵 ${String(index + 1).padStart(2, '0')}`,
    stateText: `状态覆盖 ${String(index + 1).padStart(2, '0')}`,
  }
})

const expectedCanvasTextLabels: Readonly<Record<string, readonly string[]>> = {
  'com.ittoedu.language.reading-annotation': [
    '标题',
    '朗读标注文稿',
    '较长停顿符号',
    '重音',
    '较长停顿',
    '连读',
  ],
  'com.ittoedu.language.pinyin-annotation': [
    '标题',
    '汉字与拼音',
    '显示拼音按钮',
    '隐藏拼音按钮',
  ],
  'com.ittoedu.visual.text-container': ['眉题', '标题', '正文', '步骤'],
  'com.ittoedu.visual.image-frame': ['图片标题'],
}

const canvasEditCases: Readonly<Record<string, {
  label: string
  value: string
  expectedText: string
  multiline: boolean
}>> = {
  'com.ittoedu.language.reading-annotation': {
    label: '朗读标注文稿',
    value: '画布更新的 **朗读重音**',
    expectedText: '画布更新的',
    multiline: true,
  },
  'com.ittoedu.language.pinyin-annotation': {
    label: '汉字与拼音',
    value: '新|xīn 词|cí',
    expectedText: '新',
    multiline: true,
  },
  'com.ittoedu.visual.text-container': {
    label: '步骤',
    value: '画布步骤一\n画布步骤二',
    expectedText: '画布步骤一',
    multiline: true,
  },
  'com.ittoedu.visual.image-frame': {
    label: '图片标题',
    value: '画布图片标题',
    expectedText: '画布图片标题',
    multiline: false,
  },
}

const visualStyleEditCases: Readonly<Record<string, {
  value: string
  label: string
}>> = {
  'com.ittoedu.visual.text-container': {
    value: 'sticky-note',
    label: '便利贴',
  },
  'com.ittoedu.visual.image-frame': {
    value: 'sticker',
    label: '贴纸',
  },
}

function removeKnownOutput(filePath: string): void {
  if (existsSync(filePath)) rmSync(filePath, { force: true })
}

function extractZip(zipPath: string, outputPath: string): void {
  const archive = unzipSync(new Uint8Array(readFileSync(zipPath)))
  for (const [archivePath, bytes] of Object.entries(archive)) {
    const target = join(outputPath, ...archivePath.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }
}

async function launchHeadlessBrowser(): Promise<Browser> {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  const executablePath = candidates.find(existsSync)
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  })
}

async function shadowText(locator: Locator): Promise<string> {
  try {
    return await locator.evaluate((host) => (
      host.shadowRoot?.textContent ?? ''
    ).replace(/\s+/g, ' '))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/Execution context was destroyed|Frame was detached|Target page, context or browser has been closed/i.test(message)) {
      // Authoring swaps its sandboxed Player document between scene/resource
      // generations. Returning an empty sample lets expect.poll reacquire the
      // fresh frame instead of turning that intentional navigation into a fail.
      return ''
    }
    throw error
  }
}

async function verifyOfflinePlayer(
  page: Page,
  htmlPath: string | null,
  stressRounds: number,
): Promise<PlayerVerification> {
  const externalRequests: string[] = []
  const pageErrors: string[] = []
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  if (htmlPath) await page.goto(pathToFileURL(htmlPath).toString())
  await expect.poll(() => page.evaluate(
    () => Boolean(window.__H5_LESSON_PLAYER__),
  )).toBe(true)

  const hostSelector = '.lesson-component-mount--scene[data-courseware-component-root]'
  for (const entry of matrixCases) {
    expect(await page.evaluate(({ index }) => {
      const player = window.__H5_LESSON_PLAYER__
      if (!player) return false
      return player.goToScene(index, 'state_initial') || (
        player.getCurrentSceneIndex() === index &&
        player.getCurrentPresentationStateId() === 'state_initial'
      )
    }, entry)).toBe(true)
    await expect.poll(() => page.evaluate(
      () => window.__H5_LESSON_PLAYER__?.getCurrentSceneIndex() ?? -1,
    )).toBe(entry.index)
    await expect(page.locator(hostSelector)).toHaveCount(1)
    await expect.poll(() => shadowText(page.locator(hostSelector)))
      .toContain(entry.baseText)

    expect(await page.evaluate(() => (
      window.__H5_LESSON_PLAYER__?.setPresentationState(
        'state_matrix_override',
      ) ?? false
    ))).toBe(true)
    await expect.poll(() => page.evaluate(
      () => window.__H5_LESSON_PLAYER__?.getCurrentPresentationStateId() ?? null,
    )).toBe('state_matrix_override')
    await expect.poll(() => shadowText(page.locator(hostSelector)))
      .toContain(entry.stateText)
  }

  const stress = await page.evaluate(async ({ rounds, sceneCount }) => {
    let maxMounted = 0
    let minMounted = Number.POSITIVE_INFINITY
    let navigationCount = 0
    for (let round = 0; round < rounds; round += 1) {
      for (let index = 0; index < sceneCount; index += 1) {
        const moved = window.__H5_LESSON_PLAYER__?.goToScene(
          index,
          'state_initial',
        ) ?? false
        if (!moved) throw new Error(`压力翻页失败：round=${round}, scene=${index}`)
        await new Promise<void>((resolveFrame) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
        })
        const mounted = document.querySelectorAll(
          '.lesson-component-mount--scene[data-courseware-component-root]',
        ).length
        maxMounted = Math.max(maxMounted, mounted)
        minMounted = Math.min(minMounted, mounted)
        navigationCount += 1
      }
    }
    return { maxMounted, minMounted, navigationCount }
  }, { rounds: stressRounds, sceneCount: matrixCases.length })

  expect(stress.maxMounted).toBe(1)
  expect(stress.minMounted).toBe(1)
  expect(externalRequests).toEqual([])
  expect(pageErrors).toEqual([])
  return { ...stress, externalRequests, pageErrors }
}

async function expectBackgroundWindowsIsolated(
  app: ElectronApplication,
): Promise<void> {
  if (backgroundE2e !== '1') return
  await expect.poll(() => app.evaluate(({ BrowserWindow }, origin) => {
    const windows = BrowserWindow.getAllWindows()
    return windows.length > 0 && windows.every((window) => {
      const bounds = window.getBounds()
      return !window.isVisible() &&
        !window.isFocused() &&
        window.getOpacity() === 0 &&
        bounds.x === origin &&
        bounds.y === origin
    })
  }, BACKGROUND_E2E_WINDOW_ORIGIN)).toBe(true)
}

async function launchEditor(): Promise<LaunchedEditor> {
  const profilePath = join(
    outputDirectory,
    `electron-profile-${process.pid}-${Date.now()}`,
  )
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profilePath}`],
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      COURSEWARE_COMPONENTS_DIR: catalogRoot,
      [BACKGROUND_E2E_ENV]: backgroundE2e,
    },
  })
  const page = await app.firstWindow()
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const consoleWarnings: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
    if (message.type() === 'warning') consoleWarnings.push(message.text())
  })
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url())
  })
  await page.locator('[data-testid="canvas-stage"] canvas').waitFor()
  await expectBackgroundWindowsIsolated(app)
  const professional = page.getByRole('button', { name: '专业' })
  if (await professional.getAttribute('aria-pressed') !== 'true') {
    await professional.click()
  }
  return {
    app,
    page,
    pageErrors,
    consoleErrors,
    consoleWarnings,
    externalRequests,
  }
}

async function closeEditor(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
    setTimeout(() => electronApp.exit(0), 0)
  }).catch(() => undefined)
  await app.close().catch(() => undefined)
}

async function patchDialogs(
  app: ElectronApplication,
  paths: {
    projectOpen?: string
    projectSave?: string
    htmlSave?: string
    webPackageSave?: string
    pdfSave?: string
    pptxSave?: string
  },
): Promise<void> {
  await app.evaluate(({ dialog }, values) => {
    const saveDialog = async (...args:
      | [Electron.BaseWindow, Electron.SaveDialogOptions]
      | [Electron.SaveDialogOptions]
    ): Promise<Electron.SaveDialogReturnValue> => {
      const options = args.length === 1 ? args[0] : args[1]
      return {
        canceled: false,
        filePath: options.title?.includes('网页')
        ? values.webPackageSave ?? values.projectSave ?? ''
        : options.title?.includes('HTML')
          ? values.htmlSave ?? values.projectSave ?? ''
          : options.title?.includes('PDF')
            ? values.pdfSave ?? values.projectSave ?? ''
            : options.title?.includes('PowerPoint')
              ? values.pptxSave ?? values.projectSave ?? ''
              : values.projectSave ?? '',
      }
    }
    dialog.showSaveDialog = saveDialog
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: values.projectOpen ? [values.projectOpen] : [],
    })
  }, paths)
}

async function continueExportPreflight(page: Page): Promise<void> {
  const dialog = page.getByRole('alertdialog', { name: /导出预检/ })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('0 个错误')
  await dialog.getByRole('button', { name: '继续导出' }).click()
}

async function exportThroughUi(
  page: Page,
  testId: 'export-single-html' | 'export-web-package' | 'export-pdf' | 'export-pptx',
  outputPath: string,
  minimumBytes: number,
): Promise<void> {
  await page.getByTestId('export-menu-trigger').click()
  await page.getByTestId(testId).click()
  await continueExportPreflight(page)
  const sizeDialog = page.getByRole('alertdialog', { name: '单 HTML 文件较大' })
  if (await sizeDialog.isVisible().catch(() => false)) {
    await sizeDialog.getByRole('button', { name: '仍导出单 HTML' }).click()
  }
  await expect.poll(
    () => existsSync(outputPath) ? statSync(outputPath).size : 0,
    { timeout: 120_000 },
  ).toBeGreaterThan(minimumBytes)
}

test.describe.serial('Component Catalog V8 四组件全矩阵', () => {
  test.skip(
    !matrixFixtureAvailable,
    '请先运行 npm run build:component-catalog-matrix 生成四组件矩阵。',
  )

  test.beforeAll(() => {
    expect(matrixProject.schemaVersion).toBe(8)
    expect(matrixCases).toHaveLength(expectedPackageCount)
    expect(Object.keys(matrixProject.componentPackages)).toHaveLength(expectedPackageCount)
    expect(Object.values(matrixProject.componentPackages).every((metadata) => (
      /^[0-9a-f]{64}$/.test(metadata.contentSha256)
    ))).toBe(true)
    expect(existsSync(matrixLessonPath)).toBe(true)
    expect(existsSync(matrixHtmlPath)).toBe(true)
    expect(existsSync(matrixWebPackagePath)).toBe(true)
    mkdirSync(outputDirectory, { recursive: true })
    ;[
      importedRoundtripPath,
      exportedHtmlPath,
      exportedWebPackagePath,
      exportedPdfPath,
      exportedPptxPath,
      runtimeEvidencePath,
    ].forEach(removeKnownOutput)
  })

  test('生成物的单 HTML 与网页包离线运行四组件、状态覆盖和 100 次压力翻页', async () => {
    test.setTimeout(180_000)
    const browser = await launchHeadlessBrowser()
    try {
      const standalone = await browser.newPage()
      const standaloneEvidence = await verifyOfflinePlayer(
        standalone,
        matrixHtmlPath,
        pressureRounds,
      )
      await standalone.screenshot({
        path: join(outputDirectory, 'standalone-player.png'),
        fullPage: true,
      })

      extractZip(matrixWebPackagePath, exportedWebDirectory)
      const packaged = await browser.newPage()
      const packageEvidence = await verifyOfflinePlayer(
        packaged,
        join(exportedWebDirectory, 'index.html'),
        1,
      )
      expect(standaloneEvidence.navigationCount).toBe(expectedPressureNavigations)
      expect(packageEvidence.navigationCount).toBe(expectedPackageCount)
      writeFileSync(runtimeEvidencePath, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        verified: {
          generatedStandaloneHtml: standaloneEvidence,
          generatedWebPackage: packageEvidence,
        },
        pressure: {
          rounds: pressureRounds,
          sceneCount: expectedPackageCount,
          navigationCount: standaloneEvidence.navigationCount,
          maxMounted: standaloneEvidence.maxMounted,
          minMounted: standaloneEvidence.minMounted,
        },
        notYetVerified: [
          'electron-catalog-ui-roundtrip',
          'electron-editor-player-thumbnail',
          'electron-single-html-export',
          'electron-web-package-export',
          'electron-pdf-export',
          'electron-pptx-export',
        ],
      }, null, 2)}\n`)
    } finally {
      await browser.close()
    }
  })

  test('目录 UI 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX', async () => {
    test.setTimeout(480_000)
    const {
      app,
      page,
      pageErrors,
      consoleErrors,
      consoleWarnings,
      externalRequests,
    } = await launchEditor()
    const priorEvidence = existsSync(runtimeEvidencePath)
      ? JSON.parse(readFileSync(runtimeEvidencePath, 'utf8')) as Record<string, unknown>
      : {}
    const evidence: Record<string, unknown> = {
      ...priorEvidence,
      generatedAt: new Date().toISOString(),
      backgroundWindowIsolation: backgroundE2e === '1',
      packageCount: matrixCases.length,
    }
    try {
      await patchDialogs(app, { projectSave: importedRoundtripPath })
      await page.getByRole('tab', { name: '组件', exact: true }).click()
      await page.getByTestId('open-component-library').click()
      await expect(page.locator('[data-testid^="catalog-component-"]'))
        .toHaveCount(expectedPackageCount)

      for (const entry of matrixCases) {
        const catalogEntry = page.getByTestId(`catalog-component-${entry.packageId}`)
        await expect(catalogEntry).toContainText('试验')
        await expect(catalogEntry).not.toContainText('发布阻断')
      }
      const firstCatalogEntry = page.getByTestId(
        `catalog-component-${matrixCases[0]!.packageId}`,
      )
      await firstCatalogEntry.getByRole('button', { name: '详情' }).click()
      const catalogDetails = page.getByTestId('component-details-dialog')
      await expect(catalogDetails).toContainText('发布阻断')
      await catalogDetails.getByRole('button', { name: '关闭组件详情' }).click()

      const libraryScreenshotPath = join(
        outputDirectory,
        'component-library.png',
      )
      rmSync(libraryScreenshotPath, { force: true })
      await page.screenshot({
        path: libraryScreenshotPath,
        fullPage: true,
      })

      await page.getByRole('button', { name: '全选当前结果' }).click()
      await expect(page.getByText(`已选择 ${expectedPackageCount} 个组件`)).toBeVisible()
      await page.getByRole('button', { name: `加入工程（${expectedPackageCount}）` }).click()
      await expect(page.getByRole('dialog', { name: '内置组件加入结果' }))
        .toHaveCount(0)
      await expect(page.locator('[data-testid^="component-package-"]'))
        .toHaveCount(expectedPackageCount)

      // The visible editing renderer is the same isolated Player used at
      // runtime, hosted in the sandboxed authoring iframe. The legacy Phaser
      // canvas in the parent is only the hit-proxy/selection layer.
      const editorHost = page.frameLocator('iframe[title="统一编辑画布"]')
        .locator('.lesson-component-mount--scene[data-courseware-component-root]')
      for (const [index, entry] of matrixCases.entries()) {
        const projectComponent = page.getByTestId(`component-${entry.packageId}`)
        await expect(projectComponent).toContainText(`v${entry.version}`)
        await projectComponent.click()
        await expect(editorHost).toHaveCount(index + 1)
      }

      await page.getByTestId('open-component-library').click()
      for (const entry of matrixCases) {
        await expect(page.getByTestId(`catalog-component-${entry.packageId}`))
          .toContainText('已加入工程')
      }
      await page.getByRole('button', { name: '返回编辑器' }).click()

      // 删除、撤销、重做、再次撤销恢复，验证 UI 历史栈和宿主销毁重建。
      await page.getByRole('tab', { name: '图层' }).click()
      await expect(page.locator('.node-item')).toHaveCount(expectedPackageCount)
      await page.locator('.node-item').last().getByTitle('删除节点').click()
      await expect(editorHost).toHaveCount(expectedPackageCount - 1)
      await page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
      await expect(editorHost).toHaveCount(expectedPackageCount)
      await page.getByRole('button', {
        name: '重做（Ctrl+Y / Ctrl+Shift+Z）',
      }).click()
      await expect(editorHost).toHaveCount(expectedPackageCount - 1)
      await page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
      await expect(editorHost).toHaveCount(expectedPackageCount)

      await page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
      await expect.poll(() => existsSync(importedRoundtripPath)).toBe(true)
      const roundtripArchive = unzipSync(
        new Uint8Array(readFileSync(importedRoundtripPath)),
      )
      const roundtripProject = JSON.parse(
        new TextDecoder().decode(roundtripArchive['project.json']),
      ) as MatrixProject
      expect(Object.keys(roundtripProject.componentPackages)).toHaveLength(expectedPackageCount)
      expect(Object.values(roundtripProject.componentPackages).every((metadata) => (
        /^[0-9a-f]{64}$/.test(metadata.contentSha256) &&
        Boolean(metadata.sha256) &&
        Boolean(metadata.importedAt) &&
        Boolean(metadata.sourceLabel)
      ))).toBe(true)
      expect(Object.keys(roundtripArchive).filter((entry) => (
        /^components\/[^/]+\/manifest\.json$/.test(entry)
      ))).toHaveLength(expectedPackageCount)

      await patchDialogs(app, { projectOpen: importedRoundtripPath })
      await page.getByRole('button', { name: '打开工程（Ctrl+O）' }).click()
      await expect(editorHost).toHaveCount(expectedPackageCount)

      await patchDialogs(app, {
        projectOpen: matrixLessonPath,
        htmlSave: exportedHtmlPath,
        webPackageSave: exportedWebPackagePath,
        pdfSave: exportedPdfPath,
        pptxSave: exportedPptxPath,
      })
      await page.getByRole('button', { name: '打开工程（Ctrl+O）' }).click()
      await expect(page.locator('.scene-item')).toHaveCount(expectedPackageCount)
      await expect(page.locator('.scene-thumbnail')).toHaveCount(expectedPackageCount)
      await expect(page.locator('.thumbnail-state-badge')).toHaveCount(expectedPackageCount)
      await expect(page.locator('.thumbnail-state-badge').first())
        .toContainText('矩阵状态覆盖')
      const thumbnails = page.locator('.scene-thumbnail')
      const thumbnailPixels: number[] = []
      for (let index = 0; index < matrixCases.length; index += 1) {
        const thumbnail = thumbnails.nth(index)
        // Thumbnails are intentionally lazy-painted by IntersectionObserver.
        // Scroll every scene into the panel viewport before reading its canvas.
        await thumbnail.scrollIntoViewIfNeeded()
        await expect.poll(() => thumbnail.evaluate((candidate) => {
          const canvas = candidate as HTMLCanvasElement
          const context = canvas.getContext('2d')
          if (!context) return 0
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          let nonTransparent = 0
          for (let offset = 3; offset < pixels.length; offset += 4) {
            if (pixels[offset]! > 0) nonTransparent += 1
          }
          return nonTransparent
        })).toBeGreaterThan(1_000)
        thumbnailPixels.push(await thumbnail.evaluate((candidate) => {
          const canvas = candidate as HTMLCanvasElement
          const context = canvas.getContext('2d')
          if (!context) return 0
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          let nonTransparent = 0
          for (let offset = 3; offset < pixels.length; offset += 4) {
            if (pixels[offset]! > 0) nonTransparent += 1
          }
          return nonTransparent
        }))
      }
      expect(thumbnailPixels).toHaveLength(expectedPackageCount)

      for (const entry of matrixCases) {
        await page.getByTestId(`scene-item-${entry.sceneId}`).click()
        await expect(editorHost).toHaveCount(1)
        for (const label of expectedCanvasTextLabels[entry.packageId] ?? []) {
          await expect(page.getByRole('button', {
            name: `${label}，双击编辑组件文字`,
            exact: true,
          })).toHaveCount(1)
        }
        const editCase = canvasEditCases[entry.packageId]
        if (!editCase) throw new Error(`${entry.packageId} 缺少画布文字验证用例`)
        const editTarget = page.getByRole('button', {
          name: `${editCase.label}，双击编辑组件文字`,
          exact: true,
        })
        const editBounds = await editTarget.boundingBox()
        if (!editBounds) throw new Error(`${entry.packageId} 的 ${editCase.label} 画布目标不可见`)
        await page.mouse.dblclick(
          editBounds.x + editBounds.width / 2,
          editBounds.y + editBounds.height / 2,
          { delay: 40 },
        )
        const canvasEditor = page.getByTestId('canvas-plain-text-editor')
        const textBox = canvasEditor.getByRole('textbox', {
          name: editCase.label,
          exact: true,
        })
        await expect(textBox).toBeFocused()
        await textBox.fill(editCase.value)
        await textBox.press(editCase.multiline ? 'Control+Enter' : 'Enter')
        await expect(canvasEditor).toHaveCount(0)
        await expect.poll(() => shadowText(editorHost)).toContain(editCase.expectedText)
        entry.baseText = editCase.expectedText
        const visualStyleCase = visualStyleEditCases[entry.packageId]
        if (visualStyleCase) {
          await page.getByRole('tab', { name: '图层' }).click()
          await page.getByTestId(`node-item-${entry.nodeId}`)
            .locator('.node-name')
            .click()
          await expect(page.getByRole('tab', { name: '属性' }))
            .toHaveAttribute('aria-selected', 'true')
          await expect(page.locator('.sidebar-content')).toContainText('组件内容')
          const styleSelect = page.getByLabel('视觉样式', { exact: true })
          await styleSelect.selectOption(visualStyleCase.value)
          await expect(styleSelect).toHaveValue(visualStyleCase.value)
          await expect(styleSelect).toContainText(visualStyleCase.label)
          await expect.poll(() => editorHost.evaluate((host) => (
            host.shadowRoot?.querySelector<HTMLElement>('.stage')?.dataset.style ?? null
          ))).toBe(visualStyleCase.value)
        }
        await page.getByRole('button', {
          name: /矩阵状态覆盖，命名状态/,
        }).click()
        await expect.poll(() => shadowText(editorHost))
          .toContain(entry.stateText)
      }
      await page.screenshot({
        path: join(outputDirectory, 'editor-four-component-matrix.png'),
        fullPage: true,
      })

      const previewWindow = app.waitForEvent('window')
      await page.getByRole('button', {
        name: '在独立窗口整课预览',
      }).click()
      const preview = await previewWindow
      // Hidden Electron windows deliberately throttle animation frames. The
      // 25-round/100-navigation pressure case runs in headless Chromium above;
      // here one complete four-scene pass proves the Electron preview surface.
      const previewEvidence = await verifyOfflinePlayer(preview, null, 1)
      evidence.preview = previewEvidence
      await preview.screenshot({
        path: join(outputDirectory, 'preview-player.png'),
        fullPage: true,
      })
      await expectBackgroundWindowsIsolated(app)
      await preview.close()

      await exportThroughUi(page, 'export-single-html', exportedHtmlPath, 10_000)
      await exportThroughUi(
        page,
        'export-web-package',
        exportedWebPackagePath,
        10_000,
      )
      await exportThroughUi(page, 'export-pdf', exportedPdfPath, 10_000)
      await exportThroughUi(page, 'export-pptx', exportedPptxPath, 10_000)

      expect(readFileSync(exportedHtmlPath, 'utf8')).not.toMatch(/https?:\/\//i)
      const webArchive = unzipSync(
        new Uint8Array(readFileSync(exportedWebPackagePath)),
      )
      expect(Object.keys(webArchive)).toEqual(expect.arrayContaining([
        'index.html',
        'course-data.js',
        'player/player.iife.js',
        'player/player.css',
      ]))
      expect(new TextDecoder().decode(webArchive['course-data.js']))
        .not.toMatch(/https?:\/\//i)

      const pdf = readFileSync(exportedPdfPath)
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
      expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)?.length ?? 0)
        .toBe(expectedPackageCount)

      const pptx = unzipSync(new Uint8Array(readFileSync(exportedPptxPath)))
      const slidePaths = Object.keys(pptx).filter((entry) => (
        /^ppt\/slides\/slide\d+\.xml$/.test(entry)
      ))
      expect(slidePaths).toHaveLength(expectedPackageCount)
      for (const slidePath of slidePaths) {
        const xml = new TextDecoder().decode(pptx[slidePath])
        expect(xml).toContain('<p:pic>')
        expect(xml).toContain('矩阵组件')
      }

      const browser = await launchHeadlessBrowser()
      try {
        const standalone = await browser.newPage()
        evidence.exportedStandalone = await verifyOfflinePlayer(
          standalone,
          exportedHtmlPath,
          1,
        )
        extractZip(exportedWebPackagePath, exportedWebDirectory)
        const packaged = await browser.newPage()
        evidence.exportedWebPackage = await verifyOfflinePlayer(
          packaged,
          join(exportedWebDirectory, 'index.html'),
          1,
        )
      } finally {
        await browser.close()
      }

      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
      expect(consoleWarnings.filter((message) => (
        /组件.*(?:失败|error)|snapshot.*failed/i.test(message)
      ))).toEqual([])
      expect(externalRequests).toEqual([])
      evidence.outputs = {
        importedRoundtripPath,
        exportedHtmlPath,
        exportedWebPackagePath,
        exportedPdfPath,
        exportedPptxPath,
      }
      evidence.staticExports = {
        pdfPages: expectedPackageCount,
        pptxSlides: expectedPackageCount,
      }
      delete evidence.notYetVerified
      writeFileSync(runtimeEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
    } finally {
      await closeEditor(app)
    }
  })
})
