import { _electron as electron, expect, test } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Locator, Page } from 'playwright'
import {
  addCourseSurface,
  addSpatialCameraFrame,
  createCourseProject,
  updateCourseProject,
} from '../../src/renderer/course/courseStudioModel'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '../../src/renderer/project/courseProjectArchive'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(tmpdir(), `ittoedu-v9-global-health-${process.pid}`)
const userDataDirectory = join(runDirectory, 'electron-profile')
const sourceProjectPath = join(runDirectory, 'mixed-global-controller-source.h5lesson')
const savedProjectPath = join(runDirectory, 'mixed-global-controller-roundtrip.h5lesson')
const NOW = '2026-08-16T10:00:00.000Z'
const FLOW_SURFACE_ID = 'global-controller-flow'
const SPATIAL_SURFACE_ID = 'global-controller-spatial'
const SPATIAL_DETAIL_CAMERA_ID = 'global-controller-spatial-detail'
const FINAL_CONTROLLER_TITLE = '跨 Surface 控制器'
const SLIDE_DELTA = { x: 46, y: 24 }
const SPATIAL_DELTA = { x: 38, y: 22 }

interface EditorHandle {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
}

interface MixedFixture {
  slideLocationId: string
  flowLocationId: string
  spatialDetailLocationId: string
}

interface ControllerSnapshot {
  revision: number
  layerItemId: string
  title: string
  compact: boolean
  collapsible: boolean
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface ScreenBox {
  x: number
  y: number
  width: number
  height: number
}

let fixture: MixedFixture

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
    .toContainText('全局控制器跨 Surface Gate')
  await expect(editor.page.locator('.runtime-preview-loading')).toHaveCount(0)
  await editor.page.getByTestId('canvas-stage').locator('canvas').waitFor()
}

function readControllerSnapshot(path: string): ControllerSnapshot {
  const archive = openCourseProjectArchive(readFileSync(path))
  expect(archive.project.schemaVersion).toBe(9)
  const globalControllers = archive.project.globalLayerItems.filter(
    (entry) => entry.item.kind === 'native' &&
      entry.item.content.nativeType === 'teacher-controller',
  )
  expect(globalControllers).toHaveLength(1)
  const controller = globalControllers[0]!.item
  if (
    controller.kind !== 'native' ||
    controller.content.nativeType !== 'teacher-controller'
  ) {
    throw new Error('Saved V9 teacher controller is missing')
  }

  const copiedControllerIds: string[] = []
  const nonGlobalTeacherControllerIds: string[] = []
  for (const surface of archive.project.surfaces) {
    const localItems = [
      ...surface.surfaceLayerItems.map((entry) => entry.item),
      ...(surface.type === 'slide'
        ? surface.scenes.flatMap((scene) => scene.layerItems)
        : surface.type === 'spatial-2d'
          ? surface.world.layerItems
          : []),
    ]
    for (const item of localItems) {
      if (item.layerItemId === controller.layerItemId) {
        copiedControllerIds.push(item.layerItemId)
      }
      if (item.kind === 'native' && item.content.nativeType === 'teacher-controller') {
        nonGlobalTeacherControllerIds.push(item.layerItemId)
      }
    }
  }
  expect(copiedControllerIds, 'controller copies outside globalLayerItems').toEqual([])
  expect(nonGlobalTeacherControllerIds, 'teacher controllers outside globalLayerItems').toEqual([])

  return {
    revision: archive.project.revision,
    layerItemId: controller.layerItemId,
    title: controller.content.data.title,
    compact: controller.content.data.compact,
    collapsible: controller.content.data.collapsible,
    x: controller.frame.x,
    y: controller.frame.y,
    width: controller.frame.width,
    height: controller.frame.height,
    rotation: controller.rotation,
  }
}

