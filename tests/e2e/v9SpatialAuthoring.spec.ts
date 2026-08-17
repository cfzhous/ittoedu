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
  addCourseSurface,
  addSpatialCameraFrame,
  addSpatialTextLayer,
  createCourseProject,
  updateCourseProject,
} from '../../src/renderer/course/courseStudioModel'
import {
  createCourseProjectArchive,
  openCourseProjectArchive,
} from '../../src/renderer/project/courseProjectArchive'

const root = resolve(__dirname, '..', '..')
const runDirectory = join(tmpdir(), `ittoedu-v9-spatial-authoring-${process.pid}`)
const userDataDirectory = join(runDirectory, 'electron-profile')
const sourceProjectPath = join(runDirectory, 'spatial-authoring-source.h5lesson')
const savedProjectPath = join(runDirectory, 'spatial-authoring-roundtrip.h5lesson')
const cameraSessionProjectPath = join(runDirectory, 'spatial-camera-session.h5lesson')
const NOW = '2026-08-15T12:00:00.000Z'
const SPATIAL_SURFACE_ID = 'spatial-authoring-surface'
const SPATIAL_CAMERA_ID = 'spatial-authoring-overview'
const SPATIAL_CAMERA_B_ID = 'spatial-authoring-detail'
const SECOND_SPATIAL_SURFACE_ID = 'spatial-authoring-second-surface'
const SECOND_SPATIAL_CAMERA_ID = 'spatial-authoring-second-overview'
const TEXT_ID = 'spatial-authoring-text'
const TEXT_NAME = '空间文本'
const TEXT_INITIAL = { x: -300, y: 90, width: 400, height: 80, rotation: 0 }
const SPATIAL_CAMERA_B = { x: 480, y: -240, zoom: 1.75 }
const SECOND_SPATIAL_HOME = { x: -180, y: 140, zoom: 1.25 }

interface EditorHandle {
  app: ElectronApplication
  page: Page
  pageErrors: string[]
  consoleErrors: string[]
}

