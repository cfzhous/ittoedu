/**
 * Recapture the V8 shell visual baseline (tests/contracts/v8-shell-baseline).
 *
 * Justification: the frozen baseline was captured on 2026-08-14 from base
 * commit 3e41ec0, i.e. WITH the P1 shell-height defect (appShell pinned at
 * 720px, window background exposed below taller viewports). That behavior was
 * explicitly retired by M3-B0 and is locked by the replacement geometry
 * assertions in tests/e2e/v9SlideVerticalSlice.spec.ts, so per the plan's
 * contract rule ("old behavior retired + replacement test exists") the golden
 * is recaptured against the same original shell with the corrected height.
 *
 * Mirrors the drive sequence in scripts/verify-editor-preservation.ts
 * (runVisualVerification) and writes geometry.json + the three PNGs.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path, { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { execFileSync } from 'node:child_process'

const root = resolve(__dirname, '..')
const baselineDir = join(root, 'tests', 'contracts', 'v8-shell-baseline')
const goldenViewports = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

async function waitFor<T>(predicate: () => Promise<T | null | false>, label: string, timeoutMs = 15_000): Promise<T> {
  const started = Date.now()
  let lastError: unknown
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await predicate()
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100))
  }
  const suffix = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`VISUAL_TIMEOUT: ${label}${suffix}`)
}

async function readGeometry(page: any, viewport: { width: number; height: number }) {
  return page.evaluate(({ expectedWidth, expectedHeight }: any) => {
    const selectors: Record<string, string> = {
      appShell: '.app-shell',
      toolbar: '[data-testid="top-toolbar"]',
      appMain: '.app-main',
      scenePanel: '.scene-panel',
      editorCenter: '.editor-center',
      workspace: 'main[aria-label="课件画布"]',
      canvasViewport: '.canvas-viewport',
      canvasStage: '[data-testid="canvas-stage"]',
      stateStrip: '.scene-state-strip',
      rightSidebar: '.right-sidebar',
      statusBar: '.status-bar',
    }
    const rectangles: Record<string, unknown> = {}
    for (const [name, selector] of Object.entries(selectors)) {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) throw new Error(`Missing live element: ${name}`)
      const rect = element.getBoundingClientRect()
      rectangles[name] = {
        x: Number(rect.x.toFixed(3)),
        y: Number(rect.y.toFixed(3)),
        width: Number(rect.width.toFixed(3)),
        height: Number(rect.height.toFixed(3)),
        right: Number(rect.right.toFixed(3)),
        bottom: Number(rect.bottom.toFixed(3)),
      }
    }
    return {
      expectedViewport: { width: expectedWidth, height: expectedHeight },
      actualViewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      document: {
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight,
      },
      rectangles,
    }
  }, { expectedWidth: viewport.width, expectedHeight: viewport.height })
}

async function main() {
  const profileDirectory = mkdtempSync(path.join(tmpdir(), 'ittoedu-golden-recapture-'))
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const externalRequests: string[] = []
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profileDirectory}`],
    cwd: root,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', COURSEWARE_E2E_BACKGROUND: '1' },
  })
  try {
    const page = await app.firstWindow()
    page.on('pageerror', (error: Error) => pageErrors.push(error.message))
    page.on('console', (message: any) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('request', (request: any) => {
      const url = new URL(request.url())
      if (['http:', 'https:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
        externalRequests.push(request.url())
      }
    })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('.app-shell').waitFor()
    await page.locator('[data-testid="canvas-stage"] canvas').waitFor()
    const routeButton = page.getByTestId('open-course-v9')
    if (await routeButton.count()) {
      await routeButton.evaluate((button: HTMLElement) => { button.hidden = true })
    }
    await page.getByRole('button', { name: '专业', exact: true }).click()
    await waitFor(
      () => page.getByRole('button', { name: '专业', exact: true })
        .getAttribute('aria-pressed').then((value: string | null) => value === 'true'),
      'professional mode',
    )
    const initialStateButton = page.locator('.scene-state-card').filter({
      has: page.locator('.scene-state-card__name', { hasText: '初始' }),
    })
    await initialStateButton.click()
    await waitFor(
      () => initialStateButton.getAttribute('aria-pressed').then((value: string | null) => value === 'true'),
      'named initial state',
    )
    const initialRetry = page.getByRole('button', { name: '重新载入画布', exact: true })
    if (await initialRetry.count()) await initialRetry.click()
    await waitFor(
      () => page.locator('.runtime-preview-loading').count().then((count: number) => count === 0),
      'initial preview',
    )
    await page.getByRole('tab', { name: '元素', exact: true }).click()
    await page.getByRole('tab', { name: '常用', exact: true }).click()
    await page.getByTestId('add-text').click()
    const insertionRetry = page.getByRole('button', { name: '重新载入画布', exact: true })
    if (await insertionRetry.count()) await insertionRetry.click()
    await waitFor(
      () => page.locator('.runtime-preview-loading').count().then((count: number) => count === 0),
      'preview after text insertion',
    )
    await waitFor(
      () => page.locator('.status-bar').textContent().then((text: string | null) => Boolean(text?.includes('已选：'))),
      'selected text status',
    )
    await page.getByRole('tab', { name: '图层', exact: true }).click()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(650)

    const captures: unknown[] = []
    for (const viewport of goldenViewports) {
      const resizeTrace: unknown[] = []
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
        resizeTrace.push(actual)
        if (actual.width === viewport.width && actual.height === viewport.height) break
        const expectedContentSize = await app.evaluate(({ BrowserWindow }: any, correction: any) => {
          const window = BrowserWindow.getAllWindows()[0]
          if (!window) throw new Error('Editor BrowserWindow is missing')
          const [width, height] = window.getSize()
          window.setSize(
            Math.max(1, width + correction.width),
            Math.max(1, height + correction.height),
            false,
          )
          const [contentWidth, contentHeight] = window.getContentSize()
          return { width: contentWidth, height: contentHeight }
        }, { width: viewport.width - actual.width, height: viewport.height - actual.height })
        await waitFor(
          () => page.evaluate(
            ({ width, height }: any) => innerWidth === width && innerHeight === height,
            expectedContentSize,
          ),
          `${viewport.width}x${viewport.height} native content resize synchronization`,
        )
      }
      await waitFor(
        () => page.evaluate(
          ({ width, height }: any) => innerWidth === width && innerHeight === height,
          viewport,
        ),
        `${viewport.width}x${viewport.height} viewport`,
      )
      await waitFor(async () => {
        const liveGeometry = await readGeometry(page, viewport)
        // Stabilization: two consecutive reads must be identical.
        await page.waitForTimeout(120)
        const again = await readGeometry(page, viewport)
        return JSON.stringify(liveGeometry) === JSON.stringify(again) ? true : null
      }, `${viewport.width}x${viewport.height} geometry stabilization`)
      await page.waitForTimeout(350)
      const geometry = await readGeometry(page, viewport)
      const pngPath = join(baselineDir, `${viewport.width}x${viewport.height}.png`)
      await page.screenshot({ path: pngPath, fullPage: false, scale: 'css' })
      const { readFileSync } = await import('node:fs')
      const bytes = readFileSync(pngPath)
      captures.push({
        viewport,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        resizeTrace,
        geometry,
        screenshotFile: `${viewport.width}x${viewport.height}.png`,
      })
      console.log(`captured ${viewport.width}x${viewport.height}: appShell=${JSON.stringify((geometry as any).rectangles.appShell)}`)
    }

    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim()
    const contract = {
      capturedAt: new Date().toISOString(),
      sourceCommit,
      executionParent: sourceCommit,
      recaptureReason: 'Retire frozen P1 shell-height defect geometry (appShell pinned at 720px exposing window background below taller viewports). The same original shell now fills the viewport; replacement assertions live in tests/e2e/v9SlideVerticalSlice.spec.ts (expectAppShellFillsViewport).',
      captures,
      diagnostics: { pageErrors, consoleErrors, externalRequests },
    }
    writeFileSync(join(baselineDir, 'geometry.json'), JSON.stringify(contract, null, 2))
    console.log('geometry.json written; diagnostics:', JSON.stringify(contract.diagnostics))
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
