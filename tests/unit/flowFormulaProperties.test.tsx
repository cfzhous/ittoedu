import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectFlowEditorBlocks } from '@/renderer/course/flowEditorSlice'
import { useEditorStore } from '@/renderer/store/editorStore'
import { PropertiesTab } from '@/renderer/ui/PropertiesTab'
import type { FlowSurface } from '@/shared/projectTypes'

function drawingContext(): CanvasRenderingContext2D {
  return {
    measureText: vi.fn((value: string) => ({
      width: Math.max(8, Array.from(value).length * 12),
    })),
    scale: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

describe('FlowFormulaBlockProperties', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      drawingContext(),
    )
    useEditorStore.getState().createNewProject()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('mounts FormulaAuthoringEditor when formula block is selected and commits changes', () => {
    const store = useEditorStore.getState()
    store.createNewFlowProject()
    store.addFormulaNode()

    const flow = useEditorStore.getState().flowSession
    expect(flow).not.toBeNull()
    if (!flow) return

    const doc = flow.history.present
    const flowSurface = doc.surfaces.find((s): s is FlowSurface => s.type === 'flow')
    expect(flowSurface).toBeDefined()
    if (!flowSurface) return

    const formulaBlock = flowSurface.blocks.find((b) => b.type === 'formula')
    expect(formulaBlock).toBeDefined()
    if (!formulaBlock) return

    const selection = selectFlowEditorBlocks(doc, flow.selection.locationId, [formulaBlock.id])
    useEditorStore.getState().applyFlowSelection(selection)

    render(<PropertiesTab onReplaceImage={() => undefined} />)

    expect(screen.getByTestId('flow-formula-properties')).toBeDefined()
    expect(screen.getByTestId('formula-authoring-editor')).toBeDefined()

    const input = screen.getByRole('textbox', { name: '公式内容（线性输入）' })
    fireEvent.change(input, { target: { value: 'a+b' } })

    const applyButton = screen.getByRole('button', { name: '应用公式' })
    fireEvent.click(applyButton)

    const updatedFlow = useEditorStore.getState().flowSession
    const updatedDoc = updatedFlow?.history.present
    const updatedSurface = updatedDoc?.surfaces.find((s): s is FlowSurface => s.type === 'flow')
    const updatedBlock = updatedSurface?.blocks.find((b) => b.id === formulaBlock.id)

    expect(updatedBlock).toBeDefined()
    expect(updatedBlock?.type).toBe('formula')
    if (updatedBlock && updatedBlock.type === 'formula') {
      expect(updatedBlock.accessibleText).toContain('a')
      expect(updatedBlock.accessibleText).toContain('b')
    }

    expect(screen.queryByTestId('formula-edit-dialog')).toBeNull()
  })
})