interface SpatialTextSnapshot {
  revision: number
  layerItemId: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

interface SpatialCameraSnapshot {
  revision: number
  home: { x: number; y: number; zoom: number }
  frames: Array<{ id: string; x: number; y: number; zoom: number }>
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
    .toContainText('空间创作真实纵切')
  await expect(editor.page.locator('.runtime-preview-loading')).toHaveCount(0)
  await editor.page.getByTestId('spatial-workspace').waitFor()
}

async function enterSpatialWorkspace(page: Page): Promise<void> {
  await expect(page.getByTestId('spatial-workspace')).toBeVisible()
  await expect(page.locator('.runtime-preview-loading')).toHaveCount(0)
}

function readSpatialText(path: string): SpatialTextSnapshot {
  const archive = openCourseProjectArchive(readFileSync(path))
  expect(archive.project.schemaVersion).toBe(9)
  const surface = archive.project.surfaces.find(
    (candidate) => candidate.id === SPATIAL_SURFACE_ID,
  )
  if (!surface || surface.type !== 'spatial-2d') {
    throw new Error('Saved Spatial surface is missing')
  }
  const item = surface.world.layerItems.find(
    (candidate) => candidate.layerItemId === TEXT_ID,
  )
  if (!item || item.kind !== 'native' || item.content.nativeType !== 'text') {
    throw new Error('Saved Spatial Native text is missing')
  }
  return {
    revision: archive.project.revision,
    layerItemId: item.layerItemId,
    x: item.frame.x,
    y: item.frame.y,
    width: item.frame.width,
    height: item.frame.height,
    rotation: item.rotation,
  }
}

function readSpatialCamera(path: string, surfaceId: string): SpatialCameraSnapshot {
  const archive = openCourseProjectArchive(readFileSync(path))
  const surface = archive.project.surfaces.find((candidate) => candidate.id === surfaceId)
  if (!surface || surface.type !== 'spatial-2d') {
    throw new Error(`Saved Spatial surface is missing: ${surfaceId}`)
  }
  return {
    revision: archive.project.revision,
    home: { ...surface.camera.home },
    frames: surface.camera.frames.map((frame) => ({
      id: frame.id,
      x: frame.x,
      y: frame.y,
      zoom: frame.zoom,
    })),
  }
}

async function waitForSpatialText(path: string): Promise<SpatialTextSnapshot> {
  await expect.poll(() => {
    if (!existsSync(path)) return false
    try {
      readSpatialText(path)
      return true
    } catch {
      return false
    }
  }).toBe(true)
  return readSpatialText(path)
}

async function expectChromeSizesStable(page: Page, before: ChromeSizes): Promise<void> {
  const workspace = page.getByTestId('spatial-workspace')
  const controls = workspace.locator('.spatial-workspace__controls')
  const minimap = workspace.getByTestId('spatial-minimap')
  const controlsBox = await controls.boundingBox()
  const minimapBox = await minimap.boundingBox()
  expect(controlsBox).not.toBeNull()
  expect(minimapBox).not.toBeNull()
  expect(Math.abs(controlsBox!.width - before.controlsWidth)).toBeLessThanOrEqual(1)
  expect(Math.abs(controlsBox!.height - before.controlsHeight)).toBeLessThanOrEqual(1)
  expect(Math.abs(minimapBox!.width - before.minimapWidth)).toBeLessThanOrEqual(1)
  expect(Math.abs(minimapBox!.height - before.minimapHeight)).toBeLessThanOrEqual(1)
}

interface ChromeSizes {
  controlsWidth: number
  controlsHeight: number
  minimapWidth: number
  minimapHeight: number
}

async function readChromeSizes(page: Page): Promise<ChromeSizes> {
  const workspace = page.getByTestId('spatial-workspace')
  const controlsBox = await workspace.locator('.spatial-workspace__controls').boundingBox()
  const minimapBox = await workspace.getByTestId('spatial-minimap').boundingBox()
  if (!controlsBox || !minimapBox) throw new Error('Spatial chrome is not measurable')
  return {
    controlsWidth: controlsBox.width,
    controlsHeight: controlsBox.height,
    minimapWidth: minimapBox.width,
    minimapHeight: minimapBox.height,
  }
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
    'Surface',
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
    id: 'v9-spatial-authoring-e2e',
    title: '空间创作真实纵切',
    now: NOW,
  })
  project = addCourseSurface(project, 'spatial-2d', {
    id: SPATIAL_SURFACE_ID,
    title: '空间画布',
    now: NOW,
  })
  project = addSpatialTextLayer(project, SPATIAL_SURFACE_ID, '这是一条空间文本', {
    id: TEXT_ID,
    x: TEXT_INITIAL.x,
    y: TEXT_INITIAL.y,
    now: NOW,
  })
  project = addSpatialCameraFrame(project, SPATIAL_SURFACE_ID, {
    x: 0,
    y: 0,
    zoom: 1,
  }, {
    id: SPATIAL_CAMERA_ID,
    name: '总览',
    now: NOW,
  })
  project = addSpatialCameraFrame(project, SPATIAL_SURFACE_ID, SPATIAL_CAMERA_B, {
    id: SPATIAL_CAMERA_B_ID,
    name: '细节镜头',
    now: NOW,
  })
  project = addCourseSurface(project, 'spatial-2d', {
    id: SECOND_SPATIAL_SURFACE_ID,
    title: '第二空间画布',
    now: NOW,
  })
  project = addSpatialCameraFrame(project, SECOND_SPATIAL_SURFACE_ID, SECOND_SPATIAL_HOME, {
    id: SECOND_SPATIAL_CAMERA_ID,
    name: '第二总览',
    now: NOW,
  })
  project = updateCourseProject(project, (draft) => {
    const secondSurface = draft.surfaces.find(
      (surface) => surface.id === SECOND_SPATIAL_SURFACE_ID,
    )
    if (!secondSurface || secondSurface.type !== 'spatial-2d') {
      throw new Error('Second Spatial surface is missing')
    }
    secondSurface.camera.home = { ...SECOND_SPATIAL_HOME }
    draft.startLocationId = SPATIAL_CAMERA_ID
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

test('authors one Spatial world text with stable chrome across camera and save', async () => {
  test.slow()
  const sourceBytes = readFileSync(sourceProjectPath)
  const initial = readSpatialText(sourceProjectPath)
  expect(initial).toMatchObject({
    layerItemId: TEXT_ID,
    x: TEXT_INITIAL.x,
    y: TEXT_INITIAL.y,
    width: TEXT_INITIAL.width,
    height: TEXT_INITIAL.height,
    rotation: TEXT_INITIAL.rotation,
  })

  let editor = await launchEditor()
  let firstSaved: SpatialTextSnapshot
  try {
    await openProject(editor, sourceProjectPath)
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(false)
    await expectNoProtocolLeak(editor.page)
    await enterSpatialWorkspace(editor.page)

    const workspace = editor.page.getByTestId('spatial-workspace')
    await expect(workspace.getByTestId('spatial-zoom-label')).toHaveText('100%')
    const homeChrome = await readChromeSizes(editor.page)

    // Session camera changes must never resize the outside-transform chrome.
    await workspace.getByRole('button', { name: '放大视图' }).click()
    await workspace.getByRole('button', { name: '放大视图' }).click()
    await expect.poll(async () => Number(await workspace.getAttribute('data-camera-zoom')))
      .toBeCloseTo(1.5625, 2)
    await expectChromeSizesStable(editor.page, homeChrome)

    await workspace.getByRole('button', { name: '缩小视图' }).click()
    await workspace.getByRole('button', { name: '缩小视图' }).click()
    await workspace.getByRole('button', { name: '缩小视图' }).click()
    await workspace.getByRole('button', { name: '缩小视图' }).click()
    await expect.poll(async () => Number(await workspace.getAttribute('data-camera-zoom')))
      .toBeCloseTo(0.64, 2)
    await expectChromeSizesStable(editor.page, homeChrome)

    await workspace.getByRole('button', { name: '回到总览' }).click()
    await expect(workspace.getByTestId('spatial-zoom-label')).toHaveText('100%')
    await expect(workspace).toHaveAttribute('data-camera-x', '0')
    await expect(workspace).toHaveAttribute('data-camera-y', '0')

    // Empty-space pan is session-only and must not move chrome boxes.
    const workspaceBox = await workspace.boundingBox()
    if (!workspaceBox) throw new Error('Spatial workspace has no bounds')
    await editor.page.mouse.move(workspaceBox.x + workspaceBox.width / 2, workspaceBox.y + workspaceBox.height / 2)
    await editor.page.mouse.down({ button: 'left' })
    await editor.page.mouse.move(workspaceBox.x + workspaceBox.width / 2 + 120, workspaceBox.y + workspaceBox.height / 2 + 60, { steps: 4 })
    await editor.page.mouse.up({ button: 'left' })
    await expect.poll(async () => await workspace.getAttribute('data-camera-x')).not.toBe('0')
    await expectChromeSizesStable(editor.page, homeChrome)
    await workspace.getByRole('button', { name: '回到总览' }).click()

    // Selection chrome is outside the transform too: its screen size equals
    // the world size multiplied by the current session zoom.
    const textItem = workspace.locator(`[data-layer-item-id="${TEXT_ID}"]`).first()
    await textItem.click({ position: { x: 40, y: 20 } })
    const selection = workspace.getByTestId('spatial-selection')
    await expect(selection).toHaveCount(1)
    const zoomAtSelect = Number(await workspace.getAttribute('data-camera-zoom'))
    const selectionBox = await selection.boundingBox()
    expect(selectionBox).not.toBeNull()
    expect(Math.abs(selectionBox!.width - TEXT_INITIAL.width * zoomAtSelect)).toBeLessThanOrEqual(1)
    expect(Math.abs(selectionBox!.height - TEXT_INITIAL.height * zoomAtSelect)).toBeLessThanOrEqual(1)

    // Drag move commits once through the seam and writes one revision.
    const beforeMove = await selection.boundingBox()
    if (!beforeMove) throw new Error('Selection box has no bounds')
    await editor.page.mouse.move(beforeMove.x + beforeMove.width / 2, beforeMove.y + beforeMove.height / 2)
    await editor.page.mouse.down({ button: 'left' })
    await editor.page.mouse.move(
      beforeMove.x + beforeMove.width / 2 + 54 * zoomAtSelect,
      beforeMove.y + beforeMove.height / 2 - 26 * zoomAtSelect,
      { steps: 4 },
    )
    await editor.page.mouse.up({ button: 'left' })
    await expect.poll(() => editor.page.evaluate(() => (
      window.__COURSEWARE_EDITOR_DIRTY__
    ))).toBe(true)

    await saveAs(editor, savedProjectPath)
    firstSaved = await waitForSpatialText(savedProjectPath)
    expect(firstSaved.revision).toBeGreaterThan(initial.revision)
    expect(firstSaved.layerItemId).toBe(TEXT_ID)
    expect(firstSaved.width).toBeCloseTo(TEXT_INITIAL.width, 0)
    expect(firstSaved.height).toBeCloseTo(TEXT_INITIAL.height, 0)
    expect(Math.abs(firstSaved.x - (TEXT_INITIAL.x + 54))).toBeLessThanOrEqual(1)
    expect(Math.abs(firstSaved.y - (TEXT_INITIAL.y - 26))).toBeLessThanOrEqual(1)
    expect(readFileSync(sourceProjectPath)).toEqual(sourceBytes)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }

  editor = await launchEditor()
  try {
    await openProject(editor, savedProjectPath)
    await expectNoProtocolLeak(editor.page)
    const reopened = readSpatialText(savedProjectPath)
    expect(reopened.layerItemId).toBe(TEXT_ID)
    expect(Math.abs(reopened.x - firstSaved.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(reopened.y - firstSaved.y)).toBeLessThanOrEqual(1)
    await enterSpatialWorkspace(editor.page)
    await expect(editor.page.getByTestId('spatial-workspace')).toBeVisible()
    await expect(editor.page.getByTestId('spatial-workspace').getByTestId('spatial-zoom-label'))
      .toHaveText('100%')
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})

test('captures the selected Spatial frame pose and resets session state for another surface', async () => {
  test.slow()
  const firstBefore = readSpatialCamera(sourceProjectPath, SPATIAL_SURFACE_ID)
  const secondBefore = readSpatialCamera(sourceProjectPath, SECOND_SPATIAL_SURFACE_ID)
  const editor = await launchEditor()
  try {
    await openProject(editor, sourceProjectPath)
    const page = editor.page
    const workspace = page.getByTestId('spatial-workspace')
    const cameraPanel = page.getByTestId('scene-panel-spatial-frames')

    await page.getByTestId(`course-location-${SPATIAL_CAMERA_B_ID}`).click()
    await expect(workspace).toHaveAttribute('data-camera-x', String(SPATIAL_CAMERA_B.x))
    await expect(workspace).toHaveAttribute('data-camera-y', String(SPATIAL_CAMERA_B.y))
    await expect(workspace).toHaveAttribute('data-camera-zoom', String(SPATIAL_CAMERA_B.zoom))

    await cameraPanel.getByRole('button', { name: '从当前画面添加' }).click()
    await cameraPanel.getByRole('button', { name: '设为首页镜头' }).click()

    // A different Spatial surface must clear the previous surface's session
    // pose. Its own authored home pose is then the safe capture fallback.
    await page.getByTestId(`course-location-${SECOND_SPATIAL_CAMERA_ID}`).click()
    await expect(workspace).toHaveAttribute('data-camera-x', String(SECOND_SPATIAL_HOME.x))
    await expect(workspace).toHaveAttribute('data-camera-y', String(SECOND_SPATIAL_HOME.y))
    await expect(workspace).toHaveAttribute('data-camera-zoom', String(SECOND_SPATIAL_HOME.zoom))
    await cameraPanel.getByRole('button', { name: '从当前画面添加' }).click()

    await saveAs(editor, cameraSessionProjectPath)
    const firstAfter = readSpatialCamera(cameraSessionProjectPath, SPATIAL_SURFACE_ID)
    const secondAfter = readSpatialCamera(cameraSessionProjectPath, SECOND_SPATIAL_SURFACE_ID)

    expect(firstAfter.revision).toBeGreaterThan(firstBefore.revision)
    expect(firstAfter.home).toEqual(SPATIAL_CAMERA_B)
    expect(firstAfter.frames).toHaveLength(firstBefore.frames.length + 1)
    expect(firstAfter.frames.at(-1)).toMatchObject(SPATIAL_CAMERA_B)

    expect(secondAfter.frames).toHaveLength(secondBefore.frames.length + 1)
    expect(secondAfter.frames.at(-1)).toMatchObject(SECOND_SPATIAL_HOME)
    expectCleanRenderer(editor)
  } finally {
    await closeEditor(editor.app)
  }
})
