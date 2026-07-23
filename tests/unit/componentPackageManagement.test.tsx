import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ComponentPackageData,
  ComponentScope,
} from '../../src/shared/componentTypes'
import { ElementsTab } from '../../src/renderer/ui/ElementsTab'
import {
  selectActiveScene,
  useEditorStore,
} from '../../src/renderer/store/editorStore'

const PACKAGE_ID = 'com.example.managed'

function componentPackage(
  version: string,
  supportedScopes: ComponentScope[] = ['scene', 'global'],
  packageId = PACKAGE_ID,
): ComponentPackageData {
  return {
    manifest: {
      schemaVersion: 3,
      runtimeApiVersion: 3,
      id: packageId,
      name: packageId === PACKAGE_ID ? '可管理组件' : '备用组件',
      version,
      entry: 'runtime.js',
      defaultSize: { width: 360, height: 220 },
      minSize: { width: 120, height: 80 },
      preserveAspectRatio: true,
      assets: {},
      defaultProps: { label: `默认 ${version}` },
      supportedScopes,
    },
    runtimeSource: `window.CoursewareComponent.define({ version: '${version}' })`,
    files: {
      'runtime.js': new Uint8Array([version.charCodeAt(0)]),
    },
  }
}

beforeEach(() => {
  useEditorStore.getState().createNewProject()
})

afterEach(() => cleanup())

describe('editorStore component package management', () => {
  it('deletes only unused packages and keeps delete undoable with runtime data', () => {
    const store = useEditorStore.getState()
    const imported = componentPackage('1.0.0')
    store.importComponentPackage(imported)

    expect(store.deleteComponentPackage(PACKAGE_ID)).toBe(true)
    let state = useEditorStore.getState()
    expect(state.project.componentPackages[PACKAGE_ID]).toBeUndefined()
    expect(state.componentPackages[PACKAGE_ID]).toBeUndefined()
    expect(state.history.past).toHaveLength(1)

    state.undo()
    state = useEditorStore.getState()
    expect(state.project.componentPackages[PACKAGE_ID]?.version).toBe('1.0.0')
    expect(state.componentPackages[PACKAGE_ID]).toBe(imported)

    state.redo()
    state = useEditorStore.getState()
    expect(state.project.componentPackages[PACKAGE_ID]).toBeUndefined()
    expect(state.componentPackages[PACKAGE_ID]).toBeUndefined()
  })

  it('blocks deletion while any scene or global instance still references the package', () => {
    const store = useEditorStore.getState()
    store.importComponentPackage(componentPackage('1.0.0'))
    store.addExternalComponentNode(PACKAGE_ID)
    store.setEditingScope('global')
    useEditorStore.getState().addExternalComponentNode(PACKAGE_ID)
    const before = structuredClone(useEditorStore.getState().project)
    const historyBefore = useEditorStore.getState().history.past.length

    expect(useEditorStore.getState().deleteComponentPackage(PACKAGE_ID)).toBe(false)
    const state = useEditorStore.getState()
    expect(state.project).toEqual(before)
    expect(state.componentPackages[PACKAGE_ID]).toBeDefined()
    expect(state.history.past).toHaveLength(historyBefore)
    expect(state.errorMessage).toContain('1 个场景实例和 1 个全局实例')
  })

  it('replaces every scene/global instance in one undo step and preserves props', () => {
    const store = useEditorStore.getState()
    const first = componentPackage('1.0.0')
    const second = componentPackage('2.0.0')
    store.importComponentPackage(first)
    store.addExternalComponentNode(PACKAGE_ID)
    const sceneNodeId = selectActiveScene(useEditorStore.getState()).nodes
      .find((node) => node.type === 'external-component')!.id
    useEditorStore.getState().updateNode(sceneNodeId, {
      props: { label: '场景自定义', score: 7 },
    })
    useEditorStore.getState().setEditingScope('global')
    useEditorStore.getState().addExternalComponentNode(PACKAGE_ID)
    const globalNodeId = useEditorStore.getState().project.globalLayer
      .find(({ node }) => node.type === 'external-component')!.node.id
    useEditorStore.getState().updateNode(globalNodeId, {
      props: { label: '全局自定义', theme: 'dark' },
    })
    const historyBefore = useEditorStore.getState().history.past.length

    useEditorStore.getState().replaceComponentPackage(PACKAGE_ID, second)
    let state = useEditorStore.getState()
    expect(state.history.past).toHaveLength(historyBefore + 1)
    expect(state.project.componentPackages[PACKAGE_ID]?.version).toBe('2.0.0')
    expect(state.componentPackages[PACKAGE_ID]).toBe(second)
    expect(selectActiveScene(state).nodes.find((node) => node.id === sceneNodeId))
      .toMatchObject({
        component: { packageId: PACKAGE_ID, version: '2.0.0' },
        props: { label: '场景自定义', score: 7 },
      })
    expect(state.project.globalLayer.find(({ node }) => node.id === globalNodeId)?.node)
      .toMatchObject({
        component: { packageId: PACKAGE_ID, version: '2.0.0' },
        props: { label: '全局自定义', theme: 'dark' },
      })

    state.undo()
    state = useEditorStore.getState()
    expect(state.project.componentPackages[PACKAGE_ID]?.version).toBe('1.0.0')
    expect(state.componentPackages[PACKAGE_ID]).toBe(first)
    expect(selectActiveScene(state).nodes.find((node) => node.id === sceneNodeId))
      .toMatchObject({
        component: { version: '1.0.0' },
        props: { label: '场景自定义', score: 7 },
      })

    state.redo()
    state = useEditorStore.getState()
    expect(state.project.componentPackages[PACKAGE_ID]?.version).toBe('2.0.0')
    expect(state.componentPackages[PACKAGE_ID]).toBe(second)
  })

  it('rejects a different ID or incompatible scope without changing the project', () => {
    const store = useEditorStore.getState()
    const first = componentPackage('1.0.0')
    store.importComponentPackage(first)
    store.setEditingScope('global')
    useEditorStore.getState().addExternalComponentNode(PACKAGE_ID)
    const before = structuredClone(useEditorStore.getState().project)
    const historyBefore = useEditorStore.getState().history.past.length

    expect(() => useEditorStore.getState().replaceComponentPackage(
      PACKAGE_ID,
      componentPackage('2.0.0', ['scene'], 'com.example.other'),
    )).toThrow('ID 为')
    expect(() => useEditorStore.getState().replaceComponentPackage(
      PACKAGE_ID,
      componentPackage('2.0.0', ['scene']),
    )).toThrow('全局层')

    const state = useEditorStore.getState()
    expect(state.project).toEqual(before)
    expect(state.componentPackages[PACKAGE_ID]).toBe(first)
    expect(state.history.past).toHaveLength(historyBefore)
  })
})

