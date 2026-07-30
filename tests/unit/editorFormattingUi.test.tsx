import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShapeNode, createTextNode } from '@/renderer/project/createProject'
import { selectActiveScene, useEditorStore } from '@/renderer/store/editorStore'
import { ElementsTab } from '@/renderer/ui/ElementsTab'
import {
  detectFontAvailability,
  PropertiesTab,
} from '@/renderer/ui/PropertiesTab'
import { buildInitialRichTextHtml, TextEditOverlay } from '@/renderer/ui/TextEditOverlay'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  useEditorStore.getState().createNewProject()
  useEditorStore.setState({ editorMode: 'professional' })
})

describe('shape editing UI', () => {
  it('creates braces as stroke-only shapes with usable defaults', () => {
    const brace = createShapeNode('brace-left')
    const rectangle = createShapeNode('rectangle')

    expect(brace.style).toMatchObject({ fillOpacity: 0, borderWidth: 4 })
    expect(rectangle.style).toMatchObject({ fillOpacity: 1, borderWidth: 0 })
  })

  it('hides ineffective fill controls and labels brace styling as line styling', () => {
    const store = useEditorStore.getState()
    store.addShapeNode('brace-left')

    render(<PropertiesTab onReplaceImage={() => undefined} />)

    expect(screen.queryByText('填充色')).not.toBeInTheDocument()
    expect(screen.queryByText('填充透明度')).not.toBeInTheDocument()
    expect(screen.getByText('线条颜色')).toBeInTheDocument()
    expect(screen.getByText('线条透明度')).toBeInTheDocument()
    expect(screen.getByText('线条宽度')).toBeInTheDocument()
  })

  it('commits a dragged range control once instead of filling the undo stack', () => {
    const store = useEditorStore.getState()
    store.addShapeNode('rectangle')
    render(<PropertiesTab onReplaceImage={() => undefined} />)
    const slider = screen.getByRole('slider', { name: '填充透明度' })
    const historyBefore = useEditorStore.getState().history.past.length

    fireEvent.change(slider, { target: { value: '65' } })
    fireEvent.change(slider, { target: { value: '35' } })
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore)
    fireEvent.pointerUp(slider)

    const shape = selectActiveScene(useEditorStore.getState()).nodes[0]!
    expect(shape.type).toBe('shape')
    if (shape.type !== 'shape') throw new Error('Expected a shape node')
    expect(shape.style.fillOpacity).toBe(0.65)
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore + 1)
  })
})

describe('basic text property semantics', () => {
  it('shows transparency rather than stored opacity for nodes and backgrounds', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const textId = selectActiveScene(useEditorStore.getState()).nodes[0]!.id
    store.updateNode(textId, { style: { overflow: 'fixed' } })
    render(<PropertiesTab onReplaceImage={() => undefined} />)

    const nodeTransparency = screen.getByRole('spinbutton', {
      name: '透明度 %',
    })
    expect(nodeTransparency).toHaveValue(0)
    fireEvent.change(nodeTransparency, { target: { value: '100' } })
    fireEvent.blur(nodeTransparency)

    const backgroundTransparency = screen.getByRole('slider', {
      name: '背景透明度',
    })
    expect(backgroundTransparency).toHaveValue('100')
    fireEvent.change(backgroundTransparency, { target: { value: '0' } })
    fireEvent.pointerUp(backgroundTransparency)

    const node = selectActiveScene(useEditorStore.getState()).nodes[0]!
    expect(node.type).toBe('text')
    if (node.type !== 'text') throw new Error('Expected a text node')
    expect(node.opacity).toBe(0)
    expect(node.style.backgroundOpacity).toBe(1)
  })

  it('offers both vertical directions and keeps vertical height editable', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const node = selectActiveScene(useEditorStore.getState()).nodes[0]!
    store.updateNode(node.id, {
      style: {
        writingMode: 'vertical-lr',
        overflow: 'auto-height',
      },
    })

    render(<PropertiesTab onReplaceImage={() => undefined} />)

    expect(screen.getByRole('combobox', { name: '文字方向' })).toHaveValue(
      'vertical-lr',
    )
    expect(screen.getByRole('option', {
      name: '竖排（列从右向左）',
    })).toBeInTheDocument()
    expect(screen.getByRole('option', {
      name: '竖排（列从左向右）',
    })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '自动增宽' }))
      .toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '宽' })).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: '高' })).toBeEnabled()
    expect(screen.getByText(/高度可直接输入或拖动画布上下边缘调整/))
      .toBeInTheDocument()
  })
})

