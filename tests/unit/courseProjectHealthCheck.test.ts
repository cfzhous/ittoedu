import { describe, expect, it } from 'vitest'
import type { ComponentManifest } from '@/shared/componentTypes'
import { createCourseProject } from '@/renderer/course/courseStudioModel'
import { checkCourseProjectHealth } from '@/renderer/course/courseProjectHealthCheck'
import { parseComponentPackageFiles } from '@/renderer/components/importComponentPackage'
import {
  createCourseProjectArchiveAsync,
  type CourseProjectArchiveData,
} from '@/renderer/project/courseProjectArchive'

const NOW = '2026-08-15T00:00:00.000Z'

function archiveFixture(): CourseProjectArchiveData {
  return {
    project: createCourseProject({ id: 'health-check', title: '工程检查', now: NOW }),
    assetFiles: {},
    componentFiles: {},
  }
}

function componentFixture() {
  const manifest: ComponentManifest = {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: 'health.component',
    name: '检查组件',
    version: '4.0.0',
    description: '检查交付依赖',
    entry: 'runtime.js',
    defaultSize: { width: 320, height: 180 },
    minSize: { width: 160, height: 90 },
    preserveAspectRatio: true,
    assets: {},
    defaultProps: {},
    supportedScopes: ['scene'],
    renderMode: 'dom',
  }
  const files = {
    'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
    'runtime.js': new TextEncoder().encode(
      `window.CoursewareComponent.define({id:'health.component',runtimeApiVersion:4,create(){return{destroy(){}}}})`,
    ),
  }
  return parseComponentPackageFiles(files)
}

function visibleCopy(result: Awaited<ReturnType<typeof checkCourseProjectHealth>>): string {
  return [
    result.description,
    result.footer,
    ...result.diagnostics.map((diagnostic) => diagnostic.message),
  ].join('\n')
}

describe('course project health check', () => {
  it('reports zero issues only after the real archive and delivery checks pass', async () => {
    const result = await checkCourseProjectHealth(archiveFixture(), {})

    expect(result).toMatchObject({
      summary: { error: 0, warning: 0, info: 0, canExport: true },
      diagnostics: [],
    })
    expect(result.cause).toBeUndefined()
  })

  it('blocks delivery when a registered resource has no stored bytes', async () => {
    const archive = archiveFixture()
    archive.project.assets['missing-image'] = {
      id: 'missing-image',
      filename: 'missing.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/missing.png',
      byteLength: 3,
      width: 1,
      height: 1,
    }

    const result = await checkCourseProjectHealth(archive, {})

    expect(result.summary).toEqual({ error: 1, warning: 0, info: 0, canExport: false })
    expect(result.diagnostics).toHaveLength(1)
    expect(result.cause).toBeDefined()
    expect(Object.keys(result)).not.toContain('cause')
  })

  it('blocks delivery when project content contains an invalid reference', async () => {
    const archive = archiveFixture()
    archive.project.startLocationId = 'missing-location'

    const result = await checkCourseProjectHealth(archive, {})

    expect(result.summary.canExport).toBe(false)
    expect(result.summary.error).toBeGreaterThan(0)
    expect(result.cause).toBeDefined()
  })

  it('runs the delivery producer after archive sidecars pass', async () => {
    const archive = archiveFixture()
    const component = componentFixture()
    archive.project.componentPackages[component.metadata.packageId] = component.metadata
    archive.componentFiles[component.key] = component.files
    const surface = archive.project.surfaces[0]
    if (!surface || surface.type !== 'slide') throw new Error('expected Slide fixture')
    surface.scenes[0]!.layerItems.push({
      layerItemId: 'health-component-layer',
      label: '课堂互动',
      frame: { mode: 'absolute', x: 480, y: 240, width: 320, height: 180 },
      order: 2,
      visible: true,
      locked: false,
      rotation: 0,
      opacity: 1,
      hitPolicy: 'auto',
      playbackInitialVisibility: 'inherit',
      kind: 'component',
      component: { packageId: component.manifest.id, version: component.manifest.version },
      props: {},
    })

    await expect(createCourseProjectArchiveAsync(archive)).resolves.not.toHaveLength(0)
    const result = await checkCourseProjectHealth(archive, {})

    expect(result.summary.canExport).toBe(false)
    expect(result.cause).toBeInstanceOf(Error)
  })

  it('never puts protocol, identifier or filesystem details in teacher-facing copy', async () => {
    const invalid = archiveFixture()
    invalid.project.startLocationId = 'private-internal-reference'
    const results = [
      await checkCourseProjectHealth(archiveFixture(), {}),
      await checkCourseProjectHealth(invalid, {}),
    ]

    for (const result of results) {
      const copy = visibleCopy(result)
      expect(copy).not.toMatch(/\b(?:V8|V9|Published|Runtime|Component|API|ID)\b/iu)
      expect(copy).not.toMatch(/[A-Za-z]:[\\/]/u)
      expect(copy).not.toContain('private-internal-reference')
      expect(copy).not.toContain('/project')
    }
  })
})
