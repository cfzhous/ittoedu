import { strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import {
  CourseStateExecutionError,
  DeclarativeCourseState,
  type CourseNavigationEntryPoint,
  type CourseStateCheckpoint,
} from '@/player/DeclarativeCourseState'
import { importComponentPackage } from '@/renderer/components/importComponentPackage'
import {
  createCourseProjectArchive,
  createCourseProjectArchiveAsync,
  openCourseProjectArchive,
  openCourseProjectArchiveAsync,
} from '@/renderer/project/courseProjectArchive'
import { createCourseProject } from '@/renderer/course/courseStudioModel'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import type { ComponentManifest } from '@/shared/componentTypes'

const NOW = '2026-08-14T00:00:00.000Z'

function stateEngine(): DeclarativeCourseState {
  return new DeclarativeCourseState({
    projectId: 'state-fixture',
    projectRevision: 7,
    declarations: [
      { key: 'attempts', valueType: 'number', defaultValue: 0 },
      { key: 'completed', valueType: 'boolean', defaultValue: false },
      { key: 'note', valueType: 'string', defaultValue: '' },
      { key: 'empty', valueType: 'null', defaultValue: null },
    ],
    navigationGuards: [
      {
        id: 'complete-before-summary',
        effect: 'block',
        fromLocationIds: ['practice'],
        toLocationIds: ['summary'],
        match: 'all',
        conditions: [
          { type: 'compare', key: 'completed', operator: 'eq', value: true },
          { type: 'compare', key: 'attempts', operator: 'gte', value: 2 },
        ],
        message: '请先完成两次尝试',
      },
      {
        id: 'delete-note-before-practice',
        effect: 'block',
        toLocationIds: ['practice'],
        match: 'all',
        conditions: [{ type: 'exists', key: 'note', exists: false }],
        message: '请先清空临时备注',
      },
    ],
    locationIds: ['intro', 'practice', 'summary'],
    startLocationId: 'intro',
  })
}

function expectStateError(
  operation: () => unknown,
  code: CourseStateExecutionError['code'],
): void {
  try {
    operation()
  } catch (error) {
    expect(error).toBeInstanceOf(CourseStateExecutionError)
    expect((error as CourseStateExecutionError).code).toBe(code)
    return
  }
  throw new Error(`Expected CourseStateExecutionError: ${code}`)
}

function makeCourseProject(): CourseProjectDocument {
  return createCourseProject({
    id: 'archive-fixture',
    title: '课程工程归档',
    now: NOW,
  })
}

function makeComponent() {
  const manifest: ComponentManifest = {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: 'com.example.archive-counter',
    name: '归档计数器',
    version: '4.0.0',
    description: '课程工程归档测试',
    entry: 'runtime.js',
    thumbnail: 'thumbnail.png',
    defaultSize: { width: 480, height: 280 },
    minSize: { width: 160, height: 100 },
    preserveAspectRatio: true,
    assets: {},
    defaultProps: { initialValue: 0 },
    supportedScopes: ['scene'],
    renderMode: 'dom',
  }
  const files = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'runtime.js': strToU8(`window.CoursewareComponent.define({
      id:'com.example.archive-counter', runtimeApiVersion:4,
      create:function(){return{destroy:function(){}}}
    })`),
    'thumbnail.png': new Uint8Array([137, 80, 78, 71]),
  }
  return importComponentPackage(zipSync(files))
}

function makeArchiveData() {
  const project = makeCourseProject()
  const assetBytes = new Uint8Array([0, 1, 2, 3, 254, 255])
  project.assets.diagram = {
    id: 'diagram',
    filename: 'diagram.png',
    mimeType: 'image/png',
    kind: 'image',
    path: 'assets/diagram.bin',
    byteLength: assetBytes.byteLength,
    width: 2,
    height: 3,
  }
  const component = makeComponent()
  project.componentPackages[component.metadata.packageId] = component.metadata
  return {
    project,
    assetFiles: { diagram: assetBytes },
    componentFiles: { [component.key]: component.files },
  }
}

