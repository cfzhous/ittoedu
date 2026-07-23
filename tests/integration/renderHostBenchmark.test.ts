import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { componentManifestSchema } from '../../src/shared/componentSchema'
import type { ComponentManifest } from '../../src/shared/componentTypes'
import { projectDocumentSchema } from '../../src/shared/projectSchema'
import type { ProjectDocument } from '../../src/shared/projectTypes'
import { importComponentPackage } from '../../src/renderer/components/importComponentPackage'
import { openProjectArchive } from '../../src/renderer/project/projectArchive'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(testDirectory, '..', '..')
const exampleDirectory = path.join(projectRoot, 'examples', 'render-host-benchmark')
const runtimeDirectory = path.join(exampleDirectory, 'runtimes')
const tableDirectory = path.join(exampleDirectory, 'components', 'editable-table')
const legacyDirectory = path.join(exampleDirectory, 'components', 'legacy-phaser')
const MAX_RUNTIME_BYTES = 2 * 1024 * 1024

let project: ProjectDocument
let threeBundle = ''
let phaserRuntime = ''
let tableManifest: ComponentManifest
let legacyManifest: ComponentManifest
let tableRuntime = ''
let legacyRuntime = ''
let declaredThreeVersion = ''

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readDeclaredThreeVersion(packageValue: unknown): string {
  const version = isRecord(packageValue) && isRecord(packageValue.devDependencies)
    ? packageValue.devDependencies.three
    : undefined
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error('package.json must pin devDependencies.three to an exact version')
  }
  return version
}

function executeRuntimeRegistration(source: string): unknown {
  let definition: unknown
  const api = {
    define(candidate: unknown) {
      if (definition !== undefined) throw new Error('runtime duplicate registration')
      definition = candidate
    },
  }
  const runtimeWindow = { CoursewareRuntime: api }
  const runtimeGlobal = { CoursewareRuntime: api }
  const execute = new Function(
    'window',
    'globalThis',
    'CoursewareRuntime',
    `"use strict";\n${source}`,
  ) as (
    windowValue: typeof runtimeWindow,
    globalValue: typeof runtimeGlobal,
    apiValue: typeof api,
  ) => void
  execute(runtimeWindow, runtimeGlobal, api)
  return definition
}

function executeComponentRegistration(source: string): unknown {
  let definition: unknown
  const runtimeWindow = {
    CoursewareComponent: {
      define(candidate: unknown) {
        if (definition !== undefined) throw new Error('component duplicate registration')
        definition = candidate
      },
    },
  }
  const execute = new Function('window', `"use strict";\n${source}`) as (
    windowValue: typeof runtimeWindow,
  ) => void
  execute(runtimeWindow)
  return definition
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [entryPath] : []
  }))
  return nested.flat()
}

interface ThreeDependencyReference {
  file: string
  line: number
  kind: 'import' | 'export' | 'dynamic-import' | 'require'
  specifier: string
}

