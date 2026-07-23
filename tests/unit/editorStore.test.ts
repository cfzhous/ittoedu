import { beforeEach, describe, expect, it } from 'vitest'
import type { ComponentPackageData } from '@/shared/componentTypes'
import { MAX_PROJECT_SCENES, MAX_SCENE_NODES } from '@/shared/constants'
import type { AssetMeta } from '@/shared/projectTypes'
import { materializeScene } from '@/shared/presentation'
import {
  createExternalComponentNode,
  createImageNode,
  createScene,
  createTextNode,
} from '@/renderer/project/createProject'
import {
  selectActiveScene,
  selectEditingNodes,
  useEditorStore,
} from '@/renderer/store/editorStore'

const imageMeta: AssetMeta = {
  id: 'asset_lesson_image',
  filename: 'lesson.png',
  mimeType: 'image/png',
  kind: 'image',
  path: 'assets/asset_lesson_image.png',
  byteLength: 4,
  width: 1920,
  height: 1080,
}

function sampleComponent(): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 1,
      runtimeApiVersion: 1,
      id: 'com.example.counter',
      name: '计数器',
      version: '1.0.0',
      entry: 'runtime.js',
      defaultSize: { width: 480, height: 280 },
      minSize: { width: 160, height: 100 },
      preserveAspectRatio: true,
      assets: {},
      defaultProps: { initialValue: 3 },
    },
    runtimeSource:
      "window.CoursewareComponent.define({id:'com.example.counter',runtimeApiVersion:1,create:function(){return {destroy:function(){}}}})",
    files: {
      'manifest.json': new Uint8Array([1]),
      'runtime.js': new Uint8Array([2]),
    },
  }
}

function activeScene() {
  return selectActiveScene(useEditorStore.getState())
}

function visualBounds(node: {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}) {
  const radians = (node.rotation * Math.PI) / 180
  const cosine = Math.abs(Math.cos(radians))
  const sine = Math.abs(Math.sin(radians))
  const width = node.width * cosine + node.height * sine
  const height = node.width * sine + node.height * cosine
  const centerX = node.x + node.width / 2
  const centerY = node.y + node.height / 2
  return {
    left: centerX - width / 2,
    right: centerX + width / 2,
    top: centerY - height / 2,
    bottom: centerY + height / 2,
    centerX,
    centerY,
  }
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

describe('scene operations', () => {
  it('adds scenes, switches to the new scene, and records each addition', () => {
    const store = useEditorStore.getState()
    store.addScene()
    store.addScene()

    const state = useEditorStore.getState()
    expect(state.project.scenes.map((scene) => scene.name)).toEqual([
      '场景 1',
      '场景 2',
      '场景 3',
    ])
    expect(state.activeSceneId).toBe(state.project.scenes[2]!.id)
    expect(state.history.past).toHaveLength(2)
    expect(state.dirty).toBe(true)
  })

  it('never deletes the final scene and does not create a no-op history entry', () => {
    const initial = useEditorStore.getState()
    const onlySceneId = initial.project.scenes[0]!.id

    expect(initial.deleteScene(onlySceneId)).toBe(false)
    expect(useEditorStore.getState().project.scenes).toHaveLength(1)
    expect(useEditorStore.getState().history.past).toHaveLength(0)
    expect(useEditorStore.getState().dirty).toBe(false)
  })

  it('renames, recolours, reorders, and deletes scenes with undoable commits', () => {
    const store = useEditorStore.getState()
    const firstId = store.project.scenes[0]!.id
    store.addScene()
    const secondId = useEditorStore.getState().project.scenes[1]!.id
    store.addScene()
    const thirdId = useEditorStore.getState().project.scenes[2]!.id

    store.updateScene(secondId, {
      name: '  练习场景  ',
      backgroundColor: '#f3f4f6',
    })
    expect(
      useEditorStore.getState().project.scenes.find((scene) => scene.id === secondId),
    ).toMatchObject({
      name: '练习场景',
      backgroundColor: '#f3f4f6',
    })

    store.reorderScenes([thirdId, firstId, secondId])
    expect(useEditorStore.getState().project.scenes.map((scene) => scene.id)).toEqual([
      thirdId,
      firstId,
      secondId,
    ])

    store.setActiveScene(thirdId)
    expect(store.deleteScene(thirdId)).toBe(true)
    const state = useEditorStore.getState()
    expect(state.project.scenes.map((scene) => scene.id)).toEqual([firstId, secondId])
    expect(state.activeSceneId).toBe(firstId)
  })

  it('ignores invalid reorder requests without changing history', () => {
    const store = useEditorStore.getState()
    store.addScene()
    const historyLength = useEditorStore.getState().history.past.length
    const sceneIds = useEditorStore
      .getState()
      .project.scenes.map((scene) => scene.id)

    store.reorderScenes([sceneIds[0]!, sceneIds[0]!])
    expect(useEditorStore.getState().project.scenes.map((scene) => scene.id)).toEqual(
      sceneIds,
    )
    expect(useEditorStore.getState().history.past).toHaveLength(historyLength)
  })

  it('keeps a high defensive scene limit without the former 30-scene product cap', () => {
    const store = useEditorStore.getState()
    const scenes = Array.from(
      { length: MAX_PROJECT_SCENES },
      (_, index) => createScene(`场景 ${index + 1}`),
    )
    useEditorStore.setState((state) => ({
      project: { ...state.project, scenes },
      activeSceneId: scenes[0]!.id,
    }))
    store.addScene()

    const state = useEditorStore.getState()
    expect(state.project.scenes).toHaveLength(MAX_PROJECT_SCENES)
    expect(state.errorMessage).toContain(`${MAX_PROJECT_SCENES} 个场景上限`)
  })

  it('duplicates a scene with independent scene and node identities', () => {
    const store = useEditorStore.getState()
    const sourceId = store.project.scenes[0]!.id
    store.addTextNode(80, 90)
    store.addRectangleNode(320, 240)
    const sourceTextId = activeScene().nodes[0]!.id
    useEditorStore.setState((state) => ({
      project: {
        ...state.project,
        scenes: state.project.scenes.map((scene) => scene.id === sourceId
          ? {
              ...scene,
              runtime: {
                runtimeApiVersion: 1,
                enabled: true,
                renderMode: 'phaser',
                source: 'CoursewareRuntime.define({runtimeApiVersion:1,create(){return{destroy(){}}}})',
                content: { values: {} },
                assets: {},
                nodeBindings: { titleTarget: sourceTextId },
              },
            }
          : scene),
      },
    }))
    const sourceNodes = activeScene().nodes.map((node) => structuredClone(node))
    const historyBeforeDuplicate = useEditorStore.getState().history.past.length

    store.duplicateScene(sourceId)

    const state = useEditorStore.getState()
    const source = state.project.scenes[0]!
    const copy = state.project.scenes[1]!
    expect(copy).toMatchObject({ name: `${source.name} 副本` })
    expect(copy.id).not.toBe(source.id)
    expect(copy.nodes.map((node) => node.id)).not.toEqual(
      source.nodes.map((node) => node.id),
    )
    expect(copy.nodes.map(({ id: _id, ...node }) => node)).toEqual(
      sourceNodes.map(({ id: _id, ...node }) => node),
    )
    expect(copy.runtime?.nodeBindings?.titleTarget).toBe(copy.nodes[0]!.id)
    expect(copy.runtime?.nodeBindings?.titleTarget).not.toBe(sourceTextId)
    expect(state.activeSceneId).toBe(copy.id)
    expect(state.selectedNodeIds).toEqual([])
    expect(state.history.past).toHaveLength(historyBeforeDuplicate + 1)

    const copiedText = copy.nodes.find((node) => node.type === 'text')
    expect(copiedText).toBeDefined()
    store.updateNode(copiedText!.id, { text: '副本独立修改' })
    expect(
      useEditorStore.getState().project.scenes[0]!.nodes.find(
        (node) => node.type === 'text',
      ),
    ).toMatchObject({ text: '双击编辑文字' })
  })

  it('rewrites a duplicated scene self-entry while preserving its valid state target', () => {
    const store = useEditorStore.getState()
    const sourceSceneId = activeScene().id
    store.addPresentationState('完成')
    const targetStateId = useEditorStore.getState().activePresentationStateId!
    store.addInteractionRule(sourceSceneId, {
      id: 'reenter-complete',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: 'reenter-complete-step',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'scene.go',
          sceneId: sourceSceneId,
          targetStateId,
        },
      }],
    })

    store.duplicateScene(sourceSceneId)

    const copy = activeScene()
    expect(copy.interactions[0]!.actions[0]).toEqual({
      id: expect.stringMatching(/^action_/),
      start: 'after-previous',
      delayMs: 0,
      action: {
        type: 'scene.go',
        sceneId: copy.id,
        targetStateId,
      },
    })
    expect(copy.presentation?.states.some((state) => state.id === targetStateId))
      .toBe(true)
  })
})

