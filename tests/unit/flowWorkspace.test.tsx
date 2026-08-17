import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addCourseSurface,
  createCourseProject,
  updateCourseProject,
} from '@/renderer/course/courseStudioModel'
import { buildFlowEditorView, type FlowEditorView } from '@/renderer/course/flowEditorView'
import { FlowOutlinePanel } from '@/renderer/ui/FlowOutlinePanel'
import { FlowWorkspace } from '@/renderer/ui/FlowWorkspace'
import type { FlowBlock } from '@/shared/courseProjectTypes'
import type { FormulaAstNode } from '@/shared/projectTypes'

const NOW = '2026-08-15T00:00:00.000Z'

afterEach(cleanup)

function renderFlowFixture(): FlowEditorView {
  const formulaAst: FormulaAstNode = {
    type: 'row',
    children: [
      { type: 'token', value: 'a' },
      { type: 'operator', value: '+' },
      { type: 'token', value: 'b' },
    ],
  }
  const blocks: FlowBlock[] = [
    { id: 'block-h1', type: 'heading', level: 1, text: '第一章 开始' },
    { id: 'block-paragraph', type: 'paragraph', text: '正文段落' },
    {
      id: 'block-list',
      type: 'list',
      ordered: true,
      items: [
        { id: 'list-item-1', text: '项目一' },
        { id: 'list-item-2', text: '项目二' },
      ],
    },
    {
      id: 'block-ul',
      type: 'list',
      ordered: false,
      items: [
        { id: 'ul-item-1', text: '要点一' },
      ],
    },
    { id: 'block-quote', type: 'quote', text: '引用文字', citation: '出处' },
    { id: 'block-divider', type: 'divider' },
    {
      id: 'block-media-image',
      type: 'media',
      assetId: 'asset-image',
      mediaKind: 'image',
      altText: '示意图',
      caption: '封面图',
      layout: 'content-width',
    },
    {
      id: 'block-media-audio',
      type: 'media',
      assetId: 'asset-audio',
      mediaKind: 'audio',
      altText: '音频说明',
      layout: 'content-width',
    },
    {
      id: 'block-media-video',
      type: 'media',
      assetId: 'asset-video',
      mediaKind: 'video',
      altText: '视频说明',
      caption: '视频标题',
      layout: 'wide',
    },
    {
      id: 'block-table',
      type: 'table',
      caption: '表格标题',
      columns: [
        { id: 'column-a', header: '列 A' },
        { id: 'column-b', header: '列 B' },
      ],
      rows: [
        { id: 'row-1', cells: { 'column-a': 'A1', 'column-b': 'B1' } },
      ],
    },
    {
      id: 'block-formula',
      type: 'formula',
      formulaId: 'formula-1',
      accessibleText: 'a 加 b',
      ast: formulaAst,
    },
    { id: 'block-code', type: 'code', language: 'javascript', code: 'const a = 1;' },
    {
      id: 'block-callout',
      type: 'callout',
      tone: 'note',
      title: '提示',
      body: '这是提示内容',
    },
    {
      id: 'block-section',
      type: 'section',
      title: '章节 A',
      collapsedByDefault: true,
      blocks: [
        { id: 'block-h2', type: 'heading', level: 2, text: '小节 1' },
        { id: 'block-section-p', type: 'paragraph', text: '节内正文' },
      ],
    },
    {
      id: 'block-component',
      type: 'component',
      component: { packageId: 'demo-component', version: '1.0.0' },
      props: {},
      staticFallbackAssetId: 'asset-component-fallback',
    },
  ]

  let project = createCourseProject({
    id: 'course-flow-render',
    title: '渲染测试',
    now: NOW,
  })
  project = addCourseSurface(project, 'flow', {
    id: 'flow-surface',
    title: '渲染讲义',
    now: NOW,
  })
  const location = project.locations.find(
    (candidate) => candidate.kind === 'flow-block' && candidate.surfaceId === 'flow-surface',
  )
  if (!location || location.kind !== 'flow-block') throw new Error('expected flow location')

  project = updateCourseProject(project, (draft) => {
    const flow = draft.surfaces.find(
      (candidate) => candidate.id === 'flow-surface',
    )
    if (!flow || flow.type !== 'flow') throw new Error('expected flow surface')
    flow.blocks = blocks

    const flowLocation = draft.locations.find(
      (candidate) => candidate.id === location.id,
    )
    if (!flowLocation || flowLocation.kind !== 'flow-block') {
      throw new Error('expected flow location')
    }
    flowLocation.blockId = 'block-h1'
    flowLocation.label = '渲染讲义 · 第一章'

    draft.assets['asset-image'] = {
      id: 'asset-image',
      filename: 'cover.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'media/cover.png',
      byteLength: 1024,
      width: 640,
      height: 360,
    }
    draft.assets['asset-audio'] = {
      id: 'asset-audio',
      filename: 'voice.mp3',
      mimeType: 'audio/mpeg',
      kind: 'audio',
      path: 'media/voice.mp3',
      byteLength: 2048,
      duration: 3,
    }
    draft.assets['asset-video'] = {
      id: 'asset-video',
      filename: 'clip.mp4',
      mimeType: 'video/mp4',
      kind: 'video',
      path: 'media/clip.mp4',
      byteLength: 4096,
      width: 640,
      height: 360,
      duration: 5,
    }
    draft.assets['asset-component-fallback'] = {
      id: 'asset-component-fallback',
      filename: 'component.png',
      mimeType: 'image/png',
      kind: 'image',
      path: 'media/component.png',
      byteLength: 2048,
      width: 320,
      height: 180,
    }
    draft.componentPackages['demo-component'] = {
      packageId: 'demo-component',
      version: '1.0.0',
      name: '演示组件',
      manifestPath: 'components/demo-component/manifest.json',
      runtimePath: 'components/demo-component/runtime.js',
      contentSha256: 'a'.repeat(64),
    }
  }, NOW)

  return buildFlowEditorView({ project, locationId: location.id })
}

