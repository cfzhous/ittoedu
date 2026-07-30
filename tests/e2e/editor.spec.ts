import { _electron as electron, chromium, expect, test } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ElectronApplication, Page } from 'playwright'
import sharp from 'sharp'
import { strToU8, unzipSync, zipSync } from 'fflate'

const root = resolve(__dirname, '..', '..')
const outputDir = join(tmpdir(), 'phaser-courseware-editor-e2e')
const e2eUserDataPath = join(outputDir, 'electron-profile')
const projectPath = join(outputDir, 'roundtrip.h5lesson')
const componentProjectPath = join(outputDir, 'component-roundtrip.h5lesson')
const globalComponentProjectPath = join(outputDir, 'global-component-roundtrip.h5lesson')
const globalNativeProjectPath = join(outputDir, 'global-native-roundtrip.h5lesson')
const imageProjectPath = join(outputDir, 'image-roundtrip.h5lesson')
const htmlPath = join(outputDir, 'offline-courseware.html')
const webPackagePath = join(outputDir, 'offline-courseware-web.zip')
const webPackageDirectory = join(outputDir, 'offline-courseware-web')
const pdfPath = join(outputDir, 'static-courseware.pdf')
const pptxPath = join(outputDir, 'static-courseware.pptx')
const v3RuntimeExportProjectPath = join(outputDir, 'v3-runtime-export.h5lesson')
const v3RuntimePdfPath = join(outputDir, 'v3-runtime-export.pdf')
const v3RuntimePptxPath = join(outputDir, 'v3-runtime-export.pptx')
const lessonHtmlPath = join(
  root,
  'artifacts',
  'photosynthesis-lesson',
  'photosynthesis-interactive-lesson.html',
)
const visualOutputDirectory = join(root, 'output', 'playwright')
const sampleComponentPath = join(root, 'examples', 'sample-counter.h5component')
const globalComponentPath = join(outputDir, 'sample-global-nav.h5component')
const firstImagePath = join(root, 'resources', 'icons', 'icon.png')
const replacementImagePath = join(
  root,
  'examples',
  'sample-counter-component',
  'thumbnail.png',
)

interface LaunchedEditor {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
  consoleWarnings: string[]
  externalRequests: string[]
}