function findThreeDependencyReferences(filePath: string, source: string): ThreeDependencyReference[] {
  const references: ThreeDependencyReference[] = []
  const patterns: Array<{
    kind: ThreeDependencyReference['kind']
    pattern: RegExp
  }> = [
    {
      kind: 'import',
      pattern: /^\s*import\s+(?!\()(?:type\s+)?(?:[^'";]*?\s+from\s+)?["'](three(?:\/[^"']*)?)["']/gm,
    },
    {
      kind: 'export',
      pattern: /^\s*export\s+(?:type\s+)?(?:\*[^'";]*|\{[^}]*\})\s+from\s+["'](three(?:\/[^"']*)?)["']/gm,
    },
    {
      kind: 'dynamic-import',
      pattern: /\bimport\s*\(\s*["'](three(?:\/[^"']*)?)["']\s*\)/g,
    },
    {
      kind: 'require',
      pattern: /\brequire(?:\.resolve)?\s*\(\s*["'](three(?:\/[^"']*)?)["']\s*\)/g,
    },
  ]
  for (const { kind, pattern } of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier === undefined || match.index === undefined) continue
      references.push({
        file: path.relative(projectRoot, filePath).replaceAll('\\', '/'),
        line: source.slice(0, match.index).split(/\r?\n/).length,
        kind,
        specifier,
      })
    }
  }
  return references.sort((left, right) => left.line - right.line)
}

beforeAll(async () => {
  const [
    projectValue,
    threeSource,
    phaserSource,
    tableManifestValue,
    legacyManifestValue,
    tableSource,
    legacySource,
    rootPackageValue,
  ] = await Promise.all([
    readJson(path.join(exampleDirectory, 'project.json')),
    fs.readFile(path.join(runtimeDirectory, 'three-runtime.js'), 'utf8'),
    fs.readFile(path.join(runtimeDirectory, 'phaser-runtime.js'), 'utf8'),
    readJson(path.join(tableDirectory, 'manifest.json')),
    readJson(path.join(legacyDirectory, 'manifest.json')),
    fs.readFile(path.join(tableDirectory, 'runtime.js'), 'utf8'),
    fs.readFile(path.join(legacyDirectory, 'runtime.js'), 'utf8'),
    readJson(path.join(projectRoot, 'package.json')),
  ])
  project = projectDocumentSchema.parse(projectValue)
  threeBundle = threeSource
  phaserRuntime = phaserSource
  tableManifest = componentManifestSchema.parse(tableManifestValue)
  legacyManifest = componentManifestSchema.parse(legacyManifestValue)
  tableRuntime = tableSource
  legacyRuntime = legacySource
  declaredThreeVersion = readDeclaredThreeVersion(rootPackageValue)
})

describe('render host benchmark fixture', () => {
  it('is a complete Project V7 document with one scene for each route', () => {
    expect(project.schemaVersion).toBe(7)
    expect(project.scenes.map(({ id }) => id)).toEqual([
      'scene_native_nodes',
      'scene_runtime_phaser',
      'scene_runtime_three',
      'scene_component_v4_dom',
      'scene_component_v3_legacy',
    ])
    expect(project.globalLayer).toHaveLength(1)
    expect(project.globalInteractions).toEqual([])
    expect(project.playback).toEqual({ controls: 'canvas', keyboardNavigation: true })
    expect(project.scenes.every((scene) => Array.isArray(scene.interactions))).toBe(true)

    const [nativeScene, phaserScene, threeScene, tableScene, legacyScene] = project.scenes
    expect(nativeScene?.runtime).toBeUndefined()
    expect(nativeScene?.nodes.some((node) => node.type === 'external-component')).toBe(false)
    expect(phaserScene?.runtime).toMatchObject({ runtimeApiVersion: 2, renderMode: 'phaser' })
    expect(threeScene?.runtime).toMatchObject({ runtimeApiVersion: 2, renderMode: 'dom' })
    expect(threeScene?.runtime?.source).toBe(threeBundle)
    expect(tableScene?.nodes).toContainEqual(expect.objectContaining({
      type: 'external-component',
      component: { packageId: tableManifest.id, version: tableManifest.version },
    }))
    expect(legacyScene?.nodes).toContainEqual(expect.objectContaining({
      type: 'external-component',
      component: { packageId: legacyManifest.id, version: legacyManifest.version },
    }))

    expect(Object.values(project.assets).every(({ kind }) => kind === 'image')).toBe(true)
    expect(JSON.stringify(project.assets)).not.toContain('"model"')
  })

  it('registers both one-off runtimes as API 2 definitions', () => {
    const phaserDefinition = executeRuntimeRegistration(phaserRuntime)
    const threeDefinition = executeRuntimeRegistration(threeBundle)
    expect(phaserDefinition).toMatchObject({
      runtimeApiVersion: 2,
      create: expect.any(Function),
    })
    expect(threeDefinition).toMatchObject({
      runtimeApiVersion: 2,
      create: expect.any(Function),
    })
  })

  it('ships Three.js inside a single offline IIFE under the runtime size limit', async () => {
    const bundleBytes = new TextEncoder().encode(threeBundle).byteLength
    expect(bundleBytes).toBeLessThan(MAX_RUNTIME_BYTES)
    expect(threeBundle).toContain('CoursewareRuntime.define')
    expect(threeBundle).not.toMatch(/(^|[;\n\r])\s*import\s*(?:[(\s{*]|["'])/m)
    expect(threeBundle).not.toMatch(/(^|[;\n\r])\s*export\s+(?:default|const|let|var|function|class|\{|\*)/m)
    expect(threeBundle).not.toMatch(/\brequire\s*\(/)

    const entry = await fs.readFile(path.join(runtimeDirectory, 'three-runtime.entry.ts'), 'utf8')
    expect(entry).toContain("from 'three'")
    expect(entry).toContain('prepareCapture()')
    expect(entry).toContain('cancelAnimationFrame')
    expect(entry).toContain('removeEventListener')
    expect(entry).toContain('geometry.dispose()')
    expect(entry).toContain('material.dispose()')
    expect(entry).toContain('renderer.dispose()')
    expect(entry).toContain('renderer.forceContextLoss()')
  })

  it('keeps Three.js module dependencies out of the entire core source tree', async () => {
    const probePath = path.join(projectRoot, 'src', '__three_dependency_probe.ts')
    expect(findThreeDependencyReferences(
      probePath,
      "type ThreeRenderMode = 'three'\nconst description = 'Three.js is an optional enhancement'",
    )).toEqual([])
    expect(findThreeDependencyReferences(
      probePath,
      "import type { Scene } from 'three'\nvoid import('three/addons/loaders/GLTFLoader.js')\nrequire('three')",
    ).map(({ kind, specifier }) => ({ kind, specifier }))).toEqual([
      { kind: 'import', specifier: 'three' },
      { kind: 'dynamic-import', specifier: 'three/addons/loaders/GLTFLoader.js' },
      { kind: 'require', specifier: 'three' },
    ])

    const files = await sourceFiles(path.join(projectRoot, 'src'))
    const sources = await Promise.all(files.map(async (filePath) => ({
      filePath,
      source: await fs.readFile(filePath, 'utf8'),
    })))
    const references = sources.flatMap(({ filePath, source }) =>
      findThreeDependencyReferences(filePath, source))
    expect(references).toEqual([])
  })

  it('contains a V4 DOM table and an unchanged V3 Phaser compatibility component', () => {
    expect(tableManifest).toMatchObject({
      schemaVersion: 4,
      runtimeApiVersion: 4,
      renderMode: 'dom',
      supportedScopes: ['scene', 'global'],
    })
    expect(tableManifest.defaultProps).toHaveProperty('content.rows')
    expect(tableRuntime).toContain('ctx.dom.root')
    expect(tableRuntime).toContain('ctx.capture.waitUntil')
    expect(tableRuntime).toContain('prepareCapture')
    expect(tableRuntime).toContain('removeEventListener')

    expect(legacyManifest).toMatchObject({
      schemaVersion: 3,
      runtimeApiVersion: 3,
      supportedScopes: ['scene'],
    })
    expect(legacyManifest).not.toHaveProperty('renderMode')
    expect(legacyRuntime).toContain('ctx.scene.add')
    expect(legacyRuntime).toContain('ctx.root.add')

    expect(executeComponentRegistration(tableRuntime)).toMatchObject({
      id: tableManifest.id,
      runtimeApiVersion: 4,
      create: expect.any(Function),
    })
    expect(executeComponentRegistration(legacyRuntime)).toMatchObject({
      id: legacyManifest.id,
      runtimeApiVersion: 3,
      create: expect.any(Function),
    })
  })

  it('reopens the lesson and both component archives with current import paths', async () => {
    const [lessonBytes, tableBytes, legacyBytes] = await Promise.all([
      fs.readFile(path.join(exampleDirectory, 'render-host-benchmark.h5lesson')),
      fs.readFile(path.join(exampleDirectory, 'render-host-editable-table.h5component')),
      fs.readFile(path.join(exampleDirectory, 'render-host-legacy-phaser.h5component')),
    ])
    const reopened = openProjectArchive(lessonBytes)
    expect(reopened.project.scenes).toHaveLength(5)
    expect(Object.keys(reopened.componentFiles)).toHaveLength(2)
    expect(importComponentPackage(tableBytes).manifest.schemaVersion).toBe(4)
    expect(importComponentPackage(legacyBytes).manifest.schemaVersion).toBe(3)
  })

  it('ships an offline standalone player and the Three.js MIT notice beside it', async () => {
    const [html, notice, noticeStat, installedPackage, installedLicense] = await Promise.all([
      fs.readFile(path.join(exampleDirectory, 'render-host-benchmark.html'), 'utf8'),
      fs.readFile(path.join(exampleDirectory, 'THIRD_PARTY_NOTICES.md'), 'utf8'),
      fs.stat(path.join(exampleDirectory, 'THIRD_PARTY_NOTICES.md')),
      readJson(path.join(projectRoot, 'node_modules', 'three', 'package.json')),
      fs.readFile(path.join(projectRoot, 'node_modules', 'three', 'LICENSE'), 'utf8'),
    ])
    expect(html).toContain('window.__H5_LESSON_PAYLOAD__=')
    expect(html).toContain("connect-src 'none'")
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(noticeStat.isFile()).toBe(true)
    expect(installedPackage).toMatchObject({ version: declaredThreeVersion, license: 'MIT' })
    expect(notice).toContain(`## Three.js ${declaredThreeVersion}`)
    expect(notice.endsWith(`${installedLicense.trim()}\n`)).toBe(true)
    expect(notice).toContain('https://github.com/mrdoob/three.js')
    expect(notice).toContain('The MIT License')
    expect(notice).toContain('runtimes/three-runtime.js')
  })
})
