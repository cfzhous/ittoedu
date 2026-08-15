import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ComponentManifest } from '@/shared/componentTypes'
import { importComponentPackage } from '@/renderer/components/importComponentPackage'
import {
  captureV9SlideVerticalSliceArchive,
  isV9SlideVerticalSliceDirty,
  V9_SLIDE_TEST_TEXT_ID,
} from '@/renderer/course/v9SlideVerticalSlice'
import { useEditorStore } from '@/renderer/store/editorStore'

function captureLegacyTruth() {
  const state = useEditorStore.getState()
  return {
    project: state.project,
    history: state.history,
    assetFiles: state.assetFiles,
    componentPackages: state.componentPackages,
    projectPath: state.projectPath,
    dirty: state.dirty,
  }
}

function expectLegacyTruthUnchanged(before: ReturnType<typeof captureLegacyTruth>) {
  const state = useEditorStore.getState()
  expect(state.project).toBe(before.project)
  expect(state.history).toBe(before.history)
  expect(state.assetFiles).toBe(before.assetFiles)
  expect(state.componentPackages).toBe(before.componentPackages)
  expect(state.projectPath).toBe(before.projectPath)
  expect(state.dirty).toBe(before.dirty)
}

function makeComponentPackage() {
  const manifest: ComponentManifest = {
    schemaVersion: 4,
    runtimeApiVersion: 4,
    id: 'com.example.store-owner',
    name: 'Store owner fixture',
    version: '4.0.0',
    entry: 'runtime.js',
    defaultSize: { width: 320, height: 180 },
    minSize: { width: 160, height: 90 },
    preserveAspectRatio: true,
    assets: {},
    defaultProps: {},
    supportedScopes: ['scene'],
    renderMode: 'dom',
  }
  return importComponentPackage(zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'runtime.js': strToU8(
      "window.CoursewareComponent.define({id:'com.example.store-owner',runtimeApiVersion:4,create:function(){return{destroy:function(){}}}})",
    ),
  }))
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