describe('FlowWorkspace presentational renderer', () => {
  it('renders every Flow block type as semantic HTML with stable data attributes', () => {
    const view = renderFlowFixture()
    const { container } = render(
      <FlowWorkspace view={view} selectedBlockId="block-h1" />,
    )
    const block = (id: string) => container.querySelector(`[data-flow-block-id="${id}"]`)

    expect(block('block-h1')?.tagName).toBe('H1')
    expect(block('block-h1')?.getAttribute('data-flow-parent-id')).toBe('')
    expect(block('block-h1')?.classList.contains('flow-block--selected')).toBe(true)

    expect(block('block-paragraph')?.tagName).toBe('P')
    expect(block('block-paragraph')?.textContent).toBe('正文段落')

    expect(block('block-list')?.tagName).toBe('OL')
    expect(container.querySelectorAll('[data-flow-block-id="block-list"] li')).toHaveLength(2)

    expect(block('block-ul')?.tagName).toBe('UL')
    expect(container.querySelector('[data-flow-block-id="block-ul"] li')?.textContent).toBe('要点一')

    expect(block('block-quote')?.tagName).toBe('BLOCKQUOTE')
    expect(block('block-quote')?.textContent).toContain('引用文字')
    expect(block('block-quote')?.textContent).toContain('出处')

    expect(block('block-divider')?.tagName).toBe('HR')

    expect(block('block-media-image')?.tagName).toBe('FIGURE')
    expect(
      container.querySelector('[data-flow-block-id="block-media-image"] img[data-flow-asset-id="asset-image"]'),
    ).not.toBeNull()
    expect(block('block-media-image')?.textContent).toContain('封面图')

    expect(
      container.querySelector('[data-flow-block-id="block-media-audio"] [data-flow-media-kind="audio"]'),
    ).not.toBeNull()
    expect(block('block-media-audio')?.textContent).toContain('音频占位符')
    expect(
      container.querySelector('[data-flow-block-id="block-media-video"] [data-flow-media-kind="video"]'),
    ).not.toBeNull()
    expect(block('block-media-video')?.textContent).toContain('视频标题')

    expect(block('block-table')?.tagName).toBe('TABLE')
    expect(container.querySelectorAll('[data-flow-block-id="block-table"] thead th')).toHaveLength(2)
    expect(container.querySelector('[data-flow-block-id="block-table"] tbody td')?.textContent).toBe('A1')

    const formula = block('block-formula')
    expect(formula?.tagName).toBe('DIV')
    expect(formula?.getAttribute('role')).toBe('math')
    expect(formula?.getAttribute('aria-label')).toBe('a 加 b')
    expect(formula?.getAttribute('data-flow-formula-id')).toBe('formula-1')

    expect(block('block-code')?.tagName).toBe('PRE')
    expect(
      container.querySelector('[data-flow-block-id="block-code"] code[data-flow-language="javascript"]'),
    ).not.toBeNull()
    expect(block('block-code')?.textContent).toContain('const a = 1;')

    expect(block('block-callout')?.tagName).toBe('ASIDE')
    expect(block('block-callout')?.getAttribute('data-flow-tone')).toBe('note')
    expect(block('block-callout')?.textContent).toContain('提示')
    expect(block('block-callout')?.textContent).toContain('这是提示内容')

    expect(block('block-section')?.tagName).toBe('DETAILS')
    expect(block('block-section')?.querySelector('summary')?.textContent).toBe('章节 A')
    expect(block('block-h2')?.tagName).toBe('H2')
    expect(block('block-h2')?.getAttribute('data-flow-parent-id')).toBe('block-section')
    expect(block('block-section-p')?.tagName).toBe('P')
    expect(block('block-section-p')?.textContent).toBe('节内正文')

    expect(block('block-component')?.tagName).toBe('ASIDE')
    expect(block('block-component')?.textContent).toContain('互动组件：demo-component')
    expect(block('block-component')?.textContent).toContain('版本 1.0.0')
    expect(
      container.querySelector('[data-flow-block-id="block-component"] img[data-flow-static-fallback-asset-id="asset-component-fallback"]'),
    ).not.toBeNull()
  })

  it('emits block selection and respects readOnly', () => {
    const view = renderFlowFixture()
    const onSelectBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} onSelectBlock={onSelectBlock} />,
    )

    fireEvent.click(container.querySelector('[data-flow-block-id="block-paragraph"]')!)
    expect(onSelectBlock).toHaveBeenCalledWith('block-paragraph')

    fireEvent.click(container.querySelector('[data-flow-block-id="block-h2"]')!)
    expect(onSelectBlock).toHaveBeenLastCalledWith('block-h2')
    expect(onSelectBlock).not.toHaveBeenCalledWith('block-section')

    onSelectBlock.mockClear()
    const readOnlyRender = render(
      <FlowWorkspace view={view} onSelectBlock={onSelectBlock} readOnly />,
    )
    fireEvent.click(
      readOnlyRender.container.querySelector('[data-flow-block-id="block-paragraph"]')!,
    )
    expect(onSelectBlock).not.toHaveBeenCalled()
  })
})