async function launchEditor(options: {
  preserveRecoveryPrompt?: boolean
  mode?: 'simple' | 'professional'
} = {}): Promise<LaunchedEditor> {
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${e2eUserDataPath}`],
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
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
  const modeButton = page.getByRole('button', {
    name: options.mode === 'simple' ? '简洁' : '专业',
  })
  if (await modeButton.getAttribute('aria-pressed') !== 'true') {
    await modeButton.click()
  }
  if (!options.preserveRecoveryPrompt) {
    const recoveryDialog = page.getByRole('alertdialog', {
      name: '发现未完成的本地恢复副本',
    })
    const recoveryVisible = await recoveryDialog
      .waitFor({ state: 'visible', timeout: 800 })
      .then(() => true)
      .catch(() => false)
    if (recoveryVisible) {
      await recoveryDialog.getByRole('button', { name: '丢弃副本' }).click()
      await expect(recoveryDialog).toHaveCount(0)
    }
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

async function closeEditor(app: ElectronApplication) {
  await app.evaluate(({ app: electronApp, BrowserWindow }) => {
    BrowserWindow.getAllWindows().forEach((window) => window.destroy())
    setTimeout(() => electronApp.exit(0), 0)
  }).catch(() => undefined)
  await app.close().catch(() => undefined)
}

async function playerSceneIndex(page: Page): Promise<number | null> {
  return page.evaluate(
    () => window.__H5_LESSON_PLAYER__?.getCurrentSceneIndex() ?? null,
  )
}

async function expectCanvasPlayerScene(
  page: Page,
  expectedIndex: number,
): Promise<void> {
  await expect(page.locator('.lesson-footer')).toHaveCount(0)
  await expect(page.locator('.lesson-page-indicator')).toHaveCount(0)
  await expect.poll(() => playerSceneIndex(page)).toBe(expectedIndex)
}

async function navigateCanvasPlayerByKeyboard(
  page: Page,
  key: 'ArrowLeft' | 'ArrowRight',
  expectedIndex: number,
): Promise<void> {
  await page.keyboard.press(key)
  await expect.poll(() => playerSceneIndex(page)).toBe(expectedIndex)
}

async function patchDialogs(
  app: ElectronApplication,
  paths: {
    projectSave?: string
    projectOpen?: string
    componentOpen?: string
    imageOpen?: string
    htmlSave?: string
    webPackageSave?: string
    pdfSave?: string
    pptxSave?: string
  },
) {
  await app.evaluate(({ dialog }, values) => {
    dialog.showSaveDialog = async (
      _window: Electron.BrowserWindow,
      options: Electron.SaveDialogOptions,
    ) => ({
      canceled: false,
      filePath: options.title?.includes('网页')
        ? values.webPackageSave
        : options.title?.includes('HTML')
          ? values.htmlSave
          : options.title?.includes('PDF')
          ? values.pdfSave
          : options.title?.includes('PowerPoint')
            ? values.pptxSave
            : values.projectSave,
    })
    dialog.showOpenDialog = async (
      _window: Electron.BrowserWindow,
      options: Electron.OpenDialogOptions,
    ) => ({
      canceled: false,
      filePaths: [
        options.title?.includes('组件')
          ? values.componentOpen
          : options.title?.includes('图片')
            ? values.imageOpen
            : values.projectOpen,
      ].filter((value): value is string => Boolean(value)),
    })
  }, paths)
}

async function moveSortableUp(
  source: ReturnType<Page['locator']>,
  steps: number,
) {
  await source.focus()
  await source.press('Space')
  await source.page().waitForTimeout(100)
  for (let index = 0; index < steps; index += 1) {
    await source.press('ArrowUp')
    await source.page().waitForTimeout(60)
  }
  await source.press('Space')
  await source.page().waitForTimeout(100)
}

async function averagePixelDifference(
  first: Buffer,
  second: Buffer,
): Promise<number> {
  const [firstPixels, secondPixels] = await Promise.all([
    sharp(first).raw().toBuffer(),
    sharp(second).raw().toBuffer(),
  ])
  if (firstPixels.length !== secondPixels.length) return Number.POSITIVE_INFINITY
  let total = 0
  for (let index = 0; index < firstPixels.length; index += 1) {
    total += Math.abs(firstPixels[index]! - secondPixels[index]!)
  }
  return total / firstPixels.length
}

async function addText(page: Page) {
  await page.getByRole('tab', { name: '元素' }).click()
  await page.getByRole('tab', { name: '常用' }).click()
  await page.getByTestId('add-text').click()
}

async function addRectangle(page: Page) {
  await page.getByRole('tab', { name: '元素' }).click()
  await page.getByRole('tab', { name: '常用' }).click()
  await page.getByTestId('add-rectangle').click()
}

async function dragElementToCanvas(
  page: Page,
  testId: string,
  logicalPoint: { x: number; y: number },
): Promise<void> {
  const canvas = page.locator('[data-testid="canvas-stage"] canvas')
  const workspace = page.getByRole('main', { name: '课件画布' })
  const [canvasBounds, workspaceBounds] = await Promise.all([
    canvas.boundingBox(),
    workspace.boundingBox(),
  ])
  if (!canvasBounds || !workspaceBounds) {
    throw new Error('课件画布或工作区不可见')
  }
  // React owns dragover/drop on the workspace rather than the nested Phaser
  // canvas. Target the real listener while keeping the drop point inside the
  // canvas so Chromium preserves the custom courseware MIME payload.
  await page.getByTestId(testId).dragTo(workspace, {
    targetPosition: {
      x: canvasBounds.x - workspaceBounds.x + logicalPoint.x,
      y: canvasBounds.y - workspaceBounds.y + logicalPoint.y,
    },
  })
  const propertiesTab = page.getByRole('tab', { name: '属性' })
  if (await propertiesTab.getAttribute('aria-selected') !== 'true') {
    // Chromium/Electron can occasionally finish the pointer gesture without
    // delivering the HTML5 drop event. Replay the same browser-native drag
    // payload only when the store did not acknowledge the first drop.
    await page.evaluate(
      ({ sourceTestId, clientX, clientY }) => {
        const source = document.querySelector<HTMLElement>(
          `[data-testid="${sourceTestId}"]`,
        )
        const target = document.querySelector<HTMLElement>(
          'main[aria-label="课件画布"]',
        )
        if (!source || !target) throw new Error('拖放源或课件画布不可见')
        const dataTransfer = new DataTransfer()
        const dispatch = (
          element: HTMLElement,
          type: 'dragstart' | 'dragover' | 'drop' | 'dragend',
        ) => element.dispatchEvent(new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX,
          clientY,
          dataTransfer,
        }))
        dispatch(source, 'dragstart')
        dispatch(target, 'dragover')
        dispatch(target, 'drop')
        dispatch(source, 'dragend')
      },
      {
        sourceTestId: testId,
        clientX: canvasBounds.x + logicalPoint.x,
        clientY: canvasBounds.y + logicalPoint.y,
      },
    )
  }
  await expect(propertiesTab).toHaveAttribute('aria-selected', 'true')
}

function commonNodeField(page: Page, label: 'X' | 'Y' | '宽' | '高') {
  return page.locator('.property-section').first().getByLabel(label, { exact: true })
}

async function editDefaultText(page: Page, value: string) {
  await page.getByRole('tab', { name: '属性' }).click()
  await page.getByRole('button', { name: '编辑局部文字格式' }).click()
  const editor = page.getByTestId('text-edit-overlay')
  await editor.waitFor()
  await editor.fill(value)
  await editor.press('Control+Enter')
  await expect(editor).toHaveCount(0)
  await page.waitForTimeout(500)
}

async function editDefaultTextWithComposition(page: Page, value: string) {
  await page.getByRole('tab', { name: '属性' }).click()
  await page.getByRole('button', { name: '编辑局部文字格式' }).click()
  const editor = page.getByTestId('text-edit-overlay')
  await editor.waitFor()
  await editor.dispatchEvent('compositionstart', { data: '中' })
  await editor.fill(value)
  await editor.press('Control+Enter')
  await expect(editor).toBeVisible()
  await editor.dispatchEvent('compositionend', { data: '中文' })
  await editor.evaluate((element) => (element as HTMLTextAreaElement).blur())
  await expect(editor).toHaveCount(0)
}

test.describe.serial('Phaser 课件编辑器 V1.6', () => {
  test.beforeAll(() => {
    mkdirSync(outputDir, { recursive: true })
    mkdirSync(visualOutputDirectory, { recursive: true })
    rmSync(e2eUserDataPath, { recursive: true, force: true })
    for (const file of [
      projectPath,
      componentProjectPath,
      globalComponentProjectPath,
      globalNativeProjectPath,
      imageProjectPath,
      htmlPath,
      webPackagePath,
      pdfPath,
      pptxPath,
      v3RuntimeExportProjectPath,
      v3RuntimePdfPath,
      v3RuntimePptxPath,
    ]) {
      if (existsSync(file)) rmSync(file)
    }
    const globalManifest = {
      schemaVersion: 3,
      runtimeApiVersion: 3,
      supportedScopes: ['scene', 'global'],
      id: 'com.example.global-nav',
      name: '全局导航条',
      version: '3.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 560, height: 96 },
      minSize: { width: 260, height: 64 },
      preserveAspectRatio: false,
      assets: {},
      defaultProps: {
        content: {
          title: '课程导航',
          buttons: { replay: '重播本页', next: '下一页' },
        },
      },
      editor: {
        properties: [
          { key: 'content.title', label: '全局标题', type: 'text' },
          { key: 'content.buttons.next', label: '下一页文字', type: 'text' },
        ],
      },
    }
    const globalRuntime = `(function(){'use strict';window.CoursewareComponent.define({id:'com.example.global-nav',runtimeApiVersion:3,create:function(ctx){var bg=ctx.scene.add.rectangle(0,0,ctx.width,ctx.height,0x0f766e,0.96).setOrigin(0).setRounded(18);var title=ctx.scene.add.text(24,20,String(ctx.props.content.title),{fontFamily:'Microsoft YaHei',fontSize:'25px',fontStyle:'bold',color:'#ffffff'});var replay=ctx.scene.add.text(330,35,String(ctx.props.content.buttons.replay),{fontFamily:'Microsoft YaHei',fontSize:'18px',color:'#ccfbf1'}).setInteractive();var next=ctx.scene.add.text(450,35,String(ctx.props.content.buttons.next),{fontFamily:'Microsoft YaHei',fontSize:'18px',color:'#ffffff'}).setInteractive();replay.on('pointerup',ctx.actions.replayScene);next.on('pointerup',ctx.actions.nextScene);ctx.root.add([bg,title,replay,next]);return{destroy:function(){replay.off('pointerup',ctx.actions.replayScene);next.off('pointerup',ctx.actions.nextScene);}};}});})();`
    writeFileSync(
      globalComponentPath,
      Buffer.from(zipSync({
        'manifest.json': strToU8(`${JSON.stringify(globalManifest, null, 2)}\n`),
        'runtime.js': strToU8(globalRuntime),
      }, { level: 9 })),
    )
    rmSync(webPackageDirectory, { recursive: true, force: true })
  })

  test('里程碑闭环：简洁模式完成文字、透明度、左起竖排与出现动画试运行', async () => {
    const { app, page, pageErrors, consoleErrors } = await launchEditor({
      mode: 'simple',
    })
    try {
      await expect(page.getByRole('tab', { name: '元素' })).toBeVisible()
      await expect(page.getByRole('tab', { name: '互动与动画' })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: '开发' })).toHaveCount(0)
      await page.getByRole('tab', { name: '媒体' }).click()
      await expect(page.getByTestId('media-tab')).toBeVisible()
      await expect(page.getByTestId('add-image')).toHaveCount(0)
      await expect(page.getByTestId('add-video')).toHaveCount(0)
      await expect(page.getByTestId('import-audio')).toHaveCount(0)
      await expect(page.getByRole('button', { name: '导入声音' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: '导入视频' })).toHaveCount(0)

      await addText(page)
      await page.getByRole('tab', { name: '属性' }).click()
      const transparency = page.getByLabel('透明度 %', { exact: true })
      await transparency.fill('50')
      await transparency.press('Enter')
      await expect(transparency).toHaveValue('50')

      await page.getByRole('button', { name: '展开字体列表' }).click()
      await expect(page.getByRole('option', {
        name: /微软雅黑，Microsoft YaHei，/,
      })).toBeVisible()
      await page.getByRole('button', { name: '收起字体列表' }).click()

      await page.getByLabel('文字方向').selectOption('vertical-lr')
      const height = commonNodeField(page, '高')
      await expect(height).toBeEnabled()
      await height.fill('260')
      await height.press('Enter')
      await expect(height).toHaveValue('260')

      const simpleMotion = page.getByTestId('simple-entrance-animation')
      await simpleMotion.getByRole('button', { name: '淡入' }).click()
      await expect(
        simpleMotion.getByRole('button', { name: '淡入' }),
      ).toHaveAttribute('aria-pressed', 'true')
      await simpleMotion.getByRole('button', { name: '预览' }).click()

      await page.getByRole('button', {
        name: '当前位置试运行',
        exact: true,
      }).click()
      await expect(
        page.frameLocator('iframe[title="当前位置试运行"]')
          .locator('.lesson-canvas-host canvas'),
      ).toBeVisible({ timeout: 15_000 })
      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('里程碑闭环：专业模式创建、复制、排序规则并修改受控运行时', async () => {
    const { app, page, pageErrors, consoleErrors } = await launchEditor()
    try {
      await addText(page)
      await page.getByRole('tab', { name: '互动与动画' }).click()
      await page.getByRole('button', { name: '使用模板' }).click()
      await expect(page.getByRole('group', { name: '规则 1' })).toBeVisible()
      await page.getByRole('button', { name: '复制规则 1' }).click()
      await expect(page.getByRole('group', { name: '规则 2' })).toBeVisible()
      await page.getByRole('button', { name: '上移规则 2' }).click()

      await page.getByRole('tab', { name: '开发' }).click()
      await expect(page.getByText('工程开发工作台')).toBeVisible()
      await expect(page.getByRole('tab', { name: /^运行时/ })).toBeVisible()
      await expect(page.getByRole('tab', { name: /^对象 JSON/ })).toBeVisible()
      await expect(page.getByRole('tab', { name: /^规则 JSON/ })).toBeVisible()
      await expect(page.getByRole('tab', { name: /^组件代码/ })).toBeVisible()
      expect(await page.locator('.right-sidebar--developer').evaluate(
        (element) => element.getBoundingClientRect().width,
      )).toBeGreaterThanOrEqual(450)
      await page.getByRole('button', { name: '创建运行时模板' }).click()
      const runtimeSource = page.getByRole('textbox', {
        name: '场景运行时源码',
      })
      await expect(runtimeSource).toHaveValue(/CoursewareRuntime\.define/)
      await expect(runtimeSource).toHaveAttribute('wrap', 'off')
      const runtimeEditor = runtimeSource.locator('xpath=ancestor::section[1]')
      await runtimeEditor.getByRole('button', { name: '校验并应用' }).click()
      await expect(runtimeEditor.getByText(
        '校验通过，修改已写入工程历史。',
        { exact: true },
      )).toBeVisible()
      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('当前位置试运行：Blob 沙箱中的真实 Player 可启动', async () => {
    const { app, page, pageErrors, consoleErrors, externalRequests } = await launchEditor()
    try {
      await page.getByRole('button', { name: '专业' }).click()
      await page.getByRole('tab', { name: '互动与动画' }).click()
      await expect(
        page.getByRole('heading', { name: '互动与动画' }),
      ).toBeVisible()
      await page.getByTestId('add-scene').click()
      await expect(
        page.locator('.scene-item').filter({ hasText: '场景 2' }),
      ).toHaveClass(/scene-item--active/)
      await page.getByRole('button', { name: '新建场景状态' }).click()
      await expect(page.getByRole('button', {
        name: /状态 2，命名状态/,
      })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', {
        name: '当前位置试运行',
        exact: true,
      }).click()

      const previewFrame = page.locator('iframe[title="当前位置试运行"]')
      await expect(previewFrame).toHaveAttribute('sandbox', 'allow-scripts')
      await expect(previewFrame).toHaveAttribute('src', /^blob:/)
      await expect(
        page.frameLocator('iframe[title="当前位置试运行"]')
          .locator('.lesson-canvas-host canvas'),
      ).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('.runtime-preview-loading')).toHaveCount(0)
      const runtimeFrame = page.frames().find((frame) => (
        frame !== page.mainFrame() && frame.url().startsWith('blob:')
      ))
      if (!runtimeFrame) throw new Error('当前位置试运行 iframe 未创建')
      await expect.poll(() => runtimeFrame.evaluate(
        () => (window as any).__H5_LESSON_PLAYER__?.getCurrentSceneIndex() ?? null,
      )).toBe(1)
      await expect.poll(() => runtimeFrame.evaluate(
        () => (window as any).__H5_LESSON_PLAYER__?.getCurrentPresentationStateId() ?? null,
      )).not.toBe('state_initial')

      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('画布视图支持轻量缩放并一键恢复适合窗口', async () => {
    const { app, page, pageErrors, consoleErrors } = await launchEditor()
    try {
      const zoom = page.getByLabel('画布缩放比例')
      const stage = page.getByTestId('canvas-stage')
      await expect(zoom).toHaveText('100%')
      await page.getByRole('button', { name: '放大画布' }).click()
      await expect(zoom).toHaveText('110%')
      await expect(stage).toHaveAttribute('style', /scale\(1\.1\)/)
      await page.getByRole('button', { name: '适合窗口' }).click()
      await expect(zoom).toHaveText('100%')
      await expect(stage).toHaveAttribute('style', /translate3d\(0px, 0px, 0px\) scale\(1\)/)
      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 1：场景新增、排序与删除', async () => {
    const { app, page, pageErrors, consoleErrors, externalRequests } = await launchEditor()
    try {
      await page.getByTestId('add-scene').click()
      await page.getByTestId('add-scene').click()
      await expect(page.locator('.scene-item')).toHaveCount(3)

      const before = await page.locator('.scene-name').allTextContents()
      expect(before).toEqual(['场景 1', '场景 2', '场景 3'])
      const lastItem = page.locator('.scene-item').last()
      await moveSortableUp(lastItem.locator('.drag-handle'), 2)
      await expect
        .poll(() => page.locator('.scene-name').allTextContents())
        .toEqual(['场景 3', '场景 1', '场景 2'])

      await page
        .locator('.scene-item')
        .nth(1)
        .locator('.icon-button--danger')
        .click()
      await page.getByRole('button', { name: '删除场景' }).last().click()
      await expect(page.locator('.scene-item')).toHaveCount(2)
      await expect
        .poll(() => page.locator('.scene-name').allTextContents())
        .toEqual(['场景 3', '场景 2'])
      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 2：中文文本、位置、样式与工程往返', async () => {
    const { app, page, pageErrors, externalRequests } = await launchEditor()
    try {
      await patchDialogs(app, {
        projectSave: projectPath,
        projectOpen: projectPath,
      })
      await addText(page)
      await editDefaultTextWithComposition(
        page,
        '中文课件标题\n第二行内容\n第三行用于验证自动高度',
      )
      await page.getByRole('tab', { name: '属性' }).click()
      await expect(page.locator('.form-textarea')).toHaveValue(
        '中文课件标题\n第二行内容\n第三行用于验证自动高度',
      )
      const fontSize = page
        .locator('.property-section')
        .filter({ hasText: '文本' })
        .locator('.form-field')
        .filter({ hasText: '字号' })
        .locator('input')
      await fontSize.fill('52')
      await fontSize.press('Enter')
      await page.locator('#text-color-text').fill('#c026d3')
      await page.locator('#text-color-text').press('Enter')
      const xInput = commonNodeField(page, 'X')
      await xInput.fill('560')
      await xInput.press('Enter')

      await page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
      await expect.poll(() => existsSync(projectPath)).toBe(true)
      expect(readFileSync(projectPath).subarray(0, 2).toString()).toBe('PK')

      await page.getByRole('button', { name: '新建课件（Ctrl+N）' }).click()
      await page.getByRole('button', { name: '打开工程（Ctrl+O）' }).click()
      await page.getByRole('tab', { name: '图层' }).click()
      await page.locator('.node-name').filter({ hasText: '文本' }).click()
      await page.getByRole('tab', { name: '属性' }).click()
      await expect(page.locator('.form-textarea')).toHaveValue(
        '中文课件标题\n第二行内容\n第三行用于验证自动高度',
      )
      await expect(fontSize).toHaveValue('52')
      await expect(page.locator('#text-color-text')).toHaveValue('#c026d3')
      await expect(xInput).toHaveValue('560')
      expect(pageErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('文字编辑事务：resize、属性栏、切换节点、字体、IME 与撤销', async () => {
    const { app, page, pageErrors, consoleErrors, externalRequests } = await launchEditor()
    try {
      await addText(page)
      await page.getByRole('button', { name: '编辑局部文字格式' }).click()
      const editor = page.getByTestId('text-edit-overlay')
      const textarea = page.getByRole('textbox', { name: '文字内容' })
      await expect(editor).toBeVisible()
      await editor.fill('画布编辑中的草稿')
      await expect(textarea).toHaveValue('画布编辑中的草稿')

      await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        const [width, height] = window.getSize()
        window.setSize(Math.max(1100, width - 120), Math.max(720, height - 80))
      })
      await page.waitForTimeout(150)
      await expect(editor).toHaveText('画布编辑中的草稿')

      await textarea.click()
      await expect(editor).toHaveCount(0)
      await textarea.fill('属性栏最终文字')
      await page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
      await expect(textarea).toHaveValue('画布编辑中的草稿')
      await page.getByRole('button', { name: '重做（Ctrl+Y / Ctrl+Shift+Z）' }).click()
      await expect(textarea).toHaveValue('属性栏最终文字')

      const fontInput = page.getByRole('combobox', { name: '字体' })
      await page.getByRole('button', { name: '展开字体列表' }).click()
      await expect(page.getByRole('listbox', { name: '常用字体' })).toBeVisible()
      await expect(page.getByRole('option', {
        name: /微软雅黑，Microsoft YaHei，/,
      })).toBeVisible()
      await expect(fontInput).not.toHaveValue('')
      await page.screenshot({
        path: join(visualOutputDirectory, 'font-family-dropdown.png'),
        fullPage: true,
      })
      await page.getByRole('option', { name: /楷体，KaiTi，/ }).click()
      await expect(fontInput).toHaveValue('KaiTi')
      expect(
        await page.getByTestId('font-family-preview').evaluate(
          (element) => getComputedStyle(element).fontFamily,
        ),
      ).toContain('KaiTi')

      await addRectangle(page)
      await page.getByRole('tab', { name: '图层' }).click()
      await page.locator('.node-name').filter({ hasText: '文本' }).click()
      await page.getByRole('tab', { name: '属性' }).click()
      await expect(page.getByRole('textbox', { name: '文字内容' })).toHaveValue(
        '属性栏最终文字',
      )
      await expect(page.getByRole('combobox', { name: '字体' })).toHaveValue('KaiTi')

      await page.getByRole('button', { name: '编辑局部文字格式' }).click()
      await expect(editor).toBeVisible()
      await editor.dispatchEvent('compositionstart', { data: '中' })
      await editor.fill('中文组合输入')
      await editor.press('Control+Enter')
      await expect(editor).toBeVisible()
      await editor.dispatchEvent('compositionend', { data: '中文组合输入' })
      await editor.evaluate((element) => (element as HTMLElement).blur())
      await expect(editor).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: '文字内容' })).toHaveValue(
        '中文组合输入',
      )

      await page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
      await expect(page.getByRole('textbox', { name: '文字内容' })).toHaveValue(
        '属性栏最终文字',
      )
      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('P0：画布真实双击可持续输入、失焦单次提交且 Escape 取消', async () => {
    const { app, page, pageErrors, consoleErrors, externalRequests } = await launchEditor()
    try {
      await addText(page)
      const canvas = page.locator('[data-testid="canvas-stage"] canvas')
      await page.waitForTimeout(250)
      const bounds = await canvas.boundingBox()
      if (!bounds) throw new Error('编辑画布不可见')
      const textCenter = {
        x: bounds.x + (640 / 1280) * bounds.width,
        y: bounds.y + (360 / 720) * bounds.height,
      }

      // Exercise the real Phaser pointer path instead of opening the editor
      // through the properties-panel shortcut.
      await page.mouse.dblclick(textCenter.x, textCenter.y, { delay: 40 })
      const editor = page.getByTestId('text-edit-overlay')
      const textarea = page.getByRole('textbox', { name: '文字内容' })
      await expect(editor).toBeVisible()
      await expect(editor).toBeFocused()
      await page.waitForTimeout(120)
      await expect(editor).toBeFocused()

      await editor.press('Control+A')
      await page.keyboard.insertText('画布双击可编辑')
      await expect(editor).toHaveText('画布双击可编辑')
      await expect(textarea).toHaveValue('画布双击可编辑')
      await page.screenshot({
        path: join(visualOutputDirectory, 'text-double-click-editing.png'),
      })

      // Moving directly into the properties field must commit the canvas
      // session once, then let the properties field own the next session.
      await textarea.click()
      await expect(editor).toHaveCount(0)
      await expect(textarea).toBeFocused()
      await page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
      await expect(textarea).toHaveValue('双击编辑文字')
      await page.getByRole('button', { name: '重做（Ctrl+Y / Ctrl+Shift+Z）' }).click()
      await expect(textarea).toHaveValue('画布双击可编辑')

      await page.waitForTimeout(450)
      await page.mouse.dblclick(textCenter.x, textCenter.y, { delay: 40 })
      await expect(editor).toBeFocused()
      await editor.press('Control+A')
      await page.keyboard.insertText('这次编辑应被取消')
      await expect(textarea).toHaveValue('这次编辑应被取消')
      await editor.press('Escape')
      await expect(editor).toHaveCount(0)
      await expect(textarea).toHaveValue('画布双击可编辑')

      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 3：节点层级排序与撤销', async () => {
    const { app, page, pageErrors } = await launchEditor()
    try {
      const canvas = page.locator('[data-testid="canvas-stage"] canvas')
      await addRectangle(page)
      await addText(page)
      await page.getByRole('tab', { name: '图层' }).click()
      await expect(page.locator('.node-item')).toHaveCount(2)
      const before = await page.locator('.node-name').allTextContents()
      const canvasBefore = await canvas.screenshot()
      await moveSortableUp(
        page.locator('.node-item').last().locator('.drag-handle'),
        1,
      )
      await expect
        .poll(() => page.locator('.node-name').allTextContents())
        .toEqual([...before].reverse())
      await expect(page.locator('.node-item--selected')).toHaveCount(1)
      await page.waitForTimeout(200)
      const canvasAfter = await canvas.screenshot()
      const reorderedDifference = await averagePixelDifference(
        canvasBefore,
        canvasAfter,
      )
      expect(reorderedDifference).toBeGreaterThan(0.05)
      await page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
      await expect
        .poll(() => page.locator('.node-name').allTextContents())
        .toEqual(before)
      await expect(page.locator('.node-item--selected')).toHaveCount(1)
      await page.waitForTimeout(200)
      const restoredDifference = await averagePixelDifference(
        canvasBefore,
        await canvas.screenshot(),
      )
      expect(restoredDifference).toBeLessThan(reorderedDifference * 0.6)
      expect(pageErrors).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 4：组件导入、保存重开与预览交互', async () => {
    expect(existsSync(sampleComponentPath)).toBe(true)
    const { app, page, pageErrors, consoleErrors, externalRequests } = await launchEditor()
    try {
      await patchDialogs(app, {
        projectSave: componentProjectPath,
        projectOpen: componentProjectPath,
        componentOpen: sampleComponentPath,
      })
      await page.getByRole('button', { name: '导入可信的 .h5component 组件' }).click()
      await page.getByRole('button', { name: '选择组件包' }).click()
      await page.getByRole('tab', { name: '互动组件' }).click()
      const componentCard = page.getByTestId('component-com.example.sample-counter')
      await componentCard.waitFor()
      await componentCard.click()
      await page.waitForTimeout(500)

      const componentTitle = page.getByLabel('组件标题', { exact: true })
      const componentInitialValue = page.getByLabel('初始数值', { exact: true })
      await componentTitle.fill('课堂积分器')
      await componentTitle.blur()
      await componentInitialValue.fill('7')
      await componentInitialValue.blur()
      await expect(componentTitle).toHaveValue('课堂积分器')
      await expect(componentInitialValue).toHaveValue('7')

      const editorCanvas = page.locator('[data-testid="canvas-stage"] canvas')
      const editorBounds = await editorCanvas.boundingBox()
      if (!editorBounds) throw new Error('编辑画布不可见')
      const designPoint = (x: number, y: number) => ({
        x: editorBounds.x + (x / 1280) * editorBounds.width,
        y: editorBounds.y + (y / 720) * editorBounds.height,
      })

      const dragStart = designPoint(460, 270)
      const dragEnd = designPoint(520, 310)
      await page.mouse.move(dragStart.x, dragStart.y)
      await page.mouse.down()
      await page.waitForTimeout(100)
      await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 20 })
      await page.waitForTimeout(100)
      await page.mouse.up()
      await page.waitForTimeout(200)

      const movedX = Number(await commonNodeField(page, 'X').inputValue())
      const movedY = Number(await commonNodeField(page, 'Y').inputValue())
      expect(movedX).toBeGreaterThan(400)
      expect(movedY).toBeGreaterThan(220)

      const resizeStart = designPoint(movedX + 480, movedY + 280)
      const resizeEnd = designPoint(movedX + 560, movedY + 327)
      await page.mouse.move(resizeStart.x, resizeStart.y)
      await page.mouse.down()
      await page.waitForTimeout(100)
      await page.mouse.move(resizeEnd.x, resizeEnd.y, { steps: 20 })
      await page.waitForTimeout(100)
      await page.mouse.up()
      await page.waitForTimeout(200)
      const resizedWidth = Number(await commonNodeField(page, '宽').inputValue())
      const resizedHeight = Number(await commonNodeField(page, '高').inputValue())
      expect(resizedWidth).toBeGreaterThan(480)
      expect(resizedHeight).toBeGreaterThan(280)

      await page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
      await expect.poll(() => existsSync(componentProjectPath)).toBe(true)
      await page.getByRole('button', { name: '新建课件（Ctrl+N）' }).click()
      await page.getByRole('button', { name: '打开工程（Ctrl+O）' }).click()
      await page.getByRole('tab', { name: '图层' }).click()
      await expect(page.locator('.node-item')).toHaveCount(1)
      await page.locator('.node-name').click()
      await page.getByRole('tab', { name: '属性' }).click()
      await expect(commonNodeField(page, 'X')).toHaveValue(String(movedX))
      await expect(commonNodeField(page, 'Y')).toHaveValue(String(movedY))
      await expect(commonNodeField(page, '宽')).toHaveValue(String(resizedWidth))
      await expect(commonNodeField(page, '高')).toHaveValue(String(resizedHeight))
      await expect(page.getByLabel('组件标题', { exact: true })).toHaveValue('课堂积分器')
      await expect(page.getByLabel('初始数值', { exact: true })).toHaveValue('7')

      const previewPromise = app.waitForEvent('window')
      await page.getByRole('button', { name: '在独立窗口整课预览' }).click()
      const preview = await previewPromise
      await expectCanvasPlayerScene(preview, 0)
      const previewCanvas = preview.locator('canvas')
      const previewBounds = await previewCanvas.boundingBox()
      if (!previewBounds) throw new Error('预览画布不可见')
      const before = await previewCanvas.screenshot()
      const plusX = movedX + resizedWidth / 2 + 120
      const plusY = movedY + resizedHeight - 42
      await preview.mouse.click(
        previewBounds.x + (plusX / 1280) * previewBounds.width,
        previewBounds.y + (plusY / 720) * previewBounds.height,
      )
      await preview.waitForTimeout(250)
      const after = await previewCanvas.screenshot()
      expect(Buffer.compare(before, after)).not.toBe(0)
      await preview.close()

      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('V7 全局层：原生元素、双击文字、保存重开与跨场景可见性', async () => {
    expect(existsSync(firstImagePath)).toBe(true)
    const { app, page, pageErrors, consoleErrors, externalRequests } = await launchEditor()
    try {
      await patchDialogs(app, {
        imageOpen: firstImagePath,
        projectSave: globalNativeProjectPath,
        projectOpen: globalNativeProjectPath,
      })
      await page.getByTestId('add-scene').click()
      await page.getByTestId('global-layer-entry').click()
      await page.getByRole('tab', { name: '元素' }).click()
      await page.getByTestId('add-text').click()

      const canvas = page.locator('[data-testid="canvas-stage"] canvas')
      await page.waitForTimeout(250)
      const bounds = await canvas.boundingBox()
      if (!bounds) throw new Error('全局层编辑画布不可见')
      await page.mouse.dblclick(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
        { delay: 40 },
      )
      const editor = page.getByTestId('text-edit-overlay')
      const textarea = page.getByRole('textbox', { name: '文字内容' })
      await expect(editor).toBeFocused()
      await editor.press('Control+A')
      await page.keyboard.insertText('全课程统一标题')
      await expect(textarea).toHaveValue('全课程统一标题')
      await textarea.click()
      await expect(editor).toHaveCount(0)

      await page.getByLabel('图层位置').selectOption('underlay')
      await page.getByLabel('场景可见范围').selectOption('include')
      await page.getByLabel('场景 1', { exact: true }).check()

      await page.getByRole('tab', { name: '元素' }).click()
      await page.getByTestId('add-image').click()
      await page.waitForTimeout(500)
      await commonNodeField(page, 'X').fill('1020')
      await commonNodeField(page, 'X').press('Enter')
      await commonNodeField(page, 'Y').fill('20')
      await commonNodeField(page, 'Y').press('Enter')
      await commonNodeField(page, '宽').fill('180')
      await commonNodeField(page, '宽').press('Enter')
      await page.getByRole('tab', { name: '元素' }).click()
      await page.getByTestId('add-shape-rounded-rectangle').click()
      await commonNodeField(page, 'X').fill('40')
      await commonNodeField(page, 'X').press('Enter')
      await commonNodeField(page, 'Y').fill('620')
      await commonNodeField(page, 'Y').press('Enter')
      await commonNodeField(page, '宽').fill('1200')
      await commonNodeField(page, '宽').press('Enter')
      await commonNodeField(page, '高').fill('60')
      await commonNodeField(page, '高').press('Enter')

      await page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
      await expect.poll(() => existsSync(globalNativeProjectPath)).toBe(true)
      await page.getByRole('button', { name: '新建课件（Ctrl+N）' }).click()
      await page.getByRole('button', { name: '打开工程（Ctrl+O）' }).click()
      await page.getByTestId('global-layer-entry').click()
      await page.getByRole('tab', { name: '图层' }).click()
      await expect(page.locator('.node-item')).toHaveCount(4)
      await page.locator('.node-item').filter({ hasText: '文本' }).locator('.node-name').click()
      await page.getByRole('tab', { name: '属性' }).click()
      await expect(page.getByRole('textbox', { name: '文字内容' })).toHaveValue(
        '全课程统一标题',
      )
      await expect(page.getByTestId('global-layer-settings')).toBeVisible()
      await page.screenshot({
        path: join(visualOutputDirectory, 'editor-v4-global-native-layer.png'),
        fullPage: true,
      })

      const previewPromise = app.waitForEvent('window')
      await page.getByRole('button', { name: '在独立窗口整课预览' }).click()
      const preview = await previewPromise
      const previewCanvas = preview.locator('.lesson-canvas-host canvas')
      await expectCanvasPlayerScene(preview, 0)
      const shownOnFirst = await previewCanvas.screenshot()
      await navigateCanvasPlayerByKeyboard(preview, 'ArrowRight', 1)
      await preview.waitForTimeout(200)
      const hiddenOnSecond = await previewCanvas.screenshot()
      expect(await averagePixelDifference(shownOnFirst, hiddenOnSecond)).toBeGreaterThan(0.001)
      await preview.close()

      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('V3 全局组件：组件范围、全部文案、保存重开与预览可见性', async () => {
    expect(existsSync(globalComponentPath)).toBe(true)
    const { app, page, pageErrors, consoleErrors, externalRequests } = await launchEditor()
    try {
      await patchDialogs(app, {
        projectSave: globalComponentProjectPath,
        projectOpen: globalComponentProjectPath,
        componentOpen: globalComponentPath,
      })
      await page.getByRole('button', { name: '导入可信的 .h5component 组件' }).click()
      await page.getByRole('button', { name: '选择组件包' }).click()
      await page.getByTestId('add-scene').click()
      await page.getByTestId('global-layer-entry').click()
      await page.getByRole('tab', { name: '元素' }).click()
      await expect(page.getByTestId('global-elements-notice')).toBeVisible()
      await page.getByRole('tab', { name: '互动组件' }).click()
      await page.getByTestId('component-com.example.global-nav').click()

      await page.getByRole('tab', { name: '属性' }).click()
      await page.getByLabel('全局标题', { exact: true }).fill('教师全局导航')
      await page.getByLabel('全局标题', { exact: true }).blur()
      await page.getByLabel('下一页文字', { exact: true }).fill('继续学习')
      await page.getByLabel('下一页文字', { exact: true }).blur()
      const autoExposedReplay = page.getByLabel('buttons / replay', { exact: true })
      await expect(autoExposedReplay).toHaveValue('重播本页')
      await autoExposedReplay.fill('重新讲解')
      await autoExposedReplay.blur()

      await page.getByLabel('图层位置').selectOption('overlay')
      await page.getByLabel('场景可见范围').selectOption('include')
      await page.getByLabel('场景 2', { exact: true }).check()

      const geometryInputs = page.locator('.property-section').first().locator('.form-input')
      const originalX = await geometryInputs.nth(1).inputValue()
      await geometryInputs.nth(1).fill('610')
      await geometryInputs.nth(1).press('Enter')
      await expect(geometryInputs.nth(1)).toHaveValue('610')
      await page.getByRole('button', { name: '撤销（Ctrl+Z）' }).click()
      await expect(geometryInputs.nth(1)).toHaveValue(originalX)
      await page.getByRole('button', { name: '重做（Ctrl+Y / Ctrl+Shift+Z）' }).click()
      await expect(geometryInputs.nth(1)).toHaveValue('610')

      await page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
      await expect.poll(() => existsSync(globalComponentProjectPath)).toBe(true)
      await page.getByRole('button', { name: '新建课件（Ctrl+N）' }).click()
      await page.getByRole('button', { name: '打开工程（Ctrl+O）' }).click()
      await page.getByTestId('global-layer-entry').click()
      await page.getByRole('tab', { name: '图层' }).click()
      await expect(page.locator('.node-item')).toHaveCount(2)
      await page
        .locator('.node-item')
        .filter({ hasText: '全局导航条' })
        .locator('.node-name')
        .click()
      await page.getByRole('tab', { name: '属性' }).click()
      await expect(page.getByLabel('全局标题', { exact: true })).toHaveValue('教师全局导航')
      await expect(page.getByLabel('下一页文字', { exact: true })).toHaveValue('继续学习')
      await expect(page.getByLabel('buttons / replay', { exact: true })).toHaveValue('重新讲解')
      await page.screenshot({
        path: join(visualOutputDirectory, 'editor-v3-global-layer.png'),
        fullPage: true,
      })

      const previewPromise = app.waitForEvent('window')
      await page.getByRole('button', { name: '在独立窗口整课预览' }).click()
      const preview = await previewPromise
      const canvas = preview.locator('.lesson-canvas-host canvas')
      await expectCanvasPlayerScene(preview, 0)
      const hiddenOnFirst = await canvas.screenshot()
      await navigateCanvasPlayerByKeyboard(preview, 'ArrowRight', 1)
      await preview.waitForTimeout(200)
      const shownOnSecond = await canvas.screenshot()
      expect(await averagePixelDifference(hiddenOnFirst, shownOnSecond)).toBeGreaterThan(0.02)
      await preview.close()

      expect(pageErrors).toEqual([])
      expect(consoleErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('V3 导出：等待 DOM 运行时后生成 PDF，并在 PPTX 保留动态层、全局 visibility 与原生文字', async () => {
    const sourceArchive = unzipSync(
      new Uint8Array(readFileSync(globalComponentProjectPath)),
    )
    const project = JSON.parse(
      new TextDecoder().decode(sourceArchive['project.json']),
    ) as any
    const globalRuntimeSource = `CoursewareRuntime.define({runtimeApiVersion:1,create:function(ctx){var banner=document.createElement('div');banner.textContent=ctx.content.get('status');Object.assign(banner.style,{position:'absolute',left:'36px',top:'32px',padding:'14px 20px',borderRadius:'12px',color:'#ffffff',background:'#be123c',font:'bold 28px Microsoft YaHei',pointerEvents:'none'});ctx.dom.overlay.append(banner);ctx.capture.waitUntil(new Promise(function(resolve){setTimeout(function(){banner.dataset.captureReady='true';resolve();},80);}));return{destroy:function(){banner.remove();}};}});`
    const sceneRuntimeSource = `CoursewareRuntime.define({runtimeApiVersion:1,create:function(ctx){var label=document.createElement('div');label.textContent=ctx.content.get('hint');Object.assign(label.style,{position:'absolute',left:'300px',top:'300px',padding:'18px 26px',color:'#ffffff',background:'#1d4ed8',font:'bold 30px Microsoft YaHei',pointerEvents:'none'});ctx.dom.underlay.append(label);ctx.capture.waitUntil(new Promise(function(resolve){setTimeout(function(){label.dataset.captureReady='true';resolve();},100);}));return{destroy:function(){label.remove();}};}});`
    project.globalRuntime = {
      runtimeApiVersion: 1,
      enabled: true,
      renderMode: 'dom',
      source: globalRuntimeSource,
      content: { values: { status: '全局运行时已完成捕获等待' } },
      assets: {},
    }
    project.scenes[0].runtime = {
      runtimeApiVersion: 1,
      enabled: true,
      renderMode: 'dom',
      source: sceneRuntimeSource,
      content: { values: { hint: '场景运行时底层快照' } },
      assets: {},
    }
    project.scenes[0].nodes.push({
      id: 'v3-export-editable-text',
      name: 'V3 导出可编辑文字',
      type: 'text',
      x: 420,
      y: 120,
      width: 440,
      height: 100,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      playbackInitialVisibility: 'inherit',
      text: 'PPTX 原生文字仍可编辑',
      runs: [],
      style: {
        fontFamily: 'Microsoft YaHei',
        fontSize: 42,
        color: '#111827',
        bold: true,
        italic: false,
        underline: false,
        strike: false,
        highlightColor: null,
        align: 'center',
        verticalAlign: 'middle',
        writingMode: 'horizontal',
        lineSpacing: 0,
        letterSpacing: 0,
        padding: 8,
        overflow: 'fixed',
        backgroundColor: '#ffffff',
        backgroundOpacity: 0.86,
        cornerRadius: 12,
      },
    })
    project.updatedAt = new Date().toISOString()
    sourceArchive['project.json'] = strToU8(
      `${JSON.stringify(project, null, 2)}\n`,
    )
    writeFileSync(
      v3RuntimeExportProjectPath,
      Buffer.from(zipSync(sourceArchive, { level: 6 })),
    )

    const globalInstance = project.globalLayer.find(
      (item: any) => item.node?.type === 'external-component',
    )
    if (!globalInstance) throw new Error('V3 导出夹具缺少全局组件')
    const globalObjectName = `${globalInstance.node.name} · ${globalInstance.node.id}`
    const {
      app,
      page,
      pageErrors,
      consoleWarnings,
      externalRequests,
    } = await launchEditor()
    try {
      await patchDialogs(app, {
        projectOpen: v3RuntimeExportProjectPath,
        pdfSave: v3RuntimePdfPath,
        pptxSave: v3RuntimePptxPath,
      })
      await page.getByRole('button', { name: '打开工程（Ctrl+O）' }).click()
      await expect(page.locator('.scene-item')).toHaveCount(2)
      await expect.poll(
        () => page.locator('.scene-name').allTextContents(),
      ).toEqual(['场景 1', '场景 2'])

      const exportMenuTrigger = page.getByTestId('export-menu-trigger')
      await expect(exportMenuTrigger).toHaveAttribute('aria-disabled', 'false')
      await exportMenuTrigger.click()
      await page.getByTestId('export-pdf').click()
      // The native save path becomes visible as soon as the writer opens it.
      // Wait for the complete multi-page payload instead of racing a partial PDF.
      await expect.poll(
        () => existsSync(v3RuntimePdfPath) ? statSync(v3RuntimePdfPath).size : 0,
        { timeout: 30_000 },
      ).toBeGreaterThan(8_000)
      const pdf = readFileSync(v3RuntimePdfPath)
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
      expect(pdf.byteLength).toBeGreaterThan(8_000)

      await page.getByTestId('export-menu-trigger').click()
      await page.getByTestId('export-pptx').click()
      await expect.poll(
        () => existsSync(v3RuntimePptxPath),
        { timeout: 30_000 },
      ).toBe(true)
      const pptxArchive = unzipSync(
        new Uint8Array(readFileSync(v3RuntimePptxPath)),
      )
      const slide1 = new TextDecoder().decode(
        pptxArchive['ppt/slides/slide1.xml'],
      )
      const slide2 = new TextDecoder().decode(
        pptxArchive['ppt/slides/slide2.xml'],
      )
      expect(consoleWarnings).toEqual([])
      expect(slide1).toContain('PPTX 原生文字仍可编辑')
      expect(slide1).toContain('全局自由运行时 · 顶层实际播放器快照')
      expect(slide1).toContain(
        '场景自由运行时“场景 1” · 底层实际播放器快照',
      )
      expect(slide1).not.toContain(globalObjectName)
      expect(slide2).toContain(globalObjectName)
      expect(slide2).toContain('全局自由运行时 · 顶层实际播放器快照')
      expect(slide1).not.toContain('V3 静态导出警告')
      expect(slide2).not.toContain('V3 静态导出警告')
      expect(pageErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 5：单 HTML 与网页包均可离线翻页', async () => {
    const { app, page, pageErrors, externalRequests } = await launchEditor()
    try {
      await patchDialogs(app, {
        htmlSave: htmlPath,
        webPackageSave: webPackagePath,
      })
      await addText(page)
      await editDefaultText(page, '第一页')
      await page.getByTestId('add-scene').click()
      await addText(page)
      await editDefaultText(page, '第二页')
      await page.getByTestId('export-menu-trigger').click()
      await page.getByTestId('export-single-html').click()
      await expect.poll(() => existsSync(htmlPath)).toBe(true)
      expect(readFileSync(htmlPath, 'utf8')).not.toMatch(/https?:\/\//i)

      await page.getByTestId('export-menu-trigger').click()
      await page.getByTestId('export-web-package').click()
      await expect.poll(() => existsSync(webPackagePath)).toBe(true)
      const packageArchive = unzipSync(new Uint8Array(readFileSync(webPackagePath)))
      expect(Object.keys(packageArchive)).toEqual(expect.arrayContaining([
        'index.html',
        'course-data.js',
        'player/player.iife.js',
        'player/player.css',
      ]))
      expect(Object.keys(packageArchive)).not.toContain('course.json')
      for (const [archivePath, bytes] of Object.entries(packageArchive)) {
        const targetPath = join(webPackageDirectory, ...archivePath.split('/'))
        mkdirSync(dirname(targetPath), { recursive: true })
        writeFileSync(targetPath, bytes)
      }

      const edgeCandidates = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
      const executablePath = edgeCandidates.find(existsSync)
      const browser = await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      })
      try {
        const exported = await browser.newPage()
        const requests: string[] = []
        const exportedErrors: string[] = []
        exported.on('request', (request) => {
          if (/^https?:/i.test(request.url())) requests.push(request.url())
        })
        exported.on('pageerror', (error) => exportedErrors.push(error.message))
        await exported.goto(pathToFileURL(htmlPath).toString())
        await expectCanvasPlayerScene(exported, 0)
        const exportedCanvas = exported.locator('.lesson-canvas-host canvas')
        const firstPage = await exportedCanvas.screenshot()
        await navigateCanvasPlayerByKeyboard(exported, 'ArrowRight', 1)
        await exported.waitForTimeout(150)
        const nextPageDifference = await averagePixelDifference(
          firstPage,
          await exportedCanvas.screenshot(),
        )
        expect(nextPageDifference).toBeGreaterThan(0.05)
        await navigateCanvasPlayerByKeyboard(exported, 'ArrowLeft', 0)
        await exported.waitForTimeout(150)
        expect(
          await averagePixelDifference(
            firstPage,
            await exportedCanvas.screenshot(),
          ),
        ).toBeLessThan(nextPageDifference * 0.6)
        expect(requests).toEqual([])
        expect(exportedErrors).toEqual([])

        const packaged = await browser.newPage()
        const packageRequests: string[] = []
        const packageErrors: string[] = []
        packaged.on('request', (request) => {
          if (/^https?:/i.test(request.url())) packageRequests.push(request.url())
        })
        packaged.on('pageerror', (error) => packageErrors.push(error.message))
        await packaged.goto(pathToFileURL(join(webPackageDirectory, 'index.html')).toString())
        await expectCanvasPlayerScene(packaged, 0)
        await navigateCanvasPlayerByKeyboard(packaged, 'ArrowRight', 1)
        expect(packageRequests).toEqual([])
        expect(packageErrors).toEqual([])
      } finally {
        await browser.close()
      }
      expect(pageErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('补充流程：图片导入、替换与工程往返', async () => {
    expect(existsSync(firstImagePath)).toBe(true)
    expect(existsSync(replacementImagePath)).toBe(true)
    const { app, page, pageErrors, externalRequests } = await launchEditor()
    try {
      await patchDialogs(app, {
        imageOpen: firstImagePath,
        projectSave: imageProjectPath,
        projectOpen: imageProjectPath,
      })
      await page.getByTestId('add-image').click()
      await page.waitForTimeout(500)
      await page.getByRole('tab', { name: '图层' }).click()
      await expect(page.locator('.node-item')).toHaveCount(1)
      await page.locator('.node-name').click()
      await page.getByRole('tab', { name: '属性' }).click()
      await expect(page.getByRole('checkbox', { name: '保持宽高比' })).toBeChecked()
      const canvas = page.locator('[data-testid="canvas-stage"] canvas')
      const initialX = Number(await commonNodeField(page, 'X').inputValue())
      const initialY = Number(await commonNodeField(page, 'Y').inputValue())
      const initialWidth = Number(await commonNodeField(page, '宽').inputValue())
      const initialHeight = Number(await commonNodeField(page, '高').inputValue())
      const bounds = await canvas.boundingBox()
      if (!bounds) throw new Error('图片画布不可见')
      const eastHandle = {
        x: bounds.x + ((initialX + initialWidth) / 1280) * bounds.width,
        y: bounds.y + ((initialY + initialHeight / 2) / 720) * bounds.height,
      }
      await page.mouse.move(eastHandle.x, eastHandle.y)
      await page.mouse.down()
      await page.mouse.move(eastHandle.x + 70, eastHandle.y, { steps: 12 })
      await page.mouse.up()
      await expect.poll(async () => Number(await commonNodeField(page, '宽').inputValue())).toBeGreaterThan(initialWidth)
      const resizedWidth = Number(await commonNodeField(page, '宽').inputValue())
      const resizedHeight = Number(await commonNodeField(page, '高').inputValue())
      expect(resizedWidth / resizedHeight).toBeCloseTo(initialWidth / initialHeight, 2)
      const before = await canvas.screenshot()

      await patchDialogs(app, {
        imageOpen: replacementImagePath,
        projectSave: imageProjectPath,
        projectOpen: imageProjectPath,
      })
      await page.getByRole('button', { name: '替换图片' }).click()
      await page.waitForTimeout(500)
      const replaced = await canvas.screenshot()
      expect(Buffer.compare(before, replaced)).not.toBe(0)

      const imageSection = page.locator('.property-section').filter({ hasText: '图片' })
      await imageSection
        .locator('.form-field')
        .filter({ hasText: '左裁剪' })
        .locator('input[type="range"]')
        .fill('25')
      await page.keyboard.press('Tab')
      await page.waitForTimeout(200)
      expect(
        await averagePixelDifference(replaced, await canvas.screenshot()),
      ).toBeGreaterThan(0.05)
      await imageSection
        .locator('.form-field')
        .filter({ hasText: '羽化形状' })
        .locator('select')
        .selectOption('ellipse')
      await imageSection
        .locator('.form-field')
        .filter({ hasText: '羽化强度' })
        .locator('input[type="range"]')
        .fill('70')
      await page.keyboard.press('Tab')
      await imageSection.getByRole('button', { name: '水平翻转' }).click()
      await page.waitForTimeout(250)
      expect(
        await averagePixelDifference(replaced, await canvas.screenshot()),
      ).toBeGreaterThan(0.05)
      await page.screenshot({
        path: join(root, 'output', 'playwright', 'editor-v1-image-effects.png'),
        fullPage: true,
      })

      await page.getByRole('button', { name: '保存（Ctrl+S）' }).click()
      await expect.poll(() => existsSync(imageProjectPath)).toBe(true)
      await page.getByRole('button', { name: '新建课件（Ctrl+N）' }).click()
      await page.getByRole('button', { name: '打开工程（Ctrl+O）' }).click()
      await page.getByRole('tab', { name: '图层' }).click()
      await expect(page.locator('.node-item')).toHaveCount(1)
      await page.locator('.node-name').click()
      await page.waitForTimeout(500)
      const restored = await canvas.screenshot()
      expect(Buffer.compare(before, restored)).not.toBe(0)
      await page.getByRole('tab', { name: '属性' }).click()
      const restoredImageSection = page.locator('.property-section').filter({ hasText: '图片' })
      await expect(
        restoredImageSection
          .locator('.form-field')
          .filter({ hasText: '左裁剪' })
          .locator('input[type="range"]'),
      ).toHaveValue('25')
      await expect(
        restoredImageSection
          .locator('.form-field')
          .filter({ hasText: '羽化强度' })
          .locator('input[type="range"]'),
      ).toHaveValue('70')
      await expect(
        restoredImageSection
          .locator('.form-field')
          .filter({ hasText: '羽化形状' })
          .locator('select'),
      ).toHaveValue('ellipse')
      await expect(
        restoredImageSection.getByRole('button', { name: '水平翻转' }),
      ).toHaveClass(/secondary-button--active/)
      expect(pageErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 6：箭头、大括号与多选对齐', async () => {
    const { app, page, pageErrors, externalRequests } = await launchEditor()
    try {
      const canvas = page.locator('[data-testid="canvas-stage"] canvas')
      const additions = [
        { testId: 'add-shape-arrow-right', x: 130, y: 70 },
        { testId: 'add-shape-brace-left', x: 340, y: 210 },
        { testId: 'add-shape-diamond', x: 550, y: 345 },
      ]
      for (const [index, item] of additions.entries()) {
        await page.getByRole('tab', { name: '元素' }).click()
        await page.getByRole('tab', { name: '常用' }).click()
        await dragElementToCanvas(page, item.testId, { x: item.x, y: item.y })
        // A drop rebuilds the Phaser/editor node bridge. Wait for its visible
        // layer entry before starting the next drag instead of racing that sync.
        await page.getByRole('tab', { name: '图层' }).click()
        await expect(page.locator('.node-item')).toHaveCount(index + 1)
      }

      await expect(page.locator('.node-item')).toHaveCount(3)
      for (const name of ['右箭头', '左大括号', '菱形']) {
        await page.locator('.node-name').filter({ hasText: name }).click({
          modifiers: name === '右箭头' ? [] : ['Control'],
        })
      }
      await page.getByRole('tab', { name: '属性' }).click()
      await expect(page.getByTestId('multi-selection-properties')).toContainText('3')
      await page.getByRole('button', { name: '左对齐' }).click()

      const alignedXs: number[] = []
      for (const name of ['右箭头', '左大括号', '菱形']) {
        await page.getByRole('tab', { name: '图层' }).click()
        await page.locator('.node-name').filter({ hasText: name }).click()
        await page.getByRole('tab', { name: '属性' }).click()
        alignedXs.push(Number(await commonNodeField(page, 'X').inputValue()))
      }
      expect(new Set(alignedXs.map((value) => value.toFixed(1))).size).toBe(1)

      await page.getByRole('tab', { name: '图层' }).click()
      await page.locator('.node-name').filter({ hasText: '左大括号' }).click()
      await page.getByRole('tab', { name: '属性' }).click()
      const braceProperties = page.locator('.property-section').filter({ hasText: '图形' })
      await expect(braceProperties.getByText('线条宽度', { exact: true })).toBeVisible()
      await expect(braceProperties.getByText('填充色', { exact: true })).toHaveCount(0)
      await page.getByRole('tab', { name: '元素' }).click()
      await page.screenshot({
        path: join(root, 'output', 'playwright', 'editor-v1-shapes.png'),
        fullPage: true,
      })
      await canvas.screenshot({
        path: join(root, 'output', 'playwright', 'editor-v1-shapes-canvas.png'),
      })
      expect(pageErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 7：两页课件导出 PDF 与 PPTX', async () => {
    const { app, page, pageErrors, externalRequests } = await launchEditor()
    try {
      await patchDialogs(app, {
        pdfSave: pdfPath,
        pptxSave: pptxPath,
        imageOpen: firstImagePath,
        componentOpen: sampleComponentPath,
      })
      await page.getByRole('tab', { name: '元素' }).click()
      await page.getByRole('tab', { name: '常用' }).click()
      await page.getByTestId('add-shape-arrow-right').click()
      await addText(page)
      await page.getByRole('tab', { name: '元素' }).click()
      await page.getByRole('tab', { name: '常用' }).click()
      await page.getByTestId('add-image').click()
      await page.waitForTimeout(300)
      await page.getByTestId('add-scene').click()
      await page.getByRole('tab', { name: '元素' }).click()
      await page.getByRole('tab', { name: '常用' }).click()
      await page.getByTestId('add-shape-brace-pair-horizontal').click()
      await page.getByRole('button', { name: '导入可信的 .h5component 组件' }).click()
      await page.getByRole('button', { name: '选择组件包' }).click()
      await page.getByRole('tab', { name: '互动组件' }).click()
      await page.getByTestId('component-com.example.sample-counter').click()
      await page.waitForTimeout(300)

      await page.getByTestId('export-menu-trigger').click()
      await page.getByTestId('export-pdf').click()
      await expect.poll(() => existsSync(pdfPath), { timeout: 30_000 }).toBe(true)
      const pdf = readFileSync(pdfPath)
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
      expect(pdf.byteLength).toBeGreaterThan(5_000)

      await page.getByTestId('export-menu-trigger').click()
      await page.getByTestId('export-pptx').click()
      await expect.poll(() => existsSync(pptxPath), { timeout: 30_000 }).toBe(true)
      const pptx = readFileSync(pptxPath)
      expect(pptx.subarray(0, 2).toString()).toBe('PK')
      const pptxArchive = unzipSync(new Uint8Array(pptx))
      const pptxEntries = Object.keys(pptxArchive)
      expect(pptxEntries).toContain('ppt/slides/slide1.xml')
      expect(pptxEntries).toContain('ppt/slides/slide2.xml')
      const slide1 = new TextDecoder().decode(
        pptxArchive['ppt/slides/slide1.xml'],
      )
      const slide2 = new TextDecoder().decode(
        pptxArchive['ppt/slides/slide2.xml'],
      )
      const xmlErrors = await page.evaluate((slides) => slides.map((xml) => {
        const document = new DOMParser().parseFromString(xml, 'application/xml')
        return document.getElementsByTagName('parsererror')[0]?.textContent ?? null
      }), [slide1, slide2])
      expect(xmlErrors).toEqual([null, null])
      expect(slide1).toContain('双击编辑文字')
      expect(slide1.match(/<p:sp>/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
      expect(slide1.match(/<p:pic>/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
      expect(slide2.match(/<p:sp>/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
      expect(slide2.match(/<p:pic>/g)?.length ?? 0).toBeGreaterThanOrEqual(1)
      expect(pageErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 8：字体与局部富文本在内容编辑后保持同步', async () => {
    const { app, page, pageErrors, externalRequests } = await launchEditor()
    try {
      await addText(page)
      await page.getByRole('tab', { name: '属性' }).click()
      const fontFamily = page.getByLabel('字体', { exact: true })
      await fontFamily.fill('KaiTi')
      await fontFamily.press('Enter')
      await expect(fontFamily).toHaveValue('KaiTi')
      await page.getByRole('button', { name: '加粗' }).click()
      await page.getByRole('button', { name: '编辑局部文字格式' }).click()
      const editor = page.getByTestId('text-edit-overlay')
      await expect(editor).toBeVisible()
      await editor.evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const text = walker.nextNode()
        if (!text) throw new Error('富文本编辑器没有文字节点')
        const range = document.createRange()
        range.setStart(text, 0)
        range.setEnd(text, Math.min(2, text.textContent?.length ?? 0))
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      })
      await page.getByRole('button', { name: '局部加粗' }).click()
      await page.getByRole('button', { name: '局部删除线' }).click()
      await page.getByRole('button', { name: '局部高亮', exact: true }).click()
      await editor.press('Control+Enter')
      await expect(editor).toHaveCount(0)

      const content = page.locator('.form-textarea')
      await content.fill('双击编辑文字！')
      await content.blur()
      await expect(fontFamily).toHaveValue('KaiTi')
      await page.getByRole('button', { name: '编辑局部文字格式' }).click()
      await expect(editor).toBeVisible()
      const firstCharacterStyle = await editor.evaluate((element) => {
        const first = element.querySelector('span')
        if (!(first instanceof HTMLElement)) throw new Error('局部格式没有被恢复')
        const style = getComputedStyle(first)
        return {
          weight: Number.parseInt(style.fontWeight, 10),
          decoration: style.textDecorationLine,
          background: style.backgroundColor,
        }
      })
      expect(firstCharacterStyle.weight).toBeLessThan(600)
      expect(firstCharacterStyle.decoration).toContain('line-through')
      expect(firstCharacterStyle.background).not.toBe('rgba(0, 0, 0, 0)')
      await editor.press('Control+Enter')
      expect(pageErrors).toEqual([])
      expect(externalRequests).toEqual([])
    } finally {
      await closeEditor(app)
    }
  })

  test('流程 9：未保存课件自动恢复', async () => {
    const firstLaunch = await launchEditor()
    try {
      await addText(firstLaunch.page)
      await editDefaultText(firstLaunch.page, '自动恢复内容')
      await expect(firstLaunch.page.locator('.status-bar')).toContainText(
        '已自动保存本地恢复副本',
        { timeout: 10_000 },
      )
    } finally {
      await closeEditor(firstLaunch.app)
    }

    const restoredLaunch = await launchEditor({ preserveRecoveryPrompt: true })
    try {
      const recoveryDialog = restoredLaunch.page.getByRole('alertdialog', {
        name: '发现未完成的本地恢复副本',
      })
      await expect(recoveryDialog).toBeVisible()
      await recoveryDialog.getByRole('button', { name: '恢复课件' }).click()
      await expect(recoveryDialog).toHaveCount(0)
      await restoredLaunch.page.getByRole('tab', { name: '图层' }).click()
      await expect(restoredLaunch.page.locator('.node-item')).toHaveCount(1)
      await restoredLaunch.page.locator('.node-name').click()
      await restoredLaunch.page.getByRole('tab', { name: '属性' }).click()
      await expect(restoredLaunch.page.locator('.form-textarea')).toHaveValue('自动恢复内容')
      expect(restoredLaunch.pageErrors).toEqual([])
      expect(restoredLaunch.externalRequests).toEqual([])
    } finally {
      await restoredLaunch.page.evaluate(() => window.desktopAPI?.clearRecoveryProject())
      await closeEditor(restoredLaunch.app)
    }
  })

  test('课例验收：三页光合作用课例可离线互动', async () => {
    expect(existsSync(lessonHtmlPath)).toBe(true)
    const edgeCandidates = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    const executablePath = edgeCandidates.find(existsSync)
    const browser = await chromium.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
    })
    try {
      const lesson = await browser.newPage({ viewport: { width: 1440, height: 920 } })
      const requests: string[] = []
      const pageErrors: string[] = []
      lesson.on('request', (request) => {
        if (/^https?:/i.test(request.url())) requests.push(request.url())
      })
      lesson.on('pageerror', (error) => pageErrors.push(error.message))
      await lesson.goto(pathToFileURL(lessonHtmlPath).toString())

      const canvas = lesson.locator('.lesson-canvas-host canvas')
      await expectCanvasPlayerScene(lesson, 0)
      await canvas.waitFor()
      const clickDesignPoint = async (x: number, y: number) => {
        const bounds = await canvas.boundingBox()
        if (!bounds) throw new Error('课例画布不可见')
        await lesson.mouse.click(
          bounds.x + (x / 1280) * bounds.width,
          bounds.y + (y / 720) * bounds.height,
        )
      }

      const firstInitial = await canvas.screenshot()
      for (const y of [397, 477, 557]) await clickDesignPoint(253, y)
      await lesson.waitForTimeout(1_000)
      const firstCompleted = await canvas.screenshot()
      expect(await averagePixelDifference(firstInitial, firstCompleted)).toBeGreaterThan(0.1)
      await lesson.screenshot({
        path: join(visualOutputDirectory, 'lesson-page-1-complete.png'),
        fullPage: true,
      })

      await navigateCanvasPlayerByKeyboard(lesson, 'ArrowRight', 1)
      const secondInitial = await canvas.screenshot()
      await clickDesignPoint(471, 402)
      await lesson.waitForTimeout(350)
      expect(
        await averagePixelDifference(secondInitial, await canvas.screenshot()),
      ).toBeGreaterThan(0.02)
      await lesson.screenshot({
        path: join(visualOutputDirectory, 'lesson-page-2-experiment.png'),
        fullPage: true,
      })

      await navigateCanvasPlayerByKeyboard(lesson, 'ArrowRight', 2)
      await clickDesignPoint(214, 538)
      await clickDesignPoint(286, 413)
      await lesson.waitForTimeout(450)
      await lesson.screenshot({
        path: join(visualOutputDirectory, 'lesson-page-3-challenge.png'),
        fullPage: true,
      })

      expect(requests).toEqual([])
      expect(pageErrors).toEqual([])
    } finally {
      await browser.close()
    }
  })
})
