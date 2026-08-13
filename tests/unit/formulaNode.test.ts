import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPublishedLessonPayload } from '@/renderer/export/buildPublishedLesson'
import { collectExportPreflight } from '@/renderer/export/exportPreflight'
import {
  createFormulaNode,
  createProject,
} from '@/renderer/project/createProject'
import {
  createProjectArchive,
  openProjectArchive,
} from '@/renderer/project/projectArchive'
import {
  selectActiveScene,
  useEditorStore,
} from '@/renderer/store/editorStore'
import { publishedLessonToExportPayload } from '@/player/publishedLesson'
import { materializeScene } from '@/shared/presentation'
import {
  formulaAstSchema,
  projectDocumentSchema,
} from '@/shared/projectSchema'
import type { FormulaAstNode } from '@/shared/projectTypes'

const completeAst: FormulaAstNode = {
  type: 'row',
  children: [
    {
      type: 'fenced',
      open: '(',
      close: ')',
      body: {
        type: 'fraction',
        numerator: {
          type: 'root',
          index: { type: 'token', value: '3' },
          radicand: { type: 'token', value: 'x' },
        },
        denominator: {
          type: 'script',
          base: { type: 'token', value: 'y' },
          superscript: { type: 'token', value: '2' },
          subscript: { type: 'token', value: 'i' },
        },
      },
    },
    { type: 'operator', value: '=' },
    { type: 'token', value: '1' },
  ],
}

function measuringContext(): CanvasRenderingContext2D {
  return {
    measureText: vi.fn((value: string) => ({
      width: Math.max(8, Array.from(value).length * 12),
    })),
  } as unknown as CanvasRenderingContext2D
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
  vi.restoreAllMocks()
})

