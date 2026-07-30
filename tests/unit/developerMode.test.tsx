import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ComponentPackageData } from '../../src/shared/componentTypes'
import { RightSidebar } from '../../src/renderer/ui/RightSidebar'
import { DeveloperTab } from '../../src/renderer/ui/DeveloperTab'
import {
  editableComponentPackageId,
  selectActiveScene,
  useEditorStore,
} from '../../src/renderer/store/editorStore'

function editableSource(id: string, marker = ''): string {
  return `window.CoursewareComponent.define({id:${JSON.stringify(id)},runtimeApiVersion:2,create(){${marker};return{destroy(){}}}})`
}

function componentPackage(
  id = 'com.example.developer',
): ComponentPackageData {
  const manifest = {
    schemaVersion: 2 as const,
    runtimeApiVersion: 2 as const,
    id,
    name: '开发测试组件',
    version: '2.0.0',
    entry: 'runtime.js',
    defaultSize: { width: 320, height: 180 },
    minSize: { width: 16, height: 16 },
    preserveAspectRatio: false,
    assets: {},
    defaultProps: { content: { title: '标题' } },
    editor: {
      properties: [
        { key: 'content.title', label: '标题', type: 'text' as const },
      ],
    },
  }
  const runtimeSource = editableSource(manifest.id)
  return {
    manifest,
    runtimeSource,
    files: {
      'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
      'runtime.js': new TextEncoder().encode(runtimeSource),
    },
  }
}

function componentPackageV4(): ComponentPackageData {
  const source = componentPackage('com.example.developer-v4')
  const manifest = {
    ...source.manifest,
    schemaVersion: 4 as const,
    runtimeApiVersion: 4 as const,
    supportedScopes: ['scene', 'global'] as Array<'scene' | 'global'>,
    renderMode: 'dom' as const,
  }
  const runtimeSource = editableSource(manifest.id).replace(
    'runtimeApiVersion:2',
    'runtimeApiVersion:4',
  )
  return {
    ...source,
    manifest,
    runtimeSource,
    files: {
      'manifest.json': new TextEncoder().encode(JSON.stringify(manifest)),
      'runtime.js': new TextEncoder().encode(runtimeSource),
    },
  }
}

afterEach(() => {
  cleanup()
  useEditorStore.getState().createNewProject()
})

