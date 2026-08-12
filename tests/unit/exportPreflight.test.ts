import { describe, expect, it, vi } from 'vitest'
import { collectExportPreflight } from '@/renderer/export/exportPreflight'
import {
  createImageNode,
  createProject,
  createTextNode,
} from '@/renderer/project/createProject'

const emptyResources = { assetFiles: {}, components: {} }

describe('export preflight', () => {
  it('aggregates unused assets without changing publishing semantics', () => {
    const project = createProject({ includeDefaultController: false })
    project.assets.first = {
      id: 'first', filename: 'first.png', mimeType: 'image/png',
      kind: 'image', path: 'assets/first.png', byteLength: 20,
    }
    project.assets.second = {
      id: 'second', filename: 'second.png', mimeType: 'image/png',
      kind: 'image', path: 'assets/second.png', byteLength: 30,
    }

    const report = collectExportPreflight(project, 'single-html', {
      assetFiles: {
        first: new Uint8Array(20),
        second: new Uint8Array(30),
      },
      components: {},
    })
    expect(report.items.filter(({ code }) => code === 'asset-unused-summary'))
      .toEqual([expect.objectContaining({
        severity: 'info',
        message: expect.stringContaining('2 个未引用素材，共 50 字节'),
      })])
    expect(report.items.some(({ code }) => code === 'project-health:asset-unused'))
      .toBe(false)
  })

  it('reports missing embedded asset bytes as a blocking error', () => {
    const project = createProject({ includeDefaultController: false })
    project.assets.hero = {
      id: 'hero',
      filename: 'hero.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/hero.png',
      byteLength: 100,
      width: 100,
      height: 100,
    }

    const report = collectExportPreflight(
      project,
      'single-html',
      emptyResources,
      new Date('2026-08-10T00:00:00.000Z'),
    )

    expect(report.items).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'asset-bytes-missing',
    }))
    expect(report.summary.canExport).toBe(false)
    expect(report.generatedAt).toBe('2026-08-10T00:00:00.000Z')
  })

  it('checks stable-state geometry, small text, and actual clipping', () => {
    const context = {
      font: '',
      measureText: (value: string) => ({ width: Array.from(value).length * 10 }),
    } as unknown as CanvasRenderingContext2D
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context)
    const project = createProject({ includeDefaultController: false })
    const outside = createTextNode({ x: 1400, y: 20, width: 200, height: 80 })
    outside.text = '画布外文字'
    const overflow = createTextNode({ x: 20, y: 20, width: 120, height: 28 })
    overflow.text = '这是一段一定会在很窄很矮的文本框中产生多行溢出的测试文字'
    overflow.style.fontSize = 18
    overflow.style.overflow = 'fixed'
    project.scenes[0]!.nodes.push(outside, overflow)

    const report = collectExportPreflight(project, 'pdf', emptyResources)
    const codes = report.items.map(({ code }) => code)

    expect(codes).toContain('node-fully-outside-canvas')
    expect(codes).toContain('text-font-size-below-recommended')
    expect(codes).toContain('text-content-overflow')
    expect(report.summary.canExport).toBe(false)
    getContext.mockRestore()
  })

  it('blocks explicit external network dependencies in enabled runtimes', () => {
    const project = createProject({ includeDefaultController: false })
    project.globalRuntime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareRuntime.define({ create(){ fetch("https://example.com/data") } })',
      content: { values: {} },
      assets: {},
    }

    const report = collectExportPreflight(project, 'web-package', emptyResources)

    expect(report.items).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'runtime-external-network',
    }))
  })

  it('blocks relative and dynamically resolved network API calls', () => {
    const project = createProject({ includeDefaultController: false })
    project.globalRuntime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareRuntime.define({ create(){ return fetch("/api/lesson") } })',
      content: { values: {} },
      assets: {},
    }

    const report = collectExportPreflight(project, 'web-package', emptyResources)
    expect(report.items).toContainEqual(expect.objectContaining({
      severity: 'error',
      code: 'runtime-external-network',
    }))
  })

  it('warns but does not block a URL that is only displayed as attribution text', () => {
    const project = createProject({ includeDefaultController: false })
    project.globalRuntime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: [
        'CoursewareRuntime.define({ create(){',
        'const attribution = "来源：https://example.com/reference";',
        'return { attribution, destroy(){} };',
        '} })',
      ].join('\n'),
      content: { values: {} },
      assets: {},
    }

    const report = collectExportPreflight(project, 'single-html', emptyResources)
    expect(report.items).toContainEqual(expect.objectContaining({
      severity: 'warning',
      code: 'runtime-external-url-reference',
    }))
    expect(report.items).not.toContainEqual(expect.objectContaining({
      code: 'runtime-external-network',
    }))
    expect(report.summary.canExport).toBe(true)
  })

  it('does not mistake SVG namespaces or authored double-slash text for network access', () => {
    const project = createProject({ includeDefaultController: false })
    project.globalRuntime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: [
        'CoursewareRuntime.define({ create(){',
        "const pause = '//';",
        "document.createElementNS('http://www.w3.org/2000/svg', 'svg');",
        'return { destroy(){} }',
        '} })',
      ].join('\n'),
      content: { values: {} },
      assets: {},
    }

    const report = collectExportPreflight(project, 'single-html', emptyResources)

    expect(report.items).not.toContainEqual(expect.objectContaining({
      code: 'runtime-external-network',
    }))
    expect(report.summary.canExport).toBe(true)
  })

  it('explains static-format behavior without blocking a valid project', () => {
    const project = createProject({ includeDefaultController: false })
    project.scenes[0]!.interactions.push({
      id: 'enter',
      name: '进入',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: 'step',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'scene.replay' },
      }],
    })

    const report = collectExportPreflight(project, 'pptx', emptyResources)

    expect(report.items).toContainEqual(expect.objectContaining({
      severity: 'info',
      code: 'static-export-interactions-omitted',
    }))
  })

  it('keeps contrast, density, safe-area, and controller checks explicitly heuristic', () => {
    const context = {
      font: '',
      measureText: (value: string) => ({ width: Array.from(value).length * 9 }),
    } as unknown as CanvasRenderingContext2D
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context)
    const project = createProject()
    const scene = project.scenes[0]!
    const controller = project.globalLayer[0]!.node
    if (controller.type !== 'teacher-controller') throw new Error('fixture')
    const lowContrast = createTextNode({
      id: 'low-contrast',
      x: controller.x,
      y: controller.y,
      width: controller.width,
      height: controller.height,
      text: '点击继续',
      style: { color: '#ffffff', fontSize: 30 },
    })
    const image = createImageNode({ assetId: 'hero', id: 'hero-node' })
    image.safeAreas = [{
      id: 'subject',
      label: '人物主体',
      x: 0.1,
      y: 0.1,
      width: 0.8,
      height: 0.8,
    }]
    scene.nodes.push(
      lowContrast,
      image,
      ...Array.from({ length: 28 }, (_, index) => createTextNode({
        id: `dense-${index}`,
        x: (index % 7) * 170,
        y: Math.floor(index / 7) * 145,
        width: 240,
        height: 180,
        text: '密集信息'.repeat(12),
      })),
    )
    scene.interactions.push({
      id: 'click-target',
      enabled: true,
      trigger: { type: 'node.click', nodeId: lowContrast.id },
      conditions: [],
      actions: [{
        id: 'replay',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'scene.replay' },
      }],
    })
    project.assets.hero = {
      id: 'hero',
      filename: 'hero.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/hero.png',
      byteLength: 4,
    }

    const report = collectExportPreflight(project, 'single-html', {
      assetFiles: { hero: new Uint8Array([1, 2, 3, 4]) },
      components: {},
    })
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'text-low-contrast', severity: 'warning' }),
      expect.objectContaining({ code: 'image-safe-area-review', severity: 'info' }),
      expect.objectContaining({ code: 'controller-interactive-obstruction', severity: 'warning' }),
      expect.objectContaining({ code: 'visual-density-high', severity: 'warning' }),
    ]))
    getContext.mockRestore()
  })
})
