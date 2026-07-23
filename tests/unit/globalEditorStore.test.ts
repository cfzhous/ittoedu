import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ComponentManifestV3,
  ComponentPackageData,
} from '@/shared/componentTypes'
import type { RuntimeDocument } from '@/shared/runtimeTypes'
import { useEditorStore } from '@/renderer/store/editorStore'

function componentPackage(
  id: string,
  supportedScopes: ComponentManifestV3['supportedScopes'],
): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 3,
      runtimeApiVersion: 3,
      supportedScopes,
      id,
      name: id === 'com.example.global' ? '全局控制条' : '场景练习',
      version: '3.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 480, height: 120 },
      minSize: { width: 160, height: 60 },
      preserveAspectRatio: false,
      assets: {},
      defaultProps: {
        content: {
          title: '课程导航',
          buttons: { replay: '重播', next: '下一页' },
        },
      },
    },
    runtimeSource:
      "window.CoursewareComponent.define({id:'placeholder',runtimeApiVersion:3,create:function(){return {destroy:function(){}}}})",
    files: {
      'manifest.json': new Uint8Array([1]),
      'runtime.js': new Uint8Array([2]),
    },
  }
}

function runtime(title: string): RuntimeDocument {
  return {
    runtimeApiVersion: 1,
    enabled: true,
    renderMode: 'hybrid',
    source: `CoursewareRuntime.define({create(){/* ${title} */return{destroy(){}}}})`,
    content: {
      values: {
        title,
        'feedback.success': '回答正确',
      },
      metadata: {
        title: { label: '标题' },
      },
    },
    assets: {},
  }
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

describe('Project V5 global-layer editor store', () => {
  it('accepts only global-capable V3 packages and creates an undoable placement', () => {
    const store = useEditorStore.getState()
    const global = componentPackage('com.example.global', ['scene', 'global'])
    const sceneOnly = componentPackage('com.example.scene', ['scene'])
    store.importComponentPackage(global)
    store.importComponentPackage(sceneOnly)
    store.setEditingScope('global')
    const initialGlobalCount = useEditorStore.getState().project.globalLayer.length

    store.addExternalComponentNode(sceneOnly.manifest.id)
    expect(useEditorStore.getState().project.globalLayer).toHaveLength(
      initialGlobalCount,
    )
    expect(useEditorStore.getState().errorMessage).toContain('未声明支持全局层')

    store.addExternalComponentNode(global.manifest.id, 240, 90)
    const state = useEditorStore.getState()
    const placement = state.project.globalLayer.find(
      (item) => item.node.type === 'external-component',
    )!
    expect(placement).toMatchObject({
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
      node: {
        type: 'external-component',
        x: 240,
        y: 90,
        component: { packageId: global.manifest.id },
      },
    })
    expect(state.selectedNodeId).toBe(placement.node.id)

    store.undo()
    expect(useEditorStore.getState().project.globalLayer).toHaveLength(
      initialGlobalCount,
    )
    store.redo()
    expect(
      useEditorStore.getState().project.globalLayer.some(
        (item) => item.node.id === placement.node.id,
      ),
    ).toBe(true)
  })

  it('moves, resizes, edits copy, and persists layer and stable scene visibility', () => {
    const store = useEditorStore.getState()
    const global = componentPackage('com.example.global', ['global'])
    store.importComponentPackage(global)
    store.addScene()
    const sceneIds = useEditorStore.getState().project.scenes.map((scene) => scene.id)
    store.setEditingScope('global')
    store.addExternalComponentNode(global.manifest.id)
    const nodeId = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.type === 'external-component',
    )!.node.id

    store.updateNode(nodeId, {
      x: 80,
      y: 40,
      width: 720,
      height: 160,
      props: {
        content: {
          title: '教师控制台',
          buttons: { replay: '重新演示', next: '继续学习' },
        },
      },
    })
    store.updateGlobalLayerSettings(nodeId, {
      layer: 'underlay',
      visibility: {
        mode: 'include',
        sceneIds: [sceneIds[1]!, sceneIds[1]!, 'missing-scene'],
      },
    })

    expect(useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === nodeId,
    )).toMatchObject({
      layer: 'underlay',
      visibility: { mode: 'include', sceneIds: [sceneIds[1]] },
      node: {
        x: 80,
        y: 40,
        width: 720,
        height: 160,
        props: {
          content: {
            title: '教师控制台',
            buttons: { replay: '重新演示', next: '继续学习' },
          },
        },
      },
    })

    store.undo()
    expect(useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === nodeId,
    )).toMatchObject({
      layer: 'overlay',
      visibility: { mode: 'all', sceneIds: [] },
    })
    store.redo()
    expect(useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === nodeId,
    )).toMatchObject({
      layer: 'underlay',
      visibility: { mode: 'include', sceneIds: [sceneIds[1]] },
    })
  })

  it('authors native text, image, and shape nodes in the persistent global layer', () => {
    const store = useEditorStore.getState()
    store.addScene()
    const secondSceneId = useEditorStore.getState().project.scenes[1]!.id
    store.setEditingScope('global')

    store.addTextNode(80, 40)
    store.addShapeNode('rounded-rectangle', 20, 620)
    store.addImageNode({
      id: 'asset_global_logo',
      filename: 'logo.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'assets/logo.png',
      byteLength: 4,
      width: 160,
      height: 80,
    }, new Uint8Array([1, 2, 3, 4]), 1080, 30)

    let layer = useEditorStore.getState().project.globalLayer
    expect(layer.map((item) => item.node.type)).toEqual([
      'teacher-controller',
      'text',
      'shape',
      'image',
    ])
    const text = layer.find((item) => item.node.type === 'text')!.node
    expect(text.type).toBe('text')
    if (text.type !== 'text') throw new Error('测试全局节点不是文字')

    store.beginTextEdit(text.id, 'canvas')
    store.updateTextEditDraft(text.id, '跨场景课程标题', [], 64)
    store.commitTextEdit()
    store.updateGlobalLayerSettings(text.id, {
      layer: 'underlay',
      visibility: { mode: 'exclude', sceneIds: [secondSceneId] },
    })

    layer = useEditorStore.getState().project.globalLayer
    expect(layer.find((item) => item.node.id === text.id)).toMatchObject({
      layer: 'underlay',
      visibility: { mode: 'exclude', sceneIds: [secondSceneId] },
      node: { type: 'text', text: '跨场景课程标题', height: 64 },
    })
    expect(useEditorStore.getState().assetFiles.asset_global_logo).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    )

    store.undo()
    expect(useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === text.id,
    )!.layer).toBe('overlay')
  })

  it('edits scene and global runtime content without changing source and supports undo', () => {
    const initial = structuredClone(useEditorStore.getState().project)
    const sceneRuntime = runtime('场景标题')
    const globalRuntime = runtime('全局标题')
    initial.scenes[0]!.runtime = sceneRuntime
    initial.globalRuntime = globalRuntime
    useEditorStore.getState().loadProject(initial, null)
    const store = useEditorStore.getState()
    const sceneId = initial.scenes[0]!.id

    store.updateSceneRuntime(sceneId, {
      content: {
        ...sceneRuntime.content,
        values: {
          ...sceneRuntime.content.values,
          title: '修改后的场景标题',
        },
      },
    })
    store.updateGlobalRuntime({
      content: {
        ...globalRuntime.content,
        values: {
          ...globalRuntime.content.values,
          title: '修改后的全局标题',
        },
      },
    })

    let project = useEditorStore.getState().project
    expect(project.scenes[0]!.runtime?.source).toBe(sceneRuntime.source)
    expect(project.globalRuntime?.source).toBe(globalRuntime.source)
    expect(project.scenes[0]!.runtime?.content.values).toEqual({
      title: '修改后的场景标题',
      'feedback.success': '回答正确',
    })
    expect(project.globalRuntime?.content.values.title).toBe('修改后的全局标题')

    store.undo()
    project = useEditorStore.getState().project
    expect(project.globalRuntime?.content.values.title).toBe('全局标题')
    expect(project.globalRuntime?.source).toBe(globalRuntime.source)
    store.undo()
    expect(
      useEditorStore.getState().project.scenes[0]!.runtime?.content.values.title,
    ).toBe('场景标题')
  })

  it('keeps scene editing isolated when switching to and from the global layer', () => {
    const store = useEditorStore.getState()
    store.addTextNode(50, 60)
    const sceneNode = useEditorStore.getState().project.scenes[0]!.nodes[0]!
    const global = componentPackage('com.example.global', ['scene', 'global'])
    store.importComponentPackage(global)

    store.setEditingScope('global')
    expect(useEditorStore.getState().selectedNodeIds).toEqual([])
    store.addExternalComponentNode(global.manifest.id)
    const globalNode = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.type === 'external-component',
    )!.node
    store.updateNode(globalNode.id, { x: 900 })

    store.setActiveScene(useEditorStore.getState().activeSceneId)
    expect(useEditorStore.getState().editingScope).toBe('scene')
    expect(useEditorStore.getState().project.scenes[0]!.nodes[0]).toEqual(sceneNode)
    store.selectNode(sceneNode.id)
    store.updateNode(sceneNode.id, { x: 120 })
    expect(useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.id === globalNode.id,
    )!.node.x).toBe(900)
  })

  it('authors, duplicates, copies, and cleans global node interactions', () => {
    const store = useEditorStore.getState()
    store.setEditingScope('global')
    store.addTextNode(120, 80)
    const original = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.type === 'text',
    )!.node
    store.addGlobalInteractionRule({
      id: 'global_click',
      name: '全局文字翻页',
      enabled: true,
      trigger: { type: 'node.click', nodeId: original.id },
      conditions: [],
      actions: [{
        id: 'global_click_step',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'scene.next' },
      }],
    })

    store.duplicateNode(original.id)
    let state = useEditorStore.getState()
    expect(state.project.globalInteractions).toHaveLength(2)
    const duplicate = state.project.globalLayer.find(
      (item) => item.node.id === state.selectedNodeId,
    )!.node
    expect(state.project.globalInteractions.some((rule) => (
      rule.trigger.type === 'node.click' && rule.trigger.nodeId === duplicate.id
    ))).toBe(true)

    store.deleteNode(duplicate.id)
    state = useEditorStore.getState()
    expect(state.project.globalInteractions).toHaveLength(1)
    expect(state.project.globalInteractions[0]!.trigger).toEqual({
      type: 'node.click',
      nodeId: original.id,
    })

    store.selectNode(original.id)
    store.copySelectedNodes()
    store.pasteNodes()
    state = useEditorStore.getState()
    const pastedId = state.selectedNodeId!
    expect(state.project.globalInteractions).toHaveLength(2)
    expect(state.project.globalInteractions.some((rule) => (
      rule.trigger.type === 'node.click' && rule.trigger.nodeId === pastedId
    ))).toBe(true)
  })

  it('keeps scene copies in global scopes and removes deleted controller targets', () => {
    const store = useEditorStore.getState()
    store.addScene()
    const targetSceneId = useEditorStore.getState().activeSceneId
    store.addPresentationState('目标状态')
    const targetStateId = useEditorStore.getState().activePresentationStateId!
    const controller = useEditorStore.getState().project.globalLayer.find(
      (item) => item.node.type === 'teacher-controller',
    )!.node
    if (controller.type !== 'teacher-controller') throw new Error('缺少教师控制器')
    store.setEditingScope('global')
    store.updateNode(controller.id, {
      buttons: controller.buttons.map((button, index) => index === 0
        ? {
            ...button,
            action: {
              type: 'scene.go',
              sceneId: targetSceneId,
              targetStateId,
            },
          }
        : button),
    })
    store.addGlobalInteractionRule({
      id: 'target-scene-scope',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [{ type: 'scene.in', sceneIds: [targetSceneId] }],
      actions: [{
        id: 'target_scene_step',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'scene.next' },
      }],
    })

    store.duplicateScene(targetSceneId)
    const copiedSceneId = useEditorStore.getState().activeSceneId
    expect(useEditorStore.getState().project.globalInteractions[0]?.conditions)
      .toEqual([{ type: 'scene.in', sceneIds: [targetSceneId, copiedSceneId] }])

    expect(store.deleteScene(targetSceneId)).toBe(true)
    const project = useEditorStore.getState().project
    expect(project.globalInteractions[0]?.conditions).toEqual([
      { type: 'scene.in', sceneIds: [copiedSceneId] },
    ])
    const nextController = project.globalLayer.find(
      (item) => item.node.type === 'teacher-controller',
    )!.node
    if (nextController.type !== 'teacher-controller') throw new Error('缺少教师控制器')
    expect(nextController.buttons.some((button) => (
      button.action.type === 'scene.go' && button.action.sceneId === targetSceneId
    ))).toBe(false)
  })
})
