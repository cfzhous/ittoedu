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

  it('keeps the page as the only course-level parent and omits ordinary blocks', () => {
    const view = renderFlowFixture()
    const { container } = render(<FlowOutlinePanel view={view} />)
    expect(container.querySelector('[data-flow-outline-kind="page"]')?.textContent).toContain('渲染讲义')
    expect(container.querySelector('[data-flow-outline-block-id="block-paragraph"]')).toBeNull()
    expect(container.querySelector('[data-flow-outline-block-id="block-h1"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="课程结构"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="讲义大纲"]')).toBeNull()
  })
})

describe('FlowWorkspace inline text editing', () => {
  it('commits heading/paragraph/list drafts to the same V9 fields as the property panel', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const onStructuralCommand = vi.fn()
    const { container, rerender } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-h1"
        onPatchBlock={onPatchBlock}
        onStructuralCommand={onStructuralCommand}
      />,
    )

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-h1"]')!)
    const headingEditor = container.querySelector<HTMLTextAreaElement>('[data-flow-inline-editor="true"]')!
    expect(headingEditor).not.toBeNull()
    fireEvent.change(headingEditor, { target: { value: '第一章 已改' } })
    fireEvent.keyDown(headingEditor, { key: 'Enter' })
    expect(onPatchBlock).toHaveBeenCalledWith('block-h1', { type: 'heading', text: '第一章 已改' })

    rerender(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-paragraph"
        onPatchBlock={onPatchBlock}
        onStructuralCommand={onStructuralCommand}
      />,
    )
    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-paragraph"]')!)
    const paragraphEditor = container.querySelector<HTMLTextAreaElement>('[data-flow-inline-editor="true"]')!
    fireEvent.change(paragraphEditor, { target: { value: '正文已改' } })
    fireEvent.keyDown(paragraphEditor, { key: 'Enter', ctrlKey: true })
    expect(onPatchBlock).toHaveBeenCalledWith('block-paragraph', { type: 'paragraph', text: '正文已改' })

    fireEvent.doubleClick(container.querySelector('[data-flow-list-item-id="list-item-1"]')!)
    const listEditor = container.querySelector<HTMLTextAreaElement>('[data-flow-inline-editor="true"]')!
    fireEvent.change(listEditor, { target: { value: '项目一已改' } })
    fireEvent.blur(listEditor)
    expect(onStructuralCommand).toHaveBeenCalledWith({
      blockId: 'block-list',
      kind: 'list.editItem',
      itemId: 'list-item-1',
      text: '项目一已改',
    })
  })

  it('cancels on Escape and commits when the external selection changes', () => {
    const view = renderFlowFixture()
    const onPatchBlock = vi.fn()
    const { container, rerender } = render(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-quote"
        onPatchBlock={onPatchBlock}
      />,
    )
    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-quote"]')!)
    const editor = container.querySelector<HTMLTextAreaElement>('[data-flow-inline-editor="true"]')!
    fireEvent.change(editor, { target: { value: '不该提交' } })
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(onPatchBlock).not.toHaveBeenCalled()
    expect(container.querySelector('[data-flow-inline-editor="true"]')).toBeNull()

    fireEvent.doubleClick(container.querySelector('[data-flow-block-id="block-quote"]')!)
    const nextEditor = container.querySelector<HTMLTextAreaElement>('[data-flow-inline-editor="true"]')!
    fireEvent.change(nextEditor, { target: { value: '外部选择提交' } })
    rerender(
      <FlowWorkspace
        view={view}
        selectedBlockId="block-h1"
        onPatchBlock={onPatchBlock}
      />,
    )
    expect(onPatchBlock).toHaveBeenCalledWith('block-quote', { type: 'quote', text: '外部选择提交' })
  })
})