describe('V9 ownership in the original editor Store', () => {
  it('keeps legacy project truth untouched while selection and one move commit to V9', () => {
    const legacyBefore = captureLegacyTruth()
    const store = useEditorStore.getState()
    store.activateV9SlideFixture()
    const initial = useEditorStore.getState().courseSession!

    store.selectCourseLayers({ nodeIds: [V9_SLIDE_TEST_TEXT_ID], additive: false })
    const selected = useEditorStore.getState().courseSession!
    store.moveCourseLayers({
      nodes: [{ nodeId: V9_SLIDE_TEST_TEXT_ID, x: 510, y: 370 }],
    })
    const moved = useEditorStore.getState().courseSession!

    expect(selected.history).toBe(initial.history)
    expect(selected.selection.selectionId).toBe(V9_SLIDE_TEST_TEXT_ID)
    expect(moved.history.present.revision).toBe(initial.history.present.revision + 1)
    expect(moved.history.past).toEqual([initial.history.present])
    expect(moved.history.future).toEqual([])
    expectLegacyTruthUnchanged(legacyBefore)
  })

  it('routes rename, undo and redo through only the V9 history', () => {
    const legacyBefore = captureLegacyTruth()
    const store = useEditorStore.getState()
    store.activateV9SlideFixture()
    const initial = useEditorStore.getState().courseSession!

    store.renameCourseProject('新课件标题')
    const renamed = useEditorStore.getState().courseSession!
    expect(renamed.history.present.title).toBe('新课件标题')
    expect(isV9SlideVerticalSliceDirty(renamed)).toBe(true)

    store.undoCourseProject()
    expect(useEditorStore.getState().courseSession!.history.present.title)
      .toBe(initial.history.present.title)
    expect(isV9SlideVerticalSliceDirty(useEditorStore.getState().courseSession!)).toBe(false)

    store.redoCourseProject()
    expect(useEditorStore.getState().courseSession!.history.present.title).toBe('新课件标题')
    expectLegacyTruthUnchanged(legacyBefore)
  })

  it('rejects a save completion from an obsolete V9 session', () => {
    const store = useEditorStore.getState()
    store.activateV9SlideFixture()
    const obsolete = useEditorStore.getState().courseSession!
    const obsoleteSnapshot = captureV9SlideVerticalSliceArchive(obsolete)

    store.createNewCourseProject()
    const current = useEditorStore.getState().courseSession!
    expect(current.sessionId).not.toBe(obsolete.sessionId)
    expect(() => useEditorStore.getState().completeCourseProjectSave(
      obsolete.sessionId,
      obsoleteSnapshot,
      'C:\\courseware\\obsolete.h5lesson',
    )).toThrow('保存结果不属于当前课件会话')
    expect(useEditorStore.getState().courseSession).toBe(current)
  })

  it('captures asset and component sidecars without routing them through legacy fields', () => {
    const legacyBefore = captureLegacyTruth()
    const store = useEditorStore.getState()
    store.activateV9SlideFixture()
    const fixture = useEditorStore.getState().courseSession!
    const project = structuredClone(fixture.history.present)
    const assetBytes = new Uint8Array([0, 1, 2, 255])
    project.assets.diagram = {
      id: 'diagram',
      filename: 'diagram.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/diagram.bin',
      byteLength: assetBytes.byteLength,
      width: 2,
      height: 2,
    }
    const component = makeComponentPackage()
    project.componentPackages[component.metadata.packageId] = component.metadata
    const archive = {
      project,
      assetFiles: { diagram: assetBytes },
      componentFiles: { [component.key]: component.files },
    }

    store.loadCourseProject(archive, 'C:\\courseware\\sidecars.h5lesson')
    const current = useEditorStore.getState().courseSession!
    const captured = captureV9SlideVerticalSliceArchive(current)

    expect(captured.project).toBe(current.history.present)
    expect(captured.assetFiles).toBe(archive.assetFiles)
    expect(captured.componentFiles).toBe(archive.componentFiles)
    expect(captured.assetFiles.diagram).toEqual(assetBytes)
    expect(captured.componentFiles[component.key]).toEqual(component.files)
    expectLegacyTruthUnchanged(legacyBefore)
  })

  it('creates a clean production Course Project without the test fixture', () => {
    const legacyBefore = captureLegacyTruth()
    useEditorStore.getState().createNewCourseProject()
    const current = useEditorStore.getState().courseSession!

    expect(current.history.present.schemaVersion).toBe(9)
    expect(current.history.present.title).toBe('未命名课件')
    expect(JSON.stringify(current.history.present)).not.toContain(V9_SLIDE_TEST_TEXT_ID)
    expect(isV9SlideVerticalSliceDirty(current)).toBe(false)
    expectLegacyTruthUnchanged(legacyBefore)
  })

  it('changes V9 shell preferences without committing a hidden V8 text draft', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const text = useEditorStore.getState().project.scenes[0]!.nodes.find(
      (node) => node.type === 'text',
    )
    if (!text || text.type !== 'text') throw new Error('expected legacy text node')
    store.beginTextEdit(text.id, 'properties')
    store.updateTextEditDraft(text.id, '尚未提交的 V8 草稿', text.runs)
    const before = useEditorStore.getState()
    const legacyProject = before.project
    const legacyHistory = before.history
    const legacyDirty = before.dirty
    const textEditSession = before.textEditSession

    store.activateV9SlideFixture()
    store.setEditorMode(before.editorMode === 'simple' ? 'professional' : 'simple')
    store.setActiveTab('layers')
    const after = useEditorStore.getState()

    expect(after.project).toBe(legacyProject)
    expect(after.history).toBe(legacyHistory)
    expect(after.dirty).toBe(legacyDirty)
    expect(after.textEditSession).toBe(textEditSession)
    expect(after.courseSession).not.toBeNull()
    expect(after.activeTab).toBe('layers')
  })
})