describe('animation completion dependency cleanup', () => {
  it('cascades through second-order completion rules when the source rule is deleted', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const sceneId = activeScene().id
    const nodeId = activeScene().nodes[0]!.id
    store.addInteractionRule(sceneId, {
      id: 'motion-source',
      name: '显示标题',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: 'motion-source-action',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'node.enter',
          nodeId,
          effect: 'fade',
          durationMs: 320,
          easing: 'ease-out',
        },
      }],
    })
    store.addInteractionRule(sceneId, {
      id: 'first-dependent',
      name: '入场完成后退出',
      enabled: true,
      trigger: {
        type: 'animation.completed',
        actionId: 'motion-source-action',
      },
      conditions: [],
      actions: [{
        id: 'first-dependent-action',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'node.exit',
          nodeId,
          effect: 'fade',
          durationMs: 240,
          easing: 'ease-in',
        },
      }],
    })
    store.addInteractionRule(sceneId, {
      id: 'second-dependent',
      name: '退场完成后翻页',
      enabled: true,
      trigger: {
        type: 'animation.completed',
        actionId: 'first-dependent-action',
      },
      conditions: [],
      actions: [{
        id: 'second-dependent-action',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'scene.next' },
      }],
    })
    store.addInteractionRule(sceneId, {
      id: 'unrelated',
      name: '无关规则',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: 'unrelated-action',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'audio.toggle-mute', target: { kind: 'all' } },
      }],
    })

    store.deleteInteractionRule(sceneId, 'motion-source')

    expect(activeScene().interactions.map((rule) => rule.id)).toEqual([
      'unrelated',
    ])
    store.undo()
    expect(activeScene().interactions.map((rule) => rule.id)).toEqual([
      'motion-source',
      'first-dependent',
      'second-dependent',
      'unrelated',
    ])
  })
})