describe('ElementsTab component package manager', () => {
  it('shows version and usage, blocks referenced deletion, and requests replacement', () => {
    const store = useEditorStore.getState()
    store.importComponentPackage(componentPackage('1.0.0'))
    store.addExternalComponentNode(PACKAGE_ID)
    const onReplaceComponent = vi.fn()
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = () => null
    try {
      render(
        <ElementsTab
          onAddImage={vi.fn()}
          onReplaceComponent={onReplaceComponent}
        />,
      )

      const manager = screen.getByTestId(`component-package-${PACKAGE_ID}`)
      expect(manager).toHaveTextContent(`${PACKAGE_ID} · v1.0.0`)
      expect(manager).toHaveTextContent('场景实例 1')
      expect(manager).toHaveTextContent('全局实例 0')
      expect(screen.getByTestId(`delete-component-package-${PACKAGE_ID}`))
        .toBeDisabled()

      fireEvent.click(screen.getByTestId(`replace-component-package-${PACKAGE_ID}`))
      expect(onReplaceComponent).toHaveBeenCalledWith(PACKAGE_ID)
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })

  it('deletes an unreferenced package from the management list', () => {
    const imported = componentPackage('1.0.0')
    useEditorStore.getState().importComponentPackage(imported)
    const originalGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = () => null
    try {
      render(<ElementsTab onAddImage={vi.fn()} onReplaceComponent={vi.fn()} />)
      const deleteButton = screen.getByTestId(
        `delete-component-package-${PACKAGE_ID}`,
      )
      expect(deleteButton).toBeEnabled()
      fireEvent.click(deleteButton)
      expect(screen.queryByTestId(`component-package-${PACKAGE_ID}`))
        .not.toBeInTheDocument()
      expect(useEditorStore.getState().componentPackages[PACKAGE_ID]).toBeUndefined()
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext
    }
  })
})
