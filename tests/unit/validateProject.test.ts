import { strToU8, unzipSync, zipSync } from 'fflate'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createExternalComponentNode,
  createImageNode,
  createProject,
  createTextNode,
} from '@/renderer/project/createProject'
import { parseComponentPackageFiles } from '@/renderer/components/importComponentPackage'
import {
  createProjectArchive,
  type ProjectArchiveData,
} from '@/renderer/project/projectArchive'
import {
  projectValidationExitCode,
  serializeProjectValidationReport,
  validateProjectArchiveBytes,
} from '@/renderer/project/validateProjectArchive'
import { runValidateProjectCli } from '../../scripts/validate-project'
import { createCourseProject } from '@/renderer/course/courseStudioModel'
import { createCourseProjectArchive } from '@/renderer/project/courseProjectArchive'

function emptyArchiveData(): ProjectArchiveData {
  return {
    project: createProject({ includeDefaultController: false, controls: 'none' }),
    assetFiles: {},
    componentFiles: {},
  }
}

function componentFiles(): Record<string, Uint8Array> {
  return {
    'manifest.json': strToU8(JSON.stringify({
      schemaVersion: 4,
      runtimeApiVersion: 4,
      id: 'com.example.validator',
      name: '校验组件',
      version: '1.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 320, height: 180 },
      minSize: { width: 160, height: 90 },
      preserveAspectRatio: false,
      assets: {},
      defaultProps: {},
      supportedScopes: ['scene'],
      renderMode: 'dom',
    })),
    'runtime.js': strToU8(
      "window.CoursewareComponent.define({id:'com.example.validator',runtimeApiVersion:4,create(){return{destroy(){}}}})",
    ),
  }
}

function completeContextArchive(): {
  bytes: Uint8Array
  sceneId: string
  stateId: string
  imageNodeId: string
} {
  const source = emptyArchiveData()
  const scene = source.project.scenes[0]!
  const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
  source.project.assets.hero = {
    id: 'hero',
    filename: 'hero.png',
    mimeType: 'image/png',
    kind: 'image',
    path: 'assets/hero.png',
    byteLength: imageBytes.byteLength,
    width: 320,
    height: 180,
  }
  source.assetFiles.hero = imageBytes
  const image = createImageNode({
    id: 'state-image',
    assetId: 'hero',
    x: 120,
    y: 120,
    width: 320,
    height: 180,
  })
  scene.nodes.push(image)

  const component = parseComponentPackageFiles(componentFiles())
  source.project.componentPackages[component.key] = component.metadata
  source.componentFiles[component.key] = component.files
  scene.nodes.push(createExternalComponentNode({
    id: 'validator-component',
    name: component.manifest.name,
    component: {
      packageId: component.manifest.id,
      version: component.manifest.version,
    },
    props: component.manifest.defaultProps,
  }))
  scene.interactions.push({
    id: 'image-replay',
    enabled: true,
    trigger: { type: 'node.click', nodeId: image.id },
    conditions: [],
    actions: [{
      id: 'replay',
      start: 'after-previous',
      delayMs: 0,
      action: { type: 'scene.replay' },
    }],
  })
  const state = scene.presentation!.states[0]!
  state.nodeOverrides[image.id] = { x: 1400 }

  return {
    bytes: createProjectArchive(source),
    sceneId: scene.id,
    stateId: state.id,
    imageNodeId: image.id,
  }
}

function publicValidatorCommand(
  lessonPath: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const npmCli = process.env.npm_execpath ?? path.resolve(
    path.dirname(process.execPath),
    'node_modules',
    'npm',
    'bin',
    'npm-cli.js',
  )
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [npmCli, 'run', '--silent', 'validate:project', '--', lessonPath],
      { cwd: process.cwd(), windowsHide: true },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error)
          return
        }
        resolve({
          exitCode: typeof error?.code === 'number' ? error.code : 0,
          stdout: String(stdout),
          stderr: String(stderr),
        })
      },
    )
  })
}