describe('node operations', () => {
  it('adds text, rectangle, and image nodes with their required defaults', () => {
    const store = useEditorStore.getState()
    store.addTextNode(100, 120)
    store.addRectangleNode(220, 240)
    store.addImageNode(imageMeta, new Uint8Array([1, 2, 3, 4]), 30, 40)

    const nodes = activeScene().nodes
    expect(nodes.map((node) => node.type)).toEqual(['text', 'shape', 'image'])
    expect(nodes[0]).toMatchObject({ x: 100, y: 120, text: '双击编辑文字' })
    expect(nodes[1]).toMatchObject({
      type: 'shape',
      shapeType: 'rectangle',
      x: 220,
      y: 240,
    })
    expect(nodes[2]).toMatchObject({
      x: 30,
      y: 40,
      width: 640,
      height: 360,
      assetId: imageMeta.id,
      preserveAspectRatio: true,
    })
    expect(useEditorStore.getState().selectedNodeId).toBe(nodes[2]!.id)
  })

  it('keeps newly dropped nodes at least 20px inside the visible canvas edge', () => {
    const store = useEditorStore.getState()
    store.addRectangleNode(1279, 719)
    store.addTextNode(-900, -900)

    const [rectangle, text] = activeScene().nodes
    expect(rectangle).toMatchObject({ x: 1260, y: 700 })
    expect(text).toMatchObject({
      x: -380,
      y: -60,
      width: 400,
      height: 80,
    })
  })

  it('keeps a high defensive node limit without the former 100-node product cap', () => {
    const store = useEditorStore.getState()
    const nodes = Array.from(
      { length: MAX_SCENE_NODES },
      () => createTextNode(),
    )
    useEditorStore.setState((state) => ({
      project: {
        ...state.project,
        scenes: state.project.scenes.map((scene, index) =>
          index === 0 ? { ...scene, nodes } : scene,
        ),
      },
    }))
    store.addRectangleNode()

    expect(activeScene().nodes).toHaveLength(MAX_SCENE_NODES)
    expect(useEditorStore.getState().errorMessage).toContain(`${MAX_SCENE_NODES} 个节点上限`)
  })

  it('deletes a selected node and undo restores it', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = activeScene().nodes[0]!.id
    store.deleteNode(nodeId)
    expect(activeScene().nodes).toHaveLength(0)
    expect(useEditorStore.getState().selectedNodeId).toBeNull()

    store.undo()
    expect(activeScene().nodes).toHaveLength(1)
    expect(activeScene().nodes[0]!.id).toBe(nodeId)
  })

  it('commits a completed drag/resize as exactly one history step', () => {
    const store = useEditorStore.getState()
    store.addRectangleNode()
    const nodeId = activeScene().nodes[0]!.id
    const historyBeforeCommit = useEditorStore.getState().history.past.length

    // Phaser pointermove is view-only; pointerup supplies one final Store patch.
    store.updateNode(nodeId, {
      x: 123.5,
      y: 234.5,
      width: 456,
      height: 222,
    })

    expect(useEditorStore.getState().history.past).toHaveLength(
      historyBeforeCommit + 1,
    )
    expect(activeScene().nodes[0]).toMatchObject({
      x: 123.5,
      y: 234.5,
      width: 456,
      height: 222,
    })
  })

  it('keeps a live text draft in the project and commits it as exactly one history step', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = activeScene().nodes[0]!.id
    const historyBeforeCommit = useEditorStore.getState().history.past.length

    store.beginTextEdit(nodeId, 'canvas')
    store.updateTextEditDraft(nodeId, '中', [], 80)
    store.updateTextEditDraft(nodeId, '中文文本', [], 80)
    store.updateTextEditDraft(nodeId, '中文文本\n第二行', [], 120)

    expect(activeScene().nodes[0]).toMatchObject({
      text: '中文文本\n第二行',
      height: 120,
    })
    expect(useEditorStore.getState().history.past).toHaveLength(
      historyBeforeCommit,
    )

    store.commitTextEdit()

    expect(useEditorStore.getState().history.past).toHaveLength(
      historyBeforeCommit + 1,
    )
    expect(activeScene().nodes[0]).toMatchObject({
      text: '中文文本\n第二行',
      height: 120,
    })

    store.undo()
    expect(activeScene().nodes[0]).toMatchObject({ text: '双击编辑文字' })
    store.redo()
    expect(activeScene().nodes[0]).toMatchObject({ text: '中文文本\n第二行' })
  })

  it('cancels a text transaction without adding history or leaving the project dirty', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = activeScene().nodes[0]!.id
    store.markSaved('lesson.h5lesson')
    const historyBefore = useEditorStore.getState().history.past.length

    store.beginTextEdit(nodeId, 'properties')
    store.updateTextEditDraft(nodeId, '应被取消', [], 96)
    expect(activeScene().nodes[0]).toMatchObject({ text: '应被取消' })
    store.cancelTextEdit()

    expect(activeScene().nodes[0]).toMatchObject({
      text: '双击编辑文字',
      height: 80,
    })
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore)
    expect(useEditorStore.getState().dirty).toBe(false)
    expect(useEditorStore.getState().textEditSession).toBeNull()
  })

  it('deterministically commits text before switching nodes or scenes', () => {
    const store = useEditorStore.getState()
    const firstSceneId = store.activeSceneId
    store.addTextNode()
    const textId = activeScene().nodes[0]!.id
    store.addRectangleNode()
    const rectangleId = activeScene().nodes[1]!.id
    const historyBeforeNodeSwitch = useEditorStore.getState().history.past.length

    store.selectNode(textId)
    store.beginTextEdit(textId, 'canvas')
    store.updateTextEditDraft(textId, '切换后仍保留', [], 80)
    store.selectNode(rectangleId)

    expect(useEditorStore.getState().history.past).toHaveLength(
      historyBeforeNodeSwitch + 1,
    )
    expect(activeScene().nodes[0]).toMatchObject({ text: '切换后仍保留' })
    expect(useEditorStore.getState().textEditSession).toBeNull()

    store.addScene()
    const secondSceneId = useEditorStore.getState().activeSceneId
    store.setActiveScene(firstSceneId)
    store.selectNode(textId)
    store.beginTextEdit(textId, 'properties')
    store.updateTextEditDraft(textId, '切场景前提交', [], 80)
    store.setActiveScene(secondSceneId)

    expect(
      useEditorStore.getState().project.scenes[0]!.nodes[0],
    ).toMatchObject({ text: '切场景前提交' })
    expect(useEditorStore.getState().textEditSession).toBeNull()
  })

  it('finalizes the current text draft when a save is marked complete', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = activeScene().nodes[0]!.id
    const historyBefore = useEditorStore.getState().history.past.length

    store.beginTextEdit(nodeId, 'canvas')
    store.updateTextEditDraft(nodeId, '保存时的当前文字', [], 80)
    store.markSaved('saved-draft.h5lesson')

    expect(activeScene().nodes[0]).toMatchObject({ text: '保存时的当前文字' })
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore + 1)
    expect(useEditorStore.getState().textEditSession).toBeNull()
    expect(useEditorStore.getState().dirty).toBe(false)
  })

  it('reorders nodes using scene.nodes as the only layer order', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    store.addRectangleNode()
    const [text, rectangle] = activeScene().nodes
    store.reorderNodes([rectangle!.id, text!.id])

    expect(activeScene().nodes.map((node) => node.id)).toEqual([
      rectangle!.id,
      text!.id,
    ])
    store.undo()
    expect(activeScene().nodes.map((node) => node.id)).toEqual([
      text!.id,
      rectangle!.id,
    ])
  })

  it('keeps imported image bytes and metadata when adding its node is undone', () => {
    const store = useEditorStore.getState()
    store.addImageNode(imageMeta, new Uint8Array([1, 2, 3, 4]))
    store.undo()

    const state = useEditorStore.getState()
    expect(activeScene().nodes).toHaveLength(0)
    expect(state.project.assets[imageMeta.id]).toEqual(imageMeta)
    expect([...state.assetFiles[imageMeta.id]!]).toEqual([1, 2, 3, 4])
  })

  it('imports an external component outside history and makes node addition undoable', () => {
    const store = useEditorStore.getState()
    const component = sampleComponent()
    store.importComponentPackage(component)
    expect(useEditorStore.getState().history.past).toHaveLength(0)

    store.addExternalComponentNode(component.manifest.id, 350, 210)
    const node = activeScene().nodes[0]
    expect(node).toMatchObject({
      type: 'external-component',
      x: 350,
      y: 210,
      width: 480,
      height: 280,
      component: {
        packageId: 'com.example.counter',
        version: '1.0.0',
      },
      props: { initialValue: 3 },
    })

    store.undo()
    expect(activeScene().nodes).toHaveLength(0)
    expect(
      useEditorStore.getState().project.componentPackages['com.example.counter'],
    ).toBeDefined()
    expect(
      useEditorStore.getState().componentPackages['com.example.counter'],
    ).toBeDefined()
  })

  it('rejects a second version of the same component ID without corrupting references', () => {
    const store = useEditorStore.getState()
    const first = sampleComponent()
    store.importComponentPackage(first)
    store.addExternalComponentNode(first.manifest.id)

    const second = sampleComponent()
    second.manifest.version = '2.0.0'
    expect(() => store.importComponentPackage(second)).toThrow(
      '不能再导入同 ID',
    )

    const state = useEditorStore.getState()
    expect(state.componentPackages[first.manifest.id]?.manifest.version).toBe(
      '1.0.0',
    )
    expect(activeScene().nodes[0]).toMatchObject({
      component: { packageId: first.manifest.id, version: '1.0.0' },
    })
  })
})

