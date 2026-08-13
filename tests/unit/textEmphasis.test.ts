import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addPptxTextNode } from '@/renderer/export/pptxTextAndShape'
import { createProject, createTextNode } from '@/renderer/project/createProject'
import {
  createProjectArchive,
  openProjectArchive,
} from '@/renderer/project/projectArchive'
import {
  selectActiveScene,
  useEditorStore,
} from '@/renderer/store/editorStore'
import { materializeScene } from '@/shared/presentation'
import { projectDocumentSchema } from '@/shared/projectSchema'

function canvasContext(): CanvasRenderingContext2D {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Project V8 native text emphasis', () => {
  it('normalizes a missing V8 node default and preserves run-level semantics', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    const node = createTextNode({
      text: '春风',
      runs: [{ start: 0, end: 1, style: { emphasis: true } }],
    })
    Reflect.deleteProperty(node.style, 'emphasis')
    project.scenes[0]!.nodes.push(node)

    const parsed = projectDocumentSchema.parse(project)
    const restored = parsed.scenes[0]!.nodes[0]
    expect(restored).toMatchObject({
      type: 'text',
      style: { emphasis: false },
      runs: [{ start: 0, end: 1, style: { emphasis: true } }],
    })
  })

  it('stores node and run emphasis through a .h5lesson save/open round trip', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    project.scenes[0]!.nodes.push(createTextNode({
      text: '重点内容',
      runs: [{ start: 2, end: 4, style: { emphasis: false } }],
      style: { emphasis: true },
    }))

    const archive = createProjectArchive({
      project,
      assetFiles: {},
      componentFiles: {},
    })
    const restored = openProjectArchive(archive).project.scenes[0]!.nodes[0]

    expect(restored).toMatchObject({
      type: 'text',
      style: { emphasis: true },
      runs: [{ start: 2, end: 4, style: { emphasis: false } }],
    })
  })

  it('writes named-state emphasis through the same update and undo path', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = selectActiveScene(useEditorStore.getState()).nodes[0]!.id
    store.addPresentationState('着重状态')
    const stateId = useEditorStore.getState().activePresentationStateId!
    const historyBefore = useEditorStore.getState().history.past.length

    useEditorStore.getState().updateNode(nodeId, {
      runs: [{ start: 0, end: 2, style: { emphasis: false } }],
      style: { emphasis: true },
    })

    const scene = selectActiveScene(useEditorStore.getState())
    expect(scene.nodes[0]).toMatchObject({ style: { emphasis: false }, runs: [] })
    expect(materializeScene(scene, stateId).nodes[0]).toMatchObject({
      style: { emphasis: true },
      runs: [{ start: 0, end: 2, style: { emphasis: false } }],
    })
    expect(projectDocumentSchema.safeParse(useEditorStore.getState().project).success)
      .toBe(true)
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore + 1)

    useEditorStore.getState().undo()
    expect(materializeScene(
      selectActiveScene(useEditorStore.getState()),
      stateId,
    ).nodes[0]).toMatchObject({ style: { emphasis: false }, runs: [] })
  })

  it('commits a local emphasis command as one undoable and redoable text edit', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const node = selectActiveScene(useEditorStore.getState()).nodes[0]!
    if (node.type !== 'text') throw new Error('Expected text node')
    const historyBefore = useEditorStore.getState().history.past.length

    store.beginTextEdit(node.id, 'canvas')
    store.updateTextEditDraft(
      node.id,
      node.text,
      [{ start: 0, end: 2, style: { emphasis: true } }],
      node.height,
      node.width,
    )
    store.commitTextEdit()

    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      runs: [{ start: 0, end: 2, style: { emphasis: true } }],
    })
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore + 1)

    useEditorStore.getState().undo()
    expect(selectActiveScene(useEditorStore.getState()).nodes[0])
      .toMatchObject({ runs: [] })
    useEditorStore.getState().redo()
    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      runs: [{ start: 0, end: 2, style: { emphasis: true } }],
    })
  })

  it('keeps node and run emphasis when copying and pasting text', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = selectActiveScene(useEditorStore.getState()).nodes[0]!.id
    store.updateNode(nodeId, {
      runs: [{ start: 0, end: 2, style: { emphasis: false } }],
      style: { emphasis: true },
    })

    useEditorStore.getState().copySelectedNodes()
    useEditorStore.getState().pasteNodes()

    const pasted = selectActiveScene(useEditorStore.getState()).nodes[1]
    expect(pasted).toMatchObject({
      type: 'text',
      style: { emphasis: true },
      runs: [{ start: 0, end: 2, style: { emphasis: false } }],
    })
    expect(pasted?.id).not.toBe(nodeId)
  })

  it('rasterizes only visibly emphasized PPTX text nodes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasContext(),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,AA==',
    )
    const slide = {
      addImage: vi.fn(),
      addText: vi.fn(),
    }
    const scale = { x: 13.333 / 1280, y: 7.5 / 720 }

    addPptxTextNode(
      slide as never,
      createTextNode({ text: '着重', style: { emphasis: true } }),
      scale,
    )
    addPptxTextNode(
      slide as never,
      createTextNode({ text: '普通', style: { emphasis: false } }),
      scale,
    )
    addPptxTextNode(
      slide as never,
      createTextNode({
        text: '显式取消',
        runs: [{ start: 0, end: 4, style: { emphasis: false } }],
        style: { emphasis: true },
      }),
      scale,
    )

    expect(slide.addImage).toHaveBeenCalledTimes(1)
    expect(slide.addText).toHaveBeenCalledTimes(2)
  })
})