describe('event-driven motion authoring entry point', () => {
  it('keeps only playback initial visibility in common properties', () => {
    const store = useEditorStore.getState()
    store.addShapeNode('rectangle')
    render(<PropertiesTab onReplaceImage={() => undefined} />)

    const playbackVisibility = screen.getByRole('combobox', {
      name: '播放开始时',
    })
    fireEvent.change(playbackVisibility, { target: { value: 'hidden' } })

    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      visible: true,
      playbackInitialVisibility: 'hidden',
    })
    expect(screen.queryByRole('combobox', { name: '效果' })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '时长 ms' }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '延迟 ms' }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '预览入场动画' }))
      .not.toBeInTheDocument()
  })
})

describe('elements panel', () => {
  it('keeps all quick entries under Common and Media focused on management', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => null as never,
    )

    render(
      <ElementsTab
        onAddImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    const panel = screen.getByTestId('elements-tab')
    const commonTestIds = Array.from(
      panel.querySelectorAll<HTMLElement>('[data-testid]'),
      (element) => element.dataset.testid,
    )
    expect(screen.getByText('快速添加')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '文本' })).toHaveAttribute(
      'data-testid',
      'add-text',
    )
    expect(commonTestIds.indexOf('add-text')).toBeGreaterThanOrEqual(0)
    expect(commonTestIds.indexOf('add-image'))
      .toBeGreaterThan(commonTestIds.indexOf('add-text'))
    expect(commonTestIds.indexOf('add-video'))
      .toBeGreaterThan(commonTestIds.indexOf('add-image'))
    expect(commonTestIds.indexOf('import-audio'))
      .toBeGreaterThan(commonTestIds.indexOf('add-video'))
    expect(commonTestIds.indexOf('add-rectangle'))
      .toBeGreaterThan(commonTestIds.indexOf('import-audio'))

    fireEvent.click(screen.getByRole('tab', { name: '媒体' }))

    expect(screen.getByTestId('media-tab')).toBeInTheDocument()
    expect(screen.queryByTestId('add-text')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-image')).not.toBeInTheDocument()
    expect(screen.queryByTestId('add-video')).not.toBeInTheDocument()
    expect(screen.queryByTestId('import-audio')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导入声音' }))
      .not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '导入视频' }))
      .not.toBeInTheDocument()
    expect(screen.getByText('声音库')).toBeInTheDocument()
    expect(screen.getByText('视频素材')).toBeInTheDocument()
    expect(screen.getByText('图片素材')).toBeInTheDocument()
  })
})

describe('rich text editing UI', () => {
  it('keeps property text changes in one transaction and one undo step', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = selectActiveScene(useEditorStore.getState()).nodes[0]!.id
    store.updateNode(nodeId, { style: { overflow: 'fixed' } })
    const historyBefore = useEditorStore.getState().history.past.length

    render(<PropertiesTab onReplaceImage={() => undefined} />)
    const textarea = screen.getByRole('textbox', { name: '文字内容' })
    fireEvent.focus(textarea)
    fireEvent.change(textarea, { target: { value: '第一版' } })
    fireEvent.change(textarea, { target: { value: '属性栏最终文字' } })

    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      text: '属性栏最终文字',
    })
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore)

    fireEvent.blur(textarea)
    expect(useEditorStore.getState().history.past).toHaveLength(historyBefore + 1)
    store.undo()
    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      text: '双击编辑文字',
    })
  })

  it('remaps existing rich runs when the plain text field is edited', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const node = selectActiveScene(useEditorStore.getState()).nodes[0]!
    store.updateNode(node.id, {
      text: 'ABCDE',
      runs: [{ start: 1, end: 4, style: { color: '#ef4444', bold: true } }],
      style: { overflow: 'fixed' },
    })

    render(<PropertiesTab onReplaceImage={() => undefined} />)
    const textarea = screen.getByDisplayValue('ABCDE')
    fireEvent.change(textarea, { target: { value: 'BCDE' } })
    fireEvent.blur(textarea)

    const updated = selectActiveScene(useEditorStore.getState()).nodes[0]!
    expect(updated.type).toBe('text')
    if (updated.type !== 'text') throw new Error('Expected a text node')
    expect(updated.runs).toEqual([
      { start: 0, end: 3, style: { color: '#ef4444', bold: true } },
    ])
  })

  it('serializes explicit false rich-style overrides instead of inheriting the base style', () => {
    const base = createTextNode()
    const node = {
      ...base,
      text: 'AB',
      style: {
        ...base.style,
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        highlightColor: '#fff3a3',
      },
      runs: [{
        start: 0,
        end: 1,
        style: {
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          highlightColor: null,
        },
      }],
    }

    const html = buildInitialRichTextHtml(node)
    expect(html).toContain('font-weight:400')
    expect(html).toContain('font-style:normal')
    expect(html).toContain('text-decoration-line:none')
    expect(html).toContain('background-color:transparent')
  })

  it('does not rewrite an in-progress contentEditable value when the node resizes', () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    const workspace = document.createElement('div')
    const canvas = document.createElement('canvas')
    workspace.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 1400, bottom: 800,
      width: 1400, height: 800, toJSON: () => ({}),
    })
    canvas.getBoundingClientRect = () => ({
      x: 60, y: 40, left: 60, top: 40, right: 1340, bottom: 760,
      width: 1280, height: 720, toJSON: () => ({}),
    })
    const node = createTextNode()
    const onPreview = vi.fn()
    const result = render(
      <TextEditOverlay
        node={node}
        workspace={workspace}
        canvas={canvas}
        onPreview={onPreview}
        onCommit={() => undefined}
        onCancel={() => undefined}
      />,
    )
    const editor = screen.getByTestId('text-edit-overlay')
    editor.textContent = 'resize 期间正在输入'
    fireEvent.input(editor)

    result.rerender(
      <TextEditOverlay
        node={{ ...node, width: node.width + 180, height: node.height + 40 }}
        workspace={workspace}
        canvas={canvas}
        onPreview={onPreview}
        onCommit={() => undefined}
        onCancel={() => undefined}
      />,
    )

    expect(editor).toHaveTextContent('resize 期间正在输入')
    expect(onPreview).toHaveBeenLastCalledWith('resize 期间正在输入', [])
  })

  it('waits for IME composition to finish before committing a blur', async () => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    const workspace = document.createElement('div')
    const canvas = document.createElement('canvas')
    workspace.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0, right: 1280, bottom: 720,
      width: 1280, height: 720, toJSON: () => ({}),
    })
    canvas.getBoundingClientRect = workspace.getBoundingClientRect
    const onCommit = vi.fn()
    render(
      <TextEditOverlay
        node={createTextNode()}
        workspace={workspace}
        canvas={canvas}
        onPreview={() => undefined}
        onCommit={onCommit}
        onCancel={() => undefined}
      />,
    )
    const editor = screen.getByTestId('text-edit-overlay')

    fireEvent.compositionStart(editor, { data: '中' })
    editor.textContent = '中文输入'
    fireEvent.input(editor)
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true, isComposing: true })
    fireEvent.blur(editor)
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.compositionEnd(editor, { data: '中文输入' })
    await waitFor(() => expect(onCommit).toHaveBeenCalledTimes(1))
    expect(onCommit).toHaveBeenCalledWith('中文输入', [])
  })
})