describe('专业开发模式', () => {
  it('生成的可编辑副本 ID 会消除随机后缀中的分隔符边界', () => {
    expect(editableComponentPackageId('com.example.widget', '-A_b-')).toBe(
      'com.example.widget.editable.xaxbx',
    )
  })

  it('专业模式显示开发工作流，切回简洁模式时安全返回属性', () => {
    useEditorStore.getState().createNewProject()
    useEditorStore.setState({
      editorMode: 'professional',
      activeTab: 'properties',
    })
    render(
      <RightSidebar
        onAddImage={() => undefined}
        onReplaceImage={() => undefined}
        onAddVideo={() => undefined}
        onImportAudio={() => undefined}
        onImportVideo={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: '开发' }))
    expect(screen.getByTestId('developer-tab')).toBeInTheDocument()
    expect(screen.getByText('工程开发工作台')).toBeInTheDocument()
    expect(screen.getByLabelText('编辑面板')).toHaveClass(
      'right-sidebar--developer',
    )
    expect(screen.getByRole('tab', { name: /运行时/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: /对象 JSON/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /规则 JSON/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /组件代码/ })).toBeInTheDocument()
    useEditorStore.getState().setEditorMode('simple')
    expect(useEditorStore.getState().activeTab).toBe('properties')
  })

  it('场景运行时源码更新进入正常撤销历史', () => {
    useEditorStore.getState().createNewProject()
    const scene = selectActiveScene(useEditorStore.getState())
    const initialSource =
      'CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})'
    const nextSource =
      'CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){ctx.emit("ready");return{destroy(){}}}})'
    useEditorStore.getState().setSceneRuntime(scene.id, {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'phaser',
      source: initialSource,
      content: { values: {} },
      assets: {},
    })
    useEditorStore.getState().updateSceneRuntime(scene.id, { source: nextSource })
    expect(selectActiveScene(useEditorStore.getState()).runtime?.source).toBe(nextSource)

    useEditorStore.getState().undo()
    expect(selectActiveScene(useEditorStore.getState()).runtime?.source).toBe(initialSource)
  })

  it('代码编辑器拒绝模块语法，只提交通过校验的运行时源码', () => {
    useEditorStore.getState().createNewProject()
    const scene = selectActiveScene(useEditorStore.getState())
    const initialSource =
      'CoursewareRuntime.define({runtimeApiVersion:2,create(){return{destroy(){}}}})'
    const validSource =
      'CoursewareRuntime.define({runtimeApiVersion:2,create(ctx){ctx.emit("ok");return{destroy(){}}}})'
    useEditorStore.getState().setSceneRuntime(scene.id, {
      runtimeApiVersion: 2,
      enabled: true,
      renderMode: 'phaser',
      source: initialSource,
      content: { values: {} },
      assets: {},
    })
    render(<DeveloperTab />)
    const editor = screen.getByLabelText('场景运行时源码')
    expect(editor).toHaveAttribute('wrap', 'off')
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    fireEvent.change(editor, { target: { value: 'import value from "pkg"' } })
    fireEvent.click(screen.getByRole('button', { name: '校验并应用' }))
    expect(screen.getByRole('status')).toHaveTextContent('未应用')
    expect(selectActiveScene(useEditorStore.getState()).runtime?.source)
      .toBe(initialSource)

    fireEvent.change(editor, { target: { value: validSource } })
    fireEvent.click(screen.getByRole('button', { name: '校验并应用' }))
    expect(selectActiveScene(useEditorStore.getState()).runtime?.source)
      .toBe(validSource)
  })

  it('开发工作区一次只呈现一类任务，并给未就绪任务明确空状态', () => {
    useEditorStore.getState().createNewProject()
    render(<DeveloperTab />)

    expect(screen.getByText('当前作用域没有自定义运行时')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /对象 JSON/ }))
    expect(screen.getByText('未选择对象')).toBeInTheDocument()
    expect(screen.queryByText('当前作用域没有自定义运行时'))
      .not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /规则 JSON/ }))
    expect(screen.getByText('当前作用域没有规则')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '当前规则' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /组件代码/ }))
    expect(screen.getByText('未选择互动组件')).toBeInTheDocument()
  })

  it('创建组件可编辑副本会生成新身份、切换当前实例且一次撤销恢复', () => {
    useEditorStore.getState().createNewProject()
    const source = componentPackage()
    useEditorStore.getState().importComponentPackage(source)
    useEditorStore.getState().addExternalComponentNode(source.manifest.id)
    const originalNode = selectActiveScene(useEditorStore.getState()).nodes[0]
    expect(originalNode?.type).toBe('external-component')
    const copyId = useEditorStore.getState().createEditableComponentCopy(
      source.manifest.id,
      originalNode!.id,
    )
    expect(copyId).toMatch(/^com\.example\.developer\.editable\./)
    const copiedPackage = useEditorStore.getState().componentPackages[copyId!]
    expect(copiedPackage?.manifest.id).toBe(copyId)
    expect(copiedPackage?.runtimeSource).toContain(copyId)
    expect(useEditorStore.getState().project.componentPackages[copyId!])
      .toMatchObject({
        editableCopy: true,
        sourcePackageId: source.manifest.id,
      })
    expect(useEditorStore.getState().componentPackages[source.manifest.id]).toBe(source)
    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      type: 'external-component',
      component: { packageId: copyId },
    })

    const updatedSource = editableSource(copyId!, 'const changed = true')
    useEditorStore.getState().updateEditableComponentPackage(copyId!, {
      runtimeSource: updatedSource,
    })
    expect(useEditorStore.getState().componentPackages[copyId!]?.runtimeSource)
      .toBe(updatedSource)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().componentPackages[copyId!]?.runtimeSource)
      .not.toBe(updatedSource)
    useEditorStore.getState().undo()
    expect(useEditorStore.getState().componentPackages[copyId!]).toBeUndefined()
    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      type: 'external-component',
      component: { packageId: source.manifest.id },
    })
  })

  it('拒绝直接改写第三方组件代码', () => {
    useEditorStore.getState().createNewProject()
    const source = componentPackage()
    useEditorStore.getState().importComponentPackage(source)
    expect(() => useEditorStore.getState().updateEditableComponentPackage(
      source.manifest.id,
      { runtimeSource: editableSource(source.manifest.id, 'const changed = true') },
    )).toThrow('第三方组件包默认只读')
  })

  it('不会把名称中碰巧含 editable 的第三方组件视为可编辑副本', () => {
    useEditorStore.getState().createNewProject()
    const source = componentPackage('vendor.editable.widget')
    useEditorStore.getState().importComponentPackage(source)
    expect(() => useEditorStore.getState().updateEditableComponentPackage(
      source.manifest.id,
      { runtimeSource: editableSource(source.manifest.id, 'const changed = true') },
    )).toThrow('第三方组件包默认只读')
  })

  it('命名状态下阻止创建组件副本且不产生孤儿包', () => {
    useEditorStore.getState().createNewProject()
    const source = componentPackage()
    useEditorStore.getState().importComponentPackage(source)
    useEditorStore.getState().addExternalComponentNode(source.manifest.id)
    const node = selectActiveScene(useEditorStore.getState()).nodes[0]!
    useEditorStore.getState().addPresentationState('反馈')
    const beforeIds = Object.keys(useEditorStore.getState().componentPackages)

    expect(useEditorStore.getState().createEditableComponentCopy(
      source.manifest.id,
      node.id,
    )).toBeNull()
    expect(Object.keys(useEditorStore.getState().componentPackages)).toEqual(beforeIds)
    expect(selectActiveScene(useEditorStore.getState()).nodes[0]).toMatchObject({
      type: 'external-component',
      component: { packageId: source.manifest.id },
    })
    expect(useEditorStore.getState().errorMessage).toContain('切换到“基础”')
  })

  it('可编辑组件提交前复用完整包校验并保护现有实例作用域', () => {
    useEditorStore.getState().createNewProject()
    const source = componentPackageV4()
    useEditorStore.getState().importComponentPackage(source)
    useEditorStore.getState().addExternalComponentNode(source.manifest.id)
    const node = selectActiveScene(useEditorStore.getState()).nodes[0]!
    const copyId = useEditorStore.getState().createEditableComponentCopy(
      source.manifest.id,
      node.id,
    )!
    const copied = useEditorStore.getState().componentPackages[copyId]!

    expect(() => useEditorStore.getState().updateEditableComponentPackage(
      copyId,
      {
        manifest: {
          ...copied.manifest,
          supportedScopes: ['global'],
        } as typeof copied.manifest,
      },
    )).toThrow('仍有场景实例')

    expect(() => useEditorStore.getState().updateEditableComponentPackage(
      copyId,
      {
        manifest: {
          ...copied.manifest,
          thumbnail: 'missing.png',
        } as typeof copied.manifest,
      },
    )).toThrow('缺少缩略图')
  })
})
