import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ComponentManifestV2,
  ComponentManifestV3,
} from '@/shared/componentTypes'
import type { AssetMeta, ExternalComponentNode } from '@/shared/projectTypes'
import { ComponentPropertiesEditor } from '@/renderer/ui/ComponentPropertiesEditor'
import { ElementsTab } from '@/renderer/ui/ElementsTab'
import {
  selectActiveScene,
  useEditorStore,
} from '@/renderer/store/editorStore'

const manifest: ComponentManifestV2 = {
  schemaVersion: 2,
  runtimeApiVersion: 2,
  id: 'com.example.editor',
  name: '属性组件',
  version: '2.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 400, height: 240 },
  minSize: { width: 100, height: 80 },
  preserveAspectRatio: false,
  assets: {},
  defaultProps: {},
  editor: {
    properties: [
      { key: 'title', label: '标题', type: 'text' },
      { key: 'details', label: '说明', type: 'textarea' },
      { key: 'count', label: '数量', type: 'number', min: 0, max: 10 },
      { key: 'enabled', label: '启用', type: 'boolean' },
      { key: 'accent', label: '颜色', type: 'color' },
      {
        key: 'layout',
        label: '布局',
        type: 'select',
        options: [
          { value: 'story', label: '故事' },
          { value: 'quiz', label: '测验' },
        ],
      },
      { key: 'coverAssetId', label: '封面图片', type: 'image' },
    ],
    pages: [
      {
        id: 'main',
        label: '主页',
        propertyKeys: ['title', 'count', 'enabled', 'accent', 'layout', 'coverAssetId'],
      },
      { id: 'detail', label: '详情页', propertyKeys: ['details'] },
    ],
    defaultPageId: 'main',
    previewPageProp: 'editor.previewPageId',
  },
  variants: [{ id: 'quiz', label: '测验版', props: { layout: 'quiz' } }],
  presets: [{ id: 'ready', label: '即用', props: { title: '预设标题' } }],
}

const asset: AssetMeta = {
  id: 'asset-cover',
  filename: '封面.png',
  mimeType: 'image/png',
  kind: 'image',
  path: 'assets/cover.png',
  byteLength: 10,
}

const baseNode: ExternalComponentNode = {
  id: 'component-1',
  name: '属性组件',
  type: 'external-component',
  x: 0,
  y: 0,
  width: 400,
  height: 240,
  rotation: 0,
  opacity: 1,
  visible: true,
  playbackInitialVisibility: 'inherit',
  locked: false,
  component: { packageId: manifest.id, version: manifest.version },
  props: {
    title: '旧标题',
    details: '旧说明',
    count: 1,
    enabled: false,
    accent: '#112233',
    layout: 'story',
  },
}

const v3Manifest: ComponentManifestV3 = {
  schemaVersion: 3,
  runtimeApiVersion: 3,
  supportedScopes: ['scene', 'global'],
  id: 'com.example.editor-v3',
  name: 'V3 属性组件',
  version: '3.0.0',
  entry: 'runtime.js',
  defaultSize: { width: 400, height: 240 },
  minSize: { width: 100, height: 80 },
  preserveAspectRatio: false,
  assets: {},
  defaultProps: {
    content: {
      title: '默认标题',
      actions: { start: '开始' },
      details: { hint: '第一行\n第二行' },
    },
  },
  editor: {
    properties: [
      {
        key: 'content.actions.start',
        label: '开始按钮',
        description: '显式覆盖的按钮文案',
        type: 'text',
        maxLength: 12,
      },
      { key: 'content.title', label: '主标题', type: 'text' },
    ],
  },
  presets: [{
    id: 'ready',
    label: '即用',
    props: { content: { title: '预设标题' } },
  }],
}

const v3Node: ExternalComponentNode = {
  ...baseNode,
  id: 'component-v3',
  name: v3Manifest.name,
  component: { packageId: v3Manifest.id, version: v3Manifest.version },
  props: { content: { title: '实例标题' } },
}

function Harness() {
  const [node, setNode] = useState(baseNode)
  return (
    <>
      <ComponentPropertiesEditor
        manifest={manifest}
        node={node}
        assets={{ [asset.id]: asset }}
        onChange={(props) => setNode((current) => ({ ...current, props }))}
      />
      <output data-testid="props-value">{JSON.stringify(node.props)}</output>
    </>
  )
}

function V3Harness() {
  const [node, setNode] = useState(v3Node)
  return (
    <>
      <ComponentPropertiesEditor
        manifest={v3Manifest}
        node={node}
        assets={{}}
        onChange={(props) => setNode((current) => ({ ...current, props }))}
      />
      <output data-testid="v3-props-value">{JSON.stringify(node.props)}</output>
    </>
  )
}

afterEach(cleanup)

