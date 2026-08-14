import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthoringValueEditor,
  DynamicLayerContentEditor,
  NativeLayerContentEditor,
} from '@/renderer/course/CourseAuthoringControls'
import {
  formulaNode,
  imageNode,
  shapeNode,
  teacherControllerNode,
  textNode,
  videoNode,
} from '../helpers/nativeNodeFixtures'
import type {
  ComponentLayerItem,
  LayerItem,
  NativeLayerItem,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'
import type { SceneNode } from '@/shared/projectTypes'

afterEach(cleanup)

function nativeItem(node: SceneNode): NativeLayerItem {
  if (node.type === 'external-component') throw new Error('expected native node')
  const data = Object.fromEntries(Object.entries(node).filter(([key]) => ![
    'id', 'name', 'type', 'x', 'y', 'width', 'height', 'rotation', 'opacity',
    'visible', 'locked', 'playbackInitialVisibility',
  ].includes(key)))
  return {
    layerItemId: node.id,
    label: node.name,
    kind: 'native',
    frame: { mode: 'absolute', x: node.x, y: node.y, width: node.width, height: node.height },
    order: 0,
    visible: node.visible,
    locked: node.locked,
    rotation: node.rotation,
    opacity: node.opacity,
    hitPolicy: 'auto',
    playbackInitialVisibility: node.playbackInitialVisibility,
    content: { nativeType: node.type, data } as NativeLayerItem['content'],
  }
}

function mutableChange<T extends LayerItem>(item: T) {
  const current = structuredClone(item)
  const onChange = vi.fn((update: (draft: LayerItem) => void) => update(current))
  return { current, onChange }
}

function runtimeItem(): RuntimeLayerItem {
  return {
    layerItemId: 'runtime-authoring',
    label: '参数探究',
    kind: 'runtime',
    frame: { mode: 'absolute', x: 0, y: 0, width: 500, height: 300 },
    order: 10,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    runtime: {
      protocol: 'surface-v1',
      runtimeApiVersion: 3,
      enabled: true,
      renderMode: 'dom',
      source: 'export function mount() {}',
      content: {
        values: { title: '原标题', 'prompt/with~mark': '原提示' },
        metadata: { title: { label: '互动标题' } },
      },
      assets: { background: { assetId: 'asset-old' } },
    },
  }
}

function componentItem(): ComponentLayerItem {
  return {
    layerItemId: 'component-authoring',
    label: '证据组件',
    kind: 'component',
    frame: { mode: 'absolute', x: 0, y: 0, width: 500, height: 300 },
    order: 20,
    visible: true,
    locked: false,
    rotation: 0,
    opacity: 1,
    hitPolicy: 'auto',
    playbackInitialVisibility: 'inherit',
    component: { packageId: 'evidence-card', version: '1.0.0' },
    props: { content: { title: '旧证据', enabled: false, scores: [1, 2] }, 'weird/key~part': '稳定路径' },
  }
}

describe('CourseAuthoringControls', () => {
  it('provides a teacher-facing editor for every native layer type', () => {
    const cases: Array<{ item: NativeLayerItem; label: string; control: string }> = [
      { item: nativeItem(textNode({ id: 'text', text: '课堂文字' })), label: '文字内容与样式', control: '文字内容' },
      { item: nativeItem(formulaNode({ id: 'formula' })), label: '公式内容与样式', control: '公式内容（线性输入）' },
      { item: nativeItem(imageNode({ id: 'image', assetId: 'image-asset' })), label: '图片内容与样式', control: '图片适应方式' },
      { item: nativeItem(videoNode({ id: 'video', assetId: 'video-asset' })), label: '视频内容与播放', control: '视频适应方式' },
      { item: nativeItem(shapeNode('rectangle', { id: 'shape' })), label: '形状样式', control: '填充颜色' },
      { item: nativeItem(teacherControllerNode({ id: 'controller' })), label: '教师控制器设置', control: '控制器标题' },
    ]

    for (const { item, label, control } of cases) {
      const { unmount } = render(
        <NativeLayerContentEditor item={item} onChange={() => undefined} />,
      )
      expect(screen.getByLabelText(label)).toBeInTheDocument()
      expect(screen.getByLabelText(control)).toBeInTheDocument()
      unmount()
    }
  })

  it('commits scalar strings, finite numbers and booleans without exposing protocol fields', () => {
    const onText = vi.fn()
    const onNumber = vi.fn()
    const onBoolean = vi.fn()
    const { rerender } = render(
      <AuthoringValueEditor
        entry={{ field: 'content.data.text', label: '讲解文字', valueKind: 'string', currentValue: '原文' }}
        onCommit={onText}
      />,
    )
    const text = screen.getByLabelText('讲解文字')
    fireEvent.change(text, { target: { value: '新文' } })
    fireEvent.blur(text)
    expect(onText).toHaveBeenCalledWith('新文')
    expect(screen.queryByText('content.data.text')).not.toBeInTheDocument()

    rerender(
      <AuthoringValueEditor
        entry={{ field: 'size', label: '字号', valueKind: 'number', currentValue: 42 }}
        onCommit={onNumber}
      />,
    )
    const number = screen.getByLabelText('字号')
    fireEvent.change(number, { target: { value: '56' } })
    fireEvent.blur(number)
    expect(onNumber).toHaveBeenCalledWith(56)

    rerender(
      <AuthoringValueEditor
        entry={{ field: 'visible', label: '显示', valueKind: 'boolean', currentValue: false }}
        onCommit={onBoolean}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: '显示' }))
    expect(onBoolean).toHaveBeenCalledWith(true)
  })

  it('edits formulas with teacher-facing linear syntax and never exposes JSON', () => {
    const onCommit = vi.fn()
    render(
      <AuthoringValueEditor
        entry={{
          field: 'content.data.ast',
          label: '公式内容（线性输入）',
          valueKind: 'formula',
          currentValue: { type: 'token', value: 'x' },
        }}
        onCommit={onCommit}
      />,
    )
    const editor = screen.getByLabelText('公式内容（线性输入）')
    expect(editor).toHaveValue('x')
    expect(screen.queryByText(/"type"/u)).not.toBeInTheDocument()
    fireEvent.change(editor, { target: { value: '\\frac{1}' } })
    fireEvent.click(screen.getByRole('button', { name: '应用公式' }))
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('公式无法应用')

    fireEvent.change(editor, { target: { value: 'y^2' } })
    fireEvent.click(screen.getByRole('button', { name: '应用公式' }))
    expect(onCommit).toHaveBeenCalledWith({
      type: 'script',
      base: { type: 'token', value: 'y' },
      superscript: { type: 'token', value: '2' },
    })
  })

  it('updates native content and delegates image and video replacement by exact field', () => {
    const text = nativeItem(textNode({ id: 'text-update', text: '原文' }))
    const textState = mutableChange(text)
    const { unmount } = render(<NativeLayerContentEditor item={text} onChange={textState.onChange} />)
    fireEvent.change(screen.getByLabelText('字号'), { target: { value: '54' } })
    fireEvent.blur(screen.getByLabelText('字号'))
    fireEvent.click(screen.getByRole('checkbox', { name: '加粗' }))
    fireEvent.change(screen.getByLabelText('字体'), { target: { value: 'SimSun, serif' } })
    fireEvent.change(screen.getByLabelText('文字颜色拾色器'), { target: { value: '#2563eb' } })
    expect(textState.current.content.nativeType).toBe('text')
    if (textState.current.content.nativeType !== 'text') throw new Error('wrong native type')
    expect(textState.current.content.data.style).toMatchObject({
      fontSize: 54,
      bold: true,
      fontFamily: 'SimSun, serif',
      color: '#2563EB',
    })
    unmount()

    const replace = vi.fn()
    const image = nativeItem(imageNode({ id: 'image-update', assetId: 'old-image' }))
    const renderedImage = render(<NativeLayerContentEditor item={image} onChange={() => undefined} onReplaceAsset={replace} />)
    fireEvent.click(screen.getByRole('button', { name: '替换素材' }))
    expect(replace).toHaveBeenCalledWith('content.data.assetId')
    renderedImage.unmount()

    const video = nativeItem(videoNode({ id: 'video-update', assetId: 'old-video', poster: { mode: 'video-frame', time: 0 } }))
    render(<NativeLayerContentEditor item={video} onChange={() => undefined} onReplaceAsset={replace} />)
    fireEvent.click(screen.getByRole('button', { name: '替换素材' }))
    expect(replace).toHaveBeenLastCalledWith('content.data.assetId')
  })

  it('directly edits the selected Runtime value and asset without a second schema', () => {
    const runtime = runtimeItem()
    const runtimeState = mutableChange(runtime)
    const replace = vi.fn()
    const { rerender } = render(
      <DynamicLayerContentEditor
        item={runtime}
        selectedField="runtime/content/values/title"
        onChange={runtimeState.onChange}
        onReplaceAsset={replace}
      />,
    )
    const title = screen.getByLabelText('互动标题')
    fireEvent.change(title, { target: { value: '新的互动标题' } })
    fireEvent.blur(title)
    expect(runtimeState.current.runtime.content.values.title).toBe('新的互动标题')

    rerender(
      <DynamicLayerContentEditor
        item={runtime}
        selectedField="runtime/assets/background/assetId"
        selectedLabel="背景图"
        onChange={runtimeState.onChange}
        onReplaceAsset={replace}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '替换素材' }))
    expect(replace).toHaveBeenCalledWith('runtime/assets/background/assetId')
  })

  it('edits nested Component props including escaped keys, numbers, booleans and arrays', () => {
    const component = componentItem()
    const state = mutableChange(component)
    const { rerender } = render(
      <DynamicLayerContentEditor
        item={component}
        selectedField="props/content/enabled"
        selectedLabel="启用比较"
        onChange={state.onChange}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: '启用比较' }))
    expect((state.current.props.content as Record<string, unknown>).enabled).toBe(true)

    rerender(
      <DynamicLayerContentEditor
        item={component}
        selectedField="props/content/scores/1"
        selectedLabel="第二项得分"
        onChange={state.onChange}
      />,
    )
    const score = screen.getByLabelText('第二项得分')
    fireEvent.change(score, { target: { value: '8' } })
    fireEvent.blur(score)
    expect((state.current.props.content as Record<string, unknown>).scores).toEqual([1, 8])

    rerender(
      <DynamicLayerContentEditor
        item={component}
        selectedField="props/weird~1key~0part"
        selectedLabel="特殊字段"
        onChange={state.onChange}
      />,
    )
    const escaped = screen.getByLabelText('特殊字段')
    fireEvent.change(escaped, { target: { value: '已更新' } })
    fireEvent.blur(escaped)
    expect(state.current.props['weird/key~part']).toBe('已更新')
  })
})