describe('FlowOutlinePanel presentational renderer', () => {
  it('renders nested outline entries and emits block selection', () => {
    const view = renderFlowFixture()
    const onSelectBlock = vi.fn()
    const { container } = render(
      <FlowOutlinePanel
        view={view}
        selectedBlockId="block-h2"
        onSelectBlock={onSelectBlock}
      />,
    )
    const outlineButton = (id: string) => container.querySelector(
      `[data-flow-outline-block-id="${id}"]`,
    )

    expect(outlineButton('block-h1')?.textContent).toContain('第一章 开始')
    expect(outlineButton('block-section')?.textContent).toContain('章节 A')

    const sectionLi = outlineButton('block-section')?.closest('li')
    const nestedLi = outlineButton('block-h2')?.closest('li')
    expect(sectionLi).not.toBeNull()
    expect(nestedLi).not.toBeNull()
    expect(sectionLi?.contains(outlineButton('block-h2'))).toBe(true)
    expect(nestedLi?.getAttribute('data-flow-outline-depth')).toBe('1')
    expect(outlineButton('block-h2')?.getAttribute('aria-selected')).toBe('true')

    fireEvent.click(outlineButton('block-section')!)
    expect(onSelectBlock).toHaveBeenCalledWith('block-section')
  })
})

describe('FlowWorkspace inline text editing (C1)', () => {
  const inlineEditor = (container: HTMLElement) =>
    container.querySelector('[data-flow-inline-editor]')
  const surface = (container: HTMLElement) =>
    container.querySelector('.flow-editor-surface')!

  it('enters inline edit on double-click of a heading and commits exactly once on blur', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} onPatchBlock={onPatchBlock} />,
    )

    const heading = container.querySelector('[data-flow-block-id="block-h1"]')!
    expect(heading.tagName).toBe('H1')
    fireEvent.doubleClick(heading)

    const editor = inlineEditor(container)
    expect(editor).not.toBeNull()
    expect(editor?.tagName).toBe('TEXTAREA')
    expect(editor?.getAttribute('aria-label')).toBeTruthy()
    expect(editor?.getAttribute('data-flow-inline-field')).toBe('text')
    // 编辑控件只替换当前块，不会把整篇 Flow 变成单一可编辑区域
    expect(container.querySelector('[data-flow-block-id="block-paragraph"]')?.tagName).toBe('P')

    fireEvent.change(editor!, { target: { value: '新标题' } })
    fireEvent.blur(editor!)

    expect(onPatchBlock).toHaveBeenCalledTimes(1)
    expect(onPatchBlock).toHaveBeenCalledWith('block-h1', { type: 'heading', text: '新标题' })
    expect(inlineEditor(container)).toBeNull()
  })

  it('enters inline edit with Enter after selecting a paragraph and commits exactly once via Ctrl+Enter', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-paragraph"
        onPatchBlock={onPatchBlock}
      />,
    )

    fireEvent.keyDown(surface(container), { key: 'Enter' })

    const editor = inlineEditor(container)
    expect(editor).not.toBeNull()
    expect(editor?.getAttribute('data-flow-block-id')).toBe('block-paragraph')

    fireEvent.change(editor!, { target: { value: '更新后的段落' } })
    fireEvent.keyDown(editor!, { key: 'Enter', ctrlKey: true })

    expect(onPatchBlock).toHaveBeenCalledTimes(1)
    expect(onPatchBlock).toHaveBeenCalledWith('block-paragraph', {
      type: 'paragraph',
      text: '更新后的段落',
    })
    expect(inlineEditor(container)).toBeNull()
  })

  it('does not commit or cancel on Enter/Escape during composition and commits exactly once via Ctrl+Enter afterwards', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-h1"
        onPatchBlock={onPatchBlock}
      />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-h1"]')!)
    const editor = inlineEditor(container)!
    fireEvent.change(editor, { target: { value: '输入法文本' } })
    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Enter', isComposing: true })
    fireEvent.keyDown(editor, { key: 'Escape', isComposing: true })
    expect(onPatchBlock).not.toHaveBeenCalled()
    // composition 期间 Escape 未取消：编辑控件仍在
    expect(inlineEditor(container)).not.toBeNull()

    fireEvent.compositionEnd(editor)
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(onPatchBlock).toHaveBeenCalledTimes(1)
    expect(onPatchBlock).toHaveBeenCalledWith('block-h1', {
      type: 'heading',
      text: '输入法文本',
    })
    expect(inlineEditor(container)).toBeNull()
  })

  it('cancels on Escape without committing, and a later blur does not commit again', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} onPatchBlock={onPatchBlock} />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-h1"]')!)
    const editor = inlineEditor(container)!
    fireEvent.change(editor, { target: { value: '临时文本' } })
    fireEvent.keyDown(editor, { key: 'Escape' })

    expect(onPatchBlock).not.toHaveBeenCalled()
    expect(inlineEditor(container)).toBeNull()

    // Escape 已退出编辑；随后发生的 blur 不得再次提交
    fireEvent.blur(editor)
    expect(onPatchBlock).not.toHaveBeenCalled()
  })

  it('does not commit when the draft equals the original text', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} onPatchBlock={onPatchBlock} />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-paragraph"]')!)
    const editor = inlineEditor(container)!
    fireEvent.change(editor, { target: { value: '正文段落' } })
    fireEvent.blur(editor)

    expect(onPatchBlock).not.toHaveBeenCalled()
    expect(inlineEditor(container)).toBeNull()
  })

  it('never enters inline edit and commits zero times under readOnly', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-h1"
        readOnly
        onPatchBlock={onPatchBlock}
      />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-h1"]')!)
    fireEvent.keyDown(surface(container), { key: 'Enter' })

    expect(inlineEditor(container)).toBeNull()
    expect(onPatchBlock).not.toHaveBeenCalled()
    expect(container.querySelector('[data-flow-block-id="block-h1"]')?.tagName).toBe('H1')
  })

  it('never enters inline edit while editingUnavailableReason is set', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-paragraph"
        editingUnavailableReason="当前内容暂不可编辑"
        onPatchBlock={onPatchBlock}
      />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-paragraph"]')!)
    fireEvent.keyDown(surface(container), { key: 'Enter' })

    expect(inlineEditor(container)).toBeNull()
    expect(onPatchBlock).not.toHaveBeenCalled()
  })

  it('emits only the current block ID and text patch without changing IDs, parents, order or other fields', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-paragraph"
        onPatchBlock={onPatchBlock}
      />,
    )
    const structure = () => JSON.stringify(
      view.blocks.map((entry) => ({
        blockId: entry.blockId,
        parentId: entry.parentId,
        index: entry.index,
      })),
    )
    const before = structure()

    fireEvent.keyDown(surface(container), { key: 'Enter' })
    const editor = inlineEditor(container)!
    fireEvent.change(editor, { target: { value: '更新后的段落' } })
    fireEvent.blur(editor)

    expect(onPatchBlock).toHaveBeenCalledTimes(1)
    expect(onPatchBlock).toHaveBeenCalledWith('block-paragraph', {
      type: 'paragraph',
      text: '更新后的段落',
    })
    expect(structure()).toBe(before)
    // 编辑只通过 callback 传出，不修改视图/工程数据
    const editedBlock = view.blocks.find((entry) => entry.blockId === 'block-paragraph')?.block
    if (!editedBlock || editedBlock.type !== 'paragraph') throw new Error('expected paragraph block')
    expect(editedBlock.text).toBe('正文段落')
  })

  it('commits the current draft before switching to another block', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} onPatchBlock={onPatchBlock} />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-h1"]')!)
    const firstEditor = inlineEditor(container)!
    fireEvent.change(firstEditor, { target: { value: '标题改动' } })

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-paragraph"]')!)

    expect(onPatchBlock).toHaveBeenCalledTimes(1)
    expect(onPatchBlock).toHaveBeenCalledWith('block-h1', { type: 'heading', text: '标题改动' })
    expect(inlineEditor(container)?.getAttribute('data-flow-block-id')).toBe('block-paragraph')
  })
})