describe('declarative course state', () => {
  it('executes only declared, strictly typed atomic actions', () => {
    const state = stateEngine()
    expect(state.snapshot()).toEqual({ attempts: 0, completed: false, note: '', empty: null })

    state.apply({ type: 'increment', key: 'attempts', delta: 2 })
    state.apply({ type: 'set', key: 'completed', value: true })
    state.apply({ type: 'set', key: 'note', value: '已观察' })
    state.apply({ type: 'delete', key: 'note' })
    expect(state.snapshot()).toEqual({ attempts: 2, completed: true, empty: null })

    expectStateError(() => state.set('attempts', '2'), 'wrong-type')
    expectStateError(() => state.set('implicit', 1), 'unknown-key')
    expectStateError(() => state.increment('note'), 'wrong-type')
    expectStateError(() => state.increment('attempts', Number.POSITIVE_INFINITY), 'wrong-type')
    expectStateError(() => state.apply({
      type: 'set', key: 'completed', value: true, executable: 'alert(1)',
    } as never), 'invalid-action')

    state.delete('attempts')
    expectStateError(() => state.increment('attempts'), 'missing-value')
  })

  it('freezes mutations while retaining the exact inspection snapshot', () => {
    const state = stateEngine()
    state.increment('attempts', 1)
    state.setFrozen(true)
    const before = state.checkpoint()

    expect(state.get('attempts')).toBe(1)
    expectStateError(() => state.increment('attempts'), 'frozen')
    expectStateError(() => state.delete('note'), 'frozen')
    expect(state.checkpoint()).toEqual(before)

    state.setFrozen(false)
    state.increment('attempts')
    expect(state.get('attempts')).toBe(2)
  })

  it('restores revision-scoped checkpoints and makes static capture deterministic', () => {
    const state = stateEngine()
    state.increment('attempts', 3)
    state.set('completed', true)
    state.delete('note')
    const checkpoint = state.checkpoint()

    state.set('attempts', 9)
    state.set('note', '不应保留')
    state.restore(checkpoint)
    expect(state.snapshot()).toEqual({ attempts: 3, completed: true, empty: null })
    expect(state.checkpointForStaticCapture()).toEqual(state.defaultCheckpoint())
    expect(state.checkpointForStaticCapture(checkpoint)).toEqual(checkpoint)

    const stale: CourseStateCheckpoint = { ...checkpoint, projectRevision: 8 }
    expectStateError(() => state.restore(stale), 'checkpoint-stale')
    const wrongType = structuredClone(checkpoint) as unknown as CourseStateCheckpoint
    ;(wrongType.values as Record<string, unknown>).attempts = '3'
    expectStateError(() => state.restore(wrongType), 'wrong-type')
    const unknown = structuredClone(checkpoint)
    unknown.values.implicit = 1
    expectStateError(() => state.restore(unknown), 'unknown-key')
    expect(state.snapshot()).toEqual({ attempts: 3, completed: true, empty: null })
  })

  it('routes every ordinary entry through the same requirement guards', () => {
    const guardedEntries: CourseNavigationEntryPoint[] = [
      'presenter', 'teacher-controller', 'runtime', 'component',
    ]
    for (const entryPoint of guardedEntries) {
      const state = stateEngine()
      const blocked = state.requestNavigation({
        entryPoint,
        fromLocationId: 'practice',
        toLocationId: 'summary',
      })
      expect(blocked).toMatchObject({
        allowed: false,
        checkedGuardIds: ['complete-before-summary'],
        blockedBy: [{ guardId: 'complete-before-summary' }],
      })
    }

    const state = stateEngine()
    state.increment('attempts', 2)
    state.set('completed', true)
    expect(state.requestNavigation({
      entryPoint: 'runtime',
      fromLocationId: 'practice',
      toLocationId: 'summary',
    })).toMatchObject({ allowed: true, blockedBy: [] })

    expect(state.requestNavigation({
      entryPoint: 'presenter',
      fromLocationId: 'intro',
      toLocationId: 'practice',
    }).allowed).toBe(false)
    state.delete('note')
    expect(state.requestNavigation({
      entryPoint: 'presenter',
      fromLocationId: 'intro',
      toLocationId: 'practice',
    }).allowed).toBe(true)
  })

  it('keeps initial/replay/restart/author/capture semantics explicit and restart restores defaults', () => {
    const state = stateEngine()
    const unguarded: CourseNavigationEntryPoint[] = [
      'initial-entry', 'replay', 'author-force', 'static-capture',
    ]
    for (const entryPoint of unguarded) {
      expect(state.requestNavigation({
        entryPoint,
        fromLocationId: 'practice',
        toLocationId: 'summary',
      })).toMatchObject({ allowed: true, checkedGuardIds: [] })
    }
    state.increment('attempts', 5)
    state.set('completed', true)
    state.delete('note')
    expect(state.restart()).toMatchObject({
      allowed: true,
      entryPoint: 'restart',
      toLocationId: 'intro',
    })
    expect(state.snapshot()).toEqual({ attempts: 0, completed: false, note: '', empty: null })
  })
})

