// @vitest-environment jsdom

// SHELL lane（B1-B3-SHELL-UI）B3 最小断言：
// 左右栏折叠只改变当前 React session 的 UI 状态，不触碰 Course Project、
// history、dirty、selection 或 Spatial session camera。
// 使用 spatial-only V9 会话，走真实 SpatialWorkspace 路由（不挂 Phaser）。

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CourseProjectDocument } from '@/shared/courseProjectTypes'
import { createCourseProject } from '@/renderer/course/courseStudioModel'
import { useEditorStore } from '@/renderer/store/editorStore'

vi.mock('@/renderer/phaser/createEditorGame', () => ({
  createEditorGame: vi.fn(),
}))

vi.mock('@/renderer/export/loadPlayerBundle', () => ({
  loadPlayerBundle: () => '',
}))

// App imports renderProjectSceneImagesWithRuntime, whose module graph reaches
// PlayerApp -> phaser; phaser fails at module init inside jsdom, so the player
// app shell is stubbed (the collapse tests never invoke it).
vi.mock('@/player/PlayerApp', () => ({
  PlayerApp: class {},
}))

import App from '@/renderer/App'

function loadSpatialOnlyCourse(): void {
  const base = createCourseProject({ title: '折叠测试' })
  const surfaceId = 'surface-spatial-collapse'
  const frameId = 'camera-collapse'
  const locationId = 'location-spatial-collapse'
  const project: CourseProjectDocument = {
    ...base,
    startLocationId: locationId,
    locations: [{
      id: locationId,
      label: '空间镜头 1',
      kind: 'spatial-camera',
      surfaceId,
      cameraFrameId: frameId,
    }],
    surfaces: [{
      id: surfaceId,
      type: 'spatial-2d',
      title: '空间画布',
      surfaceLayerItems: [],
      world: {
        bounds: { mode: 'finite', x: 0, y: 0, width: 1280, height: 720 },
        layerItems: [],
      },
      camera: {
        home: { x: 0, y: 0, zoom: 1 },
        frames: [{ id: frameId, name: '镜头 1', x: 0, y: 0, zoom: 1 }],
      },
      semanticZoom: [],
    }],
  }
  useEditorStore.getState().loadCourseProject(
    { project, assetFiles: {}, componentFiles: {} },
    null,
  )
}

afterEach(() => {
  cleanup()
})

describe('editor shell collapse (B3)', () => {
  beforeEach(() => {
    loadSpatialOnlyCourse()
  })

  it('renders two independent focusable toggle buttons with aria-expanded matching the real state', () => {
    render(<App />)

    const leftToggle = screen.getByRole('button', { name: '收起左侧面板' })
    const rightToggle = screen.getByRole('button', { name: '收起右侧面板' })
    expect(leftToggle).toHaveAttribute('aria-expanded', 'true')
    expect(rightToggle).toHaveAttribute('aria-expanded', 'true')
    expect(leftToggle).toBeEnabled()
    expect(rightToggle).toBeEnabled()

    fireEvent.click(leftToggle)
    expect(screen.getByRole('button', { name: '展开左侧面板' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByRole('button', { name: '收起右侧面板' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    // Both buttons stay operable after collapsing either panel.
    fireEvent.click(screen.getByRole('button', { name: '展开左侧面板' }))
    expect(screen.getByRole('button', { name: '收起左侧面板' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('collapses and re-expands the left panel: hidden/inert while collapsed, class toggles', () => {
    render(<App />)
    const main = document.querySelector('.app-main')
    expect(main).not.toBeNull()
    const leftShell = main!.querySelector('.scene-panel-shell')
    expect(leftShell).not.toBeNull()
    expect(main).not.toHaveClass('app-main--left-collapsed')
    expect(leftShell).not.toHaveAttribute('hidden')
    expect(leftShell).not.toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: '收起左侧面板' }))
    expect(main).toHaveClass('app-main--left-collapsed')
    expect(leftShell).toHaveAttribute('hidden')
    expect(leftShell).toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: '展开左侧面板' }))
    expect(main).not.toHaveClass('app-main--left-collapsed')
    expect(leftShell).not.toHaveAttribute('hidden')
    expect(leftShell).not.toHaveAttribute('inert')
  })

  it('collapses the right panel independently with its own class and aria state', () => {
    render(<App />)
    const main = document.querySelector('.app-main')
    const rightShell = main!.querySelector('.right-sidebar-shell')
    expect(rightShell).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '收起右侧面板' }))
    expect(main).toHaveClass('app-main--right-collapsed')
    expect(main).not.toHaveClass('app-main--left-collapsed')
    expect(rightShell).toHaveAttribute('hidden')
    expect(rightShell).toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: '收起左侧面板' }))
    expect(main).toHaveClass('app-main--left-collapsed', 'app-main--right-collapsed')
    expect(main!.querySelector('.scene-panel-shell')).toHaveAttribute('hidden')
    expect(rightShell).toHaveAttribute('hidden')
  })

  it('keeps revision, history, dirty, location, selection and the Spatial camera untouched by toggles', () => {
    render(<App />)
    const before = useEditorStore.getState().courseSession
    if (before === null) throw new Error('expected a loaded V9 course session')
    const homeLabelBefore = screen.getByText(/首页镜头：/).textContent
    const legacyDirtyBefore = useEditorStore.getState().dirty

    fireEvent.click(screen.getByRole('button', { name: '收起左侧面板' }))
    fireEvent.click(screen.getByRole('button', { name: '收起右侧面板' }))
    fireEvent.click(screen.getByRole('button', { name: '展开左侧面板' }))
    fireEvent.click(screen.getByRole('button', { name: '展开右侧面板' }))

    const after = useEditorStore.getState().courseSession
    expect(after).toBe(before)
    expect(after!.history.present).toBe(before.history.present)
    expect(after!.history.present.revision).toBe(before.history.present.revision)
    expect(after!.history.past.length).toBe(before.history.past.length)
    expect(after!.history.future.length).toBe(before.history.future.length)
    expect(after!.savedSnapshot).toBe(before.savedSnapshot)
    expect(useEditorStore.getState().dirty).toBe(legacyDirtyBefore)
    expect(after!.selection.locationId).toBe(before.selection.locationId)
    expect(after!.selection.spatialLayerItemIds).toEqual(before.selection.spatialLayerItemIds)
    expect(screen.getByText(/首页镜头：/).textContent).toBe(homeLabelBefore)
  })
})
