/**
 * T12 evidence-only capture. Not a product feature and not a golden updater.
 * Produces Slide / Flow / Spatial / Mixed chrome screenshots at three viewports.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'

const root = resolve(__dirname, '..', '..', '..', '..')
const outDir = resolve(__dirname, 'experience')
const viewports = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const

async function waitFor(predicate: () => Promise<boolean>, label: string, timeoutMs = 15_000): Promise<void> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      if (await predicate()) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 120))
  }
  const suffix = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`Timeout waiting for ${label}${suffix}`)
}

async function resizeTo(app: ElectronApplication, page: Page, width: number, height: number): Promise<void> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
    if (actual.width === width && actual.height === height) return
    await app.evaluate(({ BrowserWindow }, correction) => {
      const window = BrowserWindow.getAllWindows()[0]
      if (!window) throw new Error('Editor BrowserWindow is missing')
      const [currentWidth, currentHeight] = window.getSize()
      window.setSize(
        Math.max(1, currentWidth + correction.width),
        Math.max(1, currentHeight + correction.height),
        false,
      )
    }, {
      width: width - actual.width,
      height: height - actual.height,
    })
    await waitFor(
      () => page.evaluate(
        (expected) => innerWidth === expected.width && innerHeight === expected.height,
        { width, height },
      ),
      `viewport ${width}x${height}`,
      4_000,
    ).catch(() => undefined)
  }
  const finalSize = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  if (finalSize.width !== width || finalSize.height !== height) {
    throw new Error(`Could not reach ${width}x${height}, got ${finalSize.width}x${finalSize.height}`)
  }
}

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true })
  const profileDirectory = join(tmpdir(), `ittoedu-t12-experience-${process.pid}`)
  rmSync(profileDirectory, { recursive: true, force: true })
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profileDirectory}`],
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      COURSEWARE_E2E_BACKGROUND: '1',
    },
  })
  const page = await app.firstWindow()
  try {
    await page.waitForLoadState('domcontentloaded')
    await page.locator('.app-shell').waitFor()
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      })
      dialog.showMessageBoxSync = () => 1
    })

    const jobs: Array<{
      name: 'slide' | 'flow' | 'spatial' | 'mixed'
      ready: () => Promise<boolean>
      setup: () => Promise<void>
    }> = [
      {
        name: 'slide',
        ready: async () => (await page.getByTestId('canvas-stage').count()) === 1,
        setup: async () => {
          await page.getByTestId('new-course-menu').locator('summary').click()
          await page.getByTestId('new-blank-slide').click()
          await page.getByTestId('canvas-stage').locator('canvas').waitFor()
          await page.getByRole('tab', { name: '图层', exact: true }).click()
        },
      },
      {
        name: 'flow',
        ready: async () => (await page.getByTestId('workspace-flow-authoring').count()) === 1,
        setup: async () => {
          await page.getByTestId('new-course-menu').locator('summary').click()
          await page.getByTestId('new-blank-flow').click()
          await page.getByTestId('workspace-flow-authoring').waitFor()
        },
      },
      {
        name: 'spatial',
        ready: async () => (await page.getByTestId('spatial-workspace').count()) === 1,
        setup: async () => {
          await page.getByTestId('new-course-menu').locator('summary').click()
          await page.getByTestId('new-blank-spatial').click()
          await page.getByTestId('spatial-workspace').waitFor()
        },
      },
      {
        name: 'mixed',
        ready: async () => (
          (await page.getByTestId('course-page-tree').count()) === 1
          && (await page.getByTestId('add-flow-page').count()) === 1
          && (await page.getByTestId('add-spatial-page').count()) === 1
        ),
        setup: async () => {
          await page.getByTestId('new-course-menu').locator('summary').click()
          await page.getByTestId('new-blank-slide').click()
          await page.getByTestId('canvas-stage').locator('canvas').waitFor()
          await page.getByTestId('add-content-menu').locator('summary').click()
          await page.getByTestId('add-flow-page').click()
          await page.getByTestId('add-content-menu').locator('summary').click()
          await page.getByTestId('add-spatial-page').click()
          await page.getByTestId('course-page-tree').waitFor()
        },
      },
    ]

    for (const job of jobs) {
      await job.setup()
      await waitFor(job.ready, `${job.name} workspace`)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(280)
      for (const viewport of viewports) {
        await resizeTo(app, page, viewport.width, viewport.height)
        const file = join(outDir, `${job.name}-${viewport.width}x${viewport.height}.png`)
        await page.screenshot({ path: file, fullPage: false, scale: 'css' })
        console.log(`wrote ${file}`)
      }
    }
  } finally {
    const child = app.process()
    await app.evaluate(({ app: electronApp, BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((window) => window.destroy())
      setTimeout(() => electronApp.exit(0), 0)
    }).catch(() => undefined)
    await Promise.race([
      app.close().catch(() => undefined),
      new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 5_000)),
    ])
    if (child && child.exitCode === null) child.kill()
    rmSync(profileDirectory, { recursive: true, force: true })
  }
}

void main()
