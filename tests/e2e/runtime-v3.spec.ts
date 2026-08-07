import { chromium, expect, test } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ExportPayload } from '../../src/shared/componentTypes'
import type { SceneNode } from '../../src/shared/projectTypes'
import { buildStandaloneHtml } from '../../src/renderer/export/buildStandaloneHtml'
import { buildWebPackageFiles } from '../../src/renderer/export/buildWebPackage'
import { createProjectV8Fields } from '../helpers/projectV8'

const projectRoot = resolve(__dirname, '..', '..')
const outputDirectory = join(tmpdir(), 'phaser-courseware-runtime-v3-e2e')
const htmlPath = join(outputDirectory, 'runtime-v3.html')
const visualOutputDirectory = join(projectRoot, 'output', 'playwright')

function baseNode(id: string, name: string, x: number, y: number, width: number, height: number) {
  return {
    id,
    name,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    playbackInitialVisibility: 'inherit' as const,
  }
}

const hotspot: SceneNode = {
  ...baseNode('scene-hotspot', '场景跳转热点', 100, 100, 240, 120),
  type: 'shape',
  shapeType: 'rounded-rectangle',
  style: {
    fillColor: '#2563eb',
    fillOpacity: 1,
    borderColor: '#bfdbfe',
    borderOpacity: 1,
    borderWidth: 3,
    lineStyle: 'solid',
    cornerRadius: 24,
    startArrow: 'none',
    endArrow: 'none',
  },
}

const globalRuntimeSource = `
CoursewareRuntime.define({
  runtimeApiVersion: 1,
  create(ctx) {
    window.__v3GlobalRuntimeCreateCount = (window.__v3GlobalRuntimeCreateCount || 0) + 1;
    const visit = (ctx.courseState.get('globalVisit') || 0) + 1;
    ctx.courseState.set('globalVisit', visit);
    window.__v3CourseVisit = visit;
    const button = document.createElement('button');
    button.dataset.testid = 'global-next';
    button.textContent = ctx.content.get('nextLabel');
    Object.assign(button.style, {
      position: 'absolute', right: '24px', top: '24px', zIndex: '10',
      padding: '12px 18px', borderRadius: '10px', pointerEvents: 'auto'
    });
    const current = document.createElement('output');
    current.dataset.testid = 'global-current-scene';
    Object.assign(current.style, {
      position: 'absolute', left: '24px', top: '24px', color: '#fff'
    });
    const off = ctx.events.on('scene:enter', ({ sceneId }) => {
      current.textContent = sceneId;
    });
    const offComponent = ctx.events.on('component:event', (event) => {
      window.__v3LastComponentEvent = event.eventName;
    });
    const offGuard = ctx.navigation.guard(() => {
      window.__v3NavigationGuardCalls = (window.__v3NavigationGuardCalls || 0) + 1;
      return true;
    });
    const next = () => ctx.actions.nextScene();
    button.addEventListener('click', next);
    ctx.domRoot.append(button, current);
    return {
      destroy() {
        off();
        offComponent();
        offGuard();
        button.removeEventListener('click', next);
        window.__v3GlobalRuntimeDestroyCount = (window.__v3GlobalRuntimeDestroyCount || 0) + 1;
      }
    };
  }
});
`

const sceneRuntimeSource = `
CoursewareRuntime.define({
  runtimeApiVersion: 1,
  create(ctx) {
    window.__v3SceneRuntimeCreateCount = (window.__v3SceneRuntimeCreateCount || 0) + 1;
    const handle = ctx.nodes.get('hotspot');
    if (!handle) throw new Error('scene-hotspot missing');
    handle.root.setInteractive();
    const next = () => ctx.actions.nextScene();
    handle.root.on('pointerup', next);
    return {
      destroy() {
        handle.root.off('pointerup', next);
        window.__v3SceneRuntimeDestroyCount = (window.__v3SceneRuntimeDestroyCount || 0) + 1;
      }
    };
  }
});
`

