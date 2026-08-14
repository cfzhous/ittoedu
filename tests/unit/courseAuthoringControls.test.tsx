import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthoringValueEditor,
  DynamicLayerContentEditor,
  NativeLayerContentEditor,
} from '@/renderer/course/CourseAuthoringControls'
import {
  createFormulaNode,
  createImageNode,
  createProject,
  createShapeNode,
  createTeacherControllerNode,
  createTextNode,
  createVideoNode,
} from '@/renderer/project/createProject'
import { migrateProjectV8ToCourseProjectV9 } from '@/shared/courseProjectModel'
import type {
  ComponentLayerItem,
  LayerItem,
  NativeLayerItem,
  RuntimeLayerItem,
} from '@/shared/courseProjectTypes'
import type { SceneNode } from '@/shared/projectTypes'

afterEach(cleanup)

function nativeItem(node: SceneNode): NativeLayerItem {
  const project = createProject({ includeDefaultController: false, controls: 'none' })
  if (node.type === 'image' || node.type === 'video') {
    project.assets[node.assetId] = {
      id: node.assetId,
      filename: node.type === 'image' ? `${node.assetId}.png` : `${node.assetId}.mp4`,
      mimeType: node.type === 'image' ? 'image/png' : 'video/mp4',
      kind: node.type,
      path: `assets/${node.assetId}.${node.type === 'image' ? 'png' : 'mp4'}`,
      byteLength: 10,
      ...(node.type === 'image' ? { width: 10, height: 10 } : { duration: 3 }),
    }
  }
  project.scenes[0]!.nodes = [node]
  const migrated = migrateProjectV8ToCourseProjectV9(project)
  const surface = migrated.surfaces[0]
  if (!surface || surface.type !== 'slide') throw new Error('missing slide')
  const item = surface.scenes[0]?.layerItems[0]
  if (!item || item.kind !== 'native') throw new Error('missing native layer')
  return item
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
      { item: nativeItem(createTextNode({ id: 'text', text: '课堂文字' })), label: '文字内容与样式', control: '文字内容' },
      { item: nativeItem(createFormulaNode({ id: 'formula' })), label: '公式内容与样式', control: '公式的文字说明' },
      { item: nativeItem(createImageNode({ id: 'image', assetId: 'image-asset' })), label: '图片内容与样式', control: '图片适应方式' },
      { item: nativeItem(createVideoNode({ id: 'video', assetId: 'video-asset' })), label: '视频内容与播放', control: '视频适应方式' },
      { item: nativeItem(createShapeNode('rectangle', { id: 'shape' })), label: '形状样式', control: '填充颜色' },
      { item: nativeItem(createTeacherControllerNode({ id: 'controller' })), label: '教师控制器设置', control: '控制器标题' },
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

  it('strictly validates formula JSON and never submits invalid structure', () => {
    const onCommit = vi.fn()
    render(
      <AuthoringValueEditor
        entry={{
          field: 'content.data.ast',
          label: '公式结构',
          valueKind: 'formula',
          currentValue: { type: 'token', value: 'x' },
        }}
        onCommit={onCommit}
      />,
    )
    const editor = screen.getByLabelText('公式结构')
    fireEvent.change(editor, { target: { value: '{"type":"fraction","numerator":{"type":"token","value":"1"}}' } })
    fireEvent.click(screen.getByRole('button', { name: '应用公式结构' }))
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('公式结构不完整')

    fireEvent.change(editor, { target: { value: '{"type":"token","value":"y"}' } })
    fireEvent.click(screen.getByRole('button', { name: '应用公式结构' }))
    expect(onCommit).toHaveBeenCalledWith({ type: 'token', value: 'y' })
  })

  it('updates native content and delegates image and video replacement by exact field', () => {
    const text = nativeItem(createTextNode({ id: 'text-update', text: '原文' }))
    const textState = mutableChange(text)
    const { unmount } = render(<NativeLayerContentEditor item={text} onChange={textState.onChange} />)
    fireEvent.change(screen.getByLabelText('字号'), { target: { value: '54' } })
    fireEvent.blur(screen.getByLabelText('字号'))
    fireEvent.click(screen.getByRole('checkbox', { name: '加粗' }))
    expect(textState.current.content.nativeType).toBe('text')
    if (textState.current.content.nativeType !== 'text') throw new Error('wrong native type')
    expect(textState.current.content.data.style).toMatchObject({ fontSize: 54, bold: true })
    unmount()

    const replace = vi.fn()
    const image = nativeItem(createImageNode({ id: 'image-update', assetId: 'old-image' }))
    const renderedImage = render(<NativeLayerContentEditor item={image} onChange={() => undefined} onReplaceAsset={replace} />)
    fireEvent.click(screen.getByRole('button', { name: '替换素材' }))
    expect(replace).toHaveBeenCalledWith('content.data.assetId')
    renderedImage.unmount()

    const video = nativeItem(createVideoNode({ id: 'video-update', assetId: 'old-video', poster: { mode: 'video-frame', time: 0 } }))
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