async function waitForControllerRevision(
  path: string,
  revision: number,
): Promise<ControllerSnapshot> {
  await expect.poll(() => {
    if (!existsSync(path)) return -1
    try {
      return readControllerSnapshot(path).revision
    } catch {
      return -1
    }
  }).toBe(revision)
  return readControllerSnapshot(path)
}

function expectControllerSnapshot(
  actual: ControllerSnapshot,
  expected: ControllerSnapshot,
): void {
  expect(actual).toMatchObject({
    revision: expected.revision,
    layerItemId: expected.layerItemId,
    title: expected.title,
    compact: expected.compact,
    collapsible: expected.collapsible,
    width: expected.width,
    height: expected.height,
    rotation: expected.rotation,
  })
  // The Slide pointer pipeline can quantize a logical drop point by a pixel
  // at fit zoom. Spatial is exact screen-space, but the same narrow bound
  // keeps the archive assertion honest across the two authoring surfaces.
  expect(Math.abs(actual.x - expected.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(actual.y - expected.y)).toBeLessThanOrEqual(2)
}

async function getScreenBox(locator: Locator): Promise<ScreenBox> {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected visible screen controller bounds')
  return box
}

function expectScreenBoxUnscaled(actual: ScreenBox, expected: ScreenBox): void {
  // The workspace itself can move when its scrollable authoring region lays
  // out after a camera command. Fixed screen content need not keep the same
  // browser-page origin, but it must not inherit the world zoom scale.
  expect(Math.abs(actual.width - expected.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(actual.height - expected.height)).toBeLessThanOrEqual(1)
}

async function expectScreenBoxAt(
  controller: Locator,
  expected: ScreenBox,
): Promise<void> {
  await expect.poll(async () => {
    const actual = await controller.boundingBox()
    if (!actual) return Number.POSITIVE_INFINITY
    return Math.max(
      Math.abs(actual.x - expected.x),
      Math.abs(actual.y - expected.y),
      Math.abs(actual.width - expected.width),
      Math.abs(actual.height - expected.height),
    )
  }).toBeLessThanOrEqual(2)
}

async function openMoreMenu(page: Page): Promise<void> {
  const more = page.getByTitle('更多工程操作')
  if (!await more.locator('xpath=ancestor::details').evaluate((details) => (
    details.hasAttribute('open')
  ))) {
    await more.click()
  }
}

async function saveAs(editor: EditorHandle, path: string): Promise<void> {
  await patchProjectDialogs(editor.app, { save: path })
  await openMoreMenu(editor.page)
  await editor.page.getByRole('menuitem', { name: /另存为/ }).click()
  await expect.poll(() => existsSync(path)).toBe(true)
  await expect.poll(() => editor.page.evaluate(() => (
    window.__COURSEWARE_EDITOR_DIRTY__
  ))).toBe(false)
}

async function dragSlideController(
  page: Page,
  frame: ControllerSnapshot,
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

async function dragScreenController(
  page: Page,
  controller: Locator,
  delta: { x: number; y: number },
): Promise<ScreenBox> {
  const before = await getScreenBox(controller)
  await page.mouse.move(
    before.x + before.width / 2,
    before.y + before.height / 2,
  )
  await page.mouse.down({ button: 'left' })
  await page.mouse.move(
    before.x + before.width / 2 + delta.x,
    before.y + before.height / 2 + delta.y,
    { steps: 4 },
  )
  await page.mouse.up({ button: 'left' })
  return before
}

async function selectSlideController(page: Page, layerItemId: string): Promise<void> {
  await expect(page.getByTestId('canvas-stage')).toBeVisible()
  await page.getByRole('tab', { name: '图层', exact: true }).click()
  const locate = page.getByTestId(`locate-controller-global-${layerItemId}`)
  await expect(locate).toBeEnabled()
  await locate.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByLabel('控制器标题')).toBeVisible()
}

async function selectFlowController(page: Page, layerItemId: string): Promise<void> {
  const card = page.getByTestId(`flow-layer-card-global-${layerItemId}`)
  await expect(card).toBeVisible()
  await card.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByLabel('控制器标题')).toBeVisible()
}

async function selectSpatialController(page: Page, layerItemId: string): Promise<Locator> {
  const workspace = page.getByTestId('spatial-workspace')
  await expect(workspace).toBeVisible()
  const controller = workspace.getByTestId('spatial-screen-controller')
  await expect(controller).toHaveAttribute('data-layer-item-id', layerItemId)
  await expect(controller).toHaveAttribute('data-layer-source', 'global')
  await controller.click()
  await page.getByRole('tab', { name: '属性', exact: true }).click()
  await expect(page.getByLabel('控制器标题')).toBeVisible()
  return controller
}

async function expectHiddenSharedEntries(page: Page): Promise<void> {
  await expect(page.getByTestId('global-layer-entry')).toHaveCount(0)
  await expect(page.getByTestId('surface-layer-entry')).toHaveCount(0)
}

function expectCleanRenderer(editor: EditorHandle): void {
  expect(editor.pageErrors, 'renderer page errors').toEqual([])
  expect(editor.consoleErrors, 'renderer console errors').toEqual([])
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  mkdirSync(runDirectory, { recursive: true })
  let project = createCourseProject({
    id: 'v9-global-controller-mixed-e2e',
    title: '全局控制器跨 Surface Gate',
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
  project = addSpatialCameraFrame(project, SPATIAL_SURFACE_ID, {
    x: 240,
    y: -160,
    zoom: 1.75,
  }, {
    id: SPATIAL_DETAIL_CAMERA_ID,
    name: '非 1x 镜头',
    now: NOW,
  })

  const slide = project.locations.find((location) => location.kind === 'slide-scene')
  const flow = project.locations.find((location) => location.surfaceId === FLOW_SURFACE_ID)
  const spatialDetail = project.locations.find(
    (location) => location.id === SPATIAL_DETAIL_CAMERA_ID,
  )
  if (!slide || !flow || !spatialDetail) {
    throw new Error('Mixed global-controller fixture locations are missing')
  }
  fixture = {
    slideLocationId: slide.id,
    flowLocationId: flow.id,
    spatialDetailLocationId: spatialDetail.id,
  }

  project = updateCourseProject(project, (draft) => {
    const controller = draft.globalLayerItems.find((entry) => (
      entry.item.kind === 'native' &&
      entry.item.content.nativeType === 'teacher-controller'
    ))?.item
    if (
      !controller ||
      controller.kind !== 'native' ||
      controller.content.nativeType !== 'teacher-controller'
    ) {
      throw new Error('Mixed fixture global teacher controller is missing')
    }
    // Keep the real controller fully visible in the Slide fit canvas and in
    // the fixed Spatial screen layer. This is fixture positioning only; all
    // later mutations go through the product UI.
    controller.frame = {
      ...controller.frame,
      x: 96,
      y: 96,
      width: 560,
      height: 64,
    }
    controller.content.data.title = '全课控制器（初始）'
    controller.content.data.collapsible = true
    draft.startLocationId = fixture.slideLocationId
    const draftSlide = draft.locations.find((location) => location.id === fixture.slideLocationId)
    const draftFlow = draft.locations.find((location) => location.id === fixture.flowLocationId)
    const draftSpatial = draft.locations.find(
      (location) => location.id === fixture.spatialDetailLocationId,
    )
    if (!draftSlide || !draftFlow || !draftSpatial) {
      throw new Error('Mixed fixture locations changed unexpectedly')
    }
    draftSlide.label = '幻灯片 · 控制器'
    draftFlow.label = '讲义 · 控制器'
    draftSpatial.label = '空间 · 非 1x 控制器'
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

test('keeps one global teacher controller through Slide, Flow, Spatial, trial, save and reopen', async () => {
  test.slow()
  const initial = readControllerSnapshot(sourceProjectPath)
  expect(initial.title).toBe('全课控制器（初始）')
  expect(initial.collapsible).toBe(true)

  let editor = await launchEditor()
  try {
    await openProject(editor, sourceProjectPath)
    await expect(editor.page.getByTestId(`course-location-${fixture.slideLocationId}`))
      .toHaveAttribute('aria-current', 'page')
    await expectHiddenSharedEntries(editor.page)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    // Slide: the controller is reached from the flattened current-page list,
    // then its real canvas transform must produce exactly one saved revision.
    await selectSlideController(editor.page, initial.layerItemId)
    await dragSlideController(editor.page, initial, SLIDE_DELTA)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)
    await saveAs(editor, savedProjectPath)
    const afterSlide = await waitForControllerRevision(
      savedProjectPath,
      initial.revision + 1,
    )
    expectControllerSnapshot(afterSlide, {
      ...initial,
      revision: initial.revision + 1,
      x: initial.x + SLIDE_DELTA.x,
      y: initial.y + SLIDE_DELTA.y,
    })
    expect(readControllerSnapshot(sourceProjectPath)).toEqual(initial)

    // Flow: select the same global item ID and commit one shared property.
    await editor.page.getByTestId(`course-location-${fixture.flowLocationId}`).click()
    await expect(editor.page.getByTestId('workspace-flow-authoring')).toBeVisible()
    await selectFlowController(editor.page, initial.layerItemId)
    const title = editor.page.getByLabel('控制器标题')
    await title.fill(FINAL_CONTROLLER_TITLE)
    await title.press('Enter')
    await expect(title).toHaveValue(FINAL_CONTROLLER_TITLE)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)

    // Spatial: this is a fixed screen proxy at a non-1x camera. It must not
    // enter the world/minimap, and changing camera zoom must not resize it.
    await editor.page.getByTestId(`course-location-${fixture.spatialDetailLocationId}`).click()
    const workspace = editor.page.getByTestId('spatial-workspace')
    await expect(workspace).toBeVisible()
    await expect.poll(async () => Number(await workspace.getAttribute('data-camera-zoom')))
      .toBeCloseTo(1.75, 2)
    await expect(workspace.locator('[data-spatial-world] [data-spatial-screen-controller]'))
      .toHaveCount(0)
    await expect(workspace.getByTestId('spatial-minimap').locator(
      `[data-layer-item-id="${initial.layerItemId}"]`,
    )).toHaveCount(0)
    const spatialController = await selectSpatialController(editor.page, initial.layerItemId)
    await expect(editor.page.getByLabel('控制器标题')).toHaveValue(FINAL_CONTROLLER_TITLE)
    const beforeCameraZoom = await getScreenBox(spatialController)
    const zoomBefore = Number(await workspace.getAttribute('data-camera-zoom'))
    await workspace.getByRole('button', { name: '放大视图' }).click()
    await expect.poll(async () => Number(await workspace.getAttribute('data-camera-zoom')))
      .toBeGreaterThan(zoomBefore)
    expectScreenBoxUnscaled(await getScreenBox(spatialController), beforeCameraZoom)

    const screenBoxBeforeMove = await dragScreenController(
      editor.page,
      spatialController,
      SPATIAL_DELTA,
    )
    await expect(editor.page.getByTestId('spatial-screen-selection')).toBeVisible()
    await expectScreenBoxAt(spatialController, {
      ...screenBoxBeforeMove,
      x: screenBoxBeforeMove.x + SPATIAL_DELTA.x,
      y: screenBoxBeforeMove.y + SPATIAL_DELTA.y,
    })

    // The final gesture is Spatial only: undo must preserve the Flow title,
    // redo must restore precisely the fixed-screen frame.
    const undo = editor.page.getByRole('button', { name: '撤销（Ctrl+Z）' })
    const redo = editor.page.getByRole('button', {
      name: '重做（Ctrl+Y / Ctrl+Shift+Z）',
    })
    await expect(undo).toBeEnabled()
    await undo.click()
    await expectScreenBoxAt(spatialController, screenBoxBeforeMove)
    await expect(spatialController).toContainText(FINAL_CONTROLLER_TITLE)
    await expect(redo).toBeEnabled()
    await redo.click()
    await expectScreenBoxAt(spatialController, {
      ...screenBoxBeforeMove,
      x: screenBoxBeforeMove.x + SPATIAL_DELTA.x,
      y: screenBoxBeforeMove.y + SPATIAL_DELTA.y,
    })

    await editor.page.keyboard.press('Control+s')
    const finalSaved = await waitForControllerRevision(
      savedProjectPath,
      initial.revision + 3,
    )
    expectControllerSnapshot(finalSaved, {
      ...initial,
      revision: initial.revision + 3,
      title: FINAL_CONTROLLER_TITLE,
      x: initial.x + SLIDE_DELTA.x + SPATIAL_DELTA.x,
      y: initial.y + SLIDE_DELTA.y + SPATIAL_DELTA.y,
    })
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
    const reopened = readControllerSnapshot(savedProjectPath)
    expectControllerSnapshot(reopened, {
      ...initial,
      revision: initial.revision + 3,
      title: FINAL_CONTROLLER_TITLE,
      x: initial.x + SLIDE_DELTA.x + SPATIAL_DELTA.x,
      y: initial.y + SLIDE_DELTA.y + SPATIAL_DELTA.y,
    })
    await expectHiddenSharedEntries(editor.page)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)

    // The same persisted global item is visible and inspectable at all three
    // authoring surfaces after a full Electron close/relaunch.
    await selectSlideController(editor.page, reopened.layerItemId)
    await expect(editor.page.getByLabel('控制器标题')).toHaveValue(FINAL_CONTROLLER_TITLE)

    await editor.page.getByTestId(`course-location-${fixture.flowLocationId}`).click()
    await expect(editor.page.getByTestId('workspace-flow-authoring')).toBeVisible()
    await selectFlowController(editor.page, reopened.layerItemId)
    await expect(editor.page.getByLabel('控制器标题')).toHaveValue(FINAL_CONTROLLER_TITLE)

    await editor.page.getByTestId(`course-location-${fixture.spatialDetailLocationId}`).click()
    const reopenedWorkspace = editor.page.getByTestId('spatial-workspace')
    await expect(reopenedWorkspace).toBeVisible()
    const reopenedSpatialController = await selectSpatialController(editor.page, reopened.layerItemId)
    await expect(editor.page.getByLabel('控制器标题')).toHaveValue(FINAL_CONTROLLER_TITLE)
    const reopenedScreenBox = await getScreenBox(reopenedSpatialController)
    expect(reopenedScreenBox.width).toBeGreaterThan(0)
    expect(reopenedScreenBox.height).toBeGreaterThan(0)

    // Trial owns session-only controller state. Collapsing it must not dirty
    // or persist a course mutation when the author returns to Spatial.
    const beforeTrial = readControllerSnapshot(savedProjectPath)
    await editor.page.getByTestId('workspace-spatial-trial-run').click()
    const trial = editor.page.frameLocator('[data-testid="trial-run-frame"]')
    const trialController = trial.locator('.spatial-surface .spatial-screen-teacher-controller')
    await expect(trialController).toBeVisible()
    await expect(trialController).toContainText(FINAL_CONTROLLER_TITLE)
    await trialController.getByRole('button', { name: '收起教师控制器' })
      .click({ force: true })
    await expect(trialController.getByRole('button', { name: '展开教师控制器' }))
      .toBeVisible()
    await editor.page.getByTestId('trial-run-exit').click()
    await expect(editor.page.getByTestId('trial-run-frame')).toHaveCount(0)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    expect(readControllerSnapshot(savedProjectPath)).toEqual(beforeTrial)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})