describe('font family picker', () => {
  it('reports system-font availability through document.fonts', () => {
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        check: vi.fn((font: string) => font.includes('KaiTi')),
      },
    })
    try {
      expect(detectFontAvailability('KaiTi')).toBe('available')
      expect(detectFontAvailability('Arial')).toBe('unavailable')
      expect(detectFontAvailability('sans-serif')).toBe('available')
    } finally {
      if (originalFonts) {
        Object.defineProperty(document, 'fonts', originalFonts)
      } else {
        Reflect.deleteProperty(document, 'fonts')
      }
    }
  })

  it('opens the full list without clearing, filters while typing, and accepts custom values', () => {
    const store = useEditorStore.getState()
    store.addTextNode()
    const nodeId = selectActiveScene(useEditorStore.getState()).nodes[0]!.id
    store.updateNode(nodeId, {
      style: {
        fontFamily: 'Custom Legacy Font, sans-serif',
        overflow: 'fixed',
      },
    })

    render(<PropertiesTab onReplaceImage={() => undefined} />)
    const fontInput = screen.getByRole('combobox', { name: '字体' })
    const preview = screen.getByTestId('font-family-preview')
    expect(fontInput).toHaveValue('Custom Legacy Font, sans-serif')
    expect(preview).toHaveStyle({ fontFamily: 'Custom Legacy Font, sans-serif' })

    fireEvent.focus(fontInput)
    expect(screen.getByRole('listbox', { name: '常用字体' })).toBeInTheDocument()
    expect(screen.getByRole('option', {
      name: /微软雅黑，Microsoft YaHei，/,
    })).toBeInTheDocument()
    expect(fontInput).toHaveValue('Custom Legacy Font, sans-serif')

    fireEvent.change(fontInput, { target: { value: 'Kai' } })
    expect(screen.getByRole('option', {
      name: /楷体，KaiTi，/,
    })).toBeInTheDocument()
    expect(screen.queryByRole('option', {
      name: /Arial，Arial，/,
    })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', {
      name: /楷体，KaiTi，/,
    }))
    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      style: { fontFamily: 'KaiTi' },
    })
    expect(preview).toHaveStyle({ fontFamily: 'KaiTi' })

    fireEvent.change(fontInput, { target: { value: 'My Course Font' } })
    fireEvent.blur(fontInput)
    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      style: { fontFamily: 'My Course Font' },
    })
  })
})