describe('headless Project V8 validation', () => {
  it('uses the public validator for current V9 archives before the explicit V8 compatibility path', async () => {
    const bytes = createCourseProjectArchive({
      project: createCourseProject({ id: 'v9-validator', title: 'V9 校验课例', now: '2026-08-14T00:00:00.000Z' }),
      assetFiles: {},
      componentFiles: {},
    })
    const stdout: string[] = []
    const exitCode = await runValidateProjectCli(['v9.h5lesson'], {
      stdout: (value) => stdout.push(value),
      stderr: () => undefined,
      read: async () => bytes,
    })
    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      reportVersion: 2,
      status: 'valid',
      schema: { schemaVersion: 9 },
      project: { id: 'v9-validator', surfaceCount: 1, surfaces: { slide: 1 } },
    })
  })
  it('returns a deterministic four-surface report for a valid archive', () => {
    const source = emptyArchiveData()
    const bytes = createProjectArchive(source, {
      mtime: '2026-08-12T00:00:00.000Z',
    })

    const report = validateProjectArchiveBytes(bytes, 'lesson.h5lesson')

    expect(report).toMatchObject({
      reportVersion: 1,
      status: 'valid',
      input: { filename: 'lesson.h5lesson' },
      schema: { valid: true, schemaVersion: 8, issues: [] },
      project: {
        id: source.project.id,
        sceneCount: 1,
        assetCount: 0,
        componentPackageCount: 0,
      },
      measurement: { mode: 'deterministic-fallback' },
      fatal: null,
    })
    expect(Object.keys(report.exportPreflight ?? {})).toEqual([
      'single-html',
      'web-package',
      'pdf',
      'pptx',
    ])
    expect(projectValidationExitCode(report)).toBe(0)
    expect(serializeProjectValidationReport(report)).toBe(
      serializeProjectValidationReport(
        validateProjectArchiveBytes(bytes, 'lesson.h5lesson'),
      ),
    )
  })

  it('returns exit 1 with location-rich export errors for a readable project', () => {
    const source = emptyArchiveData()
    source.project.globalRuntime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareRuntime.define({create(){return fetch("/api/data")}})',
      content: { values: {} },
      assets: {},
    }
    const outside = createTextNode({
      id: 'outside',
      x: 1400,
      y: 20,
      width: 160,
      height: 80,
    })
    source.project.scenes[0]!.nodes.push(outside)

    const report = validateProjectArchiveBytes(
      createProjectArchive(source),
      'invalid.h5lesson',
    )

    expect(report.status).toBe('invalid')
    expect(projectValidationExitCode(report)).toBe(1)
    expect(report.exportPreflight?.['single-html'].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'runtime-external-network',
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'node-fully-outside-canvas',
          sceneId: source.project.scenes[0]!.id,
          nodeId: 'outside',
        }),
      ]),
    )
  })

  it('loads real asset and component bytes and preserves state-specific locations', () => {
    const fixture = completeContextArchive()

    const report = validateProjectArchiveBytes(
      fixture.bytes,
      'complete-context.h5lesson',
    )

    expect(report).toMatchObject({
      status: 'invalid',
      project: { assetCount: 1, componentPackageCount: 1 },
      fatal: null,
    })
    expect(projectValidationExitCode(report)).toBe(1)
    const items = report.exportPreflight?.['single-html'].items ?? []
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'node-fully-outside-canvas',
        sceneId: fixture.sceneId,
        stateId: fixture.stateId,
        nodeId: fixture.imageNodeId,
      }),
    ]))
    expect(items.some((item) => (
      item.code === 'asset-bytes-missing' ||
      item.code === 'component-bytes-missing' ||
      item.code === 'component-hash-mismatch'
    ))).toBe(false)
  })

  it('returns exit 2 for an old schema and for missing declared bytes', () => {
    const source = emptyArchiveData()
    const oldProject = { ...source.project, schemaVersion: 7 }
    const oldReport = validateProjectArchiveBytes(zipSync({
      'project.json': strToU8(JSON.stringify(oldProject)),
    }), 'old.h5lesson')
    expect(oldReport).toMatchObject({
      status: 'unreadable',
      schema: { valid: false, schemaVersion: 7, issues: [] },
      fatal: { code: 'unsupported-project-version' },
    })
    expect(projectValidationExitCode(oldReport)).toBe(2)

    source.project.assets.hero = {
      id: 'hero',
      filename: 'hero.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/hero.png',
      byteLength: 4,
      width: 10,
      height: 10,
    }
    source.assetFiles.hero = new Uint8Array([1, 2, 3, 4])
    const files = unzipSync(createProjectArchive(source))
    delete files['assets/hero.png']
    const missingReport = validateProjectArchiveBytes(
      zipSync(files),
      'missing-asset.h5lesson',
    )
    expect(missingReport).toMatchObject({
      status: 'unreadable',
      fatal: {
        code: 'archive-invalid',
        message: expect.stringContaining('hero.png'),
      },
    })

    const missingComponent = emptyArchiveData()
    const packageKey = 'com.example.missing@1.0.0'
    missingComponent.project.componentPackages[packageKey] = {
      packageId: 'com.example.missing',
      version: '1.0.0',
      name: '缺失组件',
      manifestPath: `components/${packageKey}/manifest.json`,
      runtimePath: `components/${packageKey}/runtime.js`,
      contentSha256: '0'.repeat(64),
    }
    const componentReport = validateProjectArchiveBytes(zipSync({
      'project.json': strToU8(JSON.stringify(missingComponent.project)),
    }), 'missing-component.h5lesson')
    expect(componentReport).toMatchObject({
      status: 'unreadable',
      fatal: {
        code: 'archive-invalid',
        message: expect.stringContaining(packageKey),
      },
    })
  })

  it('reports structured schema paths for an invalid Project V8 document', () => {
    const files = unzipSync(createProjectArchive(emptyArchiveData()))
    const project = JSON.parse(
      new TextDecoder().decode(files['project.json']),
    ) as Record<string, unknown>
    delete project.playback
    files['project.json'] = strToU8(JSON.stringify(project))

    const report = validateProjectArchiveBytes(
      zipSync(files),
      'schema-invalid.h5lesson',
    )

    expect(report).toMatchObject({
      status: 'unreadable',
      schema: {
        valid: false,
        schemaVersion: 8,
        issues: [
          {
            path: ['playback'],
            code: expect.any(String),
            message: expect.any(String),
          },
        ],
      },
      fatal: { code: 'schema-invalid' },
    })
    expect(projectValidationExitCode(report)).toBe(2)
  })

  it('does not claim a Project version when the declaration is malformed', () => {
    const source = emptyArchiveData()
    const malformed = { ...source.project, schemaVersion: '8' }
    const report = validateProjectArchiveBytes(zipSync({
      'project.json': strToU8(JSON.stringify(malformed)),
    }), 'malformed-version.h5lesson')

    expect(report).toMatchObject({
      status: 'unreadable',
      schema: {
        valid: false,
        schemaVersion: null,
        issues: [expect.objectContaining({ path: ['schemaVersion'] })],
      },
      fatal: { code: 'schema-invalid' },
    })
  })

  it('counts shared Project Health findings once across four target reports', () => {
    const source = emptyArchiveData()
    source.project.globalRuntime = {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'dom',
      source: 'CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})',
      content: { values: {} },
      assets: {},
    }
    const report = validateProjectArchiveBytes(
      createProjectArchive(source),
      'health-summary.h5lesson',
    )
    const targetItems = Object.values(report.exportPreflight ?? {})
      .flatMap((preflight) => preflight.items)
    expect(targetItems.some((item) => item.code.startsWith('project-health:')))
      .toBe(true)
    const targetSpecific = targetItems.filter(
      (item) => !item.code.startsWith('project-health:'),
    )
    expect(report.summary.total).toBe(
      (report.projectHealth?.summary.total ?? 0) + targetSpecific.length,
    )
  })

  it('keeps CLI stdout machine-readable and uses stable exit codes', async () => {
    const bytes = createProjectArchive(emptyArchiveData())
    const stdout: string[] = []
    const stderr: string[] = []
    const exitCode = await runValidateProjectCli(['lesson.h5lesson'], {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
      read: async () => bytes,
    })

    expect(exitCode).toBe(0)
    expect(stderr).toEqual([])
    expect(stdout).toHaveLength(1)
    expect(JSON.parse(stdout[0]!)).toMatchObject({
      reportVersion: 1,
      status: 'valid',
    })

    const invalidStdout: string[] = []
    const invalidStderr: string[] = []
    const invalidExit = await runValidateProjectCli([], {
      stdout: (value) => invalidStdout.push(value),
      stderr: (value) => invalidStderr.push(value),
      read: async () => new Uint8Array(),
    })
    expect(invalidExit).toBe(2)
    expect(JSON.parse(invalidStdout[0]!)).toMatchObject({
      status: 'unreadable',
      fatal: { code: 'usage-error' },
    })
    expect(invalidStderr.join('')).toContain('参数错误')
  })

  it('runs the public command with pure JSON, stable exit codes, and no input writes', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'validate-project-cli-'))
    const lessonPath = path.join(directory, 'lesson.h5lesson')
    const completePath = path.join(directory, 'complete-context.h5lesson')
    const invalidPath = path.join(directory, 'invalid.h5lesson')
    const oldPath = path.join(directory, 'old.h5lesson')
    const schemaPath = path.join(directory, 'schema-invalid.h5lesson')
    const missingAssetPath = path.join(directory, 'missing-asset.h5lesson')
    const missingComponentPath = path.join(directory, 'missing-component.h5lesson')
    try {
      const validBytes = createProjectArchive(emptyArchiveData())
      await writeFile(lessonPath, validBytes)
      const valid = await publicValidatorCommand(lessonPath)
      expect(valid.exitCode).toBe(0)
      expect(valid.stderr).toBe('')
      expect(JSON.parse(valid.stdout)).toMatchObject({
        reportVersion: 1,
        status: 'valid',
      })
      expect(await readFile(lessonPath)).toEqual(Buffer.from(validBytes))

      const complete = completeContextArchive()
      await writeFile(completePath, complete.bytes)
      const completeResult = await publicValidatorCommand(completePath)
      expect(completeResult.exitCode).toBe(1)
      expect(completeResult.stderr).toBe('')
      const completeReport = JSON.parse(completeResult.stdout) as {
        project: { assetCount: number; componentPackageCount: number }
        exportPreflight: Record<string, { items: Array<{
          code: string
          sceneId?: string
          stateId?: string
          nodeId?: string
        }> }>
      }
      expect(completeReport.project).toMatchObject({
        assetCount: 1,
        componentPackageCount: 1,
      })
      expect(completeReport.exportPreflight['single-html']!.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'node-fully-outside-canvas',
            sceneId: complete.sceneId,
            stateId: complete.stateId,
            nodeId: complete.imageNodeId,
          }),
        ]),
      )
      for (const target of ['single-html', 'web-package']) {
        expect(completeReport.exportPreflight[target]!.items.some(
          (item) => item.code === 'static-export-interactions-omitted',
        )).toBe(false)
      }
      for (const target of ['pdf', 'pptx']) {
        expect(completeReport.exportPreflight[target]!.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code: 'static-export-interactions-omitted',
            }),
          ]),
        )
      }
      expect(await readFile(completePath)).toEqual(Buffer.from(complete.bytes))

      const invalid = emptyArchiveData()
      invalid.project.globalRuntime = {
        runtimeApiVersion: 2,
        enabled: true,
        renderMode: 'dom',
        source: 'CoursewareRuntime.define({create(){return fetch("/api")}})',
        content: { values: {} },
        assets: {},
      }
      await writeFile(invalidPath, createProjectArchive(invalid))
      const invalidResult = await publicValidatorCommand(invalidPath)
      expect(invalidResult.exitCode).toBe(1)
      expect(invalidResult.stderr).toBe('')
      expect(JSON.parse(invalidResult.stdout)).toMatchObject({ status: 'invalid' })

      const old = { ...emptyArchiveData().project, schemaVersion: 7 }
      await writeFile(oldPath, zipSync({
        'project.json': strToU8(JSON.stringify(old)),
      }))
      const oldResult = await publicValidatorCommand(oldPath)
      expect(oldResult.exitCode).toBe(2)
      expect(oldResult.stderr).toContain('旧工程格式不受支持')
      expect(JSON.parse(oldResult.stdout)).toMatchObject({
        status: 'unreadable',
        fatal: { code: 'unsupported-project-version' },
      })

      const schemaFiles = unzipSync(createProjectArchive(emptyArchiveData()))
      const schemaProject = JSON.parse(
        new TextDecoder().decode(schemaFiles['project.json']),
      ) as Record<string, unknown>
      delete schemaProject.playback
      schemaFiles['project.json'] = strToU8(JSON.stringify(schemaProject))
      await writeFile(schemaPath, zipSync(schemaFiles))
      const schemaResult = await publicValidatorCommand(schemaPath)
      expect(schemaResult.exitCode).toBe(2)
      expect(JSON.parse(schemaResult.stdout)).toMatchObject({
        status: 'unreadable',
        schema: {
          valid: false,
          schemaVersion: 8,
          issues: [expect.objectContaining({ path: ['playback'] })],
        },
        fatal: { code: 'schema-invalid' },
      })

      const missingAsset = emptyArchiveData()
      missingAsset.project.assets.hero = {
        id: 'hero',
        filename: 'hero.png',
        mimeType: 'image/png',
        kind: 'image',
        path: 'assets/hero.png',
        byteLength: 4,
        width: 10,
        height: 10,
      }
      await writeFile(missingAssetPath, zipSync({
        'project.json': strToU8(JSON.stringify(missingAsset.project)),
      }))
      const missingAssetResult = await publicValidatorCommand(missingAssetPath)
      expect(missingAssetResult.exitCode).toBe(2)
      expect(JSON.parse(missingAssetResult.stdout)).toMatchObject({
        status: 'unreadable',
        fatal: {
          code: 'archive-invalid',
          message: expect.stringContaining('hero.png'),
        },
      })

      const missingComponent = emptyArchiveData()
      const packageKey = 'com.example.missing@1.0.0'
      missingComponent.project.componentPackages[packageKey] = {
        packageId: 'com.example.missing',
        version: '1.0.0',
        name: '缺失组件',
        manifestPath: `components/${packageKey}/manifest.json`,
        runtimePath: `components/${packageKey}/runtime.js`,
        contentSha256: '0'.repeat(64),
      }
      await writeFile(missingComponentPath, zipSync({
        'project.json': strToU8(JSON.stringify(missingComponent.project)),
      }))
      const missingComponentResult = await publicValidatorCommand(
        missingComponentPath,
      )
      expect(missingComponentResult.exitCode).toBe(2)
      expect(JSON.parse(missingComponentResult.stdout)).toMatchObject({
        status: 'unreadable',
        fatal: {
          code: 'archive-invalid',
          message: expect.stringContaining(packageKey),
        },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 45_000)
})