describe('Project V8 FormulaNode contract', () => {
  it('accepts every minimum AST kind and rejects semantically empty scripts', () => {
    expect(formulaAstSchema.parse(completeAst)).toEqual(completeAst)
    expect(formulaAstSchema.safeParse({
      type: 'script',
      base: { type: 'token', value: 'x' },
    }).success).toBe(false)

    const project = createProject({ includeDefaultController: false, controls: 'none' })
    project.scenes[0]!.nodes.push(createFormulaNode({
      id: 'formula-node-1',
      formulaId: 'lesson.quadratic:answer-1',
      accessibleText: '三次根号 x 除以 y 的平方下标 i，等于一',
      ast: completeAst,
      style: { fontSize: 52, color: '#123456', align: 'right' },
    }))
    expect(projectDocumentSchema.safeParse(project).success).toBe(true)

    const invalid = structuredClone(project)
    const node = invalid.scenes[0]!.nodes[0]
    if (node?.type !== 'formula') throw new Error('Expected FormulaNode')
    node.ast = {
      type: 'script',
      base: { type: 'token', value: 'x' },
    }
    const result = projectDocumentSchema.safeParse(invalid)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some(({ message }) => (
        message.includes('superscript') || message.includes('subscript')
      ))).toBe(true)
    }
  })

  it('preserves semantic identity through archive and PublishedLesson round trips', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    const formula = createFormulaNode({
      id: 'formula-node-roundtrip',
      formulaId: 'math.energy.conservation',
      accessibleText: 'E 等于 m c 的平方',
      ast: completeAst,
    })
    project.scenes[0]!.nodes.push(formula)

    const archive = createProjectArchive({
      project,
      assetFiles: {},
      componentFiles: {},
    })
    const reopened = openProjectArchive(archive).project
    expect(reopened.scenes[0]!.nodes[0]).toMatchObject({
      type: 'formula',
      formulaId: formula.formulaId,
      accessibleText: formula.accessibleText,
      ast: completeAst,
    })

    const published = buildPublishedLessonPayload({
      project,
      assets: {},
      components: {},
    })
    const restored = publishedLessonToExportPayload(published).project
    expect(restored.scenes[0]!.nodes[0]).toMatchObject({
      type: 'formula',
      formulaId: formula.formulaId,
      accessibleText: formula.accessibleText,
      ast: completeAst,
    })
    expect(projectDocumentSchema.safeParse(restored).success).toBe(true)
  })

  it('uses the normal state-override and undo/redo command path', () => {
    const store = useEditorStore.getState()
    store.addFormulaNode(160, 120)
    const formula = selectActiveScene(useEditorStore.getState()).nodes[0]
    if (formula?.type !== 'formula') throw new Error('Expected FormulaNode')
    const formulaId = formula.formulaId
    store.addPresentationState('公式答案')
    const stateId = useEditorStore.getState().activePresentationStateId!
    const historyBefore = useEditorStore.getState().history.past.length

    useEditorStore.getState().updateNode(formula.id, {
      accessibleText: '答案为一',
      ast: { type: 'token', value: '1' },
      style: { fontSize: 64, color: '#7c3aed', align: 'right' },
    })

    let scene = selectActiveScene(useEditorStore.getState())
    expect(scene.nodes[0]).toMatchObject({
      type: 'formula',
      formulaId,
      accessibleText: 'x 的平方加二分之一',
    })
    expect(materializeScene(scene, stateId).nodes[0]).toMatchObject({
      type: 'formula',
      formulaId,
      accessibleText: '答案为一',
      ast: { type: 'token', value: '1' },
      style: { fontSize: 64, color: '#7c3aed', align: 'right' },
    })
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore + 1)

    useEditorStore.getState().undo()
    scene = selectActiveScene(useEditorStore.getState())
    expect(materializeScene(scene, stateId).nodes[0]).toMatchObject({
      accessibleText: 'x 的平方加二分之一',
    })
    useEditorStore.getState().redo()
    scene = selectActiveScene(useEditorStore.getState())
    expect(materializeScene(scene, stateId).nodes[0]).toMatchObject({
      accessibleText: '答案为一',
      formulaId,
    })
    expect(projectDocumentSchema.safeParse(useEditorStore.getState().project).success)
      .toBe(true)
  })

  it('reports clipping and explains PPTX staticization without blocking a fitting formula', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      measuringContext(),
    )
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    const fitting = createFormulaNode({
      id: 'formula-fitting',
      formulaId: 'formula.fitting',
      width: 500,
      height: 200,
      ast: { type: 'token', value: 'x' },
    })
    const clipped = createFormulaNode({
      id: 'formula-clipped',
      formulaId: 'formula.clipped',
      width: 24,
      height: 24,
      style: { fontSize: 80 },
      ast: completeAst,
    })
    project.scenes[0]!.nodes.push(fitting, clipped)

    const report = collectExportPreflight(
      project,
      'pptx',
      { assetFiles: {}, components: {} },
      new Date('2026-08-11T00:00:00.000Z'),
    )
    expect(report.items).toContainEqual(expect.objectContaining({
      code: 'pptx-formula-rasterized',
      nodeId: fitting.id,
      severity: 'info',
    }))
    expect(report.items).toContainEqual(expect.objectContaining({
      code: 'formula-content-overflow-estimated',
      nodeId: clipped.id,
      severity: 'warning',
    }))
    expect(report.summary.canExport).toBe(true)
  })

  it('keeps formula overflow blocking when real browser Canvas metrics are available', () => {
    vi.stubGlobal('navigator', { userAgent: 'Chrome' })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      measuringContext(),
    )
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    const clipped = createFormulaNode({
      id: 'formula-browser-clipped',
      width: 24,
      height: 24,
      style: { fontSize: 80 },
      ast: completeAst,
    })
    project.scenes[0]!.nodes.push(clipped)

    const report = collectExportPreflight(
      project,
      'pptx',
      { assetFiles: {}, components: {} },
    )
    expect(report.items).toContainEqual(expect.objectContaining({
      code: 'formula-content-overflow',
      nodeId: clipped.id,
      severity: 'error',
    }))
    expect(report.summary.canExport).toBe(false)
    vi.unstubAllGlobals()
  })
})