const globalComponentRuntime = `
CoursewareComponent.define({
  id: 'global-nav',
  runtimeApiVersion: 3,
  create(ctx) {
    window.__v3GlobalComponentCreateCount = (window.__v3GlobalComponentCreateCount || 0) + 1;
    window.__v3GlobalComponentScope = ctx.scope;
    const boot = (ctx.courseState.get('componentBoot') || 0) + 1;
    ctx.courseState.set('componentBoot', boot);
    window.__v3ComponentBoot = boot;
    let clicks = 0;
    const background = ctx.scene.add.rectangle(ctx.width / 2, ctx.height / 2, ctx.width, ctx.height, 0x0f766e, 1);
    background.setInteractive();
    const label = ctx.scene.add.text(18, 18, ctx.props.content.label, { color: '#ffffff', fontSize: '24px' });
    ctx.root.add([background, label]);
    const previous = () => {
      clicks += 1;
      window.__v3GlobalComponentClicks = clicks;
      ctx.emit('navigate:previous', { clicks });
      ctx.actions.previousScene();
    };
    background.on('pointerup', previous);
    const offScene = ctx.events.on('scene:enter', ({ sceneId }) => {
      window.__v3GlobalComponentScene = sceneId;
    });
    return {
      destroy() {
        offScene();
        background.off('pointerup', previous);
        window.__v3GlobalComponentDestroyCount = (window.__v3GlobalComponentDestroyCount || 0) + 1;
      }
    };
  }
});
`

function createPayload(): ExportPayload {
  return {
    project: {
      schemaVersion: 5,
      id: 'runtime-v3-e2e',
      title: 'V3 全局互动验证',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      canvas: { width: 1280, height: 720 },
      assets: {},
      componentPackages: {
        'global-nav@1.0.0': {
          packageId: 'global-nav',
          version: '1.0.0',
          name: '全局导航',
          manifestPath: 'components/global-nav@1.0.0/manifest.json',
          runtimePath: 'components/global-nav@1.0.0/runtime.js',
        },
      },
      globalRuntime: {
        runtimeApiVersion: 1,
        enabled: true,
        renderMode: 'dom',
        source: globalRuntimeSource,
        content: {
          values: { nextLabel: '全局下一页' },
          metadata: { nextLabel: { label: '全局下一页按钮' } },
        },
        assets: {},
      },
      globalLayer: [{
        node: {
          ...baseNode('global-nav-instance', '全局上一页', 950, 600, 250, 80),
          type: 'external-component',
          component: { packageId: 'global-nav', version: '1.0.0' },
          props: { content: { label: '全局上一页' } },
        },
        layer: 'overlay',
        visibility: { mode: 'all', sceneIds: [] },
      }],
      scenes: [
        {
          id: 'scene-one',
          name: '第一页',
          backgroundColor: '#111827',
          nodes: [hotspot],
          interactions: [],
          runtime: {
            runtimeApiVersion: 1,
            enabled: true,
            renderMode: 'phaser',
            source: sceneRuntimeSource,
            content: { values: {} },
            assets: {},
            nodeBindings: { hotspot: 'scene-hotspot' },
          },
        },
        {
          id: 'scene-two',
          name: '第二页',
          backgroundColor: '#312e81',
          nodes: [],
          interactions: [],
        },
      ],
      ...createProjectV8Fields('none'),
    },
    assets: {},
    components: {
      'global-nav@1.0.0': {
        manifest: {
          schemaVersion: 3,
          runtimeApiVersion: 3,
          supportedScopes: ['global'],
          id: 'global-nav',
          name: '全局导航',
          version: '1.0.0',
          entry: 'runtime.js',
          defaultSize: { width: 250, height: 80 },
          minSize: { width: 120, height: 50 },
          preserveAspectRatio: false,
          assets: {},
          defaultProps: { content: { label: '全局上一页' } },
        },
        runtimeSource: globalComponentRuntime,
        assets: {},
      },
    },
  }
}

const assetFetchRuntimeSource = `
CoursewareRuntime.define({
  runtimeApiVersion: 2,
  create(ctx) {
    const output = document.createElement('output');
    output.dataset.testid = 'same-origin-asset';
    ctx.dom.overlay.append(output);
    const load = fetch(ctx.assets.url('probe'))
      .then((response) => {
        if (!response.ok) throw new Error('offline asset failed');
        return response.text();
      })
      .then((text) => { output.textContent = text; });
    ctx.capture.waitUntil(load);
    return { destroy() { output.remove(); } };
  }
});
`