describe('scene presentation states', () => {
  it('normalizes legacy scenes and enters the authored initial state when run mode starts', () => {
    const project = useEditorStore.getState().project
    delete project.scenes[0]!.presentation
    useEditorStore.getState().loadProject(project, null)

    const initialId = activeScene().presentation!.initialStateId
    expect(activeScene().presentation?.states).toHaveLength(1)
    expect(useEditorStore.getState().activePresentationStateId).toBeNull()

    useEditorStore.getState().setCanvasMode('run')
    expect(useEditorStore.getState()).toMatchObject({
      canvasMode: 'run',
      activePresentationStateId: initialId,
    })
    useEditorStore.getState().setCanvasMode('edit')
    expect(useEditorStore.getState().activePresentationStateId).toBe(initialId)
    useEditorStore.getState().setActivePresentationState(null)
    expect(useEditorStore.getState()).toMatchObject({
      canvasMode: 'edit',
      activePresentationStateId: null,
    })
  })

  it('stores state edits as overrides while keeping the canonical base editable', () => {
    const store = useEditorStore.getState()
    store.addTextNode(80, 90)
    const nodeId = activeScene().nodes[0]!.id
    store.addPresentationState('答错')
    const stateId = useEditorStore.getState().activePresentationStateId!
    const historyBeforeEdit = useEditorStore.getState().history.past.length

    useEditorStore.getState().updateNode(nodeId, {
      x: 420,
      text: '请再试一次',
      style: { color: '#ef4444' },
    })

    const scene = activeScene()
    expect(scene.nodes[0]).toMatchObject({
      x: 80,
      text: '双击编辑文字',
      style: { color: '#1f2937' },
    })
    expect(materializeScene(scene, stateId).nodes[0]).toMatchObject({
      x: 420,
      text: '请再试一次',
      style: { color: '#ef4444' },
    })
    expect(scene.presentation?.states.find((state) => state.id === stateId)
      ?.nodeOverrides[nodeId]).toMatchObject({
      x: 420,
      text: '请再试一次',
      style: { color: '#ef4444' },
    })
    expect(useEditorStore.getState().history.past).toHaveLength(historyBeforeEdit + 1)

    useEditorStore.getState().undo()
    expect(materializeScene(activeScene(), stateId).nodes[0]).toMatchObject({
      x: 80,
      text: '双击编辑文字',
    })
  })

  it('never lets base or state property patches rewrite stable node identity', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = activeScene().nodes[0]!.id

    store.updateNode(nodeId, { id: 'replacement', type: 'image' } as never)
    expect(activeScene().nodes[0]).toMatchObject({ id: nodeId, type: 'text' })

    store.addPresentationState('状态')
    const stateId = useEditorStore.getState().activePresentationStateId!
    useEditorStore.getState().updateNode(nodeId, {
      id: 'state-replacement',
      type: 'shape',
      x: 404,
    } as never)
    expect(materializeScene(activeScene(), stateId).nodes[0]).toMatchObject({
      id: nodeId,
      type: 'text',
      x: 404,
    })
  })

  it('adds and deletes nodes locally in a state without destroying the base identity', () => {
    const store = useEditorStore.getState()
    store.addPresentationState('反馈')
    const stateId = useEditorStore.getState().activePresentationStateId!
    useEditorStore.getState().addRectangleNode(120, 140)
    const sceneAfterAdd = activeScene()
    const nodeId = sceneAfterAdd.nodes[0]!.id

    expect(sceneAfterAdd.nodes[0]).toMatchObject({ visible: false })
    expect(materializeScene(sceneAfterAdd, stateId).nodes[0]).toMatchObject({
      visible: true,
      x: 120,
      y: 140,
    })

    useEditorStore.getState().deleteNode(nodeId)
    expect(activeScene().nodes).toHaveLength(1)
    expect(materializeScene(activeScene(), stateId).nodes[0]).toMatchObject({
      visible: false,
    })

    useEditorStore.getState().setActivePresentationState(null)
    useEditorStore.getState().deleteNode(nodeId)
    expect(activeScene().nodes).toHaveLength(0)
    expect(Object.values(activeScene().presentation?.states[1]?.nodeOverrides ?? {}))
      .toHaveLength(0)
  })

  it('commits text editing in a state as one undoable override transaction', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = activeScene().nodes[0]!.id
    store.addPresentationState('完成')
    const stateId = useEditorStore.getState().activePresentationStateId!
    const historyBefore = useEditorStore.getState().history.past.length

    useEditorStore.getState().beginTextEdit(nodeId, 'properties')
    useEditorStore.getState().updateTextEditDraft(nodeId, '状态文字', [], 96)
    expect(selectEditingNodes(useEditorStore.getState())[0]).toMatchObject({
      text: '状态文字',
      height: 96,
    })
    expect(activeScene().nodes[0]).toMatchObject({ text: '双击编辑文字', height: 80 })
    useEditorStore.getState().commitTextEdit()

    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore + 1)
    expect(materializeScene(activeScene(), stateId).nodes[0]).toMatchObject({
      text: '状态文字',
      height: 96,
    })
    useEditorStore.getState().undo()
    expect(materializeScene(activeScene(), stateId).nodes[0]).toMatchObject({
      text: '双击编辑文字',
      height: 80,
    })
  })

  it('rewrites override node ids when duplicating a scene', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    store.addRectangleNode()
    const sourceSceneId = activeScene().id
    const [sourceNodeId, sourceBackNodeId] = activeScene().nodes.map((node) => node.id)
    store.addPresentationState('正确')
    const stateId = useEditorStore.getState().activePresentationStateId!
    useEditorStore.getState().updateNode(sourceNodeId!, { x: 640, visible: false })
    useEditorStore.getState().reorderNodes([sourceBackNodeId!, sourceNodeId!])

    useEditorStore.getState().duplicateScene(sourceSceneId)
    const copy = activeScene()
    const [copyNodeId, copyBackNodeId] = copy.nodes.map((node) => node.id)
    const copiedState = copy.presentation?.states.find((state) => state.id === stateId)
    expect(copyNodeId).not.toBe(sourceNodeId)
    expect(copiedState?.nodeOverrides[copyNodeId!]).toMatchObject({
      x: 640,
      visible: false,
    })
    expect(copiedState?.nodeOverrides[sourceNodeId!]).toBeUndefined()
    expect(copiedState?.nodeOrder).toEqual([copyBackNodeId, copyNodeId])
  })

  it('keeps state ordering local, undoable, and cleans it when a base node is deleted', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    store.addRectangleNode()
    store.addShapeNode('ellipse')
    const baseOrder = activeScene().nodes.map((node) => node.id)
    store.addPresentationState('分层')
    const stateId = useEditorStore.getState().activePresentationStateId!
    const stateOrder = [baseOrder[2]!, baseOrder[0]!, baseOrder[1]!]

    useEditorStore.getState().updateNode(baseOrder[0]!, { x: 777 })
    useEditorStore.getState().reorderNodes(stateOrder)
    expect(activeScene().nodes.map((node) => node.id)).toEqual(baseOrder)
    expect(materializeScene(activeScene(), stateId).nodes.map((node) => node.id))
      .toEqual(stateOrder)

    useEditorStore.getState().undo()
    expect(materializeScene(activeScene(), stateId).nodes.map((node) => node.id))
      .toEqual(baseOrder)
    useEditorStore.getState().redo()
    expect(materializeScene(activeScene(), stateId).nodes.map((node) => node.id))
      .toEqual(stateOrder)

    useEditorStore.getState().reorderNodes(baseOrder)
    expect(activeScene().presentation?.states.find((state) => state.id === stateId)
      ?.nodeOrder).toBeUndefined()
    useEditorStore.getState().reorderNodes(stateOrder)

    useEditorStore.getState().setActivePresentationState(null)
    useEditorStore.getState().deleteNode(baseOrder[0]!)
    const presentationState = activeScene().presentation?.states.find(
      (state) => state.id === stateId,
    )
    expect(presentationState?.nodeOverrides[baseOrder[0]!]).toBeUndefined()
    expect(presentationState?.nodeOrder).toEqual([baseOrder[2], baseOrder[1]])
    useEditorStore.getState().undo()
    expect(activeScene().nodes.map((node) => node.id)).toEqual(baseOrder)
    expect(activeScene().presentation?.states.find((state) => state.id === stateId))
      .toMatchObject({
        nodeOverrides: { [baseOrder[0]!]: { x: 777 } },
        nodeOrder: stateOrder,
      })
  })

  it('falls back to the runtime initial state when the active thumbnail state is deleted', () => {
    const store = useEditorStore.getState()
    store.addPresentationState('运行初始')
    const initialId = useEditorStore.getState().activePresentationStateId!
    useEditorStore.getState().addPresentationState('缩略图')
    const thumbnailId = useEditorStore.getState().activePresentationStateId!
    useEditorStore.getState().setInitialPresentationState(initialId)
    useEditorStore.getState().setThumbnailPresentationState(thumbnailId)

    expect(useEditorStore.getState().deletePresentationState(thumbnailId)).toBe(true)
    expect(useEditorStore.getState().activePresentationStateId).toBe(initialId)
    expect(activeScene().presentation).toMatchObject({
      initialStateId: initialId,
      thumbnailStateId: initialId,
    })

    useEditorStore.getState().undo()
    expect(activeScene().presentation?.states.some((state) => state.id === thumbnailId))
      .toBe(true)
    useEditorStore.getState().redo()
    expect(activeScene().presentation?.states.some((state) => state.id === thumbnailId))
      .toBe(false)
  })

  it('falls cross-scene entry rules back to the target initial state when a state is deleted', () => {
    const store = useEditorStore.getState()
    const sourceSceneId = activeScene().id
    store.addScene()
    const targetSceneId = activeScene().id
    store.addPresentationState('详情')
    const targetStateId = useEditorStore.getState().activePresentationStateId!
    store.setActiveScene(sourceSceneId)
    store.addInteractionRule(sourceSceneId, {
      id: 'go-to-detail',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: 'go-to-detail-step',
        start: 'after-previous',
        delayMs: 0,
        action: {
          type: 'scene.go',
          sceneId: targetSceneId,
          targetStateId,
        },
      }],
    })

    store.setActiveScene(targetSceneId)
    expect(store.deletePresentationState(targetStateId)).toBe(true)
    const sourceRule = useEditorStore.getState().project.scenes.find(
      (scene) => scene.id === sourceSceneId,
    )!.interactions[0]!
    expect(sourceRule.actions[0]).toEqual({
      id: 'go-to-detail-step',
      start: 'after-previous',
      delayMs: 0,
      action: {
        type: 'scene.go',
        sceneId: targetSceneId,
      },
    })

    store.undo()
    const restoredRule = useEditorStore.getState().project.scenes.find(
      (scene) => scene.id === sourceSceneId,
    )!.interactions[0]!
    expect(restoredRule.actions[0]!.action).toMatchObject({ targetStateId })
  })
})