describe('Course Project V9 archive', () => {
  it('round-trips schema, exact asset bytes and embedded component bytes', () => {
    const data = makeArchiveData()
    const controller = data.project.globalLayerItems.find((entry) => (
      entry.item.kind === 'native' && entry.item.content.nativeType === 'teacher-controller'
    ))
    if (!controller || controller.item.kind !== 'native' || controller.item.content.nativeType !== 'teacher-controller') {
      throw new Error('Default teacher controller missing')
    }
    controller.item.content.data.showSceneProgress = false
    controller.item.content.data.collapsible = true
    controller.item.content.data.defaultCollapsed = true
    const bytes = createCourseProjectArchive(data, { mtime: NOW })
    const reopened = openCourseProjectArchive(bytes)

    expect(reopened.project).toEqual(data.project)
    expect([...reopened.assetFiles.diagram!]).toEqual([...data.assetFiles.diagram!])
    const componentKey = Object.keys(data.componentFiles)[0]!
    expect(Object.keys(reopened.componentFiles[componentKey]!).sort()).toEqual(
      Object.keys(data.componentFiles[componentKey]!).sort(),
    )
    expect([...reopened.componentFiles[componentKey]!['runtime.js']!]).toEqual(
      [...data.componentFiles[componentKey]!['runtime.js']!],
    )
    const reopenedController = reopened.project.globalLayerItems.find((entry) => (
      entry.item.kind === 'native' && entry.item.content.nativeType === 'teacher-controller'
    ))
    expect(reopenedController?.item).toMatchObject({
      content: {
        nativeType: 'teacher-controller',
        data: { showSceneProgress: false, collapsible: true, defaultCollapsed: true },
      },
    })
    expect(createCourseProjectArchive(reopened, { mtime: NOW })).toEqual(bytes)
  })

  it('supports asynchronous save/reopen and cancellation', async () => {
    const data = makeArchiveData()
    const bytes = await createCourseProjectArchiveAsync(data, { mtime: NOW })
    await expect(openCourseProjectArchiveAsync(bytes)).resolves.toMatchObject({
      project: { schemaVersion: 9, id: 'archive-fixture' },
    })

    const controller = new AbortController()
    controller.abort()
    await expect(createCourseProjectArchiveAsync(data, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    await expect(openCourseProjectArchiveAsync(bytes, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects corrupt schemas, missing bytes, unsafe paths and unregistered files', () => {
    const data = makeArchiveData()
    expect(() => createCourseProjectArchive({
      ...data,
      assetFiles: {},
    })).toThrow(/缺少二进制内容/)

    const validFiles = unzipSync(createCourseProjectArchive(data))
    const missingAsset = { ...validFiles }
    delete missingAsset['assets/diagram.bin']
    expect(() => openCourseProjectArchive(zipSync(missingAsset))).toThrow(/缺少素材/)

    expect(() => openCourseProjectArchive(zipSync({
      ...validFiles,
      'extra.txt': strToU8('hidden payload'),
    }))).toThrow(/未登记文件/)

    expect(() => openCourseProjectArchive(zipSync({
      ...validFiles,
      '../escape.txt': strToU8('unsafe'),
    }))).toThrow(/不安全|路径穿越/)

    const invalidProject = JSON.parse(new TextDecoder().decode(validFiles['project.json']))
    invalidProject.surfaces[0].unknownField = true
    expect(() => openCourseProjectArchive(zipSync({
      ...validFiles,
      'project.json': strToU8(JSON.stringify(invalidProject)),
    }))).toThrow(/project\.json 校验失败/)
  })

  it('rejects every non-V9 archive through the ordinary unsupported-version boundary', () => {
    const v8Bytes = zipSync({
      'project.json': strToU8(JSON.stringify({ schemaVersion: 8 })),
    })

    expect(() => openCourseProjectArchive(v8Bytes)).toThrow(/Course Project V9/)
  })
})