function createAssetFetchPayload(): ExportPayload {
  const payload = createPayload()
  const probeText = 'offline-ok'
  payload.project.assets['same-origin-probe'] = {
    id: 'same-origin-probe',
    filename: 'same-origin-probe.txt',
    mimeType: 'text/plain',
    kind: 'image',
    path: 'assets/same-origin-probe.txt',
    byteLength: probeText.length,
  }
  payload.assets['same-origin-probe'] = {
    mimeType: 'text/plain',
    dataUrl: 'data:text/plain;base64,b2ZmbGluZS1vaw==',
  }
  payload.project.globalRuntime = {
    runtimeApiVersion: 2,
    enabled: true,
    renderMode: 'dom',
    source: assetFetchRuntimeSource,
    content: { values: {} },
    assets: {
      probe: { assetId: 'same-origin-probe' },
    },
  }
  return payload
}

async function clickLogicalPoint(
  page: import('@playwright/test').Page,
  x: number,
  y: number,
) {
  const canvas = page.locator('.lesson-canvas-host canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Player canvas is not visible')
  await page.mouse.click(
    box.x + x / 1280 * box.width,
    box.y + y / 720 * box.height,
  )
}

async function expectCurrentScene(
  page: import('@playwright/test').Page,
  sceneId: string,
): Promise<void> {
  await expect.poll(() => page.evaluate(() => (
    (window as any).__H5_LESSON_PLAYER__?.getCurrentSceneId() ?? null
  ))).toBe(sceneId)
}

test('V3 场景运行时、全局运行时和全局组件跨场景协作', async () => {
  mkdirSync(outputDirectory, { recursive: true })
  const playerBundle = readFileSync(
    join(projectRoot, 'dist-player', 'player.iife.js'),
    'utf8',
  )
  writeFileSync(htmlPath, buildStandaloneHtml(createPayload(), { playerBundle }))

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(pathToFileURL(htmlPath).toString())
    await expectCurrentScene(page, 'scene-one')
    await expect(page.getByTestId('global-current-scene')).toHaveText('scene-one')
    expect(await page.evaluate(() => (window as any).__v3GlobalComponentCreateCount)).toBe(1)
    expect(await page.evaluate(() => (window as any).__v3GlobalComponentScope)).toBe('global')
    expect(await page.evaluate(() => (window as any).__v3GlobalComponentScene)).toBe('scene-one')

    await clickLogicalPoint(page, 220, 160)
    await expectCurrentScene(page, 'scene-two')
    expect(await page.evaluate(() => (window as any).__v3NavigationGuardCalls)).toBeGreaterThan(0)
    await expect(page.getByTestId('global-current-scene')).toHaveText('scene-two')
    expect(await page.evaluate(() => (window as any).__v3GlobalComponentScene)).toBe('scene-two')
    expect(await page.evaluate(() => (window as any).__v3GlobalComponentCreateCount)).toBe(1)
    mkdirSync(visualOutputDirectory, { recursive: true })
    await page.screenshot({
      path: join(visualOutputDirectory, 'runtime-v3-global-interaction.png'),
      fullPage: true,
    })

    await clickLogicalPoint(page, 1075, 640)
    await expectCurrentScene(page, 'scene-one')
    expect(await page.evaluate(() => (window as any).__v3GlobalComponentClicks)).toBe(1)
    expect(await page.evaluate(() => (window as any).__v3LastComponentEvent)).toBe('navigate:previous')
    expect(await page.evaluate(() => (window as any).__v3GlobalComponentCreateCount)).toBe(1)

    await page.getByTestId('global-next').click()
    await expectCurrentScene(page, 'scene-two')

    const stress = await page.evaluate(() => {
      const player = (window as any).__H5_LESSON_PLAYER__
      for (let index = 0; index < 50; index += 1) {
        if (!player.previousScene()) throw new Error('stress previous failed')
        if (!player.nextScene()) throw new Error('stress next failed')
      }
      return {
        globalComponentCreates: (window as any).__v3GlobalComponentCreateCount,
        globalRuntimeCreates: (window as any).__v3GlobalRuntimeCreateCount,
        runtimeMounts: document.querySelectorAll('.lesson-runtime-mount').length,
      }
    })
    await expectCurrentScene(page, 'scene-two')
    expect(stress).toEqual({
      globalComponentCreates: 1,
      globalRuntimeCreates: 1,
      runtimeMounts: 2,
    })

    await page.evaluate(() => (window as any).__H5_LESSON_PLAYER__.restartCourse())
    await expectCurrentScene(page, 'scene-one')
    expect(await page.evaluate(() => (window as any).__v3GlobalComponentCreateCount)).toBe(2)
    expect(await page.evaluate(() => (window as any).__v3GlobalRuntimeCreateCount)).toBe(2)
    expect(await page.evaluate(() => (window as any).__v3CourseVisit)).toBe(1)
    expect(await page.evaluate(() => (window as any).__v3ComponentBoot)).toBe(1)
    expect(pageErrors).toEqual([])
  } finally {
    await browser.close()
  }
})