describe('FlowWorkspace inline text editing (C2)', () => {
  const inlineEditor = (container: HTMLElement) =>
    container.querySelector('[data-flow-inline-editor]')
  const surface = (container: HTMLElement) =>
    container.querySelector('.flow-editor-surface')!

  it('edits quote text in place and commits exactly once via onPatchBlock', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} onPatchBlock={onPatchBlock} />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-quote"]')!)
    const editor = inlineEditor(container)!
    expect(editor).not.toBeNull()
    expect(editor.getAttribute('data-flow-block-id')).toBe('block-quote')
    expect(editor.getAttribute('aria-label')).toBeTruthy()

    fireEvent.change(editor, { target: { value: '新的引用文字' } })
    fireEvent.blur(editor)

    expect(onPatchBlock).toHaveBeenCalledTimes(1)
    expect(onPatchBlock).toHaveBeenCalledWith('block-quote', { type: 'quote', text: '新的引用文字' })
    expect(inlineEditor(container)).toBeNull()
  })

  it('enters quote editing via Enter after selection and commits exactly once', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} selectedBlockId="block-quote" onPatchBlock={onPatchBlock} />,
    )

    fireEvent.keyDown(surface(container), { key: 'Enter' })
    const editor = inlineEditor(container)!
    fireEvent.change(editor, { target: { value: '引文改动' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(onPatchBlock).toHaveBeenCalledTimes(1)
    expect(onPatchBlock).toHaveBeenCalledWith('block-quote', { type: 'quote', text: '引文改动' })
    expect(inlineEditor(container)).toBeNull()
  })

  it('edits two different list items by stable id with one structural commit each', () => {
    const view = renderFlowFixture()
    const onStructuralCommand = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} onStructuralCommand={onStructuralCommand} />,
    )
    const item = (id: string) => container.querySelector(`[data-flow-list-item-id="${id}"]`)!

    fireEvent.doubleClick(item('list-item-1'))
    let editor = inlineEditor(container)!
    expect(editor.getAttribute('data-flow-list-item-id')).toBe('list-item-1')
    fireEvent.change(editor, { target: { value: '项目一改动' } })
    fireEvent.blur(editor)

    expect(onStructuralCommand).toHaveBeenCalledTimes(1)
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-list',
      kind: 'list.editItem',
      itemId: 'list-item-1',
      text: '项目一改动',
    })

    fireEvent.doubleClick(item('list-item-2'))
    editor = inlineEditor(container)!
    expect(editor.getAttribute('data-flow-list-item-id')).toBe('list-item-2')
    fireEvent.change(editor, { target: { value: '项目二改动' } })
    fireEvent.blur(editor)

    expect(onStructuralCommand).toHaveBeenCalledTimes(2)
    expect(onStructuralCommand).toHaveBeenLastCalledWith({
      blockId: 'block-list',
      kind: 'list.editItem',
      itemId: 'list-item-2',
      text: '项目二改动',
    })
    expect(inlineEditor(container)).toBeNull()
  })

  it('enters the first list item via Enter after selecting the list block', () => {
    const view = renderFlowFixture()
    const onStructuralCommand = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-list"
        onStructuralCommand={onStructuralCommand}
      />,
    )

    fireEvent.keyDown(surface(container), { key: 'Enter' })
    const editor = inlineEditor(container)!
    expect(editor.getAttribute('data-flow-list-item-id')).toBe('list-item-1')
    fireEvent.change(editor, { target: { value: '项目一改动' } })
    fireEvent.blur(editor)

    expect(onStructuralCommand).toHaveBeenCalledTimes(1)
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-list',
      kind: 'list.editItem',
      itemId: 'list-item-1',
      text: '项目一改动',
    })
  })

  it('keeps block id, item id, parent and order unchanged after list item edit', () => {
    const view = renderFlowFixture()
    const onStructuralCommand = vi.fn()
    const { container } = render(
      <FlowWorkspace view={view} onStructuralCommand={onStructuralCommand} />,
    )
    const structure = () => JSON.stringify(
      view.blocks.map((entry) => ({
        blockId: entry.blockId,
        parentId: entry.parentId,
        index: entry.index,
      })),
    )
    const before = structure()

    fireEvent.doubleClick(container.querySelector('[data-flow-list-item-id="list-item-2"]')!)
    const editor = inlineEditor(container)!
    fireEvent.change(editor, { target: { value: '项目二改动' } })
    fireEvent.blur(editor)

    expect(onStructuralCommand).toHaveBeenCalledTimes(1)
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-list',
      kind: 'list.editItem',
      itemId: 'list-item-2',
      text: '项目二改动',
    })
    expect(structure()).toBe(before)
    const listBlock = view.blocks.find((entry) => entry.blockId === 'block-list')!.block
    if (listBlock.type !== 'list') throw new Error('expected list block')
    expect(listBlock.items.find((item) => item.id === 'list-item-2')?.text).toBe('项目二')
  })

  it('does not fire structural shortcuts while a list item is being edited', () => {
    const view = renderFlowFixture()
    const onDeleteBlock = vi.fn()
    const onDuplicateBlock = vi.fn()
    const onMoveBlock = vi.fn()
    const onStructuralCommand = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-list"
        onDeleteBlock={onDeleteBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
        onStructuralCommand={onStructuralCommand}
      />,
    )
    const root = surface(container)

    fireEvent.doubleClick(container.querySelector('[data-flow-list-item-id="list-item-1"]')!)
    const editor = inlineEditor(container)!
    expect(editor).not.toBeNull()

    // 事件从编辑控件冒泡到根级
    fireEvent.keyDown(editor, { key: 'Delete' })
    fireEvent.keyDown(editor, { key: 'Backspace' })
    fireEvent.keyDown(editor, { key: 'd', ctrlKey: true })
    fireEvent.keyDown(editor, { key: 'd', metaKey: true })
    fireEvent.keyDown(editor, { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(editor, { key: 'ArrowDown', altKey: true })
    // 直接命中根级
    fireEvent.keyDown(root, { key: 'Delete' })
    fireEvent.keyDown(root, { key: 'd', ctrlKey: true })
    fireEvent.keyDown(root, { key: 'ArrowUp', altKey: true })

    expect(onDeleteBlock).not.toHaveBeenCalled()
    expect(onDuplicateBlock).not.toHaveBeenCalled()
    expect(onMoveBlock).not.toHaveBeenCalled()
    expect(onStructuralCommand).not.toHaveBeenCalled()
    // 编辑控件仍在：快捷键没有触发提交或取消
    expect(inlineEditor(container)).not.toBeNull()
  })

  it('does not fire structural shortcuts during composition', () => {
    const view = renderFlowFixture()
    const onDeleteBlock = vi.fn()
    const onDuplicateBlock = vi.fn()
    const onMoveBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-list"
        onDeleteBlock={onDeleteBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
      />,
    )
    const root = surface(container)

    fireEvent.doubleClick(container.querySelector('[data-flow-list-item-id="list-item-1"]')!)
    const editor = inlineEditor(container)!
    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Delete', isComposing: true })
    fireEvent.keyDown(editor, { key: 'Backspace', isComposing: true })
    fireEvent.keyDown(editor, { key: 'd', ctrlKey: true, isComposing: true })
    fireEvent.keyDown(editor, { key: 'ArrowUp', altKey: true, isComposing: true })
    fireEvent.keyDown(root, { key: 'Delete', isComposing: true })
    fireEvent.keyDown(root, { key: 'd', ctrlKey: true, isComposing: true })

    expect(onDeleteBlock).not.toHaveBeenCalled()
    expect(onDuplicateBlock).not.toHaveBeenCalled()
    expect(onMoveBlock).not.toHaveBeenCalled()
    expect(inlineEditor(container)).not.toBeNull()
  })

  it('still fires structural shortcuts and keeps the selected toolbar when not editing', () => {
    const view = renderFlowFixture()
    const onDeleteBlock = vi.fn()
    const onDuplicateBlock = vi.fn()
    const onMoveBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-paragraph"
        onDeleteBlock={onDeleteBlock}
        onDuplicateBlock={onDuplicateBlock}
        onMoveBlock={onMoveBlock}
      />,
    )
    const root = surface(container)

    fireEvent.keyDown(root, { key: 'Delete' })
    expect(onDeleteBlock).toHaveBeenCalledWith('block-paragraph')
    fireEvent.keyDown(root, { key: 'd', ctrlKey: true })
    expect(onDuplicateBlock).toHaveBeenCalledWith('block-paragraph')
    fireEvent.keyDown(root, { key: 'ArrowUp', altKey: true })
    expect(onMoveBlock).toHaveBeenCalledWith('block-paragraph', 'up')

    expect(container.querySelector('[data-testid="flow-workspace-block-toolbar"]')).not.toBeNull()
    fireEvent.click(container.querySelector('[data-testid="flow-workspace-block-delete"]')!)
    expect(onDeleteBlock).toHaveBeenCalledTimes(2)
  })

  it('commits zero text and structural callbacks under readOnly', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const onStructuralCommand = vi.fn()
    const onDeleteBlock = vi.fn()
    const { container } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-list"
        readOnly
        onPatchBlock={onPatchBlock}
        onStructuralCommand={onStructuralCommand}
        onDeleteBlock={onDeleteBlock}
      />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-quote"]')!)
    fireEvent.doubleClick(container.querySelector('[data-flow-list-item-id="list-item-1"]')!)
    fireEvent.keyDown(surface(container), { key: 'Enter' })
    fireEvent.keyDown(surface(container), { key: 'Delete' })

    expect(inlineEditor(container)).toBeNull()
    expect(onPatchBlock).not.toHaveBeenCalled()
    expect(onStructuralCommand).not.toHaveBeenCalled()
    expect(onDeleteBlock).not.toHaveBeenCalled()
  })
})
