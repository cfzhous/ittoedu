import { chromium, expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

const projectRoot = resolve(__dirname, '..', '..')
const htmlPath = join(
  projectRoot,
  'examples',
  'render-host-benchmark',
  'render-host-benchmark.html',
)
const visualOutputDirectory = join(projectRoot, 'output', 'playwright')

async function goToScene(page: Page, index: number): Promise<void> {
  expect(await page.evaluate((targetIndex) =>
    (window as any).__H5_LESSON_PLAYER__?.goToScene(targetIndex) === true,
  index)).toBe(true)
  await page.waitForFunction((targetIndex) =>
    (window as any).__H5_LESSON_PLAYER__?.getCurrentSceneIndex() === targetIndex,
  index)
}

async function clickLogicalPoint(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator('.lesson-canvas-host canvas').first()
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Player canvas is not visible')
  await page.mouse.click(
    bounds.x + x / 1280 * bounds.width,
    bounds.y + y / 720 * bounds.height,
  )
}

async function phaserTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const player = (window as any).__H5_LESSON_PLAYER__
    const scene = player.game.scene.getScene('courseware-player')
    const texts: string[] = []
    const visit = (candidate: any): void => {
      if (typeof candidate?.text === 'string') texts.push(candidate.text)
      if (Array.isArray(candidate?.list)) candidate.list.forEach(visit)
    }
    scene.children.list.forEach(visit)
    return texts
  })
}