describe('multi-selection operations', () => {
  it('duplicates each selected node with its own click mappings exactly once', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    store.addRectangleNode()
    const sceneId = activeScene().id
    const sourceIds = activeScene().nodes.map((node) => node.id)
    sourceIds.forEach((nodeId, index) => store.addInteractionRule(sceneId, {
      id: `click-rule-${index}`,
      name: `映射 ${index + 1}`,
      enabled: true,
      trigger: { type: 'node.click', nodeId },
      conditions: [],
      actions: [{
        id: `click-rule-step-${index}`,
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'scene.next' },
      }],
    }))
    store.addInteractionRule(sceneId, {
      id: 'scene-enter-rule',
      name: '场景自动化',
      enabled: true,
      trigger: { type: 'scene.enter' },
      conditions: [],
      actions: [{
        id: 'scene-enter-step',
        start: 'after-previous',
        delayMs: 0,
        action: { type: 'audio.toggle-mute', target: { kind: 'all' } },
      }],
    })
    store.selectNodes(sourceIds)

    store.duplicateSelectedNodes()

    const copiedIds = useEditorStore.getState().selectedNodeIds
    const clickRules = activeScene().interactions.filter(
      (rule) => rule.trigger.type === 'node.click',
    )
    expect(copiedIds).toHaveLength(2)
    expect(clickRules).toHaveLength(4)
    copiedIds.forEach((nodeId, index) => {
      expect(clickRules).toContainEqual(expect.objectContaining({
        id: expect.stringMatching(/^rule_/),
        name: `映射 ${index + 1}`,
        trigger: { type: 'node.click', nodeId },
      }))
    })
    expect(activeScene().interactions.filter(
      (rule) => rule.trigger.type === 'scene.enter',
    )).toHaveLength(1)

    store.undo()
    expect(activeScene().nodes.map((node) => node.id)).toEqual(sourceIds)
    expect(activeScene().interactions.filter(
      (rule) => rule.trigger.type === 'node.click',
    )).toHaveLength(2)
  })

  it('supports additive toggling and filters invalid or duplicate selection IDs', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    store.addRectangleNode()
    store.addShapeNode('ellipse')
    const [text, rectangle, ellipse] = activeScene().nodes

    store.selectNode(text!.id)
    store.selectNode(rectangle!.id, true)
    expect(useEditorStore.getState().selectedNodeIds).toEqual([
      text!.id,
      rectangle!.id,
    ])
    expect(useEditorStore.getState().selectedNodeId).toBe(rectangle!.id)

    store.selectNode(text!.id, true)
    expect(useEditorStore.getState().selectedNodeIds).toEqual([rectangle!.id])
    store.selectNodes([text!.id, 'missing-node', ellipse!.id, text!.id])
    expect(useEditorStore.getState().selectedNodeIds).toEqual([
      text!.id,
      ellipse!.id,
    ])
    expect(useEditorStore.getState().selectedNodeId).toBe(ellipse!.id)
  })

  it.each(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const)(
    'aligns the selected nodes to %s in one history step',
    (mode) => {
      const store = useEditorStore.getState()
      store.addRectangleNode()
      store.addRectangleNode()
      store.addRectangleNode()
      const ids = activeScene().nodes.map((node) => node.id)
      store.updateNodes([
        { nodeId: ids[0]!, patch: { x: 40, y: 50, width: 100, height: 80 } },
        { nodeId: ids[1]!, patch: { x: 320, y: 190, width: 160, height: 120 } },
        { nodeId: ids[2]!, patch: { x: 760, y: 430, width: 200, height: 160 } },
      ])
      store.selectNodes(ids)
      const historyBefore = useEditorStore.getState().history.past.length

      store.alignSelection(mode)

      const nodes = activeScene().nodes
      const alignedValues = nodes.map((node) => {
        if (mode === 'left') return node.x
        if (mode === 'center') return node.x + node.width / 2
        if (mode === 'right') return node.x + node.width
        if (mode === 'top') return node.y
        if (mode === 'middle') return node.y + node.height / 2
        return node.y + node.height
      })
      for (const value of alignedValues.slice(1)) {
        expect(value).toBeCloseTo(alignedValues[0]!)
      }
      expect(useEditorStore.getState().history.past).toHaveLength(historyBefore + 1)
    },
  )

  it.each(['horizontal', 'vertical'] as const)(
    'distributes three selected nodes with equal %s gaps',
    (axis) => {
      const store = useEditorStore.getState()
      store.addRectangleNode()
      store.addRectangleNode()
      store.addRectangleNode()
      const ids = activeScene().nodes.map((node) => node.id)
      store.updateNodes([
        { nodeId: ids[0]!, patch: { x: 20, y: 30, width: 100, height: 60 } },
        { nodeId: ids[1]!, patch: { x: 340, y: 260, width: 140, height: 100 } },
        { nodeId: ids[2]!, patch: { x: 940, y: 570, width: 200, height: 120 } },
      ])
      store.selectNodes(ids)
      const before = activeScene().nodes.map((node) => ({
        x: node.x,
        y: node.y,
      }))

      store.distributeSelection(axis)

      const [first, middle, last] = activeScene().nodes
      const firstGap = axis === 'horizontal'
        ? middle!.x - (first!.x + first!.width)
        : middle!.y - (first!.y + first!.height)
      const secondGap = axis === 'horizontal'
        ? last!.x - (middle!.x + middle!.width)
        : last!.y - (middle!.y + middle!.height)
      expect(firstGap).toBeCloseTo(secondGap)
      expect(axis === 'horizontal' ? first!.x : first!.y).toBe(
        axis === 'horizontal' ? before[0]!.x : before[0]!.y,
      )
      expect(axis === 'horizontal' ? last!.x : last!.y).toBe(
        axis === 'horizontal' ? before[2]!.x : before[2]!.y,
      )
    },
  )

  it.each(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const)(
    'aligns 45-degree nodes by their visual %s boundary using translation only',
    (mode) => {
      const store = useEditorStore.getState()
      store.addRectangleNode()
      store.addRectangleNode()
      store.addRectangleNode()
      const ids = activeScene().nodes.map((node) => node.id)
      store.updateNodes([
        { nodeId: ids[0]!, patch: { x: 80, y: 70, width: 100, height: 60, rotation: 45 } },
        { nodeId: ids[1]!, patch: { x: 360, y: 240, width: 180, height: 90, rotation: 45 } },
        { nodeId: ids[2]!, patch: { x: 780, y: 420, width: 120, height: 200, rotation: 45 } },
      ])
      const before = activeScene().nodes.map((node) => ({ ...node }))
      const beforeBounds = before.map(visualBounds)
      const expected = mode === 'left'
        ? Math.min(...beforeBounds.map((bounds) => bounds.left))
        : mode === 'center'
          ? (
              Math.min(...beforeBounds.map((bounds) => bounds.left)) +
              Math.max(...beforeBounds.map((bounds) => bounds.right))
            ) / 2
          : mode === 'right'
            ? Math.max(...beforeBounds.map((bounds) => bounds.right))
            : mode === 'top'
              ? Math.min(...beforeBounds.map((bounds) => bounds.top))
              : mode === 'middle'
                ? (
                    Math.min(...beforeBounds.map((bounds) => bounds.top)) +
                    Math.max(...beforeBounds.map((bounds) => bounds.bottom))
                  ) / 2
                : Math.max(...beforeBounds.map((bounds) => bounds.bottom))
      store.selectNodes(ids)

      store.alignSelection(mode)

      const after = activeScene().nodes
      const anchors = after.map((node) => {
        const bounds = visualBounds(node)
        if (mode === 'left') return bounds.left
        if (mode === 'center') return bounds.centerX
        if (mode === 'right') return bounds.right
        if (mode === 'top') return bounds.top
        if (mode === 'middle') return bounds.centerY
        return bounds.bottom
      })
      for (const anchor of anchors) expect(anchor).toBeCloseTo(expected)
      after.forEach((node, index) => {
        expect(node).toMatchObject({
          width: before[index]!.width,
          height: before[index]!.height,
          rotation: 45,
        })
        if (mode === 'left' || mode === 'center' || mode === 'right') {
          expect(node.y).toBe(before[index]!.y)
        } else {
          expect(node.x).toBe(before[index]!.x)
        }
      })
    },
  )

  it.each(['horizontal', 'vertical'] as const)(
    'distributes 45-degree nodes with equal visual %s gaps using translation only',
    (axis) => {
      const store = useEditorStore.getState()
      store.addRectangleNode()
      store.addRectangleNode()
      store.addRectangleNode()
      const ids = activeScene().nodes.map((node) => node.id)
      store.updateNodes([
        { nodeId: ids[0]!, patch: { x: 60, y: 50, width: 100, height: 60, rotation: 45 } },
        { nodeId: ids[1]!, patch: { x: 380, y: 250, width: 180, height: 80, rotation: 45 } },
        { nodeId: ids[2]!, patch: { x: 900, y: 540, width: 120, height: 140, rotation: 45 } },
      ])
      store.selectNodes(ids)
      const before = activeScene().nodes.map((node) => ({ ...node }))
      const beforeSorted = [...before].sort((left, right) => {
        const leftBounds = visualBounds(left)
        const rightBounds = visualBounds(right)
        return axis === 'horizontal'
          ? leftBounds.left - rightBounds.left
          : leftBounds.top - rightBounds.top
      })

      store.distributeSelection(axis)

      const byId = new Map(activeScene().nodes.map((node) => [node.id, node]))
      const afterSorted = beforeSorted.map((node) => byId.get(node.id)!)
      const afterBounds = afterSorted.map(visualBounds)
      const gaps = afterBounds.slice(1).map((bounds, index) =>
        axis === 'horizontal'
          ? bounds.left - afterBounds[index]!.right
          : bounds.top - afterBounds[index]!.bottom,
      )
      expect(gaps[0]).toBeCloseTo(gaps[1]!)

      const firstBefore = beforeSorted[0]!
      const lastBefore = beforeSorted.at(-1)!
      const firstAfter = afterSorted[0]!
      const lastAfter = afterSorted.at(-1)!
      expect(axis === 'horizontal' ? firstAfter.x : firstAfter.y).toBeCloseTo(
        axis === 'horizontal' ? firstBefore.x : firstBefore.y,
      )
      expect(axis === 'horizontal' ? lastAfter.x : lastAfter.y).toBeCloseTo(
        axis === 'horizontal' ? lastBefore.x : lastBefore.y,
      )
      afterSorted.forEach((node) => {
        const original = before.find((item) => item.id === node.id)!
        expect(node).toMatchObject({
          width: original.width,
          height: original.height,
          rotation: 45,
        })
        if (axis === 'horizontal') expect(node.y).toBe(original.y)
        else expect(node.x).toBe(original.x)
      })
    },
  )

  it('copies a multi-selection snapshot and pastes independent unlocked nodes', () => {
    const store = useEditorStore.getState()
    store.addTextNode(100, 120)
    store.addRectangleNode(360, 280)
    const [text, shape] = activeScene().nodes
    store.updateNode(text!.id, { locked: true })
    store.selectNodes([text!.id, shape!.id])
    const historyBeforeCopy = useEditorStore.getState().history.past.length

    store.copySelectedNodes()
    expect(useEditorStore.getState().history.past).toHaveLength(historyBeforeCopy)
    expect(useEditorStore.getState().clipboardNodes).toHaveLength(2)

    store.updateNode(text!.id, { x: 600, text: '原节点已修改' })
    const historyBeforePaste = useEditorStore.getState().history.past.length
    store.pasteNodes()

    const state = useEditorStore.getState()
    const pasted = activeScene().nodes.slice(2)
    expect(pasted).toHaveLength(2)
    expect(pasted.map((node) => node.id)).toEqual(state.selectedNodeIds)
    expect(pasted[0]).toMatchObject({
      type: 'text',
      name: `${text!.name} 副本`,
      x: 120,
      y: 140,
      text: '双击编辑文字',
      locked: false,
    })
    expect(pasted[1]).toMatchObject({
      type: 'shape',
      name: `${shape!.name} 副本`,
      x: 380,
      y: 300,
      locked: false,
    })
    expect(new Set(activeScene().nodes.map((node) => node.id)).size).toBe(4)
    expect(state.history.past).toHaveLength(historyBeforePaste + 1)
  })
})

