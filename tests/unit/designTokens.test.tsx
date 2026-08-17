import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectDocumentSchema } from '../../src/shared/projectSchema'
import { createProject } from '../../src/renderer/project/createProject'
import { useEditorStore } from '../../src/renderer/store/editorStore'
import { DesignTokensEditor } from '../../src/renderer/ui/DesignTokensEditor'
import { PropertiesTab } from '../../src/renderer/ui/PropertiesTab'

afterEach(cleanup)

beforeEach(() => {
  useEditorStore.getState().createNewProject()
  useEditorStore.getState().setEditingScope('global')
  useEditorStore.getState().selectNode(null)
  useEditorStore.setState({ editorMode: 'professional' })
})

describe('minimal project design tokens', () => {
  it('supplies deterministic defaults when an earlier V8 document omits tokens', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    const withoutTokens = structuredClone(project) as unknown as Record<string, unknown>
    delete withoutTokens.designTokens

    expect(projectDocumentSchema.parse(withoutTokens).designTokens).toEqual({
      fonts: [expect.objectContaining({ id: 'body' })],
      colors: [
        expect.objectContaining({ id: 'background', color: '#ffffff' }),
        expect.objectContaining({ id: 'text', color: '#1f2937' }),
        expect.objectContaining({ id: 'accent', color: '#2563eb' }),
      ],
    })
  })

  it('rejects duplicate stable IDs inside one token family', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    project.designTokens.colors.push({
      id: 'accent',
      label: '重复强调',
      color: '#ef4444',
    })
    expect(projectDocumentSchema.safeParse(project)).toMatchObject({ success: false })
  })

  it('edits font and color tokens through undoable project commands', () => {
    render(<PropertiesTab onReplaceImage={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '添加字体' }))
    expect(useEditorStore.getState().project.designTokens.fonts).toHaveLength(2)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().project.designTokens.fonts).toHaveLength(1)
    useEditorStore.getState().redo()

    const idInput = screen.getByLabelText('字体 Token 2 ID')
    fireEvent.change(idInput, { target: { value: 'display' } })
    fireEvent.blur(idInput)
    expect(useEditorStore.getState().project.designTokens.fonts[1]!.id).toBe('display')

    fireEvent.click(screen.getByRole('button', { name: '添加颜色' }))
    const colors = useEditorStore.getState().project.designTokens.colors
    expect(colors).toHaveLength(4)
    const colorInput = screen.getByLabelText('颜色 Token 4 色值')
    fireEvent.change(colorInput, { target: { value: '#123456' } })
    fireEvent.blur(colorInput)
    expect(useEditorStore.getState().project.designTokens.colors[3]!.color)
      .toBe('#123456')
  })

  it('does not let add controls exceed schema token limits', () => {
    const project = createProject({ includeDefaultController: false, controls: 'none' })
    project.designTokens.fonts = Array.from({ length: 16 }, (_, index) => ({
      id: `font_${index}`,
      label: `字体 ${index + 1}`,
      fontFamily: 'sans-serif',
    }))
    project.designTokens.colors = Array.from({ length: 32 }, (_, index) => ({
      id: `color_${index}`,
      label: `颜色 ${index + 1}`,
      color: '#123456',
    }))
    useEditorStore.getState().loadProject(project, null, {}, {})
    useEditorStore.getState().setEditingScope('global')

    render(<PropertiesTab onReplaceImage={vi.fn()} />)
    const addFont = screen.getByRole('button', { name: '添加字体' })
    const addColor = screen.getByRole('button', { name: '添加颜色' })
    expect(addFont).toBeDisabled()
    expect(addColor).toBeDisabled()
    fireEvent.click(addFont)
    fireEvent.click(addColor)
    expect(useEditorStore.getState().project.designTokens.fonts).toHaveLength(16)
    expect(useEditorStore.getState().project.designTokens.colors).toHaveLength(32)
    expect(projectDocumentSchema.safeParse(useEditorStore.getState().project).success)
      .toBe(true)
  })

  it('does not present design tokens as an AI workflow', () => {
    const tokens = useEditorStore.getState().project.designTokens
    render(<DesignTokensEditor value={tokens} onChange={vi.fn()} />)
    expect(screen.getByText(/便于统一取色与字体/)).toBeInTheDocument()
    expect(screen.queryByText(/AI/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加字体' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '添加颜色' })).toBeEnabled()
  })
})