test('Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主', async () => {
  mkdirSync(visualOutputDirectory, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('request', (request) => {
    if (/^(?:https?|wss?):/i.test(request.url())) externalRequests.push(request.url())
  })

  await page.addInitScript(() => {
    const originalRequest = window.requestAnimationFrame.bind(window)
    const originalCancel = window.cancelAnimationFrame.bind(window)
    const active = new Set<number>()
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      let id = 0
      id = originalRequest((time) => {
        active.delete(id)
        callback(time)
      })
      active.add(id)
      return id
    }
    window.cancelAnimationFrame = (id: number): void => {
      active.delete(id)
      originalCancel(id)
    }
    ;(window as any).__renderHostActiveRafCount = () => active.size
  })

  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' })
    await page.waitForFunction(() => Boolean((window as any).__H5_LESSON_PLAYER__))
    await expect.poll(() => page.evaluate(() =>
      (window as any).__H5_LESSON_PLAYER__.getCurrentSceneIndex(),
    )).toBe(0)
    await expect.poll(() => page.evaluate(() => {
      const scene = (window as any).__H5_LESSON_PLAYER__.game.scene
        .getScene('courseware-player')
      return scene.children.getByName('scene-nodes')?.list.length ?? 0
    })).toBe(8)

    await goToScene(page, 1)
    await clickLogicalPoint(page, 900, 344)
    await expect.poll(async () => (await phaserTexts(page)).some((text) =>
      text.includes('已从右侧施加脉冲'),
    )).toBe(true)

    await goToScene(page, 2)
    const threeCanvas = page.locator('.lesson-runtime-mount canvas')
    await expect(threeCanvas).toBeVisible()
    const threeBounds = await threeCanvas.boundingBox()
    if (!threeBounds) throw new Error('Three.js canvas is not visible')
    await page.mouse.move(threeBounds.x + threeBounds.width * 0.7, threeBounds.y + threeBounds.height * 0.48)
    await page.mouse.down()
    await page.mouse.move(threeBounds.x + threeBounds.width * 0.55, threeBounds.y + threeBounds.height * 0.34, { steps: 8 })
    await page.mouse.up()
    await expect(page.locator('.lesson-runtime-mount output')).toHaveText('视角已更新')
    await threeCanvas.hover()
    await page.mouse.wheel(0, -180)
    await expect(page.locator('.lesson-runtime-mount output')).toHaveText('观察距离已更新')
    await page.getByRole('button', { name: '恢复视角' }).click()
    await expect(page.locator('.lesson-runtime-mount output')).toHaveText('已恢复默认观察视角')
    await page.evaluate(() => (window as any).__H5_LESSON_PLAYER__.waitForCaptureReady())
    const preparedThreeFrame = await page.evaluate(() => {
      const player = (window as any).__H5_LESSON_PLAYER__
      const source = [...document.querySelectorAll<HTMLElement>(
        '.lesson-runtime-mount',
      )]
        .map((mount) => mount.shadowRoot?.querySelector<HTMLCanvasElement>('canvas'))
        .find((canvas): canvas is HTMLCanvasElement => Boolean(canvas))
      if (!source) return null
      const snapshot = player.getPreparedCanvasSnapshot(source) as
        | HTMLCanvasElement
        | undefined
      if (!snapshot) return null
      return {
        sameCanvas: snapshot === source,
        width: snapshot.width,
        height: snapshot.height,
        png: snapshot.toDataURL('image/png'),
      }
    })
    expect(preparedThreeFrame).not.toBeNull()
    expect(preparedThreeFrame?.sameCanvas).toBe(false)
    expect(preparedThreeFrame?.width ?? 0).toBeGreaterThanOrEqual(1156)
    expect(preparedThreeFrame?.height ?? 0).toBeGreaterThanOrEqual(432)
    const preparedThreeStats = await sharp(Buffer.from(
      preparedThreeFrame!.png.split(',')[1] ?? '',
      'base64',
    )).stats()
    expect(preparedThreeStats.channels.some(({ stdev }) => stdev > 12)).toBe(true)
    const threeScreenshot = await threeCanvas.screenshot({
      path: join(visualOutputDirectory, 'render-host-three-runtime.png'),
    })
    const threeStats = await sharp(threeScreenshot).stats()
    expect(threeStats.channels.some(({ stdev }) => stdev > 12)).toBe(true)

    await page.setViewportSize({ width: 1024, height: 768 })
    await expect(threeCanvas).toBeVisible()
    const resizedThreeBounds = await threeCanvas.boundingBox()
    expect(resizedThreeBounds?.width ?? 0).toBeGreaterThan(500)
    await page.setViewportSize({ width: 1440, height: 900 })

    await goToScene(page, 3)
    const table = page.locator('[data-component-instance-id="table_component_instance"]')
    await expect(table.locator('h2')).toHaveText('课件渲染路径选型表')
    await table.locator('tbody tr').first().click()
    await expect(table.locator('output')).toContainText('已选中：原生节点')
    await table.getByRole('button', { name: '按适用度排序' }).click()
    await expect(table.locator('output')).toHaveText('已按适用度从高到低排序')
    await table.screenshot({
      path: join(visualOutputDirectory, 'render-host-v4-dom-table.png'),
    })

    await goToScene(page, 4)
    expect(await phaserTexts(page)).toContain('V3 OK')
    await clickLogicalPoint(page, 640, 380)
    await expect.poll(async () => (await phaserTexts(page)).some((text) =>
      text.includes('第 1 次交互'),
    )).toBe(true)
    await page.waitForTimeout(50)
    const stableRafCount = await page.evaluate(() =>
      (window as any).__renderHostActiveRafCount(),
    )

    const stress = await page.evaluate(async () => {
      const player = (window as any).__H5_LESSON_PLAYER__
      let switches = 0
      let replays = 0
      for (let round = 0; round < 25; round += 1) {
        for (const index of [1, 2, 3, 4]) {
          if (!player.goToScene(index)) throw new Error(`stress scene ${index} failed`)
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
          switches += 1
        }
        if (!player.replayScene()) throw new Error(`stress replay ${round} failed`)
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
        replays += 1
      }
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return {
        index: player.getCurrentSceneIndex(),
        rafCount: (window as any).__renderHostActiveRafCount(),
        runtimeMounts: document.querySelectorAll('.lesson-runtime-mount').length,
        componentMounts: document.querySelectorAll('.lesson-component-mount').length,
        runtimeCanvases: document.querySelectorAll('.lesson-runtime-mount canvas').length,
        switches,
        replays,
      }
    })
    expect(stress).toEqual(expect.objectContaining({
      index: 4,
      runtimeMounts: 0,
      componentMounts: 0,
      runtimeCanvases: 0,
      switches: 100,
      replays: 25,
    }))
    expect(stress.rafCount).toBeLessThanOrEqual(stableRafCount + 2)

    await page.screenshot({
      path: join(visualOutputDirectory, 'render-host-benchmark-final.png'),
      fullPage: true,
    })
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
    expect(externalRequests).toEqual([])
  } finally {
    await browser.close()
  }
})