test('PublishedLesson 单 HTML 允许内联 data/blob 素材加载且不开放网络连接', async () => {
  mkdirSync(outputDirectory, { recursive: true })
  const playerBundle = readFileSync(
    join(projectRoot, 'dist-player', 'player.iife.js'),
    'utf8',
  )
  const standalonePath = join(outputDirectory, 'standalone-asset-fetch.html')
  writeFileSync(
    standalonePath,
    buildStandaloneHtml(createAssetFetchPayload(), { playerBundle }),
  )

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors: string[] = []
  const networkRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) networkRequests.push(request.url())
  })
  try {
    await page.goto(pathToFileURL(standalonePath).toString())
    await expect(page.getByTestId('same-origin-asset')).toHaveText('offline-ok')
    expect(networkRequests).toEqual([])
    expect(pageErrors).toEqual([])
  } finally {
    await browser.close()
  }
})

test('PublishedLesson 网页包可通过 file 协议完整运行且仅有一份发布数据', async () => {
  const playerBundle = readFileSync(
    join(projectRoot, 'dist-player', 'player.iife.js'),
    'utf8',
  )
  const webDirectory = join(outputDirectory, 'web-package')
  const files = buildWebPackageFiles(createPayload(), { playerBundle })
  expect(Object.keys(files).filter((path) => /course.*\.(?:json|js)$/i.test(path)))
    .toEqual(['course-data.js'])
  expect(Object.keys(files).some((path) => path.endsWith('/runtime.js')))
    .toBe(false)
  for (const [archivePath, bytes] of Object.entries(files)) {
    const target = join(webDirectory, ...archivePath.split('/'))
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors: string[] = []
  const externalRequests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (/^https?:/i.test(request.url())) externalRequests.push(request.url())
  })
  try {
    await page.goto(pathToFileURL(join(webDirectory, 'index.html')).toString())
    await expectCurrentScene(page, 'scene-one')
    await expect(page.getByTestId('global-current-scene')).toHaveText('scene-one')
    await clickLogicalPoint(page, 220, 160)
    await expectCurrentScene(page, 'scene-two')
    await expect(page.getByTestId('global-current-scene')).toHaveText('scene-two')
    expect(pageErrors).toEqual([])
    expect(externalRequests).toEqual([])
  } finally {
    await browser.close()
  }
})

test('PublishedLesson 网页包允许同源运行素材加载且不开放跨源连接', async () => {
  const playerBundle = readFileSync(
    join(projectRoot, 'dist-player', 'player.iife.js'),
    'utf8',
  )
  const files = buildWebPackageFiles(createAssetFetchPayload(), {
    playerBundle,
  })
  const origin = 'http://courseware.test'

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors: string[] = []
  const requests: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => requests.push(request.url()))
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url())
    const archivePath = decodeURIComponent(url.pathname.replace(/^\/+/, '')) ||
      'index.html'
    const bytes = files[archivePath]
    if (!bytes) {
      await route.fulfill({ status: 404, body: 'not found' })
      return
    }
    const contentType = archivePath.endsWith('.html')
      ? 'text/html'
      : archivePath.endsWith('.css')
        ? 'text/css'
        : archivePath.endsWith('.js')
          ? 'text/javascript'
          : 'text/plain'
    await route.fulfill({
      status: 200,
      contentType,
      body: Buffer.from(bytes),
    })
  })
  try {
    await page.goto(`${origin}/index.html`)
    await expect(page.getByTestId('same-origin-asset')).toHaveText('offline-ok')
    expect(requests.length).toBeGreaterThan(0)
    expect(requests.every((requestUrl) => requestUrl.startsWith(`${origin}/`)))
      .toBe(true)
    expect(pageErrors).toEqual([])
  } finally {
    await browser.close()
  }
})