describe('ComponentPropertiesEditor', () => {
  it('edits every supported property type and switches internal preview pages', () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '新标题' } })
    fireEvent.change(screen.getByLabelText('数量'), { target: { value: '5' } })
    fireEvent.click(screen.getByLabelText('启用'))
    fireEvent.change(screen.getByLabelText('颜色'), { target: { value: '#abcdef' } })
    fireEvent.change(screen.getByLabelText('布局'), { target: { value: 'quiz' } })
    fireEvent.change(screen.getByLabelText('封面图片'), {
      target: { value: 'asset-cover' },
    })

    expect(screen.getByTestId('props-value').textContent).toContain('"title":"新标题"')
    expect(screen.getByTestId('props-value').textContent).toContain('"count":5')
    expect(screen.getByTestId('props-value').textContent).toContain('"enabled":true')
    expect(screen.getByTestId('props-value').textContent).toContain('"accent":"#abcdef"')
    expect(screen.getByTestId('props-value').textContent).toContain('"coverAssetId":"asset-cover"')

    fireEvent.change(screen.getByLabelText('编辑预览页面'), {
      target: { value: 'detail' },
    })
    expect(screen.queryByLabelText('标题')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('说明'), { target: { value: '新说明' } })
    expect(screen.getByTestId('props-value').textContent).toContain('"details":"新说明"')
    expect(screen.getByTestId('props-value').textContent).toContain(
      '"editor":{"previewPageId":"detail"}',
    )
  })

  it('applies variants and presets as complete prop updates', () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('组件变体'), { target: { value: 'quiz' } })
    expect(screen.getByTestId('props-value').textContent).toContain('"layout":"quiz"')

    fireEvent.change(screen.getByLabelText('应用组件预设'), {
      target: { value: 'ready' },
    })
    expect(screen.getByTestId('props-value').textContent).toContain('"title":"预设标题"')
  })

  it('auto-renders and persists every nested V3 content string with explicit overrides', () => {
    render(<V3Harness />)

    const editor = screen.getByTestId('component-properties-editor')
    const textControls = within(editor).getAllByRole('textbox')
    expect(textControls.map((control) => control.getAttribute('id'))).toEqual([
      'component-prop-component-v3-content-actions-start',
      'component-prop-component-v3-content-title',
      'component-prop-component-v3-content-details-hint',
    ])
    expect(screen.getAllByLabelText('主标题')).toHaveLength(1)
    expect(screen.getByLabelText('主标题')).toHaveValue('实例标题')
    expect(screen.getByRole('textbox', { name: /开始按钮/ })).toHaveValue('开始')
    expect(screen.getByRole('textbox', { name: /开始按钮/ })).toHaveAttribute('maxlength', '12')
    expect(screen.getByText('显式覆盖的按钮文案')).toBeInTheDocument()
    expect(screen.getByLabelText('details / hint').tagName).toBe('TEXTAREA')

    fireEvent.change(screen.getByRole('textbox', { name: /开始按钮/ }), {
      target: { value: '立即开始' },
    })
    expect(screen.getByTestId('v3-props-value').textContent).toContain(
      '"actions":{"start":"立即开始"}',
    )
    expect(screen.getByLabelText('主标题')).toHaveValue('实例标题')
    expect(screen.getByLabelText('details / hint')).toHaveValue('第一行\n第二行')
  })
})

describe('ElementsTab component presets', () => {
  it('shows presets as independent add choices and applies their props', () => {
    useEditorStore.getState().createNewProject()
    useEditorStore.getState().importComponentPackage({
      manifest,
      runtimeSource: 'window.CoursewareComponent.define({})',
      files: {},
    })
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = () => null
    try {
      render(<ElementsTab onAddImage={() => undefined} />)
      fireEvent.click(
        screen.getByTestId(`component-${manifest.id}-preset-ready`),
      )

      const node = selectActiveScene(useEditorStore.getState()).nodes[0]
      expect(node).toMatchObject({
        type: 'external-component',
        name: '属性组件 · 即用',
        props: { title: '预设标题' },
      })
      expect(useEditorStore.getState().history.past).toHaveLength(1)
      useEditorStore.getState().undo()
      expect(selectActiveScene(useEditorStore.getState()).nodes).toHaveLength(0)
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })

  it('keeps V3 presets available for scene component instances', () => {
    useEditorStore.getState().createNewProject()
    useEditorStore.getState().importComponentPackage({
      manifest: v3Manifest,
      runtimeSource: 'window.CoursewareComponent.define({})',
      files: {},
    })
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = () => null
    try {
      render(<ElementsTab onAddImage={() => undefined} />)
      fireEvent.click(
        screen.getByTestId(`component-${v3Manifest.id}-preset-ready`),
      )

      const node = selectActiveScene(useEditorStore.getState()).nodes[0]
      expect(node).toMatchObject({
        type: 'external-component',
        name: 'V3 属性组件 · 即用',
        props: {
          content: {
            title: '预设标题',
            actions: { start: '开始' },
            details: { hint: '第一行\n第二行' },
          },
        },
      })
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })
})