describe('history semantics', () => {
  it('stores incremental Immer patches rather than cloning the full long-course project', () => {
    const scenes = Array.from({ length: 120 }, (_, index) => createScene(`长课 ${index + 1}`))
    useEditorStore.setState((state) => ({
      project: { ...state.project, scenes },
      activeSceneId: scenes[0]!.id,
      history: { past: [], future: [] },
    }))

    useEditorStore.getState().updateScene(scenes[0]!.id, { name: '修改后的第一课' })

    const entry = useEditorStore.getState().history.past[0]!
    expect(entry.patches).toHaveLength(1)
    expect(entry.inversePatches).toHaveLength(1)
    expect(JSON.stringify(entry)).not.toContain('长课 120')
  })

  it('undoes an addition and redo restores it', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = activeScene().nodes[0]!.id

    store.undo()
    expect(activeScene().nodes).toHaveLength(0)
    expect(useEditorStore.getState().history.future).toHaveLength(1)

    store.redo()
    expect(activeScene().nodes[0]!.id).toBe(nodeId)
    expect(useEditorStore.getState().history.future).toHaveLength(0)
  })

  it('limits undo history to 50 entries and clears redo after a new commit', () => {
    const store = useEditorStore.getState()
    const sceneId = store.project.scenes[0]!.id
    for (let index = 0; index < 60; index += 1) {
      store.updateScene(sceneId, {
        backgroundColor: `#${index.toString(16).padStart(6, '0')}`,
      })
    }
    expect(useEditorStore.getState().history.past).toHaveLength(50)

    store.undo()
    store.undo()
    expect(useEditorStore.getState().history.future).toHaveLength(2)
    store.updateScene(sceneId, { name: '新提交' })
    expect(useEditorStore.getState().history.future).toHaveLength(0)
    expect(useEditorStore.getState().history.past).toHaveLength(49)
  })

  it('new and opened projects clear history while save keeps it', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const projectToLoad = structuredClone(useEditorStore.getState().project)
    expect(useEditorStore.getState().history.past).toHaveLength(1)

    store.markSaved('C:\\course.h5lesson')
    expect(useEditorStore.getState().history.past).toHaveLength(1)
    expect(useEditorStore.getState().dirty).toBe(false)

    store.loadProject(projectToLoad, 'C:\\course.h5lesson')
    expect(useEditorStore.getState().history.past).toHaveLength(0)
    store.addRectangleNode()
    store.createNewProject()
    expect(useEditorStore.getState().history.past).toHaveLength(0)
    expect(useEditorStore.getState().dirty).toBe(false)
  })
})

describe('factory compatibility', () => {
  it('supports the Store positional factory forms and protects component props', () => {
    const text = createTextNode(12, 34)
    const image = createImageNode('asset_large', 1920, 1080)
    const componentData = sampleComponent()
    const component = createExternalComponentNode(componentData.manifest)
    componentData.manifest.defaultProps.initialValue = 99

    expect(text).toMatchObject({ x: 12, y: 34, type: 'text' })
    expect(image).toMatchObject({
      width: 640,
      height: 360,
      x: 320,
      y: 180,
    })
    expect(component).toMatchObject({
      width: 480,
      height: 280,
      x: 400,
      y: 220,
      props: { initialValue: 3 },
    })
  })
})
